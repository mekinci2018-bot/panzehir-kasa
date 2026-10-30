"use client";

import { useEffect, useState } from "react";
import { MessageSquarePlus, Trash2, X } from "lucide-react";
import { siparisOdemeAl, siparisSil, tahsilatNotuEkle, tahsilatNotuSil, updateSiparis } from "@/lib/db";
import { useFirmalar } from "@/lib/hooks";
import { siparisHesap, odemeDurumu, tahsilatUyari } from "@/lib/siparis";
import { ODEME_SEKLI_LABEL, formatDate, formatTL, todayISO } from "@/lib/format";
import type { BankaHesabi, KasaKaydi, Siparis } from "@/lib/types";
import FirmaSecici, { type FirmaSecimi } from "./FirmaSecici";
import FirmaLink from "./FirmaLink";
import GorselHucre from "./GorselHucre";
import AmountModal from "./AmountModal";
import { FaturaRozeti, OdemeRozeti, UretimRozeti } from "./Rozetler";
import { hesapEtiketi } from "./OdemeSekliSelect";

export const UYARI_RENK = {
  gecti: "text-[var(--accent-red)]",
  yaklasiyor: "text-[var(--accent-orange)]",
} as const;

// "Ödeme Al" on an order: the payment is written to Kasa as a Giriş linked to the order.
export function SiparisOdemeModal({
  siparis,
  kalan,
  hesaplar,
  kartOnerileri,
  onClose,
}: {
  siparis: Siparis;
  kalan: number;
  hesaplar: BankaHesabi[];
  kartOnerileri: string[];
  onClose: () => void;
}) {
  return (
    <AmountModal
      title={`Ödeme Al — ${siparis.firmaAdi}`}
      kalan={kalan}
      hesaplar={hesaplar}
      kartOnerileri={kartOnerileri}
      defaultSecim={{ odemeSekli: "nakit", bankaHesapId: "", kartAciklama: "" }}
      onClose={onClose}
      onConfirm={async (tutar, secim) => {
        try {
          await siparisOdemeAl(siparis, { tutar, ...secim });
          onClose();
        } catch (err) {
          console.error(err);
          alert("Ödeme kaydedilemedi, lütfen tekrar deneyin.");
        }
      }}
    />
  );
}

