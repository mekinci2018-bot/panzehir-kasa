"use client";

import { useState } from "react";
import { formatTL } from "@/lib/format";

export default function AmountModal({
  title,
  kalan,
  onClose,
  onConfirm,
}: {
  title: string;
  kalan: number;
  onClose: () => void;
  onConfirm: (amount: number) => void;
}) {
  const [value, setValue] = useState(String(kalan));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-sm p-6 bg-white">
        <h3 className="font-bold text-lg mb-1">{title}</h3>
        <p className="text-sm text-[var(--muted)] mb-4">Kalan tutar: {formatTL(kalan)}</p>
        <input
          type="number"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-lg font-semibold"
        />
        <div className="flex gap-2 mt-5 justify-end">
          <button className="btn-secondary" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              const amount = Number(value);
              if (amount > 0) onConfirm(amount);
            }}
          >
            Onayla
          </button>
        </div>
      </div>
    </div>
  );
}
