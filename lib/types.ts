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
