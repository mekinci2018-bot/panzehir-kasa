// Ekim 2026 tarihli ve üretim durumu "Bitti" olan siparişlerin hepsini "Teslim Edildi" yapar.
// Kasım ve sonrasına dokunmaz. Her çalıştırmada (kuru ya da gerçek) önce "siparisler" koleksiyonunun
// o anki halini import/ klasörüne yedekler.
//
//   node scripts/siparis-ekim-teslim.mjs            kuru çalıştırma: kaç sipariş değişecek, dokunmaz
//   node scripts/siparis-ekim-teslim.mjs --yaz      yedekten sonra uygular, Ekim sekme sayılarını yazdırır
//
// Ortak kasa hesabının PIN'ini sorar (KASA_PIN ortam değişkeni ile de verilebilir). Bu betiği kendi
// terminalinde çalıştır; PIN burada sohbete yazılmaz.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { initializeApp } from "firebase/app";
import { inMemoryPersistence, initializeAuth, signInWithEmailAndPassword } from "firebase/auth";
import { collection, doc, getDocs, getFirestore, writeBatch } from "firebase/firestore";

const AY = "2026-10";
const KASA_EMAIL = "kasa@panzehir-kasa.app";
const YAZ = process.argv.includes("--yaz");

// .env.local, Next tarafından otomatik yükleniyor; bağımsız çalışan bu betik elle okuyor.
// Windows'ta dosya CRLF ve baştaki BOM içerebilir; ikisi de değerlere karışmasın diye temizlenir.
function envOku() {
  let icerik = readFileSync(".env.local", "utf8");
  if (icerik.charCodeAt(0) === 0xfeff) icerik = icerik.slice(1); // UTF-8 BOM
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
const apiKey = env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "";
console.log(`API anahtarı: "${apiKey.slice(0, 6)}..." (${apiKey.length} karakter)`);
const app = initializeApp({
  apiKey,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
});
// Node'da tarayıcı depolaması yok; oturum sadece bu çalışma boyunca bellekte tutulur.
const auth = initializeAuth(app, { persistence: inMemoryPersistence });
const db = getFirestore(app);

let pin = process.env.KASA_PIN;
if (!pin) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  pin = await rl.question("Kasa PIN: ");
  rl.close();
}
await signInWithEmailAndPassword(auth, KASA_EMAIL, pin);

const siparisSnap = await getDocs(collection(db, "siparisler"));
const kayitSnap = await getDocs(collection(db, "kasaKayitlari"));

const siparisler = siparisSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => !s.silindi);
const kayitlar = kayitSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((k) => !k.silindi);

// lib/siparis.ts siparisOdemeleri/siparisHesap ile aynı mantık.
const odemeler = new Map();
for (const k of kayitlar) {
  if (!k.siparisId) continue;
  odemeler.set(k.siparisId, (odemeler.get(k.siparisId) ?? 0) + (k.yon === "gelen" ? k.alinanTutar : -k.alinanTutar));
}
function kalanHesapla(s) {
  const odenen = (s.oncekiOdenen ?? 0) + (odemeler.get(s.id) ?? 0);
  if (s.kapatildi) return 0;
  return Math.max(0, s.tutar - odenen);
}

const ekimdeMi = (s) => (s.tarih ?? "").slice(0, 7) === AY;
const ekimSiparisleri = siparisler.filter(ekimdeMi);
const hedefler = ekimSiparisleri.filter((s) => s.uretim === "bitti");

function sekmeSayilari(list) {
  let bitti = 0, teslim = 0, teslimOdenmedi = 0;
  for (const s of list) {
    if (s.uretim === "bitti") bitti++;
    if (s.uretim === "teslim") {
      teslim++;
      if (kalanHesapla(s) > 0.005) teslimOdenmedi++;
    }
  }
  return { bitti, teslim, teslimOdenmedi };
}

// Önce yedek: "siparisler" koleksiyonunun o anki tam hali (kuru çalıştırmada da alınır).
mkdirSync("import", { recursive: true });
const tarihEtiketi = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const saatEtiketi = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Istanbul",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
}).format(new Date()).replace(/:/g, "");
const yedekYolu = `import/yedek-SIPARISLER-TESLIM-ONCESI-${tarihEtiketi}-${saatEtiketi}.json`;
writeFileSync(
  yedekYolu,
  JSON.stringify({ olusturma: new Date().toISOString(), siparisler: Object.fromEntries(siparisSnap.docs.map((d) => [d.id, d.data()])) })
);
console.log(`Yedek alındı: ${yedekYolu}`);

console.log(`\nEkim 2026: ${ekimSiparisleri.length} sipariş.`);
console.log(`"Bitti" → "Teslim Edildi" olacak: ${hedefler.length} sipariş.`);
const once = sekmeSayilari(ekimSiparisleri);
console.log(`Şu an  → Bitti ${once.bitti}, Teslim Edildi ${once.teslim}, Teslim Edildi · Parası Alınmadı ${once.teslimOdenmedi}`);

if (!YAZ) {
  console.log("\nKuru çalıştırma; hiçbir sipariş değişmedi. Uygulamak için: node scripts/siparis-ekim-teslim.mjs --yaz");
  process.exit(0);
}
if (hedefler.length === 0) {
  console.log("\nDeğişecek sipariş yok.");
  process.exit(0);
}

const PARCA = 450; // Firestore toplu yazma sınırı
for (let i = 0; i < hedefler.length; i += PARCA) {
  const batch = writeBatch(db);
  for (const s of hedefler.slice(i, i + PARCA)) {
    batch.update(doc(db, "siparisler", s.id), { uretim: "teslim", updatedAt: Date.now() });
  }
  await batch.commit();
}
console.log(`\n${hedefler.length} sipariş "Teslim Edildi" yapıldı.`);

const hedefIdleri = new Set(hedefler.map((s) => s.id));
const guncel = ekimSiparisleri.map((s) => (hedefIdleri.has(s.id) ? { ...s, uretim: "teslim" } : s));
const sonra = sekmeSayilari(guncel);
console.log(`Sonra  → Bitti ${sonra.bitti}, Teslim Edildi ${sonra.teslim}, Teslim Edildi · Parası Alınmadı ${sonra.teslimOdenmedi}`);

process.exit(0);
