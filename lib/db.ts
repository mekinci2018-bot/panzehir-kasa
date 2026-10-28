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

// Firestore rejects undefined values, and a bank account only makes sense for havale.
function bankaAlani(odemeSekli: KasaKaydi["odemeSekli"], bankaHesapId?: string): { bankaHesapId?: string } {
  return odemeSekli === "havale" && bankaHesapId ? { bankaHesapId } : {};
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
  yon: KasaKaydi["yon"];
  kaynak?: KasaKaydi["kaynak"];
  vadeTarihi?: string;
}) {
  await ensureSignedIn();
  const now = Date.now();
  const { bankaHesapId, kaynak, vadeTarihi, ...rest } = input;
  const durum: KasaKaydi["durum"] =
    input.alinanTutar >= input.toplamTutar && input.toplamTutar > 0
      ? "tamamlandi"
      : "aktif";
  return addDoc(collection(getDb(), KAYITLAR), {
    ...rest,
    ...bankaAlani(rest.odemeSekli, bankaHesapId),
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
  const { bankaHesapId, ...rest } = patch;
  const next: Record<string, unknown> = { ...rest, updatedAt: Date.now() };
  if (patch.tarih) next.ay = monthKeyOf(patch.tarih);
  if (patch.odemeSekli) {
    const banka = bankaAlani(patch.odemeSekli, bankaHesapId);
    next.bankaHesapId = banka.bankaHesapId ?? deleteField();
  }
  return updateDoc(doc(getDb(), KAYITLAR, id), next);
}

export async function tahsilEt(
  kayit: KasaKaydi,
  odeme: { tutar: number; odemeSekli: Odeme["odemeSekli"]; bankaHesapId?: string }
) {
  await ensureSignedIn();
  const yeniAlinan = kayit.alinanTutar + odeme.tutar;
  const durum: KasaKaydi["durum"] = yeniAlinan >= kayit.toplamTutar ? "tamamlandi" : "aktif";
  const kalem: Odeme = {
    tarih: todayISO(),
    tutar: odeme.tutar,
    odemeSekli: odeme.odemeSekli,
    ...bankaAlani(odeme.odemeSekli, odeme.bankaHesapId),
    createdAt: Date.now(),
  };
  return updateDoc(doc(getDb(), KAYITLAR, kayit.id), {
    alinanTutar: yeniAlinan,
    durum,
    odemeler: arrayUnion(kalem),
    updatedAt: Date.now(),
  });
}

export async function arsiveGonder(id: string) {
  await ensureSignedIn();
  return updateDoc(doc(getDb(), KAYITLAR, id), { durum: "arsiv", updatedAt: Date.now() });
}

export async function deleteKasaKaydi(id: string) {
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
