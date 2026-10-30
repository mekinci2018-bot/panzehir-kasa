"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { ArrowLeft, FileText, Printer } from "lucide-react";
import { useBankaHesaplari, useFirmalar, useKasaKayitlari, kartOnerileri } from "@/lib/hooks";
import { ekstreOlustur, FIRMA_TURU_LABEL, firmaTuru } from "@/lib/firma";
import { ODEME_SEKLI_LABEL, bakiyeEtiketi, formatDate, formatTL, longDateTR } from "@/lib/format";
import EmptyState from "@/components/EmptyState";
import BakiyeHucre from "@/components/BakiyeHucre";
import KayitDetayModal from "@/components/KayitDetayModal";

export default function CariEkstrePage() {
  const { id } = useParams<{ id: string }>();
  const { firmalar, loading: firmaLoading } = useFirmalar();
  const { kayitlar, loading } = useKasaKayitlari();
  const { hesaplar } = useBankaHesaplari();
  const [detayId, setDetayId] = useState<string | null>(null);

  const firma = firmalar.find((f) => f.id === id);
  const firmaKayitlari = useMemo(() => kayitlar.filter((k) => k.firmaId === id), [kayitlar, id]);
  const satirlar = useMemo(() => ekstreOlustur(firmaKayitlari), [firmaKayitlari]);

  const toplamlar = useMemo(() => {
    let ciro = 0;
    let tahsilat = 0;
    for (const k of firmaKayitlari) {
      if (k.yon !== "gelen") continue;
      ciro += k.toplamTutar;
      tahsilat += k.alinanTutar;
    }
    const bakiye = satirlar.length ? satirlar[satirlar.length - 1].bakiye : 0;
    return { ciro, tahsilat, bakiye };
  }, [firmaKayitlari, satirlar]);

  const detay = detayId ? kayitlar.find((k) => k.id === detayId) : undefined;
  const gider = firma ? firmaTuru(firma) === "gider" : false;

  // Expense items have no cari: just what was spent, newest first.
  const harcamalar = useMemo(
    () => [...firmaKayitlari].sort((a, b) => (a.tarih === b.tarih ? b.createdAt - a.createdAt : a.tarih < b.tarih ? 1 : -1)),
    [firmaKayitlari]
  );
  const toplamHarcama = useMemo(
    () => firmaKayitlari.reduce((s, k) => s + (k.yon === "giden" ? k.toplamTutar : -k.toplamTutar), 0),
    [firmaKayitlari]
  );

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
          <div className="p-10 text-sm text-[var(--muted)] text-center">yükleniyor…</div>
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

      {gider ? (
        <>
          <div className="card px-5 py-4 flex items-center justify-between gap-4">
            <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">Toplam harcama</div>
            <div className="tabular text-lg font-semibold">{formatTL(toplamHarcama)}</div>
          </div>
          <div className="card overflow-hidden">
            {!loading && harcamalar.length === 0 ? (
              <EmptyState icon={FileText} title="Henüz harcama yok" description="Bu kaleme bağlı kasa kaydı olduğunda burada listelenir." />
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
          <div className="text-[11px] font-medium uppercase tracking-wider text-white/60 print:text-[var(--muted)]">Kalan bakiye</div>
          <div className="tabular text-lg font-semibold mt-0.5">{bakiyeEtiketi(toplamlar.bakiye)}</div>
        </div>
      </div>

      <div className="card overflow-hidden">
        {!loading && satirlar.length === 0 ? (
          <EmptyState icon={FileText} title="Henüz hareket yok" description="Bu firmaya bağlı kasa kaydı olduğunda burada tarih sırasıyla listelenir." />
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
                {satirlar.map((s) => (
                  <tr key={s.key} className="cursor-pointer print:cursor-auto" onClick={() => setDetayId(s.kayitId)}>
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
