// SALT OKUMA. Her firma için (cari bakiye) ile (siparişlerin kalan toplamı + diğer açık alacak/borç
// kalemleri) karşılaştırılır; farkı olan firmalar, fark tutarı ve nedeni listelenir. Ayrıca açık
// kalemlere dağıtılmamış para (müşteri tarafında tahsilat, tedarikçi tarafında ödeme) çıkarılır.
// Hiçbir şey yazmaz, hiçbir şey silmez; yazan betik scripts/dagitim-gecmis.mjs.
//
// ADAY KURALI (B / B2 bölümleri): `dagitim` taşımayan, firmaya bağlı, parası olan HER kayıt aday
// sayılır — `tur` ne olursa olsun, Toplam ne olursa olsun. Eski sürüm yalnızca "tur yok + Toplam =
// Alınan" kayıtlarına bakıyordu; 05.11'de Kasa'ya Toplam'ı boş bırakılarak girilmiş bir tahsilat
// (ANATOLIA REKLAM, ₺8.000) bu yüzden hiçbir bölümde görünmüyordu. Kural ve kodlar
// scripts/_dagitim-kural.mjs içinde tek yerde duruyor; bu rapor ile yazan betik aynı motoru okur.
//
//   node scripts/tutarsizlik-rapor.mjs            yalnızca bulgusu olan firmalar
//   node scripts/tutarsizlik-rapor.mjs --hepsi    hareketi olan bütün firmalar
//
// Ortak kasa hesabının PIN'ini sorar (KASA_PIN ortam değişkeni ile de verilebilir). Bu betiği kendi
// terminalinde çalıştır; PIN sohbete yazılmaz.
//
// Hesap mantığı uygulamayla birebir aynıdır: lib/dagitim.ts (tek kaynak kuralı, kayitKalani,
// avans), lib/siparis.ts (siparisHesap), lib/firma.ts (kayitBakiyesi, siparisBakiyesi) ve
// lib/kayit.ts (cariEtkileri). `dagitim` taşıyan kayıtta para yalnızca ondan sayılır; tahsilat ve
// mahsupta cari bakiyeye yalnızca dağıtılmamış kısım (avans) girer.
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { gizliSor } from "./_gizli-giris.mjs";
import { EPS, kuralMotoru } from "./_dagitim-kural.mjs";
import { inMemoryPersistence, initializeAuth, signInWithEmailAndPassword } from "firebase/auth";
import { collection, getDocs, getFirestore } from "firebase/firestore";

const KASA_EMAIL = "kasa@panzehir-kasa.app";
const HEPSI = process.argv.includes("--hepsi");

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

const TL = (n) => "₺" + new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const sag = (n, g = 16) => TL(n).padStart(g);

// ---- lib/dagitim.ts ----
// Tek kaynak kuralı: kayıt `dagitim` taşıyorsa katkı yalnızca ondan gelir, taşımıyorsa eski
// `siparisId` yolundan. Aynı para iki kez sayılmaz.
const siparisOdemeleri = new Map();
const kayitDagitimlari = new Map();
const ekle = (map, id, tutar) => map.set(id, (map.get(id) ?? 0) + tutar);
for (const k of kayitlar) {
  const isaret = k.yon === "gelen" ? 1 : -1;
  if (k.dagitim) {
    for (const d of k.dagitim) {
      if (d.hedefTur === "siparis") ekle(siparisOdemeleri, d.id, isaret * (d.tutar ?? 0));
      else if (d.hedefTur === "kayit") ekle(kayitDagitimlari, d.id, isaret * (d.tutar ?? 0));
    }
    continue;
  }
  if (k.siparisId) ekle(siparisOdemeleri, k.siparisId, isaret * (k.alinanTutar ?? 0));
}
const dagitilan = (k) => (k.dagitim ?? []).reduce((t, d) => t + (d.tutar ?? 0), 0);
const dagitilabilirTutar = (k) => (k.tur === "mahsup" ? (k.toplamTutar ?? 0) : (k.alinanTutar ?? 0));
// Dağıtılmamış kısım = avans; yalnızca tahsilat ve mahsup için anlamlı.
const avans = (k) =>
  k.tur === "tahsilat" || k.tur === "mahsup" ? Math.max(0, dagitilabilirTutar(k) - dagitilan(k)) : 0;
