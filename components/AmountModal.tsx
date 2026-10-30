"use client";

import { useState } from "react";
import { formatTL } from "@/lib/format";
import type { BankaHesabi } from "@/lib/types";
import OdemeSekliSelect, { type OdemeSecimi } from "./OdemeSekliSelect";

export default function AmountModal({
  title,
  kalan,
  hesaplar,
  kartOnerileri,
  defaultSecim,
  onClose,
  onConfirm,
}: {
  title: string;
  kalan: number;
  hesaplar: BankaHesabi[];
  kartOnerileri?: string[];
  defaultSecim: OdemeSecimi;
  onClose: () => void;
  onConfirm: (amount: number, secim: OdemeSecimi) => void;
}) {
  const [value, setValue] = useState(String(kalan));
  const [secim, setSecim] = useState<OdemeSecimi>(defaultSecim);

  function confirm() {
    const amount = Number(value);
    if (amount > 0) onConfirm(amount, secim);
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md p-6">
        <h3 className="font-semibold text-base mb-1">{title}</h3>
        <p className="text-sm text-[var(--muted)] mb-5">
          Kalan tutar: <span className="num text-[var(--foreground)]">{formatTL(kalan)}</span>
        </p>

        <label className="field-label">Tutar</label>
        <input
          type="number"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && confirm()}
          className="input-field num text-lg"
        />

        <label className="field-label mt-4">Ödeme şekli</label>
        <OdemeSekliSelect value={secim} hesaplar={hesaplar} kartOnerileri={kartOnerileri} onChange={setSecim} size="md" />

        <div className="flex gap-2 mt-6 justify-end">
          <button className="btn-secondary" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn-primary" onClick={confirm}>
            Onayla
          </button>
        </div>
      </div>
    </div>
  );
}
