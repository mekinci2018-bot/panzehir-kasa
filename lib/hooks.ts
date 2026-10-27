"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { getDb, ensureSignedIn } from "./firebase";
import { BANKALAR, CALISANLAR, KAYITLAR } from "./db";
import type { BankaHesabi, Calisan, KasaKaydi } from "./types";

export function useKasaKayitlari() {
  const [kayitlar, setKayitlar] = useState<KasaKaydi[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe = () => {};
    ensureSignedIn().then(() => {
      const q = query(collection(getDb(), KAYITLAR), orderBy("tarih", "desc"));
      unsubscribe = onSnapshot(q, (snap) => {
        setKayitlar(snap.docs.map((d) => ({ id: d.id, ...d.data() } as KasaKaydi)));
        setLoading(false);
      });
    });
    return () => unsubscribe();
  }, []);

  return { kayitlar, loading };
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
