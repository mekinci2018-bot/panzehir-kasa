// Devreden tutarıyla ÇİFT SAYILAN otomatik hak edişleri bulur ve (istenirse) siler. Hedef yalnızca
// `tur: "hakedis"` ve `donem` taşıyan satırlar — yani otomatik yazılanlar. Elle girilen hak ediş,
// mesai, ek ve kesinti satırlarına dokunulmaz.
//
// Kural (uygulamadaki `uretilecekDonemler` ile aynı): otomatik hak ediş yalnızca devreden
// tarihinden SONRAKİ dönemler için yazılır. Devreden tarihinin içinde kaldığı dönem devredene
// dahildir, ondan önceki dönemler de devredenin içindedir. Bu betik o iki kümeyi listeler:
//
//   A · devreden öncesi    dönem tamamen devreden tarihinden önce bitmiş
//   B · devreden içinde    devreden tarihi dönemin içine düşüyor (dönem başı < devreden ≤ dönem sonu)
//   C · devreden sonrası   dönem başı ≥ devreden tarihi — meşru, dokunulmaz (yalnızca sayısı yazılır)
//
//   node scripts/hakedis-devreden-temizle.mjs            kuru çalıştırma: ne silinecek, kalan ne kadar düşecek
//   node scripts/hakedis-devreden-temizle.mjs --yaz      yedekten sonra A + B satırlarını siler ve doğrular
//
// Her çalıştırmada (kuru ya da gerçek) önce `personelHareketleri` koleksiyonunun tam hali
// import/ klasörüne yedeklenir; silinen satırlar yalnızca o yedekte kalır.
//
// Kalan yeniden hesaplanmaz (ödemeler `personelId` taşıyan Kasa kayıtlarında; uygulama onu zaten
// gösteriyor). Betik yalnızca "bu personelin kalanı şu kadar azalacak" der; Personel sayfasındaki
// kalandan bu tutarı çıkarınca yeni kalan bulunur.
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
const EPS = 0.005;
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
const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

// ---- Dönem yardımcıları: lib/personel.ts ile birebir aynı ----
function isoOf(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function gunEkle(iso, gun) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + gun);
  return isoOf(d);
}

function donemBasi(donem) {
  return donem.startsWith("h") ? donem.slice(1) : `${donem.slice(1)}-01`;
}

function donemSonu(donem) {
  if (donem.startsWith("h")) return gunEkle(donem.slice(1), 6);
  const [y, a] = donem.slice(1).split("-").map(Number);
  return isoOf(new Date(y, a, 0)); // ayın son günü
}

