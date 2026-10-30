"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useYedekDurumu } from "@/lib/hooks";
import { yedekUyarisi } from "@/lib/yedekIstemci";

// "Son otomatik yedek: …" under the menu; turns red when backups need attention. Links to Ayarlar.
export default function YedekDurumSatiri({ onNavigate }: { onNavigate?: () => void }) {
  const { durum, loading } = useYedekDurumu();
  const [simdi, setSimdi] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setSimdi(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (loading) return null;
  const { metin, kirmizi } = yedekUyarisi(durum, simdi);

  return (
    <Link
      href="/ayarlar"
      onClick={onNavigate}
      className={`mx-3 mb-1 flex items-start gap-2 rounded-lg px-3 py-2 text-[11.5px] leading-snug transition-colors ${
        kirmizi ? "bg-[var(--brand)]/15 text-[#ff9a9e] hover:bg-[var(--brand)]/25" : "text-[var(--sidebar-text)]/70 hover:bg-white/[0.04] hover:text-white"
      }`}
      title="Yedekleme ayarları"
    >
      <span className={`mt-[5px] w-1.5 h-1.5 rounded-full shrink-0 ${kirmizi ? "bg-[var(--brand)]" : "bg-[var(--accent-green)]"}`} />
      <span>{metin}</span>
    </Link>
  );
}
