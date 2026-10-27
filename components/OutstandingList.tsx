"use client";

import { useMemo, useState } from "react";
import { useKasaKayitlari } from "@/lib/hooks";
import { arsiveGonder, tahsilEt } from "@/lib/db";
import { formatDate, formatTL } from "@/lib/format";
import type { KasaKaydi, Yon } from "@/lib/types";
import AmountModal from "./AmountModal";

export default function OutstandingList({
  yon,
  title,
  subtitle,
  amountLabel,
  actionLabel,
}: {
  yon: Yon;
  title: string;
  subtitle: string;
  amountLabel: string;
  actionLabel: string;
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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold">{title}</h1>
        <p className="text-sm text-[var(--muted)] mt-1">{subtitle}</p>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--muted)] text-xs uppercase tracking-wide">
                <th className="px-5 py-3 font-semibold w-[110px]">Tarih</th>
                <th className="px-5 py-3 font-semibold">Firma / Kişi</th>
                <th className="px-5 py-3 font-semibold">Açıklama</th>
                <th className="px-5 py-3 font-semibold w-[130px]">{amountLabel}</th>
                <th className="px-5 py-3 font-semibold w-[220px]">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-[var(--muted)]">
                    Kayıt yok — her şey güncel.
                  </td>
                </tr>
              )}
              {items.map((k) => {
                const kalan = k.toplamTutar - k.alinanTutar;
                return (
                  <tr key={k.id} className="border-t border-[var(--border)]">
                    <td className="px-5 py-3">{formatDate(k.tarih)}</td>
                    <td className="px-5 py-3 font-medium">{k.firma}</td>
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
