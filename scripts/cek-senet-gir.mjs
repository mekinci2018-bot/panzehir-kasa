// Notlardaki ÖDENMEMİŞ çek / senetleri Borçlar'a vade tarihli borç kaydı olarak girer.
// Ödenmiş olanlar listede yok. Her çalıştırmada (kuru ya da gerçek) önce "kasaKayitlari" ve
// "firmalar" koleksiyonlarının o anki halini import/ klasörüne yedekler.
//
//   node scripts/cek-senet-gir.mjs            kuru çalıştırma: ne yazılacak, hiçbir şeye dokunmaz
//   node scripts/cek-senet-gir.mjs --yaz      yedekten sonra uygular ve sonucu doğrular
//
// Ortak kasa hesabının PIN'ini sorar (KASA_PIN ortam değişkeni ile de verilebilir). Bu betiği kendi
// terminalinde çalıştır; PIN sohbete yazılmaz.
//
// Belge kimlikleri vade + belge no'dan türetilir ("vadeli-erhan-senturk-2026-11-06-6001176"), bu
// yüzden betik ikinci kez çalıştırılsa da aynı çek / senet ikinci kez yazılmaz.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { gizliSor } from "./_gizli-giris.mjs";
import { inMemoryPersistence, initializeAuth, signInWithEmailAndPassword } from "firebase/auth";
import { collection, doc, getDocs, getFirestore, writeBatch } from "firebase/firestore";

const KASA_EMAIL = "kasa@panzehir-kasa.app";
const YAZ = process.argv.includes("--yaz");

// Notlardan alınan ödenmemiş belgeler. ERHAN ŞENTÜRK'ün ödenmiş 2 çeki bilerek listeye alınmadı.
const BELGELER = [
  { firmaArama: "ERHAN", tur: "Çek", no: "6001176", banka: "İŞ BANKASI", tutar: 75000, vade: "2026-11-06" },
  { firmaArama: "ERHAN", tur: "Çek", no: "6001177", banka: "İŞ BANKASI", tutar: 90000, vade: "2026-11-20" },
  { firmaArama: "MC LED", tur: "Senet", tutar: 68500, vade: "2026-10-30" },
  { firmaArama: "MC LED", tur: "Senet", tutar: 68500, vade: "2026-11-13" },
  { firmaArama: "MC LED", tur: "Senet", tutar: 68500, vade: "2026-11-27" },
  { firmaArama: "MC LED", tur: "Senet", tutar: 68500, vade: "2026-12-11" },
  { firmaArama: "MC LED", tur: "Senet", tutar: 68500, vade: "2026-12-25" },
  { firmaArama: "MC LED", tur: "Senet", tutar: 68500, vade: "2027-01-15" },
  { firmaArama: "MC LED", tur: "Senet", tutar: 68500, vade: "2027-01-29" },
];

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
const kayitlar = kayitSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

const TL = (n) => "₺" + new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const bugun = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());

// ---- Yedek (kuru çalıştırmada da alınır) ----
mkdirSync("import", { recursive: true });
const saat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Istanbul",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
})
  .format(new Date())
  .replace(/:/g, "");
const yedekYolu = `import/yedek-CEK-SENET-ONCESI-${bugun}-${saat}.json`;
writeFileSync(
  yedekYolu,
  JSON.stringify({
    olusturma: new Date().toISOString(),
    kasaKayitlari: Object.fromEntries(kayitSnap.docs.map((d) => [d.id, d.data()])),
    firmalar: Object.fromEntries(firmaSnap.docs.map((d) => [d.id, d.data()])),
  })
);
console.log(`Yedek alındı: ${yedekYolu} (${kayitSnap.size} kasa kaydı, ${firmaSnap.size} firma)\n`);

// ---- Firma eşleştirme: her arama tek bir firmaya düşmeli ----
const KATLAMA = { Ç: "C", Ğ: "G", İ: "I", Ö: "O", Ş: "S", Ü: "U", Â: "A", Î: "I", Û: "U" };
const slug = (ad) =>
  ad
    .toLocaleUpperCase("tr-TR")
    .replace(/[ÇĞİÖŞÜÂÎÛ]/g, (c) => KATLAMA[c])
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

const firmaOf = new Map();
for (const arama of [...new Set(BELGELER.map((b) => b.firmaArama))]) {
  const adaylar = firmalar.filter((f) => (f.ad ?? "").toLocaleUpperCase("tr-TR").includes(arama));
  if (adaylar.length !== 1) {
    console.error(`DURDU: "${arama}" aramasına ${adaylar.length} firma uyuyor:`);
    for (const a of adaylar) console.error(`   · ${a.ad} (${a.id}, tür: ${a.tur ?? "musteri"})`);
    console.error("Betikteki firmaArama değerini netleştirip tekrar çalıştır. Hiçbir şey yazılmadı.");
    process.exit(1);
  }
  firmaOf.set(arama, adaylar[0]);
  const f = adaylar[0];
  console.log(`Eşleşen firma: "${arama}" → ${f.ad}  [${f.id}, tür: ${f.tur ?? "musteri"}]`);
}

