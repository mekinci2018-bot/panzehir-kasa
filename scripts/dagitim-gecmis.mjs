// Geçmiş veri: açık kalemlere dağıtılmamış tahsilatları / ödemeleri dağıtır.
//
// Aşama 3 (dağıtım, commit e32a67c) 06.11.2026'da geldi. Ondan önce girilen "firmadan para alındı"
// kayıtları düz Kasa Girişi olarak yazıldı: `tur` yok, `dagitim` yok. Para cari bakiyeye yansıyor
// (firma ekstresi doğru çıkıyor) ama hiçbir siparişe düşmediği için Alacaklar'da siparişler tam
// tutarla duruyor. Bu betik o kayıtları bulur, uygulamanın kendi kuralıyla (eskiden yeniye, artanı
// avans) dağıtır ve uygulamanın yazdığı biçime çevirir.
//
//   node scripts/dagitim-gecmis.mjs                        kuru çalıştırma: bütün firmalar
//   node scripts/dagitim-gecmis.mjs --firma "ANATOLIA"     yalnızca o firma + kayıtların TÜM alanları
//   node scripts/dagitim-gecmis.mjs --yaz                  yedekten sonra yazar ve doğrular
//   node scripts/dagitim-gecmis.mjs --pesin-de --yaz       şüpheli [PT] kayıtları da dönüştürür
//
// Aday kuralları, kodların anlamı ve ne yazıldığı scripts/_dagitim-kural.mjs başındaki yorumda.
// Özetle: `dagitim` taşımayan, firmaya bağlı, parası olan her kayıt aday sayılır (tur ne olursa
// olsun, Toplam ne olursa olsun); [P0] ve [AV] yazılır, [PT] yalnızca --pesin-de ile, [PK], [SP] ve
// [VR] hiç yazılmaz. Müşteri tarafında kayıt tahsilat biçimine çevrilip `dagitim` yazılır; tedarikçi
// tarafında ödeme borç kaydının `odemeler` dizisine taşınır ve ödeme kaydı çöp kutusuna gider.
//
// Her çalıştırmada (kuru ya da gerçek) `firmalar`, `kasaKayitlari` ve `siparisler` koleksiyonlarının
// tam hali import/ klasörüne yedeklenir.
//
// Ortak kasa hesabının PIN'ini sorar (KASA_PIN ortam değişkeni ile de verilebilir). Bu betiği kendi
// terminalinde çalıştır; PIN sohbete yazılmaz.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { gizliSor } from "./_gizli-giris.mjs";
import { EPS, kuralMotoru, odemeSekliAdi, yuvarla } from "./_dagitim-kural.mjs";
import { inMemoryPersistence, initializeAuth, signInWithEmailAndPassword } from "firebase/auth";
import { collection, doc, getDocs, getFirestore, writeBatch } from "firebase/firestore";

const KASA_EMAIL = "kasa@panzehir-kasa.app";
const YAZ = process.argv.includes("--yaz");
const PESIN_DE = process.argv.includes("--pesin-de");
const FIRMA_ARA = (() => {
  const i = process.argv.indexOf("--firma");
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1].toLocaleUpperCase("tr") : null;
})();
const PARTI = 400; // writeBatch sınırı 500
const TASINDI_NOTU = "[parası borç kalemlerine taşındı · GERİ GETİRME]";

// lib/db.ts odemeAlanlari ile birebir aynı: banka hesabı yalnızca havalede, kart açıklaması
// yalnızca kartta yazılır. Taşınan ödeme satırının banka / kart hareketi bu alanlardan okunduğu
// için (lib/hareketler.ts normalHareketler) aynı kuralı burada da uygulamak gerekiyor.
function odemeAlanlari(odemeSekli, bankaHesapId, kartAciklama) {
  if (odemeSekli === "havale" && bankaHesapId) return { bankaHesapId };
  const kart = kartAciklama?.trim();
  if (odemeSekli === "kart" && kart) return { kartAciklama: kart };
  return {};
}