const kayitKalani = (k) => (k.toplamTutar ?? 0) - (k.alinanTutar ?? 0) - (kayitDagitimlari.get(k.id) ?? 0);

// ---- Dağıtılmamış para adayları ----
// Sınıflandırma tek yerde: scripts/_dagitim-kural.mjs (kodların anlamı o dosyanın başındaki
// yorumda). Rapor yalnızca "kesin / şüpheli / bilgi" ayrımını ekliyor; yazan betik
// scripts/dagitim-gecmis.mjs aynı motoru kurduğu için iki betik sessizce ayrışamaz.
//   kesin   [P0] [AV]       → dağıtılmalı; cari bakiye değişmez
//   şüpheli [PT]            → cariye hiç yansımıyor; dönüştürülürse bakiye değişir, elle onay ister
//   bilgi   [PK] [SP] [VR]  → dağıtılmayacak
const motor = kuralMotoru({ kayitlar, siparisler });
const KESIN = new Set(["P0", "AV"]);
function dagitimSinifi(k) {
  const s = motor.sinifla(k);
  if (s.kod === "--") return { kod: "--" };
  return { ...s, kesin: KESIN.has(s.kod), supheli: s.kod === "PT" };
}

// ---- lib/siparis.ts ----
function siparisHesap(s) {
  const odenen = (s.oncekiOdenen ?? 0) + (siparisOdemeleri.get(s.id) ?? 0);
  const acikKalan = (s.tutar ?? 0) - odenen;
  return { odenen, acikKalan, kalan: s.kapatildi ? 0 : Math.max(0, acikKalan) };
}
// ---- lib/firma.ts ----
const siparisBakiyesi = (s) => (s.kapatildi ? 0 : siparisHesap(s).acikKalan);
function kayitBakiyesi(k) {
  if (k.durum === "arsiv") return 0;
  const kalan = kayitKalani(k);
  return k.yon === "gelen" ? kalan : -kalan;
}

// ---- lib/kayit.ts cariEtkileri ----
// Transfer ve mahsup komisyonu hiçbir cariyi etkilemez. Tahsilatta yalnızca dağıtılmamış kısım
// (avans) bakiyeye girer; dağıtılan kısım kalemlerin kalanını düşürdüğü için orada sayılır.
// Mahsupta ödeyen tarafı aynı kuralla, alan tarafı karşıya sayılan tutarla etkilenir.
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

// ---- Firma bazında toplama ----
const adOf = new Map(firmalar.map((f) => [f.id, f.ad]));
const turOf = new Map(firmalar.map((f) => [f.id, f.tur ?? "musteri"]));
const cariler = new Map();
const al = (firmaId, ad) => {
  let c = cariler.get(firmaId);
  if (!c) {
    c = {
      firmaId,
      ad: adOf.get(firmaId) ?? ad ?? "(silinmiş firma)",
      tur: turOf.get(firmaId) ?? "?",
      bakiye: 0,
      siparisKalan: 0,
      acikGelen: 0,
      acikGiden: 0,
      acikSiparisSayisi: 0,
      fazlaOdenen: [], // siparişleri aşan ödemeler
      adaylar: [], // gelen para: dağıtılmamış tahsilat adayları (kodlu)
      odemeAdaylari: [], // giden para: dağıtılmamış ödeme adayları (kodlu)
      avanslar: [], // dağıtımı eksik kalmış tahsilat / mahsup kayıtları (A bölümünün hesabı için)
    };
    cariler.set(firmaId, c);
  }
  return c;
};

for (const s of siparisler) {
  if (!s.firmaId) continue;
  const c = al(s.firmaId, s.firmaAdi);
  const h = siparisHesap(s);
  c.bakiye += siparisBakiyesi(s);
  c.siparisKalan += h.kalan;
  if (h.kalan > EPS) c.acikSiparisSayisi += 1;
  if (h.acikKalan < -EPS) c.fazlaOdenen.push({ urun: s.urun || "Sipariş", tarih: s.tarih, fazla: -h.acikKalan });
}

