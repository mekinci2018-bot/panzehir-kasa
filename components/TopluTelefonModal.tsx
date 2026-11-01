"use client";

import { useMemo, useRef, useState } from "react";
import { FileUp, Upload } from "lucide-react";
import { topluTelefonGuncelle } from "@/lib/db";
import { csvAyristir, eslesmeleriBul, metniAyristir, type EslesmeSonucu } from "@/lib/telefonIceAktar";
import type { Firma } from "@/lib/types";

export default function TopluTelefonModal({ firmalar, onClose }: { firmalar: Firma[]; onClose: () => void }) {
  const [girdi, setGirdi] = useState("");
  const [uzerineYaz, setUzerineYaz] = useState(false);
  const [busy, setBusy] = useState(false);
  const dosyaRef = useRef<HTMLInputElement>(null);

  const sonuclar = useMemo<EslesmeSonucu[]>(() => eslesmeleriBul(metniAyristir(girdi), firmalar), [girdi, firmalar]);

  const eslesen = sonuclar.filter((s) => s.firma && s.telefonGecerli);
  const eslesmeyen = sonuclar.filter((s) => !s.firma);
  const gecersizTelefon = sonuclar.filter((s) => s.firma && !s.telefonGecerli);
  const zatenVarOlan = eslesen.filter((s) => s.firma!.telefon);
  const uygulanacak = eslesen.filter((s) => uzerineYaz || !s.firma!.telefon);

  async function dosyaSec(e: React.ChangeEvent<HTMLInputElement>) {
    const dosya = e.target.files?.[0];
    e.target.value = "";
    if (!dosya) return;
    const icerik = await dosya.text();
    const satirlar = csvAyristir(icerik);
    setGirdi(satirlar.map((s) => `${s.ad}\t${s.telefon}`).join("\n"));
  }

  async function onayla() {
    if (uygulanacak.length === 0) return;
    setBusy(true);
    try {
      await topluTelefonGuncelle(uygulanacak.map((s) => ({ id: s.firma!.id, telefon: s.telefonGecerli! })));
      onClose();
    } catch (err) {
      console.error(err);
      alert("Kaydedilemedi, lütfen tekrar deneyin.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 flex flex-col gap-4">
        <h3 className="font-semibold text-base">Toplu telefon ekle</h3>
        <p className="text-sm text-[var(--muted)]">
          Excel/Sheets&apos;ten <b>Firma</b> ve <b>Telefon</b> iki sütununu kopyalayıp aşağıya yapıştır, ya da bir CSV dosyası seç
          (Google Kişiler&apos;den dışa aktarılan dahil). Firma adları otomatik eşleştirilir.
        </p>

        <div className="flex flex-col gap-2">
          <textarea
            className="input-field min-h-[140px] font-mono text-[12.5px] resize-none"
            placeholder={"ÖRN REKLAM\t0532 123 45 67\nDİĞER FİRMA\t532 765 43 21"}
            value={girdi}
            onChange={(e) => setGirdi(e.target.value)}
          />
          <div>
            <input ref={dosyaRef} type="file" accept=".csv,text/csv" className="hidden" onChange={dosyaSec} />
            <button type="button" className="btn-secondary !py-1.5 !px-3 !text-xs inline-flex items-center gap-1.5" onClick={() => dosyaRef.current?.click()}>
              <FileUp className="w-3.5 h-3.5" /> CSV dosyası seç
            </button>
          </div>
        </div>

        {sonuclar.length > 0 && (
          <div className="flex flex-col gap-3 text-sm">
            <div className="grid grid-cols-3 gap-px bg-[var(--border)] rounded-[10px] overflow-hidden border border-[var(--border)]">
              <div className="bg-[var(--surface)] px-3 py-2.5 text-center">
                <div className="text-lg font-semibold tabular text-[var(--accent-green)]">{eslesen.length}</div>
                <div className="text-[11px] text-[var(--muted)]">Eşleşen</div>
              </div>
              <div className="bg-[var(--surface)] px-3 py-2.5 text-center">
                <div className="text-lg font-semibold tabular text-[var(--accent-orange)]">{eslesmeyen.length + gecersizTelefon.length}</div>
                <div className="text-[11px] text-[var(--muted)]">Eşleşmeyen / geçersiz</div>
              </div>
              <div className="bg-[var(--surface)] px-3 py-2.5 text-center">
                <div className="text-lg font-semibold tabular">{zatenVarOlan.length}</div>
                <div className="text-[11px] text-[var(--muted)]">Zaten telefonu var</div>
              </div>
            </div>

            {zatenVarOlan.length > 0 && (
              <label className="inline-flex items-center gap-2 cursor-pointer select-none w-fit">
                <input type="checkbox" className="w-4 h-4 accent-[var(--ink)]" checked={uzerineYaz} onChange={(e) => setUzerineYaz(e.target.checked)} />
                Zaten telefonu olan {zatenVarOlan.length} firmanın üzerine de yaz
              </label>
            )}

            <div className="max-h-56 overflow-y-auto flex flex-col gap-1 -mx-1">
              {sonuclar.map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-2 py-1 rounded-md hover:bg-[var(--surface-hover)]">
                  <span className="truncate min-w-0 flex-1">{s.satir.ad}</span>
                  <span className="tabular text-[var(--muted)] shrink-0 w-[140px] text-right">{s.telefonGecerli ?? s.satir.telefon}</span>
                  <span className="shrink-0 w-[150px] text-right text-[12px]">
                    {!s.firma ? (
                      s.benzerFirma ? (
                        <span className="text-[var(--accent-orange)]">Benzer: {s.benzerFirma.ad}</span>
                      ) : (
                        <span className="text-[var(--muted-soft)]">Eşleşmedi</span>
                      )
                    ) : !s.telefonGecerli ? (
                      <span className="text-[var(--accent-red)]">Geçersiz numara</span>
                    ) : s.firma.telefon && !uzerineYaz ? (
                      <span className="text-[var(--muted-soft)]">Zaten var, atlanacak</span>
                    ) : s.firma.telefon ? (
                      <span className="text-[var(--accent-orange)]">Üzerine yazılacak</span>
                    ) : (
                      <span className="text-[var(--accent-green)]">Eklenecek</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-end mt-1">
          <button className="btn-secondary" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn-primary inline-flex items-center gap-2 disabled:opacity-40" disabled={busy || uygulanacak.length === 0} onClick={onayla}>
            <Upload className="w-4 h-4" /> {uygulanacak.length > 0 ? `${uygulanacak.length} firmayı güncelle` : "Onayla"}
          </button>
        </div>
      </div>
    </div>
  );
}
