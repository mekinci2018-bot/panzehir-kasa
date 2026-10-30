"use client";

import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Plus } from "lucide-react";
import { kartOnerileri, useBankaHesaplari, useKasaKayitlari, useSiparisler } from "@/lib/hooks";
import { addKasaKaydi, arsiveGonder, siparisKapat, tahsilEt } from "@/lib/db";
import { siparisHesap, siparisOdemeleri } from "@/lib/siparis";
import { daysSince, formatDate, formatTL, vadeDurumu, type VadeDurumu } from "@/lib/format";
import type { KasaKaydi, Siparis, Yon } from "@/lib/types";
import AmountModal from "./AmountModal";
import VeresiyeModal from "./VeresiyeModal";
import PageHeader from "./PageHeader";
import EmptyState from "./EmptyState";
import FirmaLink from "./FirmaLink";
import { SiparisOdemeModal } from "./SiparisDetayModal";

// One open amount: a Kasa record's unpaid part, or an order's remainder (customers only).
interface AcikKalem {
  key: string;
  tarih: string;
  firma: string;
  firmaId?: string;
  personelId?: string;
  aciklama: string;
  vade?: string;
  kalan: number;
  kayit?: KasaKaydi;
  siparis?: Siparis;
}

const OVERDUE_DAYS = 30;

const VADE_RENK: Record<VadeDurumu, string> = {
  gecti: "text-[var(--accent-red)]",
  yaklasiyor: "text-[var(--accent-orange)]",
  normal: "",
};

function vadeEtiketi(vadeTarihi: string): string {
  const gecen = daysSince(vadeTarihi);
  if (gecen > 0) return `${gecen} gün geçti`;
  if (gecen === 0) return "Bugün";
  return `${-gecen} gün kaldı`;
}

