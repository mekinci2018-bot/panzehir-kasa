"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Printer } from "lucide-react";

// Shared print layout (cari ekstre, Alacaklar/Borçlar, Arşiv). On screen only the button shows; in
// print the menu and controls are hidden and this header opens the page. Page numbers ("Sayfa X / Y")
// and color handling live in globals.css (@media print).

// The browser names the PDF after the document title.
export function yazdir(dosyaAdi: string) {
  const eski = document.title;
  document.title = dosyaAdi;
  window.print();
  document.title = eski;
}

export function YazdirButonu({ dosyaAdi }: { dosyaAdi: string }) {
  return (
    <button
      className="btn-secondary inline-flex items-center gap-2 print:hidden"
      onClick={() => yazdir(dosyaAdi)}
      title="Yazdır ya da yazıcı olarak 'PDF olarak kaydet'i seçin"
    >
      <Printer className="w-4 h-4" /> Yazdır / PDF
    </button>
  );
}

function zamanYaz(ms: number) {
  return new Date(ms).toLocaleString("tr-TR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function YazdirmaBasligi({
  baslik,
  altBaslik,
  donem,
  filtreler = [],
}: {
  baslik: string; // "Alacaklar", "Cari Hesap Ekstresi"…
  altBaslik?: string; // e.g. the company name
  donem: string; // "Ekim 2026", "01.10.2026 – 31.10.2026", "Tüm hareketler"
  filtreler?: string[]; // what the screen was filtered by, one item per filter
}) {
  // The issue time is taken when printing starts, not when the page was opened.
  const [zaman, setZaman] = useState(() => Date.now());
  useEffect(() => {
    const guncelle = () => setZaman(Date.now());
    window.addEventListener("beforeprint", guncelle);
    return () => window.removeEventListener("beforeprint", guncelle);
  }, []);

  return (
    <div className="hidden print:block mb-1">
      <div className="flex items-start justify-between gap-6 pb-3 border-b-2 border-[var(--ink)]">
        <Image src="/logo.png" alt="Panzehir Reklam" width={581} height={130} className="w-[150px] h-auto" priority />
        <div className="text-right">
          <div className="text-[17px] font-semibold text-[var(--ink)]">{baslik}</div>
          {altBaslik && <div className="text-[13px] font-medium">{altBaslik}</div>}
          <div className="text-[11px] text-[var(--muted)] mt-0.5">Düzenlenme: {zamanYaz(zaman)}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 pt-2 text-[11px]">
        <span>
          <span className="text-[var(--muted)]">Dönem:</span> <b>{donem}</b>
        </span>
        {filtreler.map((f) => (
          <span key={f}>{f}</span>
        ))}
      </div>
    </div>
  );
}
