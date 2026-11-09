// Dönemi henüz bitmemiş otomatik hak ediş satırlarını bulur ve (istenirse) siler. Yeni kural
// (lib/personel.ts): hak ediş **dönem sonunda** yazılır — haftalık dönemde Cumartesi, aylık dönemde
// ayın son günü. Eski kural dönemin başında yazdığı için kalan hafta / ay başında erken şişiyordu;
// bu betik eski kuralla yazılmış, dönemi hâlâ sürmekte olan satırları temizler.
//
// Hedef yalnızca `tur: "hakedis"` ve `donem` taşıyan satırlar (otomatik yazılanlar). Elle girilen
// hak ediş, mesai, ek, kesinti ve ödemelere dokunulmaz. Dönemi bitmiş satırlar da silinmez.
//
//   node scripts/hakedis-bitmemis-donem.mjs            kuru çalıştırma: ne silinecek, kalan ne kadar düşecek
//   node scripts/hakedis-bitmemis-donem.mjs --yaz      yedekten sonra siler ve doğrular
//
// Her çalıştırmada (kuru ya da gerçek) önce `personelHareketleri` ve `calisanlar` koleksiyonlarının
// tam hali import/ klasörüne yedeklenir; silinen satırlar yalnızca o yedekte kalır.
//
// Silinen dönemler uygulama tarafından bir daha yazılmaz: dönem bitince (Cumartesi / ayın son günü)
// yeniden ve bu kez doğru tarihle yazılacaktır.
//
// Kalan yeniden hesaplanmaz (ödemeler `personelId` taşıyan Kasa kayıtlarında; uygulama kalanı zaten
// gösteriyor). Betik "bu personelin kalanı şu kadar azalacak" der.
//
// Ortak kasa hesabının PIN'ini sorar (KASA_PIN ortam değişkeni ile de verilebilir). Bu betiği kendi
// terminalinde çalıştır; PIN sohbete yazılmaz.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { gizliSor } from "./_gizli-giris.mjs";
import { inMemoryPersistence, initializeAuth, signInWithEmailAndPassword } from "firebase/auth";
import { collection, doc, getDocs, getFirestore, writeBatch } from "firebase/firestore";

const KASA_EMAIL = "kasa@panzehir-kasa.app";
const YAZ = process.argv.includes("--yaz");
const PARTI = 400; // writeBatch sınırı 500

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
const gun = (iso) => (iso ? iso.split("-").reverse().join(".") : "?");
const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

// ---- Dönem yardımcıları: lib/personel.ts ile birebir aynı ----
function isoOf(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function gunEkle(iso, g) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + g);
  return isoOf(d);
}

function donemBasi(donem) {
  return donem.startsWith("h") ? donem.slice(1) : `${donem.slice(1)}-01`;
}

// Hak edişin yazılması gereken gün: haftalık dönemde Cumartesi, aylık dönemde ayın son günü.
function donemHakEdisGunu(donem) {
  if (donem.startsWith("h")) return gunEkle(donem.slice(1), 5);
  const [yil, ay] = donem.slice(1).split("-").map(Number);
  return isoOf(new Date(yil, ay, 0));
}

function donemEtiketi(donem) {
  if (!donem.startsWith("h")) {
    const [yil, ay] = donem.slice(1).split("-").map(Number);
    return `${AYLAR[ay - 1]} ${yil}`;
  }
  return `${gun(donemBasi(donem))}–${gun(gunEkle(donemBasi(donem), 6))} haftası`;
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

const [calisanSnap, hareketSnap] = await Promise.all([
  getDocs(collection(db, "calisanlar")),
  getDocs(collection(db, "personelHareketleri")),
]);
const calisanlar = calisanSnap.docs
  .map((d) => ({ id: d.id, ...d.data() }))
  .sort((a, b) => String(a.adSoyad ?? "").localeCompare(String(b.adSoyad ?? ""), "tr"));
const hareketler = hareketSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

// ---- Yedek (kuru çalıştırmada da alınır) ----
mkdirSync("import", { recursive: true });
const simdi = new Date();
const bugun = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(simdi);
const saat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Istanbul",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
})
  .format(simdi)
  .replace(/:/g, "");
const yedekYolu = `import/yedek-HAKEDIS-BITMEMIS-ONCESI-${bugun}-${saat}.json`;
writeFileSync(
  yedekYolu,
  JSON.stringify({
    olusturma: simdi.toISOString(),
    calisanlar: Object.fromEntries(calisanSnap.docs.map((d) => [d.id, d.data()])),
    personelHareketleri: Object.fromEntries(hareketSnap.docs.map((d) => [d.id, d.data()])),
  })
);
console.log(`Yedek alındı: ${yedekYolu} (${calisanSnap.size} personel, ${hareketSnap.size} hareket)`);
console.log("Silinen satırlar yalnızca bu yedekte kalacak — dosyayı güvenli bir yerde tut.\n");

