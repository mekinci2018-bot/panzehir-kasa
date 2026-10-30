import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  runTransaction,
  updateDoc,
  writeBatch,
  type DocumentReference,
  type Transaction,
} from "firebase/firestore";
import { getDb, ensureSignedIn } from "./firebase";
import { monthKeyOf, todayISO } from "./format";
import { firmaAdiDuzenle, firmaAnahtari } from "./firma";
import type { BankaHesabi, Calisan, Firma, FirmaTuru, KasaKaydi, Odeme } from "./types";

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
const FIRMALAR = "firmalar";
const FIRMA_ADLARI = "firmaAdlari";

export async function addKasaKaydi(input: {
  tarih: string;
  firma: string;
  firmaId?: string;
  personelId?: string;
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
  const { bankaHesapId, kartAciklama, kaynak, vadeTarihi, firmaId, personelId, ...rest } = input;
  const durum: KasaKaydi["durum"] =
    input.alinanTutar >= input.toplamTutar && input.toplamTutar > 0
      ? "tamamlandi"
      : "aktif";
  return addDoc(collection(getDb(), KAYITLAR), {
    ...rest,
    ...odemeAlanlari(rest.odemeSekli, bankaHesapId, kartAciklama),
    ...(firmaId ? { firmaId } : {}),
    ...(personelId ? { personelId } : {}),
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
  // A record links to a company or an employee; "" clears the link.
  if ("firmaId" in patch && !patch.firmaId) next.firmaId = deleteField();
  if ("personelId" in patch && !patch.personelId) next.personelId = deleteField();
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
  const now = Date.now();
  return updateDoc(doc(getDb(), KAYITLAR, id), { durum: "arsiv", arsivTarihi: now, updatedAt: now });
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
// Firestore batches hold at most 500 writes.
async function topluGuncelle(islemler: { ref: DocumentReference; data?: Record<string, unknown>; sil?: boolean }[]) {
  for (let i = 0; i < islemler.length; i += 450) {
    const batch = writeBatch(getDb());
    for (const op of islemler.slice(i, i + 450)) {
      if (op.sil) batch.delete(op.ref);
      else batch.update(op.ref, op.data!);
    }
    await batch.commit();
  }
}

export class FirmaZatenVar extends Error {
  constructor(public firma: Firma) {
    super(`"${firma.ad}" zaten kayıtlı.`);
  }
}

// One lock document per normalized name (firmaAdlari/{anahtar}). Creating a company and its lock in
// one transaction means two devices adding the same name at once can't both succeed: the second
// transaction re-reads the lock, finds it taken and fails with FirmaZatenVar.
async function kilitSahibi(tx: Transaction, anahtar: string, mevcut: Firma[]): Promise<Firma | null> {
  const kilit = await tx.get(doc(getDb(), FIRMA_ADLARI, anahtar));
  if (kilit.exists()) {
    const id = kilit.data().firmaId as string;
    const bilinen = mevcut.find((f) => f.id === id);
    if (bilinen) return bilinen;
    const snap = await tx.get(doc(getDb(), FIRMALAR, id));
    if (snap.exists()) return { id, ...snap.data() } as Firma;
    return null; // a stale lock left by a removed company
  }
  // Companies created before locks existed are still checked from the loaded list.
  return mevcut.find((f) => f.anahtar === anahtar && !f.kilitli) ?? null;
}

export async function addFirma(
  ad: string,
  mevcut: Firma[],
  ek: { tur?: FirmaTuru; telefon?: string; not?: string } = {}
): Promise<Firma> {
  await ensureSignedIn();
  const temiz = firmaAdiDuzenle(ad);
  const anahtar = firmaAnahtari(temiz);
  if (!anahtar) throw new Error("Firma adı boş olamaz.");
  const ref = doc(collection(getDb(), FIRMALAR));
  const now = Date.now();
  const data = {
    ad: temiz,
    anahtar,
    tur: ek.tur ?? "musteri",
    kilitli: true,
    ...(ek.telefon?.trim() ? { telefon: ek.telefon.trim() } : {}),
    ...(ek.not?.trim() ? { not: ek.not.trim() } : {}),
    createdAt: now,
    updatedAt: now,
  } as const;
  await runTransaction(getDb(), async (tx) => {
    const sahip = await kilitSahibi(tx, anahtar, mevcut);
    if (sahip) throw new FirmaZatenVar(sahip);
    tx.set(doc(getDb(), FIRMA_ADLARI, anahtar), { firmaId: ref.id });
    tx.set(ref, data);
  });
  return { id: ref.id, ...data };
}

// A rename moves the lock to the new name and updates the display name on every linked record.
export async function updateFirma(
  firma: Firma,
  patch: { ad: string; tur: FirmaTuru; telefon: string; not: string },
  mevcut: Firma[],
  bagliKayitlar: KasaKaydi[]
) {
  await ensureSignedIn();
  const ad = firmaAdiDuzenle(patch.ad);
  const anahtar = firmaAnahtari(ad);
  if (!anahtar) throw new Error("Firma adı boş olamaz.");
  await runTransaction(getDb(), async (tx) => {
    if (anahtar !== firma.anahtar || !firma.kilitli) {
      const sahip = await kilitSahibi(tx, anahtar, mevcut.filter((f) => f.id !== firma.id));
      if (sahip && sahip.id !== firma.id) throw new FirmaZatenVar(sahip);
      if (anahtar !== firma.anahtar) tx.delete(doc(getDb(), FIRMA_ADLARI, firma.anahtar));
      tx.set(doc(getDb(), FIRMA_ADLARI, anahtar), { firmaId: firma.id });
    }
    tx.update(doc(getDb(), FIRMALAR, firma.id), {
      ad,
      anahtar,
      tur: patch.tur,
      kilitli: true,
      telefon: patch.telefon.trim() || deleteField(),
      not: patch.not.trim() || deleteField(),
      updatedAt: Date.now(),
    });
  });
  if (ad !== firma.ad) {
    await topluGuncelle(
      bagliKayitlar.map((k) => ({ ref: doc(getDb(), KAYITLAR, k.id), data: { firma: ad, updatedAt: Date.now() } }))
    );
  }
}

// Gives companies created before locks existed their lock. A name already locked by another company
// is a duplicate pair; it is left for the user to merge.
export async function kilitleriTamamla(firmalar: Firma[]) {
  await ensureSignedIn();
  for (const f of firmalar.filter((x) => !x.kilitli)) {
    await runTransaction(getDb(), async (tx) => {
      const kilitRef = doc(getDb(), FIRMA_ADLARI, f.anahtar);
      const kilit = await tx.get(kilitRef);
      if (kilit.exists() && kilit.data().firmaId !== f.id) return;
      if (!kilit.exists()) tx.set(kilitRef, { firmaId: f.id });
      tx.update(doc(getDb(), FIRMALAR, f.id), { kilitli: true });
    });
  }
}

// Links free-text records (the "eşleştir" step) to a company.
export async function kayitlariFirmayaBagla(kayitIds: string[], firma: Pick<Firma, "id" | "ad">) {
  await ensureSignedIn();
  await topluGuncelle(
    kayitIds.map((id) => ({
      ref: doc(getDb(), KAYITLAR, id),
      data: { firmaId: firma.id, firma: firma.ad, updatedAt: Date.now() },
    }))
  );
}

// Moves everything from kaynak to hedef, then removes kaynak and its name lock.
export async function firmalariBirlestir(kaynak: Firma, hedef: Firma, kaynakKayitIds: string[]) {
  await ensureSignedIn();
  await kayitlariFirmayaBagla(kaynakKayitIds, hedef);
  await runTransaction(getDb(), async (tx) => {
    const kilitRef = doc(getDb(), FIRMA_ADLARI, kaynak.anahtar);
    const kilit = await tx.get(kilitRef);
    if (kilit.exists() && kilit.data().firmaId === kaynak.id) tx.delete(kilitRef);
    tx.delete(doc(getDb(), FIRMALAR, kaynak.id));
  });
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

export { KAYITLAR, BANKALAR, CALISANLAR, FIRMALAR, FIRMA_ADLARI };
