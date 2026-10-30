"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, onSnapshot, orderBy, query } from "firebase/firestore";
import { getDb, ensureSignedIn } from "./firebase";
import { BANKALAR, CALISANLAR, FIRMALAR, GORSELLER, KAYITLAR, ONIZLEMELER, SIPARISLER } from "./db";
import { tumHareketler } from "./hareketler";
import type { BankaHesabi, Calisan, Firma, Gorsel, KasaKaydi, Siparis } from "./types";

// Soft-deleted records are split off here, so no page or total ever counts them.
export function useKasaKayitlari() {
  const [tumu, setTumu] = useState<KasaKaydi[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe = () => {};
    ensureSignedIn().then(() => {
      const q = query(collection(getDb(), KAYITLAR), orderBy("tarih", "desc"));
      unsubscribe = onSnapshot(q, (snap) => {
        setTumu(snap.docs.map((d) => ({ id: d.id, ...d.data() } as KasaKaydi)));
        setLoading(false);
      });
    });
    return () => unsubscribe();
  }, []);

  const kayitlar = useMemo(() => tumu.filter((k) => !k.silindi), [tumu]);
  const silinenler = useMemo(() => tumu.filter((k) => k.silindi), [tumu]);

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

// Same split as useKasaKayitlari: deleted orders only show in Çöp Kutusu.
export function useSiparisler() {
  const [tumu, setTumu] = useState<Siparis[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe = () => {};
    ensureSignedIn().then(() => {
      unsubscribe = onSnapshot(collection(getDb(), SIPARISLER), (snap) => {
        setTumu(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Siparis)));
        setLoading(false);
      });
    });
    return () => unsubscribe();
  }, []);

  const siparisler = useMemo(
    () => tumu.filter((s) => !s.silindi).sort((a, b) => (a.tarih === b.tarih ? b.createdAt - a.createdAt : a.tarih < b.tarih ? 1 : -1)),
    [tumu]
  );
  const silinenler = useMemo(() => tumu.filter((s) => s.silindi), [tumu]);

  return { siparisler, silinenler, loading };
}

// Previews are fetched once per id and kept for the session; images never change after upload.
const onizlemeCache = new Map<string, Promise<string | null>>();

export function onizlemeGetir(id: string): Promise<string | null> {
  let p = onizlemeCache.get(id);
  if (!p) {
    p = ensureSignedIn()
      .then(() => getDoc(doc(getDb(), ONIZLEMELER, id)))
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
  const snap = await getDoc(doc(getDb(), GORSELLER, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Gorsel) : null;
}

export function useFirmalar() {
  const [firmalar, setFirmalar] = useState<Firma[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe = () => {};
    ensureSignedIn().then(() => {
      unsubscribe = onSnapshot(collection(getDb(), FIRMALAR), (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Firma));
        setFirmalar(list.sort((a, b) => a.ad.localeCompare(b.ad, "tr")));
        setLoading(false);
      });
    });
    return () => unsubscribe();
  }, []);

  return { firmalar, loading };
}

export function useBankaHesaplari() {
  const [hesaplar, setHesaplar] = useState<BankaHesabi[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe = () => {};
    ensureSignedIn().then(() => {
      unsubscribe = onSnapshot(collection(getDb(), BANKALAR), (snap) => {
        setHesaplar(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BankaHesabi)));
        setLoading(false);
      });
    });
    return () => unsubscribe();
  }, []);

  return { hesaplar, loading };
}

export function useCalisanlar() {
  const [calisanlar, setCalisanlar] = useState<Calisan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe = () => {};
    ensureSignedIn().then(() => {
      unsubscribe = onSnapshot(collection(getDb(), CALISANLAR), (snap) => {
        setCalisanlar(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Calisan)));
        setLoading(false);
      });
    });
    return () => unsubscribe();
  }, []);

  return { calisanlar, loading };
}