for (const k of kayitlar) {
  // Bakiye etkisi tek yerden: tahsilatta avans kadar, mahsupta iki taraf, transferde hiç.
  for (const etki of cariEtkileri(k)) {
    if (!etki.firmaId) continue;
    al(etki.firmaId, etki.firmaId === k.firmaId ? k.firma : k.karsiFirma).bakiye += etki.etki;
  }
  if (!k.firmaId) continue;
  const c = al(k.firmaId, k.firma);
  const kalan = kayitKalani(k);
  if (k.durum === "aktif" && !k.tur && kalan > EPS) {
    if (k.yon === "gelen") c.acikGelen += kalan;
    else c.acikGiden += kalan;
  }
  // Dağıtımı eksik kalmış tahsilat / mahsup: parası hiçbir kaleme düşmemiş kısım.
  if (avans(k) > EPS) {
    c.avanslar.push({ id: k.id, tarih: k.tarih, tutar: avans(k), tur: k.tur, aciklama: k.aciklama || "(açıklama yok)" });
  }
  // Açık kalemlere dağıtılmamış para. Süzgeç yok: tur ne olursa olsun, Toplam ne olursa olsun
  // aday sayılır, hangi kümeye girdiği kodla yazılır (dagitimSinifi).
  const sinif = dagitimSinifi(k);
  if (sinif.kod !== "--") {
    const satir = { ...sinif, id: k.id, tarih: k.tarih, tur: k.tur, aciklama: k.aciklama || "(açıklama yok)" };
    (k.yon === "gelen" ? c.adaylar : c.odemeAdaylari).push(satir);
  }
}

// ---- Dağıtım tutarlılığı: hedefi kaybolmuş ya da tutarı aşan dağıtım satırları ----
const siparisIdleri = new Set(siparisler.map((s) => s.id));
const kayitIdleri = new Set(kayitlar.map((k) => k.id));
const bozukDagitimlar = [];
for (const k of kayitlar) {
  if (!k.dagitim) continue;
  const sorunlar = [];
  for (const d of k.dagitim) {
    const varMi = d.hedefTur === "siparis" ? siparisIdleri.has(d.id) : kayitIdleri.has(d.id);
    if (!varMi) sorunlar.push(`hedef yok: ${d.hedefTur} ${d.id} (${TL(d.tutar ?? 0)})`);
  }
  const fazla = dagitilan(k) - dagitilabilirTutar(k);
  if (fazla > 0.01) sorunlar.push(`dağıtılan tutar ${TL(fazla)} fazla`);
  if (sorunlar.length > 0) {
    bozukDagitimlar.push({ id: k.id, ad: adOf.get(k.firmaId) ?? k.firma, tarih: k.tarih, sorunlar });
  }
}

for (const c of cariler.values()) {
  c.avansToplam = c.avanslar.reduce((s, a) => s + a.tutar, 0);
  // Avans firmanın bizden alacağıdır: beklenen bakiyeden düşer.
  c.beklenen = c.siparisKalan + c.acikGelen - c.acikGiden - c.avansToplam;
  c.fark = c.bakiye - c.beklenen;
  const topla = (liste, suz) => liste.filter(suz).reduce((s, d) => s + d.para, 0);
  c.kesin = topla(c.adaylar, (d) => d.kesin); // P0 + AV: dağıtılması gereken, bakiyeyi değiştirmeyen para
  c.supheli = topla(c.adaylar, (d) => d.supheli); // PT: elle onay
  c.bilgi = topla(c.adaylar, (d) => !d.kesin && !d.supheli); // PK + SP
  c.acikToplam = c.siparisKalan + c.acikGelen;
  c.dagitilabilir = Math.min(c.kesin + c.supheli, c.acikToplam);
  c.odemeKesin = topla(c.odemeAdaylari, (d) => d.kesin);
  c.odemeSupheli = topla(c.odemeAdaylari, (d) => d.supheli);
  c.odemeBilgi = topla(c.odemeAdaylari, (d) => !d.kesin && !d.supheli);
  c.odemeDagitilabilir = Math.min(c.odemeKesin + c.odemeSupheli, c.acikGiden);
}

