// Okunabilir yedek: gece yedeğinin yanına Drive'a yüklenen .xlsx. JSON yedeğinin yerine geçmez —
// geri yüklenemez (lib/server/yedek.ts geriYukle onu reddeder), amacı verinin uygulama olmadan da
// okunabilmesi. Dizi alanları (ödemeler, dağıtım) kendi sayfalarında satır satır açılır.
//
// Hesaplanan kolonlar (siparişin Ödenen / Kalan'ı, kaydın Kalan'ı, avans) uygulamanın kendi
// fonksiyonlarından gelir; burada ikinci bir hesap kopyası tutulmaz.
import ExcelJS from "exceljs";
import { avans, dagitimToplamlari, kayitKalani, siparisOdemeleri } from "../dagitim";
import { FIRMA_TURU_LABEL, firmaTuru } from "../firma";
import { ODEME_SEKLI_LABEL } from "../format";
import { kayitTuruEtiketi } from "../kayit";
import { HAREKET_LABEL, MAAS_TURU_LABEL, hareketIsareti, maasTuru } from "../personel";
import { URETIM_LABEL, siparisHesap } from "../siparis";
import { trZaman, type YedekDosyasi } from "../yedekBicimi";
import type { BankaHesabi, Calisan, Firma, KasaKaydi, PersonelHareketi, Siparis } from "../types";

type Deger = string | number | Date | null;
type Bicim = "para" | "tarih" | "an" | "sayi";

interface Sutun {
  ad: string;
  genislik: number;
  bicim?: Bicim;
}

const BICIM_KODU: Record<Bicim, string> = {
  para: "#,##0.00",
  tarih: "dd.mm.yyyy",
  an: "dd.mm.yyyy hh:mm",
  sayi: "#,##0.##",
};

function sayfaEkle(wb: ExcelJS.Workbook, ad: string, sutunlar: Sutun[], satirlar: Deger[][]) {
  const sayfa = wb.addWorksheet(ad, { views: [{ state: "frozen", ySplit: 1 }] });
  sayfa.columns = sutunlar.map((s) => ({
    header: s.ad,
    width: s.genislik,
    ...(s.bicim ? { style: { numFmt: BICIM_KODU[s.bicim] } } : {}),
  }));
  const baslik = sayfa.getRow(1);
  baslik.font = { bold: true };
  baslik.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F1F4" } };
  for (const satir of satirlar) sayfa.addRow(satir);
  if (satirlar.length) sayfa.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sutunlar.length } };
}

// Excel tarihi mutlak zamandan okuyor (exceljs: getTime() / 86400000), bu yüzden günün başı UTC
// kurulur; yerel saatle kurulsa +03 farkı tarihi bir gün geriye kaydırırdı.
function gun(iso?: string): Date | null {
  const p = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return p ? new Date(Date.UTC(Number(p[1]), Number(p[2]) - 1, Number(p[3]))) : null;
}

// createdAt / updatedAt: Türkiye duvar saati, sunucunun saat dilimi ne olursa olsun.
function an(ms?: number): Date | null {
  if (!ms) return null;
  const { tarih, saat } = trZaman(ms);
  const g = gun(tarih);
  return g ? new Date(g.getTime() + (Number(saat.slice(0, 2)) * 60 + Number(saat.slice(2))) * 60_000) : null;
}

const evet = (deger?: boolean): string => (deger ? "Evet" : "");
const yazi = (deger?: string): string => deger ?? "";

function belgeler<T>(veri: YedekDosyasi, koleksiyon: string): (T & { id: string })[] {
  return Object.entries(veri.koleksiyonlar[koleksiyon] ?? {}).map(([id, alanlar]) => ({ ...(alanlar as T), id }));
}

const tariheGore = <T extends { tarih?: string; createdAt?: number }>(a: T, b: T): number =>
  (a.tarih ?? "").localeCompare(b.tarih ?? "") || (a.createdAt ?? 0) - (b.createdAt ?? 0);

const adaGore = (a?: string, b?: string): number => yazi(a).localeCompare(yazi(b), "tr");

