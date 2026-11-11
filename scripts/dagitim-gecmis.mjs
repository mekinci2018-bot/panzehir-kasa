// Geçmiş veri: dağıtılmamış tahsilatları / ödemeleri açık kalemlere dağıtır, gider ve peşin
// kayıtlarını harcamaya çevirir.
//
// Aşama 3 (dağıtım, commit e32a67c) 06.11.2026'da geldi. Ondan önce girilen "firmadan para alındı /
// firmaya para verildi" kayıtları düz Kasa Girişi / Çıkışı olarak yazıldı: `tur` yok, `dagitim` yok.
// Para cari bakiyeye yansıyor (firma ekstresi doğru çıkıyor) ama hiçbir kaleme düşmediği için
// Alacaklar / Borçlar'da kalemler tam tutarla duruyor.
//
// 11.11.2026'da kuru çalıştırma okunup kurallar şöyle karara bağlandı:
//   · Gider kalemine yapılan ödeme HER ZAMAN harcamadır, asla avans olmaz → [GD] Toplam = Peşin.
//     Gider kalemine yazılmış tahsilat kaydı kasa düzeltmesidir: `tur` alanı da kaldırılır.
//     Türü "gider" olup açık borcu (devir / veresiye) olan firma otomatik tedarikçi sayılır.
//   · Açık borcu olmayan tedarikçiye Toplam boş ödeme peşin alıştır → [PA] Toplam = Peşin.
//   · Tedarikçi ödemesi borç kaydına TAŞINMAZ; kasa kaydı yerinde kalır, `dagitim` ile bağlanır.
//   · [PT] (Toplam = Peşin) kayıtlar doğrudur, dokunulmaz. Avans yalnızca Ödeme Al / Yap
//     penceresinde açık kalemleri aşan tutar girildiğinde oluşur.
//
//   node scripts/dagitim-gecmis.mjs                      kuru çalıştırma: bütün firmalar
//   node scripts/dagitim-gecmis.mjs --firma "ANATOLIA"   yalnızca o firma + kayıtların TÜM alanları
//   node scripts/dagitim-gecmis.mjs --yaz                yedekten sonra üç grubu da yazar ve doğrular
//
// `--yaz` üç grubu birlikte uygular (dökümde ayrı ayrı görünürler):
//   1. FİRMA TÜRÜ   — aşağıdaki TUR_DEGISIMI listesi düzeltilir (bu, 2. ve 3. grubu etkiler)
//   2. DAĞITIM      — [P0] ve [AV]: kayda tur="tahsilat" + `dagitim` yazılır, HEDEFE DOKUNULMAZ
//   3. PEŞİNE ÇEVİRME — [GD] ve [PA]: toplamTutar = alinanTutar, durum "tamamlandi"
//
// Aday kuralları, kodların anlamı ve ne yazıldığı scripts/_dagitim-kural.mjs başındaki yorumda.
//
// Her çalıştırmada (kuru ya da gerçek) `firmalar`, `kasaKayitlari` ve `siparisler` koleksiyonlarının
// tam hali import/ klasörüne yedeklenir.
//
// Ortak kasa hesabının PIN'ini sorar (KASA_PIN ortam değişkeni ile de verilebilir). Bu betiği kendi
// terminalinde çalıştır; PIN sohbete yazılmaz.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { gizliSor } from "./_gizli-giris.mjs";
import { EPS, kuralMotoru, odemeSekliAdi, yuvarla } from "./_dagitim-kural.mjs";
import { inMemoryPersistence, initializeAuth, signInWithEmailAndPassword } from "firebase/auth";
import { collection, deleteField, doc, getDocs, getFirestore, writeBatch } from "firebase/firestore";

const KASA_EMAIL = "kasa@panzehir-kasa.app";
const YAZ = process.argv.includes("--yaz");
const FIRMA_ARA = (() => {
  const i = process.argv.indexOf("--firma");
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1].toLocaleUpperCase("tr") : null;
})();
const PARTI = 400; // writeBatch sınırı 500

