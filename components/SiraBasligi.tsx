"use client";

import type { Siralama } from "@/lib/siralama";

// A sortable column header: ▲ ascending, ▼ descending; other headers show a faint ▲ on hover.
export function SiraTh({
  sutun,
  sira,
  onSirala,
  className = "",
  title,
  children,
}: {
  sutun: string;
  sira: Siralama | null;
  onSirala: (sutun: string) => void;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const aktif = sira?.sutun === sutun;
  const sag = className.includes("text-right");
  return (
    <th className={className} title={title} aria-sort={aktif ? (sira.yon === "artan" ? "ascending" : "descending") : undefined}>
      <SiraDugmesi aktif={aktif} azalan={aktif && sira.yon === "azalan"} sag={sag} onClick={() => onSirala(sutun)}>
        {children}
      </SiraDugmesi>
    </th>
  );
}

// Header-like row of sort buttons for lists that are not tables (Bugün girilenler, bank movements).
export function SiraCubugu({
  sutunlar,
  sira,
  onSirala,
  className = "",
}: {
  sutunlar: [sutun: string, etiket: string][];
  sira: Siralama | null;
  onSirala: (sutun: string) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium tracking-[0.06em] text-[var(--muted)] ${className}`}>
      <span className="normal-case tracking-normal text-[var(--muted-soft)]">Sırala:</span>
      {sutunlar.map(([sutun, etiket]) => (
        <SiraDugmesi key={sutun} aktif={sira?.sutun === sutun} azalan={sira?.sutun === sutun && sira.yon === "azalan"} onClick={() => onSirala(sutun)}>
          {etiket}
        </SiraDugmesi>
      ))}
    </div>
  );
}

// The same control outside a <table>.
export function SiraDugmesi({
  aktif,
  azalan,
  sag,
  onClick,
  children,
}: {
  aktif: boolean;
  azalan: boolean;
  sag?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`group inline-flex items-center gap-1 uppercase tracking-[inherit] hover:text-[var(--foreground)] ${sag ? "flex-row-reverse" : ""} ${
        aktif ? "text-[var(--foreground)]" : ""
      }`}
      onClick={onClick}
    >
      <span>{children}</span>
      <span aria-hidden className={`text-[8px] leading-none ${aktif ? "" : "opacity-0 group-hover:opacity-40"}`}>
        {azalan ? "▼" : "▲"}
      </span>
    </button>
  );
}