const hepsiListe = [...cariler.values()];
const farkliLar = hepsiListe.filter((c) => Math.abs(c.fark) > 0.01).sort((a, b) => Math.abs(b.fark) - Math.abs(a.fark));
const dagitimBekleyen = hepsiListe
  .filter((c) => c.kesin + c.supheli > EPS && c.acikToplam > EPS)
  .sort((a, b) => b.dagitilabilir - a.dagitilabilir);
const odemeBekleyen = hepsiListe
  .filter((c) => c.odemeKesin + c.odemeSupheli > EPS && c.acikGiden > EPS)
  .sort((a, b) => b.odemeDagitilabilir - a.odemeDagitilabilir);
const avansOlabilir = hepsiListe
  .filter((c) => c.kesin + c.supheli + c.odemeKesin + c.odemeSupheli > EPS)
  .filter((c) => !dagitimBekleyen.includes(c) && !odemeBekleyen.includes(c))
  .sort((a, b) => b.kesin + b.supheli - (a.kesin + a.supheli));
// Yalnızca bilgi: parası kendi kalemini kapatan [PK] ve eski yolla siparişe sayılan [SP] kayıtlar.
const bilgiOlanlar = hepsiListe.filter((c) => c.bilgi + c.odemeBilgi > EPS).sort((a, b) => b.bilgi - a.bilgi);

const toplam = (liste, alan) => liste.reduce((s, c) => s + c[alan], 0);

console.log("\n" + "=".repeat(100));
console.log("TUTARSIZLIK RAPORU (salt okuma)");
console.log("=".repeat(100));
console.log(`Firma: ${firmalar.length} · kasa kaydı: ${kayitlar.length} · sipariş: ${siparisler.length}`);
console.log(`Hareketi olan cari: ${hepsiListe.length}`);
console.log("");
console.log(`Toplam cari bakiye            : ${sag(toplam(hepsiListe, "bakiye"))}`);
console.log(`Toplam sipariş kalanı         : ${sag(toplam(hepsiListe, "siparisKalan"))}`);
console.log(`Toplam açık alacak kalemi     : ${sag(toplam(hepsiListe, "acikGelen"))}`);
console.log(`Toplam açık borç kalemi (−)   : ${sag(toplam(hepsiListe, "acikGiden"))}`);
console.log(`Toplam avans (dağıtılmamış)   : ${sag(toplam(hepsiListe, "avansToplam"))}`);
console.log(`GENEL FARK                    : ${sag(toplam(hepsiListe, "fark"))}`);
const turSayac = kayitlar.reduce((m, k) => m.set(k.tur ?? "(düz kayıt)", (m.get(k.tur ?? "(düz kayıt)") ?? 0) + 1), new Map());
console.log(`Kayıt türleri                 : ${[...turSayac].map(([t, n]) => `${t} ${n}`).join(" · ")}`);
console.log(`Dağıtım taşıyan kayıt         : ${kayitlar.filter((k) => k.dagitim).length}`);

