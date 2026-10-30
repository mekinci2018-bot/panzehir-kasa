"use client";

import { useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import { kayitSil, updateKasaKaydi } from "@/lib/db";
import { ODEME_SEKLI_LABEL, formatDate, formatTL } from "@/lib/format";
import type { BankaHesabi, KasaKaydi, Yon } from "@/lib/types";
import OdemeSekliSelect, { hesapEtiketi, type OdemeSecimi } from "./OdemeSekliSelect";
import FirmaSecici, { type FirmaSecimi } from "./FirmaSecici";
import FirmaLink from "./FirmaLink";
import { useCalisanlar, useFirmalar } from "@/lib/hooks";

function girisZamani(ms: number): string {
  return new Date(ms).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// View, edit and (soft) delete a single record. Deleting is only possible from here.
export default function KayitDetayModal({
  kayit,
  hesaplar,
  kartOnerileri,
  onClose,
}: {
  kayit: KasaKaydi;
  hesaplar: BankaHesabi[];
  kartOnerileri: string[];
  onClose: () => void;
}) {
  const { firmalar } = useFirmalar();
  const { calisanlar } = useCalisanlar();
  const [firma, setFirma] = useState<FirmaSecimi>({
    firmaId: kayit.firmaId ?? "",
    personelId: kayit.personelId ?? "",
    firma: kayit.firma,
  });
  const [form, setForm] = useState({
    tarih: kayit.tarih,
    aciklama: kayit.aciklama,
    toplamTutar: String(kayit.toplamTutar),
    alinanTutar: String(kayit.alinanTutar),
    yon: kayit.yon,
  });
  const [secim, setSecim] = useState<OdemeSecimi>({
    odemeSekli: kayit.odemeSekli,
    bankaHesapId: kayit.bankaHesapId ?? "",
    kartAciklama: kayit.kartAciklama ?? "",
  });
  const [silOnay, setSilOnay] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const kalan = (Number(form.toplamTutar) || 0) - (Number(form.alinanTutar) || 0);
  const odemeler = kayit.odemeler ?? [];

  const toplam = Number(form.toplamTutar) || 0;
  const alinan = Number(form.alinanTutar) || 0;
  const yeniDurum: KasaKaydi["durum"] = toplam > 0 && alinan >= toplam ? "tamamlandi" : "aktif";

  async function kaydet() {
    if (!firma.firma.trim() || busy) return;
    setBusy(true);
    try {
      await updateKasaKaydi(kayit.id, {
        tarih: form.tarih,
        firma: firma.firma.trim(),
        // Older free-text records may stay unlinked; a picked company or employee links them.
        ...(firma.firmaId || firma.personelId ? { firmaId: firma.firmaId, personelId: firma.personelId ?? "" } : {}),
        // Archived records stay archived; otherwise the status follows the edited amounts.
        durum: kayit.durum === "arsiv" ? "arsiv" : yeniDurum,
        aciklama: form.aciklama.trim(),
        toplamTutar: Number(form.toplamTutar) || 0,
        alinanTutar: Number(form.alinanTutar) || 0,
        yon: form.yon,
        odemeSekli: secim.odemeSekli,
        bankaHesapId: secim.bankaHesapId || undefined,
        kartAciklama: secim.kartAciklama || undefined,
      });
      onClose();
    } catch (err) {
      console.error(err);
      alert("Kayıt güncellenemedi, lütfen tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  async function sil() {
    setBusy(true);
    try {
      await kayitSil(kayit.id);
      onClose();
    } catch (err) {
      console.error(err);
      alert("Kayıt silinemedi, lütfen tekrar deneyin.");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4 border-b border-[var(--border)]">
          <div className="min-w-0">
            <h3 className="font-semibold text-base truncate">
              <FirmaLink firmaId={kayit.firmaId} personelId={kayit.personelId} ad={kayit.firma || "Kayıt"} />
            </h3>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Girildi: <span className="tabular">{girisZamani(kayit.createdAt)}</span>
              {kayit.kaynak === "veresiye" && " · Veresiye"}
              {kayit.vadeTarihi && ` · Vade ${formatDate(kayit.vadeTarihi)}`}
            </p>
          </div>
          <button className="icon-btn -mr-2" onClick={onClose} aria-label="Kapat">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          className="px-6 py-5 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            kaydet();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Tarih</label>
              <input type="date" className="input-field" value={form.tarih} onChange={(e) => setForm({ ...form, tarih: e.target.value })} />
            </div>
            <div>
              <label className="field-label">İşlem</label>
              <select
                className={`select-field select-field-md w-full ${form.yon === "gelen" ? "select-giris" : "select-cikis"}`}
                value={form.yon}
                onChange={(e) => setForm({ ...form, yon: e.target.value as Yon })}
              >
                <option value="gelen">Giriş</option>
                <option value="giden">Çıkış</option>
              </select>
            </div>
          </div>
          <div>
            <label className="field-label">Firma / Kişi</label>
            <FirmaSecici value={firma} firmalar={firmalar} calisanlar={calisanlar} onChange={setFirma} className="input-field" placeholder="Firma adı ya da kişi" />
            {!firma.firmaId && !firma.personelId && firma.firma.trim() && (
              <p className="text-[11px] text-[var(--accent-orange)] mt-1">Firmalar listesine bağlı değil; listeden seçerek bağlayabilirsiniz.</p>
            )}
          </div>
          <div>
            <label className="field-label">Açıklama</label>
            <input className="input-field" value={form.aciklama} onChange={(e) => setForm({ ...form, aciklama: e.target.value })} placeholder="Opsiyonel" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Toplam tutar</label>
              <input type="number" className="input-field num" value={form.toplamTutar} onChange={(e) => setForm({ ...form, toplamTutar: e.target.value })} />
            </div>
            <div>
              <label className="field-label">Alınan / Ödenen</label>
              <input type="number" className="input-field num" value={form.alinanTutar} onChange={(e) => setForm({ ...form, alinanTutar: e.target.value })} />
            </div>
          </div>
          {kalan !== 0 && (
            <p className="text-xs text-[var(--accent-orange)] -mt-2">
              Kalan <span className="tabular">{formatTL(kalan)}</span> · {form.yon === "gelen" ? "Alacaklar" : "Borçlar"}&apos;da görünür
            </p>
          )}
          <div>
            <label className="field-label">Ödeme şekli</label>
            <OdemeSekliSelect value={secim} hesaplar={hesaplar} kartOnerileri={kartOnerileri} onChange={setSecim} size="md" />
          </div>

          {odemeler.length > 0 && (
            <div>
              <div className="field-label">Sonradan yapılan ödemeler</div>
              <ul className="rounded-[9px] border border-[var(--border)] divide-y divide-[var(--border)] text-sm">
                {odemeler.map((o, i) => {
                  const hesap = hesaplar.find((h) => h.id === o.bankaHesapId);
                  const detay = hesap ? hesapEtiketi(hesap) : o.kartAciklama;
                  return (
                    <li key={i} className="px-3 py-2 flex items-center justify-between gap-3">
                      <span className="text-[var(--muted)] text-xs">
                        <span className="tabular">{formatDate(o.tarih)}</span> · {ODEME_SEKLI_LABEL[o.odemeSekli]}
                        {detay ? ` · ${detay}` : ""}
                      </span>
                      <span className="tabular font-medium">{formatTL(o.tutar)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {silOnay ? (
            <div className="mt-2 rounded-[10px] bg-[var(--brand-soft)] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-medium text-[var(--brand-dark)]">Bu kaydı silmek istediğine emin misin?</span>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary !py-1.5 !px-3 !text-xs" onClick={() => setSilOnay(false)}>
                  Vazgeç
                </button>
                <button
                  type="button"
                  className="btn-primary !bg-[var(--brand)] hover:!bg-[var(--brand-dark)] !py-1.5 !px-3 !text-xs disabled:opacity-40"
                  onClick={sil}
                  disabled={busy}
                >
                  Evet, sil
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 mt-2">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-[13px] text-[var(--muted)] hover:text-[var(--brand)] px-2 py-1.5 -ml-2 rounded-lg transition-colors"
                onClick={() => setSilOnay(true)}
              >
                <Trash2 className="w-3.5 h-3.5" /> Sil
              </button>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary" onClick={onClose}>
                  Kapat
                </button>
                <button type="submit" className="btn-primary disabled:opacity-40" disabled={busy || !firma.firma.trim()}>
                  Kaydet
                </button>
              </div>
            </div>
          )}
          {silOnay && <p className="text-[11px] text-[var(--muted)] -mt-2">Silinen kayıt 30 gün boyunca Çöp Kutusu&apos;ndan geri alınabilir.</p>}
        </form>
      </div>
    </div>
  );
}