// Türü elle düzeltilecek firmalar (11.11.2026 kararı). Gider kalemine yapılan ödeme harcamadır,
// cari bakiyesi sıfır olmalı; yemek firmalarının ise devir borcu var, onlar tedarikçi. `id` varsa
// eşleşme ondan yapılır, yoksa addan — isim karşılaştırması tire / boşluk farklarına takılmasın
// diye harf ve rakam dışındaki her şey atılarak.
const TUR_DEGISIMI = [
  { ad: "MUSTAFA EKİNCİ - KREDİ KARTI ÖDEMELERİ", tur: "gider" },
  { ad: "ALİ AKIN ŞAHSİ", tur: "gider" },
  { id: "zJSu01hp9CyDHpeVKoaR", ad: "ALKAN YEMEK", tur: "tedarikci" },
  { id: "u5Rj5lJqneDUCXK4KnXE", ad: "OKUYAN CATRİNG", tur: "tedarikci" },
];
const siki = (ad) =>
  String(ad ?? "")
    .toLocaleUpperCase("tr")
    .replace(/[^0-9A-ZÇĞİÖŞÜ]/g, "");

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
const gun = (iso) => (iso ? String(iso).split("-").reverse().join(".") : "?");
const anlik = (ms) =>
  ms
    ? new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" }).format(
        new Date(ms)
      )
    : "?";

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

const oku = async () => {
  const [firmaSnap, kayitSnap, siparisSnap] = await Promise.all([
    getDocs(collection(db, "firmalar")),
    getDocs(collection(db, "kasaKayitlari")),
    getDocs(collection(db, "siparisler")),
  ]);
  return { firmaSnap, kayitSnap, siparisSnap };
};
const { firmaSnap, kayitSnap, siparisSnap } = await oku();
const firmalar = firmaSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((f) => !f.silindi);
const kayitlar = kayitSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((k) => !k.silindi);
const siparisler = siparisSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => !s.silindi);

// ---- Yedek (kuru çalıştırmada da alınır) ----
mkdirSync("import", { recursive: true });
const simdiMs = new Date();
const bugun = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(simdiMs);
const saat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Istanbul",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
})
  .format(simdiMs)
  .replace(/:/g, "");
const yedekYolu = `import/yedek-DAGITIM-ONCESI-${bugun}-${saat}.json`;
writeFileSync(
  yedekYolu,
  JSON.stringify({
    olusturma: simdiMs.toISOString(),
    firmalar: Object.fromEntries(firmaSnap.docs.map((d) => [d.id, d.data()])),
    kasaKayitlari: Object.fromEntries(kayitSnap.docs.map((d) => [d.id, d.data()])),
    siparisler: Object.fromEntries(siparisSnap.docs.map((d) => [d.id, d.data()])),
  })
);
console.log(`Yedek alındı: ${yedekYolu} (${kayitSnap.size} kayıt, ${siparisSnap.size} sipariş)`);

// ---- Firma listesi ----
const adOf = new Map(firmalar.map((f) => [f.id, f.ad]));
const firmaAdi = (id) => adOf.get(id) ?? "(silinmiş firma)";
const firmaIdleri = [...new Set(kayitlar.filter((k) => k.firmaId).map((k) => k.firmaId))];
const secilenler = (
  FIRMA_ARA ? firmaIdleri.filter((id) => firmaAdi(id).toLocaleUpperCase("tr").includes(FIRMA_ARA)) : firmaIdleri
).sort((a, b) => firmaAdi(a).localeCompare(firmaAdi(b), "tr"));

if (FIRMA_ARA && secilenler.length === 0) {
  console.log(`\n"${FIRMA_ARA}" ile eşleşen, kasa kaydı olan firma yok.`);
  process.exit(1);
}

