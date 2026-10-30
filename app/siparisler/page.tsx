"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, ClipboardList, MoreHorizontal, Plus, Search, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import MonthNav from "@/components/MonthNav";
import YukleniyorSatiri from "@/components/YukleniyorSatiri";
import FirmaLink from "@/components/FirmaLink";
import FirmaSecici from "@/components/FirmaSecici";
import GorselHucre from "@/components/GorselHucre";
import OdemeSekliSelect, { type OdemeSecimi } from "@/components/OdemeSekliSelect";
import SiparisDetayModal, { SiparisOdemeModal, UYARI_RENK } from "@/components/SiparisDetayModal";
import { FaturaRozeti, OdemeRozeti, UretimRozeti } from "@/components/Rozetler";
import { kartOnerileri, onizlemeGetir, useBankaHesaplari, useFirmalar, useKasaKayitlari, useSiparisler } from "@/lib/hooks";
import { addSiparis, gorselEkle, updateSiparis } from "@/lib/db";
import { gorselHazirla } from "@/lib/gorsel";
import { firmaAnahtari, firmaTuru } from "@/lib/firma";
import {
  SEKME_LABEL,
  devrederMi,
  odemeDurumu,
  sekmedeMi,
  siparisHesap,
  siparisOdemeleri,
  tahsilatUyari,
  type SiparisHesap,
  type SiparisSekmesi,
} from "@/lib/siparis";
import { currentMonthKey, formatDate, formatTL, monthLabel, todayISO } from "@/lib/format";
import { aydaMi, aydanOnceMi, kisaAyEtiketi } from "@/lib/donem";
import type { BankaHesabi, Firma, GorselAlani, Siparis } from "@/lib/types";

const SAYFA = 100; // rows rendered at a time; "Daha fazla göster" adds the next batch
const SEKME_ANAHTARI = "siparisler.sekme";
const DEVREDEN_ANAHTARI = "siparisler.devredenAcik";
const SEKMELER = Object.keys(SEKME_LABEL) as SiparisSekmesi[];

interface Taslak {
  firmaId: string;
  firma: string;
  tarih: string;
  urun: string;
  tutar: string;
  odenen: string;
  odeme: OdemeSecimi;
  odemeGunu: string;
  aciklama: string;
  siparisGorselleri: File[];
  bitenGorselleri: File[];
}

const bosTaslak = (): Taslak => ({
  firmaId: "",
  firma: "",
  tarih: todayISO(),
  urun: "",
  tutar: "",
  odenen: "",
  odeme: { odemeSekli: "nakit", bankaHesapId: "", kartAciklama: "" },
  odemeGunu: "",
  aciklama: "",
  siparisGorselleri: [],
  bitenGorselleri: [],
});

function sekmeOku(): SiparisSekmesi {
  try {
    const s = localStorage.getItem(SEKME_ANAHTARI) as SiparisSekmesi | null;
    if (s && SEKMELER.includes(s)) return s;
  } catch {}
  return "tumu";
}

function devredenAcikOku(): boolean {
  try {
    return localStorage.getItem(DEVREDEN_ANAHTARI) !== "0";
  } catch {
    return true;
  }
}

type Hesapli = { s: Siparis; h: SiparisHesap };

// Typing "N" opens a new order, unless the user is typing somewhere or a window is open.
function yazmaAlanindaMi(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  return !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
}

