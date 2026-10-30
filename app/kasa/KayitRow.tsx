"use client";

import { Check } from "lucide-react";
import type { BankaHesabi, OdemeSekli, Yon } from "@/lib/types";
import OdemeSekliSelect from "@/components/OdemeSekliSelect";

export interface DraftKayit {
  tarih: string;
  firma: string;
  aciklama: string;
  toplamTutar: string;
  alinanTutar: string;
  odemeSekli: OdemeSekli;
  bankaHesapId: string;
  kartAciklama: string;
  yon: Yon;
}

// An empty entry row. Saved records leave the Kasa table for Arşiv; they are edited from the detail window.
export default function KayitRow({
  value,
  hesaplar,
  kartOnerileri,
  onSave,
  onChange,
}: {
  value: DraftKayit;
  hesaplar: BankaHesabi[];
  kartOnerileri: string[];
  onSave: () => void;
  onChange: (patch: Partial<DraftKayit>) => void;
}) {
  function set<K extends keyof DraftKayit>(key: K, v: DraftKayit[K]) {
    onChange({ [key]: v } as Partial<DraftKayit>);
  }

  // Enter anywhere in the row saves it, like committing a spreadsheet row.
  function handleKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>) {
    if (e.key !== "Enter" || (e.target as HTMLElement).tagName === "BUTTON") return;
    e.preventDefault();
    if (value.firma.trim()) onSave();
  }

  return (
    <tr className="kasa-row" data-draft="" onKeyDown={handleKeyDown}>
      <td className="align-top">
        <input
          type="date"
          className="input-sm"
          value={value.tarih}
          onChange={(e) => set("tarih", e.target.value)}
        />
      </td>
      <td className="align-top">
        <input
          className="input-sm font-medium"
          data-field="firma"
          placeholder="Firma adı ya da kişi"
          value={value.firma}
          onChange={(e) => set("firma", e.target.value)}
        />
        <input
          className="input-sm text-xs text-[var(--muted)]"
          placeholder="Açıklama (opsiyonel)"
          value={value.aciklama}
          onChange={(e) => set("aciklama", e.target.value)}
        />
      </td>
      <td className="align-top">
        <input
          type="number"
          className="input-sm num"
          placeholder="0,00"
          value={value.toplamTutar}
          onChange={(e) => set("toplamTutar", e.target.value)}
        />
      </td>
      <td className="align-top">
        <OdemeSekliSelect
          value={{ odemeSekli: value.odemeSekli, bankaHesapId: value.bankaHesapId, kartAciklama: value.kartAciklama }}
          hesaplar={hesaplar}
          kartOnerileri={kartOnerileri}
          onChange={(v) => onChange(v)}
        />
      </td>
      <td className="align-top">
        <select
          className={`select-field w-full ${value.yon === "gelen" ? "select-giris" : "select-cikis"}`}
          value={value.yon}
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
          value={value.alinanTutar}
          onChange={(e) => set("alinanTutar", e.target.value)}
        />
      </td>
      <td className="align-top">
        <div className="flex items-center justify-end">
          <button
            tabIndex={-1}
            className="icon-btn hover:!text-[var(--accent-green)] disabled:opacity-30"
            onClick={onSave}
            disabled={!value.firma.trim()}
            title="Arşive kaydet (Enter)"
          >
            <Check className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