export default function OutstandingList({
  yon,
  title,
  subtitle,
  amountLabel,
  actionLabel,
  newLabel,
  icon,
  emptyTitle,
  emptyDescription,
}: {
  yon: Yon;
  title: string;
  subtitle: string;
  amountLabel: string;
  actionLabel: string;
  newLabel: string;
  icon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const { kayitlar, loading } = useKasaKayitlari();
  const { siparisler } = useSiparisler();
  const { hesaplar } = useBankaHesaplari();
  const [modalFor, setModalFor] = useState<KasaKaydi | null>(null);
  const [siparisFor, setSiparisFor] = useState<AcikKalem | null>(null);
  const [adding, setAdding] = useState(false);

  // Earliest due first; records without a due date fall back to their entry date.
  const items = useMemo(() => {
    const list: AcikKalem[] = kayitlar
      .filter((k) => k.yon === yon && k.durum === "aktif" && k.toplamTutar - k.alinanTutar > 0)
      .map((k) => ({
        key: k.id,
        tarih: k.tarih,
        firma: k.firma,
        firmaId: k.firmaId,
        personelId: k.personelId,
        aciklama: k.aciklama,
        vade: k.vadeTarihi,
        kalan: k.toplamTutar - k.alinanTutar,
        kayit: k,
      }));
    if (yon === "gelen") {
      const odemeler = siparisOdemeleri(kayitlar);
      for (const s of siparisler) {
        const { kalan } = siparisHesap(s, odemeler);
        if (kalan <= 0) continue;
        list.push({
          key: `s-${s.id}`,
          tarih: s.tarih,
          firma: s.firmaAdi,
          firmaId: s.firmaId,
          aciklama: s.urun,
          vade: s.odemeGunu,
          kalan,
          siparis: s,
        });
      }
    }
    return list.sort((a, b) => ((a.vade ?? a.tarih) < (b.vade ?? b.tarih) ? -1 : 1));
  }, [kayitlar, siparisler, yon]);

  // A payment shouldn't default to an account that has since been deactivated.
  function varsayilanSecim(k: KasaKaydi) {
    const hesap = hesaplar.find((h) => h.id === k.bankaHesapId && !h.pasif);
    return { odemeSekli: k.odemeSekli, bankaHesapId: hesap?.id ?? "", kartAciklama: k.kartAciklama ?? "" };
  }

  return (
    <div className="page-enter flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader title={title} description={subtitle} />
        <button className="btn-primary inline-flex items-center gap-2" onClick={() => setAdding(true)}>
          <Plus className="w-4 h-4" /> {newLabel}
        </button>
      </div>

      <div className="card overflow-hidden">
        {!loading && items.length === 0 ? (
          <EmptyState icon={icon} title={emptyTitle} description={emptyDescription} />
        ) : (
          <div className="table-scroll">
            <table className="w-full text-sm data-table">
              <thead>
                <tr>
                  <th className="w-[110px]">Tarih</th>
                  <th>Firma / Kişi</th>
                  <th>Açıklama</th>
                  <th className="w-[150px]">Vade</th>
                  <th className="w-[150px] text-right">{amountLabel}</th>
                  <th className="w-[230px]"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((k) => {
                  const kalan = k.kalan;
                  const durum = k.vade ? vadeDurumu(k.vade) : "normal";
                  const overdue = !k.vade && daysSince(k.tarih) > OVERDUE_DAYS;
                  return (
                    <tr key={k.key}>
                      <td className="tabular">{formatDate(k.tarih)}</td>
                      <td className="font-medium">
                        <div className="flex items-center gap-2">
                          <FirmaLink firmaId={k.firmaId} personelId={k.personelId} ad={k.firma} />
                          {k.siparis && <span className="badge bg-[var(--accent-blue-soft)] text-[var(--accent-blue)]">Sipariş</span>}
                          {overdue && (
                            <span className="badge badge-overdue">
                              <AlertTriangle className="w-3 h-3" /> Gecikmiş
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-[var(--muted)]">{k.aciklama || "—"}</td>
                      <td>
                        {k.vade ? (
                          <div className={VADE_RENK[durum]}>
                            <div className="tabular">{formatDate(k.vade)}</div>
                            <div className={`text-[11px] ${durum === "normal" ? "text-[var(--muted)]" : "font-medium"}`}>
                              {vadeEtiketi(k.vade)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-[var(--muted-soft)]">—</span>
                        )}
                      </td>
                      <td className={`num font-medium ${VADE_RENK[durum]}`}>{formatTL(kalan)}</td>
                      <td>
                        <div className="flex gap-2 justify-end">
                          <button
                            className="btn-primary !py-1.5 !px-3 !text-xs"
                            onClick={() => (k.kayit ? setModalFor(k.kayit) : setSiparisFor(k))}
                          >
                            {actionLabel}
                          </button>
                          <button
                            className="btn-secondary !py-1.5 !px-3 !text-xs"
                            title="Kalan tutar kapatılır; cari ekstrede ayrı satır olarak görünür"
                            onClick={() => (k.kayit ? arsiveGonder(k.kayit.id) : k.siparis && siparisKapat(k.siparis.id))}
                          >
                            Arşive Gönder
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalFor && (
        <AmountModal
          title={`${actionLabel} — ${modalFor.firma}`}
          kalan={modalFor.toplamTutar - modalFor.alinanTutar}
          hesaplar={hesaplar}
          kartOnerileri={kartOnerileri(kayitlar)}
          defaultSecim={varsayilanSecim(modalFor)}
          onClose={() => setModalFor(null)}
          onConfirm={async (amount, secim) => {
            await tahsilEt(modalFor, { tutar: amount, ...secim });
            setModalFor(null);
          }}
        />
      )}

      {siparisFor?.siparis && (
        <SiparisOdemeModal
          siparis={siparisFor.siparis}
          kalan={siparisFor.kalan}
          hesaplar={hesaplar}
          kartOnerileri={kartOnerileri(kayitlar)}
          onClose={() => setSiparisFor(null)}
        />
      )}

      {adding && (
        <VeresiyeModal
          title={newLabel}
          onClose={() => setAdding(false)}
          onConfirm={async (f) => {
            // Nothing is paid upfront, so the whole amount is outstanding.
            await addKasaKaydi({
              tarih: f.tarih,
              firma: f.firma,
              firmaId: f.firmaId,
              personelId: f.personelId,
              aciklama: f.aciklama,
              toplamTutar: f.tutar,
              alinanTutar: 0,
              odemeSekli: "nakit",
              yon,
              kaynak: "veresiye",
              vadeTarihi: f.vadeTarihi || undefined,
            });
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}
