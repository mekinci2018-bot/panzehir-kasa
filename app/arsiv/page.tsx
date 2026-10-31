"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, Search } from "lucide-react";
import { kartOnerileri, useBankaHesaplari, useFirmalar, useKasaKayitlari } from "@/lib/hooks";
import { ODEME_SEKLI_LABEL, currentMonthKey, formatDate, formatTL, monthLabel } from "@/lib/format";
import { aydaMi, aylikKasa, kisaAyEtiketi } from "@/lib/donem";
import { firmaAnahtari, firmaTuru } from "@/lib/firma";
import type { Firma, KasaKaydi, OdemeSekli } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import YukleniyorSatiri from "@/components/YukleniyorSatiri";
import KayitDetayModal from "@/components/KayitDetayModal";
import FirmaLink from "@/components/FirmaLink";
import MonthNav from "@/components/MonthNav";
import AyKasaOzeti from "@/components/AyKasaOzeti";
import { YazdirButonu, YazdirmaBasligi } from "@/components/Yazdir";
import { SiraTh } from "@/components/SiraBasligi";
import { sirala, useSiralama, type SiraSutunlari } from "@/lib/siralama";

type Sekme = "tumu" | "gelen" | "giden" | "harcama" | "tedarikci" | "personel";

const SEKMELER: { id: Sekme; label: string }[] = [
  { id: "tumu", label: "Tümü" },
  { id: "gelen", label: "Gelen" },
  { id: "giden", label: "Giden" },
  { id: "harcama", label: "Harcama" },
  { id: "tedarikci", label: "Tedarikçi Ödemeleri" },
  { id: "personel", label: "Personel" },
];

const CIPLER: OdemeSekli[] = ["nakit", "kart", "havale"];
const SEKME_ANAHTARI = "arsiv.sekme";
const CIP_ANAHTARI = "arsiv.cipler";

// Harcama: outgoing to expense items (Kira, Yakıt…); Tedarikçi: outgoing to suppliers; Personel: to staff.
function sekmedeMi(sekme: Sekme, k: KasaKaydi, firmalar: Map<string, Firma>): boolean {
  const firma = k.firmaId ? firmalar.get(k.firmaId) : undefined;
  switch (sekme) {
    case "tumu":
      return true;
    case "gelen":
      return k.yon === "gelen";
    case "giden":
      return k.yon === "giden";
    case "harcama":
      return k.yon === "giden" && !!firma && firmaTuru(firma) === "gider";
    case "tedarikci":
      return k.yon === "giden" && !!firma && firmaTuru(firma) === "tedarikci";
    case "personel":
      return k.yon === "giden" && !!k.personelId;
  }
}

// Durum: Açık → Tamamlandı → Kapatıldı.
const DURUM_SIRASI: KasaKaydi["durum"][] = ["aktif", "tamamlandi", "arsiv"];

const ARSIV_SUTUNLARI: SiraSutunlari<KasaKaydi> = {
  tarih: (k) => k.tarih,
  firma: (k) => k.firma,
  islem: (k) => (k.yon === "gelen" ? 0 : 1),
  odeme: (k) => ODEME_SEKLI_LABEL[k.odemeSekli],
  toplam: (k) => k.toplamTutar,
  alinan: (k) => k.alinanTutar,
  durum: (k) => DURUM_SIRASI.indexOf(k.durum),
};

function oku<T>(anahtar: string, varsayilan: T, gecerli: (v: unknown) => boolean): T {
  try {
    const v = JSON.parse(localStorage.getItem(anahtar) ?? "null");
    return gecerli(v) ? (v as T) : varsayilan;
  } catch {
    return varsayilan;
  }
}

function yaz(anahtar: string, deger: unknown) {
  try {
    localStorage.setItem(anahtar, JSON.stringify(deger));
  } catch {}
}