// ---- A: bakiye ile kalemler tutmuyor ----
console.log("\n" + "-".repeat(100));
console.log(`A) BAKİYE FARKI OLAN FİRMALAR: ${farkliLar.length}`);
console.log("-".repeat(100));
if (farkliLar.length === 0) {
  console.log("Fark yok: her firmada cari bakiye = sipariş kalanı + açık kalemler.");
}
for (const c of farkliLar) {
  console.log(`\n${c.ad}  [${c.tur}]`);
  console.log(`   cari bakiye ${sag(c.bakiye)}   beklenen ${sag(c.beklenen)}   FARK ${sag(c.fark)}`);
  console.log(
    `   sipariş kalanı ${sag(c.siparisKalan)} · açık alacak ${sag(c.acikGelen)} · açık borç ${sag(c.acikGiden)} · avans ${sag(c.avansToplam)}`
  );
  if (c.fazlaOdenen.length > 0) {
    const t = c.fazlaOdenen.reduce((s, f) => s + f.fazla, 0);
    console.log(`   NEDEN: siparişleri aşan ödeme (fazla ödeme / avans), toplam ${TL(t)}:`);
    for (const f of c.fazlaOdenen) console.log(`      · ${f.tarih}  ${f.urun} → ${TL(f.fazla)} fazla`);
  } else if (c.kesin + c.supheli + c.odemeKesin + c.odemeSupheli > EPS) {
    const kodlar = [...c.adaylar, ...c.odemeAdaylari].filter((d) => d.kesin || d.supheli);
    console.log(
      `   NEDEN: açık kalemlere dağıtılmamış para ${TL(c.kesin + c.supheli + c.odemeKesin + c.odemeSupheli)} ` +
        `(${kodlar.map((d) => `[${d.kod}]`).join(" ")}) — B / B2 bölümüne bak.`
    );
  } else {
    console.log(`   NEDEN: fazla ödeme görünmüyor; kalemler elle incelenmeli.`);
  }
}

// ---- B: siparişlere dağıtılmamış tahsilatlar (Aşama 3'ün asıl kümesi) ----
console.log("\n" + "-".repeat(100));
console.log(`B) AÇIK KALEMLERE DAĞITILMAMIŞ TAHSİLATLAR (gelen para): ${dagitimBekleyen.length} firma`);
console.log("   (dagitim taşımayan her giriş / tahsilat kaydı; firmanın açık siparişi ya da açık alacak kalemi var)");
console.log("-".repeat(100));
if (dagitimBekleyen.length === 0) console.log("Dağıtım bekleyen tahsilat yok.");
for (const c of dagitimBekleyen) {
  console.log(`\n${c.ad}  [${c.tur}]`);
  console.log(
    `   açık sipariş ${String(c.acikSiparisSayisi).padStart(3)} · sipariş kalanı ${sag(c.siparisKalan)} · ` +
      `açık alacak kalemi ${sag(c.acikGelen)}`
  );
  console.log(
    `   dağıtılmamış ${sag(c.kesin)} (kesin) · ${sag(c.supheli)} (şüpheli) · dağıtılabilir ${sag(c.dagitilabilir)}`
  );
  for (const d of c.adaylar.filter((x) => x.kesin || x.supheli)) {
    console.log(`      · ${d.tarih}  ${sag(d.para)}  [${d.kod}] ${d.neden}`);
    console.log(`                        ${d.aciklama}  (${d.id})`);
  }
  const artan = c.kesin + c.supheli - c.dagitilabilir;
  if (artan > EPS) console.log(`      → ${TL(artan)} açık kalemleri aşıyor; avans olarak kalır.`);
}
console.log("\n" + "-".repeat(100));
console.log(
  `B TOPLAMI: ${TL(toplam(dagitimBekleyen, "kesin") + toplam(dagitimBekleyen, "supheli"))} dağıtılmamış tahsilat · ` +
    `${TL(toplam(dagitimBekleyen, "dagitilabilir"))} açık kalemlere dağıtılabilir`
);

// ---- B2: tedarikçi tarafı, açık borçlara dağıtılmamış ödemeler ----
console.log("\n" + "-".repeat(100));
console.log(`B2) AÇIK BORÇLARA DAĞITILMAMIŞ ÖDEMELER (giden para): ${odemeBekleyen.length} firma`);
console.log("   (dagitim taşımayan her çıkış kaydı; firmanın açık borç kalemi var)");
console.log("-".repeat(100));
if (odemeBekleyen.length === 0) console.log("Dağıtım bekleyen ödeme yok.");
for (const c of odemeBekleyen) {
  console.log(`\n${c.ad}  [${c.tur}]`);
  console.log(
    `   açık borç ${sag(c.acikGiden)} · dağıtılmamış ${sag(c.odemeKesin)} (kesin) · ${sag(c.odemeSupheli)} (şüpheli) · ` +
      `dağıtılabilir ${sag(c.odemeDagitilabilir)}`
  );
  for (const d of c.odemeAdaylari.filter((x) => x.kesin || x.supheli)) {
    console.log(`      · ${d.tarih}  ${sag(d.para)}  [${d.kod}] ${d.neden}`);
    console.log(`                        ${d.aciklama}  (${d.id})`);
  }
}
console.log("\n" + "-".repeat(100));
console.log(
  `B2 TOPLAMI: ${TL(toplam(odemeBekleyen, "odemeKesin") + toplam(odemeBekleyen, "odemeSupheli"))} dağıtılmamış ödeme · ` +
    `${TL(toplam(odemeBekleyen, "odemeDagitilabilir"))} açık borçlara dağıtılabilir`
);

