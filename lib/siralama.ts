"use client";

// Column sorting shared by every table: a click on a header sorts ascending, the next descending, the
// third goes back to the page's own order. The choice is remembered per page on this device.
import { useCallback, useEffect, useState } from "react";

export type SiraYonu = "artan" | "azalan";
export interface Siralama {
  sutun: string;
  yon: SiraYonu;
}
export type SiraDegeri = string | number | null | undefined;
export type SiraSutunlari<T> = Record<string, (x: T) => SiraDegeri>;

// Turkish alphabet (Ç after C, İ after I…), case-insensitive, digits compared as numbers.
const harfSirasi = new Intl.Collator("tr", { sensitivity: "base", numeric: true });

function karsilastir(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return harfSirasi.compare(String(a), String(b));
}

// Stable: equal values keep the page's order. Empty values always go last.
export function sirala<T>(liste: T[], sira: Siralama | null, sutunlar: SiraSutunlari<T>): T[] {
  const al = sira && sutunlar[sira.sutun];
  if (!sira || !al) return liste;
  const yon = sira.yon === "artan" ? 1 : -1;
  return liste
    .map((x, i) => ({ x, i, v: al(x) }))
    .sort((a, b) => {
      const aBos = a.v == null || a.v === "";
      const bBos = b.v == null || b.v === "";
      if (aBos || bBos) return aBos && bBos ? a.i - b.i : aBos ? 1 : -1;
      return karsilastir(a.v!, b.v!) * yon || a.i - b.i;
    })
    .map((o) => o.x);
}

function oku(anahtar: string): Siralama | null {
  try {
    const v = JSON.parse(localStorage.getItem(anahtar) ?? "null");
    if (v && typeof v.sutun === "string" && (v.yon === "artan" || v.yon === "azalan")) return v;
  } catch {}
  return null;
}

export function useSiralama(sayfa: string) {
  const anahtar = `siralama.${sayfa}`;
  const [sira, setSira] = useState<Siralama | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from localStorage
    setSira(oku(anahtar));
  }, [anahtar]);

  const sirala = useCallback(
    (sutun: string) => {
      setSira((eski) => {
        const yeni: Siralama | null =
          eski?.sutun !== sutun ? { sutun, yon: "artan" } : eski.yon === "artan" ? { sutun, yon: "azalan" } : null;
        try {
          if (yeni) localStorage.setItem(anahtar, JSON.stringify(yeni));
          else localStorage.removeItem(anahtar);
        } catch {}
        return yeni;
      });
    },
    [anahtar]
  );

  return { sira, sirala };
}
