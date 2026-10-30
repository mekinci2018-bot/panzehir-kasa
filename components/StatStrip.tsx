type Tone = "green" | "blue" | "orange" | "red" | "violet";

const DOT: Record<Tone, string> = {
  green: "bg-[var(--accent-green)]",
  blue: "bg-[var(--accent-blue)]",
  orange: "bg-[var(--accent-orange)]",
  red: "bg-[var(--accent-red)]",
  violet: "bg-[var(--accent-violet)]",
};

export interface StatItem {
  title: string;
  value: string;
  hint: string;
  tone: Tone;
  vurgulu?: boolean; // the headline figure: dark, larger
}

// Cells sit on a 1px gap over the border colour, so dividers work for any item count.
export default function StatStrip({ items }: { items: StatItem[] }) {
  return (
    <div className="card overflow-hidden grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-px !bg-[var(--border)]">
      {items.map((s) =>
        s.vurgulu ? (
          <div key={s.title} className="px-4 py-3 bg-[var(--ink)] text-white col-span-2 md:col-span-1" title={s.hint}>
            <div className="text-[11px] font-medium uppercase tracking-wider text-white/60">{s.title}</div>
            <div className="tabular text-[19px] font-semibold mt-0.5 tracking-[-0.01em]">{s.value}</div>
          </div>
        ) : (
          <div key={s.title} className="px-4 py-3 bg-[var(--surface)]" title={s.hint}>
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
              <span className={`w-1.5 h-1.5 rounded-full ${DOT[s.tone]}`} />
              {s.title}
            </div>
            <div className="tabular text-[15px] font-semibold mt-1">{s.value}</div>
          </div>
        )
      )}
    </div>
  );
}
