"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { URETIM_LABEL, URETIM_SIRASI, type OdemeDurumu } from "@/lib/siparis";
import type { UretimDurumu } from "@/lib/types";

const URETIM_RENK: Record<UretimDurumu, string> = {
  bekliyor: "bg-[#f1f1f4] text-[var(--muted)]",
  uretimde: "bg-[var(--accent-blue-soft)] text-[var(--accent-blue)]",
  bitti: "bg-[#f3f0fd] text-[var(--accent-violet)]",
  teslim: "bg-[var(--accent-green-soft)] text-[var(--accent-green)]",
};

// Shared shell for a rozet that only changes through its menu — never on a plain click, so a
// misclick can't silently move an order to the next status.
function RozetDropdown<T>({
  renkSinifi,
  etiket,
  secenekler,
  value,
  anahtar,
  onSelect,
}: {
  renkSinifi: string;
  etiket: string;
  secenekler: { value: T; label: string }[];
  value: T;
  anahtar: (v: T) => string;
  onSelect: (v: T) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
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

  function ac(e: React.MouseEvent) {
    e.stopPropagation();
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setMenu(menu ? null : { left: r.left, top: r.bottom + 4 });
  }

  return (
    <span className={`inline-flex items-center rounded-full text-[11px] font-medium whitespace-nowrap ${renkSinifi}`}>
      <button ref={triggerRef} type="button" className="pl-2.5 pr-1 py-[3px] rounded-l-full hover:brightness-95" onClick={ac}>
        {etiket}
      </button>
      <button type="button" className="pr-1.5 pl-0.5 py-[3px] rounded-r-full hover:brightness-95" aria-label="Durumu seç" onClick={ac}>
        <ChevronDown className="w-3 h-3" />
      </button>
      {menu &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setMenu(null)} />
            <div className="fixed z-[61] card shadow-[var(--shadow-pop)] py-1 w-[170px] text-[13px]" style={menu}>
              {secenekler.map((s) => (
                <button
                  key={anahtar(s.value)}
                  type="button"
                  className="w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-[var(--surface-hover)]"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenu(null);
                    if (anahtar(s.value) !== anahtar(value)) onSelect(s.value);
                  }}
                >
                  {s.label}
                  {anahtar(s.value) === anahtar(value) && <Check className="w-3.5 h-3.5 text-[var(--muted)]" />}
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
    </span>
  );
}

// Değişim sadece menüden yapılır; rozete tek tıklamak artık durumu değiştirmez.
export function UretimRozeti({ value, onChange }: { value: UretimDurumu; onChange: (d: UretimDurumu) => void }) {
  return (
    <RozetDropdown
      renkSinifi={URETIM_RENK[value]}
      etiket={URETIM_LABEL[value]}
      value={value}
      anahtar={(v) => v}
      onSelect={onChange}
      secenekler={URETIM_SIRASI.map((d) => ({ value: d, label: URETIM_LABEL[d] }))}
    />
  );
}

const ODEME: Record<OdemeDurumu, { label: string; cls: string }> = {
  odendi: { label: "Ödendi", cls: "bg-[var(--accent-green-soft)] text-[var(--accent-green)]" },
  kismi: { label: "Kısmi", cls: "bg-[var(--accent-orange-soft)] text-[var(--accent-orange)]" },
  odenmedi: { label: "Ödenmedi", cls: "bg-[var(--accent-red-soft)] text-[var(--accent-red)]" },
  kapatildi: { label: "Kapatıldı", cls: "bg-[#f1f1f4] text-[var(--muted)]" },
};

// Tutar ve ödenene göre otomatik hesaplanır; elle değiştirilemez (menüsü yok).
export function OdemeRozeti({ durum }: { durum: OdemeDurumu }) {
  const v = ODEME[durum];
  return (
    <span
      className={`badge whitespace-nowrap ${v.cls}`}
      title={durum === "kapatildi" ? "Kalan tutar Alacaklar'dan arşive gönderildi" : "Tutar ve ödenene göre otomatik, elle değiştirilemez"}
    >
      {v.label}
    </span>
  );
}

const FATURA_SECENEKLERI = [
  { value: true, label: "Kesildi" },
  { value: false, label: "Kesilmedi" },
];

// Değişim sadece menüden yapılır; rozete tek tıklamak artık durumu değiştirmez.
export function FaturaRozeti({ kesildi, onChange }: { kesildi: boolean; onChange: (v: boolean) => void }) {
  return (
    <RozetDropdown
      renkSinifi={kesildi ? "bg-[#eef0f7] text-[var(--ink)]" : "bg-transparent text-[var(--muted)] ring-1 ring-inset ring-[var(--border-strong)]"}
      etiket={kesildi ? "Kesildi" : "Kesilmedi"}
      value={kesildi}
      anahtar={(v) => String(v)}
      onSelect={onChange}
      secenekler={FATURA_SECENEKLERI}
    />
  );
}
