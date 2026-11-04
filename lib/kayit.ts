// Aşama 2'nin özel kayıt türleri (transfer / mahsup / mahsup komisyonu) için tek yer: ne oldukları,
// hangi cariyi nasıl etkiledikleri ve toplamlara nasıl girdikleri.
//
// Üçü de `alinanTutar = toplamTutar`, `durum: "tamamlandi"` ile kaydedilir; böylece "açık kalem"
// süzen her yer (Alacaklar, Borçlar, Kasa'nın Tahsil Edilecek / Ödenecek kartları) onları
// kendiliğinden görmezden gelir. Gerçek etkileri burada ve lib/hareketler.ts'te tanımlı.
import type { KasaKaydi, KayitTuru } from "./types";

export const KAYIT_TURU_LABEL: Record<KayitTuru, string> = {
  transfer: "Transfer",
  mahsup: "Mahsup",
  "mahsup-komisyon": "Mahsup komisyonu",
};

export const ozelKayitMi = (k: Pick<KasaKaydi, "tur">): boolean => !!k.tur;
export const transferMi = (k: Pick<KasaKaydi, "tur">): boolean => k.tur === "transfer";
export const mahsupMu = (k: Pick<KasaKaydi, "tur">): boolean => k.tur === "mahsup";
export const komisyonMu = (k: Pick<KasaKaydi, "tur">): boolean => k.tur === "mahsup-komisyon";

// Mahsupta karşı tarafa sayılan tutar; girilmemişse çekilen tutarın tamamı sayılmış demektir.
export function sayilan(k: KasaKaydi): number {
  return k.sayilanTutar ?? k.toplamTutar;
}

// Çekilen ile sayılan arasındaki fark: mahsubun bize komisyon olarak maliyeti.
export function mahsupFarki(k: KasaKaydi): number {
  return mahsupMu(k) ? k.toplamTutar - sayilan(k) : 0;
}

export function mahsupEtiketi(k: KasaKaydi): string {
  return `Mahsup · ${k.firma} → ${k.karsiFirma ?? "—"}`;
}

export interface CariEtki {
  firmaId?: string;
  personelId?: string;
  etki: number; // + : bizden alacaklı olmaktan çıkıyor / bize borçlanıyor, − : bizdeki alacağı azalıyor
}

// Bir kaydın cari bakiyelere etkisi. Normal kayıtta tek taraf vardır; mahsupta iki taraf:
// ödeyenin bizdeki alacağı çekilen tutar kadar azalır, alanın bizden alacağı (bizim borcumuz)
// sayılan tutar kadar azalır.
//
// Alan bir **gider kalemi** ise gider aynı anda doğup kapandığı için bakiye etkisi sıfırdır
// (ekstrede borç + alacak satırı olarak görünür). Alan **personel** ise etki personel ekstresinde
// ödeme olarak işlenir (lib/personel.ts), burada tekrar sayılmaz.
export function cariEtkileri(k: KasaKaydi, kayitBakiyesi: (k: KasaKaydi) => number): CariEtki[] {
  if (transferMi(k) || komisyonMu(k)) return [];
  if (mahsupMu(k)) {
    const etkiler: CariEtki[] = [{ firmaId: k.firmaId, personelId: k.personelId, etki: -k.toplamTutar }];
    if (k.karsiTur !== "gider" && k.karsiTur !== "personel" && (k.karsiFirmaId || k.karsiPersonelId)) {
      etkiler.push({ firmaId: k.karsiFirmaId, personelId: k.karsiPersonelId, etki: sayilan(k) });
    }
    return etkiler;
  }
  return [{ firmaId: k.firmaId, personelId: k.personelId, etki: kayitBakiyesi(k) }];
}

// Bir kaydın bu firmayla ilgisi var mı? Mahsup iki firmanın da ekstresinde görünür.
export function kayitFirmayaAitMi(k: KasaKaydi, firmaId: string): boolean {
  return k.firmaId === firmaId || (mahsupMu(k) && k.karsiFirmaId === firmaId);
}

// Harcama (gider) olarak sayılacak tutar: normal gider ödemeleri ve mahsup komisyonu kendi
// tutarıyla, gider kalemine yapılan mahsup ise karşı tarafa sayılan tutarla girer.
export function harcamaTutari(k: KasaKaydi, giderMi: boolean): number {
  if (transferMi(k)) return 0;
  if (mahsupMu(k)) return k.karsiTur === "gider" ? sayilan(k) : 0;
  if (komisyonMu(k)) return k.toplamTutar;
  return giderMi && k.yon === "giden" ? k.toplamTutar : 0;
}
