// Aşama 4: imports the Excel files in import/ (orders with their embedded images, companies,
// collection notes, supplier balances) in the same shape the app writes them (lib/db.ts).
//
//   node scripts/excel-aktar.mjs          dry run: writes import/kuru-rapor.md, touches nothing
//   node scripts/excel-aktar.mjs --yaz    deletes the old data (bank accounts stay), then imports
//
// --yaz needs FIREBASE_SERVICE_ACCOUNT_DOSYASI=<service account key .json>. Take a backup first
// (scripts/yedek-al.mjs). Excel files and reports stay in import/ (git-ignored).
import { readFileSync, writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import sharp from "sharp";

const IMPORT = "import";
const SIPARIS_DOSYASI = `${IMPORT}/SİPARİŞ TAKİBİ.xlsx`;
const TEDARIKCI_DOSYASI = `${IMPORT}/TEDARİKÇİ LİSTESİ.xlsx`;
const CARI_DOSYASI = `${IMPORT}/CARİ TAKİP.xlsx`;
const CEK_DOSYASI = `${IMPORT}/ÇEK SENET ÖDEME TAKİBİ.xlsx`;
const YAZ = process.argv.includes("--yaz");

// Date of the import: devir balances and collection notes carry it.
const AKTARIM_TARIHI = "2026-10-31";

// ---- Decisions (agreed with the owner in the Aşama 4 dry run) ----

// Spelling → company. Names that only differ in case or spacing are merged automatically.
const BIRLESTIR = {
  "GRAFİKERTÜRK": "GRAFİKER TÜRK",
  "DNZ RELAM": "DNZ REKLAM",
  "SARAY REKALAM": "SARAY REKLAM",
  "A LÜMİNYUM": "A ALÜMİNYUM",
  "AYKAR": "AYKAR REKLAM",
  "YAKAMOZ KARTELA": "YAKAMOZ KARTELA REKLAM",
  "NEZİH REKLAM": "NEZİH KAYA REKLAM",
  "SÜPER REKLAM": "SÜPER REKLAM RAMAZAN",
  "VAV REKLAM ERKAN": "VAV REKLAM",
};

// Possible merges left to the owner (Firmalar → birleştir); imported as separate companies.
const SORULACAK_BIRLESTIRMELER = [
  ["TUNA REKLAM BAYRAM", "TUNA REKLAM", "aynı \"80.000 TL ödemeden düşüldü\" ve \"ODAK REKLAMA KART\" notları"],
  ["NEO REKLAM", "NEO TASARIM", "aynı gün, aynı \"FERHAT ÇAKIR / ERAY REKLAM SENET\" notu"],
  ["BEKA KADİR", "BE-KA REKLAM", "ikisinde de \"CARİ VAR\""],
  ["M-SERHAT REKLAM", "SERHAT SEVEN", "açıklamada \"SERHAT SEVENİN İŞ\""],
  ["TANIŞ REKLAM RECEP", "TANIŞ REKLAM", "ikisi de FİRMALAR sayfasında ayrı satır"],
  ["AYDIN REKLAM (SAKARYA KARASU)", "AYDIN REKLAM", "parantez içinde şehir"],
  ["SR DARICA REKLAM", "DARICA REKLAM", "ikisi de FİRMALAR sayfasında ayrı satır"],
  ["ÖMER TAMER", "JUMBO REKLAM", "açıklamada \"DİĞER ADI JUMBO REKLAM\""],
  ["TARAY REKLAM", "TALAY REKLAM", "TARAY yalnızca TAHSİLAT sayfasında geçiyor"],
];

// Suppliers that are really expenses (food, kitchen).
const GIDER_KALEMLERI = ["ALKAN YEMEK", "OKUYAN CATRİNG", "SULTAN MUTFAK", "ZEYREK MUTFAK MALZEME"];

// Undated rows: 4–17 sit above the 29.10 rows and the file was saved on 30.10; 167–171 sit among
// the 09.10 rows; 248–250 follow row 245 (07.10).
const TARIH_ATA = { aralik: [[4, 17, "2026-10-30"], [167, 171, "2026-10-09"], [248, 250, "2026-10-07"]] };
// Day and month swapped in Excel.
const TARIH_DUZELT = { 245: "2026-10-07" };

const ATLA = {
  44: "satır 43'ün aynısı (SÖNMEZ REKLAM, LARA ALTIN, 14.000, aynı gün ve açıklama)",
  204: "açıklama \"İPTAL\"",
};
// Row 171 continues row 170 (company on one row, product and status on the next).
const SATIR_BIRLESTIR = { 171: 170 };
// Company cell empty: the product cell holds a person's name.
const FIRMA_ATA = { 250: "YELİZ BAŞARAN" };
// "Ödeme alındı" in the description while ÖDEME is empty: counted as paid in full.
const ODENDI_SAY = [164, 167, 168, 171, 183, 184, 185, 193, 194, 214];

// ---- Helpers (same rules as lib/firma.ts and lib/format.ts) ----

const firmaAdiDuzenle = (ad) => String(ad).replace(/\s+/g, " ").trim().toLocaleUpperCase("tr-TR");
const KATLAMA = { Ç: "C", Ğ: "G", İ: "I", Ö: "O", Ş: "S", Ü: "U", Â: "A", Î: "I", Û: "U" };
const firmaAnahtari = (ad) =>
  firmaAdiDuzenle(ad)
    .replace(/[ÇĞİÖŞÜÂÎÛ]/g, (c) => KATLAMA[c])
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const BIRLESTIR_ANAHTAR = Object.fromEntries(Object.entries(BIRLESTIR).map(([eski, yeni]) => [firmaAnahtari(eski), yeni]));

// Final company name for any spelling.
function firmaAdi(ham) {
  const ad = firmaAdiDuzenle(ham);
  return BIRLESTIR_ANAHTAR[firmaAnahtari(ad)] ?? ad;
}

// Cell → plain value: formula results, rich text, errors (→ null).
function hucre(v) {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if (v.error) return null;
    if (v.richText) return v.richText.map((r) => r.text).join("");
    if ("result" in v || "formula" in v || "sharedFormula" in v) return v.result ?? null;
    if (v.text != null) return v.text;
    return null;
  }
  return v;
}
const metin = (v) => (hucre(v) == null ? "" : String(hucre(v)).replace(/\r/g, "").trim());
const sayi = (v) => (typeof hucre(v) === "number" ? hucre(v) : null);
const isoGun = (d) => d.toISOString().slice(0, 10);
const tl = (n) => n.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const tek = (s) => s.replace(/\n+/g, " / ");
const trTarih = (iso) => iso.split("-").reverse().join(".");

