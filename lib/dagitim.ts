// Aşama 3: tahsil edilen paranın hangi açık kaleme ne kadar düştüğü.
//
// **Tek kaynak kuralı:** bir kayıt `dagitim` taşıyorsa siparişe / kayda katkısı YALNIZCA ondan
// gelir; taşımıyorsa eski `siparisId` yolundan gelir. Aynı para iki kez sayılmaz. Canlı veride
// bunun örneği var: bir sipariş ödemesi `excel-79`'dan başlatılmış (`siparisId` orada duruyor) ama
// parası `excel-19`'a dağıtılmış — iki yol birlikte sayılsa 3.000 TL iki kez görünürdü.
//
// Dağıtımı okuyan her yer buradan geçer: `siparisOdemeleri` (sipariş ödenen/kalan), `kayitKalani`
// (bir kasa kaydının kapanmayan kısmı), `lib/firma.ts` (bakiye ve ekstre), `lib/kayit.ts`
// (cari etkisi). Dağıtılmamış kısım **avans**tır: kaydın kendisinde ayrı bir alan tutulmaz,
// alınan tutar ile dağıtılan tutarın farkından okunur.
import { siparisHesap } from "./siparis";
import type { DagitimKalemi, HedefTur, KasaKaydi, Siparis } from "./types";

export const EPS = 0.005;

// Kaydın dağıtıma giren parası: tahsilatta alınan tutar, mahsupta müşteriden çekilen tutar.
// (Mahsupta `alinanTutar = toplamTutar` olduğu için ikisi de aynı değeri verir.)
export function dagitilabilirTutar(k: KasaKaydi): number {
  return k.tur === "mahsup" ? k.toplamTutar : k.alinanTutar;
}

export function dagitilan(k: KasaKaydi): number {
  return (k.dagitim ?? []).reduce((t, d) => t + d.tutar, 0);
}

// Hiçbir açık kaleme düşmemiş kısım: cari bakiyeyi bu kadar etkiler (dağıtılan kısım zaten
// kalemlerin kalanını düşürdüğü için ikinci kez sayılmaz). Yalnızca tahsilat ve mahsup için
// anlamlıdır; dağıtımı hiç olmayan bir tahsilatta tutarın tamamı avanstır, böylece dağıtım
// yazılmamış eski kayıtlar da bakiyeye doğru yansır.
export function avans(k: KasaKaydi): number {
  if (k.tur !== "tahsilat" && k.tur !== "mahsup") return 0;
  return Math.max(0, dagitilabilirTutar(k) - dagitilan(k));
}

export interface DagitimToplamlari {
  siparis: Map<string, number>; // siparisId → o siparişe düşen para
  kayit: Map<string, number>; // kasa kaydı id → o kayda düşen para
}

// Bütün kayıtların dağıtımları, hedefe göre toplanmış. Para yönü kaydın `yon`'undan gelir: bir
// iade (giden) siparişin ödenenini azaltır.
export function dagitimToplamlari(kayitlar: KasaKaydi[]): DagitimToplamlari {
  const siparis = new Map<string, number>();
  const kayit = new Map<string, number>();
  const ekle = (map: Map<string, number>, id: string, tutar: number) => map.set(id, (map.get(id) ?? 0) + tutar);

  for (const k of kayitlar) {
    const isaret = k.yon === "gelen" ? 1 : -1;
    if (k.dagitim) {
      for (const d of k.dagitim) {
        if (d.hedefTur === "siparis") ekle(siparis, d.id, isaret * d.tutar);
        else if (d.hedefTur === "kayit") ekle(kayit, d.id, isaret * d.tutar);
      }
      continue; // tek kaynak kuralı: dagitim varsa siparisId tekrar sayılmaz
    }
    if (k.siparisId) ekle(siparis, k.siparisId, isaret * k.alinanTutar);
  }
  return { siparis, kayit };
}

// Siparişlere düşen para (eski adıyla ve eski şekliyle; siparisHesap bunu bekliyor).
export function siparisOdemeleri(kayitlar: KasaKaydi[]): Map<string, number> {
  return dagitimToplamlari(kayitlar).siparis;
}

