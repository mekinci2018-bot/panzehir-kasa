"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocFromCache,
  onSnapshot,
  orderBy,
  query,
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
} from "firebase/firestore";
import { getDb, ensureSignedIn, cikistaCalistir } from "./firebase";
import { BANKALAR, CALISANLAR, FIRMALAR, GORSELLER, KAYITLAR, ONIZLEMELER, SIPARISLER } from "./db";
import { tumHareketler } from "./hareketler";
import type { BankaHesabi, Calisan, Firma, Gorsel, KasaKaydi, Siparis, YedekDurumu } from "./types";

// ---- Shared listeners ----
// Each collection has one Firestore listener for the whole session, however many pages and modals
// use it, so moving between pages never re-reads. A listener nobody uses closes after a while;
// all of them close on lock (logout) and reopen from the local cache after unlock.

const KAPANMA_GECIKMESI_MS = 10 * 60 * 1000;

interface Durum<T> {
  veri: T[];
  loading: boolean;
}

interface Depo<T> {
  durum: Durum<T>;
  dinleyenler: Set<() => void>;
  kapat?: () => void;
  zamanlayici?: ReturnType<typeof setTimeout>;
}

const BOS: Durum<never> = { veri: [], loading: true };
const depolar = new Map<string, Depo<unknown>>();

function depoAl<T>(anahtar: string): Depo<T> {
  let d = depolar.get(anahtar) as Depo<T> | undefined;
  if (!d) {
    d = { durum: BOS, dinleyenler: new Set() };
    depolar.set(anahtar, d as Depo<unknown>);
  }
  return d;
}

function baslat<T>(d: Depo<T>, sorgu: () => Query, donustur: (veri: T[]) => T[]) {
  let iptal = false;
  let unsub = () => {};
  d.kapat = () => {
    iptal = true;
    unsub();
    d.kapat = undefined;
  };
  ensureSignedIn().then(() => {
    if (iptal) return;
    unsub = onSnapshot(
      sorgu(),
      (snap) => {
        d.durum = { veri: donustur(snap.docs.map((x) => ({ id: x.id, ...x.data() }) as T)), loading: false };
        d.dinleyenler.forEach((f) => f());
      },
      (err) => {
        // Usually permission-denied right after locking; the next subscriber starts a fresh listener.
        console.error(err);
        d.kapat?.();
        d.durum = { ...d.durum, loading: false };
        d.dinleyenler.forEach((f) => f());
      }
    );
  });
}

function abone<T>(anahtar: string, sorgu: () => Query, donustur: (veri: T[]) => T[], bildir: () => void) {
  const d = depoAl<T>(anahtar);
  d.dinleyenler.add(bildir);
  if (d.zamanlayici) clearTimeout(d.zamanlayici);
  d.zamanlayici = undefined;
  if (!d.kapat) baslat(d, sorgu, donustur);
  return () => {
    d.dinleyenler.delete(bildir);
    if (d.dinleyenler.size === 0) d.zamanlayici = setTimeout(() => d.kapat?.(), KAPANMA_GECIKMESI_MS);
  };
}

function anlik<T>(anahtar: string): Durum<T> {
  return depoAl<T>(anahtar).durum;
}

function useKoleksiyon<T>(anahtar: string, sorgu: () => Query, donustur: (veri: T[]) => T[] = (v) => v): Durum<T> {
  return useSyncExternalStore(
    (bildir) => abone(anahtar, sorgu, donustur, bildir),
    () => anlik<T>(anahtar),
    () => BOS as Durum<T>
  );
}

cikistaCalistir(() => {
  for (const d of depolar.values()) {
    if (d.zamanlayici) clearTimeout(d.zamanlayici);
    d.kapat?.();
  }
  depolar.clear();
});

// ---- Collections ----

// Soft-deleted records are split off here, so no page or total ever counts them.
export function useKasaKayitlari() {
  const { veri, loading } = useKoleksiyon<KasaKaydi>(KAYITLAR, () =>
    query(collection(getDb(), KAYITLAR), orderBy("tarih", "desc"))
  );
  const kayitlar = useMemo(() => veri.filter((k) => !k.silindi), [veri]);
  const silinenler = useMemo(() => veri.filter((k) => k.silindi), [veri]);
  return { kayitlar, silinenler, loading };
}

// Previously typed "Nereye çekildi?" values, most used first, for autocomplete.
export function kartOnerileri(kayitlar: KasaKaydi[]): string[] {
  const sayac = new Map<string, number>();
  for (const h of tumHareketler(kayitlar)) {
    if (h.odemeSekli !== "kart" || !h.kartAciklama) continue;
    sayac.set(h.kartAciklama, (sayac.get(h.kartAciklama) ?? 0) + 1);
  }
  return [...sayac.entries()].sort((a, b) => b[1] - a[1]).map(([ad]) => ad);
}

const siparisSirala = (v: Siparis[]) =>
  v.sort((a, b) => (a.tarih === b.tarih ? b.createdAt - a.createdAt : a.tarih < b.tarih ? 1 : -1));

// Same split as useKasaKayitlari: deleted orders only show in Çöp Kutusu.
export function useSiparisler() {
  const { veri, loading } = useKoleksiyon<Siparis>(SIPARISLER, () => collection(getDb(), SIPARISLER), siparisSirala);
  const siparisler = useMemo(() => veri.filter((s) => !s.silindi), [veri]);
  const silinenler = useMemo(() => veri.filter((s) => s.silindi), [veri]);
  return { siparisler, silinenler, loading };
}

const firmaSirala = (v: Firma[]) => v.sort((a, b) => a.ad.localeCompare(b.ad, "tr"));

export function useFirmalar() {
  const { veri, loading } = useKoleksiyon<Firma>(FIRMALAR, () => collection(getDb(), FIRMALAR), firmaSirala);
  return { firmalar: veri, loading };
}

export function useBankaHesaplari() {
  const { veri, loading } = useKoleksiyon<BankaHesabi>(BANKALAR, () => collection(getDb(), BANKALAR));
  return { hesaplar: veri, loading };
}

export function useCalisanlar() {
  const { veri, loading } = useKoleksiyon<Calisan>(CALISANLAR, () => collection(getDb(), CALISANLAR));
  return { calisanlar: veri, loading };
}

// The backup status document (written by the server after every backup), shown in the menu.
export function useYedekDurumu() {
  const { veri, loading } = useKoleksiyon<YedekDurumu & { id: string }>("sistem", () => collection(getDb(), "sistem"));
  return { durum: veri.find((d) => d.id === "yedek") ?? null, loading };
}

// ---- Images ----
// Images never change after upload, so they are read from the local cache first and only go to the
// server the first time. Tables load previews only; the full image is fetched when opened.

function onceOnbellek(ref: DocumentReference): Promise<DocumentSnapshot> {
  return getDocFromCache(ref).catch(() => getDoc(ref));
}

const onizlemeCache = new Map<string, Promise<string | null>>();

export function onizlemeGetir(id: string): Promise<string | null> {
  let p = onizlemeCache.get(id);
  if (!p) {
    p = ensureSignedIn()
      .then(() => onceOnbellek(doc(getDb(), ONIZLEMELER, id)))
      .then((snap) => (snap.exists() ? (snap.data().onizleme as string) : null))
      .catch((err) => {
        console.error(err);
        onizlemeCache.delete(id);
        return null;
      });
    onizlemeCache.set(id, p);
  }
  return p;
}

export async function gorselGetir(id: string): Promise<Gorsel | null> {
  await ensureSignedIn();
  const snap = await onceOnbellek(doc(getDb(), GORSELLER, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Gorsel) : null;
}
