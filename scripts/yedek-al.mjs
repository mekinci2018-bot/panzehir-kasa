// Full Firestore backup (images and sub-collections included) to import/yedek-ONCESI-YYYY-AA-GG.json,
// in the app's backup format (lib/yedekBicimi.ts) so Ayarlar can restore it. Sub-collections are
// keyed by their path ("firmalar/abc/notlar"), which db.collection() accepts on restore.
//
//   FIREBASE_SERVICE_ACCOUNT_DOSYASI=<service account key .json> node scripts/yedek-al.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const anahtarYolu = process.env.FIREBASE_SERVICE_ACCOUNT_DOSYASI;
if (!anahtarYolu) throw new Error("FIREBASE_SERVICE_ACCOUNT_DOSYASI tanımlı değil.");
const db = getFirestore(initializeApp({ credential: cert(JSON.parse(readFileSync(anahtarYolu, "utf8"))) }));

// Same as zamanDuzle in lib/yedekBicimi.ts: timestamps become { __zaman: ms }.
function zamanDuzle(deger) {
  if (Array.isArray(deger)) return deger.map(zamanDuzle);
  if (deger && typeof deger === "object") {
    if (typeof deger.toMillis === "function") return { __zaman: deger.toMillis() };
    return Object.fromEntries(Object.entries(deger).map(([k, v]) => [k, zamanDuzle(v)]));
  }
  return deger;
}

const koleksiyonlar = {};
async function koleksiyonOku(ref) {
  const snap = await ref.get();
  koleksiyonlar[ref.path] = Object.fromEntries(snap.docs.map((d) => [d.id, zamanDuzle(d.data())]));
  // listDocuments also finds "missing" parents that only hold sub-collections.
  for (const doc of await ref.listDocuments()) {
    for (const alt of await doc.listCollections()) await koleksiyonOku(alt);
  }
}
for (const ref of await db.listCollections()) await koleksiyonOku(ref);

const tarih = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const veri = { uygulama: "panzehir-kasa", surum: 1, olusturma: new Date().toISOString(), gorsellerDahil: true, koleksiyonlar };
mkdirSync("import", { recursive: true });
const yol = `import/yedek-ONCESI-${tarih}.json`;
const json = JSON.stringify(veri);
writeFileSync(yol, json);

console.log(`Yedek: ${yol} (${(Buffer.byteLength(json) / 1024 / 1024).toFixed(2)} MB)`);
for (const [ad, docs] of Object.entries(koleksiyonlar)) console.log(`  ${ad}: ${Object.keys(docs).length}`);
