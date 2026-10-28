import type { KasaKaydi, OdemeSekli, Yon } from "./types";

// A single money movement: the upfront part of a record, or a later payment on it.
export interface Hareket {
  kayitId: string;
  tarih: string;
  firma: string;
  aciklama: string;
  yon: Yon;
  tutar: number;
  odemeSekli: OdemeSekli;
  bankaHesapId?: string;
}

export function hareketlerOf(k: KasaKaydi): Hareket[] {
  const odemeler = k.odemeler ?? [];
  const sonradan = odemeler.reduce((sum, o) => sum + o.tutar, 0);
  const pesin = k.alinanTutar - sonradan;
  const base = { kayitId: k.id, firma: k.firma, aciklama: k.aciklama, yon: k.yon };

  const list: Hareket[] = [];
  if (pesin !== 0) {
    list.push({ ...base, tarih: k.tarih, tutar: pesin, odemeSekli: k.odemeSekli, bankaHesapId: k.bankaHesapId });
  }
  for (const o of odemeler) {
    list.push({ ...base, tarih: o.tarih, tutar: o.tutar, odemeSekli: o.odemeSekli, bankaHesapId: o.bankaHesapId });
  }
  return list;
}

export function tumHareketler(kayitlar: KasaKaydi[]): Hareket[] {
  return kayitlar.flatMap(hareketlerOf);
}

export function signed(h: Hareket): number {
  return h.yon === "gelen" ? h.tutar : -h.tutar;
}
