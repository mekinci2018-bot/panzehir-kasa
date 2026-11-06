"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { YazdirButonu, YazdirmaBasligi } from "@/components/Yazdir";
import YukleniyorSatiri from "@/components/YukleniyorSatiri";
import { useKasaKayitlari, useSiparisler } from "@/lib/hooks";
import { siparisOdemeleri } from "@/lib/dagitim";
import { sekmedeMi, siparisHesap, type SiparisHesap, type SiparisSekmesi } from "@/lib/siparis";
import { currentMonthKey, formatTL, longDateTR, monthKeyOf, monthLabel } from "@/lib/format";
import type { Siparis } from "@/lib/types";

// Sipariş Durumu: eldeki iş ve ay ay sipariş dökümü. "Param nerede / kimden alacağım / kime
// borçluyum" bölümleri 06.11.2026'da kaldırıldı — onlar Kasa, Alacaklar, Borçlar, Banka Hesapları
// ve Personel sayfalarında duruyor. Bu sayfa yalnızca siparişlere bakar.

const EPS = 0.005;

interface Hesapli {
  s: Siparis;
  h: SiparisHesap;
}

// Üstteki kutular: adet + tutar; tıklayınca Siparişler ilgili sekmeyle (gerekiyorsa ayla) açılır.
interface Kutu {
  baslik: string;
  adet: number;
  tutar: number;
  tutarNotu: string;
  href: string;
}

interface AySatiri {
  ay: string;
  yeniAdet: number;
  yeniTutar: number;
  uretimdeAdet: number;
  uretimdeTutar: number;
  teslimAdet: number;
  teslimTutar: number;
  tahsil: number;
  kalan: number;
}

const bosAy = (ay: string): AySatiri => ({
  ay,
  yeniAdet: 0,
  yeniTutar: 0,
  uretimdeAdet: 0,
  uretimdeTutar: 0,
  teslimAdet: 0,
  teslimTutar: 0,
  tahsil: 0,
  kalan: 0,
});

const TOPLANACAK = [
  "yeniAdet",
  "yeniTutar",
  "uretimdeAdet",
  "uretimdeTutar",
  "teslimAdet",
  "teslimTutar",
  "tahsil",
  "kalan",
] as const;