export default function SiparisDetayModal({
  siparis,
  odemeKayitlari,
  odemeler,
  hesaplar,
  kartOnerileri,
  onClose,
}: {
  siparis: Siparis;
  odemeKayitlari: KasaKaydi[]; // Kasa records with this siparisId
  odemeler: Map<string, number>;
  hesaplar: BankaHesabi[];
  kartOnerileri: string[];
  onClose: () => void;
}) {
  const { firmalar } = useFirmalar();
  const [firma, setFirma] = useState<FirmaSecimi>({ firmaId: siparis.firmaId, firma: siparis.firmaAdi });
  const [form, setForm] = useState({
    tarih: siparis.tarih,
    urun: siparis.urun,
    tutar: String(siparis.tutar),
    odemeGunu: siparis.odemeGunu ?? "",
    aciklama: siparis.aciklama,
  });
  const [not, setNot] = useState({ tarih: todayISO(), metin: "" });
  const [odemeAc, setOdemeAc] = useState(false);
  const [silOnay, setSilOnay] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !odemeAc && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, odemeAc]);

  const h = siparisHesap({ ...siparis, tutar: Number(form.tutar) || 0 }, odemeler);
  const uyari = tahsilatUyari({ ...siparis, odemeGunu: form.odemeGunu || undefined }, h);
  const notlar = [...(siparis.tahsilatNotlari ?? [])].sort((a, b) => b.createdAt - a.createdAt);

  async function calistir(is: () => Promise<unknown>, hata: string) {
    setBusy(true);
    try {
      await is();
      return true;
    } catch (err) {
      console.error(err);
      alert(hata);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function kaydet() {
    if (!firma.firmaId || busy) return;
    const ok = await calistir(
      () =>
        updateSiparis(siparis.id, {
          firmaId: firma.firmaId,
          firmaAdi: firma.firma,
          tarih: form.tarih,
          urun: form.urun.trim(),
          tutar: Number(form.tutar) || 0,
          odemeGunu: form.odemeGunu,
          aciklama: form.aciklama.trim(),
        }),
      "Sipariş güncellenemedi, lütfen tekrar deneyin."
    );
    if (ok) onClose();
  }

  async function notEkle() {
    if (!not.metin.trim()) return;
    const ok = await calistir(() => tahsilatNotuEkle(siparis.id, not), "Not eklenemedi.");
    if (ok) setNot({ tarih: todayISO(), metin: "" });
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4 border-b border-[var(--border)]">
          <div className="min-w-0">
            <h3 className="font-semibold text-base truncate">
              <FirmaLink firmaId={siparis.firmaId} ad={siparis.firmaAdi} />
              <span className="text-[var(--muted)] font-normal"> · {siparis.urun || "Sipariş"}</span>
            </h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <UretimRozeti value={siparis.uretim} onChange={(d) => updateSiparis(siparis.id, { uretim: d })} />
              <OdemeRozeti durum={odemeDurumu(siparis, h)} />
              <FaturaRozeti kesildi={siparis.fatura} onToggle={() => updateSiparis(siparis.id, { fatura: !siparis.fatura })} />
              {siparis.kaynak === "excel" && <span className="badge bg-[#f1f1f4] text-[var(--muted)]">Excel</span>}
            </div>
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
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-3">
            <div>
              <label className="field-label">Firma</label>
              <FirmaSecici value={firma} firmalar={firmalar} onChange={setFirma} className="input-field" />
            </div>
            <div>
              <label className="field-label">Tarih</label>
              <input type="date" className="input-field" value={form.tarih} onChange={(e) => setForm({ ...form, tarih: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="field-label">Ürün / İş</label>
            <input className="input-field" value={form.urun} onChange={(e) => setForm({ ...form, urun: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="field-label">Tutar</label>
              <input type="number" className="input-field num" value={form.tutar} onChange={(e) => setForm({ ...form, tutar: e.target.value })} />
            </div>
            <div>
              <div className="field-label">Ödenen</div>
              <div className="py-2 tabular text-right">{formatTL(h.odenen)}</div>
            </div>
            <div>
              <div className="field-label">Kalan</div>
              <div className={`py-2 tabular text-right font-semibold ${uyari ? UYARI_RENK[uyari] : ""}`}>{formatTL(h.kalan)}</div>
            </div>
            <div>
              <label className="field-label">Ödeme günü</label>
              <input type="date" className="input-field" value={form.odemeGunu} onChange={(e) => setForm({ ...form, odemeGunu: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="field-label">Açıklama</label>
            <input className="input-field" value={form.aciklama} onChange={(e) => setForm({ ...form, aciklama: e.target.value })} placeholder="Opsiyonel" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="field-label">Sipariş görseli</div>
              <div className="rounded-[9px] border border-[var(--border)] p-1">
                <GorselHucre ids={siparis.siparisGorselleri} alan="siparis" siparisId={siparis.id} />
              </div>
            </div>
            <div>
              <div className="field-label">Biten ürün görseli</div>
              <div className="rounded-[9px] border border-[var(--border)] p-1">
                <GorselHucre ids={siparis.bitenGorselleri} alan="biten" siparisId={siparis.id} />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="field-label !mb-0">Ödemeler</div>
              {h.kalan > 0 && (
                <button type="button" className="btn-primary !py-1 !px-2.5 !text-xs" onClick={() => setOdemeAc(true)}>
                  Ödeme Al
                </button>
              )}
            </div>
            {odemeKayitlari.length === 0 && !siparis.oncekiOdenen ? (
              <p className="text-xs text-[var(--muted)]">Henüz ödeme yok.</p>
            ) : (
              <ul className="rounded-[9px] border border-[var(--border)] divide-y divide-[var(--border)] text-sm">
                {siparis.oncekiOdenen ? (
                  <li className="px-3 py-2 flex items-center justify-between gap-3">
                    <span className="text-xs text-[var(--muted)]">Önceki ödeme (Excel&apos;den, kasaya işlenmemiş)</span>
                    <span className="tabular font-medium">{formatTL(siparis.oncekiOdenen)}</span>
                  </li>
                ) : null}
                {[...odemeKayitlari]
                  .sort((a, b) => (a.tarih < b.tarih ? -1 : 1))
                  .map((k) => {
                    const hesap = hesaplar.find((x) => x.id === k.bankaHesapId);
                    return (
                      <li key={k.id} className="px-3 py-2 flex items-center justify-between gap-3">
                        <span className="text-xs text-[var(--muted)]">
                          <span className="tabular">{formatDate(k.tarih)}</span> · {ODEME_SEKLI_LABEL[k.odemeSekli]}
                          {hesap ? ` · ${hesapEtiketi(hesap)}` : k.kartAciklama ? ` · ${k.kartAciklama}` : ""} · Kasa
                        </span>
                        <span className="tabular font-medium">{formatTL(k.alinanTutar)}</span>
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>

          <div>
            <div className="field-label">Tahsilat notları</div>
            <div className="flex flex-wrap gap-2">
              <input
                type="date"
                className="input-field !w-[150px]"
                value={not.tarih}
                onChange={(e) => setNot({ ...not, tarih: e.target.value })}
              />
              <input
                className="input-field flex-1 min-w-[180px]"
                placeholder="Örn. pazartesi arayacak"
                value={not.metin}
                onChange={(e) => setNot({ ...not, metin: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    notEkle();
                  }
                }}
              />
              <button type="button" className="btn-secondary inline-flex items-center gap-1.5 disabled:opacity-40" disabled={busy || !not.metin.trim()} onClick={notEkle}>
                <MessageSquarePlus className="w-4 h-4" /> Ekle
              </button>
            </div>
            {notlar.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {notlar.map((n) => (
                  <li key={n.createdAt} className="group flex items-start justify-between gap-3 text-sm rounded-lg px-3 py-1.5 bg-[#f7f7f9]">
                    <span>
                      <span className="tabular text-xs text-[var(--muted)] mr-2">{formatDate(n.tarih)}</span>
                      {n.metin}
                    </span>
                    <button
                      type="button"
                      className="text-[var(--muted-soft)] hover:text-[var(--brand)] opacity-0 group-hover:opacity-100"
                      onClick={() => calistir(() => tahsilatNotuSil(siparis.id, n), "Not silinemedi.")}
                      aria-label="Notu sil"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {silOnay ? (
            <div className="mt-2 rounded-[10px] bg-[var(--brand-soft)] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-medium text-[var(--brand-dark)]">
                Bu siparişi silmek istediğine emin misin?
                {odemeKayitlari.length > 0 && (
                  <span className="block text-xs font-normal">Bağlı {odemeKayitlari.length} ödeme kaydı da Çöp Kutusu&apos;na gider.</span>
                )}
              </span>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary !py-1.5 !px-3 !text-xs" onClick={() => setSilOnay(false)}>
                  Vazgeç
                </button>
                <button
                  type="button"
                  className="btn-primary !bg-[var(--brand)] hover:!bg-[var(--brand-dark)] !py-1.5 !px-3 !text-xs disabled:opacity-40"
                  disabled={busy}
                  onClick={async () => {
                    const ok = await calistir(
                      () => siparisSil(siparis.id, odemeKayitlari.map((k) => k.id)),
                      "Sipariş silinemedi, lütfen tekrar deneyin."
                    );
                    if (ok) onClose();
                  }}
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
                <button type="submit" className="btn-primary disabled:opacity-40" disabled={busy || !firma.firmaId}>
                  Kaydet
                </button>
              </div>
            </div>
          )}
        </form>
      </div>

      {odemeAc && (
        <SiparisOdemeModal siparis={siparis} kalan={h.kalan} hesaplar={hesaplar} kartOnerileri={kartOnerileri} onClose={() => setOdemeAc(false)} />
      )}
    </div>
  );
}
