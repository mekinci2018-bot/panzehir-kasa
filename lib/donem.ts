// Month views: which records belong to a month, which carry over from earlier months, and the
// cash position (opening balance → month → closing balance). Computed from the already-loaded data,
// so switching months costs no Firestore reads.
import { monthLabel } from "./format";
import { tumHareketler, signed } from "./hareketler";
import type { KasaKaydi, OdemeSekli } from "./types";

export function ayBaslangici(ay: string): string {
  return `${ay}-01`;
}

export function aydaMi(tarih: string, ay: string): boolean {
  return tarih.slice(0, 7) === ay;
}

export function aydanOnceMi(tarih: string, ay: string): boolean {
  return tarih < ayBaslangici(ay);
}

// "Eylül" for a date in this year, "Eylül 2025" otherwise; for "carried over from" badges.
export function kisaAyEtiketi(tarih: string, referansAy: string): string {
  const etiket = monthLabel(tarih.slice(0, 7));
  return tarih.slice(0, 4) === referansAy.slice(0, 4) ? etiket.split(" ")[0] : etiket;
}

export type KasaHesabi = "nakit" | "banka" | "kart";

const HESAP_OF: Record<OdemeSekli, KasaHesabi> = { nakit: "nakit", havale: "banka", kart: "kart" };

export interface HesapDonemi {
  devreden: number; // balance before the month
  giris: number;
  cikis: number;
  aySonu: number;
}

// Every money movement counts on its own date and payment method, so a later payment on an older
// record lands in the month it was actually paid.
export function aylikKasa(kayitlar: KasaKaydi[], ay: string): Record<KasaHesabi | "toplam", HesapDonemi> {
  const bos = (): HesapDonemi => ({ devreden: 0, giris: 0, cikis: 0, aySonu: 0 });
  const sonuc = { nakit: bos(), banka: bos(), kart: bos(), toplam: bos() };
  const bas = ayBaslangici(ay);
  for (const h of tumHareketler(kayitlar)) {
    const ayAy = h.tarih.slice(0, 7);
    if (ayAy > ay) continue;
    for (const d of [sonuc[HESAP_OF[h.odemeSekli]], sonuc.toplam]) {
      if (h.tarih < bas) d.devreden += signed(h);
      else if (signed(h) >= 0) d.giris += signed(h);
      else d.cikis -= signed(h);
    }
  }
  for (const d of Object.values(sonuc)) d.aySonu = d.devreden + d.giris - d.cikis;
  return sonuc;
}
