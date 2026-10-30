"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { ArrowLeft, FileText, Printer } from "lucide-react";
import { useBankaHesaplari, useFirmalar, useKasaKayitlari, useSiparisler, kartOnerileri } from "@/lib/hooks";
import { siparisOdemeleri } from "@/lib/siparis";
import SiparisDetayModal from "@/components/SiparisDetayModal";
import { ekstreOlustur, FIRMA_TURU_LABEL, firmaTuru } from "@/lib/firma";
import { ODEME_SEKLI_LABEL, bakiyeEtiketi, currentMonthKey, formatDate, formatTL, longDateTR, shiftMonthKey, todayISO } from "@/lib/format";
import { hareketlerOf } from "@/lib/hareketler";
import EmptyState from "@/components/EmptyState";
import YukleniyorSatiri from "@/components/YukleniyorSatiri";
import BakiyeHucre from "@/components/BakiyeHucre";
import KayitDetayModal from "@/components/KayitDetayModal";

type AralikTuru = "tumu" | "buAy" | "gecenAy" | "buYil" | "ozel";

const ARALIKLAR: { tur: AralikTuru; label: string }[] = [
  { tur: "tumu", label: "Tümü" },
  { tur: "buAy", label: "Bu ay" },
  { tur: "gecenAy", label: "Geçen ay" },
  { tur: "buYil", label: "Bu yıl" },
  { tur: "ozel", label: "Özel" },
];

function ayAraligi(ay: string) {
  const [y, m] = ay.split("-").map(Number);
  return { bas: `${ay}-01`, bit: `${ay}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}` };
}

// "" means open-ended on that side.
function hazirAralik(tur: AralikTuru): { bas: string; bit: string } {
  const bugun = todayISO();
  if (tur === "buAy") return ayAraligi(currentMonthKey());
  if (tur === "gecenAy") return ayAraligi(shiftMonthKey(currentMonthKey(), -1));
  if (tur === "buYil") return { bas: `${bugun.slice(0, 4)}-01-01`, bit: `${bugun.slice(0, 4)}-12-31` };
  return { bas: "", bit: "" };
}

