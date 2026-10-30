"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import StatStrip from "@/components/StatStrip";
import PageHeader from "@/components/PageHeader";
import KayitDetayModal from "@/components/KayitDetayModal";
import { hesapEtiketi } from "@/components/OdemeSekliSelect";
import { kartOnerileri, useBankaHesaplari, useKasaKayitlari } from "@/lib/hooks";
import { addKasaKaydi, kaydiGeriAl } from "@/lib/db";
import { tumHareketler, signed } from "@/lib/hareketler";
import { ODEME_SEKLI_LABEL, formatTL, todayISO } from "@/lib/format";
import type { BankaHesabi, KasaKaydi } from "@/lib/types";
import KayitRow, { type DraftKayit } from "./KayitRow";

const DRAFT_COUNT = 5;
const GERI_AL_MS = 5000;

const emptyDraft = (): DraftKayit => ({
  tarih: todayISO(),
  firma: "",
  aciklama: "",
  toplamTutar: "",
  alinanTutar: "",
  odemeSekli: "nakit",
  bankaHesapId: "",
  kartAciklama: "",
  yon: "gelen",
});

interface DraftSlot {
  key: number;
  value: DraftKayit;
}

let draftSeq = 0;
const newSlot = (value: DraftKayit = emptyDraft()): DraftSlot => ({ key: ++draftSeq, value });

function focusFirstEmptyDraft() {
  requestAnimationFrame(() => {
    const inputs = document.querySelectorAll<HTMLInputElement>('tr[data-draft] input[data-field="firma"]');
    const target = [...inputs].find((i) => !i.value) ?? inputs[0];
    target?.focus();
  });
}

