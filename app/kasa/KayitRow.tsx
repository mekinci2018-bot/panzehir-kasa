"use client";

import { useState } from "react";
import { formatTL } from "@/lib/format";
import type { KasaKaydi, OdemeSekli, Yon } from "@/lib/types";

export interface DraftKayit {
  tarih: string;
  firma: string;
  aciklama: string;
  toplamTutar: string;
  alinanTutar: string;
  odemeSekli: OdemeSekli;
  yon: Yon;
}

type RowValue = KasaKaydi | DraftKayit;

function isKayit(v: RowValue): v is KasaKaydi {
  return typeof (v as KasaKaydi).id === "string";
}

export default function KayitRow({
  value,
  isDraft = false,
  saving = false,
  onSave,
  onDelete,
  onDraftChange,
}: {
  value: RowValue;
  isDraft?: boolean;
  saving?: boolean;
  onSave: (patch: Partial<KasaKaydi>) => void;
  onDelete?: () => void;
  onDraftChange?: (patch: Partial<DraftKayit>) => void;
}) {
  const existing = !isDraft && isKayit(value) ? value : null;

  const [local, setLocal] = useState({
    tarih: value.tarih,
    firma: value.firma,
    aciklama: value.aciklama,
    toplamTutar: existing ? String(existing.toplamTutar) : (value as DraftKayit).toplamTutar,
    alinanTutar: existing ? String(existing.alinanTutar) : (value as DraftKayit).alinanTutar,
    odemeSekli: value.odemeSekli,
    yon: value.yon,
  });

  function set<K extends keyof typeof local>(key: K, v: (typeof local)[K]) {
    const next = { ...local, [key]: v };
    setLocal(next);
    if (isDraft) onDraftChange?.(next as Partial<DraftKayit>);
  }

  const kalan = (Number(local.toplamTutar) || 0) - (Number(local.alinanTutar) || 0);

  function handleSave() {
    if (isDraft) {
      onSave({});
      return;
    }
    onSave({
      tarih: local.tarih,
      firma: local.firma,
      aciklama: local.aciklama,
      toplamTutar: Number(local.toplamTutar) || 0,
      alinanTutar: Number(local.alinanTutar) || 0,
      odemeSekli: local.odemeSekli,
      yon: local.yon,
    });
  }

  return (
    <tr className="border-t border-[var(--border)] hover:bg-gray-50/60">
      <td className="px-4 py-2 align-top">
        <input
          type="date"
          className="input-sm"
          value={local.tarih}
          onChange={(e) => set("tarih", e.target.value)}
        />
      </td>
      <td className="px-4 py-2 align-top">
        <input
          className="input-sm font-medium"
          placeholder="Firma / Açıklama"
          value={local.firma}
          onChange={(e) => set("firma", e.target.value)}
        />
        <input
          className="input-sm text-xs text-[var(--muted)]"
          placeholder="açıklama (opsiyonel)"
          value={local.aciklama}
          onChange={(e) => set("aciklama", e.target.value)}
        />
      </td>
      <td className="px-4 py-2 align-top">
        <input
          type="number"
          className="input-sm"
          placeholder="0"
          value={local.toplamTutar}
          onChange={(e) => set("toplamTutar", e.target.value)}
        />
        {kalan !== 0 && !isDraft && (
          <div className="text-[11px] text-[var(--accent-amber)] px-2">
            Kalan: {formatTL(kalan)}
          </div>
        )}
      </td>
      <td className="px-4 py-2 align-top">
        <select
          className="select-pill w-full"
          value={local.odemeSekli}
          onChange={(e) => set("odemeSekli", e.target.value as OdemeSekli)}
        >
          <option value="nakit">Nakit</option>
          <option value="kart">Kart</option>
        </select>
      </td>
      <td className="px-4 py-2 align-top">
        <select
          className="select-pill w-full"
          value={local.yon}
          onChange={(e) => set("yon", e.target.value as Yon)}
        >
          <option value="gelen">Gelen</option>
          <option value="giden">Giden</option>
        </select>
      </td>
      <td className="px-4 py-2 align-top">
        <input
          type="number"
          className="input-sm"
          placeholder="0"
          value={local.alinanTutar}
          onChange={(e) => set("alinanTutar", e.target.value)}
        />
      </td>
      <td className="px-4 py-2 align-top">
        <div className="flex items-center gap-1 justify-end">
          <button
            className="icon-btn !text-[var(--accent-green)] disabled:opacity-40"
            onClick={handleSave}
            disabled={saving || (isDraft && !local.firma.trim())}
            title="Kaydet"
          >
            ✓
          </button>
          {!isDraft && onDelete && (
            <button className="icon-btn" onClick={onDelete} title="Sil">
              🗑
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
