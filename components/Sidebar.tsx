"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";

const NAV = [
  { href: "/kasa", label: "Kasa", icon: WalletIcon },
  { href: "/alacaklar", label: "Alacaklar", icon: ArrowDownIcon },
  { href: "/verecekler", label: "Verecekler", icon: ArrowUpIcon },
  { href: "/arsiv", label: "Arşiv", icon: ArchiveIcon },
  { href: "/banka-bilgileri", label: "Banka Bilgileri", icon: BankIcon },
  { href: "/calisanlar", label: "Çalışanlar", icon: UsersIcon },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 border-r border-[var(--border)] bg-white flex flex-col">
      <div className="px-5 py-6 border-b border-[var(--border)]">
        <Logo />
        <div className="text-xs text-[var(--muted)] mt-1">Kasa Defteri</div>
      </div>
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-[var(--brand-soft)] text-[var(--brand)] border-l-[3px] border-[var(--brand)] pl-[9px]"
                  : "text-[var(--muted)] hover:bg-gray-50 hover:text-[var(--foreground)]"
              }`}
            >
              <Icon className="w-[18px] h-[18px]" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function WalletIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
function ArrowDownIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 4v14M6 12l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ArrowUpIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 20V6M6 12l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ArchiveIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 13h4" strokeLinecap="round" />
    </svg>
  );
}
function BankIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 10l9-6 9 6M5 10v9M9 10v9M15 10v9M19 10v9M3 19h18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function UsersIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 19c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6M16 8.2a3 3 0 1 1 3 3M21.5 19c0-2.6-1.8-4.7-4.5-5.5" strokeLinecap="round" />
    </svg>
  );
}
