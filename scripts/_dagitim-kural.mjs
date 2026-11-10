// Dağıtılmamış para adaylarının bulunması ve planlanması. Veritabanına dokunmaz, yazdırmaz:
// scripts/dagitim-gecmis.mjs bu motoru kurar, çıktısını basar ve isterse yazar. Ayrı dosyada
// durmasının nedeni, kuralların veritabanı olmadan birim kontrolünden geçebilmesi.
//
// Hesap mantığı uygulamayla birebir aynıdır: lib/dagitim.ts (tek kaynak kuralı, kayitKalani, avans,
// acikHedefler, dagitimPlani), lib/siparis.ts (siparisHesap), lib/firma.ts (bakiye), lib/kayit.ts
// (cariEtkileri).
//
// ADAY SEÇİMİ (kasıtlı olarak geniş): `dagitim` taşımayan, firmaya bağlı, parası olan HER kayıt
// aday sayılır — `tur` ne olursa olsun, Toplam ne olursa olsun. Hangi kümeye girdiği kodla yazılır,
// hiçbir kayıt sessizce listeden düşmez:
//
//   [P0] Toplam boş / 0, yalnızca para hareketi    → saf tahsilat / ödeme. Dağıtılır; cari bakiye
//                                                    DEĞİŞMEZ (para zaten bakiyeye yansıyordu),
//                                                    yalnızca hangi kaleme düştüğü belli olur.
//   [AV] tur "tahsilat" / "mahsup", dağıtımı eksik → avans. Dağıtılır, bakiye değişmez.
//   [PT] Toplam = Alınan (peşin satış/alış gibi)   → cariye HİÇ yansımıyor (ekstrede borç + alacak
//                                                    satırı birbirini sıfırlıyor). Gerçek bir peşin
//                                                    satış da olabilir, tahsilat da; dönüştürülürse
//                                                    firmanın bakiyesi bu tutar kadar değişir, bu
//                                                    yüzden yalnızca pesinDe ile yazılır.
//   [PK] Toplam > Alınan                           → para kendi kalemini kapatıyor (kısmi ödenmiş
//                                                    kalem). Aday değil; yazılmaz.
//   [SP] siparisId var, dagitim yok                → eski yol: para `siparisId` üzerinden o siparişe
//                                                    zaten sayılıyor (tek kaynak kuralı). Yazılmaz.
//   [VR] kaynak "veresiye"                         → Alacaklar / Borçlar'dan kalem olarak girilmiş,
//                                                    para hareketi değil. Aday değil; yazılmaz.
//   [--] transfer / mahsup komisyonu / arşiv / parasız / firmasız → ilgisiz.
//
// NE YAZILACAĞI (`bicim`)
//   "tahsilata-cevir" (müşteri tarafı, tur yok): kayıt uygulamanın tahsilat biçimine çevrilir —
//       tur: "tahsilat", toplamTutar: 0, durum: "aktif", dagitim: [...]
//   "dagitim" (müşteri tarafı, zaten tahsilat / mahsup): yalnızca `dagitim` tamamlanır.
//   "odemeye-tasi" (tedarikçi tarafı): uygulamada giden parada dağıtım yoktur, ödeme borcun kendi
//       kaydına yazılır (lib/db.ts tahsilEt). Bu yüzden ödeme kaydının parası borç kayıtlarının
//       `odemeler` dizisine taşınır ve ödeme kaydı çöp kutusuna gönderilir. Parası açık borçlara
//       tam sığmayan ödemeler yazılmaz ("elle" diye işaretlenir), yoksa kayıt bölünürdü.
export const EPS = 0.005;
export const yuvarla = (n) => Math.round(n * 100) / 100;

const ODEME_SEKLI = { nakit: "Nakit", kart: "Kart / POS", havale: "Banka Havalesi" };
export const odemeSekliAdi = (k) => ODEME_SEKLI[k.odemeSekli] ?? k.odemeSekli ?? "?";

