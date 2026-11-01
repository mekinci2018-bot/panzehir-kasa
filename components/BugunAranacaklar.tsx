"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import FirmaLink from "./FirmaLink";
import WhatsappButonu from "./WhatsappButonu";
import { formatTL } from "@/lib/format";
import type { Siparis } from "@/lib/types";

export interface AramaSatiri {
  firmaId: string;
  firmaAdi: string;
  telefon?: string;
  sebepler: string[];
  toplamKalan: number;
  odemeAlinacakSiparis?: Siparis; // en büyük kalanı olan açık sipariş; "Ödeme Al" kısayolu buna açılır
  waMesaj: string;
}

// Kasa'nın üstünde, özet şeridinin altında ince ve katlanabilir bir şerit: ödeme günü geçmiş/bugün
// olan siparişler ile bugünün/geçmişin tahsilat notları, firma bazında gruplu tek liste.
export default function BugunAranacaklar({
  items,
  onOdeme,
  onTelefonEksik,
}: {
  items: AramaSatiri[];
  onOdeme: (s: Siparis) => void;
  onTelefonEksik: (firmaId: string) => void;
}) {
  const [acik, setAcik] = useState(true);
  if (items.length === 0) return null;
  const toplam = items.reduce((t, i) => t + i.toplamKalan, 0);

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        className="w-full px-5 py-3 flex items-center justify-between gap-3 hover:bg-[var(--surface-hover)] transition-colors"
        onClick={() => setAcik((v) => !v)}
      >
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <ChevronRight className={`w-4 h-4 text-[var(--muted)] transition-transform ${acik ? "rotate-90" : ""}`} />
          Bugün aranacaklar
          <span className="text-xs font-normal text-[var(--muted)]">
            ({items.length} firma{toplam > 0.005 ? ` · ${formatTL(toplam)}` : ""})
          </span>
        </span>
      </button>
      {acik && (
        <ul className="border-t border-[var(--border)] divide-y divide-[var(--border)]">
          {items.map((i) => (
            <li key={i.firmaId} className="px-5 py-2.5 flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <FirmaLink firmaId={i.firmaId} ad={i.firmaAdi} className="font-medium" />
                <div className="text-xs text-[var(--muted)] truncate">{i.sebepler.join(" · ")}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {i.toplamKalan > 0.005 && <span className="tabular font-medium text-sm mr-1">{formatTL(i.toplamKalan)}</span>}
                <WhatsappButonu telefon={i.telefon} mesaj={i.waMesaj} onTelefonEksik={() => onTelefonEksik(i.firmaId)} />
                {i.odemeAlinacakSiparis && (
                  <button className="btn-primary !py-1 !px-2.5 !text-xs whitespace-nowrap" onClick={() => onOdeme(i.odemeAlinacakSiparis!)}>
                    Ödeme Al
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
