export function formatTL(amount: number): string {
  return new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: 0,
  }).format(Math.round(amount)) + " TL";
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