function envOku() {
  let icerik = readFileSync(".env.local", "utf8");
  if (icerik.charCodeAt(0) === 0xfeff) icerik = icerik.slice(1);
  const env = {};
  for (const satirRaw of icerik.split(/\r?\n/)) {
    const satir = satirRaw.trim();
    if (!satir || satir.startsWith("#")) continue;
    const m = satir.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let deger = m[2].trim();
    if ((deger.startsWith('"') && deger.endsWith('"')) || (deger.startsWith("'") && deger.endsWith("'"))) {
      deger = deger.slice(1, -1);
    }
    env[m[1]] = deger;
  }
  return env;
}

const TL = (n) => "₺" + new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const sag = (n, g = 14) => TL(n).padStart(g);
const gun = (iso) => (iso ? String(iso).split("-").reverse().join(".") : "?");
const anlik = (ms) =>
  ms
    ? new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" }).format(
        new Date(ms)
      )
    : "?";

const env = envOku();
const app = initializeApp({
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
});
const auth = initializeAuth(app, { persistence: inMemoryPersistence });
const db = getFirestore(app);

const pin = process.env.KASA_PIN ?? (await gizliSor("Kasa PIN (gizli): "));
await signInWithEmailAndPassword(auth, KASA_EMAIL, pin);

const [firmaSnap, kayitSnap, siparisSnap] = await Promise.all([
  getDocs(collection(db, "firmalar")),
  getDocs(collection(db, "kasaKayitlari")),
  getDocs(collection(db, "siparisler")),
]);
const firmalar = firmaSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((f) => !f.silindi);
const kayitlar = kayitSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((k) => !k.silindi);
const siparisler = siparisSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => !s.silindi);

// ---- Yedek (kuru çalıştırmada da alınır) ----
mkdirSync("import", { recursive: true });
const simdiMs = new Date();
const bugun = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(simdiMs);
const saat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Istanbul",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
})
  .format(simdiMs)
  .replace(/:/g, "");
const yedekYolu = `import/yedek-DAGITIM-ONCESI-${bugun}-${saat}.json`;
writeFileSync(
  yedekYolu,
  JSON.stringify({
    olusturma: simdiMs.toISOString(),
    firmalar: Object.fromEntries(firmaSnap.docs.map((d) => [d.id, d.data()])),
    kasaKayitlari: Object.fromEntries(kayitSnap.docs.map((d) => [d.id, d.data()])),
    siparisler: Object.fromEntries(siparisSnap.docs.map((d) => [d.id, d.data()])),
  })
);
console.log(`Yedek alındı: ${yedekYolu} (${kayitSnap.size} kayıt, ${siparisSnap.size} sipariş)`);

const motor = kuralMotoru({ kayitlar, siparisler, pesinDe: PESIN_DE });

// ---- Firma listesi ----
const adOf = new Map(firmalar.map((f) => [f.id, f.ad]));
const turOf = new Map(firmalar.map((f) => [f.id, f.tur ?? "musteri"]));
const firmaAdi = (id) => adOf.get(id) ?? "(silinmiş firma)";
const firmaIdleri = [...new Set(kayitlar.filter((k) => k.firmaId).map((k) => k.firmaId))];
const secilenler = (
  FIRMA_ARA ? firmaIdleri.filter((id) => firmaAdi(id).toLocaleUpperCase("tr").includes(FIRMA_ARA)) : firmaIdleri
).sort((a, b) => firmaAdi(a).localeCompare(firmaAdi(b), "tr"));

if (FIRMA_ARA && secilenler.length === 0) {
  console.log(`\n"${FIRMA_ARA}" ile eşleşen, kasa kaydı olan firma yok.`);
  process.exit(1);
}