// `kayitlar` ve `siparisler` silinmişlerden arınmış olarak gelir. planla() bu nesneleri bellekte
// yazılmış hale getirir (tur / toplamTutar / dagitim / tasindi), böylece "sonraki aday" ve
// "firma bakiyesi sonra" hesapları yazma sonrası durumu gösterir.
export function kuralMotoru({ kayitlar, siparisler, pesinDe = false }) {
  const siparisOdemeleri = new Map();
  const kayitDagitimlari = new Map();
  const odemeEklenen = new Map(); // tedarikçi tarafı: borç kaydına taşınan ödeme
  const ekle = (map, id, tutar) => map.set(id, (map.get(id) ?? 0) + tutar);

  const dagitilan = (k) => (Array.isArray(k.dagitim) ? k.dagitim : []).reduce((t, d) => t + (d.tutar ?? 0), 0);
  const dagitilabilirTutar = (k) => (k.tur === "mahsup" ? (k.toplamTutar ?? 0) : (k.alinanTutar ?? 0));
  const avans = (k) =>
    k.tur === "tahsilat" || k.tur === "mahsup" ? Math.max(0, dagitilabilirTutar(k) - dagitilan(k)) : 0;
  const kayitKalani = (k) =>
    (k.toplamTutar ?? 0) - (k.alinanTutar ?? 0) - (kayitDagitimlari.get(k.id) ?? 0) - (odemeEklenen.get(k.id) ?? 0);

  // Tek kaynak kuralı: kayıt `dagitim` taşıyorsa katkı yalnızca ondan gelir, taşımıyorsa eski
  // `siparisId` yolundan. Aynı para iki kez sayılmaz.
  for (const k of kayitlar) {
    const isaret = k.yon === "gelen" ? 1 : -1;
    if (Array.isArray(k.dagitim)) {
      for (const d of k.dagitim) {
        if (d.hedefTur === "siparis") ekle(siparisOdemeleri, d.id, isaret * (d.tutar ?? 0));
        else if (d.hedefTur === "kayit") ekle(kayitDagitimlari, d.id, isaret * (d.tutar ?? 0));
      }
      continue;
    }
    if (k.siparisId) ekle(siparisOdemeleri, k.siparisId, isaret * (k.alinanTutar ?? 0));
  }

  const siparisHesap = (s) => {
    const odenen = (s.oncekiOdenen ?? 0) + (siparisOdemeleri.get(s.id) ?? 0);
    const acikKalan = (s.tutar ?? 0) - odenen;
    return { odenen, acikKalan, kalan: s.kapatildi ? 0 : Math.max(0, acikKalan) };
  };

  const kayitBakiyesi = (k) => {
    if (k.durum === "arsiv") return 0;
    const kalan = kayitKalani(k);
    return k.yon === "gelen" ? kalan : -kalan;
  };

  function cariEtkileri(k) {
    if (k.tur === "transfer" || k.tur === "mahsup-komisyon") return [];
    if (k.tur === "tahsilat") return [{ firmaId: k.firmaId, etki: -avans(k) }];
    if (k.tur === "mahsup") {
      const etkiler = [{ firmaId: k.firmaId, etki: -avans(k) }];
      if (k.karsiTur !== "gider" && k.karsiTur !== "personel" && k.karsiFirmaId) {
        etkiler.push({ firmaId: k.karsiFirmaId, etki: k.sayilanTutar ?? k.toplamTutar ?? 0 });
      }
      return etkiler;
    }
    return [{ firmaId: k.firmaId, etki: kayitBakiyesi(k) }];
  }

  // `tasindi`: parası borç kaydına taşınıp çöp kutusuna gidecek ödeme kaydı; bakiyeden düşülür.
  function firmaBakiyesi(firmaId) {
    let bakiye = 0;
    for (const s of siparisler) {
      if (s.firmaId !== firmaId) continue;
      bakiye += s.kapatildi ? 0 : siparisHesap(s).acikKalan;
    }
    for (const k of kayitlar) {
      if (k.tasindi) continue;
      for (const e of cariEtkileri(k)) if (e.firmaId === firmaId) bakiye += e.etki;
    }
    return bakiye;
  }

  // Bir firmanın açık kalemleri, eskiden yeniye. gelen: siparişler + açık alacak kayıtları;
  // giden: açık borç kayıtları (sipariş bir satıştır, borç tarafında yer almaz).
  //
  // "gelen" yönü lib/dagitim.ts acikHedefler ile birebir aynıdır (rastgele senaryolarla
  // karşılaştırıldı). "giden" yönünde bilinçli bir fark var: uygulamadaki işlev siparişleri yön
  // gözetmeden listeliyor, ama lib/tahsilat.ts onu yalnızca varsayılan "gelen" ile çağırdığı için o
  // dal uygulamada hiç çalışmıyor. Tanımı burada yapıyoruz çünkü giden parada yazma yolu
  // "odemeye-tasi": para bir kasa kaydının `odemeler` dizisine taşınır, siparişe taşınamaz.
  function acikHedefler(firmaId, yon) {
    const hedefler = [];
    if (yon === "gelen") {
      for (const s of siparisler) {
        if (s.firmaId !== firmaId || s.kapatildi) continue;
        const kalan = siparisHesap(s).kalan;
        if (kalan <= EPS) continue;
        hedefler.push({ hedefTur: "siparis", id: s.id, tarih: s.tarih, sira: s.createdAt ?? 0, kalan, ad: s.urun || "Sipariş" });
      }
    }
    for (const k of kayitlar) {
      if (k.firmaId !== firmaId || k.tur || k.siparisId || k.tasindi) continue;
      if (k.durum !== "aktif" || k.yon !== yon) continue;
      const kalan = kayitKalani(k);
      if (kalan <= EPS) continue;
      hedefler.push({ hedefTur: "kayit", id: k.id, tarih: k.tarih, sira: k.createdAt ?? 0, kalan, ad: k.aciklama || "Kayıt" });
    }
    return hedefler.sort((a, b) => (a.tarih === b.tarih ? a.sira - b.sira : a.tarih < b.tarih ? -1 : 1));
  }

  function dagitimPlani(tutar, hedefler) {
    const plan = [];
    let kalan = tutar;
    for (const h of hedefler) {
      if (kalan <= EPS) break;
      const dusen = Math.min(kalan, h.kalan);
      if (dusen <= EPS) continue;
      plan.push({ hedefTur: h.hedefTur, id: h.id, tutar: yuvarla(dusen), ad: h.ad, hedefKalan: h.kalan });
      kalan -= dusen;
    }
    return plan;
  }

  function sinifla(k) {
    if (!k.firmaId) return { kod: "--", para: 0, neden: "firmaya bağlı değil" };
    if (k.tur === "transfer" || k.tur === "mahsup-komisyon") {
      return { kod: "--", para: 0, neden: "transfer / mahsup komisyonu: cariye girmez" };
    }
    if (k.durum === "arsiv") return { kod: "--", para: 0, neden: "arşivde: kalanı kapatılmış sayılıyor" };
    const para = yuvarla(dagitilabilirTutar(k) - dagitilan(k));
    if (para <= EPS) return { kod: "--", para: 0, neden: "dağıtılmamış para yok" };
    if (k.tur === "tahsilat" || k.tur === "mahsup") {
      return { kod: "AV", para, neden: `${k.tur} kaydının dağıtılmamış kısmı (avans)`, yazilir: true, bicim: "dagitim" };
    }
    if (k.siparisId) {
      return { kod: "SP", para, neden: "eski yol: para siparisId üzerinden o siparişe sayılıyor", yazilir: false };
    }
    if (k.kaynak === "veresiye") {
      return {
        kod: "VR",
        para,
        neden: "Alacaklar / Borçlar'dan veresiye kalemi olarak girilmiş: para hareketi değil, dönüştürülmez",
        yazilir: false,
      };
    }
    const toplam = k.toplamTutar ?? 0;
    if (toplam <= EPS) {
      return { kod: "P0", para, neden: "Toplam boş: satış değil, yalnızca para hareketi", yazilir: true, bicim: "tahsilata-cevir" };
    }
    if (Math.abs(toplam - (k.alinanTutar ?? 0)) < EPS) {
      return {
        kod: "PT",
        para,
        neden: "Toplam = Alınan: peşin satış gibi modellenmiş, cariye hiç yansımıyor",
        yazilir: pesinDe,
        bicim: "tahsilata-cevir",
        uyari: "gerçek peşin satış da olabilir; dönüştürülürse firmanın bakiyesi bu tutar kadar değişir",
      };
    }
    return { kod: "PK", para, neden: "Toplam > Alınan: para kendi kalemini kapatıyor", yazilir: false };
  }

  // Kaydın hangi ekrandan, hangi alanlarla girildiği — yalnızca alanlardan okunuyor.
  function girisYolu(k) {
    if (k.tur === "transfer") return "Kasa → Transfer (virman)";
    if (k.tur === "mahsup") return "Mahsup penceresi";
    if (k.tur === "mahsup-komisyon") return "Mahsup komisyonu (otomatik ikinci belge)";
    if (k.tur === "tahsilat") {
      return k.siparisId
        ? "Sipariş detayı → Ödeme Al (Aşama 3 sonrası: tur=tahsilat + dagitim)"
        : "Tahsilat penceresi — Kasa Girişi / Alacaklar / firma ekstresi (Aşama 3 sonrası)";
    }
    if (k.kaynak === "veresiye") return `${k.yon === "gelen" ? "Alacaklar" : "Borçlar"} → yeni veresiye kalemi`;
    if (k.siparisId) return "Sipariş ödemesi (Aşama 3 ÖNCESİ: tur yok, dagitim yok, siparisId var)";
    const toplam = k.toplamTutar ?? 0;
    const alinan = k.alinanTutar ?? 0;
    const yonAd = k.yon === "gelen" ? "Giriş" : "Çıkış";
    if (toplam <= EPS) return `Kasa → ${yonAd} satırı: Toplam BOŞ bırakılmış, yalnızca Peşin dolu (Aşama 3 ÖNCESİ)`;
    if (Math.abs(toplam - alinan) < EPS) return `Kasa → ${yonAd} satırı: Toplam = Peşin (peşin satış/alış gibi kaydedilmiş)`;
    return `Kasa → ${yonAd} satırı: Toplam ${toplam}, Peşin ${alinan} (kısmi ödenmiş kalem)`;
  }

  // Tedarikçi tarafında ödeme kaydının borç kaydına taşınmasını engelleyen durumlar.
  function tedarikciEngeli(k) {
    if (k.tur) return `özel kayıt türü (${k.tur}): elle incelenmeli`;
    if (Array.isArray(k.odemeler) && k.odemeler.length > 0) return "kaydın kendi ödeme satırları var";
    // Kayıt çöp kutusuna gideceği için kendi `dagitim` satırları da yok olurdu: giden parada dağıtım
    // bir iadenin siparişten düşülmesidir, o düşüm sessizce geri alınmış olurdu.
    if (Array.isArray(k.dagitim) && k.dagitim.length > 0) return "kaydın kendi dağıtım satırları var (iade dağıtımı)";
    if ((kayitDagitimlari.get(k.id) ?? 0) !== 0) return "başka bir kaydın dağıtımı bu kayda düşüyor";
    if (k.mahsupId) return "mahsup belgesine bağlı";
    if (k.vadeTarihi) return "vade tarihi var (çek / senet olabilir)";
    return null;
  }

  // Bütün adayları bulur, planlar ve planı belleğe uygular. Veritabanına hiçbir şey yazmaz.
  function planla(firmaIdleri) {
    const yazilacak = [];
    const elle = [];
    const atlanan = new Map();
    const bolumler = { gelen: [], giden: [] };
    let toplamDagitilan = 0;

    for (const yon of ["gelen", "giden"]) {
      for (const firmaId of firmaIdleri) {
        const adaylar = kayitlar
          .filter((k) => k.firmaId === firmaId && k.yon === yon)
          .filter((k) => !Array.isArray(k.dagitim) || dagitilan(k) < dagitilabilirTutar(k) - EPS)
          .sort((a, b) => (a.tarih === b.tarih ? (a.createdAt ?? 0) - (b.createdAt ?? 0) : a.tarih < b.tarih ? -1 : 1));
        const satirlar = [];
        const bakiyeOnce = firmaBakiyesi(firmaId);

        for (const k of adaylar) {
          const s = sinifla(k);
          if (s.kod === "--") continue;
          // Kayıt aşağıda bellekte güncelleniyor; "hangi ekrandan girildiği" değişmeden okunur.
          s.giris = girisYolu(k);
          if (!s.yazilir) {
            atlanan.set(s.kod, (atlanan.get(s.kod) ?? 0) + 1);
            satirlar.push({ kayit: k, sinif: s, plan: [], not: s.kod === "PT" ? "yazılmadı (--pesin-de gerekiyor)" : "yazılmadı" });
            if (s.kod === "PT") elle.push({ kayit: k, sinif: s });
            continue;
          }
          const plan = dagitimPlani(s.para, acikHedefler(firmaId, yon));
          const dagitilacak = yuvarla(plan.reduce((t, d) => t + d.tutar, 0));
          if (plan.length === 0) {
            satirlar.push({ kayit: k, sinif: s, plan: [], not: "açık kalem yok: para avans olarak kalıyor" });
            continue;
          }
          const engel = yon === "giden" ? tedarikciEngeli(k) : null;
          if (engel) {
            satirlar.push({ kayit: k, sinif: s, plan, not: `yazılmadı: ${engel}` });
            elle.push({ kayit: k, sinif: s });
            continue;
          }
          if (yon === "giden" && dagitilacak < s.para - EPS) {
            satirlar.push({ kayit: k, sinif: s, plan, not: `açık borçlara yalnızca ${dagitilacak} sığıyor → elle` });
            elle.push({ kayit: k, sinif: s });
            continue;
          }
          const bicim = yon === "gelen" ? s.bicim : "odemeye-tasi";
          // Yazılacak dağıtım dizisi mevcut dağıtımın üstüne eklenir; kaydı aşağıda bellekte de
          // güncellediğimiz için diziyi değişiklikten ÖNCE kuruyoruz.
          const dagitim = [
            ...(Array.isArray(k.dagitim) ? k.dagitim : []),
            ...plan.map((d) => ({ hedefTur: d.hedefTur, id: d.id, tutar: d.tutar })),
          ];
          yazilacak.push({ kayit: k, kod: s.kod, plan, bicim, yon, dagitim });
          toplamDagitilan += dagitilacak;
          satirlar.push({ kayit: k, sinif: s, plan, not: null });

          // Planı canlı toplamlara ve kayda uygula: sıradaki aday aynı kalemi ikinci kez görmesin.
          for (const d of plan) {
            if (yon === "gelen") {
              if (d.hedefTur === "siparis") ekle(siparisOdemeleri, d.id, d.tutar);
              else ekle(kayitDagitimlari, d.id, d.tutar);
            } else {
              ekle(odemeEklenen, d.id, d.tutar);
            }
          }
          if (bicim === "odemeye-tasi") k.tasindi = true;
          else {
            if (bicim === "tahsilata-cevir") {
              k.tur = "tahsilat";
              k.toplamTutar = 0;
              k.durum = "aktif";
            }
            k.dagitim = dagitim;
          }
        }

        if (satirlar.length > 0) bolumler[yon].push({ firmaId, bakiyeOnce, satirlar });
      }
    }
    return { yazilacak, elle, atlanan, bolumler, toplamDagitilan: yuvarla(toplamDagitilan) };
  }

  return {
    acikHedefler,
    avans,
    cariEtkileri,
    dagitilabilirTutar,
    dagitilan,
    dagitimPlani,
    firmaBakiyesi,
    girisYolu,
    kayitKalani,
    planla,
    sinifla,
    siparisHesap,
    tedarikciEngeli,
  };
}
