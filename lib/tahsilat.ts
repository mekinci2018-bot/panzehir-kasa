// Tahsilatın tek yolu: nereden başlatılırsa başlatılsın (Alacaklar firma satırı, Alacaklar'da tek
// kalem, sipariş detayı, Kasa satırı, Genel Durum kısayolu, mahsup) para aynı kuralla dağıtılır —
// firmanın açık kalemlerine eskiden yeniye, başlatıldığı kalem önce, artanı avans.
//
// Giden para (tedarikçiye ödeme) aynı yapıyı kullanır: `yon: "giden"` verildiğinde para firmanın
// açık **borç** kalemlerine dağıtılır — çek / senet en yakın vadeden, diğerleri eskiden yeniye
// (lib/dagitim.ts acikHedefler). Kısayolu `odemeYap`. Kayıt yine `tur: "tahsilat"` olur; o tür
// "parası açık kalemlere dağıtılmış para hareketi" demektir, ekranda giden yönde "Ödeme" yazar
// (lib/kayit.ts kayitTuruEtiketi).
//
// Dağıtımı yazan her yer buradan geçer; plan kuralı lib/dagitim.ts'te, yazma lib/db.ts'te.
import { acikHedefler, dagitimMesaji, dagitimPlani, dagitimToplamlari } from "./dagitim";
import { siparisOdemeAl, tahsilatKaydet } from "./db";
import { formatTL } from "./format";
import type { DagitimKalemi, HedefTur, KasaKaydi, Siparis } from "./types";

// Dağıtımın hesaplanabilmesi için gereken, ekranda zaten yüklü olan veri.
export interface TahsilatBaglami {
  kayitlar: KasaKaydi[];
  siparisler: Siparis[];
}

export interface TahsilatIstegi {
  firmaId: string;
  firma: string;
  tarih: string;
  tutar: number;
  odemeSekli: KasaKaydi["odemeSekli"];
  bankaHesapId?: string;
  kartAciklama?: string;
  aciklama?: string;
  // Paranın yönü: "gelen" tahsilat (varsayılan), "giden" tedarikçiye ödeme.
  yon?: KasaKaydi["yon"];
  // Tek kalemden / siparişten başlatıldıysa para önce oraya düşer.
  oncelikli?: { hedefTur: HedefTur; id: string };
  // Sipariş detayından başlatıldıysa kayıt biçimi sipariş ödemesiyle aynı kalır (siparisId + açıklama).
  siparis?: Siparis;
}

// Bir tutarın hangi kalemlere düşeceği. Yazmadan önce de çağrılabilir (önizleme gerekmiyor ama
// bildirimde kaç kaleme düştüğünü söylemek için aynı plan kullanılıyor).
export function tahsilatPlani(istek: TahsilatIstegi, baglam: TahsilatBaglami): DagitimKalemi[] {
  const toplamlar = dagitimToplamlari(baglam.kayitlar);
  const hedefler = acikHedefler(istek.firmaId, baglam.siparisler, baglam.kayitlar, toplamlar, istek.yon ?? "gelen");
  const oncelikli = istek.oncelikli ?? (istek.siparis ? { hedefTur: "siparis" as const, id: istek.siparis.id } : undefined);
  return dagitimPlani(istek.tutar, hedefler, oncelikli);
}

// Tahsilatı yazar; kaydın kimliğini (geri alma için) ve ne olduğunu anlatan kısa mesajı döndürür
// ("₺15.000,00 → 2 siparişe dağıtıldı").
export async function tahsilatYap(
  istek: TahsilatIstegi,
  baglam: TahsilatBaglami
): Promise<{ id: string; mesaj: string }> {
  const plan = tahsilatPlani(istek, baglam);
  const odeme = {
    tutar: istek.tutar,
    odemeSekli: istek.odemeSekli,
    bankaHesapId: istek.bankaHesapId,
    kartAciklama: istek.kartAciklama,
    tarih: istek.tarih,
  };
  const ref = istek.siparis
    ? await siparisOdemeAl(istek.siparis, odeme, plan)
    : await tahsilatKaydet({
        ...odeme,
        firma: istek.firma,
        firmaId: istek.firmaId,
        aciklama: istek.aciklama,
        yon: istek.yon,
        dagitim: plan,
      });
  return { id: ref.id, mesaj: dagitimMesaji(plan, istek.tutar, formatTL) };
}

// Tedarikçiye ödeme: aynı plan, aynı yazma yolu, yalnızca yön giden.
export function odemePlani(istek: TahsilatIstegi, baglam: TahsilatBaglami): DagitimKalemi[] {
  return tahsilatPlani({ ...istek, yon: "giden" }, baglam);
}

export function odemeYap(istek: TahsilatIstegi, baglam: TahsilatBaglami): Promise<{ id: string; mesaj: string }> {
  return tahsilatYap({ ...istek, yon: "giden" }, baglam);
}

// Düzenlemede yeniden dağıtım: kayıt kendi parasını kendi kalemlerinden düşmüş olduğu için hesaba
// katılmaz, sonra yeni tutar aynı kuralla baştan dağıtılır.
export function yenidenDagitim(
  kayit: KasaKaydi,
  yeniTutar: number,
  baglam: TahsilatBaglami,
  firmaId = kayit.firmaId
): DagitimKalemi[] {
  if (!firmaId) return [];
  const digerleri = baglam.kayitlar.filter((k) => k.id !== kayit.id);
  const toplamlar = dagitimToplamlari(digerleri);
  const hedefler = acikHedefler(firmaId, baglam.siparisler, digerleri, toplamlar);
  const oncelikli = kayit.siparisId ? { hedefTur: "siparis" as const, id: kayit.siparisId } : undefined;
  return dagitimPlani(yeniTutar, hedefler, oncelikli);
}

// Avansın yeni siparişe düşmesi lib/dagitim.ts'te (avansDusumleri): yeni siparişin kimliği ancak
// lib/db.ts addSiparis içinde biliniyor, hesap da orada yapılıyor.