// ---- Reading ----

async function oku(dosya) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(dosya);
  return wb;
}

function siparisleriOku(wb) {
  const ws = wb.getWorksheet("YENİ SİPARİŞLER");
  // Images by row; D is the order image, I (and the stray ones in L/M) the finished product.
  const gorseller = new Map();
  for (const im of ws.getImages()) {
    const satir = Math.floor(im.range.tl.nativeRow ?? im.range.tl.row) + 1;
    const sutun = Math.floor(im.range.tl.nativeCol ?? im.range.tl.col);
    const g = gorseller.get(satir) ?? { siparis: [], biten: [] };
    g[sutun <= 4 ? "siparis" : "biten"].push(im.imageId);
    gorseller.set(satir, g);
  }
  const satirlar = [];
  for (let i = 3; i <= ws.rowCount; i++) {
    const r = ws.getRow(i);
    const s = {
      satir: i,
      tarih: hucre(r.getCell(1).value) instanceof Date ? isoGun(hucre(r.getCell(1).value)) : null,
      firmaHam: metin(r.getCell(2).value),
      urun: metin(r.getCell(3).value),
      tutarHam: metin(r.getCell(5).value),
      tutar: sayi(r.getCell(5).value),
      odeme: sayi(r.getCell(6).value),
      excelKalan: sayi(r.getCell(7).value),
      uretimHam: metin(r.getCell(8).value),
      faturaHam: metin(r.getCell(10).value),
      aciklama: metin(r.getCell(11).value),
      gorsel: gorseller.get(i) ?? { siparis: [], biten: [] },
    };
    const bos = !s.firmaHam && !s.urun && !s.tutarHam && !metin(r.getCell(6).value) && !s.aciklama && !s.uretimHam && !s.faturaHam;
    if (bos && !gorseller.has(i)) continue;
    satirlar.push(s);
  }
  return { satirlar, gorselSayisi: ws.getImages().length };
}

function listeOku(wb, sayfa, ilkSatir, sutunlar) {
  const sonuc = [];
  wb.getWorksheet(sayfa).eachRow((r, i) => {
    if (i < ilkSatir) return;
    const o = { satir: i };
    for (const [ad, c] of Object.entries(sutunlar)) o[ad] = r.getCell(c).value;
    if (Object.entries(o).some(([k, v]) => k !== "satir" && metin(v))) sonuc.push(o);
  });
  return sonuc;
}

