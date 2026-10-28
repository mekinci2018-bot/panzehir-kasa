"use client";

import { useMemo, useState } from "react";
import { Archive, ChevronRight } from "lucide-react";
import { useKasaKayitlari } from "@/lib/hooks";
import { ODEME_SEKLI_LABEL, formatDate, formatTL, monthLabel } from "@/lib/format";
import type { KasaKaydi } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

function groupByMonth(items: KasaKaydi[]) {
  const map = new Map<string, KasaKaydi[]>();
  for (const k of items) {
    if (!map.has(k.ay)) map.set(k.ay, []);
    map.get(k.ay)!.push(k);
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
}

export default function ArsivPage() {
  const { kayitlar, loading } = useKasaKayitlari();

  const tumKayitlar = useMemo(() => groupByMonth(kayitlar), [kayitlar]);
  const kapanmislar = useMemo(
    () => groupByMonth(kayitlar.filter((k) => k.durum !== "aktif")),
    [kayitlar]
  );

  return (
    <div className="page-enter flex flex-col gap-10">
      <PageHeader
        title="Arşiv"
        description="Tüm geçmiş kayıtlar, tamamen tahsil edilmiş/ödenmiş kayıtlar ve manuel arşivlenenler; ay ay listelenir."
      />

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-[15px]">Tüm Kasa Kayıtları (geçmiş)</h2>
        {!loading && tumKayitlar.length === 0 && (
          <div className="card">
            <EmptyState
              icon={Archive}
              title="Henüz kayıt yok"
              description="Kasa sayfasından ilk işlemini kaydettiğinde burada ay ay listelenir."
            />
          </div>
        )}
        {tumKayitlar.map(([ay, items]) => (
          <MonthAccordion key={ay} ay={ay} items={items} />
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-[15px]">Tahsil Edilen / Ödenen / Arşivlenenler</h2>
        {!loading && kapanmislar.length === 0 && (
          <div className="card">
            <EmptyState
              icon={Archive}
              title="Henüz kapanmış kayıt yok"
              description="Bir alacak veya borç tamamen tahsil edilip ödendiğinde ya da arşive gönderildiğinde burada görünür."
            />
          </div>
        )}
        {kapanmislar.map(([ay, items]) => (
          <MonthAccordion key={ay} ay={ay} items={items} />
        ))}
      </section>
    </div>
  );
}

function MonthAccordion({ ay, items }: { ay: string; items: KasaKaydi[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-[var(--surface-hover)] transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-2 font-semibold">
          <ChevronRight className={`w-4 h-4 transition-transform ${open ? "rotate-90" : ""}`} />
          {monthLabel(ay)}
        </span>
        <span className="text-xs text-[var(--muted)]">{items.length} kayıt</span>
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm data-table border-t border-[var(--border)]">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Firma / Açıklama</th>
                <th>İşlem</th>
                <th>Ödeme</th>
                <th className="text-right">Toplam</th>
                <th className="text-right">Alınan / Ödenen</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {items
                .sort((a, b) => (a.tarih < b.tarih ? 1 : -1))
                .map((k) => (
                  <tr key={k.id}>
                    <td className="tabular">{formatDate(k.tarih)}</td>
                    <td>
                      <div className="font-medium">{k.firma}</div>
                      <div className="text-xs text-[var(--muted)]">{k.aciklama}</div>
                    </td>
                    <td>
                      <span className={`badge ${k.yon === "gelen" ? "badge-giris" : "badge-cikis"}`}>
                        {k.yon === "gelen" ? "Giriş" : "Çıkış"}
                      </span>
                    </td>
                    <td>{ODEME_SEKLI_LABEL[k.odemeSekli] ?? k.odemeSekli}</td>
                    <td className="num">{formatTL(k.toplamTutar)}</td>
                    <td className="num">{formatTL(k.alinanTutar)}</td>
                    <td>
                      <DurumBadge durum={k.durum} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DurumBadge({ durum }: { durum: KasaKaydi["durum"] }) {
  const map = {
    aktif: { label: "Aktif", cls: "badge-overdue" },
    tamamlandi: { label: "Tamamlandı", cls: "badge-giris" },
    arsiv: { label: "Arşivlendi", cls: "bg-gray-100 text-gray-600" },
  } as const;
  const v = map[durum];
  return <span className={`badge ${v.cls}`}>{v.label}</span>;
}
