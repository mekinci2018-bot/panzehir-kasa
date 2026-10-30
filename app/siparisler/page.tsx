"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ClipboardList, MoreHorizontal, Plus, Search } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
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
  odemeDurumu,
  sekmedeMi,
  siparisHesap,
  siparisOdemeleri,
  tahsilatUyari,
  type SiparisHesap,
  type SiparisSekmesi,
} from "@/lib/siparis";
import { formatDate, formatTL, todayISO } from "@/lib/format";
import type { BankaHesabi, Firma, GorselAlani, Siparis } from "@/lib/types";

const DRAFT_COUNT = 3;
const SEKME_ANAHTARI = "siparisler.sekme";
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

let taslakSeq = 0;
const yeniSlot = () => ({ key: ++taslakSeq, value: bosTaslak() });

function sekmeOku(): SiparisSekmesi {
  try {
    const s = localStorage.getItem(SEKME_ANAHTARI) as SiparisSekmesi | null;
    if (s && SEKMELER.includes(s)) return s;
  } catch {}
  return "tumu";
}

export default function SiparislerPage() {
  const { siparisler, loading } = useSiparisler();
  const { kayitlar } = useKasaKayitlari();
  const { firmalar } = useFirmalar();
  const { hesaplar } = useBankaHesaplari();
  const [sekme, setSekmeState] = useState<SiparisSekmesi>("tumu");
  const [arama, setArama] = useState("");
  const [taslaklar, setTaslaklar] = useState(() => Array.from({ length: DRAFT_COUNT }, yeniSlot));
  const [detayId, setDetayId] = useState<string | null>(null);
  const [odemeId, setOdemeId] = useState<string | null>(null);
  const [mobilYeni, setMobilYeni] = useState(false);
  const [bildirim, setBildirim] = useState<string | null>(null);
  const bildirimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The chosen tab is remembered on this device (read after mount: localStorage is browser-only).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from localStorage
    setSekmeState(sekmeOku());
  }, []);

  function setSekme(s: SiparisSekmesi) {
    setSekmeState(s);
    try {
      localStorage.setItem(SEKME_ANAHTARI, s);
    } catch {}
  }

  const odemeler = useMemo(() => siparisOdemeleri(kayitlar), [kayitlar]);
  const oneriler = useMemo(() => kartOnerileri(kayitlar), [kayitlar]);
  // Orders are for customers and suppliers, never expense items.
  const musteriler = useMemo(() => firmalar.filter((f) => firmaTuru(f) !== "gider"), [firmalar]);

  const hesapli = useMemo(
    () => siparisler.map((s) => ({ s, h: siparisHesap(s, odemeler) })),
    [siparisler, odemeler]
  );

  const aranan = useMemo(() => {
    const k = firmaAnahtari(arama);
    if (!k) return hesapli;
    return hesapli.filter(({ s }) => firmaAnahtari(`${s.firmaAdi} ${s.urun} ${s.aciklama}`).includes(k));
  }, [hesapli, arama]);

  const sayilar = useMemo(() => {
    const m = {} as Record<SiparisSekmesi, number>;
    for (const t of SEKMELER) m[t] = aranan.filter(({ s, h }) => sekmedeMi(t, s, h)).length;
    return m;
  }, [aranan]);

  const gorunen = useMemo(() => aranan.filter(({ s, h }) => sekmedeMi(sekme, s, h)), [aranan, sekme]);

  const ozet = useMemo(() => {
    let uretimde = 0;
    let bitti = 0;
    let teslimOdenmedi = 0;
    let teslimOdenmediTutar = 0;
    let alacak = 0;
    for (const { s, h } of hesapli) {
      if (sekmedeMi("uretimde", s, h)) uretimde++;
      if (s.uretim === "bitti") bitti++;
      if (sekmedeMi("teslimOdenmedi", s, h)) {
        teslimOdenmedi++;
        teslimOdenmediTutar += h.kalan;
      }
      alacak += h.kalan;
    }
    return { uretimde, bitti, teslimOdenmedi, teslimOdenmediTutar, alacak };
  }, [hesapli]);

  const detay = detayId ? siparisler.find((s) => s.id === detayId) : undefined;
  const odemeSiparis = odemeId ? hesapli.find(({ s }) => s.id === odemeId) : undefined;

  function bildir(metin: string) {
    if (bildirimTimer.current) clearTimeout(bildirimTimer.current);
    setBildirim(metin);
    bildirimTimer.current = setTimeout(() => setBildirim(null), 3500);
  }

  async function taslakKaydet(key: number) {
    const slot = taslaklar.find((t) => t.key === key);
    if (!slot || !slot.value.firmaId) return;
    const t = slot.value;
    setTaslaklar((prev) => [...prev.filter((x) => x.key !== key), yeniSlot()]);
    requestAnimationFrame(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>('tr[data-taslak] input[data-field="firma"]');
      ([...inputs].find((i) => !i.value) ?? inputs[0])?.focus();
    });
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
      setTaslaklar((prev) => [slot, ...prev.slice(0, DRAFT_COUNT - 1)]);
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

  function taslakGuncelle(key: number, patch: Partial<Taslak>) {
    setTaslaklar((prev) => prev.map((t) => (t.key === key ? { ...t, value: { ...t.value, ...patch } } : t)));
  }

  return (
    <div className="page-enter flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="Siparişler"
          description="Excel'de yazar gibi girin: Tab ile ilerleyin, Enter ile kaydedin. Görsel hücresine tıklayıp Ctrl+V ile yapıştırabilirsiniz."
        />
        <button className="btn-primary inline-flex items-center gap-2 md:hidden" onClick={() => setMobilYeni(true)}>
          <Plus className="w-4 h-4" /> Yeni Sipariş
        </button>
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
        <input className="input-field !pl-9" placeholder="Firma ya da ürün ara" value={arama} onChange={(e) => setArama(e.target.value)} />
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
              {taslaklar.map((t) => (
                <TaslakSatir
                  key={`t-${t.key}`}
                  value={t.value}
                  firmalar={musteriler}
                  hesaplar={hesaplar}
                  kartOnerileri={oneriler}
                  onChange={(p) => taslakGuncelle(t.key, p)}
                  onSave={() => taslakKaydet(t.key)}
                />
              ))}
              {gorunen.map(({ s, h }) => (
                <SiparisSatir
                  key={s.id}
                  s={s}
                  h={h}
                  onDetay={() => setDetayId(s.id)}
                  onOdeme={() => setOdemeId(s.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
        {!loading && gorunen.length === 0 && (
          <div className="px-5 py-6 text-sm text-center text-[var(--muted)] border-t border-[var(--border)]">
            {siparisler.length === 0 ? "Henüz sipariş yok. Yukarıdaki satırlardan ilkini girin." : "Bu sekmede sipariş yok."}
          </div>
        )}
      </div>

      {/* Phone: cards */}
      <div className="md:hidden flex flex-col gap-2.5">
        {!loading && gorunen.length === 0 && (
          <div className="card">
            <EmptyState icon={ClipboardList} title="Sipariş yok" description="Bu sekmede gösterilecek sipariş bulunmuyor." />
          </div>
        )}
        {gorunen.map(({ s, h }) => (
          <SiparisKarti key={s.id} s={s} h={h} onClick={() => setDetayId(s.id)} />
        ))}
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

function SiparisSatir({ s, h, onDetay, onOdeme }: { s: Siparis; h: SiparisHesap; onDetay: () => void; onOdeme: () => void }) {
  const uyari = tahsilatUyari(s, h);
  return (
    <tr className="kasa-row group">
      <td className="sabit-1 align-top">
        <div className="px-2 py-1.5">
          <FirmaLink firmaId={s.firmaId} ad={s.firmaAdi} className="font-medium" />
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
}: {
  value: Taslak;
  firmalar: Firma[];
  hesaplar: BankaHesabi[];
  kartOnerileri: string[];
  onChange: (p: Partial<Taslak>) => void;
  onSave: () => void;
}) {
  const tutar = Number(value.tutar) || 0;
  const odenen = Number(value.odenen) || 0;
  const kalan = Math.max(0, tutar - odenen);
  const onizlemeDurum = tutar - odenen <= 0.005 ? "odendi" : odenen > 0 ? "kismi" : "odenmedi";

  function handleKeyDown(e: React.KeyboardEvent<HTMLTableRowElement>) {
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
        <div className="flex justify-end">
          <button
            tabIndex={-1}
            className="icon-btn hover:!text-[var(--accent-green)] disabled:opacity-30"
            onClick={onSave}
            disabled={!value.firmaId}
            title={value.firmaId ? "Kaydet (Enter)" : "Önce listeden firma seçin"}
          >
            <Check className="w-4 h-4" />
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

function SiparisKarti({ s, h, onClick }: { s: Siparis; h: SiparisHesap; onClick: () => void }) {
  const uyari = tahsilatUyari(s, h);
  return (
    <div role="button" tabIndex={0} className="card p-3 flex gap-3 active:bg-[var(--surface-hover)]" onClick={onClick} onKeyDown={(e) => e.key === "Enter" && onClick()}>
      <KartOnizleme id={s.bitenGorselleri[0] ?? s.siparisGorselleri[0]} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium truncate">{s.firmaAdi}</div>
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