// ---- Plan: everything that will be written, built from the files and the decisions ----

async function planla() {
  const sipWb = await oku(SIPARIS_DOSYASI);
  const { satirlar, gorselSayisi } = siparisleriOku(sipWb);
  const firmaListesi = listeOku(sipWb, "FİRMALAR", 1, { ad: 1 }).map((x) => metin(x.ad));
  const sayfa2 = listeOku(sipWb, "Sayfa2", 9, { firma: 4, tutar: 5, aciklama: 6 });
  const tahsilat = listeOku(sipWb, "TAHSİLAT", 5, { firma: 2, kalan: 3, not: 4 });
  const tedarikciler = listeOku(await oku(TEDARIKCI_DOSYASI), "Sayfa1", 2, { ad: 1, adres: 2, telefon: 3, malzeme: 4, bakiye: 5 });
  const cariler = listeOku(await oku(CARI_DOSYASI), "CARİLER", 3, { ad: 2, bakiye: 3 }).filter((c) => metin(c.ad));
  const cekler = listeOku(await oku(CEK_DOSYASI), "Sayfa1", 3, { yil: 2, ay: 3, kime: 4, no: 5, tutar: 6, vade: 7, banka: 9, durum: 11 });

  // Companies
  const firmalar = new Map(); // ad → { ad, tur, yazimlar, kaynak, telefon, notlar[] }
  const firmaEkle = (ham, tur, kaynak) => {
    if (!metin(ham)) return null;
    const ad = firmaAdi(metin(ham));
    const f = firmalar.get(ad) ?? { ad, tur, yazimlar: new Set(), kaynak: new Set(), notlar: [] };
    f.yazimlar.add(metin(ham));
    f.kaynak.add(kaynak);
    if (tur === "musteri") f.tur = "musteri"; // an order makes it a customer
    firmalar.set(ad, f);
    return ad;
  };

  // Orders
  const tarihAta = (satir) => TARIH_ATA.aralik.find(([a, b]) => satir >= a && satir <= b)?.[2] ?? null;
  const siparisler = [];
  const atlanan = [];
  const birlestirilen = new Map(); // continued row → its first row
  for (const s of satirlar) {
    if (ATLA[s.satir]) {
      atlanan.push([s.satir, ATLA[s.satir]]);
      continue;
    }
    if (SATIR_BIRLESTIR[s.satir]) {
      birlestirilen.set(s.satir, SATIR_BIRLESTIR[s.satir]);
      continue;
    }
    const devam = satirlar.find((x) => SATIR_BIRLESTIR[x.satir] === s.satir);
    const k = devam ? { ...s, urun: s.urun || devam.urun, uretimHam: s.uretimHam || devam.uretimHam, faturaHam: s.faturaHam || devam.faturaHam, aciklama: s.aciklama || devam.aciklama } : s;
    if (!k.firmaHam && !FIRMA_ATA[k.satir] && !k.urun && k.tutar == null) {
      atlanan.push([k.satir, "firma, ürün ve tutar boş"]);
      continue;
    }
    const firma = firmaEkle(k.firmaHam || FIRMA_ATA[k.satir], "musteri", "sipariş");
    const tutar = k.tutar ?? 0;
    const odendiSay = ODENDI_SAY.includes(k.satir) || (devam && ODENDI_SAY.includes(devam.satir));
    const odenen = odendiSay ? Math.max(tutar, k.odeme ?? 0) : k.odeme ?? 0;
    const bitenVar = k.gorsel.biten.length > 0;
    const uretim = /^BİTTİ$/i.test(k.uretimHam) ? "bitti" : /^BİTMEDİ$/i.test(k.uretimHam) ? (bitenVar ? "bitti" : "uretimde") : bitenVar ? "bitti" : "bekliyor";
    const ekler = [];
    if (k.tutarHam && k.tutar == null) ekler.push(`Excel TUTAR: ${k.tutarHam}`);
    if (!k.firmaHam && FIRMA_ATA[k.satir]) ekler.push("Excel'de firma boştu");
    siparisler.push({
      satir: k.satir,
      excelTarih: k.tarih,
      tarih: TARIH_DUZELT[k.satir] ?? k.tarih ?? tarihAta(k.satir),
      firma,
      urun: k.urun || firma,
      tutar,
      odenen,
      excelOdeme: k.odeme ?? 0,
      odendiSay,
      uretim,
      excelUretim: k.uretimHam,
      fatura: /^(EVET|KESİLDİ)$/i.test(k.faturaHam),
      aciklama: [k.aciklama, ...ekler].filter(Boolean).join("\n"),
      tutarHam: k.tutarHam,
      gorsel: k.gorsel,
      tahsilatNotlari: [],
    });
  }
  for (const ad of firmaListesi) firmaEkle(ad, "musteri", "FİRMALAR sayfası");
  for (const n of sayfa2) firmaEkle(n.firma, "musteri", "Sayfa2");
  for (const n of tahsilat) firmaEkle(n.firma, "musteri", "TAHSİLAT");

  // Suppliers: phone, address and material into the company; CARİ TAKİP balances win (they are the
  // detailed ledger).
  const bakiyeler = new Map();
  for (const t of tedarikciler) {
    const ad = firmaEkle(t.ad, "tedarikci", "TEDARİKÇİ LİSTESİ");
    const f = firmalar.get(ad);
    if (metin(t.telefon)) f.telefon = metin(t.telefon);
    if (metin(t.adres)) f.notlar.push(`Adres: ${tek(metin(t.adres))}`);
    if (metin(t.malzeme)) f.notlar.push(`Malzeme: ${tek(metin(t.malzeme))}`);
    if (sayi(t.bakiye)) bakiyeler.set(ad, { tutar: sayi(t.bakiye), kaynak: "TEDARİKÇİ LİSTESİ" });
  }
  for (const c of cariler) {
    const ad = firmaEkle(c.ad, "tedarikci", "CARİ TAKİP");
    if (sayi(c.bakiye)) bakiyeler.set(ad, { tutar: sayi(c.bakiye), kaynak: "CARİ TAKİP" });
  }
  for (const ad of GIDER_KALEMLERI) if (firmalar.has(ad)) firmalar.get(ad).tur = "gider";

  // Cheques: listed on the payee's note, not entered as debts (they may pay the balances above).
  const cekNotlari = new Map();
  for (const c of cekler) {
    const ad = firmaEkle(c.kime, "tedarikci", "ÇEK SENET");
    const vade = hucre(c.vade) instanceof Date ? trTarih(isoGun(hucre(c.vade))) : "";
    const satir = `${metin(c.no) ? `Çek/senet ${metin(c.no)}` : "Çek/senet"} · ${tl(sayi(c.tutar) ?? 0)} TL · vade ${vade}${metin(c.banka) ? ` · ${metin(c.banka)}` : ""} · ${metin(c.durum)}`;
    cekNotlari.set(ad, [...(cekNotlari.get(ad) ?? []), satir]);
  }
  for (const [ad, satirlar] of cekNotlari) firmalar.get(ad).notlar.push(`Excel ÇEK SENET ÖDEME TAKİBİ:\n${satirlar.join("\n")}`);

  // Collection notes → the company's open order (same remaining amount first, else the newest).
  const notlar = [];
  for (const [kaynak, liste] of [["Sayfa2", sayfa2.map((x) => ({ ...x, not: x.aciklama, kalan: x.tutar }))], ["TAHSİLAT", tahsilat]]) {
    for (const n of liste) {
      const firma = firmaAdi(metin(n.firma));
      const tutar = sayi(n.kalan);
      const acik = siparisler.filter((s) => s.firma === firma && s.tutar - s.odenen > 0.005);
      const ayniTutar = tutar != null ? acik.find((s) => Math.abs(s.tutar - s.odenen - tutar) < 0.005) : null;
      const hedef = ayniTutar ?? [...acik].sort((a, b) => (b.tarih ?? "").localeCompare(a.tarih ?? ""))[0];
      const metni = [`Excel ${kaynak}`, tutar != null ? `kalan ${tl(tutar)} TL` : null, tek(metin(n.not)) || null].filter(Boolean).join(" · ");
      notlar.push({ kaynak, satir: n.satir, firma, tutar, not: tek(metin(n.not)), hedef });
      if (hedef) hedef.tahsilatNotlari.push(metni);
      else firmalar.get(firma).notlar.push(metni);
    }
  }

  // Opening balances owed to suppliers → one credit ("veresiye") record each, shown in Borçlar.
  const devirler = [...bakiyeler]
    .filter(([, b]) => b.tutar > 0)
    .map(([ad, b]) => ({ firma: ad, tutar: Math.round(b.tutar * 100) / 100, aciklama: `Devir bakiyesi (Excel ${b.kaynak})` }));

  return { satirlar, gorselSayisi, siparisler, atlanan, birlestirilen, firmalar, notlar, devirler, tedarikciler, cariler, cekler, sipWb };
}

