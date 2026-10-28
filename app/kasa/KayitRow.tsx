"use client";

import { useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { formatDate, formatTL } from "@/lib/format";
import type { BankaHesabi, KasaKaydi, OdemeSekli, Yon } from "@/lib/types";
import OdemeSekliSelect from "@/components/OdemeSekliSelect";

export interface DraftKayit {
  tarih: string;
  firma: string;
  aciklama: string;
  toplamTutar: string;
  alinanTutar: string;
  odemeSekli: OdemeSekli;
  bankaHesapId: string;
  yon: Yon;
}

type RowValue = KasaKaydi | DraftKayit;

function isKayit(v: RowValue): v is KasaKaydi {
  return typeof (v as KasaKaydi).id === "string";
}

function toLocal(value: RowValue, existing: KasaKaydi | null): DraftKayit {
  return {
    tarih: value.tarih,
    firma: value.firma,
    aciklama: value.aciklama,
    toplamTutar: existing ? String(existing.toplamTutar) : (value as DraftKayit).toplamTutar,
    alinanTutar: existing ? String(existing.alinanTutar) : (value as DraftKayit).alinanTutar,
    odemeSekli: value.odemeSekli,
    bankaHesapId: value.bankaHesapId ?? "",
    yon: value.yon,
  };
}

export default function KayitRow({
  value,
  hesaplar,
  isDraft = false,
  saving = false,
  onSave,
  onDelete,
  onDraftChange,
}: {
  value: RowValue;
  hesaplar: BankaHesabi[];
  isDraft?: boolean;
  saving?: boolean;
  onSave: (patch: Partial<KasaKaydi>) => void;
  onDelete?: () => void;
  onDraftChange?: (patch: Partial<DraftKayit>) => void;
}) {
  const existing = !isDraft && isKayit(value) ? value : null;

  // Rows always render the live Firestore value; only fields the user is editing are overlaid,
  // so changes from other pages or another user show up immediately. Drafts live in the parent.
  const [edits, setEdits] = useState<Partial<DraftKayit>>({});
  const local: DraftKayit = { ...toLocal(value, existing), ...edits };

  function update(patch: Partial<DraftKayit>) {
    if (isDraft) onDraftChange?.(patch);
    else setEdits((prev) => ({ ...prev, ...patch }));
  }

  function set<K extends keyof DraftKayit>(key: K, v: DraftKayit[K]) {
    update({ [key]: v } as Partial<DraftKayit>);
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
      bankaHesapId: local.bankaHesapId || undefined,
      yon: local.yon,
    });
    setEdits({});
  }

  // Enter anywhere in the row saves it, like committing a spreadsheet row.
  function handleKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>) {
    if (e.key !== "Enter" || (e.target as HTMLElement).tagName === "BUTTON") return;
    e.preventDefault();
    if (local.firma.trim()) handleSave();
  }

  return (
    <tr className="kasa-row" data-draft={isDraft ? "" : undefined} onKeyDown={handleKeyDown}>
      <td className="align-top">
        <input
          type="date"
          className="input-sm"
          value={local.tarih}
          onChange={(e) => set("tarih", e.target.value)}
        />
      </td>
      <td className="align-top">
        <div className="flex items-center gap-1.5">
          <input
            className="input-sm font-medium"
            data-field="firma"
            placeholder="Firma adı ya da kişi"
            value={local.firma}
            onChange={(e) => set("firma", e.target.value)}
          />
          {existing?.kaynak === "veresiye" && (
            <span
              className="badge badge-veresiye shrink-0"
              title={existing.vadeTarihi ? `Vade: ${formatDate(existing.vadeTarihi)}` : "Alacaklar/Borçlar'dan eklendi"}
            >
              Veresiye
            </span>
          )}
        </div>
        <input
          className="input-sm text-xs text-[var(--muted)]"
          placeholder="Açıklama (opsiyonel)"
          value={local.aciklama}
          onChange={(e) => set("aciklama", e.target.value)}
        />
      </td>
      <td className="align-top">
        <input
          type="number"
          className="input-sm num"
          placeholder="0,00"
          value={local.toplamTutar}
          onChange={(e) => set("toplamTutar", e.target.value)}
        />
        {kalan !== 0 && !isDraft && (
          <div className="text-[11px] text-[var(--accent-orange)] px-2 num">Kalan {formatTL(kalan)}</div>
        )}
      </td>
      <td className="align-top">
        <OdemeSekliSelect
          value={{ odemeSekli: local.odemeSekli, bankaHesapId: local.bankaHesapId }}
          hesaplar={hesaplar}
          onChange={(v) => update(v)}
        />
      </td>
      <td className="align-top">
        <select
          className={`select-field w-full ${local.yon === "gelen" ? "select-giris" : "select-cikis"}`}
          value={local.yon}
          onChange={(e) => set("yon", e.target.value as Yon)}
        >
          <option value="gelen">Giriş</option>
          <option value="giden">Çıkış</option>
        </select>
      </td>
      <td className="align-top">
        <input
          type="number"
          className="input-sm num"
          placeholder="0,00"
          value={local.alinanTutar}
          onChange={(e) => set("alinanTutar", e.target.value)}
        />
      </td>
      <td className="align-top">
        <div className="flex items-center gap-1 justify-end">
          <button
            tabIndex={-1}
            className={`icon-btn hover:!text-[var(--accent-green)] disabled:opacity-30 ${
              Object.keys(edits).length > 0 ? "!text-[var(--accent-green)] bg-[var(--accent-green-soft)]" : ""
            }`}
            onClick={handleSave}
            disabled={saving || (isDraft && !local.firma.trim())}
            title="Kaydet (Enter)"
          >
            <Check className="w-4 h-4" />
          </button>
          {!isDraft && onDelete && (
            <button
              tabIndex={-1}
              className="icon-btn hover:!text-[var(--brand)]"
              onClick={onDelete}
              title="Sil"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
