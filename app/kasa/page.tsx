"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import StatStrip from "@/components/StatStrip";
import MonthNav from "@/components/MonthNav";
import PageHeader from "@/components/PageHeader";
import { useBankaHesaplari, useKasaKayitlari } from "@/lib/hooks";
import { addKasaKaydi, deleteKasaKaydi, updateKasaKaydi } from "@/lib/db";
import { tumHareketler, signed } from "@/lib/hareketler";
import { currentMonthKey, formatTL, monthKeyOf, todayISO } from "@/lib/format";
import type { KasaKaydi } from "@/lib/types";
import KayitRow, { type DraftKayit } from "./KayitRow";

const DRAFT_COUNT = 5;

const emptyDraft = (): DraftKayit => ({
  tarih: todayISO(),
  firma: "",
  aciklama: "",
  toplamTutar: "",
  alinanTutar: "",
  odemeSekli: "nakit",
  bankaHesapId: "",
  yon: "gelen",
});

interface DraftSlot {
  key: number;
  value: DraftKayit;
}

let draftSeq = 0;
const newSlot = (): DraftSlot => ({ key: ++draftSeq, value: emptyDraft() });

function focusFirstEmptyDraft() {
  requestAnimationFrame(() => {
    const inputs = document.querySelectorAll<HTMLInputElement>('tr[data-draft] input[data-field="firma"]');
    const target = [...inputs].find((i) => !i.value) ?? inputs[0];
    target?.focus();
  });
}

