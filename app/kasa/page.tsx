"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import StatCard from "@/components/StatCard";
import MonthNav from "@/components/MonthNav";
import { useKasaKayitlari } from "@/lib/hooks";
import { addKasaKaydi, deleteKasaKaydi, updateKasaKaydi } from "@/lib/db";
import { currentMonthKey, formatTL, todayISO } from "@/lib/format";
import type { KasaKaydi } from "@/lib/types";
import KayitRow, { type DraftKayit } from "./KayitRow";

const emptyDraft = (): DraftKayit => ({
  tarih: todayISO(),
  firma: "",
  aciklama: "",
  toplamTutar: "",
  alinanTutar: "",
  odemeSekli: "nakit",
  yon: "gelen",
});

export default function KasaPage() {
  const { kayitlar, loading } = useKasaKayitlari();
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [drafts, setDrafts] = useState<DraftKayit[]>([emptyDraft()]);
  const [savingId, setSavingId] = useState<string | null>(null);

  const thisMonth = currentMonthKey();

  const stats = useMemo(() => {
    let kasadakiNakit = 0;
    let kartBuAy = 0;
    let toplamAlacak = 0;
    let toplamBorc = 0;

    for (const k of kayitlar) {
      const sign = k.yon === "gelen" ? 1 : -1;
      if (k.odemeSekli === "nakit") kasadakiNakit += sign * k.alinanTutar;
      if (k.odemeSekli === "kart" && k.yon === "gelen" && k.ay === thisMonth) {
        kartBuAy += k.alinanTutar;
      }
      if (k.durum === "aktif") {
        const kalan = k.toplamTutar - k.alinanTutar;
        if (kalan > 0) {
          if (k.yon === "gelen") toplamAlacak += kalan;
          else toplamBorc += kalan;
        }
      }
    }
    return { kasadakiNakit, kartBuAy, toplamAlacak, toplamBorc };
  }, [kayitlar, thisMonth]);

  const monthKayitlar = useMemo(
    () => kayitlar.filter((k) => k.ay === monthKey).sort((a, b) => (a.tarih < b.tarih ? 1 : -1)),
    [kayitlar, monthKey]
  );

  const alacaklar = useMemo(
    () =>
      kayitlar
        .filter((k) => k.yon === "gelen" && k.durum === "aktif" && k.toplamTutar - k.alinanTutar > 0)
        .sort((a, b) => (a.tarih < b.tarih ? 1 : -1))
        .slice(0, 5),
    [kayitlar]
  );

  const verecekler = useMemo(
    () =>
      kayitlar
        .filter((k) => k.yon === "giden" && k.durum === "aktif" && k.toplamTutar - k.alinanTutar > 0)
        .sort((a, b) => (a.tarih < b.tarih ? 1 : -1))
        .slice(0, 5),
    [kayitlar]
  );

  async function saveDraft(index: number) {
    const d = drafts[index];
    if (!d.firma.trim()) return;
    const toplam = Number(d.toplamTutar) || 0;
    const alinan = Number(d.alinanTutar) || 0;
    await addKasaKaydi({
      tarih: d.tarih,
      firma: d.firma.trim(),
      aciklama: d.aciklama.trim(),
      toplamTutar: toplam,
      alinanTutar: alinan,
      odemeSekli: d.odemeSekli,
      yon: d.yon,
    });
    setDrafts((prev) => {
      const next = [...prev];
      next[index] = emptyDraft();
      return next;
    });
  }

  function updateDraft(index: number, patch: Partial<DraftKayit>) {
    setDrafts((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      if (index === next.length - 1 && next[index].firma.trim()) {
        next.push(emptyDraft());
      }
      return next;
    });
  }

  async function saveExisting(k: KasaKaydi, patch: Partial<KasaKaydi>) {
    setSavingId(k.id);
    await updateKasaKaydi(k.id, patch);
    setSavingId(null);
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-extrabold">Kasa</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Yeni işlemleri Excel&apos;de yazar gibi girin. Kaydedilen satırlar Arşiv&apos;de ay ay
          listelenir.
        </p>
      </div>

      <div className="flex flex-wrap gap-4">
        <StatCard
          title="Kasadaki Nakit"
          value={formatTL(stats.kasadakiNakit)}
          subtitle="tüm zamanların devreden bakiyesi"
        />
        <StatCard
          title="Kart / Banka ile Alınan"
          value={formatTL(stats.kartBuAy)}
          subtitle="bu aya ait, her ay sıfırlanır"
        />
        <StatCard
          title="Toplam Alacak"
          value={formatTL(stats.toplamAlacak)}
          tone="amber"
          subtitle="tahsil edilmemiş"
        />
        <StatCard
          title="Toplam Verecek"
          value={formatTL(stats.toplamBorc)}
          tone="red"
          subtitle="ödenmemiş borç"
        />
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <MonthNav monthKey={monthKey} onChange={setMonthKey} />
          {loading && <span className="text-xs text-[var(--muted)]">yükleniyor…</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--muted)] text-xs uppercase tracking-wide">
                <th className="px-4 py-3 font-semibold w-[120px]">Tarih</th>
                <th className="px-4 py-3 font-semibold">Firma / Açıklama</th>
                <th className="px-4 py-3 font-semibold w-[130px]">Toplam Tutar</th>
                <th className="px-4 py-3 font-semibold w-[110px]">Ödeme Şekli</th>
                <th className="px-4 py-3 font-semibold w-[120px]">Yön</th>
                <th className="px-4 py-3 font-semibold w-[130px]">Alınan / Ödenen</th>
                <th className="px-4 py-3 font-semibold w-[80px]"></th>
              </tr>
            </thead>
            <tbody>
              {monthKayitlar.map((k) => (
                <KayitRow
                  key={k.id}
                  value={k}
                  saving={savingId === k.id}
                  onSave={(patch) => saveExisting(k, patch)}
                  onDelete={() => deleteKasaKaydi(k.id)}
                />
              ))}
              {drafts.map((d, i) => (
                <KayitRow
                  key={`draft-${i}`}
                  value={d}
                  isDraft
                  onSave={() => saveDraft(i)}
                  onDraftChange={(patch) => updateDraft(i, patch)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <PreviewList title="Alacaklar" href="/alacaklar" items={alacaklar} tone="amber" />
        <PreviewList title="Verecekler" href="/verecekler" items={verecekler} tone="red" />
      </div>
    </div>
  );
}

function PreviewList({
  title,
  href,
  items,
  tone,
}: {
  title: string;
  href: string;
  items: KasaKaydi[];
  tone: "amber" | "red";
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold">{title}</h2>
        <Link href={href} className="text-sm text-[var(--brand)] font-medium hover:underline">
          Tümünü gör →
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Kayıt yok.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border)]">
          {items.map((k) => (
            <li key={k.id} className="py-2.5 flex items-center justify-between text-sm">
              <div>
                <div className="font-medium">{k.firma}</div>
                <div className="text-xs text-[var(--muted)]">{k.aciklama || "—"}</div>
              </div>
              <div className={`font-bold ${tone === "amber" ? "text-[var(--accent-amber)]" : "text-[var(--brand)]"}`}>
                {formatTL(k.toplamTutar - k.alinanTutar)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
