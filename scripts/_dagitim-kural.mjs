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
//   [P0] Toplam boş, firmanın açık kalemi var        → dağıtılır; cari bakiye DEĞİŞMEZ (para zaten
//                                                      bakiyeye yansıyordu), yalnızca hangi kaleme
//                                                      düştüğü belli olur.
//   [AV] tur tahsilat / mahsup, dağıtımı eksik       → avans; açık kalem varsa dağıtılır, yoksa
//                                                      avans olarak kalır. Bakiye değişmez.
//   [GD] gider kalemi, Toplam boş                    → HARCAMA: Toplam = Peşin yazılır. Gider aynı
//                                                      anda doğup kapandığı için gider kaleminin
//                                                      cari bakiyesi sıfırlanır. Gider kalemine
//                                                      yapılan ödeme asla avans olmaz. Gider
//                                                      kalemine yazılmış `tur: "tahsilat"` kaydı
//                                                      kasa düzeltme kaydıdır: türü de kaldırılır.
//                                                      Türü "gider" olup AÇIK BORCU olan firma
//                                                      tedarikçi sayılır (etkinTuru), parası bu
//                                                      kümeye değil [P0]'a girer.
//   [PA] giden, Toplam boş, açık borç yok            → PEŞİN ALIŞ: Toplam = Peşin yazılır. Bakiye
//                                                      sıfırlanır (eskiden bize alacak görünüyordu).
//   [AK] gelen, Toplam boş, açık kalem yok           → para avans olarak kalır; yazılmaz.
//   [PT] Toplam = Peşin                              → peşin satış / alış: doğru kaydedilmiş,
//                                                      dokunulmaz. Yazılmaz.
//   [PK] Toplam > Peşin                              → para kendi kalemini kapatıyor (kısmi ödenmiş
//                                                      kalem). Yazılmaz.
//   [SP] siparisId var, dagitim yok                  → eski yol: para `siparisId` üzerinden o
//                                                      siparişe zaten sayılıyor. Yazılmaz.
//   [VR] kaynak "veresiye"                           → Alacaklar / Borçlar kalemi, para hareketi
//                                                      değil. Yazılmaz.
//   [--] transfer / mahsup komisyonu / arşiv / parasız / firmasız → ilgisiz.
//
// NE YAZILACAĞI (`bicim`)
//   "tahsilata-cevir" (Toplam boş kayıt): tur: "tahsilat", toplamTutar: 0, durum: "aktif",
//       dagitim: [...]. İki yönde de aynı: giden parada da kayıt YERİNDE KALIR, yalnızca dağıtımı
//       yazılır. Kaydın kendi parası cariye artık avans üzerinden girdiği için (tam dağıtılmışsa
//       sıfır) ve hedefin kalanı dağıtımdan düştüğü için aynı para iki kez sayılmaz. HEDEF KAYDA
//       HİÇ DOKUNULMAZ — bütün değişiklik parayı getiren kayıttadır.
//   "dagitim" (zaten tahsilat / mahsup): yalnızca `dagitim` tamamlanır.
//   "pesine-cevir" ([GD] ve [PA]): toplamTutar = alinanTutar. Kalan sıfırlanır, kayıt harcama /
//       peşin alış olur, firmanın cari bakiyesinden çıkar.
export const EPS = 0.005;
export const yuvarla = (n) => Math.round(n * 100) / 100;

const ODEME_SEKLI = { nakit: "Nakit", kart: "Kart / POS", havale: "Banka Havalesi" };
export const odemeSekliAdi = (k) => ODEME_SEKLI[k.odemeSekli] ?? k.odemeSekli ?? "?";

