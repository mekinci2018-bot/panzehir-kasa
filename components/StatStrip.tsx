type Tone = "green" | "blue" | "orange" | "red";

const DOT: Record<Tone, string> = {
  green: "bg-[var(--accent-green)]",
  blue: "bg-[var(--accent-blue)]",
  orange: "bg-[var(--accent-orange)]",
  red: "bg-[var(--accent-red)]",
};

export interface StatItem {
  title: string;
  value: string;
  hint: string;
  tone: Tone;
}

export default function StatStrip({ items }: { items: StatItem[] }) {
  return (
    <div className="card grid grid-cols-2 md:grid-cols-4 divide-[var(--border)] md:divide-x [&>*:nth-child(-n+2)]:border-b md:[&>*:nth-child(-n+2)]:border-b-0 [&>*]:border-[var(--border)]">
      {items.map((s) => (
        <div key={s.title} className="px-4 py-3" title={s.hint}>
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
            <span className={`w-1.5 h-1.5 rounded-full ${DOT[s.tone]}`} />
            {s.title}
          </div>
          <div className="tabular text-[15px] font-semibold mt-1">{s.value}</div>
        </div>
      ))}
    </div>
  );
}