export default function CariEkstrePage() {
  const { id } = useParams<{ id: string }>();
  const { firmalar, loading: firmaLoading } = useFirmalar();
  const { kayitlar, loading } = useKasaKayitlari();
  const { hesaplar } = useBankaHesaplari();
  const { siparisler } = useSiparisler();
  const [detayId, setDetayId] = useState<string | null>(null);
  const [siparisDetayId, setSiparisDetayId] = useState<string | null>(null);
  const [aralik, setAralik] = useState<{ tur: AralikTuru; bas: string; bit: string }>({ tur: "tumu", bas: "", bit: "" });
  const aralikta = (tarih: string) => (!aralik.bas || tarih >= aralik.bas) && (!aralik.bit || tarih <= aralik.bit);

  const firma = firmalar.find((f) => f.id === id);
  const firmaKayitlari = useMemo(() => kayitlar.filter((k) => k.firmaId === id), [kayitlar, id]);
  const firmaSiparisleri = useMemo(() => siparisler.filter((s) => s.firmaId === id), [siparisler, id]);
  const odemeler = useMemo(() => siparisOdemeleri(kayitlar), [kayitlar]);
  const satirlar = useMemo(
    () => ekstreOlustur(firmaKayitlari, firmaSiparisleri, odemeler),
    [firmaKayitlari, firmaSiparisleri, odemeler]
  );

  // The running balance is computed over all history; a range shows its slice, opening with the
  // balance carried in from before it.
  const aralikSatirlari = satirlar.filter((s) => aralikta(s.tarih));
  const devreden = aralik.bas ? ([...satirlar].reverse().find((s) => s.tarih < aralik.bas)?.bakiye ?? 0) : 0;

  // Ciro: sales and orders in the range. Order payments are Kasa records too, so they count as
  // collections only, on the day the money came in.
  const toplamlar = (() => {
    let ciro = 0;
    let tahsilat = 0;
    for (const k of firmaKayitlari) {
      if (k.yon !== "gelen") continue;
      if (!k.siparisId && aralikta(k.tarih)) ciro += k.toplamTutar;
      for (const h of hareketlerOf(k)) if (aralikta(h.tarih)) tahsilat += h.tutar;
    }
    for (const s of firmaSiparisleri) {
      if (!aralikta(s.tarih)) continue;
      ciro += s.tutar;
      tahsilat += s.oncekiOdenen ?? 0;
    }
    const bakiye = aralikSatirlari.length ? aralikSatirlari[aralikSatirlari.length - 1].bakiye : devreden;
    return { ciro, tahsilat, bakiye };
  })();

  const aralikMetni = aralik.bas || aralik.bit
    ? `${aralik.bas ? formatDate(aralik.bas) : "Başlangıç"} – ${aralik.bit ? formatDate(aralik.bit) : "Bugün"}`
    : "Tüm hareketler";

  const detay = detayId ? kayitlar.find((k) => k.id === detayId) : undefined;
  const siparisDetay = siparisDetayId ? siparisler.find((s) => s.id === siparisDetayId) : undefined;
  const gider = firma ? firmaTuru(firma) === "gider" : false;

  // Expense items have no cari: just what was spent in the range, newest first.
  const harcamalar = [...firmaKayitlari]
    .filter((k) => aralikta(k.tarih))
    .sort((a, b) => (a.tarih === b.tarih ? b.createdAt - a.createdAt : a.tarih < b.tarih ? 1 : -1));
  const toplamHarcama = harcamalar.reduce((s, k) => s + (k.yon === "giden" ? k.toplamTutar : -k.toplamTutar), 0);

  // The PDF file name comes from the document title.
  function yazdir() {
    const eski = document.title;
    document.title = `${gider ? "Harcama Dökümü" : "Cari Ekstre"} - ${firma?.ad ?? ""}`;
    window.print();
    document.title = eski;
  }

  if (!firma) {
    return (
      <div className="card">
        {firmaLoading ? (
          <YukleniyorSatiri />
        ) : (
          <EmptyState icon={FileText} title="Firma bulunamadı" description="Bu firma silinmiş ya da başka bir firmayla birleştirilmiş olabilir." />
        )}
      </div>
    );
  }

  return (
    <div className="page-enter flex flex-col gap-6 print:gap-4">
      <div className="hidden print:flex items-center justify-between border-b border-[var(--border)] pb-3">
        <Image src="/logo.png" alt="Panzehir Reklam" width={581} height={130} className="w-[140px] h-auto" />
        <div className="text-right text-xs text-[var(--muted)]">
          <div className="font-semibold text-[var(--foreground)] text-sm">{gider ? "Harcama Dökümü" : "Cari Hesap Ekstresi"}</div>
          <div>Dönem: {aralikMetni}</div>
          {longDateTR()}
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <Link
            href="/firmalar"
            className="print:hidden text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)] inline-flex items-center gap-1 uppercase tracking-wider"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Firmalar
          </Link>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">{firma.ad}</h1>
          <p className="text-sm text-[var(--muted)]">
            {[FIRMA_TURU_LABEL[firmaTuru(firma)], firma.telefon, firma.not].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button className="btn-secondary inline-flex items-center gap-2 print:hidden" onClick={yazdir} title="Yazdır ya da 'PDF olarak kaydet' seçin">
          <Printer className="w-4 h-4" /> Yazdır / PDF
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="inline-flex rounded-[9px] border border-[var(--border-strong)] p-0.5 bg-[#f6f6f8] text-[13px]">
          {ARALIKLAR.map(({ tur, label }) => (
            <button
              key={tur}
              className={`px-3 py-1 rounded-[7px] font-medium transition-colors ${
                aralik.tur === tur ? "bg-white shadow-sm text-[var(--foreground)]" : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
              onClick={() => setAralik(tur === "ozel" ? { ...aralik, tur } : { tur, ...hazirAralik(tur) })}
            >
              {label}
            </button>
          ))}
        </div>
        {aralik.tur === "ozel" ? (
          <div className="flex items-center gap-1.5">
            <input type="date" className="input-field !py-1 !w-[150px] !text-[13px]" value={aralik.bas} onChange={(e) => setAralik({ ...aralik, bas: e.target.value })} />
            <span className="text-[var(--muted)]">–</span>
            <input type="date" className="input-field !py-1 !w-[150px] !text-[13px]" value={aralik.bit} min={aralik.bas || undefined} onChange={(e) => setAralik({ ...aralik, bit: e.target.value })} />
          </div>
        ) : (
          <span className="text-[13px] text-[var(--muted)] tabular">{aralikMetni}</span>
        )}
      </div>

      {gider ? (
        <>
          <div className="card px-5 py-4 flex items-center justify-between gap-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">Toplam harcama · {aralikMetni}</div>
            <div className="tabular text-lg font-semibold">{formatTL(toplamHarcama)}</div>
          </div>
          <div className="card overflow-hidden">
            {loading && harcamalar.length === 0 ? (
              <YukleniyorSatiri />
            ) : harcamalar.length === 0 ? (
              <EmptyState icon={FileText} title="Harcama yok" description="Bu dönemde bu kaleme bağlı kasa kaydı yok." />
            ) : (
              <div className="table-scroll print:max-h-none print:overflow-visible">
                <table className="w-full text-sm data-table">
                  <thead>
                    <tr>
                      <th className="w-[110px]">Tarih</th>
                      <th>Açıklama</th>
                      <th className="w-[200px]">Ödeme</th>
                      <th className="w-[150px] text-right">Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {harcamalar.map((k) => (
                      <tr key={k.id} className="cursor-pointer print:cursor-auto" onClick={() => setDetayId(k.id)}>
                        <td className="tabular">{formatDate(k.tarih)}</td>
                        <td>{k.aciklama || "—"}</td>
                        <td className="text-[var(--muted)]">{[ODEME_SEKLI_LABEL[k.odemeSekli], k.kartAciklama].filter(Boolean).join(" · ")}</td>
                        <td className={`num font-medium ${k.yon === "gelen" ? "text-[var(--accent-green)]" : ""}`}>
                          {k.yon === "gelen" ? "+" : ""}
                          {formatTL(k.toplamTutar)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
      <>
      <div className="card overflow-hidden grid grid-cols-1 sm:grid-cols-3 gap-px !bg-[var(--border)]">
        <div className="px-5 py-4 bg-[var(--surface)]">
          <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">Toplam ciro</div>
          <div className="tabular text-lg font-semibold mt-0.5">{formatTL(toplamlar.ciro)}</div>
        </div>
        <div className="px-5 py-4 bg-[var(--surface)]">
          <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">Toplam tahsilat</div>
          <div className="tabular text-lg font-semibold mt-0.5 text-[var(--accent-green)]">{formatTL(toplamlar.tahsilat)}</div>
        </div>
        <div className="px-5 py-4 bg-[var(--ink)] text-white print:bg-[var(--surface)] print:text-[var(--foreground)]">
          <div className="text-[11px] font-medium uppercase tracking-wider text-white/60 print:text-[var(--muted)]">
            {aralik.bit && aralik.bit < todayISO() ? `${formatDate(aralik.bit)} bakiyesi` : "Kalan bakiye"}
          </div>
          <div className="tabular text-lg font-semibold mt-0.5">{bakiyeEtiketi(toplamlar.bakiye)}</div>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading && satirlar.length === 0 ? (
          <YukleniyorSatiri />
        ) : satirlar.length === 0 ? (
          <EmptyState icon={FileText} title="Henüz hareket yok" description="Bu firmaya bağlı sipariş ya da kasa kaydı olduğunda burada tarih sırasıyla listelenir." />
        ) : aralikSatirlari.length === 0 && !aralik.bas ? (
          <div className="px-5 py-8 text-sm text-center text-[var(--muted)]">Bu dönemde hareket yok.</div>
        ) : (
          <div className="table-scroll print:max-h-none print:overflow-visible">
            <table className="w-full text-sm data-table">
              <thead>
                <tr>
                  <th className="w-[110px]">Tarih</th>
                  <th>Açıklama</th>
                  <th className="w-[140px] text-right">Borç</th>
                  <th className="w-[140px] text-right">Alacak</th>
                  <th className="w-[170px] text-right">Bakiye</th>
                </tr>
              </thead>
              <tbody>
                {aralik.bas && (
                  <tr className="bg-[#f8f8fa]">
                    <td className="tabular">{formatDate(aralik.bas)}</td>
                    <td className="font-medium">Devreden bakiye</td>
                    <td className="num"></td>
                    <td className="num"></td>
                    <td className="num">
                      <BakiyeHucre bakiye={devreden} />
                    </td>
                  </tr>
                )}
                {aralikSatirlari.map((s) => (
                  <tr key={s.key} className="cursor-pointer print:cursor-auto" onClick={() => (s.siparis ? setSiparisDetayId(s.kayitId) : setDetayId(s.kayitId))}>
                    <td className="tabular">{formatDate(s.tarih)}</td>
                    <td>{s.aciklama}</td>
                    <td className="num">{s.borc ? formatTL(s.borc) : ""}</td>
                    <td className="num text-[var(--accent-green)]">{s.alacak ? formatTL(s.alacak) : ""}</td>
                    <td className="num">
                      <BakiyeHucre bakiye={s.bakiye} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[11px] text-[var(--muted-soft)] -mt-3">
        Borç: firmanın borçlandığı tutar (satış ya da firmaya yaptığımız ödeme). Alacak: firmanın ödediği ya da bizden alacaklandığı tutar.
        Bakiye &ldquo;Alacak&rdquo; ise firma bize borçlu, &ldquo;Borç&rdquo; ise biz firmaya borçluyuz.
      </p>
      </>
      )}

      {siparisDetay && (
        <SiparisDetayModal
          key={siparisDetay.id}
          siparis={siparisDetay}
          odemeKayitlari={kayitlar.filter((k) => k.siparisId === siparisDetay.id)}
          odemeler={odemeler}
          hesaplar={hesaplar}
          kartOnerileri={kartOnerileri(kayitlar)}
          onClose={() => setSiparisDetayId(null)}
        />
      )}

      {detay && (
        <KayitDetayModal
          key={detay.id}
          kayit={detay}
          hesaplar={hesaplar}
          kartOnerileri={kartOnerileri(kayitlar)}
          onClose={() => setDetayId(null)}
        />
      )}
    </div>
  );
}