// ---- Alan dökümü (yalnızca --firma ile) ----
if (FIRMA_ARA) {
  for (const firmaId of secilenler) {
    console.log("\n" + "=".repeat(110));
    console.log(`ALAN DÖKÜMÜ · ${firmaAdi(firmaId)}  [${turOf.get(firmaId) ?? "?"}]  (${firmaId})`);
    console.log("=".repeat(110));
    const kendi = kayitlar
      .filter((k) => k.firmaId === firmaId || k.karsiFirmaId === firmaId)
      .sort((a, b) => (a.tarih === b.tarih ? (a.createdAt ?? 0) - (b.createdAt ?? 0) : a.tarih < b.tarih ? -1 : 1));
    const kendiSiparis = siparisler.filter((s) => s.firmaId === firmaId).sort((a, b) => (a.tarih < b.tarih ? -1 : 1));

    console.log(`\nSİPARİŞLER (${kendiSiparis.length})`);
    for (const s of kendiSiparis) {
      const h = motor.siparisHesap(s);
      console.log(
        `\n  ${gun(s.tarih)}  ${s.urun || "(ürün yok)"}  No ${s.siparisNo ?? "—"}  (${s.id})\n` +
          `     tutar ${sag(s.tutar ?? 0)} · ödenen ${sag(h.odenen)} · KALAN ${sag(h.kalan)}${s.kapatildi ? " · KAPATILDI" : ""}`
      );
      console.log("     " + JSON.stringify(s));
    }

    console.log(`\nKASA KAYITLARI (${kendi.length})`);
    for (const k of kendi) {
      const s = motor.sinifla(k);
      const etki = motor.cariEtkileri(k).reduce((t, e) => (e.firmaId === firmaId ? t + e.etki : t), 0);
      console.log(
        `\n  ${gun(k.tarih)}  ${k.aciklama || "(açıklama yok)"}  ·  ${k.yon === "gelen" ? "GİRİŞ" : "ÇIKIŞ"} ` +
          `${odemeSekliAdi(k)}  (${k.id})`
      );
      console.log(
        `     tur ${k.tur ?? "(yok)"} · Toplam ${sag(k.toplamTutar ?? 0)} · Alınan ${sag(k.alinanTutar ?? 0)} · ` +
          `durum ${k.durum ?? "?"} · dagitim ${
            Array.isArray(k.dagitim) ? `${k.dagitim.length} satır (${TL(motor.dagitilan(k))})` : "(yok)"
          }`
      );
      console.log(`     kayıt kalanı ${sag(motor.kayitKalani(k))} · cari bakiyeye etkisi ${sag(etki)}`);
      console.log(`     girildiği yer : ${motor.girisYolu(k)}`);
      console.log(`     girildiği an  : ${anlik(k.createdAt)}  (son değişiklik ${anlik(k.updatedAt)})`);
      console.log(`     sınıf         : [${s.kod}] ${s.neden}`);
      console.log("     " + JSON.stringify(k));
    }
    console.log(`\nCARİ BAKİYE: ${TL(motor.firmaBakiyesi(firmaId))}`);
  }
}

// ---- Adaylar ve planlar ----
const { yazilacak, elle, atlanan, bolumler, toplamDagitilan } = motor.planla(secilenler);

for (const yon of ["gelen", "giden"]) {
  const liste = bolumler[yon];
  console.log("\n" + "=".repeat(110));
  console.log(
    yon === "gelen"
      ? `MÜŞTERİ TARAFI · dağıtılmamış tahsilatlar (gelen para): ${liste.length} firma`
      : `TEDARİKÇİ TARAFI · dağıtılmamış ödemeler (giden para): ${liste.length} firma`
  );
  console.log("=".repeat(110));
  if (liste.length === 0) {
    console.log(yon === "gelen" ? "Dağıtılmamış tahsilat yok." : "Dağıtılmamış ödeme yok.");
    continue;
  }
  for (const b of liste) {
    console.log(
      `\n${firmaAdi(b.firmaId)}  [${turOf.get(b.firmaId) ?? "?"}]  ·  cari bakiye ${TL(b.bakiyeOnce)} · ` +
        `dağıtım sonrası açık kalem ${motor.acikHedefler(b.firmaId, yon).length}`
    );
    for (const { kayit: k, sinif: s, plan, not } of b.satirlar) {
      console.log(
        `  · ${gun(k.tarih)}  ${sag(s.para)}  [${s.kod}]  ${odemeSekliAdi(k)} · ${k.aciklama || "(açıklama yok)"}  (${k.id})`
      );
      console.log(`       ${s.giris}`);
      console.log(`       ${s.neden}`);
      if (s.uyari) console.log(`       DİKKAT: ${s.uyari}`);
      for (const d of plan) {
        const kalanSonra = yuvarla(d.hedefKalan - d.tutar);
        console.log(
          `       → ${(d.hedefTur === "siparis" ? "sipariş" : "kalem").padEnd(7)} ${String(d.ad).slice(0, 34).padEnd(34)} ` +
            `${sag(d.tutar)}   ${kalanSonra <= EPS ? "KAPANIYOR" : `kalan ${TL(kalanSonra)}`}`
        );
      }
      if (not) {
        console.log(`       ${not}`);
        continue;
      }
      const artan = yuvarla(s.para - plan.reduce((t, d) => t + d.tutar, 0));
      const ne =
        yon === "giden"
          ? `ödeme ${plan.length} borç kaydına taşınacak, bu kayıt çöp kutusuna gidecek (geri getirilirse para iki kez sayılır)`
          : s.bicim === "tahsilata-cevir"
            ? `tur="tahsilat", toplamTutar=0, durum="aktif", dagitim[${plan.length}]`
            : `dagitim[${plan.length}] tamamlanacak`;
      console.log(`       yazılacak: ${ne}${artan > EPS ? ` · ${TL(artan)} avansta kalacak` : ""}`);
    }
    console.log(`   firma bakiyesi: ${TL(b.bakiyeOnce)} → ${TL(motor.firmaBakiyesi(b.firmaId))}`);
  }
}