// Bir kasa kaydının kapanmayan kısmı: tutarından hem kendi ödemeleri (alinanTutar) hem de ona
// dağıtılmış tahsilatlar düşülür. İki mekanizma aynı parayı iki kez düşürmez: `tahsilEt`
// alinanTutar'ı artırır, dağıtım ise ayrı bir kaydın `dagitim` satırıdır.
export function kayitKalani(k: KasaKaydi, kayitDagitimlari?: Map<string, number>): number {
  return k.toplamTutar - k.alinanTutar - (kayitDagitimlari?.get(k.id) ?? 0);
}

// ---- Dağıtım planı ----

// Dağıtılacak bir açık kalem: sipariş ya da kasa kaydı, aynı sıraya girerler.
export interface AcikHedef {
  hedefTur: HedefTur;
  id: string;
  tarih: string;
  sira: number; // aynı günde ikinci ölçüt (createdAt)
  kalan: number;
  ad: string;
}

export function hedefAnahtari(h: { hedefTur: HedefTur; id: string }): string {
  return `${h.hedefTur}:${h.id}`;
}

// Bir firmanın açık kalemleri, eskiden yeniye. Kapatılan ("Arşive Gönder") kalemler ve kalanı
// bitmiş olanlar listede yoktur; transfer / mahsup / komisyon kayıtları da açık kalem değildir.
export function acikHedefler(
  firmaId: string,
  siparisler: Siparis[],
  kayitlar: KasaKaydi[],
  toplamlar: DagitimToplamlari,
  yon: KasaKaydi["yon"] = "gelen"
): AcikHedef[] {
  const hedefler: AcikHedef[] = [];
  for (const s of siparisler) {
    if (s.firmaId !== firmaId || s.silindi || s.kapatildi) continue;
    const kalan = siparisHesap(s, toplamlar.siparis).kalan;
    if (kalan <= EPS) continue;
    hedefler.push({ hedefTur: "siparis", id: s.id, tarih: s.tarih, sira: s.createdAt, kalan, ad: s.urun || "Sipariş" });
  }
  for (const k of kayitlar) {
    if (k.firmaId !== firmaId || k.silindi || k.tur || k.siparisId) continue;
    if (k.durum !== "aktif" || k.yon !== yon) continue;
    const kalan = kayitKalani(k, toplamlar.kayit);
    if (kalan <= EPS) continue;
    hedefler.push({ hedefTur: "kayit", id: k.id, tarih: k.tarih, sira: k.createdAt, kalan, ad: k.aciklama || "Kayıt" });
  }
  return hedefler.sort((a, b) => (a.tarih === b.tarih ? a.sira - b.sira : a.tarih < b.tarih ? -1 : 1));
}

// Tutarı açık kalemlere eskiden yeniye dağıtır. Tek kalemden başlanmışsa (sipariş detayından
// "Ödeme Al", Alacaklar'da tek satır) o kalem başa alınır: para önce başlatıldığı yere düşer,
// artanı sıradaki en eski kaleme geçer. Hiçbir kaleme girmeyen kısım avans olarak kalır.
export function dagitimPlani(
  tutar: number,
  hedefler: AcikHedef[],
  oncelikli?: { hedefTur: HedefTur; id: string }
): DagitimKalemi[] {
  const sirali = [...hedefler];
  if (oncelikli) {
    const i = sirali.findIndex((h) => hedefAnahtari(h) === hedefAnahtari(oncelikli));
    if (i > 0) sirali.unshift(...sirali.splice(i, 1));
  }
  const plan: DagitimKalemi[] = [];
  let kalan = tutar;
  for (const h of sirali) {
    if (kalan <= EPS) break;
    const dusen = Math.min(kalan, h.kalan);
    if (dusen <= EPS) continue;
    plan.push({ hedefTur: h.hedefTur, id: h.id, tutar: Math.round(dusen * 100) / 100 });
    kalan -= dusen;
  }
  return plan;
}

