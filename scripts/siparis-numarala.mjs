// Mevcut siparişlere, tarih sırasına göre 1001'den başlayan "Sipariş No" atar (zaten numarası
// olanlara dokunmaz). Sayaç belgesini (sistem/siparisSayaci) da son atanan numaraya ayarlar, böylece
// yeni siparişler bu numaradan devam eder (bkz. lib/db.ts addSiparis).
//
//   node scripts/siparis-numarala.mjs            kuru çalıştırma: kaç sipariş numaralanacak, dokunmaz
//   node scripts/siparis-numarala.mjs --yaz      yedekten sonra uygular
//
// Ortak kasa hesabının PIN'ini sorar (KASA_PIN ortam değişkeni ile de verilebilir). Bu betiği kendi
// terminalinde çalıştır; PIN burada sohbete yazılmaz.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { inMemoryPersistence, initializeAuth, signInWithEmailAndPassword } from "firebase/auth";
import { collection, doc, getDocs, getFirestore, writeBatch } from "firebase/firestore";
import { gizliSor } from "./_gizli-giris.mjs";

const KASA_EMAIL = "kasa@panzehir-kasa.app";
const YAZ = process.argv.includes("--yaz");
const BASLANGIC = 1000; // ilk numaralanan sipariş 1001 olur

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

const pin = process.env.KASA_PIN ?? (await gizliSor("Kasa PIN (gizli): "));
await signInWithEmailAndPassword(auth, KASA_EMAIL, pin);

const siparisSnap = await getDocs(collection(db, "siparisler"));
const tumSiparisler = siparisSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
const siparisler = tumSiparisler.filter((s) => !s.silindi);

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
const yedekYolu = `import/yedek-SIPARISLER-NUMARALAMA-ONCESI-${tarihEtiketi}-${saatEtiketi}.json`;
writeFileSync(
  yedekYolu,
  JSON.stringify({ olusturma: new Date().toISOString(), siparisler: Object.fromEntries(siparisSnap.docs.map((d) => [d.id, d.data()])) })
);
console.log(`Yedek alındı: ${yedekYolu}`);

const numarasiz = siparisler.filter((s) => !s.siparisNo);
const numarali = siparisler.filter((s) => s.siparisNo);
const enYuksekMevcut = numarali.reduce((m, s) => Math.max(m, s.siparisNo), BASLANGIC);

// Tarihe göre eski->yeni; aynı tarihte oluşturulma sırasına göre (Excel aktarımındaki satır sırası).
const siraliNumarasiz = [...numarasiz].sort((a, b) => (a.tarih === b.tarih ? a.createdAt - b.createdAt : a.tarih < b.tarih ? -1 : 1));

console.log(`\nToplam sipariş: ${siparisler.length} (silinmiş olanlar hariç)`);
console.log(`Zaten numaralı: ${numarali.length}, numarası atanacak: ${siraliNumarasiz.length}`);
if (siraliNumarasiz.length > 0) {
  const ilk = siraliNumarasiz[0];
  const son = siraliNumarasiz[siraliNumarasiz.length - 1];
  console.log(`İlk atanacak: #${enYuksekMevcut + 1} · ${ilk.tarih} · ${ilk.firmaAdi}`);
  console.log(`Son atanacak: #${enYuksekMevcut + siraliNumarasiz.length} · ${son.tarih} · ${son.firmaAdi}`);
}

if (!YAZ) {
  console.log("\nKuru çalıştırma; hiçbir sipariş değişmedi. Uygulamak için: node scripts/siparis-numarala.mjs --yaz");
  process.exit(0);
}
if (siraliNumarasiz.length === 0) {
  console.log("\nNumaralanacak sipariş yok.");
  process.exit(0);
}

const PARCA = 450; // Firestore toplu yazma sınırı
let sonNo = enYuksekMevcut;
for (let i = 0; i < siraliNumarasiz.length; i += PARCA) {
  const batch = writeBatch(db);
  for (const s of siraliNumarasiz.slice(i, i + PARCA)) {
    sonNo += 1;
    batch.update(doc(db, "siparisler", s.id), { siparisNo: sonNo, updatedAt: Date.now() });
  }
  await batch.commit();
}
// Sayaç, yeni siparişlerin bu numaradan devam etmesi için son atanan numaraya ayarlanır.
const sayacBatch = writeBatch(db);
sayacBatch.set(doc(db, "sistem", "siparisSayaci"), { son: sonNo });
await sayacBatch.commit();

console.log(`\n${siraliNumarasiz.length} siparişe numara atandı (#${enYuksekMevcut + 1} – #${sonNo}).`);
console.log(`Sayaç (sistem/siparisSayaci) #${sonNo} olarak ayarlandı; yeni sipariş #${sonNo + 1} olacak.`);

process.exit(0);
