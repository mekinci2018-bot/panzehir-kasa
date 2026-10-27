"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  Archive,
  Landmark,
  Users,
  Menu,
  X,
} from "lucide-react";
import Logo from "./Logo";

const NAV = [
  { href: "/kasa", label: "Kasa", icon: Wallet },
  { href: "/alacaklar", label: "Alacaklar", icon: ArrowDownToLine },
  { href: "/verecekler", label: "Borçlar", icon: ArrowUpFromLine },
  { href: "/arsiv", label: "Arşiv", icon: Archive },
  { href: "/banka-bilgileri", label: "Banka Hesapları", icon: Landmark },
  { href: "/calisanlar", label: "Personel", icon: Users },
];

function NavLinks({ pathname, onNavigate }: { pathname: string | null; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              active
                ? "bg-[var(--brand)] text-white shadow-[0_4px_12px_-2px_rgba(226,29,36,0.5)]"
                : "text-[var(--sidebar-text)] hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={2} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="md:hidden sticky top-0 z-40 h-14 bg-[var(--sidebar-bg)] flex items-center justify-between px-4">
        <Logo compact />
        <button
          className="w-9 h-9 flex items-center justify-center rounded-lg text-white/80 hover:bg-white/10"
          onClick={() => setOpen(true)}
          aria-label="Menüyü aç"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="drawer-in absolute inset-y-0 left-0 w-72 bg-[var(--sidebar-bg)] flex flex-col">
            <div className="px-4 py-4 flex items-center justify-between">
              <Logo compact />
              <button
                className="w-9 h-9 flex items-center justify-center rounded-lg text-white/80 hover:bg-white/10"
                onClick={() => setOpen(false)}
                aria-label="Menüyü kapat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="h-px bg-[var(--sidebar-border)] mx-4" />
            <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            <div className="px-5 py-4 text-[11px] text-[var(--sidebar-text)]/60">Panzehir Reklam</div>
          </aside>
        </div>
      )}

      <aside className="hidden md:flex w-64 shrink-0 h-screen sticky top-0 bg-[var(--sidebar-bg)] flex-col">
        <div className="px-4 pt-5 pb-4">
          <Logo />
          <div className="text-[13px] text-[var(--sidebar-text)] mt-3 tracking-wide font-medium">
            Kasa Defteri
          </div>
        </div>
        <div className="h-px bg-[var(--sidebar-border)] mx-4" />
        <NavLinks pathname={pathname} />
        <div className="px-5 py-4 text-[11px] text-[var(--sidebar-text)]/50">Panzehir Reklam</div>
      </aside>
    </>
  );
}