// `kayitlar` ve `siparisler` silinmişlerden arınmış olarak gelir. planla() bu nesneleri bellekte
// yazılmış hale getirir (tur / toplamTutar / dagitim), böylece "sonraki aday" ve "firma bakiyesi
// sonra" hesapları yazma sonrası durumu gösterir. `firmaTurleri`: firmaId → "musteri" | "tedarikci"
// | "gider" (firma türü değişecekse çağıran onu uygulamış olarak verir).
export function kuralMotoru({ kayitlar, siparisler, firmaTurleri = new Map() }) {
  const siparisOdemeleri = new Map();
  const kayitDagitimlari = new Map();
  const ekle = (map, id, tutar) => map.set(id, (map.get(id) ?? 0) + tutar);
  const firmaTuru = (firmaId) => firmaTurleri.get(firmaId) ?? "musteri";

  const dagitilan = (k) => (Array.isArray(k.dagitim) ? k.dagitim : []).reduce((t, d) => t + (d.tutar ?? 0), 0);
  const dagitilabilirTutar = (k) => (k.tur === "mahsup" ? (k.toplamTutar ?? 0) : (k.alinanTutar ?? 0));
  const avans = (k) =>
    k.tur === "tahsilat" || k.tur === "mahsup" ? Math.max(0, dagitilabilirTutar(k) - dagitilan(k)) : 0;
  const kayitKalani = (k) => (k.toplamTutar ?? 0) - (k.alinanTutar ?? 0) - (kayitDagitimlari.get(k.id) ?? 0);

  // Tek kaynak kuralı: kayıt `dagitim` taşıyorsa katkı yalnızca ondan gelir, taşımıyorsa eski
  // `siparisId` yolundan. Aynı para iki kez sayılmaz. İşaret lib/dagitim.ts ile aynı: para kalemle
  // aynı yönde akıyorsa kalemin kalanını düşürür, ters yönde akıyorsa (iade) artırır. Sipariş her
  // zaman "gelen" yönlü bir kalemdir.
  const yonOf = new Map(kayitlar.map((k) => [k.id, k.yon]));
  for (const k of kayitlar) {
    const siparisIsareti = k.yon === "gelen" ? 1 : -1;
    if (Array.isArray(k.dagitim)) {
      for (const d of k.dagitim) {
        if (d.hedefTur === "siparis") ekle(siparisOdemeleri, d.id, siparisIsareti * (d.tutar ?? 0));
        else if (d.hedefTur === "kayit") {
          const hedefYon = yonOf.get(d.id) ?? "gelen";
          ekle(kayitDagitimlari, d.id, (k.yon === hedefYon ? 1 : -1) * (d.tutar ?? 0));
        }
      }
      continue;
    }
    if (k.siparisId) ekle(siparisOdemeleri, k.siparisId, siparisIsareti * (k.alinanTutar ?? 0));
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
    // Avans yönlü: müşteriden fazla alınan para bizim borcumuz (−), tedarikçiye fazla ödenen para
    // bizim alacağımız (+).
    if (k.tur === "tahsilat") {
      const kalan = avans(k);
      return [{ firmaId: k.firmaId, etki: k.yon === "gelen" ? -kalan : kalan }];
    }
    if (k.tur === "mahsup") {
      const etkiler = [{ firmaId: k.firmaId, etki: -avans(k) }];
      if (k.karsiTur !== "gider" && k.karsiTur !== "personel" && k.karsiFirmaId) {
        etkiler.push({ firmaId: k.karsiFirmaId, etki: k.sayilanTutar ?? k.toplamTutar ?? 0 });
      }
      return etkiler;
    }
    return [{ firmaId: k.firmaId, etki: kayitBakiyesi(k) }];
  }

  function firmaBakiyesi(firmaId) {
    let bakiye = 0;
    for (const s of siparisler) {
      if (s.firmaId !== firmaId) continue;
      bakiye += s.kapatildi ? 0 : siparisHesap(s).acikKalan;
    }
    for (const k of kayitlar) {
      for (const e of cariEtkileri(k)) if (e.firmaId === firmaId) bakiye += e.etki;
    }
    return bakiye;
  }

  // Bir firmanın açık kalemleri, eskiden yeniye. `yon` paranın yönü: "gelen" (müşteri tahsilatı)
  // açık siparişleri ve açık alacak kayıtlarını kapatır, "giden" (tedarikçi ödemesi) yalnızca açık
  // borç kayıtlarını — sipariş bir satıştır, borç tarafında kalem olmaz. lib/dagitim.ts
  // acikHedefler ile birebir aynıdır.
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
      if (k.firmaId !== firmaId || k.tur || k.siparisId) continue;
      if (k.durum !== "aktif" || k.yon !== yon) continue;
      const kalan = kayitKalani(k);
      if (kalan <= EPS) continue;
      hedefler.push({
        hedefTur: "kayit",
        id: k.id,
        tarih: k.tarih,
        sira: k.createdAt ?? 0,
        kalan,
        ad: k.aciklama || "Kayıt",
        ...(k.vadeTarihi ? { vade: k.vadeTarihi } : {}),
      });
    }
    // Sıra lib/dagitim.ts hedefSirasi ile aynı: gidende önce vadesi olan kalemler (çek / senet) en
    // yakın vadeden, sonra vadesizler eskiden yeniye; gelende düz tarih sırası.
    const grup = (h) => (yon === "giden" && h.vade ? 0 : 1);
    return hedefler.sort((a, b) => {
      const g = grup(a) - grup(b);
      if (g !== 0) return g;
      if (grup(a) === 0 && a.vade !== b.vade) return a.vade < b.vade ? -1 : 1;
      return a.tarih === b.tarih ? a.sira - b.sira : a.tarih < b.tarih ? -1 : 1;
    });
  }

  // Kaydın kendisi hedef listesine giremez (parası kendi kalemini kapatan [PK] kayıtlarda olabilir).
  const hedefleri = (k) => acikHedefler(k.firmaId, k.yon).filter((h) => !(h.hedefTur === "kayit" && h.id === k.id));

  // Türü "gider" olsa bile **açık borcu** (devir / veresiye kalemi) olan firma tedarikçi gibi
  // işlenir: gider kalemine borç birikmez, açık borç o firmanın gerçekte tedarikçi olduğunu
  // gösterir — parası harcamaya çevrilmek yerine o borca dağıtılmalı. Planlama kalemleri tükettikçe
  // sonuç değişmesin diye BAŞLANGIÇ durumundan bir kez hesaplanıyor.
  const etkinTur = new Map();
  for (const firmaId of new Set(kayitlar.map((k) => k.firmaId).filter(Boolean))) {
    const t = firmaTuru(firmaId);
    etkinTur.set(firmaId, t === "gider" && acikHedefler(firmaId, "giden").length > 0 ? "tedarikci" : t);
  }
  const etkinTuru = (firmaId) => etkinTur.get(firmaId) ?? firmaTuru(firmaId);

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
    if (k.kaynak === "veresiye") {
      return {
        kod: "VR",
        para,
        neden: "Alacaklar / Borçlar'dan veresiye kalemi olarak girilmiş: para hareketi değil, dönüştürülmez",
        yazilir: false,
      };
    }
    if (k.siparisId) {
      return { kod: "SP", para, neden: "eski yol: para siparisId üzerinden o siparişe sayılıyor", yazilir: false };
    }
    const toplam = k.toplamTutar ?? 0;

    // Gider kalemi: para harcamadır, asla avans olmaz. Gider kaleminin cari bakiyesi sıfır olmalı.
    if (etkinTuru(k.firmaId) === "gider") {
      // Gider kalemine yazılmış tahsilat kaydı (Kasa'ya Toplam boş girilmiş giriş / çıkış) bir kasa
      // düzeltme kaydıdır: avans taşımaması için türü kaldırılıp Toplam = Peşin yapılır. Dağıtımı
      // olan ya da başka türdeki (mahsup) kayıtlar elle incelenir — tür kaldırılsa dağıtım satırları
      // sessizce kaleme sayılmaya devam ederdi.
      if (k.tur === "tahsilat" && dagitilan(k) <= EPS) {
        return {
          kod: "GD",
          para,
          neden: "gider kalemine yazılmış tahsilat: kasa düzeltme kaydı (tur kaldırılıp Toplam = Peşin)",
          yazilir: true,
          bicim: "pesine-cevir",
          turSil: true,
        };
      }
      if (k.tur) {
        return {
          kod: "GD",
          para,
          neden: `gider kalemi ama kayıt türü var (${k.tur}${dagitilan(k) > EPS ? ", dağıtımı da var" : ""}): elle incelenmeli`,
          yazilir: false,
          elle: true,
        };
      }
      if (toplam <= EPS) {
        return {
          kod: "GD",
          para,
          neden: "gider kalemi, Toplam boş: harcama olmalı (Toplam = Peşin)",
          yazilir: true,
          bicim: "pesine-cevir",
        };
      }
      if (Math.abs(toplam - (k.alinanTutar ?? 0)) < EPS) {
        return { kod: "PT", para, neden: "gider kalemi, Toplam = Peşin: harcama olarak doğru kaydedilmiş", yazilir: false };
      }
      return { kod: "PK", para, neden: "gider kalemi, Toplam > Peşin: para kendi kalemini kapatıyor", yazilir: false };
    }

    if (k.tur === "tahsilat" || k.tur === "mahsup") {
      const hedefVar = hedefleri(k).length > 0;
      return {
        kod: "AV",
        para,
        neden: hedefVar
          ? `${k.tur} kaydının dağıtılmamış kısmı (avans): açık kaleme dağıtılacak`
          : `${k.tur} kaydının dağıtılmamış kısmı (avans): açık kalem yok, avans olarak kalıyor`,
        yazilir: hedefVar,
        bicim: "dagitim",
      };
    }

    if (toplam <= EPS) {
      if (hedefleri(k).length > 0) {
        return {
          kod: "P0",
          para,
          neden: "Toplam boş: satış / alış değil, yalnızca para hareketi — açık kaleme dağıtılacak",
          yazilir: true,
          bicim: "tahsilata-cevir",
        };
      }
      if (k.yon === "giden") {
        return {
          kod: "PA",
          para,
          neden: "Toplam boş, firmanın açık borcu yok: peşin alış (Toplam = Peşin)",
          yazilir: true,
          bicim: "pesine-cevir",
        };
      }
      return { kod: "AK", para, neden: "Toplam boş, firmanın açık kalemi yok: para avans olarak kalıyor", yazilir: false };
    }

    if (Math.abs(toplam - (k.alinanTutar ?? 0)) < EPS) {
      return { kod: "PT", para, neden: "Toplam = Peşin: peşin satış / alış olarak doğru kaydedilmiş", yazilir: false };
    }
    return { kod: "PK", para, neden: "Toplam > Peşin: para kendi kalemini kapatıyor", yazilir: false };
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

  // Giden parada dağıtım yazılmasını durduran durumlar. Kayıt artık yerinde kaldığı (çöp kutusuna
  // gitmediği) için liste kısa: yalnızca başka bir belgeye bağlı ya da vadeli kayıtlar elle
  // incelenir.
  function gidenEngeli(k) {
    if (k.tur && k.tur !== "tahsilat") return `özel kayıt türü (${k.tur}): elle incelenmeli`;
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
    let toplamPesine = 0;

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
            satirlar.push({ kayit: k, sinif: s, plan: [], not: "yazılmadı" });
            if (s.elle) elle.push({ kayit: k, sinif: s });
            continue;
          }

          // [GD] / [PA]: Toplam = Peşin. Dağıtım yok, kalan sıfırlanır.
          if (s.bicim === "pesine-cevir") {
            const yeniToplam = yuvarla(k.alinanTutar ?? 0);
            yazilacak.push({ kayit: k, kod: s.kod, bicim: "pesine-cevir", yon, plan: [], yeniToplam, turSil: !!s.turSil });
            toplamPesine += yeniToplam;
            satirlar.push({ kayit: k, sinif: s, plan: [], not: null });
            // Bellekte uygula: bakiye "sonra" doğru görünsün.
            k.toplamTutar = yeniToplam;
            if (s.turSil) delete k.tur;
            continue;
          }

          const plan = dagitimPlani(s.para, hedefleri(k));
          const dagitilacak = yuvarla(plan.reduce((t, d) => t + d.tutar, 0));
          const engel = yon === "giden" ? gidenEngeli(k) : null;
          if (engel) {
            satirlar.push({ kayit: k, sinif: s, plan, not: `yazılmadı: ${engel}` });
            elle.push({ kayit: k, sinif: s });
            continue;
          }
          // Giden parada eksik dağıtım bırakılmaz: artan avans olarak kalırdı, oysa tedarikçiye
          // fazla ödenen paranın ne olduğu elle karara bağlı.
          if (yon === "giden" && dagitilacak < s.para - EPS) {
            satirlar.push({ kayit: k, sinif: s, plan, not: `açık borçlara yalnızca ${dagitilacak} sığıyor → elle` });
            elle.push({ kayit: k, sinif: s });
            continue;
          }
          // Yazılacak dağıtım dizisi mevcut dağıtımın üstüne eklenir; kaydı aşağıda bellekte de
          // güncellediğimiz için diziyi değişiklikten ÖNCE kuruyoruz.
          const dagitim = [
            ...(Array.isArray(k.dagitim) ? k.dagitim : []),
            ...plan.map((d) => ({ hedefTur: d.hedefTur, id: d.id, tutar: d.tutar })),
          ];
          yazilacak.push({ kayit: k, kod: s.kod, plan, bicim: s.bicim, yon, dagitim });
          toplamDagitilan += dagitilacak;
          satirlar.push({ kayit: k, sinif: s, plan, not: null });

          // Planı canlı toplamlara ve kayda uygula: sıradaki aday aynı kalemi ikinci kez görmesin.
          // Hedef kaydın kendisine dokunulmuyor; kalanı bu toplamdan düşüyor (lib/dagitim.ts).
          for (const d of plan) {
            if (d.hedefTur === "siparis") ekle(siparisOdemeleri, d.id, yon === "gelen" ? d.tutar : -d.tutar);
            else ekle(kayitDagitimlari, d.id, d.tutar); // aday ile hedef aynı yönde
          }
          if (s.bicim === "tahsilata-cevir") {
            k.tur = "tahsilat";
            k.toplamTutar = 0;
            k.durum = "aktif";
          }
          k.dagitim = dagitim;
        }

        if (satirlar.length > 0) bolumler[yon].push({ firmaId, bakiyeOnce, satirlar });
      }
    }
    return {
      yazilacak,
      elle,
      atlanan,
      bolumler,
      toplamDagitilan: yuvarla(toplamDagitilan),
      toplamPesine: yuvarla(toplamPesine),
    };
  }

  return {
    acikHedefler,
    avans,
    cariEtkileri,
    dagitilabilirTutar,
    dagitilan,
    dagitimPlani,
    etkinTuru,
    firmaBakiyesi,
    firmaTuru,
    girisYolu,
    gidenEngeli,
    hedefleri,
    kayitKalani,
    planla,
    sinifla,
    siparisHesap,
  };
}
