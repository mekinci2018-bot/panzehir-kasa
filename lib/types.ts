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
}

export interface KasaKaydi {
  id: string;
  tarih: string; // YYYY-MM-DD
  ay: string; // YYYY-MM, derived from tarih
  firma: string; // display name; for linked records the company name at the time of linking
  firmaId?: string; // link to firmalar; absent on older free-text records until matched
  personelId?: string; // set instead of firmaId when the counterparty is an employee (calisanlar)
  // A payment taken with "Ödeme Al" on an order: toplamTutar = alinanTutar = the payment, so it
  // never adds a debt of its own; the order carries the amount owed.
  siparisId?: string;
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

export type FirmaTuru = "musteri" | "tedarikci" | "gider";

export interface Firma {
  id: string;
  ad: string; // upper case, single spaces (lib/firma.ts firmaAdiDuzenle)
  anahtar: string; // normalized for duplicate checks (firmaAnahtari); also the firmaAdlari lock id
  tur?: FirmaTuru; // absent = "musteri"
  kilitli?: boolean; // its firmaAdlari lock document exists
  telefon?: string;
  not?: string;
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

export interface Calisan {
  id: string;
  adSoyad: string;
  tcKimlikNo: string;
  telefon: string;
  adres: string;
  acilDurumKisisi: string;
  acilTelefon: string;
  not: string;
}
