// SALT OKUMA. Aşama 3'ün ilk adımı: her firma için (cari bakiye) ile (siparişlerin kalan toplamı +
// diğer açık alacak/borç kalemleri) karşılaştırılır; farkı olan firmalar, fark tutarı ve nedeni
// listelenir. Ayrıca siparişlere hiç bağlanmamış tahsilatlar (düz Kasa Girişleri) çıkarılır —
// Aşama 3'te dağıtılacak küme budur. Hiçbir şey yazmaz, hiçbir şey silmez.
//
//   node scripts/tutarsizlik-rapor.mjs            yalnızca bulgusu olan firmalar
//   node scripts/tutarsizlik-rapor.mjs --hepsi    hareketi olan bütün firmalar
//
// Ortak kasa hesabının PIN'ini sorar (KASA_PIN ortam değişkeni ile de verilebilir). Bu betiği kendi
// terminalinde çalıştır; PIN sohbete yazılmaz.
//
// Hesap mantığı uygulamayla birebir aynıdır: lib/siparis.ts (siparisOdemeleri, siparisHesap) ve
// lib/firma.ts (kayitBakiyesi, siparisBakiyesi, cariOzetleri).
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { gizliSor } from "./_gizli-giris.mjs";
import { inMemoryPersistence, initializeAuth, signInWithEmailAndPassword } from "firebase/auth";
import { collection, getDocs, getFirestore } from "firebase/firestore";

const KASA_EMAIL = "kasa@panzehir-kasa.app";
const HEPSI = process.argv.includes("--hepsi");
const EPS = 0.005;

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

// ---- lib/siparis.ts ----
const siparisOdemeleri = new Map();
for (const k of kayitlar) {
  if (!k.siparisId) continue;
  const d = (k.yon === "gelen" ? 1 : -1) * (k.alinanTutar ?? 0);
  siparisOdemeleri.set(k.siparisId, (siparisOdemeleri.get(k.siparisId) ?? 0) + d);
}
function siparisHesap(s) {
  const odenen = (s.oncekiOdenen ?? 0) + (siparisOdemeleri.get(s.id) ?? 0);
  const acikKalan = (s.tutar ?? 0) - odenen;
  return { odenen, acikKalan, kalan: s.kapatildi ? 0 : Math.max(0, acikKalan) };
}
// ---- lib/firma.ts ----
const siparisBakiyesi = (s) => (s.kapatildi ? 0 : siparisHesap(s).acikKalan);
function kayitBakiyesi(k) {
  if (k.durum === "arsiv") return 0;
  const kalan = (k.toplamTutar ?? 0) - (k.alinanTutar ?? 0);
  return k.yon === "gelen" ? kalan : -kalan;
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
      dagitilmamis: [], // siparişe bağlanmamış düz Kasa Girişleri
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
  if (!k.firmaId) continue;
  const c = al(k.firmaId, k.firma);
  c.bakiye += kayitBakiyesi(k);
  const kalan = (k.toplamTutar ?? 0) - (k.alinanTutar ?? 0);
  if (k.durum === "aktif" && kalan > EPS) {
    if (k.yon === "gelen") c.acikGelen += kalan;
    else c.acikGiden += kalan;
  }
  // Siparişe bağlanmamış, peşin alınmış gibi duran tahsilat: toplamTutar = alinanTutar olduğu için
  // ekstrede borç + alacak satırı birbirini sıfırlıyor, cari bakiyeye hiç etki etmiyor.
  const tam = Math.abs((k.toplamTutar ?? 0) - (k.alinanTutar ?? 0)) < EPS;
  if (k.yon === "gelen" && !k.siparisId && tam && (k.alinanTutar ?? 0) > EPS && k.kaynak !== "veresiye") {
    c.dagitilmamis.push({ id: k.id, tarih: k.tarih, tutar: k.alinanTutar, aciklama: k.aciklama || "(açıklama yok)" });
  }
}

for (const c of cariler.values()) {
  c.beklenen = c.siparisKalan + c.acikGelen - c.acikGiden;
  c.fark = c.bakiye - c.beklenen;
  c.dagitilmamisToplam = c.dagitilmamis.reduce((s, d) => s + d.tutar, 0);
  c.dagitilabilir = Math.min(c.dagitilmamisToplam, c.siparisKalan);
}