// ---- BÖLÜM 0 · firma türü değişikliği ----
// Türler sınıflandırmayı etkilediği için önce uygulanır (kuru çalıştırmada yalnızca bellekte).
const firmaTurleri = new Map(firmalar.map((f) => [f.id, f.tur ?? "musteri"]));
const turYazilacak = [];
const turBulunamayan = [];
console.log("\n" + "=".repeat(110));
console.log("BÖLÜM 0 · FİRMA TÜRÜ DÜZELTMESİ");
console.log("=".repeat(110));
for (const istek of TUR_DEGISIMI) {
  const eslesen = istek.id
    ? firmalar.filter((f) => f.id === istek.id)
    : firmalar.filter((f) => siki(f.ad) === siki(istek.ad));
  if (eslesen.length !== 1) {
    turBulunamayan.push(istek.ad);
    console.log(`! "${istek.ad}" için ${eslesen.length} firma eşleşti — türü değiştirilmeyecek.`);
    const ipucu = firmalar.filter((f) => siki(f.ad).includes(siki(istek.ad).slice(0, 8)));
    for (const f of ipucu.slice(0, 6)) console.log(`    benzer: "${f.ad}" [${f.tur ?? "musteri"}] (${f.id})`);
    continue;
  }
  const f = eslesen[0];
  const eski = f.tur ?? "musteri";
  if (siki(f.ad) !== siki(istek.ad)) console.log(`    not: "${istek.ad}" kimliğiyle eşleşen firmanın adı "${f.ad}"`);
  if (eski === istek.tur) {
    console.log(`  · ${f.ad}: zaten ${istek.tur}, değişiklik yok (${f.id})`);
    continue;
  }
  firmaTurleri.set(f.id, istek.tur);
  turYazilacak.push({ id: f.id, ad: f.ad, eski, tur: istek.tur });
  console.log(`  · ${f.ad}: ${eski} → ${istek.tur}  (${f.id})`);
}
if (turYazilacak.length === 0 && turBulunamayan.length === 0) console.log("  Değişecek firma türü yok.");

const motor = kuralMotoru({ kayitlar, siparisler, firmaTurleri });
const turAdi = (id) => motor.etkinTuru(id);

// Türü "gider" olup açık borcu olan firmalar tedarikçi gibi işlenir (motor etkinTuru); hangi
// firmalarda bu kural devreye girdiği görünsün.
const otomatikTedarikci = secilenler.filter((id) => firmaTurleri.get(id) === "gider" && motor.etkinTuru(id) === "tedarikci");
if (otomatikTedarikci.length > 0) {
  console.log("\n  Türü gider ama açık borcu olduğu için TEDARİKÇİ gibi işlenenler (firma türü yazılmaz):");
  for (const id of otomatikTedarikci) console.log(`    · ${firmaAdi(id)}  (${id})`);
}

// ---- Alan dökümü (yalnızca --firma ile) ----
if (FIRMA_ARA) {
  for (const firmaId of secilenler) {
    console.log("\n" + "=".repeat(110));
    console.log(`ALAN DÖKÜMÜ · ${firmaAdi(firmaId)}  [${turAdi(firmaId)}]  (${firmaId})`);
    console.log("=".repeat(110));
    const kendi = kayitlar
      .filter((k) => k.firmaId === firmaId || k.karsiFirmaId === firmaId)
      .sort((a, b) => (a.tarih === b.tarih ? (a.createdAt ?? 0) - (b.createdAt ?? 0) : a.tarih < b.tarih ? -1 : 1));
    const kendiSiparis = siparisler.filter((s) => s.firmaId === firmaId).sort((a, b) => (a.tarih < b.tarih ? -1 : 1));

    console.log(`\nSİPARİŞLER (${kendiSiparis.length})`);
    for (const s of kendiSiparis) {
      const h = motor.siparisHesap(s);
      console.log(
        `\n  ${gun(s.tarih)}  ${s.urun || "(ürün yok)"}  No ${s.siparisNo ?? "—"}  (${s.id})\n` +
          `     tutar ${sag(s.tutar ?? 0)} · ödenen ${sag(h.odenen)} · KALAN ${sag(h.kalan)}${s.kapatildi ? " · KAPATILDI" : ""}`
      );
      console.log("     " + JSON.stringify(s));
    }

    console.log(`\nKASA KAYITLARI (${kendi.length})`);
    for (const k of kendi) {
      const s = motor.sinifla(k);
      const etki = motor.cariEtkileri(k).reduce((t, e) => (e.firmaId === firmaId ? t + e.etki : t), 0);
      console.log(
        `\n  ${gun(k.tarih)}  ${k.aciklama || "(açıklama yok)"}  ·  ${k.yon === "gelen" ? "GİRİŞ" : "ÇIKIŞ"} ` +
          `${odemeSekliAdi(k)}  (${k.id})`
      );
      console.log(
        `     tur ${k.tur ?? "(yok)"} · Toplam ${sag(k.toplamTutar ?? 0)} · Alınan ${sag(k.alinanTutar ?? 0)} · ` +
          `durum ${k.durum ?? "?"} · dagitim ${
            Array.isArray(k.dagitim) ? `${k.dagitim.length} satır (${TL(motor.dagitilan(k))})` : "(yok)"
          }`
      );
      console.log(`     kayıt kalanı ${sag(motor.kayitKalani(k))} · cari bakiyeye etkisi ${sag(etki)}`);
      console.log(`     girildiği yer : ${motor.girisYolu(k)}`);
      console.log(`     girildiği an  : ${anlik(k.createdAt)}  (son değişiklik ${anlik(k.updatedAt)})`);
      console.log(`     sınıf         : [${s.kod}] ${s.neden}`);
      console.log("     " + JSON.stringify(k));
    }
    console.log(`\nCARİ BAKİYE: ${TL(motor.firmaBakiyesi(firmaId))}`);
  }
}