export default function SiparislerPage() {
  const { siparisler, loading } = useSiparisler();
  const { kayitlar } = useKasaKayitlari();
  const { firmalar } = useFirmalar();
  const { hesaplar } = useBankaHesaplari();
  const [ay, setAy] = useState(currentMonthKey);
  const [sekme, setSekmeState] = useState<SiparisSekmesi>("tumu");
  const [devredenAcik, setDevredenAcikState] = useState(true);
  const [arama, setArama] = useState("");
  const [limit, setLimit] = useState(SAYFA);
  const [yeni, setYeni] = useState<Taslak | null>(null);
  const [detayId, setDetayId] = useState<string | null>(null);
  const [odemeId, setOdemeId] = useState<string | null>(null);
  const [mobilYeni, setMobilYeni] = useState(false);
  const [bildirim, setBildirim] = useState<string | null>(null);
  const bildirimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The chosen tab and the carried-over section's open state are remembered on this device.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from localStorage
    setSekmeState(sekmeOku());
    setDevredenAcikState(devredenAcikOku());
  }, []);

  function setSekme(s: SiparisSekmesi) {
    setSekmeState(s);
    setLimit(SAYFA);
    try {
      localStorage.setItem(SEKME_ANAHTARI, s);
    } catch {}
  }

  function devredenToggle() {
    const v = !devredenAcik;
    setDevredenAcikState(v);
    try {
      localStorage.setItem(DEVREDEN_ANAHTARI, v ? "1" : "0");
    } catch {}
  }

  const pencereAcik = !!(yeni || detayId || odemeId || mobilYeni);

  const yeniAc = useCallback(() => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setMobilYeni(true);
      return;
    }
    setYeni((v) => v ?? bosTaslak());
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>('tr[data-taslak] input[data-field="firma"]')?.focus());
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "n" || e.ctrlKey || e.metaKey || e.altKey || yazmaAlanindaMi(e.target) || pencereAcik) return;
      e.preventDefault();
      yeniAc();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pencereAcik, yeniAc]);

  const odemeler = useMemo(() => siparisOdemeleri(kayitlar), [kayitlar]);
  const oneriler = useMemo(() => kartOnerileri(kayitlar), [kayitlar]);
  // Orders are for customers and suppliers, never expense items.
  const musteriler = useMemo(() => firmalar.filter((f) => firmaTuru(f) !== "gider"), [firmalar]);

  const hesapli = useMemo<Hesapli[]>(() => siparisler.map((s) => ({ s, h: siparisHesap(s, odemeler) })), [siparisler, odemeler]);

  // The selected month, plus earlier orders not yet both paid and delivered. A search looks in every month.
  const aramaAnahtari = firmaAnahtari(arama);
  const { ayin, devreden } = useMemo(() => {
    if (aramaAnahtari) {
      return {
        ayin: hesapli.filter(({ s }) => firmaAnahtari(`${s.firmaAdi} ${s.urun} ${s.aciklama}`).includes(aramaAnahtari)),
        devreden: [] as Hesapli[],
      };
    }
    return {
      ayin: hesapli.filter(({ s }) => aydaMi(s.tarih, ay)),
      devreden: hesapli.filter(({ s, h }) => aydanOnceMi(s.tarih, ay) && devrederMi(s, h)),
    };
  }, [hesapli, ay, aramaAnahtari]);

  const kapsam = useMemo(() => [...devreden, ...ayin], [devreden, ayin]);

  const sayilar = useMemo(() => {
    const m = {} as Record<SiparisSekmesi, number>;
    for (const t of SEKMELER) m[t] = kapsam.filter(({ s, h }) => sekmedeMi(t, s, h)).length;
    return m;
  }, [kapsam]);

  const ozet = useMemo(() => {
    let uretimde = 0;
    let bitti = 0;
    let teslimOdenmedi = 0;
    let teslimOdenmediTutar = 0;
    let alacak = 0;
    for (const { s, h } of kapsam) {
      if (sekmedeMi("uretimde", s, h)) uretimde++;
      if (sekmedeMi("bitti", s, h)) bitti++;
      if (sekmedeMi("teslimOdenmedi", s, h)) {
        teslimOdenmedi++;
        teslimOdenmediTutar += h.kalan;
      }
      alacak += h.kalan;
    }
    return { uretimde, bitti, teslimOdenmedi, teslimOdenmediTutar, alacak };
  }, [kapsam]);

  const sekmedeki = (list: Hesapli[]) => list.filter(({ s, h }) => sekmedeMi(sekme, s, h));
  const devredenSekmede = sekmedeki(devreden);
  const devredenKalan = devredenSekmede.reduce((t, { h }) => t + h.kalan, 0);
  const ayinSekmede = sekmedeki(ayin);
  const gorunen = ayinSekmede.slice(0, limit);
  const kalanSayi = ayinSekmede.length - gorunen.length;
  const bos = !loading && devredenSekmede.length === 0 && ayinSekmede.length === 0;
  const rozet = (s: Siparis) => (aramaAnahtari || !aydaMi(s.tarih, ay) ? kisaAyEtiketi(s.tarih, ay) : undefined);

  const bosMetni = aramaAnahtari
    ? `“${arama.trim()}” ile eşleşen sipariş yok.`
    : sekme === "tumu"
      ? `${monthLabel(ay)} için henüz sipariş yok.`
      : "Bu sekmede şu an sipariş yok.";

  const detay = detayId ? siparisler.find((s) => s.id === detayId) : undefined;
  const odemeSiparis = odemeId ? hesapli.find(({ s }) => s.id === odemeId) : undefined;

  function bildir(metin: string) {
    if (bildirimTimer.current) clearTimeout(bildirimTimer.current);
    setBildirim(metin);
    bildirimTimer.current = setTimeout(() => setBildirim(null), 3500);
  }

  async function yeniKaydet() {
    if (!yeni?.firmaId) return;
    const t = yeni;
    setYeni(null);
    try {
      const odenen = Number(t.odenen) || 0;
      const ref = await addSiparis(
        {
          firmaId: t.firmaId,
          firmaAdi: t.firma,
          tarih: t.tarih,
          urun: t.urun.trim(),
          tutar: Number(t.tutar) || 0,
          aciklama: t.aciklama.trim(),
          odemeGunu: t.odemeGunu || undefined,
        },
        odenen > 0 ? { tutar: odenen, ...t.odeme } : undefined
      );
      bildir(odenen > 0 ? "Sipariş kaydedildi · ödeme Kasa'ya işlendi" : "Sipariş kaydedildi");
      await gorselleriYukle(ref.id, "siparis", t.siparisGorselleri);
      await gorselleriYukle(ref.id, "biten", t.bitenGorselleri);
    } catch (err) {
      console.error(err);
      setYeni(t);
      alert("Sipariş kaydedilemedi, lütfen tekrar deneyin.");
    }
  }

  async function gorselleriYukle(siparisId: string, alan: GorselAlani, dosyalar: File[]) {
    for (const d of dosyalar) {
      try {
        await gorselEkle(siparisId, alan, await gorselHazirla(d));
      } catch (err) {
        console.error(err);
        alert("Bir görsel yüklenemedi; siparişin detayından tekrar ekleyebilirsiniz.");
      }
    }
  }

  const devredenBaslik = (
    <button className="inline-flex items-center gap-2 text-[13px] font-medium" onClick={devredenToggle}>
      <ChevronRight className={`w-4 h-4 text-[var(--muted)] transition-transform ${devredenAcik ? "rotate-90" : ""}`} />
      Önceki aylardan devreden
      <span className="text-[var(--muted)] font-normal tabular">
        ({devredenSekmede.length} iş · {formatTL(devredenKalan)} kalan)
      </span>
    </button>
  );

  return (
    <div className="page-enter flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="Siparişler"
          description="Görsel hücresine tıklayıp Ctrl+V ile yapıştırabilirsiniz. Ödenmemiş ya da teslim edilmemiş işler sonraki aylara devreder."
        />
        <div className="flex items-center gap-3">
          <div className={aramaAnahtari ? "opacity-40" : ""} title={aramaAnahtari ? "Arama tüm aylarda yapılıyor" : undefined}>
            <MonthNav monthKey={ay} onChange={(m) => { setAy(m); setLimit(SAYFA); }} />
          </div>
          <button className="btn-primary inline-flex items-center gap-2" onClick={yeniAc} title="Yeni sipariş (N)">
            <Plus className="w-4 h-4" /> Yeni Sipariş
            <kbd className="hidden md:inline text-[10px] font-medium px-1.5 py-0.5 rounded bg-white/15">N</kbd>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[13px] text-[var(--muted)]">
        <OzetOgesi onClick={() => setSekme("uretimde")}>
          Üretimde: <b className="text-[var(--foreground)] tabular">{ozet.uretimde}</b>
        </OzetOgesi>
        <span className="text-[var(--border-strong)]">·</span>
        <OzetOgesi onClick={() => setSekme("bitti")}>
          Bitti, teslim bekliyor: <b className="text-[var(--foreground)] tabular">{ozet.bitti}</b>
        </OzetOgesi>
        <span className="text-[var(--border-strong)]">·</span>
        <OzetOgesi onClick={() => setSekme("teslimOdenmedi")} vurgulu={ozet.teslimOdenmedi > 0}>
          Teslim edildi, ödenmedi:{" "}
          <b className="tabular">
            {ozet.teslimOdenmedi} iş / {formatTL(ozet.teslimOdenmediTutar)}
          </b>
        </OzetOgesi>
        <span className="text-[var(--border-strong)]">·</span>
        <OzetOgesi onClick={() => setSekme("odemeBekleyen")}>
          Toplam alacak: <b className="text-[var(--foreground)] tabular">{formatTL(ozet.alacak)}</b>
        </OzetOgesi>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {SEKMELER.map((t) => {
          const aktif = sekme === t;
          const ozel = t === "teslimOdenmedi";
          return (
            <button
              key={t}
              className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap ${
                aktif
                  ? ozel
                    ? "bg-[var(--brand)] text-white"
                    : "bg-[var(--ink)] text-white"
                  : ozel
                    ? "bg-[var(--brand-soft)] text-[var(--brand-dark)] ring-1 ring-inset ring-[var(--brand)]/25 hover:ring-[var(--brand)]/50"
                    : "bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
              onClick={() => setSekme(t)}
            >
              {SEKME_LABEL[t]}
              <span className={`ml-1.5 tabular text-xs ${aktif ? "text-white/70" : ozel ? "" : "text-[var(--muted-soft)]"}`}>{sayilar[t]}</span>
            </button>
          );
        })}
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-soft)]" />
        <input
          className="input-field !pl-9"
          placeholder="Firma ya da ürün ara (tüm aylar)"
          value={arama}
          onChange={(e) => {
            setArama(e.target.value);
            setLimit(SAYFA);
          }}
        />
      </div>

      {/* Desktop: spreadsheet-style table */}
      <div className="card overflow-hidden hidden md:block">
        <div className="table-scroll siparis-tablo">
          <table className="text-sm data-table min-w-[1780px] w-full">
            <thead>
              <tr>
                <th className="sabit-1">Firma</th>
                <th className="sabit-2">Tarih</th>
                <th className="w-[200px]">Ürün / İş</th>
                <th className="w-[130px]">Sipariş Görseli</th>
                <th className="w-[120px] text-right">Tutar</th>
                <th className="w-[150px] text-right">Ödenen</th>
                <th className="w-[120px] text-right">Kalan</th>
                <th className="w-[130px]">Üretim</th>
                <th className="w-[100px]">Ödeme</th>
                <th className="w-[130px]">Biten Ürün Görseli</th>
                <th className="w-[100px]">Fatura</th>
                <th className="w-[140px]">Ödeme Günü</th>
                <th className="w-[220px]">Açıklama</th>
                <th className="w-[130px]"></th>
              </tr>
            </thead>
            <tbody>
              {yeni && (
                <TaslakSatir
                  value={yeni}
                  firmalar={musteriler}
                  hesaplar={hesaplar}
                  kartOnerileri={oneriler}
                  onChange={(p) => setYeni((v) => (v ? { ...v, ...p } : v))}
                  onSave={yeniKaydet}
                  onKapat={() => setYeni(null)}
                />
              )}
              {devredenSekmede.length > 0 && (
                <tr className="grup-satir">
                  <td colSpan={14}>
                    <div className="sticky left-0 w-fit px-3 py-2">{devredenBaslik}</div>
                  </td>
                </tr>
              )}
              {devredenAcik &&
                devredenSekmede.map(({ s, h }) => (
                  <SiparisSatir key={s.id} s={s} h={h} ayRozeti={rozet(s)} onDetay={() => setDetayId(s.id)} onOdeme={() => setOdemeId(s.id)} />
                ))}
              {devredenSekmede.length > 0 && gorunen.length > 0 && (
                <tr className="grup-satir">
                  <td colSpan={14}>
                    <div className="sticky left-0 w-fit px-3 py-2 text-[13px] font-medium">
                      {monthLabel(ay)} <span className="text-[var(--muted)] font-normal">({ayinSekmede.length} iş)</span>
                    </div>
                  </td>
                </tr>
              )}
              {gorunen.map(({ s, h }) => (
                <SiparisSatir key={s.id} s={s} h={h} ayRozeti={rozet(s)} onDetay={() => setDetayId(s.id)} onOdeme={() => setOdemeId(s.id)} />
              ))}
            </tbody>
          </table>
        </div>
        {loading && siparisler.length === 0 && <YukleniyorSatiri />}
        {bos && <div className="px-5 py-8 text-sm text-center text-[var(--muted)] border-t border-[var(--border)]">{bosMetni}</div>}
        {kalanSayi > 0 && <DahaFazla kalan={kalanSayi} onClick={() => setLimit((l) => l + SAYFA)} />}
      </div>

      {/* Phone: cards */}
      <div className="md:hidden flex flex-col gap-2.5">
        {loading && siparisler.length === 0 && (
          <div className="card">
            <YukleniyorSatiri />
          </div>
        )}
        {bos && <div className="card px-5 py-8 text-sm text-center text-[var(--muted)]">{bosMetni}</div>}
        {devredenSekmede.length > 0 && <div className="px-1">{devredenBaslik}</div>}
        {devredenAcik &&
          devredenSekmede.map(({ s, h }) => <SiparisKarti key={s.id} s={s} h={h} ayRozeti={rozet(s)} onClick={() => setDetayId(s.id)} />)}
        {devredenSekmede.length > 0 && gorunen.length > 0 && <div className="px-1 pt-2 text-[13px] font-medium">{monthLabel(ay)}</div>}
        {gorunen.map(({ s, h }) => (
          <SiparisKarti key={s.id} s={s} h={h} ayRozeti={rozet(s)} onClick={() => setDetayId(s.id)} />
        ))}
        {kalanSayi > 0 && (
          <div className="card">
            <DahaFazla kalan={kalanSayi} onClick={() => setLimit((l) => l + SAYFA)} />
          </div>
        )}
      </div>

      {detay && (
        <SiparisDetayModal
          key={detay.id}
          siparis={detay}
          odemeKayitlari={kayitlar.filter((k) => k.siparisId === detay.id)}
          odemeler={odemeler}
          hesaplar={hesaplar}
          kartOnerileri={oneriler}
          onClose={() => setDetayId(null)}
        />
      )}

      {odemeSiparis && (
        <SiparisOdemeModal
          siparis={odemeSiparis.s}
          kalan={odemeSiparis.h.kalan}
          hesaplar={hesaplar}
          kartOnerileri={oneriler}
          onClose={() => setOdemeId(null)}
        />
      )}

      {mobilYeni && (
        <MobilYeniSiparis
          firmalar={musteriler}
          onClose={() => setMobilYeni(false)}
          onSaved={() => {
            setMobilYeni(false);
            bildir("Sipariş kaydedildi");
          }}
        />
      )}

      {bildirim && (
        <div className="toast-in fixed bottom-6 left-1/2 -translate-x-1/2 z-40 rounded-xl bg-[var(--ink)] text-white px-4 py-2.5 text-sm shadow-[var(--shadow-pop)]">
          {bildirim}
        </div>
      )}
    </div>
  );
}

