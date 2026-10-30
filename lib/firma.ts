import { ODEME_SEKLI_LABEL, isoDayOf } from "./format";
import { hareketlerOf } from "./hareketler";
import type { Firma, FirmaTuru, KasaKaydi } from "./types";

export const FIRMA_TURU_LABEL: Record<FirmaTuru, string> = {
  musteri: "Müşteri",
  tedarikci: "Tedarikçi",
  gider: "Gider Kalemi",
};

export function firmaTuru(f: Pick<Firma, "tur">): FirmaTuru {
  return f.tur ?? "musteri";
}

// Stored form of a company name: single spaces, trimmed, Turkish upper case ("abc ltd. şti" → "ABC LTD. ŞTİ").
export function firmaAdiDuzenle(ad: string): string {
  return ad.replace(/\s+/g, " ").trim().toLocaleUpperCase("tr-TR");
}

const KATLAMA: Record<string, string> = { Ç: "C", Ğ: "G", İ: "I", Ö: "O", Ş: "S", Ü: "U", Â: "A", Î: "I", Û: "U" };

// Comparison key: case, Turkish letters and punctuation don't matter ("Şahin A.Ş." ≡ "SAHIN A S").
export function firmaAnahtari(ad: string): string {
  return firmaAdiDuzenle(ad)
    .replace(/[ÇĞİÖŞÜÂÎÛ]/g, (c) => KATLAMA[c])
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mesafe(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

// Near-duplicates worth a "Bunu mu demek istediniz?": a typo or two apart, or one name containing the other.
// Expense items (Kira, Elektrik…) are short, generic names, so they are never checked.
export function benzerFirmalar(ad: string, firmalar: Firma[], limit = 3): Firma[] {
  const k = firmaAnahtari(ad).replace(/ /g, "");
  if (!k) return [];
  const tolerans = k.length <= 5 ? 1 : 2;
  return firmalar
    .filter((f) => firmaTuru(f) !== "gider")
    .map((f) => {
      const fk = f.anahtar.replace(/ /g, "");
      const icerir = Math.min(k.length, fk.length) >= 4 && (fk.includes(k) || k.includes(fk));
      return { f, d: icerir ? 0 : mesafe(k, fk) };
    })
    .filter((x) => x.d <= tolerans)
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map((x) => x.f);
}

function acikKalan(k: KasaKaydi): number {
  const kalan = k.toplamTutar - k.alinanTutar;
  return k.yon === "gelen" ? kalan : -kalan;
}

// Positive: the company owes us (Alacak). Archived ("Arşive Gönder") remainders are written off,
// so per company this matches Alacaklar / Borçlar exactly. Equals the statement's final balance.
export function kayitBakiyesi(k: KasaKaydi): number {
  return k.durum === "arsiv" ? 0 : acikKalan(k);
}

export interface EkstreSatiri {
  key: string;
  tarih: string;
  aciklama: string;
  kayitId: string;
  borc: number; // company is debited: our sale, or our payment to them
  alacak: number; // company is credited: their payment, or our purchase from them
  bakiye: number;
}

function odemeDetayi(odemeSekli: KasaKaydi["odemeSekli"], kartAciklama?: string): string {
  return [ODEME_SEKLI_LABEL[odemeSekli], kartAciklama].filter(Boolean).join(" · ");
}

// Statement in date order: each record's amount, then the money that moved against it.
export function ekstreOlustur(kayitlar: KasaKaydi[]): EkstreSatiri[] {
  const satirlar: Omit<EkstreSatiri, "bakiye">[] = [];
  const sirali = [...kayitlar].sort((a, b) => a.createdAt - b.createdAt);
  for (const k of sirali) {
    const baslik = k.aciklama || (k.yon === "gelen" ? "Satış" : "Alış");
    if (k.toplamTutar) {
      satirlar.push({
        key: `${k.id}-t`,
        tarih: k.tarih,
        aciklama: baslik,
        kayitId: k.id,
        borc: k.yon === "gelen" ? k.toplamTutar : 0,
        alacak: k.yon === "gelen" ? 0 : k.toplamTutar,
      });
    }
    hareketlerOf(k).forEach((h, i) => {
      satirlar.push({
        key: `${k.id}-h${i}`,
        tarih: h.tarih,
        aciklama: `${k.yon === "gelen" ? "Tahsilat" : "Ödeme"} · ${odemeDetayi(h.odemeSekli, h.kartAciklama)}`,
        kayitId: k.id,
        borc: k.yon === "gelen" ? 0 : h.tutar,
        alacak: k.yon === "gelen" ? h.tutar : 0,
      });
    });
    // A remainder closed with "Arşive Gönder" gets its own row that brings the record to zero.
    const kapanan = k.durum === "arsiv" ? acikKalan(k) : 0;
    if (Math.abs(kapanan) >= 0.005) {
      satirlar.push({
        key: `${k.id}-k`,
        tarih: isoDayOf(k.arsivTarihi ?? k.updatedAt),
        aciklama: `Kapatıldı (${kapanan > 0 ? "tahsil edilemedi" : "ödenmedi"})${k.aciklama ? " · " + k.aciklama : ""}`,
        kayitId: k.id,
        borc: kapanan < 0 ? -kapanan : 0,
        alacak: kapanan > 0 ? kapanan : 0,
      });
    }
  }
  // Stable sort keeps a record's amount ahead of its payments on the same day.
  satirlar.sort((a, b) => (a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : 0));
  let bakiye = 0;
  return satirlar.map((s) => {
    bakiye += s.borc - s.alacak;
    return { ...s, bakiye };
  });
}

export interface CariOzet {
  bakiye: number;
  harcama: number; // total of outgoing records; the only figure shown for expense items and staff
  kayitSayisi: number;
  sonTarih: string;
}

// Per company (firmaId) or per employee (personelId).
export function cariOzetleri(kayitlar: KasaKaydi[], alan: "firmaId" | "personelId" = "firmaId"): Map<string, CariOzet> {
  const map = new Map<string, CariOzet>();
  for (const k of kayitlar) {
    const id = k[alan];
    if (!id) continue;
    const o = map.get(id) ?? { bakiye: 0, harcama: 0, kayitSayisi: 0, sonTarih: "" };
    o.bakiye += kayitBakiyesi(k);
    if (k.yon === "giden") o.harcama += k.toplamTutar;
    o.kayitSayisi += 1;
    if (k.tarih > o.sonTarih) o.sonTarih = k.tarih;
    map.set(id, o);
  }
  return map;
}
