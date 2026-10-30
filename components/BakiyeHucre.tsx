import { formatTL } from "@/lib/format";

// Positive balance: the company owes us (alacak); negative: we owe them (borç).
export default function BakiyeHucre({ bakiye }: { bakiye: number }) {
  if (Math.abs(bakiye) < 0.005) return <span className="text-[var(--muted)]">{formatTL(0)}</span>;
  return (
    <span className={bakiye > 0 ? "text-[var(--accent-orange)] font-medium" : "text-[var(--brand)] font-medium"}>
      {formatTL(Math.abs(bakiye))}
      <span className="text-[11px] ml-1">{bakiye > 0 ? "Alacak" : "Borç"}</span>
    </span>
  );
}
