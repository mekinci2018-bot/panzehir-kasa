"use client";

import { useState } from "react";
import { todayISO } from "@/lib/format";
import { useCalisanlar, useFirmalar } from "@/lib/hooks";
import FirmaSecici, { type FirmaSecimi } from "./FirmaSecici";

export interface VeresiyeForm {
  tarih: string;
  firma: string;
  firmaId: string;
  personelId: string;
  aciklama: string;
  tutar: number;
  vadeTarihi: string; // "" when none
}

export default function VeresiyeModal({
  title,
  onClose,
  onConfirm,
}: {
  title: string;
  onClose: () => void;
  onConfirm: (form: VeresiyeForm) => Promise<void>;
}) {
  const [tarih, setTarih] = useState(todayISO());
  const { firmalar } = useFirmalar();
  const { calisanlar } = useCalisanlar();
  const [firma, setFirma] = useState<FirmaSecimi>({ firmaId: "", firma: "" });
  const [aciklama, setAciklama] = useState("");
  const [tutar, setTutar] = useState("");
  const [vadeTarihi, setVadeTarihi] = useState("");
  const [saving, setSaving] = useState(false);

  const gecerli = !!(firma.firmaId || firma.personelId) && Number(tutar) > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!gecerli || saving) return;
    setSaving(true);
    try {
      await onConfirm({ tarih, firma: firma.firma, firmaId: firma.firmaId, personelId: firma.personelId ?? "", aciklama: aciklama.trim(), tutar: Number(tutar), vadeTarihi });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
      <form className="card w-full max-w-md p-6 flex flex-col gap-4" onSubmit={submit}>
        <h3 className="font-semibold text-base">{title}</h3>

        <div>
          <label className="field-label">Firma / Kişi</label>
          <FirmaSecici value={firma} firmalar={firmalar} calisanlar={calisanlar} onChange={setFirma} className="input-field" placeholder="Firma adı ya da kişi" autoFocus />
        </div>
        <div>
          <label className="field-label">Açıklama</label>
          <input className="input-field" value={aciklama} onChange={(e) => setAciklama(e.target.value)} placeholder="Opsiyonel" />
        </div>
        <div>
          <label className="field-label">Tutar</label>
          <input type="number" className="input-field num" value={tutar} onChange={(e) => setTutar(e.target.value)} placeholder="0,00" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Tarih</label>
            <input type="date" className="input-field" value={tarih} onChange={(e) => setTarih(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Vade tarihi (opsiyonel)</label>
            <input type="date" className="input-field" value={vadeTarihi} min={tarih} onChange={(e) => setVadeTarihi(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-2 mt-2 justify-end">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Vazgeç
          </button>
          <button type="submit" className="btn-primary disabled:opacity-40" disabled={!gecerli || saving}>
            Kaydet
          </button>
        </div>
      </form>
    </div>
  );
}
