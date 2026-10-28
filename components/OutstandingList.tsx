"use client";

import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Plus } from "lucide-react";
import { useBankaHesaplari, useKasaKayitlari } from "@/lib/hooks";
import { addKasaKaydi, arsiveGonder, tahsilEt } from "@/lib/db";
import { daysSince, formatDate, formatTL, vadeDurumu, type VadeDurumu } from "@/lib/format";
import type { KasaKaydi, Yon } from "@/lib/types";
import AmountModal from "./AmountModal";
import VeresiyeModal from "./VeresiyeModal";
import PageHeader from "./PageHeader";
import EmptyState from "./EmptyState";

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
  const { hesaplar } = useBankaHesaplari();
  const [modalFor, setModalFor] = useState<KasaKaydi | null>(null);
  const [adding, setAdding] = useState(false);

  // Earliest due first; records without a due date fall back to their entry date.
  const items = useMemo(
    () =>
      kayitlar
        .filter((k) => k.yon === yon && k.durum === "aktif" && k.toplamTutar - k.alinanTutar > 0)
        .sort((a, b) => ((a.vadeTarihi ?? a.tarih) < (b.vadeTarihi ?? b.tarih) ? -1 : 1)),
    [kayitlar, yon]
  );

  // A payment shouldn't default to an account that has since been deactivated.
  function varsayilanSecim(k: KasaKaydi) {
    const hesap = hesaplar.find((h) => h.id === k.bankaHesapId && !h.pasif);
    return { odemeSekli: k.odemeSekli, bankaHesapId: hesap?.id ?? "" };
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
          <div className="overflow-x-auto">
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
                  const kalan = k.toplamTutar - k.alinanTutar;
                  const durum = k.vadeTarihi ? vadeDurumu(k.vadeTarihi) : "normal";
                  const overdue = !k.vadeTarihi && daysSince(k.tarih) > OVERDUE_DAYS;
                  return (
                    <tr key={k.id}>
                      <td className="tabular">{formatDate(k.tarih)}</td>
                      <td className="font-medium">
                        <div className="flex items-center gap-2">
                          {k.firma}
                          {overdue && (
                            <span className="badge badge-overdue">
                              <AlertTriangle className="w-3 h-3" /> Gecikmiş
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-[var(--muted)]">{k.aciklama || "—"}</td>
                      <td>
                        {k.vadeTarihi ? (
                          <div className={VADE_RENK[durum]}>
                            <div className="tabular">{formatDate(k.vadeTarihi)}</div>
                            <div className={`text-[11px] ${durum === "normal" ? "text-[var(--muted)]" : "font-medium"}`}>
                              {vadeEtiketi(k.vadeTarihi)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-[var(--muted-soft)]">—</span>
                        )}
                      </td>
                      <td className={`num font-medium ${VADE_RENK[durum]}`}>{formatTL(kalan)}</td>
                      <td>
                        <div className="flex gap-2 justify-end">
                          <button className="btn-primary !py-1.5 !px-3 !text-xs" onClick={() => setModalFor(k)}>
                            {actionLabel}
                          </button>
                          <button
                            className="btn-secondary !py-1.5 !px-3 !text-xs"
                            onClick={() => arsiveGonder(k.id)}
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
          defaultSecim={varsayilanSecim(modalFor)}
          onClose={() => setModalFor(null)}
          onConfirm={async (amount, secim) => {
            await tahsilEt(modalFor, { tutar: amount, ...secim });
            setModalFor(null);
          }}
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
