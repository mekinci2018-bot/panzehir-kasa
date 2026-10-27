export type OdemeSekli = "nakit" | "kart";
export type Yon = "gelen" | "giden";
export type KayitDurum = "aktif" | "tamamlandi" | "arsiv";

export interface KasaKaydi {
  id: string;
  tarih: string; // YYYY-MM-DD
  ay: string; // YYYY-MM, derived from tarih
  firma: string;
  aciklama: string;
  toplamTutar: number;
  alinanTutar: number;
  odemeSekli: OdemeSekli;
  yon: Yon;
  durum: KayitDurum;
  createdAt: number;
  updatedAt: number;
}

export interface BankaHesabi {
  id: string;
  banka: string;
  hesapSahibi: string;
  iban: string;
  aciklama: string;
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