// ---- Adaylar ve planlar ----
const { yazilacak, elle, atlanan, bolumler, toplamDagitilan, toplamPesine } = motor.planla(secilenler);

for (const yon of ["gelen", "giden"]) {
  const liste = bolumler[yon];
  console.log("\n" + "=".repeat(110));
  console.log(
    yon === "gelen"
      ? `MÜŞTERİ TARAFI · gelen para (dağıtılmamış tahsilatlar): ${liste.length} firma`
      : `TEDARİKÇİ / GİDER TARAFI · giden para (dağıtılmamış ödemeler): ${liste.length} firma`
  );
  console.log("=".repeat(110));
  if (liste.length === 0) {
    console.log(yon === "gelen" ? "Aday yok." : "Aday yok.");
    continue;
  }
  for (const b of liste) {
    console.log(
      `\n${firmaAdi(b.firmaId)}  [${turAdi(b.firmaId)}]  ·  cari bakiye ${TL(b.bakiyeOnce)} · ` +
        `dağıtım sonrası açık kalem ${motor.acikHedefler(b.firmaId, yon).length}`
    );
    for (const { kayit: k, sinif: s, plan, not } of b.satirlar) {
      console.log(
        `  · ${gun(k.tarih)}  ${sag(s.para)}  [${s.kod}]  ${odemeSekliAdi(k)} · ${k.aciklama || "(açıklama yok)"}  (${k.id})`
      );
      console.log(`       ${s.giris}`);
      console.log(`       ${s.neden}`);
      for (const d of plan) {
        const kalanSonra = yuvarla(d.hedefKalan - d.tutar);
        console.log(
          `       → ${(d.hedefTur === "siparis" ? "sipariş" : "kalem").padEnd(7)} ${String(d.ad).slice(0, 34).padEnd(34)} ` +
            `${sag(d.tutar)}   ${kalanSonra <= EPS ? "KAPANIYOR" : `kalan ${TL(kalanSonra)}`}`
        );
      }
      if (not) {
        console.log(`       ${not}`);
        continue;
      }
      // Peşine çevirmede kalan sıfırlanıyor, avans diye bir şey kalmıyor: o satırlarda avans yazılmaz.
      if (s.bicim === "pesine-cevir") {
        console.log(
          `       yazılacak: toplamTutar = ${TL(k.alinanTutar ?? 0)}, kalan sıfırlanıyor` +
            (s.turSil ? " · tur alanı kaldırılıyor (kasa düzeltme kaydı)" : "")
        );
        continue;
      }
      const artan = yuvarla(s.para - plan.reduce((t, d) => t + d.tutar, 0));
      const ne =
        s.bicim === "tahsilata-cevir"
          ? `tur="tahsilat", toplamTutar=0, durum="aktif", dagitim[${plan.length}] · hedef kayıtlara dokunulmuyor`
          : `dagitim[${plan.length}] tamamlanacak`;
      console.log(`       yazılacak: ${ne}${artan > EPS ? ` · ${TL(artan)} avansta kalacak` : ""}`);
    }
    console.log(`   firma bakiyesi: ${TL(b.bakiyeOnce)} → ${TL(motor.firmaBakiyesi(b.firmaId))}`);
  }
}

