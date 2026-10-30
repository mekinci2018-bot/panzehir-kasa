"use client";

import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Plus } from "lucide-react";
import { kartOnerileri, useBankaHesaplari, useKasaKayitlari, useSiparisler } from "@/lib/hooks";
import { addKasaKaydi, arsiveGonder, siparisKapat, tahsilEt } from "@/lib/db";
import { siparisHesap, siparisOdemeleri } from "@/lib/siparis";
import { currentMonthKey, daysSince, formatDate, formatTL, monthLabel, vadeDurumu, type VadeDurumu } from "@/lib/format";
import { aydaMi, aydanOnceMi, kisaAyEtiketi } from "@/lib/donem";
import MonthNav from "./MonthNav";
import { YazdirButonu, YazdirmaBasligi } from "./Yazdir";
import type { KasaKaydi, Siparis, Yon } from "@/lib/types";
import AmountModal from "./AmountModal";
import VeresiyeModal from "./VeresiyeModal";
import PageHeader from "./PageHeader";
import EmptyState from "./EmptyState";
import YukleniyorSatiri from "./YukleniyorSatiri";
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
  const [ay, setAy] = useState(currentMonthKey);

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

  // The selected month's open amounts, plus those carried over from earlier months. Fully closed
  // records are not here at all, so they stay in their own month (Arşiv).
  const gorunen = useMemo(() => items.filter((k) => aydaMi(k.tarih, ay) || aydanOnceMi(k.tarih, ay)), [items, ay]);
  const toplamlar = useMemo(() => {
    let buAy = 0;
    let devreden = 0;
    for (const k of gorunen) {
      if (aydaMi(k.tarih, ay)) buAy += k.kalan;
      else devreden += k.kalan;
    }
    return { buAy, devreden };
  }, [gorunen, ay]);

  // A payment shouldn't default to an account that has since been deactivated.
  function varsayilanSecim(k: KasaKaydi) {
    const hesap = hesaplar.find((h) => h.id === k.bankaHesapId && !h.pasif);
    return { odemeSekli: k.odemeSekli, bankaHesapId: hesap?.id ?? "", kartAciklama: k.kartAciklama ?? "" };
  }

  return (
    <div className="page-enter flex flex-col gap-6">
      <YazdirmaBasligi baslik={title} donem={monthLabel(ay)} filtreler={["Önceki aylardan devreden açık kalemler dahil"]} />

      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <PageHeader title={title} description={subtitle} />
        <div className="flex flex-wrap items-center gap-3">
          <MonthNav monthKey={ay} onChange={setAy} />
          <YazdirButonu dosyaAdi={`${title} - ${monthLabel(ay)}`} />
          <button className="btn-primary inline-flex items-center gap-2" onClick={() => setAdding(true)}>
            <Plus className="w-4 h-4" /> {newLabel}
          </button>
        </div>
      </div>

      {gorunen.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--muted)] px-1 print:px-0 print:text-[11px]">
          <span>
            {monthLabel(ay)}: <b className="tabular text-[var(--foreground)]">{formatTL(toplamlar.buAy)}</b>
          </span>
          <span className="text-[var(--border-strong)]">·</span>
          <span>
            Devreden: <b className="tabular text-[var(--foreground)]">{formatTL(toplamlar.devreden)}</b>
          </span>
          <span className="text-[var(--border-strong)]">·</span>
          <span>
            Toplam: <b className="tabular text-[var(--foreground)]">{formatTL(toplamlar.buAy + toplamlar.devreden)}</b>
          </span>
        </div>
      )}

      <YazdirmaListesi kalemler={gorunen} ay={ay} tutarBasligi={amountLabel} />

      <div className="card overflow-hidden print:hidden">
        {loading && items.length === 0 ? (
          <YukleniyorSatiri />
        ) : items.length === 0 ? (
          <EmptyState icon={icon} title={emptyTitle} description={emptyDescription} />
        ) : gorunen.length === 0 ? (
          <div className="px-5 py-8 text-sm text-center text-[var(--muted)]">{monthLabel(ay)} ve öncesinde açık kayıt yok.</div>
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
                {gorunen.map((k) => {
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
                          {!aydaMi(k.tarih, ay) && (
                            <span className="badge bg-[#f1f1f4] text-[var(--muted)]" title="Önceki aydan kalan">
                              Devreden · {kisaAyEtiketi(k.tarih, ay)}
                            </span>
                          )}
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

// Print view: grouped by company with subtotals and a grand total; carried-over items are marked.
function YazdirmaListesi({ kalemler, ay, tutarBasligi }: { kalemler: AcikKalem[]; ay: string; tutarBasligi: string }) {
  const gruplar = new Map<string, { ad: string; kalemler: AcikKalem[] }>();
  for (const k of kalemler) {
    const anahtar = k.firmaId ?? (k.personelId ? `p-${k.personelId}` : `ad-${k.firma}`);
    const g = gruplar.get(anahtar) ?? { ad: k.firma, kalemler: [] };
    g.kalemler.push(k);
    gruplar.set(anahtar, g);
  }
  const sirali = [...gruplar.values()].sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  const genelToplam = kalemler.reduce((t, k) => t + k.kalan, 0);

  if (kalemler.length === 0) {
    return <p className="hidden print:block text-[11px] text-[var(--muted)] mt-4">Bu dönemde açık kalem yok.</p>;
  }

  return (
    <table className="yazdir-tablo hidden print:table mt-2">
      <thead>
        <tr>
          <th className="w-[70px]">Tarih</th>
          <th>Açıklama</th>
          <th className="w-[70px]">Vade</th>
          <th className="sag w-[100px]">{tutarBasligi}</th>
        </tr>
      </thead>
      <tbody>
        {sirali.map((g) => {
          const araToplam = g.kalemler.reduce((t, k) => t + k.kalan, 0);
          return [
            <tr key={`${g.ad}-b`} className="grup-basi">
              <td colSpan={4}>{g.ad}</td>
            </tr>,
            ...[...g.kalemler]
              .sort((a, b) => (a.tarih < b.tarih ? -1 : 1))
              .map((k) => (
                <tr key={k.key}>
                  <td className="tabular">{formatDate(k.tarih)}</td>
                  <td>
                    {k.aciklama || "—"}
                    {k.siparis && <span className="yazdir-isaret">Sipariş</span>}
                    {!aydaMi(k.tarih, ay) && <span className="yazdir-isaret">Devreden · {kisaAyEtiketi(k.tarih, ay)}</span>}
                  </td>
                  <td className="tabular">{k.vade ? formatDate(k.vade) : "—"}</td>
                  <td className="sag">{formatTL(k.kalan)}</td>
                </tr>
              )),
            <tr key={`${g.ad}-t`} className="ara-toplam">
              <td colSpan={3}>Ara toplam · {g.kalemler.length} kalem</td>
              <td className="sag">{formatTL(araToplam)}</td>
            </tr>,
          ];
        })}
        <tr className="genel-toplam">
          <td colSpan={3}>Genel toplam · {sirali.length} firma, {kalemler.length} kalem</td>
          <td className="sag">{formatTL(genelToplam)}</td>
        </tr>
      </tbody>
    </table>
  );
}