// ---- Dry-run report ----

function rapor(p) {
  const r = [];
  const yaz = (...s) => r.push(...s);
  const { siparisler, firmalar, notlar, devirler } = p;
  const toplam = (f) => siparisler.reduce((t, s) => t + f(s), 0);
  const say = (tur) => [...firmalar.values()].filter((f) => f.tur === tur).length;
  const uretimSay = (u) => siparisler.filter((s) => s.uretim === u).length;
  const turAdi = { musteri: "Müşteri", tedarikci: "Tedarikçi", gider: "Gider kalemi" };

  const tutarT = toplam((s) => s.tutar);
  const odenenT = toplam((s) => s.odenen);
  const kalanT = toplam((s) => Math.max(0, s.tutar - s.odenen));
  const excelTutar = p.satirlar.reduce((t, s) => t + (s.tutar ?? 0), 0);
  const excelOdeme = p.satirlar.reduce((t, s) => t + (s.odeme ?? 0), 0);
  const excelKalan = p.satirlar.reduce((t, s) => t + (s.excelKalan ?? 0), 0);

  yaz(`# Kuru çalıştırma raporu`, ``, `Oluşturma: ${new Date().toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}. Firestore'a hiçbir şey yazılmadı.`, ``);
  yaz(`## Özet`, ``, `| | Adet |`, `|---|---:|`);
  yaz(`| Müşteri | ${say("musteri")} |`, `| Tedarikçi | ${say("tedarikci")} |`, `| Gider kalemi | ${say("gider")} |`);
  yaz(`| Sipariş | ${siparisler.length} |`, `| Görsel (sipariş / biten) | ${toplam((s) => s.gorsel.siparis.length + s.gorsel.biten.length)} (${toplam((s) => s.gorsel.siparis.length)} / ${toplam((s) => s.gorsel.biten.length)}) — Excel'de ${p.gorselSayisi} |`);
  yaz(`| Tahsilat notu (siparişe / firmaya) | ${notlar.length} (${notlar.filter((n) => n.hedef).length} / ${notlar.filter((n) => !n.hedef).length}) |`);
  yaz(`| Devir bakiyesi (Borçlar) | ${devirler.length} kayıt, ${tl(devirler.reduce((t, d) => t + d.tutar, 0))} TL |`);
  yaz(`| Tarihi atanan / düzeltilen | ${siparisler.filter((s) => !s.excelTarih).length} / ${Object.keys(TARIH_DUZELT).length} |`);
  yaz(`| Atlanan / birleştirilen satır | ${p.atlanan.length} / ${p.birlestirilen.size} |`, ``);

  yaz(`## Tutarlar`, ``, `| | Aktarılacak | Excel sütunu |`, `|---|---:|---:|`);
  yaz(`| Toplam tutar | ${tl(tutarT)} | ${tl(excelTutar)} (TUTAR) |`, `| Toplam ödenen | ${tl(odenenT)} | ${tl(excelOdeme)} (ÖDEME) |`);
  yaz(`| Toplam kalan | ${tl(kalanT)} | ${tl(excelKalan)} (KALAN ÖDEME) |`, ``);
  const atlananTutar = p.satirlar.filter((s) => ATLA[s.satir]).reduce((t, s) => [t[0] + (s.tutar ?? 0), t[1] + (s.odeme ?? 0)], [0, 0]);
  const odendiFark = toplam((s) => s.odenen - s.excelOdeme);
  yaz(`Farkların nedeni: atlanan satırlar (tutar ${tl(atlananTutar[0])}, ödeme ${tl(atlananTutar[1])}); "ödeme alındı" yazan ${ODENDI_SAY.length} satır ödenmiş sayıldı (+${tl(odendiFark)}); KALAN ÖDEME sütununda ${p.satirlar.filter((s) => s.excelKalan == null && s.tutar).length} satırın formülü yok.`, ``);

  yaz(`## Uygulanan kararlar`, ``);
  yaz(`- Tarih: satır 4–17 → 30.10, 167–171 → 09.10, 248–250 → 07.10; satır 245 10.07 → 07.10.`);
  yaz(`- Üretim: Bitti ${uretimSay("bitti")}, Üretimde ${uretimSay("uretimde")}, Bekliyor ${uretimSay("bekliyor")} (biten ürün görseli olanlar Bitti).`);
  yaz(`- Fatura kesildi: ${siparisler.filter((s) => s.fatura).length}, kesilmedi: ${siparisler.filter((s) => !s.fatura).length}.`);
  for (const [satir, neden] of p.atlanan) yaz(`- Atlandı: satır ${satir} — ${neden}.`);
  for (const [devam, ilk] of p.birlestirilen) yaz(`- Satır ${devam}, satır ${ilk} ile tek sipariş yapıldı.`);
  for (const [satir, ad] of Object.entries(FIRMA_ATA)) yaz(`- Satır ${satir}: firma boştu → ${ad}.`);
  yaz(`- Ödenmiş sayılan satırlar: ${ODENDI_SAY.join(", ")}.`);
  yaz(`- Gider kalemi: ${GIDER_KALEMLERI.join(", ")}.`);
  yaz(`- Çek/senetler borç olarak girilmedi; ilgili firmanın notunda listelendi.`, ``);

  yaz(`## Firma birleştirmeleri`, ``, `| Excel'deki yazımlar | Uygulamadaki ad |`, `|---|---|`);
  for (const [ad, f] of [...firmalar].sort()) if (f.yazimlar.size > 1) yaz(`| ${[...f.yazimlar].map((y) => `\`${y}\``).join(", ")} | ${ad} |`);
  yaz(``, `### Ayrı bırakılanlar (uygulamada Firmalar → birleştir ile birleştirilebilir)`, ``, `| Firma | Olası eşi | Neden |`, `|---|---|---|`);
  for (const [a, b, neden] of SORULACAK_BIRLESTIRMELER) yaz(`| ${a} | ${b} | ${neden} |`);
  yaz(``);

  yaz(`## Devir bakiyeleri (Borçlar)`, ``, `| Firma | Tür | Tutar | Kaynak |`, `|---|---|---:|---|`);
  for (const d of devirler) yaz(`| ${d.firma} | ${turAdi[firmalar.get(d.firma).tur]} | ${tl(d.tutar)} | ${d.aciklama} |`);
  yaz(``);

  yaz(`## Tutarı 0 olan siparişler`, ``, `| Satır | Firma | Ürün | Excel TUTAR | Açıklama |`, `|---|---|---|---|---|`);
  for (const s of siparisler.filter((s) => s.tutar === 0)) yaz(`| ${s.satir} | ${s.firma} | ${tek(s.urun)} | ${s.tutarHam || "boş"} | ${tek(s.aciklama)} |`);
  yaz(``);

  yaz(`## Tahsilat notları`, ``, `| Kaynak | Firma | Tutar | Not | Nereye |`, `|---|---|---:|---|---|`);
  for (const n of notlar)
    yaz(`| ${n.kaynak} ${n.satir} | ${n.firma} | ${n.tutar != null ? tl(n.tutar) : ""} | ${n.not} | ${n.hedef ? `sipariş satır ${n.hedef.satir} (${tek(n.hedef.urun)}, kalan ${tl(n.hedef.tutar - n.hedef.odenen)})` : "firma notu"} |`);
  yaz(``);

  yaz(`## Firmalar (${firmalar.size})`, ``, `| Ad | Tür | Excel'deki yazımlar | Kaynak |`, `|---|---|---|---|`);
  for (const [ad, f] of [...firmalar].sort((a, b) => a[0].localeCompare(b[0], "tr")))
    yaz(`| ${ad} | ${turAdi[f.tur]} | ${[...f.yazimlar].join(" · ")} | ${[...f.kaynak].join(", ")} |`);

  writeFileSync(`${IMPORT}/kuru-rapor.md`, r.join("\n") + "\n");
  return r;
}