// ---- Yazılacaklar, gruplanmış ----
const grup = {
  dagitim: yazilacak.filter((y) => y.bicim !== "pesine-cevir"),
  pesin: yazilacak.filter((y) => y.bicim === "pesine-cevir"),
};
console.log("\n" + "=".repeat(110));
console.log("YAZILACAKLAR");
console.log("=".repeat(110));
console.log(`\n1. FİRMA TÜRÜ DÜZELTMESİ  (${turYazilacak.length})`);
for (const t of turYazilacak) console.log(`   · ${t.ad}  ${t.eski} → ${t.tur}  (${t.id})`);
if (turYazilacak.length === 0) console.log("   —");

console.log(`\n2. DAĞITIM · tur="tahsilat" + dagitim  (${grup.dagitim.length} kayıt, ${TL(toplamDagitilan)})`);
for (const y of grup.dagitim) {
  const k = y.kayit;
  console.log(
    `   · ${gun(k.tarih)}  ${sag(y.plan.reduce((t, d) => t + d.tutar, 0))}  [${y.kod}] ${y.yon === "gelen" ? "tahsilat" : "ödeme"} · ` +
      `${firmaAdi(k.firmaId)} · ${k.aciklama || "(açıklama yok)"}  → ${y.plan.length} kalem  (${k.id})`
  );
}
if (grup.dagitim.length === 0) console.log("   —");

console.log(`\n3. PEŞİNE ÇEVİRME · toplamTutar = alinanTutar  (${grup.pesin.length} kayıt, ${TL(toplamPesine)})`);
for (const y of grup.pesin) {
  const k = y.kayit;
  const ne = y.turSil ? "kasa düzeltme (tur kaldırılıyor)" : y.kod === "GD" ? "harcama" : "peşin alış";
  console.log(
    `   · ${gun(k.tarih)}  ${sag(y.yeniToplam)}  [${y.kod}] ${ne} · ` +
      `${firmaAdi(k.firmaId)} · ${k.aciklama || "(açıklama yok)"}  (${k.id})`
  );
}
if (grup.pesin.length === 0) console.log("   —");

if (elle.length > 0) {
  console.log(`\nELLE BAKILACAK  (${elle.length})`);
  for (const e of elle) {
    console.log(
      `   · ${gun(e.kayit.tarih)}  ${sag(e.sinif.para)}  [${e.sinif.kod}] ${firmaAdi(e.kayit.firmaId)} · ` +
        `${e.kayit.aciklama || "(açıklama yok)"}  (${e.kayit.id})`
    );
    console.log(`       ${e.sinif.neden}`);
  }
}

// ---- Gider kalemlerinin bakiyesi (dağıtım sonrası, bellekte) ----
const giderBakiye = secilenler
  .filter((id) => turAdi(id) === "gider")
  .map((id) => ({ id, bakiye: motor.firmaBakiyesi(id) }))
  .filter((x) => Math.abs(x.bakiye) > EPS);
console.log("\n" + "=".repeat(110));
console.log("GİDER KALEMİ BAKİYE KONTROLÜ (yazma sonrası beklenen)");
console.log("=".repeat(110));
if (giderBakiye.length === 0) {
  console.log("Bütün gider kalemlerinin cari bakiyesi sıfır.");
} else {
  console.log("Bakiyesi sıfırlanmayan gider kalemleri (Toplam > Peşin kalan kayıtlar — elle bakılmalı):");
  for (const x of giderBakiye) console.log(`   · ${firmaAdi(x.id).padEnd(34)} ${sag(x.bakiye)}  (${x.id})`);
}