export default function SiparisDurumuPage() {
  const router = useRouter();
  const { siparisler, loading } = useSiparisler();
  const { kayitlar } = useKasaKayitlari();

  // Ödenen / kalan, uygulamanın geri kalanıyla aynı yerden hesaplanıyor: dağıtım taşıyan bir
  // tahsilatta para yalnızca dağıtımdan sayılır (lib/dagitim.ts, tek kaynak kuralı).
  const hesapli = useMemo<Hesapli[]>(() => {
    const odemeler = siparisOdemeleri(kayitlar);
    return siparisler.map((s) => ({ s, h: siparisHesap(s, odemeler) }));
  }, [siparisler, kayitlar]);

  const buAy = currentMonthKey();

  const kutular = useMemo<Kutu[]>(() => {
    // Sekme tanımları Siparişler'le aynı yerden (sekmedeMi), yoksa kutudaki adet ile açılan
    // listenin adedi birbirinden kayardı.
    const say = (sekme: SiparisSekmesi, tutarOf: (x: Hesapli) => number) => {
      const liste = hesapli.filter(({ s, h }) => sekmedeMi(sekme, s, h));
      return { adet: liste.length, tutar: liste.reduce((t, x) => t + tutarOf(x), 0) };
    };
    const ayin = hesapli.filter(({ s }) => monthKeyOf(s.tarih) === buAy);
    return [
      { baslik: "Üretimde", ...say("uretimde", ({ s }) => s.tutar), tutarNotu: "sipariş tutarı", href: "/siparisler?sekme=uretimde" },
      {
        baslik: "Bitti, teslim bekliyor",
        ...say("bitti", ({ s }) => s.tutar),
        tutarNotu: "sipariş tutarı",
        href: "/siparisler?sekme=bitti",
      },
      {
        // Burada anlamlı rakam sipariş tutarı değil, tahsil edilmeyen kalan.
        baslik: "Teslim edildi, parası alınmadı",
        ...say("teslimOdenmedi", ({ h }) => h.kalan),
        tutarNotu: "tahsil edilmeyen kalan",
        href: "/siparisler?sekme=teslimOdenmedi",
      },
      {
        baslik: `Bu ay alınan sipariş · ${monthLabel(buAy)}`,
        adet: ayin.length,
        tutar: ayin.reduce((t, { s }) => t + s.tutar, 0),
        tutarNotu: "sipariş tutarı",
        href: `/siparisler?ay=${buAy}&sekme=tumu`,
      },
    ];
  }, [hesapli, buAy]);

  // Her sipariş kendi ayında sayılır (tarihine göre); en yeni ay üstte.
  const aylar = useMemo<AySatiri[]>(() => {
    const map = new Map<string, AySatiri>();
    for (const { s, h } of hesapli) {
      const ay = monthKeyOf(s.tarih);
      const r = map.get(ay) ?? bosAy(ay);
      r.yeniAdet += 1;
      r.yeniTutar += s.tutar;
      if (s.uretim === "uretimde") {
        r.uretimdeAdet += 1;
        r.uretimdeTutar += s.tutar;
      }
      if (s.uretim === "teslim") {
        r.teslimAdet += 1;
        r.teslimTutar += s.tutar;
      }
      r.tahsil += h.odenen;
      r.kalan += h.kalan;
      map.set(ay, r);
    }
    return [...map.values()].sort((a, b) => (a.ay < b.ay ? 1 : -1));
  }, [hesapli]);

  const toplam = useMemo(() => {
    const t = bosAy("toplam");
    for (const r of aylar) for (const alan of TOPLANACAK) t[alan] += r[alan];
    return t;
  }, [aylar]);

  const yukleniyor = loading && siparisler.length === 0;
  const tarih = longDateTR();

  return (
    <div className="page-enter flex flex-col gap-5">
      <YazdirmaBasligi baslik="Sipariş Durumu" donem={`${tarih} itibarıyla`} />

      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div className="flex flex-col gap-1">
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Sipariş Durumu</h1>
          <p className="text-sm text-[var(--muted)]">{tarih} itibarıyla eldeki iş ve ay ay sipariş dökümü.</p>
        </div>
        <YazdirButonu dosyaAdi={`Sipariş Durumu - ${tarih}`} />
      </div>

      {yukleniyor ? (
        <div className="card">
          <YukleniyorSatiri />
        </div>
      ) : (
        <>
          <section className="flex flex-col gap-2">
            <h2 className="rapor-bolum-baslik text-[var(--muted)] px-1 print:px-0">Eldeki iş</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 print:grid-cols-4 print:gap-2">
              {kutular.map((k) => (
                <KutuKarti key={k.baslik} kutu={k} />
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-1 print:px-0">
              <h2 className="rapor-bolum-baslik text-[var(--muted)]">Aylık sipariş dökümü</h2>
              <span className="text-[11px] text-[var(--muted-soft)] print:hidden">
                Satıra tıklayınca Siparişler o ayla açılır
              </span>
            </div>
            <div className="card overflow-hidden print:border-0">
              {aylar.length === 0 ? (
                <p className="px-5 py-8 text-sm text-center text-[var(--muted)]">Henüz sipariş yok.</p>
              ) : (
                <div className="overflow-x-auto print:overflow-visible">
                  {/* Baskıda sabit genişlik A4'ü taşırdı; orada tablo sayfaya sığıyor. */}
                  <table className="rapor-tablo min-w-[880px] print:min-w-0">
                    <thead>
                      <tr>
                        <th className="w-[150px]">Ay</th>
                        <th className="sag w-[110px]">Yeni sipariş</th>
                        <th className="sag w-[140px]">Sipariş tutarı</th>
                        <th className="sag w-[170px]">Hâlâ üretimde</th>
                        <th className="sag w-[170px]">Teslim edildi</th>
                        <th className="sag w-[140px]">Tahsil edilen</th>
                        <th className="sag w-[140px]">Kalan alacak</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aylar.map((r) => {
                        const href = `/siparisler?ay=${r.ay}&sekme=tumu`;
                        return (
                          <tr
                            key={r.ay}
                            className="tiklanir"
                            onClick={() => router.push(href)}
                            title={`${monthLabel(r.ay)} siparişlerini aç`}
                          >
                            <td className="font-medium">
                              <Link
                                href={href}
                                className="hover:underline underline-offset-2 decoration-[var(--border-strong)]"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {monthLabel(r.ay)}
                              </Link>
                            </td>
                            <td className="sag">{r.yeniAdet}</td>
                            <td className="sag">{formatTL(r.yeniTutar)}</td>
                            <td className="sag">
                              <AdetTutar adet={r.uretimdeAdet} tutar={r.uretimdeTutar} />
                            </td>
                            <td className="sag">
                              <AdetTutar adet={r.teslimAdet} tutar={r.teslimTutar} />
                            </td>
                            <td className="sag text-[var(--accent-green)]">{r.tahsil > EPS ? formatTL(r.tahsil) : "—"}</td>
                            <td className={`sag ${r.kalan > EPS ? "font-medium" : "text-[var(--muted-soft)]"}`}>
                              {r.kalan > EPS ? formatTL(r.kalan) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="toplam">
                        <td>Toplam · {aylar.length} ay</td>
                        <td className="sag">{toplam.yeniAdet}</td>
                        <td className="sag">{formatTL(toplam.yeniTutar)}</td>
                        <td className="sag">
                          <AdetTutar adet={toplam.uretimdeAdet} tutar={toplam.uretimdeTutar} />
                        </td>
                        <td className="sag">
                          <AdetTutar adet={toplam.teslimAdet} tutar={toplam.teslimTutar} />
                        </td>
                        <td className="sag">{formatTL(toplam.tahsil)}</td>
                        <td className="sag">{formatTL(toplam.kalan)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function KutuKarti({ kutu }: { kutu: Kutu }) {
  return (
    <Link
      href={kutu.href}
      className="card px-4 py-3.5 flex flex-col gap-1 hover:bg-[var(--surface-hover)] transition-colors print:hover:bg-transparent"
      title={`${kutu.baslik} siparişlerini aç`}
    >
      <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)] leading-snug">{kutu.baslik}</span>
      <span className="flex items-baseline gap-1.5">
        <span className="tabular text-[26px] font-semibold tracking-[-0.02em] leading-none">{kutu.adet}</span>
        <span className="text-[12px] text-[var(--muted)]">sipariş</span>
      </span>
      <span className="tabular text-[14px] font-medium">{formatTL(kutu.tutar)}</span>
      <span className="text-[10.5px] text-[var(--muted-soft)]">{kutu.tutarNotu}</span>
    </Link>
  );
}

// "3 · ₺45.000,00" — adet önde, tutar yanında; hiç yoksa tire.
function AdetTutar({ adet, tutar }: { adet: number; tutar: number }) {
  if (adet === 0) return <span className="text-[var(--muted-soft)]">—</span>;
  return (
    <span>
      {adet} <span className="text-[var(--border-strong)]">·</span> {formatTL(tutar)}
    </span>
  );
}
