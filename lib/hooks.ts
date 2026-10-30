"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { getDb, ensureSignedIn } from "./firebase";
import { BANKALAR, CALISANLAR, KAYITLAR } from "./db";
import { tumHareketler } from "./hareketler";
import type { BankaHesabi, Calisan, KasaKaydi } from "./types";

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