console.log("\n" + "=".repeat(110));
console.log(
  `TOPLAM · firma türü ${turYazilacak.length} · dağıtılacak ${grup.dagitim.length} kayıt ${TL(toplamDagitilan)} · ` +
    `peşine çevrilecek ${grup.pesin.length} kayıt ${TL(toplamPesine)}` +
    (elle.length > 0 ? ` · elle bakılacak ${elle.length}` : "")
);
if (atlanan.size > 0) {
  console.log("Yazılmayan kümeler: " + [...atlanan].map(([kod, n]) => `[${kod}] ${n}`).join(" · "));
}
console.log("=".repeat(110));

if (!YAZ) {
  console.log(
    "\nKuru çalıştırma; hiçbir kayıt değişmedi. Uygulamak için: node scripts/dagitim-gecmis.mjs --yaz" +
      (FIRMA_ARA ? ` --firma "${FIRMA_ARA}"` : "")
  );
  process.exit(0);
}
if (turBulunamayan.length > 0) {
  console.log(`\n! Firma türü değişecek ${turBulunamayan.length} firma bulunamadı — yazma durduruldu.`);
  console.log("  Yukarıdaki \"benzer\" satırlarından doğru adı alıp TUR_DEGISIMI listesini düzelt.");
  process.exit(1);
}
if (yazilacak.length === 0 && turYazilacak.length === 0) {
  console.log("\nYazılacak kayıt yok.");
  process.exit(0);
}

// Doğrulama için: planın öngördüğü bakiyeler (bellekteki durum).
const beklenenBakiye = new Map(secilenler.map((id) => [id, yuvarla(motor.firmaBakiyesi(id))]));

// ---- Yazma ----
const simdi = Date.now();
const islemler = [];
for (const t of turYazilacak) {
  islemler.push({ ref: doc(db, "firmalar", t.id), veri: { tur: t.tur, updatedAt: simdi } });
}
for (const y of yazilacak) {
  const k = y.kayit;
  if (y.bicim === "pesine-cevir") {
    // lib/db.ts kasaKaydiVerisi ile aynı kural: alinan >= toplam && toplam > 0 → "tamamlandi".
    // Kasa düzeltme kaydında `tur` alanı tamamen kaldırılır (deleteField), yoksa kayıt tahsilat
    // sayılmaya devam eder ve parası avans olarak cariye girerdi.
    islemler.push({
      ref: doc(db, "kasaKayitlari", k.id),
      veri: {
        toplamTutar: y.yeniToplam,
        durum: y.yeniToplam > 0 ? "tamamlandi" : "aktif",
        ...(y.turSil ? { tur: deleteField() } : {}),
        updatedAt: simdi,
      },
    });
    continue;
  }
  // Dağıtımda yalnızca parayı getiren kayıt değişir; hedef kalemlerin kalanı dağıtımdan okunuyor.
  islemler.push({
    ref: doc(db, "kasaKayitlari", k.id),
    veri:
      y.bicim === "tahsilata-cevir"
        ? { tur: "tahsilat", toplamTutar: 0, durum: "aktif", dagitim: y.dagitim, updatedAt: simdi }
        : { dagitim: y.dagitim, updatedAt: simdi },
  });
}

for (let i = 0; i < islemler.length; i += PARTI) {
  const batch = writeBatch(db);
  for (const x of islemler.slice(i, i + PARTI)) batch.update(x.ref, x.veri);
  await batch.commit();
}
console.log(`\n${islemler.length} belge güncellendi.`);

// ---- Doğrulama: veri yeniden okunup motor baştan kuruluyor ----
const sonrasi = await oku();
const sonFirmalar = sonrasi.firmaSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((f) => !f.silindi);
const sonKayitlar = sonrasi.kayitSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((k) => !k.silindi);
const sonSiparisler = sonrasi.siparisSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => !s.silindi);
const sonMotor = kuralMotoru({
  kayitlar: sonKayitlar,
  siparisler: sonSiparisler,
  firmaTurleri: new Map(sonFirmalar.map((f) => [f.id, f.tur ?? "musteri"])),
});
const sonKayit = new Map(sonKayitlar.map((k) => [k.id, k]));
let hata = 0;
const sorun = (m) => {
  hata++;
  console.log(`! ${m}`);
};

