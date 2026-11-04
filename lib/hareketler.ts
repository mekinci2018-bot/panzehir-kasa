import type { KasaKaydi, OdemeSekli, Yon } from "./types";

// A single money movement: the upfront part of a record, or a later payment on it.
export interface Hareket {
  kayitId: string;
  firmaId?: string;
  personelId?: string;
  tarih: string;
  firma: string;
  aciklama: string;
  yon: Yon;
  tutar: number;
  odemeSekli: OdemeSekli;
  bankaHesapId?: string;
  kartAciklama?: string;
  odemeIndex?: number; // index in odemeler; absent for the upfront (peşin) part
  bacak?: "kaynak" | "hedef"; // transfer: which leg of the transfer this movement is
}

export function hareketlerOf(k: KasaKaydi): Hareket[] {
  // Mahsup (ve ona bağlı komisyon belgesi) kasadan para geçirmez: hiç hareket üretmez, bu yüzden
  // Nakit / Banka / Kart-POS ve Toplam Kasa değişmez.
  if (k.tur === "mahsup" || k.tur === "mahsup-komisyon") return [];
  // Transfer tek belgedir, iki hareket üretir: kaynakta çıkış, hedefte giriş. Toplam kasa değişmez,
  // iki hesabın hareketlerinde görünür; tek belge olduğu için silme / geri getirme atomiktir.
  if (k.tur === "transfer") {
    const ortak = { kayitId: k.id, firma: k.firma, aciklama: k.aciklama, tutar: k.toplamTutar, tarih: k.tarih };
    return [
      { ...ortak, yon: "giden", odemeSekli: k.odemeSekli, bankaHesapId: k.bankaHesapId, bacak: "kaynak" },
      {
        ...ortak,
        yon: "gelen",
        odemeSekli: k.hedefOdemeSekli ?? "nakit",
        bankaHesapId: k.hedefBankaHesapId,
        bacak: "hedef",
      },
    ];
  }
  return normalHareketler(k);
}

function normalHareketler(k: KasaKaydi): Hareket[] {
  const odemeler = k.odemeler ?? [];
  // A payment line sent to Çöp Kutusu moves no money, but it keeps its slot in the array so the
  // live lines' odemeIndex stays valid.
  const sonradan = odemeler.reduce((sum, o) => (o.silindi ? sum : sum + o.tutar), 0);
  const pesin = k.alinanTutar - sonradan;
  const base = { kayitId: k.id, firmaId: k.firmaId, personelId: k.personelId, firma: k.firma, aciklama: k.aciklama, yon: k.yon };

  const list: Hareket[] = [];
  if (pesin !== 0) {
    list.push({ ...base, tarih: k.tarih, tutar: pesin, odemeSekli: k.odemeSekli, bankaHesapId: k.bankaHesapId, kartAciklama: k.kartAciklama });
  }
  odemeler.forEach((o, odemeIndex) => {
    if (o.silindi) return;
    list.push({ ...base, tarih: o.tarih, tutar: o.tutar, odemeSekli: o.odemeSekli, bankaHesapId: o.bankaHesapId, kartAciklama: o.kartAciklama, odemeIndex });
  });
  return list;
}

export function tumHareketler(kayitlar: KasaKaydi[]): Hareket[] {
  return kayitlar.flatMap(hareketlerOf);
}

export function signed(h: Hareket): number {
  return h.yon === "gelen" ? h.tutar : -h.tutar;
}