function DahaFazla({ kalan, onClick }: { kalan: number; onClick: () => void }) {
  return (
    <button
      className="w-full px-5 py-3 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)] border-t border-[var(--border)] transition-colors"
      onClick={onClick}
    >
      Daha fazla göster ({kalan} sipariş daha)
    </button>
  );
}

function OzetOgesi({ children, onClick, vurgulu }: { children: React.ReactNode; onClick: () => void; vurgulu?: boolean }) {
  return (
    <button
      className={`px-2 py-1 rounded-lg transition-colors ${
        vurgulu ? "text-[var(--brand-dark)] bg-[var(--brand-soft)] hover:bg-[#fbe3e3]" : "hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// Edits in place and saves on Enter or when leaving the cell; Escape puts the old value back.
function HucreInput({
  value,
  onCommit,
  type = "text",
  className = "",
  placeholder,
}: {
  value: string;
  onCommit: (v: string) => void;
  type?: "text" | "number" | "date";
  className?: string;
  placeholder?: string;
}) {
  const [taslak, setTaslak] = useState<string | null>(null);
  const iptal = useRef(false);
  return (
    <input
      type={type}
      className={`input-sm ${className}`}
      placeholder={placeholder}
      value={taslak ?? value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setTaslak(e.target.value)}
      onBlur={() => {
        if (!iptal.current && taslak !== null && taslak !== value) onCommit(taslak);
        iptal.current = false;
        setTaslak(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          iptal.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function OdemeGunuHucre({ s, h }: { s: Siparis; h: SiparisHesap }) {
  const uyari = tahsilatUyari(s, h);
  const sonNot = [...(s.tahsilatNotlari ?? [])].sort((a, b) => b.createdAt - a.createdAt)[0];
  return (
    <div>
      <HucreInput
        type="date"
        value={s.odemeGunu ?? ""}
        className={uyari ? `${UYARI_RENK[uyari]} font-medium` : ""}
        onCommit={(v) => updateSiparis(s.id, { odemeGunu: v })}
      />
      {sonNot && (
        <div className="px-2 text-[11px] text-[var(--muted)] truncate max-w-[130px]" title={`${formatDate(sonNot.tarih)} · ${sonNot.metin}`}>
          {sonNot.metin}
        </div>
      )}
    </div>
  );
}

function AyRozeti({ ay }: { ay?: string }) {
  if (!ay) return null;
  return <span className="badge bg-[#f1f1f4] text-[var(--muted)] shrink-0">{ay}</span>;
}

function SiparisSatir({
  s,
  h,
  ayRozeti,
  onDetay,
  onOdeme,
}: {
  s: Siparis;
  h: SiparisHesap;
  ayRozeti?: string;
  onDetay: () => void;
  onOdeme: () => void;
}) {
  const uyari = tahsilatUyari(s, h);
  return (
    <tr className="kasa-row group">
      <td className="sabit-1 align-top">
        <div className="px-2 py-1.5 flex items-center gap-1.5 min-w-0">
          <FirmaLink firmaId={s.firmaId} ad={s.firmaAdi} className="font-medium truncate" />
          <AyRozeti ay={ayRozeti} />
        </div>
      </td>
      <td className="sabit-2 align-top">
        <HucreInput type="date" value={s.tarih} onCommit={(v) => v && updateSiparis(s.id, { tarih: v })} />
      </td>
      <td className="align-top">
        <HucreInput value={s.urun} placeholder="Ürün / iş" onCommit={(v) => updateSiparis(s.id, { urun: v.trim() })} />
      </td>
      <td className="align-top">
        <GorselHucre ids={s.siparisGorselleri} alan="siparis" siparisId={s.id} />
      </td>
      <td className="align-top">
        <HucreInput type="number" className="num" value={String(s.tutar)} onCommit={(v) => updateSiparis(s.id, { tutar: Number(v) || 0 })} />
      </td>
      <td className="align-top num">
        <div className="px-2 py-1.5 tabular">{formatTL(h.odenen)}</div>
      </td>
      <td className="align-top num">
        <div className={`px-2 py-1.5 tabular font-medium ${uyari ? UYARI_RENK[uyari] : h.kalan > 0 ? "" : "text-[var(--muted-soft)]"}`}>
          {formatTL(h.kalan)}
        </div>
      </td>
      <td className="align-top">
        <div className="py-1.5">
          <UretimRozeti value={s.uretim} onChange={(d) => updateSiparis(s.id, { uretim: d })} />
        </div>
      </td>
      <td className="align-top">
        <div className="py-1.5">
          <OdemeRozeti durum={odemeDurumu(s, h)} />
        </div>
      </td>
      <td className="align-top">
        <GorselHucre ids={s.bitenGorselleri} alan="biten" siparisId={s.id} />
      </td>
      <td className="align-top">
        <div className="py-1.5">
          <FaturaRozeti kesildi={s.fatura} onToggle={() => updateSiparis(s.id, { fatura: !s.fatura })} />
        </div>
      </td>
      <td className="align-top">
        <OdemeGunuHucre s={s} h={h} />
      </td>
      <td className="align-top">
        <HucreInput value={s.aciklama} placeholder="—" onCommit={(v) => updateSiparis(s.id, { aciklama: v.trim() })} />
      </td>
      <td className="align-top">
        <div className="flex items-center justify-end gap-1 py-0.5">
          {h.kalan > 0 && (
            <button className="btn-primary !py-1 !px-2.5 !text-xs whitespace-nowrap" onClick={onOdeme}>
              Ödeme Al
            </button>
          )}
          <button className="icon-btn" onClick={onDetay} title="Detay, notlar ve silme">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function TaslakSatir({
  value,
  firmalar,
  hesaplar,
  kartOnerileri,
  onChange,
  onSave,
  onKapat,
}: {
  value: Taslak;
  firmalar: Firma[];
  hesaplar: BankaHesabi[];
  kartOnerileri: string[];
  onChange: (p: Partial<Taslak>) => void;
  onSave: () => void;
  onKapat: () => void;
}) {
  const tutar = Number(value.tutar) || 0;
  const odenen = Number(value.odenen) || 0;
  const kalan = Math.max(0, tutar - odenen);
  const onizlemeDurum = tutar - odenen <= 0.005 ? "odendi" : odenen > 0 ? "kismi" : "odenmedi";

  function handleKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>) {
    // Escape closes the entry row (the company list handles its own Escape first).
    if (e.key === "Escape") {
      e.preventDefault();
      onKapat();
      return;
    }
    if (e.key !== "Enter" || (e.target as HTMLElement).tagName === "BUTTON") return;
    e.preventDefault();
    if (value.firmaId) onSave();
    else if (value.firma.trim()) {
      const el = e.currentTarget.querySelector<HTMLInputElement>("input[data-field=firma]");
      el?.focus();
      el?.click();
    }
  }

  return (
    <tr className="kasa-row taslak-satir" data-taslak="" onKeyDown={handleKeyDown}>
      <td className="sabit-1 align-top">
        <FirmaSecici
          value={{ firmaId: value.firmaId, firma: value.firma }}
          firmalar={firmalar}
          placeholder="Firma"
          onChange={(v) => onChange({ firmaId: v.firmaId, firma: v.firma })}
        />
        {!value.firmaId && value.firma.trim() && (
          <div className="px-2 text-[11px] text-[var(--accent-orange)]">Listeden seçin ya da ekleyin</div>
        )}
      </td>
      <td className="sabit-2 align-top">
        <input type="date" className="input-sm" tabIndex={-1} value={value.tarih} onChange={(e) => onChange({ tarih: e.target.value })} />
      </td>
      <td className="align-top">
        <input className="input-sm" placeholder="Ürün / iş" value={value.urun} onChange={(e) => onChange({ urun: e.target.value })} />
      </td>
      <td className="align-top">
        <GorselHucre ids={[]} alan="siparis" bekleyenler={value.siparisGorselleri} onBekleyenler={(f) => onChange({ siparisGorselleri: f })} />
      </td>
      <td className="align-top">
        <input type="number" className="input-sm num" placeholder="0,00" value={value.tutar} onChange={(e) => onChange({ tutar: e.target.value })} />
      </td>
      <td className="align-top">
        <input
          type="number"
          className="input-sm num"
          placeholder="Peşin"
          title="Peşin alınan; Kasa'ya Giriş olarak işlenir"
          value={value.odenen}
          onChange={(e) => onChange({ odenen: e.target.value })}
        />
        {odenen > 0 && (
          <div className="mt-1">
            <OdemeSekliSelect value={value.odeme} hesaplar={hesaplar} kartOnerileri={kartOnerileri} onChange={(o) => onChange({ odeme: o })} />
          </div>
        )}
      </td>
      <td className="align-top num">
        <div className="px-2 py-1.5 tabular text-[var(--muted)]">{tutar ? formatTL(kalan) : ""}</div>
      </td>
      <td className="align-top">
        <div className="py-1.5 text-[11px] text-[var(--muted-soft)]">Bekliyor</div>
      </td>
      <td className="align-top">
        <div className="py-1.5">{tutar > 0 && <OdemeRozeti durum={onizlemeDurum} />}</div>
      </td>
      <td className="align-top">
        <GorselHucre ids={[]} alan="biten" bekleyenler={value.bitenGorselleri} onBekleyenler={(f) => onChange({ bitenGorselleri: f })} />
      </td>
      <td className="align-top">
        <div className="py-1.5 text-[11px] text-[var(--muted-soft)]">Kesilmedi</div>
      </td>
      <td className="align-top">
        <input type="date" className="input-sm" value={value.odemeGunu} onChange={(e) => onChange({ odemeGunu: e.target.value })} />
      </td>
      <td className="align-top">
        <input className="input-sm" placeholder="Açıklama" value={value.aciklama} onChange={(e) => onChange({ aciklama: e.target.value })} />
      </td>
      <td className="align-top">
        <div className="flex justify-end gap-1">
          <button
            tabIndex={-1}
            className="icon-btn hover:!text-[var(--accent-green)] disabled:opacity-30"
            onClick={onSave}
            disabled={!value.firmaId}
            title={value.firmaId ? "Kaydet (Enter)" : "Önce listeden firma seçin"}
          >
            <Check className="w-4 h-4" />
          </button>
          <button tabIndex={-1} className="icon-btn" onClick={onKapat} title="Vazgeç (Esc)">
            <X className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function KartOnizleme({ id }: { id?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    let iptal = false;
    onizlemeGetir(id).then((s) => !iptal && setSrc(s));
    return () => {
      iptal = true;
    };
  }, [id]);
  return (
    <div className="w-16 h-16 rounded-lg bg-[#f1f1f4] overflow-hidden shrink-0 flex items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL preview */}
      {id && src ? <img src={src} alt="" className="w-full h-full object-cover" /> : <ClipboardList className="w-5 h-5 text-[var(--muted-soft)]" />}
    </div>
  );
}

function SiparisKarti({ s, h, ayRozeti, onClick }: { s: Siparis; h: SiparisHesap; ayRozeti?: string; onClick: () => void }) {
  const uyari = tahsilatUyari(s, h);
  return (
    <div role="button" tabIndex={0} className="card p-3 flex gap-3 active:bg-[var(--surface-hover)]" onClick={onClick} onKeyDown={(e) => e.key === "Enter" && onClick()}>
      <KartOnizleme id={s.bitenGorselleri[0] ?? s.siparisGorselleri[0]} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-medium truncate">{s.firmaAdi}</span>
              <AyRozeti ay={ayRozeti} />
            </div>
            <div className="text-xs text-[var(--muted)] truncate">
              {s.urun || "—"} · <span className="tabular">{formatDate(s.tarih)}</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className={`tabular font-semibold text-sm ${uyari ? UYARI_RENK[uyari] : h.kalan > 0 ? "" : "text-[var(--muted-soft)]"}`}>
              {formatTL(h.kalan)}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">kalan</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <UretimRozeti value={s.uretim} onChange={(d) => updateSiparis(s.id, { uretim: d })} />
          <OdemeRozeti durum={odemeDurumu(s, h)} />
          <FaturaRozeti kesildi={s.fatura} onToggle={() => updateSiparis(s.id, { fatura: !s.fatura })} />
        </div>
      </div>
    </div>
  );
}

function MobilYeniSiparis({ firmalar, onClose, onSaved }: { firmalar: Firma[]; onClose: () => void; onSaved: () => void }) {
  const [t, setT] = useState(bosTaslak);
  const [busy, setBusy] = useState(false);

  async function kaydet(e: React.FormEvent) {
    e.preventDefault();
    if (!t.firmaId || busy) return;
    setBusy(true);
    try {
      await addSiparis({
        firmaId: t.firmaId,
        firmaAdi: t.firma,
        tarih: t.tarih,
        urun: t.urun.trim(),
        tutar: Number(t.tutar) || 0,
        aciklama: t.aciklama.trim(),
        odemeGunu: t.odemeGunu || undefined,
      });
      onSaved();
    } catch (err) {
      console.error(err);
      alert("Sipariş kaydedilemedi, lütfen tekrar deneyin.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-end sm:items-center justify-center z-50 p-3">
      <form className="card w-full max-w-md p-5 flex flex-col gap-3" onSubmit={kaydet}>
        <h3 className="font-semibold text-base">Yeni sipariş</h3>
        <div>
          <label className="field-label">Firma</label>
          <FirmaSecici value={t} firmalar={firmalar} onChange={(v) => setT({ ...t, firmaId: v.firmaId, firma: v.firma })} className="input-field" autoFocus />
        </div>
        <div>
          <label className="field-label">Ürün / İş</label>
          <input className="input-field" value={t.urun} onChange={(e) => setT({ ...t, urun: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Tutar</label>
            <input type="number" className="input-field num" value={t.tutar} onChange={(e) => setT({ ...t, tutar: e.target.value })} />
          </div>
          <div>
            <label className="field-label">Ödeme günü</label>
            <input type="date" className="input-field" value={t.odemeGunu} onChange={(e) => setT({ ...t, odemeGunu: e.target.value })} />
          </div>
        </div>
        <p className="text-[11px] text-[var(--muted)]">Görselleri ve ödemeyi kaydettikten sonra siparişin detayından ekleyebilirsiniz.</p>
        <div className="flex gap-2 justify-end mt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Vazgeç
          </button>
          <button type="submit" className="btn-primary disabled:opacity-40" disabled={busy || !t.firmaId}>
            Kaydet
          </button>
        </div>
      </form>
    </div>
  );
}
