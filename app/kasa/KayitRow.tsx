"use client";

import { useEffect, useState } from "react";
import { Check, Trash2 } from "lucide-react";
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

  useEffect(() => {
    if (!isDraft) return;
    const d = value as DraftKayit;
    setLocal({
      tarih: d.tarih,
      firma: d.firma,
      aciklama: d.aciklama,
      toplamTutar: d.toplamTutar,
      alinanTutar: d.alinanTutar,
      odemeSekli: d.odemeSekli,
      yon: d.yon,
    });
    // Resyncs after the parent resets this draft slot post-save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDraft, value]);

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

  function handleEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && local.firma.trim()) {
      e.preventDefault();
      handleSave();
    }
  }

  return (
    <tr className="border-t border-[var(--border)]">
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
          placeholder="Firma adı ya da kişi"
          value={local.firma}
          onChange={(e) => set("firma", e.target.value)}
          onKeyDown={handleEnter}
        />
        <input
          className="input-sm text-xs text-[var(--muted)]"
          placeholder="Açıklama (opsiyonel)"
          value={local.aciklama}
          onChange={(e) => set("aciklama", e.target.value)}
          onKeyDown={handleEnter}
        />
        {isDraft && !local.firma && (
          <div className="text-[10px] text-[var(--muted-soft)] px-2 mt-0.5">Enter ile kaydet</div>
        )}
      </td>
      <td className="px-4 py-2 align-top">
        <input
          type="number"
          className="input-sm"
          placeholder="Toplam ₺"
          value={local.toplamTutar}
          onChange={(e) => set("toplamTutar", e.target.value)}
          onKeyDown={handleEnter}
        />
        {kalan !== 0 && !isDraft && (
          <div className="text-[11px] text-[var(--accent-orange)] px-2 font-medium">
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
          className={`select-pill w-full ${local.yon === "gelen" ? "select-giris" : "select-cikis"}`}
          value={local.yon}
          onChange={(e) => set("yon", e.target.value as Yon)}
        >
          <option value="gelen">Giriş</option>
          <option value="giden">Çıkış</option>
        </select>
      </td>
      <td className="px-4 py-2 align-top">
        <input
          type="number"
          className="input-sm"
          placeholder="Peşin ₺"
          value={local.alinanTutar}
          onChange={(e) => set("alinanTutar", e.target.value)}
          onKeyDown={handleEnter}
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
            <Check className="w-4 h-4" />
          </button>
          {!isDraft && onDelete && (
            <button className="icon-btn hover:!text-[var(--brand)]" onClick={onDelete} title="Sil">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
