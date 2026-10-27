"use client";

import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle } from "lucide-react";
import { useKasaKayitlari } from "@/lib/hooks";
import { arsiveGonder, tahsilEt } from "@/lib/db";
import { daysSince, formatDate, formatTL } from "@/lib/format";
import type { KasaKaydi, Yon } from "@/lib/types";
import AmountModal from "./AmountModal";
import PageHeader from "./PageHeader";
import EmptyState from "./EmptyState";

const OVERDUE_DAYS = 30;

export default function OutstandingList({
  yon,
  title,
  subtitle,
  amountLabel,
  actionLabel,
  icon,
  emptyTitle,
  emptyDescription,
}: {
  yon: Yon;
  title: string;
  subtitle: string;
  amountLabel: string;
  actionLabel: string;
  icon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const { kayitlar, loading } = useKasaKayitlari();
  const [modalFor, setModalFor] = useState<KasaKaydi | null>(null);

  const items = useMemo(
    () =>
      kayitlar
        .filter((k) => k.yon === yon && k.durum === "aktif" && k.toplamTutar - k.alinanTutar > 0)
        .sort((a, b) => (a.tarih < b.tarih ? -1 : 1)),
    [kayitlar, yon]
  );

  return (
    <div className="page-enter flex flex-col gap-6">
      <PageHeader title={title} description={subtitle} />

      <div className="card overflow-hidden">
        {!loading && items.length === 0 ? (
          <EmptyState icon={icon} title={emptyTitle} description={emptyDescription} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-zebra">
              <thead>
                <tr className="text-left text-[var(--foreground)] text-xs uppercase tracking-wide bg-gray-50 border-b border-[var(--border)]">
                  <th className="px-5 py-3 font-bold w-[120px]">Tarih</th>
                  <th className="px-5 py-3 font-bold">Firma / Kişi</th>
                  <th className="px-5 py-3 font-bold">Açıklama</th>
                  <th className="px-5 py-3 font-bold w-[150px]">{amountLabel}</th>
                  <th className="px-5 py-3 font-bold w-[220px]">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {items.map((k) => {
                  const kalan = k.toplamTutar - k.alinanTutar;
                  const overdue = daysSince(k.tarih) > OVERDUE_DAYS;
                  return (
                    <tr
                      key={k.id}
                      className={`border-t border-[var(--border)] ${overdue ? "border-l-[3px] border-l-[var(--accent-orange)]" : ""}`}
                    >
                      <td className="px-5 py-3">{formatDate(k.tarih)}</td>
                      <td className="px-5 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          {k.firma}
                          {overdue && (
                            <span className="badge badge-overdue">
                              <AlertTriangle className="w-3 h-3" /> Gecikmiş
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-[var(--muted)]">{k.aciklama || "—"}</td>
                      <td className="px-5 py-3 font-bold">{formatTL(kalan)}</td>
                      <td className="px-5 py-3">
                        <div className="flex gap-2">
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
          onClose={() => setModalFor(null)}
          onConfirm={async (amount) => {
            await tahsilEt(modalFor.id, modalFor.alinanTutar, amount, modalFor.toplamTutar);
            setModalFor(null);
          }}
        />
      )}
    </div>
  );
}