// ---- Writing ----

// Same targets as lib/gorsel.ts: ≤1600 px WebP aiming at 150 KB (hard cap 700 KB), 200 px preview.
async function gorselHazirla(buffer) {
  const kaynak = sharp(buffer, { failOn: "none" }).rotate().flatten({ background: "#fff" });
  let kenar = 1600;
  for (;;) {
    let veri;
    for (const kalite of [82, 72, 62, 52, 42]) {
      veri = await kaynak.clone().resize(kenar, kenar, { fit: "inside", withoutEnlargement: true }).webp({ quality: kalite }).toBuffer({ resolveWithObject: true });
      if (veri.data.length <= 150 * 1024) break;
    }
    if (veri.data.length <= 700 * 1024 || kenar <= 600) {
      if (veri.data.length > 700 * 1024) throw new Error("Görsel küçültülemedi.");
      let onizleme;
      for (const kalite of [82, 72, 62, 52, 42]) {
        onizleme = await kaynak.clone().resize(200, 200, { fit: "inside", withoutEnlargement: true }).webp({ quality: kalite }).toBuffer();
        if (onizleme.length <= 20 * 1024) break;
      }
      return {
        veri: `data:image/webp;base64,${veri.data.toString("base64")}`,
        onizleme: `data:image/webp;base64,${onizleme.toString("base64")}`,
        genislik: veri.info.width,
        yukseklik: veri.info.height,
      };
    }
    kenar = Math.round(kenar * 0.75);
  }
}