const hepsiListe = [...cariler.values()];
const farkliLar = hepsiListe.filter((c) => Math.abs(c.fark) > 0.01).sort((a, b) => Math.abs(b.fark) - Math.abs(a.fark));
const dagitimBekleyen = hepsiListe
  .filter((c) => c.dagitilmamisToplam > EPS && c.siparisKalan > EPS)
  .sort((a, b) => b.dagitilabilir - a.dagitilabilir);
const avansOlabilir = hepsiListe
  .filter((c) => c.dagitilmamisToplam > EPS && c.siparisKalan <= EPS)
  .sort((a, b) => b.dagitilmamisToplam - a.dagitilmamisToplam);

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
console.log(`GENEL FARK                    : ${sag(toplam(hepsiListe, "fark"))}`);

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
  console.log(`   sipariş kalanı ${sag(c.siparisKalan)} · açık alacak ${sag(c.acikGelen)} · açık borç ${sag(c.acikGiden)}`);
  if (c.fazlaOdenen.length > 0) {
    const t = c.fazlaOdenen.reduce((s, f) => s + f.fazla, 0);
    console.log(`   NEDEN: siparişleri aşan ödeme (fazla ödeme / avans), toplam ${TL(t)}:`);
    for (const f of c.fazlaOdenen) console.log(`      · ${f.tarih}  ${f.urun} → ${TL(f.fazla)} fazla`);
  } else {
    console.log(`   NEDEN: fazla ödeme görünmüyor; kalemler elle incelenmeli.`);
  }
}

// ---- B: siparişlere dağıtılmamış tahsilatlar (Aşama 3'ün asıl kümesi) ----
console.log("\n" + "-".repeat(100));
console.log(`B) SİPARİŞLERE DAĞITILMAMIŞ TAHSİLATLAR: ${dagitimBekleyen.length} firma`);
console.log("   (düz Kasa Girişi olarak girilmiş, siparişe bağlanmamış tahsilatlar; firmanın açık siparişi var)");
console.log("-".repeat(100));
if (dagitimBekleyen.length === 0) console.log("Dağıtım bekleyen tahsilat yok.");
for (const c of dagitimBekleyen) {
  console.log(`\n${c.ad}  [${c.tur}]`);
  console.log(
    `   açık sipariş ${String(c.acikSiparisSayisi).padStart(3)} · sipariş kalanı ${sag(c.siparisKalan)} · ` +
      `dağıtılmamış tahsilat ${sag(c.dagitilmamisToplam)} · dağıtılabilir ${sag(c.dagitilabilir)}`
  );
  for (const d of c.dagitilmamis) console.log(`      · ${d.tarih}  ${sag(d.tutar)}  ${d.aciklama}`);
  const artan = c.dagitilmamisToplam - c.dagitilabilir;
  if (artan > EPS) console.log(`      → ${TL(artan)} siparişleri aşıyor; avans / alacak bakiyesi olarak kalır.`);
}
console.log("\n" + "-".repeat(100));
console.log(
  `B TOPLAMI: ${TL(toplam(dagitimBekleyen, "dagitilmamisToplam"))} dağıtılmamış tahsilat · ` +
    `${TL(toplam(dagitimBekleyen, "dagitilabilir"))} siparişlere dağıtılabilir`
);

// ---- C: açık siparişi olmayan, dağıtılmamış tahsilatı olanlar ----
console.log("\n" + "-".repeat(100));
console.log(`C) AÇIK SİPARİŞİ OLMAYAN AMA SİPARİŞE BAĞLANMAMIŞ TAHSİLATI OLAN FİRMALAR: ${avansOlabilir.length}`);
console.log("   (dağıtılacak sipariş yok; bilgi amaçlı — kapanmış siparişlerin tahsilatı ya da avans olabilir)");
console.log("-".repeat(100));
for (const c of avansOlabilir) {
  console.log(`   ${c.ad.padEnd(34)} ${sag(c.dagitilmamisToplam)}  (${c.dagitilmamis.length} kayıt)`);
}
console.log(`   C toplamı: ${TL(toplam(avansOlabilir, "dagitilmamisToplam"))}`);

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
