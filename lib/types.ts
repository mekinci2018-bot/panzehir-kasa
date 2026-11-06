export type OdemeSekli = "nakit" | "kart" | "havale";
export type Yon = "gelen" | "giden";
export type KayitDurum = "aktif" | "tamamlandi" | "arsiv";

// A payment/collection made after the record was created (from Alacaklar/Borçlar).
export interface Odeme {
  tarih: string; // YYYY-MM-DD
  tutar: number;
  odemeSekli: OdemeSekli;
  bankaHesapId?: string;
  kartAciklama?: string; // only for odemeSekli "kart": where it was charged, e.g. "Ziraat POS"
  createdAt: number;
  // Soft delete of a single payment line. The element stays in place so the other lines keep their
  // indexes (hesapAta addresses them by index); hareketlerOf skips it and alinanTutar is reduced by
  // its amount. Çöp Kutusu lists it for 30 days and can put it back.
  silindi?: boolean;
  silinmeTarihi?: number;
}

// A record that is not a plain Giriş / Çıkış (Aşama 2):
//   transfer         — money moved between our own accounts; two legs, one document, no income/expense
//   mahsup           — a third party paid on our behalf; NO money passes through the till
//   mahsup-komisyon  — the commission a mahsup cost us, a separate expense document tied by mahsupId
// All three are saved with alinanTutar = toplamTutar and durum "tamamlandi", so every generic
// "open amount" filter (Alacaklar, Borçlar, Kasa totals) leaves them alone; what they really do
// lives in lib/kayit.ts (cariEtkileri) and lib/hareketler.ts (hareketlerOf).
export type KayitTuru = "transfer" | "mahsup" | "mahsup-komisyon" | "tahsilat";

// Aşama 3: tahsil edilen paranın hangi açık kaleme ne kadar düştüğü. Hedef bir sipariş ya da bir
// kasa kaydı (devir bakiyesi, veresiye) olabilir. Toplamı alınan tutardan küçükse farkı avanstır.
export type HedefTur = "siparis" | "kayit";

export interface DagitimKalemi {
  hedefTur: HedefTur;
  id: string;
  tutar: number;
}

export interface KasaKaydi {
  id: string;
  tur?: KayitTuru; // absent = ordinary Giriş / Çıkış
  tarih: string; // YYYY-MM-DD
  ay: string; // YYYY-MM, derived from tarih
  firma: string; // display name; for linked records the company name at the time of linking
  firmaId?: string; // link to firmalar; absent on older free-text records until matched
  personelId?: string; // set instead of firmaId when the counterparty is an employee (calisanlar)
  // A payment taken with "Ödeme Al" on an order: toplamTutar = alinanTutar = the payment, so it
  // never adds a debt of its own; the order carries the amount owed. Bir tahsilat `dagitim`
  // taşıyorsa bu alan yalnızca "nereden başlatıldı" bilgisidir, para ondan sayılmaz (lib/dagitim.ts).
  siparisId?: string;
  // Tahsil edilen paranın açık kalemlere dağılımı (Aşama 3). Taşıyan kayıtta siparişe katkı
  // yalnızca buradan okunur; dağıtılmayan kısım avanstır.
  dagitim?: DagitimKalemi[];
  aciklama: string;
  toplamTutar: number;
  alinanTutar: number;
  odemeSekli: OdemeSekli;
  bankaHesapId?: string; // only for odemeSekli "havale"; absent on older records
  kartAciklama?: string; // only for odemeSekli "kart"; free text, no account needed
  // alinanTutar includes these; the remainder is the upfront (peşin) part.
  // Older records have no odemeler, so all of alinanTutar counts as upfront.
  odemeler?: Odeme[];
  kaynak?: "veresiye"; // added from Alacaklar/Borçlar as credit, not via a Kasa row
  vadeTarihi?: string; // YYYY-MM-DD, optional due date
  // ---- tur "transfer": the receiving leg (the paying leg uses odemeSekli / bankaHesapId) ----
  hedefOdemeSekli?: Exclude<OdemeSekli, "kart">; // Nakit Kasa or a bank account; never Kart / POS
  hedefBankaHesapId?: string;
  // ---- tur "mahsup": who received the money (firmaId / firma is the payer) ----
  karsiFirmaId?: string;
  karsiPersonelId?: string;
  karsiFirma?: string; // display name of the receiving side
  karsiTur?: FirmaTuru | "personel"; // kept on the record so a balance can be read without the firm list
  sayilanTutar?: number; // what the receiver counted toward our debt; toplamTutar is what was charged
  // ---- tur "mahsup-komisyon": the mahsup it belongs to; the two are deleted and restored together ----
  mahsupId?: string;
  yon: Yon;
  durum: KayitDurum;
  arsivTarihi?: number; // when "Arşive Gönder" closed the remaining amount; older archives fall back to updatedAt
  // Soft delete: kept in Çöp Kutusu and excluded from every list and total.
  silindi?: boolean;
  silinmeTarihi?: number;
  createdAt: number;
  updatedAt: number;
}

export type UretimDurumu = "bekliyor" | "uretimde" | "bitti" | "teslim";
export type GorselAlani = "siparis" | "biten";

export interface TahsilatNotu {
  tarih: string; // YYYY-MM-DD, e.g. the day the customer promised to pay
  metin: string; // "pazartesi arayacak"
  createdAt: number;
}