// Batches stay well under Firestore's 500 writes / 10 MB per commit.
function toplayici(db) {
  let batch = db.batch(), adet = 0, boyut = 0, toplam = 0;
  const gonder = async () => {
    if (!adet) return;
    await batch.commit();
    toplam += adet;
    batch = db.batch();
    adet = 0;
    boyut = 0;
  };
  return {
    async ekle(islem) {
      const b = islem.veri ? Buffer.byteLength(JSON.stringify(islem.veri)) : 100;
      if (adet >= 400 || boyut + b > 8 * 1024 * 1024) await gonder();
      islem.sil ? batch.delete(islem.ref) : batch.set(islem.ref, islem.veri);
      adet++;
      boyut += b;
    },
    async bitir() {
      await gonder();
      return toplam;
    },
  };
}

async function yazdir(p) {
  const anahtarYolu = process.env.FIREBASE_SERVICE_ACCOUNT_DOSYASI;
  if (!anahtarYolu) throw new Error("FIREBASE_SERVICE_ACCOUNT_DOSYASI tanımlı değil.");
  const { cert, initializeApp } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const db = getFirestore(initializeApp({ credential: cert(JSON.parse(readFileSync(anahtarYolu, "utf8"))) }));
  const simdi = Date.now();

  // 1) Delete everything except bank accounts (and the sistem status document).
  const silinecek = ["kasaKayitlari", "siparisler", "gorseller", "gorselOnizlemeleri", "firmalar", "firmaAdlari", "calisanlar"];
  const silici = toplayici(db);
  const silinen = {};
  for (const ad of silinecek) {
    const refs = await db.collection(ad).listDocuments();
    silinen[ad] = refs.length;
    for (const ref of refs) await silici.ekle({ ref, sil: true });
  }
  await silici.bitir();
  console.log(`Silindi: ${Object.entries(silinen).map(([k, v]) => `${k} ${v}`).join(", ")}`);

  // 2) Companies and their name locks (firmaAdlari/{anahtar}).
  const yazici = toplayici(db);
  const firmaId = new Map();
  for (const f of p.firmalar.values()) {
    const ref = db.collection("firmalar").doc();
    const anahtar = firmaAnahtari(f.ad);
    firmaId.set(f.ad, ref.id);
    await yazici.ekle({
      ref,
      veri: {
        ad: f.ad,
        anahtar,
        tur: f.tur,
        kilitli: true,
        ...(f.telefon ? { telefon: f.telefon } : {}),
        ...(f.notlar.length ? { not: f.notlar.join("\n\n") } : {}),
        createdAt: simdi,
        updatedAt: simdi,
      },
    });
    await yazici.ekle({ ref: db.collection("firmaAdlari").doc(anahtar), veri: { firmaId: ref.id } });
  }
  console.log(`Firmalar: ${p.firmalar.size}`);

  // 3) Orders, each with its images (full image + preview under one id).
  let gorselAdet = 0;
  const hatalar = [];
  for (const [i, s] of p.siparisler.entries()) {
    const id = `excel-${s.satir}`;
    const gorselIdleri = { siparis: [], biten: [] };
    for (const alan of ["siparis", "biten"]) {
      for (const [n, imageId] of s.gorsel[alan].entries()) {
        const gid = `${id}-${alan}-${n + 1}`;
        try {
          const g = await gorselHazirla(p.sipWb.getImage(imageId).buffer);
          await yazici.ekle({ ref: db.collection("gorseller").doc(gid), veri: { siparisId: id, alan, veri: g.veri, genislik: g.genislik, yukseklik: g.yukseklik, createdAt: simdi } });
          await yazici.ekle({ ref: db.collection("gorselOnizlemeleri").doc(gid), veri: { siparisId: id, onizleme: g.onizleme, createdAt: simdi } });
          gorselIdleri[alan].push(gid);
          gorselAdet++;
        } catch (err) {
          hatalar.push(`satır ${s.satir} ${alan} görsel ${n + 1}: ${err.message}`);
        }
      }
    }
    await yazici.ekle({
      ref: db.collection("siparisler").doc(id),
      veri: {
        firmaId: firmaId.get(s.firma),
        firmaAdi: s.firma,
        tarih: s.tarih,
        urun: s.urun,
        tutar: s.tutar,
        ...(s.odenen ? { oncekiOdenen: s.odenen } : {}),
        uretim: s.uretim,
        fatura: s.fatura,
        aciklama: s.aciklama,
        siparisGorselleri: gorselIdleri.siparis,
        bitenGorselleri: gorselIdleri.biten,
        ...(s.tahsilatNotlari.length ? { tahsilatNotlari: s.tahsilatNotlari.map((m, k) => ({ tarih: AKTARIM_TARIHI, metin: m, createdAt: simdi + k })) } : {}),
        kaynak: "excel",
        excelSatir: s.satir,
        createdAt: simdi,
        updatedAt: simdi,
      },
    });
    if ((i + 1) % 25 === 0 || i + 1 === p.siparisler.length) console.log(`Siparişler: ${i + 1}/${p.siparisler.length}, görseller: ${gorselAdet}`);
  }

  // 4) Supplier opening balances as credit records (Borçlar), like "Veresiye Ekle" does.
  for (const d of p.devirler) {
    await yazici.ekle({
      ref: db.collection("kasaKayitlari").doc(),
      veri: {
        tarih: AKTARIM_TARIHI,
        firma: d.firma,
        firmaId: firmaId.get(d.firma),
        aciklama: d.aciklama,
        toplamTutar: d.tutar,
        alinanTutar: 0,
        odemeSekli: "nakit",
        yon: "giden",
        kaynak: "veresiye",
        ay: AKTARIM_TARIHI.slice(0, 7),
        durum: "aktif",
        createdAt: simdi,
        updatedAt: simdi,
      },
    });
  }
  const yazilan = await yazici.bitir();
  console.log(`Devir bakiyesi: ${p.devirler.length}. Toplam yazılan belge: ${yazilan}.`);
  if (hatalar.length) console.log(`Görsel hataları (${hatalar.length}):\n${hatalar.join("\n")}`);

  // 5) Read back and compare with the plan.
  const oku = async (ad) => (await db.collection(ad).get()).docs.map((d) => d.data());
  const sip = await oku("siparisler");
  const sonuc = {
    firmalar: (await oku("firmalar")).length,
    firmaAdlari: (await oku("firmaAdlari")).length,
    siparisler: sip.length,
    gorseller: (await oku("gorseller")).length,
    gorselOnizlemeleri: (await oku("gorselOnizlemeleri")).length,
    kasaKayitlari: (await oku("kasaKayitlari")).length,
    bankaHesaplari: (await oku("bankaHesaplari")).length,
    tutar: sip.reduce((t, s) => t + s.tutar, 0),
    odenen: sip.reduce((t, s) => t + (s.oncekiOdenen ?? 0), 0),
    kalan: sip.reduce((t, s) => t + Math.max(0, s.tutar - (s.oncekiOdenen ?? 0)), 0),
  };
  writeFileSync(`${IMPORT}/aktarim-sonucu.json`, JSON.stringify({ zaman: new Date().toISOString(), silinen, sonuc, hatalar }, null, 2));
  return { sonuc, hatalar };
}