// ---- Yazılacak kayıtlar ----
const simdi = Date.now();
const yazilacak = [];
const atlanan = [];

for (const b of BELGELER) {
  const firma = firmaOf.get(b.firmaArama);
  const id = ["vadeli", slug(firma.ad), b.vade, b.no].filter(Boolean).join("-");
  const aciklama = [b.tur, b.no ? `No ${b.no}` : null, b.banka].filter(Boolean).join(" · ");

  // Aynı belge daha önce girilmiş mi? Hem belge kimliğine hem de (firma + vade + tutar) üçlüsüne bakılır.
  const ayniId = kayitlar.find((k) => k.id === id);
  const ayniKalem = kayitlar.find(
    (k) =>
      !k.silindi &&
      k.firmaId === firma.id &&
      k.yon === "giden" &&
      k.vadeTarihi === b.vade &&
      Math.abs((k.toplamTutar ?? 0) - b.tutar) < 0.005
  );
  if (ayniId || ayniKalem) {
    atlanan.push({ ...b, firma, id, sebep: ayniId ? "aynı belge kimliği zaten var" : "aynı firma/vade/tutar kaydı zaten var" });
    continue;
  }

  yazilacak.push({
    id,
    veri: {
      tarih: bugun, // kaydın girildiği gün; vade ayrı alanda. Böylece kayıt bu ayın Borçlar listesinde görünür.
      ay: bugun.slice(0, 7),
      firma: firma.ad,
      firmaId: firma.id,
      aciklama,
      toplamTutar: b.tutar,
      alinanTutar: 0,
      odemeSekli: "nakit", // ödeme yapılmadı; ödeme şekli "Ödendi olarak işaretle" sırasında seçilecek
      yon: "giden",
      durum: "aktif",
      kaynak: "veresiye", // uygulamadaki "Yeni Borç" ile aynı; Kasa satırından gelmedi
      vadeTarihi: b.vade,
      createdAt: simdi,
      updatedAt: simdi,
    },
  });
}

console.log(`\nYazılacak kayıt: ${yazilacak.length} · atlanan: ${atlanan.length}`);
console.log("-".repeat(96));
for (const y of yazilacak) {
  const gecmis = y.veri.vadeTarihi < bugun ? "  ← vadesi geçmiş" : "";
  console.log(
    `  ${y.veri.firma.padEnd(22)} vade ${y.veri.vadeTarihi}  ${TL(y.veri.toplamTutar).padStart(14)}  ${y.veri.aciklama}${gecmis}`
  );
}
console.log("-".repeat(96));

const firmaToplamlari = new Map();
for (const y of yazilacak) {
  firmaToplamlari.set(y.veri.firma, (firmaToplamlari.get(y.veri.firma) ?? 0) + y.veri.toplamTutar);
}
for (const [ad, t] of firmaToplamlari) console.log(`  ${ad}: ${TL(t)}`);
const genelToplam = yazilacak.reduce((s, y) => s + y.veri.toplamTutar, 0);
console.log(`  GENEL TOPLAM: ${TL(genelToplam)}`);

for (const a of atlanan) console.log(`\n  atlandı → ${a.firma.ad} · vade ${a.vade} · ${TL(a.tutar)} (${a.sebep})`);

if (!YAZ) {
  console.log("\nKuru çalıştırma; hiçbir kayıt yazılmadı. Uygulamak için: node scripts/cek-senet-gir.mjs --yaz");
  process.exit(0);
}
if (yazilacak.length === 0) {
  console.log("\nYazılacak yeni kayıt yok.");
  process.exit(0);
}

const batch = writeBatch(db);
for (const y of yazilacak) batch.set(doc(db, "kasaKayitlari", y.id), y.veri);
await batch.commit();
console.log(`\n${yazilacak.length} vade tarihli borç kaydı yazıldı (${TL(genelToplam)}).`);

// ---- Doğrulama: Firestore'dan yeniden oku ----
const sonSnap = await getDocs(collection(db, "kasaKayitlari"));
const son = sonSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((k) => !k.silindi);
console.log("\nDoğrulama (Firestore'dan yeniden okundu):");
for (const firma of new Set([...firmaOf.values()])) {
  const acik = son.filter(
    (k) => k.firmaId === firma.id && k.yon === "giden" && k.durum === "aktif" && k.toplamTutar - k.alinanTutar > 0.005
  );
  const vadeli = acik.filter((k) => k.vadeTarihi);
  const toplam = acik.reduce((s, k) => s + (k.toplamTutar - k.alinanTutar), 0);
  console.log(`  ${firma.ad}: ${acik.length} açık borç kalemi (${vadeli.length} vade tarihli) · ${TL(toplam)}`);
}
const tumVadeli = son.filter(
  (k) => k.yon === "giden" && k.durum === "aktif" && k.vadeTarihi && k.toplamTutar - k.alinanTutar > 0.005
);
console.log(
  `  Tüm vade tarihli açık borçlar: ${tumVadeli.length} kalem · ${TL(
    tumVadeli.reduce((s, k) => s + (k.toplamTutar - k.alinanTutar), 0)
  )}`
);

process.exit(0);
