"use client";

import { useEffect, useState } from "react";

// Kendiliğinden olan bir işin sonucunu söyleyen kısa şerit: "₺15.000,00 → 2 siparişe dağıtıldı".
// Pencereler değişmesin diye ayrı bir katman; `bildir()` her yerden çağrılabilir (lib'den de,
// React dışından da). Kasa'daki "Arşive kaydedildi · Geri al" şeridiyle aynı yerde ve biçimde.

type Dinleyici = (mesaj: string) => void;

let dinleyici: Dinleyici | null = null;

export function bildir(mesaj: string) {
  dinleyici?.(mesaj);
}

const SURE_MS = 5000;

export default function Bildirimler() {
  const [mesaj, setMesaj] = useState<{ metin: string; key: number } | null>(null);

  useEffect(() => {
    dinleyici = (metin) => setMesaj({ metin, key: Date.now() });
    return () => {
      dinleyici = null;
    };
  }, []);

  useEffect(() => {
    if (!mesaj) return;
    const t = setTimeout(() => setMesaj(null), SURE_MS);
    return () => clearTimeout(t);
  }, [mesaj]);

  if (!mesaj) return null;

  return (
    <div
      key={mesaj.key}
      role="status"
      className="toast-in print:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 rounded-xl bg-[var(--ink)] text-white px-4 py-2 text-sm shadow-[var(--shadow-pop)]"
    >
      <span className="tabular">{mesaj.metin}</span>
      <button
        className="text-white/60 hover:text-white transition-colors"
        aria-label="Kapat"
        onClick={() => setMesaj(null)}
      >
        ×
      </button>
    </div>
  );
}
