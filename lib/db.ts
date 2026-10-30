import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  updateDoc,
} from "firebase/firestore";
import { getDb, ensureSignedIn } from "./firebase";
import { monthKeyOf, todayISO } from "./format";
import type { BankaHesabi, Calisan, KasaKaydi, Odeme } from "./types";

// Firestore rejects undefined values. A bank account only makes sense for havale,
// and a card description ("Ziraat POS") only for kart.
function odemeAlanlari(
  odemeSekli: KasaKaydi["odemeSekli"],
  bankaHesapId?: string,
  kartAciklama?: string
): { bankaHesapId?: string; kartAciklama?: string } {
  if (odemeSekli === "havale" && bankaHesapId) return { bankaHesapId };
  const kart = kartAciklama?.trim();
  if (odemeSekli === "kart" && kart) return { kartAciklama: kart };
  return {};
}

const KAYITLAR = "kasaKayitlari";
const BANKALAR = "bankaHesaplari";
const CALISANLAR = "calisanlar";

export async function addKasaKaydi(input: {
  tarih: string;
  firma: string;
  aciklama: string;
  toplamTutar: number;
  alinanTutar: number;
  odemeSekli: KasaKaydi["odemeSekli"];
  bankaHesapId?: string;
  kartAciklama?: string;
  yon: KasaKaydi["yon"];
  kaynak?: KasaKaydi["kaynak"];
  vadeTarihi?: string;
}) {
  await ensureSignedIn();
  const now = Date.now();
  const { bankaHesapId, kartAciklama, kaynak, vadeTarihi, ...rest } = input;
  const durum: KasaKaydi["durum"] =
    input.alinanTutar >= input.toplamTutar && input.toplamTutar > 0
      ? "tamamlandi"
      : "aktif";
  return addDoc(collection(getDb(), KAYITLAR), {
    ...rest,
    ...odemeAlanlari(rest.odemeSekli, bankaHesapId, kartAciklama),
    ...(kaynak ? { kaynak } : {}),
    ...(vadeTarihi ? { vadeTarihi } : {}),
    ay: monthKeyOf(input.tarih),
    durum,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateKasaKaydi(id: string, patch: Partial<KasaKaydi>) {
  await ensureSignedIn();
  const { bankaHesapId, kartAciklama, ...rest } = patch;
  const next: Record<string, unknown> = { ...rest, updatedAt: Date.now() };
  if (patch.tarih) next.ay = monthKeyOf(patch.tarih);
  if (patch.odemeSekli) {
    const alanlar = odemeAlanlari(patch.odemeSekli, bankaHesapId, kartAciklama);
    next.bankaHesapId = alanlar.bankaHesapId ?? deleteField();
    next.kartAciklama = alanlar.kartAciklama ?? deleteField();
  }
  return updateDoc(doc(getDb(), KAYITLAR, id), next);
}

export async function tahsilEt(
  kayit: KasaKaydi,
  odeme: { tutar: number; odemeSekli: Odeme["odemeSekli"]; bankaHesapId?: string; kartAciklama?: string }
) {
  await ensureSignedIn();
  const yeniAlinan = kayit.alinanTutar + odeme.tutar;
  const durum: KasaKaydi["durum"] = yeniAlinan >= kayit.toplamTutar ? "tamamlandi" : "aktif";
  const kalem: Odeme = {
    tarih: todayISO(),
    tutar: odeme.tutar,
    odemeSekli: odeme.odemeSekli,
    ...odemeAlanlari(odeme.odemeSekli, odeme.bankaHesapId, odeme.kartAciklama),
    createdAt: Date.now(),
  };
  return updateDoc(doc(getDb(), KAYITLAR, kayit.id), {
    alinanTutar: yeniAlinan,
    durum,
    odemeler: arrayUnion(kalem),
    updatedAt: Date.now(),
  });
}

// Links an unassigned havale to an account: either the record itself or one of its later payments.
export async function hesapAta(kayit: KasaKaydi, odemeIndex: number | undefined, bankaHesapId: string) {
  await ensureSignedIn();
  if (odemeIndex === undefined) {
    return updateDoc(doc(getDb(), KAYITLAR, kayit.id), { bankaHesapId, updatedAt: Date.now() });
  }
  const odemeler = (kayit.odemeler ?? []).map((o, i) => (i === odemeIndex ? { ...o, bankaHesapId } : o));
  return updateDoc(doc(getDb(), KAYITLAR, kayit.id), { odemeler, updatedAt: Date.now() });
}

export async function arsiveGonder(id: string) {
  await ensureSignedIn();
  return updateDoc(doc(getDb(), KAYITLAR, id), { durum: "arsiv", updatedAt: Date.now() });
}

// Records are never physically deleted by the user; they go to Çöp Kutusu.
export async function kayitSil(id: string) {
  await ensureSignedIn();
  return updateDoc(doc(getDb(), KAYITLAR, id), { silindi: true, silinmeTarihi: Date.now() });
}

export async function kayitGeriYukle(id: string) {
  await ensureSignedIn();
  return updateDoc(doc(getDb(), KAYITLAR, id), {
    silindi: deleteField(),
    silinmeTarihi: deleteField(),
    updatedAt: Date.now(),
  });
}

// Only for "Geri al" right after saving: the entry is taken back as if it was never saved.
export async function kaydiGeriAl(id: string) {
  await ensureSignedIn();
  return deleteDoc(doc(getDb(), KAYITLAR, id));
}
export async function addBankaHesabi(input: Omit<BankaHesabi, "id">) {
  await ensureSignedIn();
  return addDoc(collection(getDb(), BANKALAR), input);
}

export async function updateBankaHesabi(id: string, patch: Partial<BankaHesabi>) {
  await ensureSignedIn();
  return updateDoc(doc(getDb(), BANKALAR, id), patch);
}

export async function deleteBankaHesabi(id: string) {
  await ensureSignedIn();
  return deleteDoc(doc(getDb(), BANKALAR, id));
}

export async function addCalisan(input: Omit<Calisan, "id">) {
  await ensureSignedIn();
  return addDoc(collection(getDb(), CALISANLAR), input);
}

export async function updateCalisan(id: string, patch: Partial<Calisan>) {
  await ensureSignedIn();
  return updateDoc(doc(getDb(), CALISANLAR, id), patch);
}

export async function deleteCalisan(id: string) {
  await ensureSignedIn();
  return deleteDoc(doc(getDb(), CALISANLAR, id));
}

export { KAYITLAR, BANKALAR, CALISANLAR };