// ---- C: açık siparişi olmayan, dağıtılmamış tahsilatı olanlar ----
console.log("\n" + "-".repeat(100));
console.log(`C) AÇIK KALEMİ OLMAYAN AMA DAĞITILMAMIŞ PARASI OLAN FİRMALAR: ${avansOlabilir.length}`);
console.log("   (dağıtılacak kalem yok; bilgi amaçlı — kapanmış kalemlerin tahsilatı ya da avans olabilir)");
console.log("-".repeat(100));
for (const c of avansOlabilir) {
  const t = c.kesin + c.supheli + c.odemeKesin + c.odemeSupheli;
  const kodlar = [...c.adaylar, ...c.odemeAdaylari].filter((d) => d.kesin || d.supheli).map((d) => d.kod);
  console.log(`   ${c.ad.padEnd(34)} ${sag(t)}  (${kodlar.length} kayıt: ${kodlar.join(" ")})`);
}
console.log(
  `   C toplamı: ${TL(
    toplam(avansOlabilir, "kesin") +
      toplam(avansOlabilir, "supheli") +
      toplam(avansOlabilir, "odemeKesin") +
      toplam(avansOlabilir, "odemeSupheli")
  )}`
);

// ---- C2: aday sayılan ama dağıtılmayacak kayıtlar (yalnızca bilgi) ----
console.log("\n" + "-".repeat(100));
console.log(`C2) DAĞITILMAYACAK ADAYLAR: ${bilgiOlanlar.length} firma`);
console.log("   ([PK] para kendi kalemini kapatıyor · [SP] eski yolla siparisId üzerinden sayılıyor)");
console.log("-".repeat(100));
for (const c of bilgiOlanlar) {
  const satirlar = [...c.adaylar, ...c.odemeAdaylari].filter((d) => !d.kesin && !d.supheli);
  console.log(`   ${c.ad.padEnd(34)} ${sag(c.bilgi + c.odemeBilgi)}  (${satirlar.map((d) => `[${d.kod}] ${d.tarih}`).join(" · ")})`);
}

// ---- D: dağıtım satırlarının tutarlılığı ----
console.log("\n" + "-".repeat(100));
console.log(`D) BOZUK DAĞITIM SATIRI OLAN KAYITLAR: ${bozukDagitimlar.length}`);
console.log("   (hedefi silinmiş ya da kaydın tutarını aşan dağıtım; olmaması gerekir)");
console.log("-".repeat(100));
if (bozukDagitimlar.length === 0) console.log("Bütün dağıtım satırları tutarlı.");
for (const b of bozukDagitimlar) {
  console.log(`   ${b.tarih}  ${b.ad}  (${b.id})`);
  for (const s of b.sorunlar) console.log(`      ! ${s}`);
}

if (HEPSI) {
  console.log("\n" + "-".repeat(100));
  console.log("TÜM CARİLER (bakiye · sipariş kalanı · açık alacak · açık borç · fark)");
  console.log("-".repeat(100));
  for (const c of [...hepsiListe].sort((a, b) => b.bakiye - a.bakiye)) {
    console.log(
      `   ${c.ad.padEnd(34)} ${sag(c.bakiye)} ${sag(c.siparisKalan)} ${sag(c.acikGelen)} ${sag(c.acikGiden)} ${sag(c.fark)}`
    );
  }
}

console.log("\nBu betik hiçbir veri değiştirmedi.\n");
process.exit(0);