// ---- Sınıflandırma ----
const silinecek = []; // dönemi bitmemiş otomatik hak edişler
const erkenTarihli = []; // dönemi bitmiş ama tarihi dönem başında kalmış satırlar (yalnızca bilgi)
let toplam = 0;

console.log("=".repeat(104));
console.log(`DÖNEMİ BİTMEMİŞ OTOMATİK HAK EDİŞLER · bugün ${gun(bugun)} (Türkiye saati)`);
console.log("Yeni kural: haftalık hak ediş Cumartesi, aylık hak ediş ayın son günü yazılır.");
console.log("=".repeat(104));

for (const c of calisanlar) {
  const otomatik = hareketler
    .filter((h) => h.personelId === c.id && h.tur === "hakedis" && h.donem)
    .sort((a, b) => (donemBasi(a.donem) < donemBasi(b.donem) ? -1 : 1));
  if (otomatik.length === 0) continue;

  const bitmemis = otomatik.filter((h) => donemHakEdisGunu(h.donem) > bugun);
  const kaymis = otomatik.filter((h) => donemHakEdisGunu(h.donem) <= bugun && h.tarih !== donemHakEdisGunu(h.donem));
  erkenTarihli.push(...kaymis);
  if (bitmemis.length === 0) continue;

  console.log(
    `\n${String(c.adSoyad ?? "(ad yok)")}  ·  ${c.maasTuru === "haftalik" ? "Haftalık" : "Aylık"} ` +
      `${TL(Number(c.maasTutari ?? 0))}${c.pasif ? "  ·  PASİF" : ""}`
  );
  for (const h of bitmemis) {
    const tutar = Number(h.tutar ?? 0);
    toplam += tutar;
    silinecek.push(h);
    console.log(
      `  ${String(h.donem).padEnd(12)} ${donemEtiketi(h.donem).padEnd(26)} ${sag(tutar)}   ` +
        `yazılı tarih ${gun(h.tarih)} → dönem sonu ${gun(donemHakEdisGunu(h.donem))} (henüz gelmedi)   belge ${h.id}`
    );
  }
  const dusus = bitmemis.reduce((s, h) => s + Number(h.tutar ?? 0), 0);
  console.log(`  → silinecek ${bitmemis.length} satır, ${sag(dusus)} · bu personelin KALANI bu kadar azalacak`);
}

console.log("\n" + "=".repeat(104));
console.log(`TOPLAM · silinecek satır: ${silinecek.length}  ·  tutar ${sag(toplam)}`);
console.log(`Personel borcu toplamı bu tutar kadar azalacak: ${TL(toplam)}`);
if (erkenTarihli.length > 0) {
  const tarihler = erkenTarihli.length;
  console.log(
    `\nBilgi: dönemi bitmiş ${tarihler} satırın tarihi eski kuralla dönem BAŞINA yazılmış ` +
      `(yeni kuralda dönem sonu olurdu). Tutarlar ve kalan doğru; yalnızca ekstredeki satır tarihi ve ` +
      `yürüyen bakiyenin sırası farklı. Bu betik onlara dokunmuyor — istenirse ayrı bir adımda düzeltilir.`
  );
}
console.log("=".repeat(104));

if (!YAZ) {
  console.log("\nKuru çalıştırma; hiçbir satır silinmedi. Uygulamak için: node scripts/hakedis-bitmemis-donem.mjs --yaz");
  process.exit(0);
}
if (silinecek.length === 0) {
  console.log("\nSilinecek satır yok.");
  process.exit(0);
}

for (let i = 0; i < silinecek.length; i += PARTI) {
  const batch = writeBatch(db);
  for (const h of silinecek.slice(i, i + PARTI)) batch.delete(doc(db, "personelHareketleri", h.id));
  await batch.commit();
}
console.log(`\n${silinecek.length} otomatik hak ediş satırı silindi.`);

// ---- Doğrulama ----
const sonSnap = await getDocs(collection(db, "personelHareketleri"));
const kalanlar = silinecek.filter((h) => sonSnap.docs.some((d) => d.id === h.id));
console.log(
  kalanlar.length === 0
    ? "Doğrulama: silinen satırların hiçbiri veritabanında kalmadı."
    : `Doğrulama: ${kalanlar.length} satır hâlâ duruyor (betiği tekrar çalıştır).`
);
const hala = sonSnap.docs.filter((d) => {
  const h = d.data();
  return h.tur === "hakedis" && h.donem && donemHakEdisGunu(h.donem) > bugun;
});
console.log(
  hala.length === 0
    ? "Doğrulama: dönemi bitmemiş otomatik hak ediş kalmadı."
    : `Doğrulama: ${hala.length} satırın dönemi hâlâ bitmemiş (betiği tekrar çalıştır).`
);
console.log("Dönem bitince (Cumartesi / ayın son günü) uygulama bu dönemleri doğru tarihle yeniden yazacak.");
process.exit(0);