console.log("\n" + "=".repeat(110));
console.log(
  `TOPLAM · yazılacak kayıt ${yazilacak.length} · dağıtılacak para ${TL(toplamDagitilan)}` +
    (elle.length > 0 ? ` · elle bakılacak ${elle.length}` : "")
);
if (atlanan.size > 0) {
  console.log(
    "Yazılmayan kümeler: " +
      [...atlanan].map(([kod, n]) => `[${kod}] ${n}`).join(" · ") +
      (atlanan.has("PT") && !PESIN_DE ? "   ([PT] kayıtlar için --pesin-de)" : "")
  );
}
console.log("=".repeat(110));

if (!YAZ) {
  console.log(
    "\nKuru çalıştırma; hiçbir kayıt değişmedi. Uygulamak için: node scripts/dagitim-gecmis.mjs --yaz" +
      (FIRMA_ARA ? ` --firma "${FIRMA_ARA}"` : "") +
      (PESIN_DE ? " --pesin-de" : "")
  );
  process.exit(0);
}
if (yazilacak.length === 0) {
  console.log("\nYazılacak kayıt yok.");
  process.exit(0);
}

// ---- Yazma ----
const simdi = Date.now();
const islemler = [];
for (const y of yazilacak) {
  const k = y.kayit;
  if (y.bicim === "odemeye-tasi") {
    for (const d of y.plan) {
      // Ödeme yalnızca bir kasa kaydının `odemeler` dizisine taşınabilir; sipariş hedefi burada
      // yanlış koleksiyona yazmak olurdu (acikHedefler giden yönde sipariş vermiyor, bu kontrol o
      // kural ileride değişirse diye duruyor).
      if (d.hedefTur !== "kayit") {
        console.log(`! ${k.id}: taşınacak ödemenin hedefi kasa kaydı değil (${d.hedefTur} ${d.id}) — yazma durduruldu.`);
        process.exit(1);
      }
      const hedef = kayitlar.find((x) => x.id === d.id);
      if (!hedef) {
        console.log(`! ${k.id}: hedef kasa kaydı bulunamadı (${d.id}) — yazma durduruldu.`);
        process.exit(1);
      }
      const odemeler = [
        ...(hedef.odemeler ?? []),
        {
          tarih: k.tarih,
          tutar: d.tutar,
          odemeSekli: k.odemeSekli,
          ...odemeAlanlari(k.odemeSekli, k.bankaHesapId, k.kartAciklama),
          createdAt: k.createdAt ?? simdi,
        },
      ];
      const alinan = yuvarla((hedef.alinanTutar ?? 0) + d.tutar);
      islemler.push({
        ref: doc(db, "kasaKayitlari", d.id),
        veri: {
          odemeler,
          alinanTutar: alinan,
          durum: alinan >= (hedef.toplamTutar ?? 0) - EPS ? "tamamlandi" : "aktif",
          updatedAt: simdi,
        },
      });
      hedef.odemeler = odemeler;
      hedef.alinanTutar = alinan;
    }
    // Çöp Kutusu'ndan geri getirilirse para iki kez sayılır (kaydın kendi tutarı + borç
    // kalemlerine taşınan satırlar) ve geri getirme hiçbir şey sormuyor. Açıklamaya düşülen not
    // Çöp Kutusu listesinde göründüğü için uyarı oraya yazılıyor.
    const notlu = [k.aciklama, TASINDI_NOTU].filter(Boolean).join(" · ");
    islemler.push({
      ref: doc(db, "kasaKayitlari", k.id),
      veri: { aciklama: notlu, silindi: true, silinmeTarihi: simdi, updatedAt: simdi },
    });
    continue;
  }
  islemler.push({
    ref: doc(db, "kasaKayitlari", k.id),
    veri:
      y.bicim === "tahsilata-cevir"
        ? { tur: "tahsilat", toplamTutar: 0, durum: "aktif", dagitim: y.dagitim, updatedAt: simdi }
        : { dagitim: y.dagitim, updatedAt: simdi },
  });
}

