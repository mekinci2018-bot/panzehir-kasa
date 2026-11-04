"use client";

import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ChevronRight, Plus } from "lucide-react";
import { kartOnerileri, useBankaHesaplari, useKasaKayitlari, useSiparisler } from "@/lib/hooks";
import { addKasaKaydi, arsiveGonder, siparisKapat, tahsilEt } from "@/lib/db";
import { siparisHesap, siparisOdemeleri } from "@/lib/siparis";
import { belgeOzeti } from "@/lib/belge";
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
import { SiraTh } from "./SiraBasligi";
import { sirala, useSiralama, type SiraSutunlari } from "@/lib/siralama";

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

// Firma (ya da personel / serbest metin) bazında grup: Borçlar'da aynı tedarikçinin bütün açık
// kalemleri tek satırda toplanır, satıra tıklayınca kalemler açılır.
interface Grup {
  key: string;
  ad: string;
  firmaId?: string;
  personelId?: string;
  kalemler: AcikKalem[];
  toplam: number;
  ilkTarih: string;
  enYakinVade?: string;
}

const OVERDUE_DAYS = 30;

const KALEM_SUTUNLARI: SiraSutunlari<AcikKalem> = {
  tarih: (k) => k.tarih,
  firma: (k) => k.firma,
  aciklama: (k) => k.aciklama,
  vade: (k) => k.vade,
  tutar: (k) => k.kalan,
};

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
  gruplu = false,
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
  gruplu?: boolean; // firma bazında gruplama (Borçlar)
}) {
  const { kayitlar, loading } = useKasaKayitlari();
  const { siparisler } = useSiparisler();
  const { hesaplar } = useBankaHesaplari();
  const [modalFor, setModalFor] = useState<KasaKaydi | null>(null);
  const [odendiFor, setOdendiFor] = useState<KasaKaydi | null>(null);
  const [siparisFor, setSiparisFor] = useState<AcikKalem | null>(null);
  const [adding, setAdding] = useState(false);
  const [ay, setAy] = useState(currentMonthKey);
  const [acikGruplar, setAcikGruplar] = useState<string[]>([]);

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
  const { sira, sirala: siraDegistir } = useSiralama(yon === "gelen" ? "alacaklar" : "borclar");
  const gorunen = useMemo(
    () => sirala(items.filter((k) => aydaMi(k.tarih, ay) || aydanOnceMi(k.tarih, ay)), sira, KALEM_SUTUNLARI),
    [items, ay, sira]
  );
  const toplamlar = useMemo(() => {
    let buAy = 0;
    let devreden = 0;
    for (const k of gorunen) {
      if (aydaMi(k.tarih, ay)) buAy += k.kalan;
      else devreden += k.kalan;
    }
    return { buAy, devreden };
  }, [gorunen, ay]);

  // Gruplar, kalemlerin ekrandaki sırasını korur: hangi sıralama seçiliyse grup sırası da ona uyar.
  const gruplar = useMemo(() => {
    const map = new Map<string, Grup>();
    for (const k of gorunen) {
      const key = k.firmaId ?? (k.personelId ? `p-${k.personelId}` : `ad-${k.firma}`);
      let g = map.get(key);
      if (!g) {
        g = { key, ad: k.firma, firmaId: k.firmaId, personelId: k.personelId, kalemler: [], toplam: 0, ilkTarih: k.tarih };
        map.set(key, g);
      }
      g.kalemler.push(k);
      g.toplam += k.kalan;
      if (k.tarih < g.ilkTarih) g.ilkTarih = k.tarih;
      if (k.vade && (!g.enYakinVade || k.vade < g.enYakinVade)) g.enYakinVade = k.vade;
    }
    return [...map.values()];
  }, [gorunen]);

  // A payment shouldn't default to an account that has since been deactivated.
  function varsayilanSecim(k: KasaKaydi) {
    const hesap = hesaplar.find((h) => h.id === k.bankaHesapId && !h.pasif);
    return { odemeSekli: k.odemeSekli, bankaHesapId: hesap?.id ?? "", kartAciklama: k.kartAciklama ?? "" };
  }

  function odemeAc(k: AcikKalem) {
    if (k.kayit) setModalFor(k.kayit);
    else setSiparisFor(k);
  }

  function arsivle(k: AcikKalem) {
    if (k.kayit) arsiveGonder(k.kayit.id);
    else if (k.siparis) siparisKapat(k.siparis.id);
  }

  function grupAcKapa(key: string) {
    setAcikGruplar((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  // Vade tarihli kalemlerde (çek / senet) tek tıkla "Ödendi olarak işaretle": kalan tutar hazır gelir,
  // ödeme şekli ve tarihi sorulur, Kasa'ya Çıkış olarak yazılır.
  function KalemButonlari({ k, kucuk = false }: { k: AcikKalem; kucuk?: boolean }) {
    const boy = kucuk ? "!py-1 !px-2.5 !text-[11px]" : "!py-1.5 !px-3 !text-xs";
    return (
      <>
        {k.vade && k.kayit ? (
          <button
            className={`btn-primary ${boy} whitespace-nowrap`}
            title={`Ödendi olarak işaretle — ${actionLabel.toLocaleLowerCase("tr-TR")} penceresi açılır, ödeme şekli ve tarihi sorulur`}
            onClick={() => setOdendiFor(k.kayit!)}
          >
            Ödendi olarak işaretle
          </button>
        ) : (
          <button className={`btn-primary ${boy} whitespace-nowrap`} onClick={() => odemeAc(k)}>
            {actionLabel}
          </button>
        )}
        <button
          className={`btn-secondary ${boy} whitespace-nowrap`}
          title="Kalan tutar kapatılır; cari ekstrede ayrı satır olarak görünür"
          onClick={() => arsivle(k)}
        >
          Arşive Gönder
        </button>
      </>
    );
  }

  function KalemRozetleri({ k }: { k: AcikKalem }) {
    const overdue = !k.vade && daysSince(k.tarih) > OVERDUE_DAYS;
    return (
      <>
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
      </>
    );
  }

  function VadeHucresi({ vade }: { vade?: string }) {
    if (!vade) return <span className="text-[var(--muted-soft)]">—</span>;
    const durum = vadeDurumu(vade);
    return (
      <div className={VADE_RENK[durum]}>
        <div className="tabular">{formatDate(vade)}</div>
        <div className={`text-[11px] ${durum === "normal" ? "text-[var(--muted)]" : "font-medium"}`}>{vadeEtiketi(vade)}</div>
      </div>
    );
  }

  return (
    <div className="page-enter sayfa-dolu gap-2 print:h-auto">
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
          {gruplu && (
            <>
              <span className="text-[var(--border-strong)]">·</span>
              <span>
                {gruplar.length} firma, {gorunen.length} kalem
              </span>
            </>
          )}
        </div>
      )}

      <YazdirmaListesi kalemler={gorunen} ay={ay} tutarBasligi={amountLabel} ekranSirasi={!!sira} />

      {loading && items.length === 0 ? (
        <div className="card print:hidden">
          <YukleniyorSatiri />
        </div>
      ) : items.length === 0 ? (
        <div className="card print:hidden">
          <EmptyState icon={icon} title={emptyTitle} description={emptyDescription} />
        </div>
      ) : gorunen.length === 0 ? (
        <div className="card px-5 py-8 text-sm text-center text-[var(--muted)] print:hidden">
          {monthLabel(ay)} ve öncesinde açık kayıt yok.
        </div>
      ) : (
        <>
          {/* Phone: cards */}
          <div className="md:hidden flex flex-col gap-2.5 print:hidden flex-1 min-h-0 overflow-y-auto">
            {gruplu
              ? gruplar.map((g) => {
                  const tekKalem = g.kalemler.length === 1;
                  const acik = tekKalem || acikGruplar.includes(g.key);
                  return (
                    <div key={g.key} className="card p-3 flex flex-col gap-2">
                      <button
                        type="button"
                        className="flex items-start justify-between gap-3 text-left"
                        onClick={() => !tekKalem && grupAcKapa(g.key)}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {!tekKalem && (
                              <ChevronRight
                                className={`w-3.5 h-3.5 text-[var(--muted-soft)] transition-transform ${acik ? "rotate-90" : ""}`}
                              />
                            )}
                            <FirmaLink firmaId={g.firmaId} personelId={g.personelId} ad={g.ad} className="font-medium" />
                          </div>
                          <div className="text-xs text-[var(--muted)] mt-0.5">
                            {belgeOzeti(g.kalemler.map((k) => k.aciklama))}
                            {g.enYakinVade ? ` · en yakın vade ${formatDate(g.enYakinVade)}` : ""}
                          </div>
                        </div>
                        <div className="tabular font-semibold text-sm shrink-0">{formatTL(g.toplam)}</div>
                      </button>
                      {acik && (
                        <ul className="flex flex-col divide-y divide-[var(--border)] border-t border-[var(--border)]">
                          {g.kalemler.map((k) => {
                            const durum = k.vade ? vadeDurumu(k.vade) : "normal";
                            return (
                              <li key={k.key} className="pt-2 pb-1 flex flex-col gap-1.5">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-[13px] truncate">{k.aciklama || "—"}</div>
                                    <div className={`text-[11px] tabular ${durum === "normal" ? "text-[var(--muted)]" : `font-medium ${VADE_RENK[durum]}`}`}>
                                      {k.vade ? `Vade ${formatDate(k.vade)} · ${vadeEtiketi(k.vade)}` : formatDate(k.tarih)}
                                    </div>
                                  </div>
                                  <div className={`tabular font-medium text-[13px] shrink-0 ${VADE_RENK[durum]}`}>{formatTL(k.kalan)}</div>
                                </div>
                                <div className="flex gap-2">
                                  <KalemButonlari k={k} kucuk />
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })
              : gorunen.map((k) => {
                  const durum = k.vade ? vadeDurumu(k.vade) : "normal";
                  return (
                    <div key={k.key} className="card p-3 flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <FirmaLink firmaId={k.firmaId} personelId={k.personelId} ad={k.firma} className="font-medium" />
                            <KalemRozetleri k={k} />
                          </div>
                          <div className="text-xs text-[var(--muted)] truncate mt-0.5">{k.aciklama || "—"}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`tabular font-semibold text-sm ${VADE_RENK[durum]}`}>{formatTL(k.kalan)}</div>
                          {k.vade ? (
                            <div className={`text-[11px] ${durum === "normal" ? "text-[var(--muted)]" : `font-medium ${VADE_RENK[durum]}`}`}>
                              {vadeEtiketi(k.vade)}
                            </div>
                          ) : (
                            <div className="text-[11px] text-[var(--muted-soft)] tabular">{formatDate(k.tarih)}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <KalemButonlari k={k} />
                      </div>
                    </div>
                  );
                })}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:flex md:flex-col md:flex-1 md:min-h-0 card overflow-hidden print:hidden">
            <div className="table-scroll tablo-doldur">
              <table className="w-full text-sm data-table">
                <thead>
                  <tr>
                    <SiraTh sutun="tarih" sira={sira} onSirala={siraDegistir} className="w-[110px]">Tarih</SiraTh>
                    <SiraTh sutun="firma" sira={sira} onSirala={siraDegistir}>Firma / Kişi</SiraTh>
                    <SiraTh sutun="aciklama" sira={sira} onSirala={siraDegistir}>Açıklama</SiraTh>
                    <SiraTh sutun="vade" sira={sira} onSirala={siraDegistir} className="w-[150px]">Vade</SiraTh>
                    <SiraTh sutun="tutar" sira={sira} onSirala={siraDegistir} className="w-[150px] text-right">{amountLabel}</SiraTh>
                    <th className="w-[300px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {gruplu
                    ? gruplar.flatMap((g) => {
                        const tekKalem = g.kalemler.length === 1;
                        if (tekKalem) {
                          const k = g.kalemler[0];
                          return [
                            <tr key={k.key}>
                              <td className="tabular">{formatDate(k.tarih)}</td>
                              <td className="font-medium">
                                <div className="flex items-center gap-2">
                                  <FirmaLink firmaId={k.firmaId} personelId={k.personelId} ad={k.firma} />
                                  <KalemRozetleri k={k} />
                                </div>
                              </td>
                              <td className="text-[var(--muted)]">{k.aciklama || "—"}</td>
                              <td>
                                <VadeHucresi vade={k.vade} />
                              </td>
                              <td className={`num font-medium ${k.vade ? VADE_RENK[vadeDurumu(k.vade)] : ""}`}>{formatTL(k.kalan)}</td>
                              <td>
                                <div className="flex gap-2 justify-end">
                                  <KalemButonlari k={k} />
                                </div>
                              </td>
                            </tr>,
                          ];
                        }
                        const acik = acikGruplar.includes(g.key);
                        const satirlar = [
                          <tr
                            key={g.key}
                            className="bg-[var(--surface-hover)] cursor-pointer"
                            role="button"
                            tabIndex={0}
                            onClick={() => grupAcKapa(g.key)}
                            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), grupAcKapa(g.key))}
                            title={acik ? "Kalemleri kapat" : "Kalemleri aç"}
                          >
                            <td className="tabular text-[var(--muted)]">{formatDate(g.ilkTarih)}</td>
                            <td className="font-medium">
                              <div className="flex items-center gap-2">
                                <ChevronRight
                                  className={`w-4 h-4 text-[var(--muted-soft)] shrink-0 transition-transform ${acik ? "rotate-90" : ""}`}
                                />
                                <FirmaLink firmaId={g.firmaId} personelId={g.personelId} ad={g.ad} />
                                <span className="badge bg-[#f1f1f4] text-[var(--muted)]">{g.kalemler.length} kalem</span>
                              </div>
                            </td>
                            <td className="text-[var(--muted)]">{belgeOzeti(g.kalemler.map((k) => k.aciklama))}</td>
                            <td>
                              <VadeHucresi vade={g.enYakinVade} />
                            </td>
                            <td className="num font-semibold">{formatTL(g.toplam)}</td>
                            <td />
                          </tr>,
                        ];
                        if (acik) {
                          satirlar.push(
                            ...g.kalemler.map((k) => (
                              <tr key={k.key}>
                                <td className="tabular pl-10">{formatDate(k.tarih)}</td>
                                <td className="text-[var(--muted-soft)]">
                                  <div className="flex items-center gap-2">
                                    <KalemRozetleri k={k} />
                                  </div>
                                </td>
                                <td>{k.aciklama || "—"}</td>
                                <td>
                                  <VadeHucresi vade={k.vade} />
                                </td>
                                <td className={`num font-medium ${k.vade ? VADE_RENK[vadeDurumu(k.vade)] : ""}`}>
                                  {formatTL(k.kalan)}
                                </td>
                                <td>
                                  <div className="flex gap-2 justify-end">
                                    <KalemButonlari k={k} />
                                  </div>
                                </td>
                              </tr>
                            ))
                          );
                        }
                        return satirlar;
                      })
                    : gorunen.map((k) => (
                        <tr key={k.key}>
                          <td className="tabular">{formatDate(k.tarih)}</td>
                          <td className="font-medium">
                            <div className="flex items-center gap-2">
                              <FirmaLink firmaId={k.firmaId} personelId={k.personelId} ad={k.firma} />
                              <KalemRozetleri k={k} />
                            </div>
                          </td>
                          <td className="text-[var(--muted)]">{k.aciklama || "—"}</td>
                          <td>
                            <VadeHucresi vade={k.vade} />
                          </td>
                          <td className={`num font-medium ${k.vade ? VADE_RENK[vadeDurumu(k.vade)] : ""}`}>{formatTL(k.kalan)}</td>
                          <td>
                            <div className="flex gap-2 justify-end">
                              <KalemButonlari k={k} />
                            </div>
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {modalFor && (
        <AmountModal
          title={`${actionLabel} — ${modalFor.firma}`}
          kalan={modalFor.toplamTutar - modalFor.alinanTutar}
          hesaplar={hesaplar}
          kartOnerileri={kartOnerileri(kayitlar)}
          defaultSecim={varsayilanSecim(modalFor)}
          onClose={() => setModalFor(null)}
          onConfirm={async (amount, secim, tarih) => {
            await tahsilEt(modalFor, { tutar: amount, ...secim, tarih });
            setModalFor(null);
          }}
        />
      )}

      {/* Çek / senet: kalan tutarın tamamı hazır gelir, onaylanınca Kasa'ya Çıkış olarak yazılır. */}
      {odendiFor && (
        <AmountModal
          title={`Ödendi olarak işaretle — ${odendiFor.firma}`}
          kalan={odendiFor.toplamTutar - odendiFor.alinanTutar}
          hesaplar={hesaplar}
          kartOnerileri={kartOnerileri(kayitlar)}
          defaultSecim={varsayilanSecim(odendiFor)}
          onayEtiketi="Ödendi olarak işaretle"
          onClose={() => setOdendiFor(null)}
          onConfirm={async (amount, secim, tarih) => {
            try {
              await tahsilEt(odendiFor, { tutar: amount, ...secim, tarih });
              setOdendiFor(null);
            } catch (err) {
              console.error(err);
              alert("Ödeme kaydedilemedi, lütfen tekrar deneyin.");
            }
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
// With a column sort on screen, companies and their items follow the screen order; otherwise
// companies are alphabetical and items by date.
function YazdirmaListesi({
  kalemler,
  ay,
  tutarBasligi,
  ekranSirasi,
}: {
  kalemler: AcikKalem[];
  ay: string;
  tutarBasligi: string;
  ekranSirasi: boolean;
}) {
  const gruplar = new Map<string, { ad: string; kalemler: AcikKalem[] }>();
  for (const k of kalemler) {
    const anahtar = k.firmaId ?? (k.personelId ? `p-${k.personelId}` : `ad-${k.firma}`);
    const g = gruplar.get(anahtar) ?? { ad: k.firma, kalemler: [] };
    g.kalemler.push(k);
    gruplar.set(anahtar, g);
  }
  const sirali = ekranSirasi ? [...gruplar.values()] : [...gruplar.values()].sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
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
            ...(ekranSirasi ? g.kalemler : [...g.kalemler].sort((a, b) => (a.tarih < b.tarih ? -1 : 1))).map((k) => (
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
