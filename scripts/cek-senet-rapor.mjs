// Salt okuma: JOKERLED ve ERHAN ŞENTÜRK (ve notunda çek / senet geçen diğer firmaların) tedarikçi
// bakiyesini ve firma notunu yan yana yazdırır. Hiçbir şey yazmaz, hiçbir şey silmez.
//
//   node scripts/cek-senet-rapor.mjs
//
// Ortak kasa hesabının PIN'ini sorar (KASA_PIN ortam değişkeni ile de verilebilir). Bu betiği kendi
// terminalinde çalıştır; PIN sohbete yazılmaz.
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { gizliSor } from "./_gizli-giris.mjs";
import { inMemoryPersistence, initializeAuth, signInWithEmailAndPassword } from "firebase/auth";
import { collection, getDocs, getFirestore } from "firebase/firestore";

const KASA_EMAIL = "kasa@panzehir-kasa.app";
const ARANAN = ["JOKERLED", "ERHAN"]; // ad içinde geçmesi yeterli

// .env.local'i elle oku (Windows'ta BOM ve CRLF temizlenir).
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

const [firmaSnap, kayitSnap] = await Promise.all([
  getDocs(collection(db, "firmalar")),
  getDocs(collection(db, "kasaKayitlari")),
]);
const firmalar = firmaSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((f) => !f.silindi);
const kayitlar = kayitSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((k) => !k.silindi);

const TL = (n) => "₺" + new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const notluCekSenet = (f) => /çek|cek|senet/i.test(f.not ?? "");
const secilen = firmalar.filter((f) => ARANAN.some((a) => (f.ad ?? "").includes(a)) || notluCekSenet(f));

console.log(`\nFirma sayısı: ${firmalar.length} · kasa kaydı: ${kayitlar.length}`);
console.log(`Rapora giren firma: ${secilen.length} (adı aranan ya da notunda çek/senet geçen)\n`);

for (const f of secilen) {
  const kendi = kayitlar.filter((k) => k.firmaId === f.id);
  const acikBorc = kendi.filter((k) => k.yon === "giden" && k.durum === "aktif" && k.toplamTutar - k.alinanTutar > 0.005);
  const acikAlacak = kendi.filter((k) => k.yon === "gelen" && k.durum === "aktif" && k.toplamTutar - k.alinanTutar > 0.005);
  const borcToplam = acikBorc.reduce((s, k) => s + (k.toplamTutar - k.alinanTutar), 0);

  console.log("=".repeat(78));
  console.log(`${f.ad}   [tür: ${f.tur ?? "musteri"}${f.pasif ? ", pasif" : ""}]`);
  console.log("=".repeat(78));
  console.log(`Kayıt sayısı: ${kendi.length} · açık borç kalemi: ${acikBorc.length} · açık alacak kalemi: ${acikAlacak.length}`);
  console.log(`AÇIK BORÇ (devir bakiyesi dahil) TOPLAMI: ${TL(borcToplam)}`);
  for (const k of acikBorc) {
    const kalan = k.toplamTutar - k.alinanTutar;
    console.log(
      `   · ${k.tarih}  ${TL(kalan).padStart(16)}  ${k.vadeTarihi ? `vade ${k.vadeTarihi}  ` : ""}${k.aciklama || "(açıklama yok)"}` +
        `${k.kaynak ? `  [${k.kaynak}]` : ""}`
    );
  }
  if (acikAlacak.length > 0) {
    console.log(`   (bu firmada açık alacak da var: ${TL(acikAlacak.reduce((s, k) => s + (k.toplamTutar - k.alinanTutar), 0))})`);
  }
  console.log("\n--- FİRMA NOTU (olduğu gibi) ---");
  console.log(f.not ? f.not : "(not boş)");
  console.log("--- NOT SONU ---\n");
}

console.log("Bu betik hiçbir veri değiştirmedi.\n");
process.exit(0);
