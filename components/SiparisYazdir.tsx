"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Loader2, Printer } from "lucide-react";
import { gorselGetir, onizlemeGetir } from "@/lib/hooks";
import { URETIM_LABEL, odemeDurumu, type OdemeDurumu, type SiparisHesap } from "@/lib/siparis";
import { formatDate, formatTL } from "@/lib/format";
import type { Siparis, UretimDurumu } from "@/lib/types";
import { YazdirmaBasligi, yazdir } from "./Yazdir";

type Hesapli = { s: Siparis; h: SiparisHesap };
export interface YazdirmaBolumu {
  baslik: string;
  satirlar: Hesapli[];
}

// Same colors as the on-screen badges (components/Rozetler.tsx).
const URETIM_RENK: Record<UretimDurumu, string> = {
  bekliyor: "bg-[#f1f1f4] text-[var(--muted)]",
  uretimde: "bg-[var(--accent-blue-soft)] text-[var(--accent-blue)]",
  bitti: "bg-[#f3f0fd] text-[var(--accent-violet)]",
  teslim: "bg-[var(--accent-green-soft)] text-[var(--accent-green)]",
};
const ODEME: Record<OdemeDurumu, [string, string]> = {
  odendi: ["Ödendi", "bg-[var(--accent-green-soft)] text-[var(--accent-green)]"],
  kismi: ["Kısmi", "bg-[var(--accent-orange-soft)] text-[var(--accent-orange)]"],
  odenmedi: ["Ödenmedi", "bg-[var(--accent-red-soft)] text-[var(--accent-red)]"],
  kapatildi: ["Kapatıldı", "bg-[#f1f1f4] text-[var(--muted)]"],
};

function Rozet({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`inline-block rounded-full px-1.5 py-px text-[8.5px] font-semibold whitespace-nowrap ${cls}`}>{children}</span>;
}

// "Yazdır / PDF" on Siparişler: loads the previews of every printed order first, then prints. Until
// then (or after Ctrl+P) the print-out simply has no thumbnails.
export function SiparisYazdirButonu({ bolumler, dosyaAdi, onGorseller }: { bolumler: YazdirmaBolumu[]; dosyaAdi: string; onGorseller: (m: Map<string, string>) => void }) {
  const [hazirlaniyor, setHazirlaniyor] = useState(false);

  async function bas() {
    setHazirlaniyor(true);
    try {
      const ids = bolumler.flatMap((b) => b.satirlar.map(({ s }) => s.siparisGorselleri[0]).filter(Boolean));
      const m = new Map<string, string>();
      await Promise.all(ids.map(async (id) => {
        const src = await onizlemeGetir(id);
        if (src) m.set(id, src);
      }));
      onGorseller(m);
      // Let React render the images before the print dialog snapshots the page.
      await new Promise((r) => setTimeout(r, 150));
      yazdir(dosyaAdi);
    } finally {
      setHazirlaniyor(false);
    }
  }

  return (
    <button className="btn-secondary inline-flex items-center gap-2 print:hidden disabled:opacity-60" onClick={bas} disabled={hazirlaniyor} title="Yazdır ya da yazıcı olarak 'PDF olarak kaydet'i seçin">
      {hazirlaniyor ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />} Yazdır / PDF
    </button>
  );
}

