"use client";

import { ayaDogru, currentMonthKey, formatDate, isoDayOf, monthKeyOf, todayISO } from "@/lib/format";

export type TarihUyarisi = { tip: "ileri" | "ay"; metin: string };

// The date picked here decides which month the money lands in (lib/donem.ts counts every movement on
// its own date), so a date in the future or outside the current month is called out before saving.
export function tarihUyarilari(tarih: string): TarihUyarisi[] {
  if (!tarih) return [];
  const uyarilar: TarihUyarisi[] = [];
  if (tarih > todayISO()) uyarilar.push({ tip: "ileri", metin: "İleri tarih seçtiniz; kayıt bugüne değil o güne işlenir." });
  const ay = monthKeyOf(tarih);
  if (ay !== currentMonthKey()) uyarilar.push({ tip: "ay", metin: `Bu kayıt ${ayaDogru(ay)} işlenecek.` });
  return uyarilar;
}

const UYARI_RENK: Record<TarihUyarisi["tip"], string> = {
  ileri: "text-[var(--accent-orange)]",
  ay: "text-[var(--accent-blue)]",
};

export function TarihUyarilari({ tarih, className = "" }: { tarih: string; className?: string }) {
  const uyarilar = tarihUyarilari(tarih);
  if (uyarilar.length === 0) return null;
  return (
    <div className={`flex flex-col gap-0.5 mt-1 ${className}`}>
      {uyarilar.map((u) => (
        <p key={u.tip} className={`text-[11px] leading-snug ${UYARI_RENK[u.tip]}`}>
          {u.metin}
        </p>
      ))}
    </div>
  );
}

// When money was keyed in on a different day than it moved (a backdated payment), the detail windows
// show the entry day in small print. createdAt already holds that moment, on the record and on each
// later payment, so nothing extra is stored.
export function GirisNotu({ tarih, createdAt }: { tarih: string; createdAt?: number }) {
  if (!createdAt) return null;
  const gun = isoDayOf(createdAt);
  if (gun === tarih) return null;
  return <span className="text-[var(--muted-soft)]"> · {formatDate(gun)} tarihinde girildi</span>;
}

// Date field with its warnings, for every window that writes money into Kasa.
export default function TarihAlani({
  value,
  onChange,
  label = "Tarih",
  className = "input-field",
}: {
  value: string;
  onChange: (tarih: string) => void;
  label?: string;
  className?: string;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <input type="date" className={className} value={value} onChange={(e) => onChange(e.target.value)} />
      <TarihUyarilari tarih={value} />
    </div>
  );
}
