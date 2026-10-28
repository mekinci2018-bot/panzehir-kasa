import type { OdemeSekli } from "./types";

export const ODEME_SEKLI_LABEL: Record<OdemeSekli, string> = {
  nakit: "Nakit",
  kart: "Kredi Kartı",
  havale: "Banka Havalesi",
};

export function formatTL(amount: number): string {
  return (
    "₺" +
    new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  );
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

export function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function monthKeyOf(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

const AYLAR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${AYLAR[m - 1]} ${y}`;
}

export function currentMonthKey(): string {
  return todayISO().slice(0, 7);
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "İyi geceler";
  if (hour < 12) return "Günaydın";
  if (hour < 18) return "İyi günler";
  return "İyi akşamlar";
}

export function longDateTR(): string {
  return new Date().toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    weekday: "long",
  });
}

export type VadeDurumu = "gecti" | "yaklasiyor" | "normal";

// Overdue once the due date has passed; "yaklasiyor" when due today or within 7 days.
export function vadeDurumu(vadeTarihi: string): VadeDurumu {
  const gecen = daysSince(vadeTarihi);
  if (gecen > 0) return "gecti";
  if (gecen >= -7) return "yaklasiyor";
  return "normal";
}

export function daysSince(iso: string): number {
  const then = new Date(iso + "T00:00:00");
  const now = new Date();
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
}