// The landscape print-out of what the screen shows: same month, tab, search and order.
export function SiparisYazdirmaListesi({
  bolumler,
  donem,
  filtreler,
  gorseller,
}: {
  bolumler: YazdirmaBolumu[];
  donem: string;
  filtreler: string[];
  gorseller: Map<string, string>;
}) {
  const hepsi = bolumler.flatMap((b) => b.satirlar);
  const toplam = (f: (x: Hesapli) => number) => hepsi.reduce((t, x) => t + f(x), 0);
  return (
    <div className="hidden print:block yazdir-yatay">
      <YazdirmaBasligi baslik="Siparişler" donem={donem} filtreler={filtreler} />
      {hepsi.length === 0 ? (
        <p className="text-[11px] text-[var(--muted)] mt-4">Bu görünümde sipariş yok.</p>
      ) : (
        <table className="yazdir-tablo mt-2">
          <thead>
            <tr>
              <th className="w-[105px]">Firma</th>
              <th className="w-[52px]">Tarih</th>
              <th>Ürün / İş</th>
              <th className="w-[46px]">Görsel</th>
              <th className="sag w-[68px]">Tutar</th>
              <th className="sag w-[68px]">Ödenen</th>
              <th className="sag w-[68px]">Kalan</th>
              <th className="w-[58px]">Üretim</th>
              <th className="w-[52px]">Ödeme</th>
              <th className="w-[48px]">Fatura</th>
              <th className="w-[52px]">Ödeme Günü</th>
              <th className="w-[150px]">Açıklama</th>
            </tr>
          </thead>
          <tbody>
            {bolumler.map((b) => [
              bolumler.length > 1 && b.satirlar.length > 0 && (
                <tr key={`${b.baslik}-b`} className="grup-basi">
                  <td colSpan={12}>
                    {b.baslik} <span className="font-normal text-[var(--muted)]">({b.satirlar.length} iş)</span>
                  </td>
                </tr>
              ),
              ...b.satirlar.map(({ s, h }) => {
                const [odemeAdi, odemeRenk] = ODEME[odemeDurumu(s, h)];
                const gorsel = s.siparisGorselleri[0] && gorseller.get(s.siparisGorselleri[0]);
                return (
                  <tr key={s.id}>
                    <td className="font-medium">{s.firmaAdi}</td>
                    <td className="tabular">{formatDate(s.tarih)}</td>
                    <td className="whitespace-pre-line">{s.urun || "—"}</td>
                    {/* eslint-disable-next-line @next/next/no-img-element -- data URL preview */}
                    <td>{gorsel ? <img src={gorsel} alt="" className="w-[40px] h-[40px] object-cover rounded-sm" /> : null}</td>
                    <td className="sag">{formatTL(s.tutar)}</td>
                    <td className="sag">{formatTL(h.odenen)}</td>
                    <td className="sag font-semibold">{formatTL(h.kalan)}</td>
                    <td>
                      <Rozet cls={URETIM_RENK[s.uretim]}>{URETIM_LABEL[s.uretim]}</Rozet>
                    </td>
                    <td>
                      <Rozet cls={odemeRenk}>{odemeAdi}</Rozet>
                    </td>
                    <td>
                      <Rozet cls={s.fatura ? "bg-[#eef0f7] text-[var(--ink)]" : "text-[var(--muted)] ring-1 ring-inset ring-[var(--border-strong)]"}>
                        {s.fatura ? "Kesildi" : "Kesilmedi"}
                      </Rozet>
                    </td>
                    <td className="tabular">{s.odemeGunu ? formatDate(s.odemeGunu) : "—"}</td>
                    <td className="whitespace-pre-line text-[9.5px]">{s.aciklama}</td>
                  </tr>
                );
              }),
            ])}
            <tr className="genel-toplam">
              <td colSpan={4}>Toplam · {hepsi.length} sipariş</td>
              <td className="sag">{formatTL(toplam(({ s }) => s.tutar))}</td>
              <td className="sag">{formatTL(toplam(({ h }) => h.odenen))}</td>
              <td className="sag">{formatTL(toplam(({ h }) => h.kalan))}</td>
              <td colSpan={5} />
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

// "Sipariş Formu" in the order window: a one-page form with the large order image and a signature
// line. Only the form is printed (globals.css hides everything else while body has .form-yazdiriliyor).
export function SiparisFormuButonu({ siparis, h }: { siparis: Siparis; h: SiparisHesap }) {
  const [gorsel, setGorsel] = useState<string | null | undefined>(undefined); // undefined: not printing

  async function bas() {
    setGorsel(null);
    const id = siparis.siparisGorselleri[0];
    const g = id ? await gorselGetir(id).catch(() => null) : null;
    setGorsel(g?.veri ?? "");
  }

  useEffect(() => {
    if (gorsel === undefined || gorsel === null) return;
    const bitti = () => {
      document.body.classList.remove("form-yazdiriliyor");
      setGorsel(undefined);
    };
    window.addEventListener("afterprint", bitti, { once: true });
    document.body.classList.add("form-yazdiriliyor");
    const t = setTimeout(() => yazdir(`Sipariş Formu - ${siparis.firmaAdi} - ${siparis.urun || formatDate(siparis.tarih)}`), 150);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", bitti);
      document.body.classList.remove("form-yazdiriliyor");
    };
  }, [gorsel, siparis]);

  return (
    <>
      <button type="button" className="btn-secondary !py-1 !px-2.5 !text-xs inline-flex items-center gap-1.5" onClick={bas} disabled={gorsel !== undefined}>
        {gorsel === null ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} Sipariş Formu
      </button>
      {typeof gorsel === "string" && createPortal(<SiparisFormu siparis={siparis} h={h} gorsel={gorsel} />, document.body)}
    </>
  );
}

function SiparisFormu({ siparis, h, gorsel }: { siparis: Siparis; h: SiparisHesap; gorsel: string }) {
  const satir = (etiket: string, deger: React.ReactNode, kalin = false) => (
    <div className="flex justify-between gap-4 py-1.5 border-b border-[#e6e6ec]">
      <span className="text-[var(--muted)]">{etiket}</span>
      <span className={`tabular text-right ${kalin ? "font-semibold" : ""}`}>{deger}</span>
    </div>
  );
  return (
    <div className="siparis-formu hidden print:block text-[12px] text-[var(--foreground)]">
      <div className="flex items-start justify-between gap-6 pb-3 border-b-2 border-[var(--ink)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- printed once, no optimization needed */}
        <img src="/logo.png" alt="Panzehir Reklam" className="w-[170px] h-auto" />
        <div className="text-right">
          <div className="text-[18px] font-semibold text-[var(--ink)]">Sipariş Formu</div>
          <div className="text-[11px] text-[var(--muted)] mt-0.5">
            Düzenlenme: {new Date().toLocaleString("tr-TR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-10 mt-4">
        <div>
          {satir("Firma", <b>{siparis.firmaAdi}</b>)}
          {satir("Ürün / İş", <span className="whitespace-pre-line">{siparis.urun || "—"}</span>)}
          {satir("Tarih", formatDate(siparis.tarih))}
        </div>
        <div>
          {satir("Tutar", formatTL(siparis.tutar))}
          {satir("Ödenen", formatTL(h.odenen))}
          {satir("Kalan", formatTL(h.kalan), true)}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-center border border-[#e6e6ec] rounded-md p-2 h-[120mm]">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL from Firestore */}
        {gorsel ? <img src={gorsel} alt="" className="max-w-full max-h-full object-contain" /> : <span className="text-[var(--muted)]">Sipariş görseli yok</span>}
      </div>

      <div className="mt-4">
        <div className="text-[var(--muted)] mb-1">Açıklama</div>
        <div className="min-h-[18mm] border border-[#e6e6ec] rounded-md p-2 whitespace-pre-line">{siparis.aciklama}</div>
      </div>

      <div className="mt-10 grid grid-cols-2 gap-16">
        <div>
          <div className="border-b border-[var(--foreground)] h-10" />
          <div className="mt-1 text-[var(--muted)]">Teslim alan (ad soyad)</div>
        </div>
        <div>
          <div className="border-b border-[var(--foreground)] h-10" />
          <div className="mt-1 text-[var(--muted)]">İmza</div>
        </div>
      </div>
    </div>
  );
}
