// Personel kayıtlarından kaldırılan kişisel alanları veritabanından da siler: tcKimlikNo, telefon,
// adres, acilDurumKisisi, acilTelefon, not. (Aşama 4: bu veriler artık uygulamada tutulmuyor.)
// Her çalıştırmada (kuru ya da gerçek) önce "calisanlar" koleksiyonunun tam halini import/ klasörüne
// yedekler — silinen alanlar yalnızca o yedekte kalır.
//
//   node scripts/personel-alan-temizle.mjs            kuru çalıştırma: hangi kayıttan ne silinecek
//   node scripts/personel-alan-temizle.mjs --yaz      yedekten sonra uygular ve sonucu doğrular
//
// Ortak kasa hesabının PIN'ini sorar (KASA_PIN ortam değişkeni ile de verilebilir). Bu betiği kendi
// terminalinde çalıştır; PIN sohbete yazılmaz.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { gizliSor } from "./_gizli-giris.mjs";
import { inMemoryPersistence, initializeAuth, signInWithEmailAndPassword } from "firebase/auth";
import { collection, deleteField, doc, getDocs, getFirestore, writeBatch } from "firebase/firestore";

const KASA_EMAIL = "kasa@panzehir-kasa.app";
const YAZ = process.argv.includes("--yaz");
const SILINECEK = ["tcKimlikNo", "telefon", "adres", "acilDurumKisisi", "acilTelefon", "not"];

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

const snap = await getDocs(collection(db, "calisanlar"));
const calisanlar = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

// ---- Yedek (kuru çalıştırmada da alınır) ----
mkdirSync("import", { recursive: true });
const tarih = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const saat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Istanbul",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
})
  .format(new Date())
  .replace(/:/g, "");
const yedekYolu = `import/yedek-PERSONEL-ALAN-ONCESI-${tarih}-${saat}.json`;
writeFileSync(
  yedekYolu,
  JSON.stringify({ olusturma: new Date().toISOString(), calisanlar: Object.fromEntries(snap.docs.map((d) => [d.id, d.data()])) })
);
console.log(`Yedek alındı: ${yedekYolu} (${snap.size} personel kaydı)`);
console.log("Silinen alanlar yalnızca bu yedekte kalacak — dosyayı güvenli bir yerde tut.\n");

const hedefler = calisanlar
  .map((c) => ({ c, alanlar: SILINECEK.filter((a) => c[a] !== undefined) }))
  .filter((x) => x.alanlar.length > 0);

console.log(`Personel: ${calisanlar.length} · temizlenecek kayıt: ${hedefler.length}`);
console.log("-".repeat(90));
for (const { c, alanlar } of hedefler) {
  // Değerler ekrana basılmaz (kişisel veri); yalnızca hangi alanın dolu olduğu gösterilir.
  const dolu = alanlar.filter((a) => String(c[a] ?? "").trim() !== "");
  console.log(
    `  ${(c.adSoyad ?? "(ad yok)").padEnd(28)} silinecek alan: ${alanlar.join(", ")}` +
      (dolu.length ? `  (dolu: ${dolu.join(", ")})` : "  (hepsi boş)")
  );
}
console.log("-".repeat(90));

if (!YAZ) {
  console.log("\nKuru çalıştırma; hiçbir alan silinmedi. Uygulamak için: node scripts/personel-alan-temizle.mjs --yaz");
  process.exit(0);
}
if (hedefler.length === 0) {
  console.log("\nSilinecek alan yok.");
  process.exit(0);
}

const batch = writeBatch(db);
for (const { c, alanlar } of hedefler) {
  batch.update(doc(db, "calisanlar", c.id), Object.fromEntries(alanlar.map((a) => [a, deleteField()])));
}
await batch.commit();
console.log(`\n${hedefler.length} personel kaydından kişisel alanlar silindi.`);

// ---- Doğrulama ----
const sonSnap = await getDocs(collection(db, "calisanlar"));
const kalan = sonSnap.docs.filter((d) => SILINECEK.some((a) => d.data()[a] !== undefined));
console.log(
  kalan.length === 0
    ? "Doğrulama: hiçbir personel kaydında bu alanlardan hiçbiri kalmadı."
    : `Doğrulama: ${kalan.length} kayıtta hâlâ alan var (tekrar çalıştır).`
);
process.exit(0);