export default function KasaPage() {
  const { kayitlar, loading } = useKasaKayitlari();
  const { hesaplar } = useBankaHesaplari();
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [drafts, setDrafts] = useState<DraftSlot[]>(() => Array.from({ length: DRAFT_COUNT }, newSlot));
  const [savingId, setSavingId] = useState<string | null>(null);

  const thisMonth = currentMonthKey();

  const stats = useMemo(() => {
    let kasadakiNakit = 0;
    let bankaBuAy = 0;
    let toplamAlacak = 0;
    let toplamBorc = 0;

    // Cash balance counts only nakit; kart and havale are on the bank side.
    for (const h of tumHareketler(kayitlar)) {
      if (h.odemeSekli === "nakit") kasadakiNakit += signed(h);
      else if (h.yon === "gelen" && monthKeyOf(h.tarih) === thisMonth) bankaBuAy += h.tutar;
    }
    for (const k of kayitlar) {
      if (k.durum !== "aktif") continue;
      const kalan = k.toplamTutar - k.alinanTutar;
      if (kalan <= 0) continue;
      if (k.yon === "gelen") toplamAlacak += kalan;
      else toplamBorc += kalan;
    }
    return { kasadakiNakit, bankaBuAy, toplamAlacak, toplamBorc };
  }, [kayitlar, thisMonth]);

  // Oldest first, so new rows land right above the empty entry rows.
  const monthKayitlar = useMemo(
    () =>
      kayitlar
        .filter((k) => k.ay === monthKey)
        .sort((a, b) => (a.tarih === b.tarih ? a.createdAt - b.createdAt : a.tarih < b.tarih ? -1 : 1)),
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

  const borclar = useMemo(
    () =>
      kayitlar
        .filter((k) => k.yon === "giden" && k.durum === "aktif" && k.toplamTutar - k.alinanTutar > 0)
        .sort((a, b) => (a.tarih < b.tarih ? 1 : -1))
        .slice(0, 5),
    [kayitlar]
  );

  async function saveDraft(key: number) {
    const slot = drafts.find((s) => s.key === key);
    if (!slot || !slot.value.firma.trim()) return;
    const d = slot.value;

    // Saved row leaves the draft area and a fresh empty row is appended, keeping DRAFT_COUNT.
    setDrafts((prev) => [...prev.filter((s) => s.key !== key), newSlot()]);
    focusFirstEmptyDraft();

    try {
      await addKasaKaydi({
        tarih: d.tarih,
        firma: d.firma.trim(),
        aciklama: d.aciklama.trim(),
        toplamTutar: Number(d.toplamTutar) || 0,
        alinanTutar: Number(d.alinanTutar) || 0,
        odemeSekli: d.odemeSekli,
        bankaHesapId: d.bankaHesapId,
        yon: d.yon,
      });
    } catch (err) {
      console.error(err);
      setDrafts((prev) => [slot, ...prev.slice(0, DRAFT_COUNT - 1)]);
      alert("Kayıt kaydedilemedi, lütfen tekrar deneyin.");
    }
  }

  function updateDraft(key: number, patch: Partial<DraftKayit>) {
    setDrafts((prev) => prev.map((s) => (s.key === key ? { ...s, value: { ...s.value, ...patch } } : s)));
  }

  async function saveExisting(k: KasaKaydi, patch: Partial<KasaKaydi>) {
    setSavingId(k.id);
    await updateKasaKaydi(k.id, patch);
    setSavingId(null);
  }

  return (
    <div className="page-enter flex flex-col gap-8">
      <PageHeader
        title="Kasa"
        description="İşlemleri Excel'de yazar gibi girin. Tab ile hücreler arasında gezin, Enter ile kaydedin."
        showGreeting
      />

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <MonthNav monthKey={monthKey} onChange={setMonthKey} />
          {loading && <span className="text-xs text-[var(--muted)]">yükleniyor…</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm data-table">
            <thead>
              <tr>
                <th className="w-[140px]">Tarih</th>
                <th>Firma / Açıklama</th>
                <th className="w-[130px] text-right">Toplam Tutar</th>
                <th className="w-[260px]">Ödeme Şekli</th>
                <th className="w-[100px]">İşlem</th>
                <th className="w-[130px] text-right" title="Kalan tutar otomatik olarak Alacaklar/Borçlar'a düşer">
                  Peşin Ödenen
                </th>
                <th className="w-[84px]"></th>
              </tr>
            </thead>
            <tbody>
              {monthKayitlar.map((k) => (
                <KayitRow
                  key={k.id}
                  value={k}
                  hesaplar={hesaplar}
                  saving={savingId === k.id}
                  onSave={(patch) => saveExisting(k, patch)}
                  onDelete={() => deleteKasaKaydi(k.id)}
                />
              ))}
              {drafts.map((s) => (
                <KayitRow
                  key={`draft-${s.key}`}
                  value={s.value}
                  hesaplar={hesaplar}
                  isDraft
                  onSave={() => saveDraft(s.key)}
                  onDraftChange={(patch) => updateDraft(s.key, patch)}
                />
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-2.5 border-t border-[var(--border)] text-[11px] text-[var(--muted-soft)]">
          Peşin ödenmeyen kısım otomatik olarak Alacaklar / Borçlar&apos;a düşer.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <PreviewList title="Alacaklar" href="/alacaklar" items={alacaklar} tone="orange" />
        <PreviewList title="Borçlar" href="/verecekler" items={borclar} tone="red" />
      </div>

      <StatStrip
        items={[
          {
            title: "Kasa Bakiyesi",
            value: formatTL(stats.kasadakiNakit),
            hint: "Elde bulunan nakit para (kart ve havale hariç)",
            tone: "green",
          },
          {
            title: "Bu Ay Banka Tahsilatı",
            value: formatTL(stats.bankaBuAy),
            hint: "Bu ay kredi kartı ve havale ile gelen",
            tone: "blue",
          },
          {
            title: "Tahsil Edilecek",
            value: formatTL(stats.toplamAlacak),
            hint: "Müşterilerden alınacak toplam",
            tone: "orange",
          },
          {
            title: "Ödenecek Borç",
            value: formatTL(stats.toplamBorc),
            hint: "Tedarikçilere ödenecek toplam",
            tone: "red",
          },
        ]}
      />
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
  tone: "orange" | "red";
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Link href={href} className="text-xs text-[var(--muted)] font-medium hover:text-[var(--foreground)]">
          Tümünü gör →
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--muted)] py-2">Şu an bekleyen kayıt yok.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border)]">
          {items.map((k) => (
            <li key={k.id} className="py-2.5 flex items-center justify-between gap-4 text-sm">
              <div className="min-w-0">
                <div className="font-medium truncate">{k.firma}</div>
                <div className="text-xs text-[var(--muted)] truncate">{k.aciklama || "—"}</div>
              </div>
              <div
                className={`num font-medium ${tone === "orange" ? "text-[var(--accent-orange)]" : "text-[var(--brand)]"}`}
              >
                {formatTL(k.toplamTutar - k.alinanTutar)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
