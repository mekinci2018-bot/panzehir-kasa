"use client";

import { useState } from "react";
import Link from "next/link";
import { addFirma, FirmaZatenVar, updateFirma } from "@/lib/db";
import { benzerFirmalar, FIRMA_TURU_LABEL, firmaAdiDuzenle, firmaAnahtari, firmaTuru } from "@/lib/firma";
import type { Firma, FirmaTuru, KasaKaydi } from "@/lib/types";

const SEKMELER: { tur: FirmaTuru; label: string }[] = [
  { tur: "musteri", label: "Müşteriler" },
  { tur: "tedarikci", label: "Tedarikçiler" },
  { tur: "gider", label: "Gider Kalemleri" },
];

export function TurSecici({ value, onChange, size = "md" }: { value: FirmaTuru; onChange: (t: FirmaTuru) => void; size?: "sm" | "md" }) {
  return (
    <div className={`inline-flex rounded-[9px] border border-[var(--border-strong)] p-0.5 bg-[#f6f6f8] ${size === "sm" ? "text-xs" : "text-[13px]"}`}>
      {SEKMELER.map((s) => (
        <button
          key={s.tur}
          type="button"
          className={`px-2.5 py-1 rounded-[7px] font-medium transition-colors ${
            value === s.tur ? "bg-white shadow-sm text-[var(--foreground)]" : "text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
          onClick={() => onChange(s.tur)}
        >
          {FIRMA_TURU_LABEL[s.tur]}
        </button>
      ))}
    </div>
  );
}

// Add or edit a company. Editing is always passed `firma`; `varsayilanTur` only matters for "new".
export default function FirmaFormModal({
  firma,
  varsayilanTur = "musteri",
  firmalar,
  bagliKayitlar,
  bagliSiparisIds,
  onClose,
}: {
  firma?: Firma;
  varsayilanTur?: FirmaTuru;
  firmalar: Firma[];
  bagliKayitlar: KasaKaydi[];
  bagliSiparisIds: string[];
  onClose: () => void;
}) {
  const [ad, setAd] = useState(firma?.ad ?? "");
  const [tur, setTur] = useState<FirmaTuru>(firma ? firmaTuru(firma) : varsayilanTur);
  const [telefon, setTelefon] = useState(firma?.telefon ?? "");
  const [not, setNot] = useState(firma?.not ?? "");
  const [benzerler, setBenzerler] = useState<Firma[] | null>(null);
  const [hata, setHata] = useState<{ mesaj: string; firma?: Firma } | null>(null);
  const [busy, setBusy] = useState(false);

  async function kaydet(zorla = false) {
    if (!firmaAnahtari(ad) || busy) return;
    setHata(null);
    // Expense items skip the near-duplicate check; an exact duplicate is still refused.
    if (!firma && !zorla && tur !== "gider") {
      const b = benzerFirmalar(ad, firmalar);
      if (b.length > 0) {
        setBenzerler(b);
        return;
      }
    }
    setBusy(true);
    try {
      if (firma) await updateFirma(firma, { ad, tur, telefon, not }, firmalar, bagliKayitlar, bagliSiparisIds);
      else await addFirma(ad, firmalar, { tur, telefon, not });
      onClose();
    } catch (err) {
      if (err instanceof FirmaZatenVar) setHata({ mesaj: "Bu adla bir kayıt zaten var:", firma: err.firma });
      else {
        console.error(err);
        setHata({ mesaj: "Kaydedilemedi, lütfen tekrar deneyin." });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
      <form
        className="card w-full max-w-md p-6 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          kaydet(benzerler !== null);
        }}
      >
        <h3 className="font-semibold text-base">{firma ? "Düzenle" : "Yeni firma"}</h3>
        <div>
          <label className="field-label">Tür</label>
          <TurSecici
            value={tur}
            onChange={(t) => {
              setTur(t);
              setBenzerler(null);
            }}
          />
        </div>
        <div>
          <label className="field-label">{tur === "gider" ? "Gider kalemi" : "Firma adı"}</label>
          <input
            className="input-field uppercase"
            autoFocus
            value={ad}
            onChange={(e) => {
              setAd(e.target.value);
              setBenzerler(null);
              setHata(null);
            }}
            placeholder={tur === "gider" ? "Örn. Kira, Elektrik, Yakıt" : "Firma adı"}
          />
          {firma && bagliKayitlar.length + bagliSiparisIds.length > 0 && firmaAdiDuzenle(ad) !== firma.ad && (
            <p className="text-[11px] text-[var(--muted)] mt-1">
              Bağlı {bagliKayitlar.length} kayıt ve {bagliSiparisIds.length} siparişteki ad da güncellenecek.
            </p>
          )}
        </div>
        {tur !== "gider" && (
          <div>
            <label className="field-label">Telefon</label>
            <input className="input-field" value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="Opsiyonel" />
          </div>
        )}
        <div>
          <label className="field-label">Not</label>
          <input className="input-field" value={not} onChange={(e) => setNot(e.target.value)} placeholder="Opsiyonel" />
        </div>

        {benzerler && (
          <div className="rounded-[10px] bg-[var(--accent-orange-soft)] px-4 py-3 text-sm">
            <div className="font-medium text-[var(--accent-orange)] mb-1.5">Bunu mu demek istediniz?</div>
            <ul className="flex flex-col gap-1">
              {benzerler.map((b) => (
                <li key={b.id}>
                  <Link href={`/firmalar/${b.id}`} className="font-medium hover:underline">
                    {b.ad}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-xs text-[var(--muted)] mt-2">Farklı bir firmaysa &ldquo;Yine de ekle&rdquo; ile devam edin.</p>
          </div>
        )}
        {hata && (
          <div className="rounded-[10px] bg-[var(--brand-soft)] px-4 py-3 text-sm text-[var(--brand-dark)]">
            {hata.mesaj}{" "}
            {hata.firma && (
              <Link href={`/firmalar/${hata.firma.id}`} className="font-semibold hover:underline">
                {hata.firma.ad}
              </Link>
            )}
          </div>
        )}

        <div className="flex gap-2 mt-2 justify-end">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Vazgeç
          </button>
          <button type="submit" className="btn-primary disabled:opacity-40" disabled={busy || !firmaAnahtari(ad)}>
            {benzerler ? "Yine de ekle" : "Kaydet"}
          </button>
        </div>
      </form>
    </div>
  );
}
