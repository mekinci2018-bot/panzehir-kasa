import { daysSince } from "./format";
import type { KasaKaydi, Siparis, UretimDurumu } from "./types";

export const URETIM_SIRASI: UretimDurumu[] = ["bekliyor", "uretimde", "bitti", "teslim"];

export const URETIM_LABEL: Record<UretimDurumu, string> = {
  bekliyor: "Bekliyor",
  uretimde: "Üretimde",
  bitti: "Bitti",
  teslim: "Teslim Edildi",
};

export function sonrakiUretim(d: UretimDurumu): UretimDurumu {
  return URETIM_SIRASI[(URETIM_SIRASI.indexOf(d) + 1) % URETIM_SIRASI.length];
}

// Money taken on each order through Kasa ("Ödeme Al"), by siparisId. Deleted records are already
// filtered out by useKasaKayitlari, so a payment in Çöp Kutusu stops counting.
export function siparisOdemeleri(kayitlar: KasaKaydi[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const k of kayitlar) {
    if (!k.siparisId) continue;
    map.set(k.siparisId, (map.get(k.siparisId) ?? 0) + (k.yon === "gelen" ? k.alinanTutar : -k.alinanTutar));
  }
  return map;
}

export interface SiparisHesap {
  odenen: number;
  kalan: number; // 0 once written off (kapatildi)
  acikKalan: number; // tutar − odenen, ignoring a write-off
}

export function siparisHesap(s: Siparis, odemeler: Map<string, number>): SiparisHesap {
  const odenen = (s.oncekiOdenen ?? 0) + (odemeler.get(s.id) ?? 0);
  const acikKalan = s.tutar - odenen;
  return { odenen, acikKalan, kalan: s.kapatildi ? 0 : Math.max(0, acikKalan) };
}

export type OdemeDurumu = "odendi" | "kismi" | "odenmedi" | "kapatildi";

// Never set by hand: follows from Tutar and Ödenen.
export function odemeDurumu(s: Siparis, h: SiparisHesap): OdemeDurumu {
  if (s.kapatildi && h.acikKalan > 0.005) return "kapatildi";
  if (h.acikKalan <= 0.005) return "odendi";
  if (h.odenen <= 0.005) return "odenmedi";
  return "kismi";
}

export type TahsilatUyari = "gecti" | "yaklasiyor" | null;

// Red once the payment day has passed with money still owed; orange when it is within 3 days.
export function tahsilatUyari(s: Siparis, h: SiparisHesap): TahsilatUyari {
  if (!s.odemeGunu || h.kalan <= 0) return null;
  const gecen = daysSince(s.odemeGunu);
  if (gecen > 0) return "gecti";
  if (gecen >= -3) return "yaklasiyor";
  return null;
}

export type SiparisSekmesi =
  | "tumu"
  | "bekliyor"
  | "uretimde"
  | "bitti"
  | "teslim"
  | "teslimOdenmedi"
  | "odemeBekleyen"
  | "odenmedi"
  | "kismi"
  | "odendi"
  | "faturasiz";

export const SEKME_LABEL: Record<SiparisSekmesi, string> = {
  tumu: "Tümü",
  bekliyor: "Bekliyor",
  uretimde: "Üretimde",
  bitti: "Bitti",
  teslim: "Teslim Edildi",
  teslimOdenmedi: "Teslim Edildi · Parası Alınmadı",
  odemeBekleyen: "Ödeme Bekleyen",
  odenmedi: "Ödenmedi",
  kismi: "Kısmi",
  odendi: "Ödendi",
  faturasiz: "Faturası Kesilmeyen",
};

// Each tab shows exactly its own state; "Ödeme Bekleyen" is Ödenmedi + Kısmi. Orders whose remainder
// was written off (Kapatıldı) are in none of the payment tabs.
export function sekmedeMi(sekme: SiparisSekmesi, s: Siparis, h: SiparisHesap): boolean {
  const odeme = odemeDurumu(s, h);
  switch (sekme) {
    case "tumu":
      return true;
    case "bekliyor":
    case "uretimde":
    case "bitti":
    case "teslim":
      return s.uretim === sekme;
    case "teslimOdenmedi":
      return s.uretim === "teslim" && h.kalan > 0;
    case "odemeBekleyen":
      return odeme === "odenmedi" || odeme === "kismi";
    case "odenmedi":
    case "kismi":
    case "odendi":
      return odeme === sekme;
    case "faturasiz":
      return !s.fatura;
  }
}

// Only work still in production carries over to later months on Siparişler. Unpaid remainders of
// finished orders stay in their own month here; Alacaklar and the company statement keep tracking them.
export function devrederMi(s: Siparis): boolean {
  return s.uretim === "uretimde";
}

// Sort order of the payment badge column: Ödenmedi → Kısmi → Ödendi (written-off last).
export const ODEME_SIRASI: OdemeDurumu[] = ["odenmedi", "kismi", "odendi", "kapatildi"];

// Kasa row summary counts for a company.
export interface SiparisOzet {
  siparisSayisi: number;
  acik: number; // not yet delivered
  teslimOdenmedi: number;
  bakiye: number; // open remainders
  sonTarih: string;
}

export function firmaSiparisOzetleri(siparisler: Siparis[], odemeler: Map<string, number>): Map<string, SiparisOzet> {
  const map = new Map<string, SiparisOzet>();
  for (const s of siparisler) {
    const h = siparisHesap(s, odemeler);
    const o = map.get(s.firmaId) ?? { siparisSayisi: 0, acik: 0, teslimOdenmedi: 0, bakiye: 0, sonTarih: "" };
    o.siparisSayisi += 1;
    if (s.uretim !== "teslim") o.acik += 1;
    if (s.uretim === "teslim" && h.kalan > 0) o.teslimOdenmedi += 1;
    o.bakiye += h.kalan;
    if (s.tarih > o.sonTarih) o.sonTarih = s.tarih;
    map.set(s.firmaId, o);
  }
  return map;
}
