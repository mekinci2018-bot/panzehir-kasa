"use client";

import { useState } from "react";
import { firmalariBirlestir } from "@/lib/db";
import type { Firma, KasaKaydi, Siparis } from "@/lib/types";

// Merges two companies: every kayıt/sipariş moves to the one kept, the other is deleted (not even
// soft-deleted — kayıtlariBirlestir already carried its records away, so nothing is lost).
export default function FirmaBirlestirModal({
  firmalar,
  kayitlar,
  siparisler,
  onClose,
  onDone,
}: {
  firmalar: [Firma, Firma];
  kayitlar: KasaKaydi[];
  siparisler: Siparis[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [hedefId, setHedefId] = useState(firmalar[0].id);
  const [busy, setBusy] = useState(false);
  const hedef = firmalar.find((f) => f.id === hedefId)!;
  const kaynak = firmalar.find((f) => f.id !== hedefId)!;
  const sayi = (id: string) =>
    kayitlar.filter((k) => k.firmaId === id).length + siparisler.filter((s) => s.firmaId === id).length;

  async function birlestir() {
    setBusy(true);
    try {
      await firmalariBirlestir(
        kaynak,
        hedef,
        kayitlar.filter((k) => k.firmaId === kaynak.id).map((k) => k.id),
        siparisler.filter((s) => s.firmaId === kaynak.id).map((s) => s.id)
      );
      onDone();
    } catch (err) {
      console.error(err);
      alert("Birleştirilemedi, lütfen tekrar deneyin.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md p-6 flex flex-col gap-4">
        <h3 className="font-semibold text-base">Birleştir</h3>
        <p className="text-sm text-[var(--muted)]">Hangisi kalsın?</p>
        <div className="flex flex-col gap-2">
          {firmalar.map((f) => (
            <label
              key={f.id}
              className={`flex items-center justify-between gap-3 rounded-[10px] border px-4 py-3 cursor-pointer transition-colors ${
                f.id === hedefId ? "border-[var(--ink)] bg-[#f6f6f9]" : "border-[var(--border-strong)]"
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <input type="radio" className="accent-[var(--ink)]" checked={f.id === hedefId} onChange={() => setHedefId(f.id)} />
                <span className="font-medium truncate">{f.ad}</span>
              </span>
              <span className="text-xs text-[var(--muted)] shrink-0">{sayi(f.id)} kayıt</span>
            </label>
          ))}
        </div>
        <div className="rounded-[10px] bg-[var(--brand-soft)] px-4 py-3 text-sm text-[var(--brand-dark)]">
          <strong>{kaynak.ad}</strong> altındaki {sayi(kaynak.id)} kayıt ve sipariş <strong>{hedef.ad}</strong> altına aktarılacak ve{" "}
          <strong>{kaynak.ad}</strong> silinecek. Bu işlem geri alınamaz.
        </div>
        <div className="flex gap-2 justify-end">
          <button className="btn-secondary" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn-primary !bg-[var(--brand)] hover:!bg-[var(--brand-dark)] disabled:opacity-40"
            disabled={busy}
            onClick={birlestir}
          >
            Evet, birleştir
          </button>
        </div>
      </div>
    </div>
  );
}