export default function ArsivPage() {
  const { kayitlar, loading } = useKasaKayitlari();
  const { firmalar } = useFirmalar();
  const { hesaplar } = useBankaHesaplari();
  const [ay, setAy] = useState(currentMonthKey);
  const [sekme, setSekmeState] = useState<Sekme>("tumu");
  const [cipler, setCiplerState] = useState<OdemeSekli[]>([]);
  const [kalem, setKalem] = useState<string | null>(null); // expense item picked in the Harcama breakdown
  const [arama, setArama] = useState("");
  const [detayId, setDetayId] = useState<string | null>(null);

  // Tab and payment-method chips are remembered on this device.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from localStorage
    setSekmeState(oku(SEKME_ANAHTARI, "tumu", (v) => SEKMELER.some((s) => s.id === v)));
    setCiplerState(oku(CIP_ANAHTARI, [], (v) => Array.isArray(v) && v.every((x) => CIPLER.includes(x))));
  }, []);

  function setSekme(s: Sekme) {
    setSekmeState(s);
    setKalem(null);
    yaz(SEKME_ANAHTARI, s);
  }

  function cipToggle(c: OdemeSekli) {
    const yeni = cipler.includes(c) ? cipler.filter((x) => x !== c) : [...cipler, c];
    setCiplerState(yeni);
    yaz(CIP_ANAHTARI, yeni);
  }

  const firmaMap = useMemo(() => new Map(firmalar.map((f) => [f.id, f])), [firmalar]);
  const ayDonemi = useMemo(() => aylikKasa(kayitlar, ay), [kayitlar, ay]);

  // Month (or, while searching, every month) narrowed by the payment chips; tabs split this further.
  const aramaAnahtari = firmaAnahtari(arama);
  const taban = useMemo(() => {
    return kayitlar
      .filter((k) => (aramaAnahtari ? firmaAnahtari(`${k.firma} ${k.aciklama}`).includes(aramaAnahtari) : aydaMi(k.tarih, ay)))
      .filter((k) => cipler.length === 0 || cipler.includes(k.odemeSekli))
      .sort((a, b) => (a.tarih === b.tarih ? b.createdAt - a.createdAt : a.tarih < b.tarih ? 1 : -1));
  }, [kayitlar, ay, aramaAnahtari, cipler]);

  const sekmeOzetleri = useMemo(() => {
    const m = {} as Record<Sekme, { adet: number; tutar: number }>;
    for (const { id } of SEKMELER) {
      const list = taban.filter((k) => sekmedeMi(id, k, firmaMap));
      m[id] = { adet: list.length, tutar: list.reduce((t, k) => t + k.toplamTutar, 0) };
    }
    return m;
  }, [taban, firmaMap]);

  const sekmedekiler = useMemo(() => taban.filter((k) => sekmedeMi(sekme, k, firmaMap)), [taban, sekme, firmaMap]);

  // Harcama breakdown by expense item, largest first.
  const kalemler = useMemo(() => {
    if (sekme !== "harcama") return [];
    const m = new Map<string, number>();
    for (const k of sekmedekiler) m.set(k.firmaId!, (m.get(k.firmaId!) ?? 0) + k.toplamTutar);
    return [...m.entries()]
      .map(([id, tutar]) => ({ id, ad: firmaMap.get(id)?.ad ?? "—", tutar }))
      .sort((a, b) => b.tutar - a.tutar);
  }, [sekme, sekmedekiler, firmaMap]);

  const { sira, sirala: siraDegistir } = useSiralama("arsiv");
  const gorunen = useMemo(
    () => sirala(kalem ? sekmedekiler.filter((k) => k.firmaId === kalem) : sekmedekiler, sira, ARSIV_SUTUNLARI),
    [sekmedekiler, kalem, sira]
  );

  // Summary of what is listed: Net = Gelen − Giden.
  const ozet = useMemo(() => {
    let gelen = 0;
    let giden = 0;
    let harcama = 0;
    for (const k of gorunen) {
      if (k.yon === "gelen") gelen += k.toplamTutar;
      else giden += k.toplamTutar;
      if (sekmedeMi("harcama", k, firmaMap)) harcama += k.toplamTutar;
    }
    return { gelen, giden, harcama, net: gelen - giden };
  }, [gorunen, firmaMap]);

  const detay = detayId ? kayitlar.find((k) => k.id === detayId) : undefined;
  const enBuyuk = kalemler[0]?.tutar ?? 0;

  // What the screen is filtered by, written on the printout.
  const donemMetni = aramaAnahtari ? "Tüm aylar (arama)" : monthLabel(ay);
  const filtreMetinleri = [
    `Sekme: ${SEKMELER.find((s) => s.id === sekme)!.label}`,
    `Ödeme: ${cipler.length ? cipler.map((c) => ODEME_SEKLI_LABEL[c]).join(", ") : "Tümü"}`,
    ...(kalem ? [`Kalem: ${firmaMap.get(kalem)?.ad ?? "—"}`] : []),
    ...(aramaAnahtari ? [`Arama: “${arama.trim()}”`] : []),
  ];
  const dosyaAdi = `Arşiv - ${donemMetni} - ${SEKMELER.find((s) => s.id === sekme)!.label}`;

  return (
    <div className="page-enter flex flex-col gap-5">
      <YazdirmaBasligi baslik="Arşiv" donem={donemMetni} filtreler={filtreMetinleri} />

      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <PageHeader title="Arşiv" description="Kasa'dan kaydedilen tüm kayıtlar, ay ay. Düzenlemek ya da silmek için kayda tıklayın." />
        <div className="flex flex-wrap items-center gap-3">
          <div className={aramaAnahtari ? "opacity-40" : ""} title={aramaAnahtari ? "Arama tüm aylarda yapılıyor" : undefined}>
            <MonthNav
              monthKey={ay}
              onChange={(m) => {
                setAy(m);
                setKalem(null);
              }}
            />
          </div>
          <YazdirButonu dosyaAdi={dosyaAdi} />
        </div>
      </div>

      <div className="card overflow-hidden print:hidden">
        <div className="px-5 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">{monthLabel(ay)} kasa durumu</div>
        <div className="pb-2">
          <AyKasaOzeti ay={ay} donem={ayDonemi} />
        </div>
      </div>

      <div className="flex flex-col gap-2.5 print:hidden">
        <div className="flex flex-wrap items-center gap-1.5">
          {SEKMELER.map(({ id, label }) => {
            const aktif = sekme === id;
            const o = sekmeOzetleri[id];
            return (
              <button
                key={id}
                className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors whitespace-nowrap ${
                  aktif ? "bg-[var(--ink)] text-white" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
                onClick={() => setSekme(id)}
              >
                {label}
                <span className={`ml-1.5 tabular text-xs ${aktif ? "text-white/70" : "text-[var(--muted-soft)]"}`}>
                  {o.adet} · {formatTL(o.tutar)}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {CIPLER.map((c) => {
            const secili = cipler.includes(c);
            return (
              <button
                key={c}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  secili
                    ? "bg-[var(--accent-blue-soft)] text-[var(--accent-blue)] ring-1 ring-inset ring-[var(--accent-blue)]/30"
                    : "text-[var(--muted)] ring-1 ring-inset ring-[var(--border-strong)] hover:text-[var(--foreground)]"
                }`}
                onClick={() => cipToggle(c)}
                aria-pressed={secili}
              >
                {ODEME_SEKLI_LABEL[c]}
              </button>
            );
          })}
          <div className="relative ml-auto w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-soft)]" />
            <input
              className="input-field !py-1.5 !pl-9 !text-[13px]"
              placeholder="Firma ya da açıklama ara (tüm aylar)"
              value={arama}
              onChange={(e) => setArama(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--muted)] px-1 print:px-0 print:text-[12px] print:py-2 print:border-b print:border-[var(--border)]">
        <span>
          Gelen <b className="tabular text-[var(--accent-green)]">{formatTL(ozet.gelen)}</b>
        </span>
        <span className="text-[var(--border-strong)]">·</span>
        <span>
          Giden <b className="tabular text-[var(--foreground)]">{formatTL(ozet.giden)}</b>
        </span>
        <span className="text-[var(--border-strong)]">·</span>
        <span>
          Harcama <b className="tabular text-[var(--foreground)]">{formatTL(ozet.harcama)}</b>
        </span>
        <span className="text-[var(--border-strong)]">·</span>
        <span>
          Net <b className={`tabular ${ozet.net < 0 ? "text-[var(--brand)]" : "text-[var(--foreground)]"}`}>{formatTL(ozet.net)}</b>
        </span>
      </div>

      {sekme === "harcama" && kalemler.length > 0 && (
        <div className="card p-4 flex flex-col gap-1 print:hidden">
          {kalemler.map((h) => {
            const secili = kalem === h.id;
            return (
              <button
                key={h.id}
                className={`grid grid-cols-[minmax(0,180px)_1fr_auto] items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-left transition-colors ${
                  secili ? "bg-[#f1f1f4]" : "hover:bg-[var(--surface-hover)]"
                } ${kalem && !secili ? "opacity-50" : ""}`}
                onClick={() => setKalem(secili ? null : h.id)}
                title={secili ? "Filtreyi kaldır" : "Sadece bu kalemi göster"}
              >
                <span className="truncate font-medium">{h.ad}</span>
                <span className="h-1.5 rounded-full bg-[#ececf0] overflow-hidden">
                  <span className="block h-full rounded-full bg-[var(--ink)]/70" style={{ width: `${enBuyuk ? (h.tutar / enBuyuk) * 100 : 0}%` }} />
                </span>
                <span className="tabular text-right">{formatTL(h.tutar)}</span>
              </button>
            );
          })}
        </div>
      )}

      {sekme === "harcama" && kalemler.length > 0 && !kalem && (
        <table className="yazdir-tablo hidden print:table">
          <thead>
            <tr>
              <th>Gider kalemi</th>
              <th className="sag w-[110px]">Tutar</th>
              <th className="sag w-[60px]">Oran</th>
            </tr>
          </thead>
          <tbody>
            {kalemler.map((h) => (
              <tr key={h.id}>
                <td>{h.ad}</td>
                <td className="sag">{formatTL(h.tutar)}</td>
                <td className="sag">%{ozet.harcama ? Math.round((h.tutar / ozet.harcama) * 100) : 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ArsivYazdirmaListesi kayitlar={gorunen} />

      <div className="card overflow-hidden print:hidden">
        {loading && kayitlar.length === 0 ? (
          <YukleniyorSatiri />
        ) : gorunen.length === 0 ? (
          <EmptyState
            icon={Archive}
            title={aramaAnahtari ? "Eşleşen kayıt yok" : "Kayıt yok"}
            description={aramaAnahtari ? `“${arama.trim()}” ile eşleşen kayıt bulunamadı.` : `${monthLabel(ay)} için bu filtrelere uyan kayıt yok.`}
          />
        ) : (
          <div className="table-scroll">
            <table className="w-full text-sm data-table">
              <thead>
                <tr>
                  <SiraTh sutun="tarih" sira={sira} onSirala={siraDegistir} className="w-[110px]">Tarih</SiraTh>
                  <SiraTh sutun="firma" sira={sira} onSirala={siraDegistir}>Firma / Açıklama</SiraTh>
                  <SiraTh sutun="islem" sira={sira} onSirala={siraDegistir} className="w-[90px]">İşlem</SiraTh>
                  <SiraTh sutun="odeme" sira={sira} onSirala={siraDegistir} className="w-[160px]">Ödeme</SiraTh>
                  <SiraTh sutun="toplam" sira={sira} onSirala={siraDegistir} className="w-[130px] text-right">Toplam</SiraTh>
                  <SiraTh sutun="alinan" sira={sira} onSirala={siraDegistir} className="w-[150px] text-right">Alınan / Ödenen</SiraTh>
                  <SiraTh sutun="durum" sira={sira} onSirala={siraDegistir} className="w-[110px]">Durum</SiraTh>
                </tr>
              </thead>
              <tbody>
                {gorunen.map((k) => (
                  <tr key={k.id} className="cursor-pointer" onClick={() => setDetayId(k.id)}>
                    <td className="tabular">{formatDate(k.tarih)}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <FirmaLink firmaId={k.firmaId} personelId={k.personelId} ad={k.firma} className="font-medium" />
                        {aramaAnahtari && <span className="badge bg-[#f1f1f4] text-[var(--muted)]">{kisaAyEtiketi(k.tarih, ay)}</span>}
                      </div>
                      <div className="text-xs text-[var(--muted)]">{k.aciklama}</div>
                    </td>
                    <td>
                      <span className={`badge ${k.yon === "gelen" ? "badge-giris" : "badge-cikis"}`}>{k.yon === "gelen" ? "Giriş" : "Çıkış"}</span>
                    </td>
                    <td>
                      {ODEME_SEKLI_LABEL[k.odemeSekli] ?? k.odemeSekli}
                      {k.kartAciklama && <div className="text-xs text-[var(--muted)]">{k.kartAciklama}</div>}
                    </td>
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

      {detay && (
        <KayitDetayModal key={detay.id} kayit={detay} hesaplar={hesaplar} kartOnerileri={kartOnerileri(kayitlar)} onClose={() => setDetayId(null)} />
      )}
    </div>
  );
}

function DurumBadge({ durum }: { durum: KasaKaydi["durum"] }) {
  const map = {
    aktif: { label: "Açık", cls: "badge-overdue" },
    tamamlandi: { label: "Tamamlandı", cls: "badge-giris" },
    arsiv: { label: "Kapatıldı", cls: "bg-[#f1f1f4] text-[var(--muted)]" },
  } as const;
  const v = map[durum];
  return <span className={`badge ${v.cls}`}>{v.label}</span>;
}

// Print view: the listed records with separate in/out columns and a total row (Net = Giriş − Çıkış).
function ArsivYazdirmaListesi({ kayitlar }: { kayitlar: KasaKaydi[] }) {
  if (kayitlar.length === 0) {
    return <p className="hidden print:block text-[11px] text-[var(--muted)] mt-4">Bu filtrelere uyan kayıt yok.</p>;
  }
  const giris = kayitlar.filter((k) => k.yon === "gelen").reduce((t, k) => t + k.toplamTutar, 0);
  const cikis = kayitlar.filter((k) => k.yon === "giden").reduce((t, k) => t + k.toplamTutar, 0);
  return (
    <table className="yazdir-tablo hidden print:table mt-2">
      <thead>
        <tr>
          <th className="w-[70px]">Tarih</th>
          <th>Firma / Açıklama</th>
          <th className="w-[110px]">Ödeme</th>
          <th className="sag w-[95px]">Giriş</th>
          <th className="sag w-[95px]">Çıkış</th>
        </tr>
      </thead>
      <tbody>
        {kayitlar.map((k) => (
          <tr key={k.id}>
            <td className="tabular">{formatDate(k.tarih)}</td>
            <td>
              <b className="font-semibold">{k.firma}</b>
              {k.aciklama ? ` · ${k.aciklama}` : ""}
              {k.durum === "aktif" && <span className="yazdir-isaret">Açık</span>}
            </td>
            <td>{[ODEME_SEKLI_LABEL[k.odemeSekli], k.kartAciklama].filter(Boolean).join(" · ")}</td>
            <td className="sag">{k.yon === "gelen" ? formatTL(k.toplamTutar) : ""}</td>
            <td className="sag">{k.yon === "giden" ? formatTL(k.toplamTutar) : ""}</td>
          </tr>
        ))}
        <tr className="genel-toplam">
          <td colSpan={3}>
            Toplam · {kayitlar.length} kayıt · Net {formatTL(giris - cikis)}
          </td>
          <td className="sag">{formatTL(giris)}</td>
          <td className="sag">{formatTL(cikis)}</td>
        </tr>
      </tbody>
    </table>
  );
}