function donemEtiketi(donem) {
  if (!donem.startsWith("h")) {
    const [y, a] = donem.slice(1).split("-").map(Number);
    return `${AYLAR[a - 1]} ${y}`;
  }
  const gun = (iso) => iso.split("-").reverse().join(".");
  return `${gun(donemBasi(donem))}–${gun(donemSonu(donem))} haftası`;
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
const yedekYolu = `import/yedek-HAKEDIS-ONCESI-${tarih}-${saat}.json`;
writeFileSync(
  yedekYolu,
  JSON.stringify({
    olusturma: new Date().toISOString(),
    calisanlar: Object.fromEntries(calisanSnap.docs.map((d) => [d.id, d.data()])),
    personelHareketleri: Object.fromEntries(hareketSnap.docs.map((d) => [d.id, d.data()])),
  })
);
console.log(`Yedek alındı: ${yedekYolu} (${calisanSnap.size} personel, ${hareketSnap.size} hareket)`);
console.log("Silinen satırlar yalnızca bu yedekte kalacak — dosyayı güvenli bir yerde tut.\n");

// ---- Sınıflandırma ----
const silinecek = []; // { c, h, kume }
const tarihsizler = []; // devreden tarihi girilmemiş, sınıflandırılamayan personel
let toplamA = 0;
let toplamB = 0;

console.log("=".repeat(100));
console.log("OTOMATİK HAK EDİŞLER · devreden tarihine göre");
console.log("=".repeat(100));

for (const c of calisanlar) {
  const otomatik = hareketler
    .filter((h) => h.personelId === c.id && h.tur === "hakedis" && h.donem)
    .sort((a, b) => (donemBasi(a.donem) < donemBasi(b.donem) ? -1 : 1));
  if (otomatik.length === 0) continue;

  const devreden = typeof c.devredenTarihi === "string" && c.devredenTarihi.trim() ? c.devredenTarihi.trim() : null;
  const devredenTutar = Number(c.devredenAlacak ?? 0);
  const ad = String(c.adSoyad ?? "(ad yok)");
  const basliklar =
    `${ad}  ·  ${c.maasTuru === "haftalik" ? "Haftalık" : "Aylık"} ${TL(Number(c.maasTutari ?? 0))}` +
    `  ·  devreden ${TL(devredenTutar)}${devreden ? ` (${devreden.split("-").reverse().join(".")} itibarıyla)` : " · TARİH YOK"}` +
    (c.pasif ? "  ·  PASİF" : "");
  console.log(`\n${basliklar}`);

  if (!devreden) {
    tarihsizler.push({ c, adet: otomatik.length, toplam: otomatik.reduce((s, h) => s + Number(h.tutar ?? 0), 0) });
    console.log(
      `  ! Devreden tarihi girilmemiş; hangi dönemlerin devredene dahil olduğu bilinemiyor. ` +
        `${otomatik.length} otomatik hak ediş satırı sınıflandırılmadı, silinmeyecek.`
    );
    continue;
  }

  const kumeler = { A: [], B: [], C: [] };
  for (const h of otomatik) {
    const bas = donemBasi(h.donem);
    const son = donemSonu(h.donem);
    const kume = son < devreden ? "A" : bas < devreden ? "B" : "C";
    kumeler[kume].push(h);
    if (kume !== "C") silinecek.push({ c, h, kume });
  }

  for (const kume of ["A", "B"]) {
    for (const h of kumeler[kume]) {
      const tutar = Number(h.tutar ?? 0);
      if (kume === "A") toplamA += tutar;
      else toplamB += tutar;
      console.log(
        `  ${kume === "A" ? "A · devreden öncesi" : "B · devreden içinde "}  ${String(h.donem).padEnd(12)} ` +
          `${donemEtiketi(h.donem).padEnd(26)} ${sag(tutar)}   (tarih ${h.tarih ?? "?"}, belge ${h.id})`
      );
    }
  }

  const dusus = [...kumeler.A, ...kumeler.B].reduce((s, h) => s + Number(h.tutar ?? 0), 0);
  if (dusus > EPS) {
    console.log(
      `  → silinecek ${kumeler.A.length + kumeler.B.length} satır, ${sag(dusus)} · bu personelin KALANI bu kadar azalacak` +
        `  (devreden sonrası ${kumeler.C.length} satır dokunulmuyor)`
    );
  } else {
    console.log(`  ✓ devreden tutarıyla çakışan otomatik hak ediş yok (devreden sonrası ${kumeler.C.length} satır).`);
  }
  if (devredenTutar <= EPS && dusus > EPS) {
    console.log(
      `  ! DİKKAT: devreden tutarı ${TL(devredenTutar)} — bu satırlar silinirse yerine hiçbir şey gelmez, ` +
        `gerçek bir borç varsa kaybolur. Silmeden önce bu personeli ayrıca düşün.`
    );
  }
}

console.log("\n" + "=".repeat(100));
console.log(
  `TOPLAM · silinecek satır: ${silinecek.length}  ·  A (devreden öncesi) ${sag(toplamA)}  ·  ` +
    `B (devreden içinde) ${sag(toplamB)}  ·  genel ${sag(toplamA + toplamB)}`
);
console.log(`Personel borcu toplamı bu tutar kadar azalacak: ${TL(toplamA + toplamB)}`);
if (tarihsizler.length > 0) {
  console.log(
    `Devreden tarihi girilmemiş ${tarihsizler.length} personel sınıflandırılamadı ` +
      `(${tarihsizler.map((t) => t.c.adSoyad).join(", ")}) — tarihi girildikten sonra betik tekrar çalıştırılmalı.`
  );
}
console.log("=".repeat(100));

if (!YAZ) {
  console.log("\nKuru çalıştırma; hiçbir satır silinmedi. Uygulamak için: node scripts/hakedis-devreden-temizle.mjs --yaz");
  process.exit(0);
}
if (silinecek.length === 0) {
  console.log("\nSilinecek satır yok.");
  process.exit(0);
}

for (let i = 0; i < silinecek.length; i += PARTI) {
  const batch = writeBatch(db);
  for (const { h } of silinecek.slice(i, i + PARTI)) batch.delete(doc(db, "personelHareketleri", h.id));
  await batch.commit();
}
console.log(`\n${silinecek.length} otomatik hak ediş satırı silindi.`);

// ---- Doğrulama ----
const sonSnap = await getDocs(collection(db, "personelHareketleri"));
const kalanlar = silinecek.filter(({ h }) => sonSnap.docs.some((d) => d.id === h.id));
console.log(
  kalanlar.length === 0
    ? "Doğrulama: silinecek satırların hiçbiri veritabanında kalmadı."
    : `Doğrulama: ${kalanlar.length} satır hâlâ duruyor (betiği tekrar çalıştır).`
);
console.log(
  "Not: uygulama bir daha bu dönemleri yazmaz — otomatik hak ediş devreden tarihinden sonraki " +
    "dönemlerden başlıyor (lib/personel.ts, uretilecekDonemler)."
);
process.exit(0);
