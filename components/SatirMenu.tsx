"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, type LucideIcon } from "lucide-react";

export interface SatirMenuOgesi {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  tehlikeli?: boolean; // shown in the brand colour, for Sil
}

// Small "⋯" menu for a single row inside a list. Closing goes through a full-screen backdrop BEHIND
// the panel (click-based, like FirmaIslemMenu and Rozetler) — a document-level pointerdown listener
// fires before the menu buttons' own click and closes the menu out from under them.
export default function SatirMenu({ ogeler, baslik = "İşlemler" }: { ogeler: SatirMenuOgesi[]; baslik?: string }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ right: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const yerlestir = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (r) setPos({ right: window.innerWidth - r.right, top: r.bottom + 4 });
    };
    yerlestir();
    const kacis = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("scroll", yerlestir, true);
    window.addEventListener("resize", yerlestir);
    document.addEventListener("keydown", kacis);
    return () => {
      window.removeEventListener("scroll", yerlestir, true);
      window.removeEventListener("resize", yerlestir);
      document.removeEventListener("keydown", kacis);
    };
  }, [open]);

  const menu =
    open && pos
      ? createPortal(
          <>
            <div className="fixed inset-0 z-[59]" onClick={() => setOpen(false)} />
            <div
              role="menu"
              className="fixed z-[60] card shadow-[var(--shadow-pop)] py-1 w-[170px] text-sm"
              style={{ right: pos.right, top: pos.top }}
            >
              {ogeler.map((o) => (
                <button
                  key={o.label}
                  type="button"
                  className={`w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--surface-hover)] ${
                    o.tehlikeli ? "text-[var(--brand)]" : ""
                  }`}
                  onClick={() => {
                    setOpen(false);
                    o.onClick();
                  }}
                >
                  <o.icon className="w-3.5 h-3.5" /> {o.label}
                </button>
              ))}
            </div>
          </>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="icon-btn !w-7 !h-7 shrink-0"
        title={baslik}
        aria-label={baslik}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {menu}
    </>
  );
}