const plan = await planla();
const r = rapor(plan);
if (!YAZ) {
  console.log(r.slice(0, 45).join("\n"));
  console.log(`\n… tam rapor: ${IMPORT}/kuru-rapor.md`);
} else {
  const { sonuc } = await yazdir(plan);
  const beklenen = {
    firmalar: plan.firmalar.size,
    firmaAdlari: plan.firmalar.size,
    siparisler: plan.siparisler.length,
    gorseller: plan.siparisler.reduce((t, s) => t + s.gorsel.siparis.length + s.gorsel.biten.length, 0),
    gorselOnizlemeleri: plan.siparisler.reduce((t, s) => t + s.gorsel.siparis.length + s.gorsel.biten.length, 0),
    kasaKayitlari: plan.devirler.length,
    bankaHesaplari: 1,
    tutar: plan.siparisler.reduce((t, s) => t + s.tutar, 0),
    odenen: plan.siparisler.reduce((t, s) => t + s.odenen, 0),
    kalan: plan.siparisler.reduce((t, s) => t + Math.max(0, s.tutar - s.odenen), 0),
  };
  console.log(`\n| | Kuru çalıştırma | Firestore |\n|---|---:|---:|`);
  for (const k of Object.keys(beklenen)) console.log(`| ${k} | ${tl(beklenen[k])} | ${tl(sonuc[k])} ${beklenen[k] === sonuc[k] ? "✓" : "✗"} |`);
}
