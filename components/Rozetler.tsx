"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { URETIM_LABEL, URETIM_SIRASI, sonrakiUretim, type OdemeDurumu } from "@/lib/siparis";
import type { UretimDurumu } from "@/lib/types";

const URETIM_RENK: Record<UretimDurumu, string> = {
  bekliyor: "bg-[#f1f1f4] text-[var(--muted)]",
  uretimde: "bg-[var(--accent-blue-soft)] text-[var(--accent-blue)]",
  bitti: "bg-[#f3f0fd] text-[var(--accent-violet)]",
  teslim: "bg-[var(--accent-green-soft)] text-[var(--accent-green)]",
};

// Click moves to the next step (Bekliyor → Üretimde → Bitti → Teslim Edildi); the arrow opens a
// menu to jump straight to any step.
export function UretimRozeti({ value, onChange }: { value: UretimDurumu; onChange: (d: UretimDurumu) => void }) {
  const okRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!menu) return;
    const kapat = () => setMenu(null);
    window.addEventListener("scroll", kapat, true);
    window.addEventListener("resize", kapat);
    return () => {
      window.removeEventListener("scroll", kapat, true);
      window.removeEventListener("resize", kapat);
    };
  }, [menu]);

  function menuAc(e: React.MouseEvent) {
    e.stopPropagation();
    const r = okRef.current?.getBoundingClientRect();
    if (r) setMenu(menu ? null : { left: r.left - 90, top: r.bottom + 4 });
  }

  return (
    <span className={`inline-flex items-center rounded-full text-[11px] font-medium whitespace-nowrap ${URETIM_RENK[value]}`}>
      <button
        type="button"
        className="pl-2.5 pr-1 py-[3px] rounded-l-full hover:brightness-95"
        title={`Sıradaki: ${URETIM_LABEL[sonrakiUretim(value)]}`}
        onClick={(e) => {
          e.stopPropagation();
          onChange(sonrakiUretim(value));
        }}
      >
        {URETIM_LABEL[value]}
      </button>
      <button
        ref={okRef}
        type="button"
        className="pr-1.5 pl-0.5 py-[3px] rounded-r-full hover:brightness-95"
        aria-label="Üretim durumunu seç"
        onClick={menuAc}
      >
        <ChevronDown className="w-3 h-3" />
      </button>
      {menu &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setMenu(null)} />
            <div className="fixed z-[61] card shadow-[var(--shadow-pop)] py-1 w-[150px] text-[13px]" style={menu}>
              {URETIM_SIRASI.map((d) => (
                <button
                  key={d}
                  type="button"
                  className="w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-[var(--surface-hover)]"
                  onClick={() => {
                    setMenu(null);
                    if (d !== value) onChange(d);
                  }}
                >
                  {URETIM_LABEL[d]}
                  {d === value && <Check className="w-3.5 h-3.5 text-[var(--muted)]" />}
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
    </span>
  );
}

const ODEME: Record<OdemeDurumu, { label: string; cls: string }> = {
  odendi: { label: "Ödendi", cls: "bg-[var(--accent-green-soft)] text-[var(--accent-green)]" },
  kismi: { label: "Kısmi", cls: "bg-[var(--accent-orange-soft)] text-[var(--accent-orange)]" },
  odenmedi: { label: "Ödenmedi", cls: "bg-[var(--accent-red-soft)] text-[var(--accent-red)]" },
  kapatildi: { label: "Kapatıldı", cls: "bg-[#f1f1f4] text-[var(--muted)]" },
};

export function OdemeRozeti({ durum }: { durum: OdemeDurumu }) {
  const v = ODEME[durum];
  return (
    <span
      className={`badge whitespace-nowrap ${v.cls}`}
      title={durum === "kapatildi" ? "Kalan tutar Alacaklar'dan arşive gönderildi" : "Tutar ve ödenene göre otomatik"}
    >
      {v.label}
    </span>
  );
}

export function FaturaRozeti({ kesildi, onToggle }: { kesildi: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`badge whitespace-nowrap transition-colors ${
        kesildi ? "bg-[#eef0f7] text-[var(--ink)]" : "bg-transparent text-[var(--muted)] ring-1 ring-inset ring-[var(--border-strong)]"
      }`}
      title="Tıklayınca değişir"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      {kesildi ? "Kesildi" : "Kesilmedi"}
    </button>
  );
}