export async function tabloOlustur(veri: YedekDosyasi): Promise<Buffer> {
  const kayitlar = belgeler<KasaKaydi>(veri, "kasaKayitlari").sort(tariheGore);
  const siparisler = belgeler<Siparis>(veri, "siparisler").sort(tariheGore);
  const firmalar = belgeler<Firma>(veri, "firmalar").sort((a, b) => adaGore(a.ad, b.ad));
  const hesaplar = belgeler<BankaHesabi>(veri, "bankaHesaplari").sort((a, b) => adaGore(a.banka, b.banka));
  const calisanlar = belgeler<Calisan>(veri, "calisanlar").sort((a, b) => adaGore(a.adSoyad, b.adSoyad));
  const hareketler = belgeler<PersonelHareketi>(veri, "personelHareketleri").sort(tariheGore);

  // Dağıtım toplamları yalnızca canlı kayıtlardan: silinen bir kaydın dağıtımı uygulamada da
  // geri alınmış sayılıyor (lib/dagitim.ts).
  const canli = kayitlar.filter((k) => !k.silindi);
  const toplamlar = dagitimToplamlari(canli);
  const odemeler = siparisOdemeleri(canli);

  const kayitOf = new Map(kayitlar.map((k) => [k.id, k]));
  const siparisOf = new Map(siparisler.map((s) => [s.id, s]));
  const hesapOf = new Map(hesaplar.map((h) => [h.id, h]));
  const calisanOf = new Map(calisanlar.map((c) => [c.id, c]));

  const hesapAdi = (id?: string) => {
    if (!id) return "";
    const h = hesapOf.get(id);
    return h ? `${h.banka} · ${h.hesapSahibi}` : `(bulunamayan hesap ${id})`;
  };
  const personelAdi = (id?: string) => (id ? (calisanOf.get(id)?.adSoyad ?? `(bulunamayan personel ${id})`) : "");
  const siparisEtiketi = (id?: string) => {
    if (!id) return "";
    const s = siparisOf.get(id);
    if (!s) return `(bulunamayan sipariş ${id})`;
    return `${s.siparisNo ? `#${s.siparisNo} ` : ""}${yazi(s.firmaAdi)} · ${yazi(s.urun)}`.trim();
  };
  const kayitEtiketi = (id: string) => {
    const k = kayitOf.get(id);
    return k ? `${k.tarih} · ${k.firma} · ${yazi(k.aciklama)}`.trim() : `(bulunamayan kayıt ${id})`;
  };
  // Kaydın karşısındaki taraf: personel ödemesinde çalışan, diğer her kayıtta firma.
  const taraf = (k: KasaKaydi) => (k.personelId ? personelAdi(k.personelId) : yazi(k.firma));

  const wb = new ExcelJS.Workbook();
  wb.creator = "Panzehir Kasa";
  wb.created = new Date(veri.olusturma);

  const { tarih, saat } = trZaman(Date.parse(veri.olusturma));
  sayfaEkle(
    wb,
    "Özet",
    [
      { ad: "Bilgi", genislik: 24 },
      { ad: "Değer", genislik: 56 },
    ],
    [
      ["Yedek", `${tarih.split("-").reverse().join(".")} ${saat.slice(0, 2)}:${saat.slice(2)}`],
      ["Kasa kayıtları", kayitlar.length],
      ["Siparişler", siparisler.length],
      ["Firmalar", firmalar.length],
      ["Banka hesapları", hesaplar.length],
      ["Personel", calisanlar.length],
      ["Personel hareketleri", hareketler.length],
      ["Not", "Bu dosya okumak içindir; geri yükleme JSON yedeğinden yapılır."],
      ["Not", "Silinen (çöp kutusundaki) kayıtlar da listelerde; “Silindi” kolonuna bakın."],
    ]
  );

  sayfaEkle(
    wb,
    "Kasa Kayıtları",
    [
      { ad: "Tarih", genislik: 11, bicim: "tarih" },
      { ad: "Yön", genislik: 8 },
      { ad: "Özel Tür", genislik: 18 },
      { ad: "Firma / Kişi", genislik: 30 },
      { ad: "Açıklama", genislik: 40 },
      { ad: "Toplam", genislik: 14, bicim: "para" },
      { ad: "Alınan", genislik: 14, bicim: "para" },
      { ad: "Kalan", genislik: 14, bicim: "para" },
      { ad: "Avans", genislik: 14, bicim: "para" },
      { ad: "Ödeme Şekli", genislik: 16 },
      { ad: "Banka Hesabı", genislik: 28 },
      { ad: "Kart Açıklaması", genislik: 18 },
      { ad: "Vade", genislik: 11, bicim: "tarih" },
      { ad: "Durum", genislik: 10 },
      { ad: "Sipariş", genislik: 34 },
      { ad: "Karşı Taraf", genislik: 26 },
      { ad: "Sayılan", genislik: 14, bicim: "para" },
      { ad: "Kaynak", genislik: 10 },
      { ad: "Silindi", genislik: 9 },
      { ad: "Oluşturma", genislik: 17, bicim: "an" },
      { ad: "Kayıt No", genislik: 24 },
    ],
    kayitlar.map((k) => [
      gun(k.tarih),
      k.yon === "gelen" ? "Giriş" : "Çıkış",
      kayitTuruEtiketi(k),
      taraf(k),
      yazi(k.aciklama),
      k.toplamTutar,
      k.alinanTutar,
      kayitKalani(k, toplamlar.kayit),
      avans(k),
      ODEME_SEKLI_LABEL[k.odemeSekli] ?? yazi(k.odemeSekli),
      hesapAdi(k.bankaHesapId),
      yazi(k.kartAciklama),
      gun(k.vadeTarihi),
      k.durum === "aktif" ? "Açık" : k.durum === "tamamlandi" ? "Kapandı" : "Arşiv",
      siparisEtiketi(k.siparisId),
      k.karsiPersonelId ? personelAdi(k.karsiPersonelId) : yazi(k.karsiFirma),
      k.sayilanTutar ?? null,
      k.kaynak === "veresiye" ? "Veresiye" : "",
      evet(k.silindi),
      an(k.createdAt),
      k.id,
    ])
  );

  sayfaEkle(
    wb,
    "Ödemeler",
    [
      { ad: "Ödeme Tarihi", genislik: 13, bicim: "tarih" },
      { ad: "Firma / Kişi", genislik: 30 },
      { ad: "Kayıt Açıklaması", genislik: 40 },
      { ad: "Yön", genislik: 10 },
      { ad: "Tutar", genislik: 14, bicim: "para" },
      { ad: "Ödeme Şekli", genislik: 16 },
      { ad: "Banka Hesabı", genislik: 28 },
      { ad: "Kart Açıklaması", genislik: 18 },
      { ad: "Kayıt Tarihi", genislik: 13, bicim: "tarih" },
      { ad: "Satır", genislik: 7, bicim: "sayi" },
      { ad: "Silindi", genislik: 9 },
      { ad: "Kayıt No", genislik: 24 },
    ],
    kayitlar.flatMap((k) =>
      (k.odemeler ?? []).map((o, i) => [
        gun(o.tarih),
        taraf(k),
        yazi(k.aciklama),
        k.yon === "gelen" ? "Tahsilat" : "Ödeme",
        o.tutar,
        ODEME_SEKLI_LABEL[o.odemeSekli] ?? yazi(o.odemeSekli),
        hesapAdi(o.bankaHesapId),
        yazi(o.kartAciklama),
        gun(k.tarih),
        i + 1,
        evet(o.silindi),
        k.id,
      ])
    )
  );

  sayfaEkle(
    wb,
    "Dağıtım",
    [
      { ad: "Tarih", genislik: 11, bicim: "tarih" },
      { ad: "Firma / Kişi", genislik: 30 },
      { ad: "Kayıt Açıklaması", genislik: 40 },
      { ad: "Alınan", genislik: 14, bicim: "para" },
      { ad: "Hedef Tür", genislik: 12 },
      { ad: "Hedef", genislik: 44 },
      { ad: "Tutar", genislik: 14, bicim: "para" },
      { ad: "Silindi", genislik: 9 },
      { ad: "Kayıt No", genislik: 24 },
    ],
    kayitlar.flatMap((k) =>
      (k.dagitim ?? []).map((d) => [
        gun(k.tarih),
        taraf(k),
        yazi(k.aciklama),
        k.alinanTutar,
        d.hedefTur === "siparis" ? "Sipariş" : "Kasa Kaydı",
        d.hedefTur === "siparis" ? siparisEtiketi(d.id) : kayitEtiketi(d.id),
        d.tutar,
        evet(k.silindi),
        k.id,
      ])
    )
  );

  sayfaEkle(
    wb,
    "Siparişler",
    [
      { ad: "Sipariş No", genislik: 11, bicim: "sayi" },
      { ad: "Tarih", genislik: 11, bicim: "tarih" },
      { ad: "Firma", genislik: 30 },
      { ad: "Ürün / İş", genislik: 40 },
      { ad: "Tutar", genislik: 14, bicim: "para" },
      { ad: "Önceki Ödenen", genislik: 14, bicim: "para" },
      { ad: "Ödenen", genislik: 14, bicim: "para" },
      { ad: "Kalan", genislik: 14, bicim: "para" },
      { ad: "Üretim", genislik: 14 },
      { ad: "Fatura", genislik: 9 },
      { ad: "Ödeme Günü", genislik: 13, bicim: "tarih" },
      { ad: "Açıklama", genislik: 40 },
      { ad: "Tahsilat Notları", genislik: 40 },
      { ad: "Görsel", genislik: 8, bicim: "sayi" },
      { ad: "Kapatıldı", genislik: 10 },
      { ad: "Silindi", genislik: 9 },
      { ad: "Kaynak", genislik: 10 },
      { ad: "Oluşturma", genislik: 17, bicim: "an" },
      { ad: "Kayıt No", genislik: 24 },
    ],
    siparisler.map((s) => {
      const hesap = siparisHesap(s, odemeler);
      return [
        s.siparisNo ?? null,
        gun(s.tarih),
        yazi(s.firmaAdi),
        yazi(s.urun),
        s.tutar,
        s.oncekiOdenen ?? null,
        hesap.odenen,
        hesap.kalan,
        URETIM_LABEL[s.uretim] ?? yazi(s.uretim),
        evet(s.fatura),
        gun(s.odemeGunu),
        yazi(s.aciklama),
        (s.tahsilatNotlari ?? []).map((n) => `${n.tarih} ${n.metin}`).join(" · "),
        (s.siparisGorselleri?.length ?? 0) + (s.bitenGorselleri?.length ?? 0),
        evet(s.kapatildi),
        evet(s.silindi),
        s.kaynak === "excel" ? "Excel" : "",
        an(s.createdAt),
        s.id,
      ];
    })
  );

  sayfaEkle(
    wb,
    "Firmalar",
    [
      { ad: "Ad", genislik: 34 },
      { ad: "Tür", genislik: 14 },
      { ad: "Telefon", genislik: 16 },
      { ad: "Not", genislik: 40 },
      { ad: "Pasif", genislik: 8 },
      { ad: "Silindi", genislik: 9 },
      { ad: "Oluşturma", genislik: 17, bicim: "an" },
      { ad: "Kayıt No", genislik: 24 },
    ],
    firmalar.map((f) => [
      yazi(f.ad),
      FIRMA_TURU_LABEL[firmaTuru(f)],
      yazi(f.telefon),
      yazi(f.not),
      evet(f.pasif),
      evet(f.silindi),
      an(f.createdAt),
      f.id,
    ])
  );

  sayfaEkle(
    wb,
    "Banka Hesapları",
    [
      { ad: "Banka", genislik: 22 },
      { ad: "Hesap Sahibi", genislik: 28 },
      { ad: "IBAN", genislik: 34 },
      { ad: "Açıklama", genislik: 30 },
      { ad: "Pasif", genislik: 8 },
      { ad: "Kayıt No", genislik: 24 },
    ],
    hesaplar.map((h) => [yazi(h.banka), yazi(h.hesapSahibi), yazi(h.iban), yazi(h.aciklama), evet(h.pasif), h.id])
  );

  sayfaEkle(
    wb,
    "Personel",
    [
      { ad: "Ad Soyad", genislik: 28 },
      { ad: "Maaş Türü", genislik: 12 },
      { ad: "Maaş Tutarı", genislik: 14, bicim: "para" },
      { ad: "Mesai Saat Ücreti", genislik: 16, bicim: "para" },
      { ad: "Devreden Alacak", genislik: 16, bicim: "para" },
      { ad: "Devreden Tarihi", genislik: 15, bicim: "tarih" },
      { ad: "Pasif", genislik: 8 },
      { ad: "Kayıt No", genislik: 24 },
    ],
    calisanlar.map((c) => [
      yazi(c.adSoyad),
      MAAS_TURU_LABEL[maasTuru(c)],
      c.maasTutari ?? null,
      c.mesaiSaatUcreti ?? null,
      c.devredenAlacak ?? null,
      gun(c.devredenTarihi),
      evet(c.pasif),
      c.id,
    ])
  );

  sayfaEkle(
    wb,
    "Personel Hareketleri",
    [
      { ad: "Tarih", genislik: 11, bicim: "tarih" },
      { ad: "Personel", genislik: 28 },
      { ad: "Tür", genislik: 14 },
      { ad: "Tutar", genislik: 14, bicim: "para" },
      { ad: "Kalana Etkisi", genislik: 14, bicim: "para" },
      { ad: "Açıklama", genislik: 40 },
      { ad: "Dönem", genislik: 12 },
      { ad: "Saat", genislik: 8, bicim: "sayi" },
      { ad: "Oluşturma", genislik: 17, bicim: "an" },
      { ad: "Kayıt No", genislik: 28 },
    ],
    hareketler.map((h) => [
      gun(h.tarih),
      personelAdi(h.personelId),
      HAREKET_LABEL[h.tur] ?? yazi(h.tur),
      h.tutar,
      hareketIsareti(h.tur) * h.tutar,
      yazi(h.aciklama),
      yazi(h.donem),
      h.saat ?? null,
      an(h.createdAt),
      h.id,
    ])
  );

  return Buffer.from(await wb.xlsx.writeBuffer());
}