for (const t of turYazilacak) {
  const f = sonFirmalar.find((x) => x.id === t.id);
  if (f?.tur !== t.tur) sorun(`${t.ad}: firma türü "${t.tur}" olmamış (${f?.tur ?? "yok"})`);
}
for (const y of yazilacak) {
  const k = sonKayit.get(y.kayit.id);
  if (!k) {
    sorun(`${y.kayit.id}: kayıt okunamadı`);
    continue;
  }
  if (y.bicim === "pesine-cevir") {
    if (Math.abs((k.toplamTutar ?? 0) - y.yeniToplam) > 0.01) {
      sorun(`${k.id}: Toplam ${TL(k.toplamTutar ?? 0)}, beklenen ${TL(y.yeniToplam)}`);
    }
    if (Math.abs(sonMotor.kayitKalani(k)) > 0.01) sorun(`${k.id}: kalan sıfırlanmamış (${TL(sonMotor.kayitKalani(k))})`);
    if (y.turSil && k.tur) sorun(`${k.id}: tur alanı kaldırılmamış (${k.tur})`);
    continue;
  }
  const yazili = (k.dagitim ?? []).reduce((t, d) => t + (d.tutar ?? 0), 0);
  const beklenen = y.dagitim.reduce((t, d) => t + d.tutar, 0);
  if (Math.abs(yazili - beklenen) > 0.01) sorun(`${k.id}: dağıtım toplamı ${TL(yazili)}, beklenen ${TL(beklenen)}`);
  const para = sonMotor.dagitilabilirTutar(k);
  if (yazili > para + 0.01) sorun(`${k.id}: dağıtılan tutar kaydın parasını aşıyor (${TL(yazili)} > ${TL(para)})`);
}
// Hiçbir kalemin kalanı eksiye düşmemeli: aynı kalem iki kez tüketilmiş olurdu. Yalnızca gerçek
// kalemlere bakılır (`toplamTutar > 0`): Toplam'ı boş olan kayıt bir kalem değil, saf para
// hareketidir (personel ödemesi, dağıtılmamış tedarikçi ödemesi) ve kalanı tanımı gereği eksidir.
for (const k of sonKayitlar) {
  if (k.tur || k.siparisId || k.durum !== "aktif" || (k.toplamTutar ?? 0) <= 0) continue;
  if (sonMotor.kayitKalani(k) < -0.01) sorun(`${k.id}: kalemin kalanı eksiye düştü (${TL(sonMotor.kayitKalani(k))})`);
}
for (const s of sonSiparisler) {
  if (sonMotor.siparisHesap(s).acikKalan < -0.01) {
    sorun(`sipariş ${s.id}: kalan eksiye düştü (${TL(sonMotor.siparisHesap(s).acikKalan)})`);
  }
}
// Cari bakiyeler planın öngördüğü yerde mi?
for (const [id, beklenenDeger] of beklenenBakiye) {
  const gercek = yuvarla(sonMotor.firmaBakiyesi(id));
  if (Math.abs(gercek - beklenenDeger) > 0.01) {
    sorun(`${firmaAdi(id)}: cari bakiye ${TL(gercek)}, plan ${TL(beklenenDeger)}`);
  }
}

console.log(
  hata === 0
    ? "Doğrulama temiz: yazılanlar plana uyuyor, hiçbir kalemin kalanı eksiye düşmedi, cari bakiyeler planladığı yerde."
    : `Doğrulama: ${hata} sorun bulundu — yedek ${yedekYolu} dosyasında duruyor.`
);
console.log("Alacaklar / Borçlar ve firma ekstrelerini kontrol et; node scripts/tutarsizlik-rapor.mjs ile de bakabilirsin.");
process.exit(hata === 0 ? 0 : 1);
