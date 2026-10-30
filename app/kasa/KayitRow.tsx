"use client";

import { Check } from "lucide-react";
import type { BankaHesabi, Calisan, Firma, OdemeSekli, Yon } from "@/lib/types";
import OdemeSekliSelect from "@/components/OdemeSekliSelect";
import FirmaSecici from "@/components/FirmaSecici";

export interface DraftKayit {
  tarih: string;
  firma: string;
  firmaId: string; // a company or an employee (personelId) is required to save
  personelId: string;
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
  firmalar,
  calisanlar,
  cariOzet,
  kartOnerileri,
  onSave,
  onChange,
}: {
  value: DraftKayit;
  hesaplar: BankaHesabi[];
  firmalar: Firma[];
  calisanlar: Calisan[];
  cariOzet?: string; // live balance summary of the chosen company
  kartOnerileri: string[];
  onSave: () => void;
  onChange: (patch: Partial<DraftKayit>) => void;
}) {
  function set<K extends keyof DraftKayit>(key: K, v: DraftKayit[K]) {
    onChange({ [key]: v } as Partial<DraftKayit>);
  }

  const bagli = !!(value.firmaId || value.personelId);

  // Enter anywhere in the row saves it, like committing a spreadsheet row. Without a company from
  // the list, Enter sends the cursor back to the company cell instead.
  function handleKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>) {
    if (e.key !== "Enter" || (e.target as HTMLElement).tagName === "BUTTON") return;
    e.preventDefault();
    if (bagli) onSave();
    else if (value.firma.trim()) {
      const firmaInput = e.currentTarget.querySelector<HTMLInputElement>("input[data-field=firma]");
      firmaInput?.focus();
      firmaInput?.click();
    }
  }

  return (
    <tr className="kasa-row" data-draft="" onKeyDown={handleKeyDown}>
      <td className="align-top">
        <FirmaSecici
          value={{ firmaId: value.firmaId, personelId: value.personelId, firma: value.firma }}
          firmalar={firmalar}
          calisanlar={calisanlar}
          placeholder="Firma adı ya da kişi"
          onChange={(v) => onChange({ firmaId: v.firmaId, personelId: v.personelId ?? "", firma: v.firma })}
        />
        {bagli && cariOzet && (
          <div className="px-2 text-[11px] text-[var(--muted)] tabular truncate">{cariOzet}</div>
        )}
        {!bagli && value.firma.trim() && (
          <div className="px-2 text-[11px] text-[var(--accent-orange)]">Listeden seçin ya da yeni firma ekleyin</div>
        )}
        <input
          className="input-sm text-xs text-[var(--muted)]"
          placeholder="Açıklama (opsiyonel)"
          value={value.aciklama}
          onChange={(e) => set("aciklama", e.target.value)}
        />
      </td>
      <td className="align-top">
        <input
          type="date"
          className="input-sm"
          tabIndex={-1}
          value={value.tarih}
          onChange={(e) => set("tarih", e.target.value)}
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
            disabled={!bagli}
            title={bagli ? "Arşive kaydet (Enter)" : "Önce listeden firma seçin"}
          >
            <Check className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
