"use client";

import { useMemo, useState } from "react";
import { useKasaKayitlari } from "@/lib/hooks";
import { formatDate, formatTL, monthLabel } from "@/lib/format";
import type { KasaKaydi } from "@/lib/types";

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
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-extrabold">Arşiv</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Tüm geçmiş kayıtlar, tamamen tahsil edilmiş/ödenmiş kayıtlar ve manuel arşivlenenler; ay
          ay listelenir.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-bold text-lg">Tüm Kasa Kayıtları (geçmiş)</h2>
        {!loading && tumKayitlar.length === 0 && (
          <p className="text-sm text-[var(--muted)]">Henüz kayıt yok.</p>
        )}
        {tumKayitlar.map(([ay, items]) => (
          <MonthAccordion key={ay} ay={ay} items={items} />
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-bold text-lg">Tahsil Edilen / Ödenen / Arşivlenenler</h2>
        {!loading && kapanmislar.length === 0 && (
          <p className="text-sm text-[var(--muted)]">Henüz kapanmış kayıt yok.</p>
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
        className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50/70 hover:bg-gray-100 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-2 font-semibold">
          <span className={`transition-transform ${open ? "rotate-90" : ""}`}>›</span>
          {monthLabel(ay)}
        </span>
        <span className="text-xs text-[var(--muted)]">{items.length} kayıt</span>
      </button>
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--muted)] text-xs uppercase tracking-wide">
                <th className="px-5 py-2 font-semibold">Tarih</th>
                <th className="px-5 py-2 font-semibold">Firma / Açıklama</th>
                <th className="px-5 py-2 font-semibold">Yön</th>
                <th className="px-5 py-2 font-semibold">Ödeme</th>
                <th className="px-5 py-2 font-semibold">Toplam</th>
                <th className="px-5 py-2 font-semibold">Alınan/Ödenen</th>
                <th className="px-5 py-2 font-semibold">Durum</th>
              </tr>
            </thead>
            <tbody>
              {items
                .sort((a, b) => (a.tarih < b.tarih ? 1 : -1))
                .map((k) => (
                  <tr key={k.id} className="border-t border-[var(--border)]">
                    <td className="px-5 py-2">{formatDate(k.tarih)}</td>
                    <td className="px-5 py-2">
                      <div className="font-medium">{k.firma}</div>
                      <div className="text-xs text-[var(--muted)]">{k.aciklama}</div>
                    </td>
                    <td className="px-5 py-2 capitalize">{k.yon}</td>
                    <td className="px-5 py-2 capitalize">{k.odemeSekli}</td>
                    <td className="px-5 py-2">{formatTL(k.toplamTutar)}</td>
                    <td className="px-5 py-2">{formatTL(k.alinanTutar)}</td>
                    <td className="px-5 py-2">
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
    aktif: { label: "Aktif", cls: "bg-amber-50 text-amber-700" },
    tamamlandi: { label: "Tamamlandı", cls: "bg-green-50 text-green-700" },
    arsiv: { label: "Arşivlendi", cls: "bg-gray-100 text-gray-600" },
  } as const;
  const v = map[durum];
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${v.cls}`}>{v.label}</span>;
}
