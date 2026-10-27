import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { getDb, ensureSignedIn } from "./firebase";
import { monthKeyOf } from "./format";
import type { BankaHesabi, Calisan, KasaKaydi } from "./types";

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
  yon: KasaKaydi["yon"];
}) {
  await ensureSignedIn();
  const now = Date.now();
  const durum: KasaKaydi["durum"] =
    input.alinanTutar >= input.toplamTutar && input.toplamTutar > 0
      ? "tamamlandi"
      : "aktif";
  return addDoc(collection(getDb(), KAYITLAR), {
    ...input,
    ay: monthKeyOf(input.tarih),
    durum,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateKasaKaydi(id: string, patch: Partial<KasaKaydi>) {
  await ensureSignedIn();
  const next = { ...patch, updatedAt: Date.now() };
  if (patch.tarih) next.ay = monthKeyOf(patch.tarih);
  return updateDoc(doc(getDb(), KAYITLAR, id), next);
}

export async function tahsilEt(id: string, mevcutAlinan: number, ekTutar: number, toplamTutar: number) {
  await ensureSignedIn();
  const yeniAlinan = mevcutAlinan + ekTutar;
  const durum: KasaKaydi["durum"] = yeniAlinan >= toplamTutar ? "tamamlandi" : "aktif";
  return updateDoc(doc(getDb(), KAYITLAR, id), {
    alinanTutar: yeniAlinan,
    durum,
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