export interface Siparis {
  id: string;
  siparisNo?: number; // sequential, assigned once at creation (lib/db.ts addSiparis); absent on pre-migration orders until the backfill runs
  firmaId: string;
  firmaAdi: string; // display name, kept in step with the company on rename/merge
  tarih: string; // YYYY-MM-DD
  urun: string; // Ürün / İş
  tutar: number;
  // Paid before the app existed (imported from Excel), with no Kasa record behind it. Everything
  // paid since is a Kasa record with this siparisId; Ödenen = oncekiOdenen + those records.
  oncekiOdenen?: number;
  uretim: UretimDurumu;
  fatura: boolean; // fatura kesildi
  odemeGunu?: string; // YYYY-MM-DD, optional
  aciklama: string;
  siparisGorselleri: string[]; // gorseller ids
  bitenGorselleri: string[];
  tahsilatNotlari?: TahsilatNotu[];
  // "Arşive Gönder" from Alacaklar: the remainder is written off, like a Kasa record's "arsiv".
  kapatildi?: boolean;
  kapanisTarihi?: number;
  silindi?: boolean;
  silinmeTarihi?: number;
  kaynak?: "excel"; // imported in Aşama 4
  excelSatir?: number; // source row, so a re-run of the import can skip what's already there
  createdAt: number;
  updatedAt: number;
}

// Full image (≤1600 px WebP as a data URL). Its ~200 px preview lives in gorselOnizlemeleri under the
// same id, so tables load previews without pulling the full images.
export interface Gorsel {
  id: string;
  siparisId: string;
  alan: GorselAlani;
  veri: string;
  genislik: number;
  yukseklik: number;
  createdAt: number;
}

// ---- Backups (written by the server to sistem/yedek, read by the app) ----

export type YedekTuru = "gunluk" | "tam" | "elle" | "elle-tam" | "geri-yukleme-oncesi";

export interface YedekSonucu {
  zaman: number;
  tur: YedekTuru;
  basarili: boolean;
  dosyalar?: string[]; // Drive file names (a large full backup may be split into parts)
  boyut?: number; // bytes uploaded
  hata?: string;
}

export interface YedekDurumu {
  son?: YedekSonucu; // the latest backup of any kind
  sonOtomatik?: YedekSonucu; // the latest nightly run, successful or not
  sonBasariliOtomatik?: number; // when the latest nightly run succeeded
  sonTam?: YedekSonucu; // the latest full backup (with images)
  sonGeriYukleme?: { zaman: number; dosya: string; basarili: boolean; hata?: string };
}

// App-wide preferences (sistem/ayarlar), shared by everyone using the account.
export interface Ayarlar {
  faturaTakibi?: boolean; // absent/false = hidden everywhere except the small checkbox in sipariş detayı
}

export type FirmaTuru = "musteri" | "tedarikci" | "gider";

export interface Firma {
  id: string;
  ad: string; // upper case, single spaces (lib/firma.ts firmaAdiDuzenle)
  anahtar: string; // normalized for duplicate checks (firmaAnahtari); also the firmaAdlari lock id
  tur?: FirmaTuru; // absent = "musteri"
  kilitli?: boolean; // its firmaAdlari lock document exists
  telefon?: string;
  not?: string;
  pasif?: boolean; // hidden from new-record pickers; existing records keep showing it
  // Soft delete: only possible when the company has no records. Kept in Çöp Kutusu and
  // excluded from every list; its firmaAdlari lock is removed so the name is free again.
  silindi?: boolean;
  silinmeTarihi?: number;
  createdAt: number;
  updatedAt: number;
}

export interface BankaHesabi {
  id: string;
  banka: string;
  hesapSahibi: string;
  iban: string;
  aciklama: string;
  pasif?: boolean; // hidden from new transactions; history and balance stay visible
}

export type MaasTuru = "haftalik" | "aylik";

export interface Calisan {
  id: string;
  adSoyad: string;
  maasTuru?: MaasTuru; // absent = "aylik"
  maasTutari?: number; // per period (week or month), what the automatic accrual writes
  mesaiSaatUcreti?: number; // overtime: hours × this rate
  devredenAlacak?: number; // opening balance: what was already owed before the app
  devredenTarihi?: string; // YYYY-MM-DD, the date that opening balance is as of; accruals start after it
  pasif?: boolean; // hidden from the active list and the Personel total; history stays
  // Removed in Aşama 4 (personal data we don't keep): tcKimlikNo, telefon, adres, acilDurumKisisi,
  // acilTelefon, not. Still optional here so a record the cleanup script hasn't reached stays typed.
  tcKimlikNo?: string;
  telefon?: string;
  adres?: string;
  acilDurumKisisi?: string;
  acilTelefon?: string;
  not?: string;
}

// One line of an employee's payroll account. Payments are NOT here: they are Kasa records with
// personelId (yon "giden"), so money moved from the till is counted once and a payment entered on
// the Kasa page lands in the same statement. lib/personel.ts merges the two sources.
export type PersonelHareketTuru = "hakedis" | "mesai" | "ek" | "kesinti";

export interface PersonelHareketi {
  id: string;
  personelId: string;
  tur: PersonelHareketTuru;
  tarih: string; // YYYY-MM-DD
  tutar: number; // always positive; the type decides the sign
  aciklama?: string;
  // Automatic accrual only: the period it covers ("h2026-11-02" = week starting Monday 02.11.2026,
  // "a2026-11" = November 2026). The document id is `${personelId}_${donem}`, so the same period can
  // never be written twice.
  donem?: string;
  saat?: number; // mesai: hours worked, when the amount came from hours × rate
  createdAt: number;
  updatedAt: number;
}