for (let i = 0; i < islemler.length; i += PARTI) {
  const batch = writeBatch(db);
  for (const x of islemler.slice(i, i + PARTI)) batch.update(x.ref, x.veri);
  await batch.commit();
}
console.log(`\n${yazilacak.length} kayıt için ${islemler.length} belge güncellendi.`);

// ---- Doğrulama ----
const sonSnap = await getDocs(collection(db, "kasaKayitlari"));
const son = new Map(sonSnap.docs.map((d) => [d.id, d.data()]));
let hata = 0;
for (const y of yazilacak) {
  const k = son.get(y.kayit.id);
  if (y.bicim === "odemeye-tasi") {
    if (!k.silindi) {
      hata++;
      console.log(`! ${y.kayit.id}: ödeme kaydı çöp kutusuna gitmemiş`);
    }
    for (const d of y.plan) {
      const hedef = son.get(d.id);
      const tasinan = (hedef.odemeler ?? []).filter(
        (o) => o.tarih === y.kayit.tarih && Math.abs(o.tutar - d.tutar) < EPS
      );
      if (tasinan.length === 0) {
        hata++;
        console.log(`! ${d.id}: taşınan ödeme satırı bulunamadı (${TL(d.tutar)})`);
      }
    }
    continue;
  }
  const yazili = (k.dagitim ?? []).reduce((t, d) => t + (d.tutar ?? 0), 0);
  const beklenen = y.dagitim.reduce((t, d) => t + d.tutar, 0);
  if (Math.abs(yazili - beklenen) > 0.01) {
    hata++;
    console.log(`! ${y.kayit.id}: dağıtım toplamı ${TL(yazili)}, beklenen ${TL(beklenen)}`);
  }
  const para = k.tur === "mahsup" ? (k.toplamTutar ?? 0) : (k.alinanTutar ?? 0);
  if (yazili > para + 0.01) {
    hata++;
    console.log(`! ${y.kayit.id}: dağıtılan tutar kaydın parasını aşıyor (${TL(yazili)} > ${TL(para)})`);
  }
}
console.log(
  hata === 0
    ? "Doğrulama: bütün kayıtlar beklendiği gibi yazıldı, hiçbir dağıtım kaydın parasını aşmıyor."
    : `Doğrulama: ${hata} sorun bulundu — yedek ${yedekYolu} dosyasında duruyor.`
);
console.log("Alacaklar / Borçlar ve firma ekstrelerini kontrol et; node scripts/tutarsizlik-rapor.mjs ile de bakabilirsin.");
if (yazilacak.some((y) => y.bicim === "odemeye-tasi")) {
  console.log(
    `DİKKAT: taşınan ödeme kayıtları Çöp Kutusu'nda "${TASINDI_NOTU}" notuyla duruyor. Geri getirilirlerse ` +
      "para iki kez sayılır; 30 gün sonra kendiliğinden siliniyorlar."
  );
}
process.exit(hata === 0 ? 0 : 1);
