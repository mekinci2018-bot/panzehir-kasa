"use client";

import { formatDate, formatTL } from "@/lib/format";
import { URETIM_LABEL } from "@/lib/siparis";
import type { Siparis } from "@/lib/types";

// Seçilen firmanın son 3 siparişi: firma seçilince cari özetin altında görünür, tıklayınca detayı açılır.
export default function SonSiparisler({
  siparisler,
  firmaId,
  onSec,
}: {
  siparisler: Siparis[];
  firmaId: string;
  onSec: (id: string) => void;
}) {
  if (!firmaId) return null;
  const son3 = siparisler
    .filter((s) => s.firmaId === firmaId)
    .sort((a, b) => (a.tarih === b.tarih ? b.createdAt - a.createdAt : a.tarih < b.tarih ? 1 : -1))
    .slice(0, 3);
  if (son3.length === 0) return null;

  return (
    <ul className="mt-0.5 flex flex-col -mx-1">
      {son3.map((s) => (
        <li key={s.id}>
          <button
            type="button"
            tabIndex={-1}
            className="w-full text-left px-1.5 py-0.5 rounded-md hover:bg-[var(--surface-hover)] flex items-center gap-1.5 text-[11px] text-[var(--muted)]"
            onClick={(e) => {
              e.stopPropagation();
              onSec(s.id);
            }}
          >
            <span className="tabular shrink-0">{formatDate(s.tarih)}</span>
            <span className="truncate flex-1 min-w-0">{s.urun || "—"}</span>
            <span className="tabular shrink-0">{formatTL(s.tutar)}</span>
            <span className="shrink-0 text-[10px] text-[var(--muted-soft)]">{URETIM_LABEL[s.uretim]}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