// Bir kaydın kendi dağıtımını hesaba katmadan hedefleri bulmak için: düzenlemede kayıt kendi
// parasını kendi kalemlerinden düşmüş olduğu için yeniden planlama yapılırken dışarıda bırakılır.
export function haricindeToplamlar(kayitlar: KasaKaydi[], haricId: string): DagitimToplamlari {
  return dagitimToplamlari(kayitlar.filter((k) => k.id !== haricId));
}

// Bir siparişe gerçekten düşen ödemeler: dağıtım taşıyan kayıttan yalnızca o siparişe düşen tutar,
// taşımayan (eski) kayıttan `siparisId` üzerinden tutarın tamamı. Sipariş detayındaki ödeme
// listesi buradan okunur, yoksa "başlatıldığı" sipariş parayı almamış olsa da listede görünürdü.
export function siparisOdemeSatirlari(siparisId: string, kayitlar: KasaKaydi[]): { kayit: KasaKaydi; tutar: number }[] {
  const satirlar: { kayit: KasaKaydi; tutar: number }[] = [];
  for (const k of kayitlar) {
    if (k.dagitim) {
      const tutar = k.dagitim.reduce((t, d) => (d.hedefTur === "siparis" && d.id === siparisId ? t + d.tutar : t), 0);
      if (tutar > EPS) satirlar.push({ kayit: k, tutar });
    } else if (k.siparisId === siparisId) {
      satirlar.push({ kayit: k, tutar: k.alinanTutar });
    }
  }
  return satirlar.sort((a, b) => (a.kayit.tarih < b.kayit.tarih ? -1 : 1));
}

// ---- Avansın yeni siparişe düşmesi ----

// Firmanın dağıtılmamış (avans) parasının toplamı.
export function firmaAvansi(firmaId: string, kayitlar: KasaKaydi[]): number {
  return kayitlar.reduce((t, k) => (k.firmaId === firmaId && !k.silindi ? t + avans(k) : t), 0);
}

export interface AvansDusumu {
  kayitId: string;
  dagitim: DagitimKalemi[]; // kaydın yeniden yazılacak dağıtım dizisi
}

// Firmanın avansı yeni siparişe düşer: en eski avanstan başlanır, sipariş tutarı kadar. Sipariş
// kimliği ancak sipariş yazılırken bilindiği için lib/db.ts addSiparis içinden çağrılır.
export function avansDusumleri(
  firmaId: string,
  yeniSiparisId: string,
  siparisTutari: number,
  kayitlar: KasaKaydi[]
): AvansDusumu[] {
  const dusumler: AvansDusumu[] = [];
  let kalan = siparisTutari;
  const avanslilar = kayitlar
    .filter((k) => k.firmaId === firmaId && !k.silindi && avans(k) > EPS)
    .sort((a, b) => (a.tarih === b.tarih ? a.createdAt - b.createdAt : a.tarih < b.tarih ? -1 : 1));
  for (const k of avanslilar) {
    if (kalan <= EPS) break;
    const dusen = Math.round(Math.min(kalan, avans(k)) * 100) / 100;
    if (dusen <= EPS) continue;
    dusumler.push({ kayitId: k.id, dagitim: [...(k.dagitim ?? []), { hedefTur: "siparis", id: yeniSiparisId, tutar: dusen }] });
    kalan -= dusen;
  }
  return dusumler;
}

// "₺15.000,00 → 2 siparişe dağıtıldı · ₺500,00 avansta kaldı"
export function dagitimMesaji(plan: DagitimKalemi[], tutar: number, formatTL: (n: number) => string): string {
  const dagitilanToplam = plan.reduce((t, d) => t + d.tutar, 0);
  const kalan = tutar - dagitilanToplam;
  const hepsiSiparis = plan.every((d) => d.hedefTur === "siparis");
  const birim = hepsiSiparis ? "siparişe" : "kaleme";
  const bas =
    plan.length === 0
      ? `${formatTL(tutar)} avans olarak kaydedildi`
      : `${formatTL(dagitilanToplam)} → ${plan.length} ${birim} dağıtıldı`;
  return kalan > EPS && plan.length > 0 ? `${bas} · ${formatTL(kalan)} avansta kaldı` : bas;
}
