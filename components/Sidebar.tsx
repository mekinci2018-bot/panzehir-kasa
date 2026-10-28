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
  Lock,
} from "lucide-react";
import { logout } from "@/lib/firebase";
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
    <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`relative flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] transition-colors ${
              active
                ? "bg-white/[0.07] text-white font-medium before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[2px] before:rounded-full before:bg-[var(--brand)]"
                : "text-[var(--sidebar-text)] hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            <Icon className={`w-[17px] h-[17px] shrink-0 ${active ? "text-[var(--brand)]" : ""}`} strokeWidth={1.75} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function LockButton() {
  return (
    <div className="px-3 py-4">
      <button
        onClick={() => logout()}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-[var(--sidebar-text)]/70 hover:bg-white/[0.04] hover:text-white transition-colors"
      >
        <Lock className="w-[16px] h-[16px] shrink-0" strokeWidth={1.75} />
        Kilitle
      </button>
    </div>
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
            <div className="h-px bg-white/[0.06] mx-4" />
            <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            <LockButton />
          </aside>
        </div>
      )}

      <aside className="hidden md:flex w-60 shrink-0 h-screen sticky top-0 bg-[var(--sidebar-bg)] flex-col">
        <div className="px-6 pt-7 pb-6">
          <Logo />
          <div className="text-[10.5px] text-[var(--sidebar-text)]/70 mt-3 uppercase tracking-[0.18em]">
            Kasa Defteri
          </div>
        </div>
        <NavLinks pathname={pathname} />
        <LockButton />
      </aside>
    </>
  );
}
