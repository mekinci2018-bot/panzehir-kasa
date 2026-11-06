// SALT OKUMA. Aşama 3'ün kodunu canlı verideki alan adlarına birebir uydurmak için: belirtilen
// kasa kaydını, bir firmanın siparişlerini / kayıtlarını ve koleksiyonların alan envanterini basar.
// Hiçbir şey yazmaz, hiçbir şey silmez.
//
//   node scripts/belge-oku.mjs
//   node scripts/belge-oku.mjs --kayit <belgeId> --firma "MEGA REKLAM"
//
// Ortak kasa hesabının PIN'ini sorar (KASA_PIN ortam değişkeni ile de verilebilir). Bu betiği kendi
// terminalinde çalıştır; PIN sohbete yazılmaz.
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { gizliSor } from "./_gizli-giris.mjs";
import { inMemoryPersistence, initializeAuth, signInWithEmailAndPassword } from "firebase/auth";
import { collection, doc, getDoc, getDocs, getFirestore } from "firebase/firestore";

const KASA_EMAIL = "kasa@panzehir-kasa.app";

function arg(ad, varsayilan) {
  const i = process.argv.indexOf(`--${ad}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : varsayilan;
}

const KAYIT_ID = arg("kayit", "yuHoY0je3WbXzzjCGP44");
const FIRMA_ADI = arg("firma", "MEGA REKLAM");

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

// Görsel verisi gibi uzun alanlar çıktıyı boğmasın.
function kisalt(v) {
  if (typeof v === "string" && v.length > 120) return `${v.slice(0, 60)}… (${v.length} karakter)`;
  if (Array.isArray(v)) return v.map(kisalt);
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = kisalt(x);
    return o;
  }
  return v;
}

function tipi(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return `dizi[${v.length}]`;
  return typeof v;
}

function belgeBas(id, veri) {
  console.log(`  id: ${id}`);
  for (const [k, v] of Object.entries(veri)) {
    console.log(`    ${k.padEnd(20)} ${tipi(v).padEnd(10)} ${JSON.stringify(kisalt(v))}`);
  }
}

// ---- 1) Tek kayıt ----
console.log(`\n=== kasaKayitlari/${KAYIT_ID} ===`);
const kayitSnap = await getDoc(doc(db, "kasaKayitlari", KAYIT_ID));
if (!kayitSnap.exists()) console.log("  (belge yok)");
else belgeBas(kayitSnap.id, kayitSnap.data());

// ---- 2) Firma: siparişler + kasa kayıtları ----
const [firmaSnap, kayitlarSnap, siparislerSnap] = await Promise.all([
  getDocs(collection(db, "firmalar")),
  getDocs(collection(db, "kasaKayitlari")),
  getDocs(collection(db, "siparisler")),
]);
const firmalar = firmaSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
const kayitlar = kayitlarSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
const siparisler = siparislerSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

const aranan = FIRMA_ADI.toLocaleUpperCase("tr-TR");
const firma = firmalar.find((f) => (f.ad ?? "").toLocaleUpperCase("tr-TR").includes(aranan));
console.log(`\n=== firma: ${FIRMA_ADI} ===`);
if (!firma) {
  console.log("  (firma bulunamadı)");
} else {
  belgeBas(firma.id, firma);

  const fs = siparisler.filter((s) => s.firmaId === firma.id).sort((a, b) => (a.tarih < b.tarih ? -1 : 1));
  console.log(`\n--- siparisler (${fs.length}) ---`);
  for (const s of fs) belgeBas(s.id, s);

  const fk = kayitlar
    .filter((k) => k.firmaId === firma.id || k.karsiFirmaId === firma.id || k.alanFirmaId === firma.id)
    .sort((a, b) => (a.tarih < b.tarih ? -1 : 1));
  console.log(`\n--- kasaKayitlari (${fk.length}) ---`);
  for (const k of fk) belgeBas(k.id, k);
}

// ---- 3) Alan envanteri ----
function envanter(ad, belgeler) {
  console.log(`\n=== alan envanteri: ${ad} (${belgeler.length} belge) ===`);
  const sayac = new Map();
  for (const b of belgeler) {
    for (const [k, v] of Object.entries(b)) {
      if (k === "id") continue;
      const anahtar = `${k}: ${tipi(v)}`;
      sayac.set(anahtar, (sayac.get(anahtar) ?? 0) + 1);
    }
  }
  for (const [k, n] of [...sayac.entries()].sort()) console.log(`  ${k.padEnd(34)} ${n}`);
}

envanter("kasaKayitlari", kayitlar);
envanter("siparisler", siparisler);

// tur değerleri
const turlar = new Map();
for (const k of kayitlar) turlar.set(k.tur ?? "(yok)", (turlar.get(k.tur ?? "(yok)") ?? 0) + 1);
console.log("\n=== kasaKayitlari.tur değerleri ===");
for (const [t, n] of [...turlar.entries()].sort()) console.log(`  ${String(t).padEnd(20)} ${n}`);

// dagitim (ya da benzeri) alanların yapısı
const DAGITIM_ADAYLARI = ["dagitim", "dagitimlar", "dagitimKalemleri", "odemeDagitimi"];
console.log("\n=== dağıtım alanı yapısı ===");
let bulundu = false;
for (const ad of DAGITIM_ADAYLARI) {
  const tasiyan = kayitlar.filter((k) => k[ad] !== undefined);
  if (tasiyan.length === 0) continue;
  bulundu = true;
  const kalipSayac = new Map();
  for (const k of tasiyan) {
    for (const kalem of Array.isArray(k[ad]) ? k[ad] : [k[ad]]) {
      const kalip = Object.entries(kalem ?? {})
        .map(([a, v]) => `${a}: ${tipi(v)}`)
        .sort()
        .join(", ");
      kalipSayac.set(kalip, (kalipSayac.get(kalip) ?? 0) + 1);
    }
  }
  console.log(`  ${ad}: ${tasiyan.length} belge taşıyor`);
  for (const [kalip, n] of kalipSayac) console.log(`    { ${kalip} }  × ${n}`);
  console.log("  örnekler:");
  for (const k of tasiyan.slice(0, 3)) {
    console.log(`    ${k.id} · ${k.firma} · ${k.tarih} · toplam ${k.toplamTutar} / alınan ${k.alinanTutar}`);
    console.log(`      ${JSON.stringify(kisalt(k[ad]))}`);
  }
}
if (!bulundu) console.log("  (hiçbir kayıtta dağıtım alanı yok — ev bilgisayarının betikleri bu veriye yazmamış)");

// avans / fazla ödeme adayı alanlar
const DIGER_ADAYLAR = ["avans", "avansTutari", "fazlaOdeme", "tahsilat", "dagitilmamis"];
const digerVar = DIGER_ADAYLAR.filter((ad) => kayitlar.some((k) => k[ad] !== undefined));
console.log(`\n=== diğer aday alanlar ===\n  ${digerVar.length ? digerVar.join(", ") : "(yok)"}`);

process.exit(0);