function localDay(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function KasaPage() {
  const { kayitlar, loading } = useKasaKayitlari();
  const { hesaplar } = useBankaHesaplari();
  const [drafts, setDrafts] = useState<DraftSlot[]>(() => Array.from({ length: DRAFT_COUNT }, () => newSlot()));
  const [geriAl, setGeriAl] = useState<{ id: string; draft: DraftKayit } | null>(null);
  const geriAlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [detayId, setDetayId] = useState<string | null>(null);

  useEffect(() => () => {
    if (geriAlTimer.current) clearTimeout(geriAlTimer.current);
  }, []);

  const oneriler = useMemo(() => kartOnerileri(kayitlar), [kayitlar]);

  const stats = useMemo(() => {
    let nakit = 0;
    let banka = 0;
    let kartPos = 0;
    let toplamAlacak = 0;
    let toplamBorc = 0;

    for (const h of tumHareketler(kayitlar)) {
      if (h.odemeSekli === "nakit") nakit += signed(h);
      else if (h.odemeSekli === "havale") banka += signed(h);
      else kartPos += signed(h);
    }
    for (const k of kayitlar) {
      if (k.durum !== "aktif") continue;
      const kalan = k.toplamTutar - k.alinanTutar;
      if (kalan <= 0) continue;
      if (k.yon === "gelen") toplamAlacak += kalan;
      else toplamBorc += kalan;
    }
    return { nakit, banka, kartPos, toplam: nakit + banka + kartPos, toplamAlacak, toplamBorc };
  }, [kayitlar]);

  // Entered today (by save time, not the record's own date), newest first.
  const bugunGirilenler = useMemo(() => {
    const bugun = todayISO();
    return kayitlar.filter((k) => localDay(k.createdAt) === bugun).sort((a, b) => b.createdAt - a.createdAt);
  }, [kayitlar]);

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

  const detay = detayId ? kayitlar.find((k) => k.id === detayId) : undefined;

  function bildirimGoster(id: string, draft: DraftKayit) {
    if (geriAlTimer.current) clearTimeout(geriAlTimer.current);
    setGeriAl({ id, draft });
    geriAlTimer.current = setTimeout(() => setGeriAl(null), GERI_AL_MS);
  }

  async function saveDraft(key: number) {
    const slot = drafts.find((s) => s.key === key);
    if (!slot || !slot.value.firma.trim()) return;
    const d = slot.value;

    // The saved row leaves the form and a fresh empty row is appended, keeping DRAFT_COUNT.
    setDrafts((prev) => [...prev.filter((s) => s.key !== key), newSlot()]);
    focusFirstEmptyDraft();

    try {
      const ref = await addKasaKaydi({
        tarih: d.tarih,
        firma: d.firma.trim(),
        aciklama: d.aciklama.trim(),
        toplamTutar: Number(d.toplamTutar) || 0,
        alinanTutar: Number(d.alinanTutar) || 0,
        odemeSekli: d.odemeSekli,
        bankaHesapId: d.bankaHesapId,
        kartAciklama: d.kartAciklama,
        yon: d.yon,
      });
      bildirimGoster(ref.id, d);
    } catch (err) {
      console.error(err);
      setDrafts((prev) => [slot, ...prev.slice(0, DRAFT_COUNT - 1)]);
      alert("Kayıt kaydedilemedi, lütfen tekrar deneyin.");
    }
  }

  // Undo puts the entry back into the form so it can be corrected and saved again.
  async function geriAlUygula() {
    if (!geriAl) return;
    const { id, draft } = geriAl;
    if (geriAlTimer.current) clearTimeout(geriAlTimer.current);
    setGeriAl(null);
    try {
      await kaydiGeriAl(id);
      setDrafts((prev) => {
        // The restored entry takes the place of an empty row, at the top so it is easy to spot.
        const bos = prev.findIndex((s) => !s.value.firma.trim());
        const kalan = bos === -1 ? prev.slice(0, DRAFT_COUNT - 1) : prev.filter((_, i) => i !== bos);
        return [newSlot(draft), ...kalan];
      });
    } catch (err) {
      console.error(err);
      alert("Geri alınamadı; kaydı Arşiv'den açıp silebilirsin.");
    }
  }

  function updateDraft(key: number, patch: Partial<DraftKayit>) {
    setDrafts((prev) => prev.map((s) => (s.key === key ? { ...s, value: { ...s.value, ...patch } } : s)));
  }

  return (
    <div className="page-enter flex flex-col gap-8">
      <PageHeader
        title="Kasa"
        description="İşlemleri Excel'de yazar gibi girin. Tab ile hücreler arasında gezin, Enter ile kaydedin; kayıt Arşiv'e gider."
        showGreeting
      />

      <div className="card overflow-hidden">
        <div className="table-scroll">
          <table className="w-full text-sm data-table">
            <thead>
              <tr>
                <th className="w-[140px]">Tarih</th>
                <th>Firma / Açıklama</th>
                <th className="w-[130px] text-right">Toplam Tutar</th>
                <th className="w-[280px]">Ödeme Şekli</th>
                <th className="w-[100px]">İşlem</th>
                <th className="w-[130px] text-right" title="Kalan tutar otomatik olarak Alacaklar/Borçlar'a düşer">
                  Peşin Ödenen
                </th>
                <th className="w-[52px]"></th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((s) => (
                <KayitRow
                  key={`draft-${s.key}`}
                  value={s.value}
                  hesaplar={hesaplar}
                  kartOnerileri={oneriler}
                  onSave={() => saveDraft(s.key)}
                  onChange={(patch) => updateDraft(s.key, patch)}
                />
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-2.5 border-t border-[var(--border)] text-[11px] text-[var(--muted-soft)]">
          Peşin ödenmeyen kısım otomatik olarak Alacaklar / Borçlar&apos;a düşer.
        </div>
      </div>

      <BugunGirilenler items={bugunGirilenler} loading={loading} hesaplar={hesaplar} onSelect={setDetayId} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <PreviewList title="Alacaklar" href="/alacaklar" items={alacaklar} tone="orange" />
        <PreviewList title="Borçlar" href="/verecekler" items={borclar} tone="red" />
      </div>

      <StatStrip
        items={[
          {
            title: "Toplam Kasa",
            value: formatTL(stats.toplam),
            hint: "Nakit + Banka + Kart / POS",
            tone: "green",
            vurgulu: true,
          },
          {
            title: "Nakit Kasa",
            value: formatTL(stats.nakit),
            hint: "Elde bulunan nakit para",
            tone: "green",
          },
          {
            title: "Banka",
            value: formatTL(stats.banka),
            hint: "Banka havalesi ile giren/çıkanların toplam bakiyesi",
            tone: "blue",
          },
          {
            title: "Kart / POS",
            value: formatTL(stats.kartPos),
            hint: "Kredi kartı ile alınanlar",
            tone: "violet",
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

      {detay && (
        <KayitDetayModal
          key={detay.id}
          kayit={detay}
          hesaplar={hesaplar}
          kartOnerileri={oneriler}
          onClose={() => setDetayId(null)}
        />
      )}

      {geriAl && (
        <div className="toast-in fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 rounded-xl bg-[var(--ink)] text-white pl-4 pr-2 py-2 text-sm shadow-[var(--shadow-pop)]">
          <span>Arşive kaydedildi</span>
          <span className="text-white/30">·</span>
          <button className="font-semibold text-white hover:bg-white/10 rounded-lg px-2.5 py-1 transition-colors" onClick={geriAlUygula}>
            Geri al
          </button>
        </div>
      )}
    </div>
  );
}

function BugunGirilenler({
  items,
  loading,
  hesaplar,
  onSelect,
}: {
  items: KasaKaydi[];
  loading: boolean;
  hesaplar: BankaHesabi[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">
          Bugün girilenler
          {items.length > 0 && <span className="ml-2 text-xs font-normal text-[var(--muted)]">{items.length} kayıt</span>}
        </h2>
        <Link href="/arsiv" className="text-xs text-[var(--muted)] font-medium hover:text-[var(--foreground)] inline-flex items-center gap-1">
          Arşiv <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--muted)] py-2">{loading ? "yükleniyor…" : "Bugün henüz kayıt girilmedi."}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border)] -mx-2">
          {items.map((k) => {
            const hesap = hesaplar.find((h) => h.id === k.bankaHesapId);
            const odeme = [ODEME_SEKLI_LABEL[k.odemeSekli], hesap ? hesapEtiketi(hesap) : k.kartAciklama]
              .filter(Boolean)
              .join(" · ");
            const saat = new Date(k.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
            return (
              <li key={k.id}>
                <button
                  className="w-full text-left px-2 py-2 rounded-lg hover:bg-[var(--surface-hover)] flex items-center gap-4 text-sm transition-colors"
                  onClick={() => onSelect(k.id)}
                >
                  <span className="tabular text-xs text-[var(--muted)] w-10 shrink-0">{saat}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium truncate block">{k.firma}</span>
                    <span className="text-xs text-[var(--muted)] truncate block">
                      {[k.aciklama, odeme].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className={`tabular font-medium shrink-0 ${k.yon === "gelen" ? "text-[var(--accent-green)]" : ""}`}>
                    {k.yon === "gelen" ? "+" : "−"}
                    {formatTL(k.toplamTutar)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
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
