import type { LucideIcon } from "lucide-react";

type Tone = "green" | "blue" | "orange" | "red";

const TONE_STYLES: Record<Tone, { stripe: string; iconBg: string; iconColor: string; value: string }> = {
  green: {
    stripe: "bg-[var(--accent-green)]",
    iconBg: "bg-[var(--accent-green-soft)]",
    iconColor: "text-[var(--accent-green)]",
    value: "text-[var(--accent-green)]",
  },
  blue: {
    stripe: "bg-[var(--accent-blue)]",
    iconBg: "bg-[var(--accent-blue-soft)]",
    iconColor: "text-[var(--accent-blue)]",
    value: "text-[var(--accent-blue)]",
  },
  orange: {
    stripe: "bg-[var(--accent-orange)]",
    iconBg: "bg-[var(--accent-orange-soft)]",
    iconColor: "text-[var(--accent-orange)]",
    value: "text-[var(--accent-orange)]",
  },
  red: {
    stripe: "bg-[var(--accent-red)]",
    iconBg: "bg-[var(--accent-red-soft)]",
    iconColor: "text-[var(--accent-red)]",
    value: "text-[var(--accent-red)]",
  },
};

export default function StatCard({
  title,
  value,
  subtitle,
  tone,
  icon: Icon,
}: {
  title: string;
  value: string;
  subtitle?: string;
  tone: Tone;
  icon: LucideIcon;
}) {
  const t = TONE_STYLES[tone];

  return (
    <div className="card card-hover overflow-hidden flex-1 min-w-[230px]">
      <div className={`h-1.5 ${t.stripe}`} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm text-[var(--muted)] font-medium">{title}</div>
          <div className={`w-9 h-9 rounded-xl ${t.iconBg} flex items-center justify-center shrink-0`}>
            <Icon className={`w-[18px] h-[18px] ${t.iconColor}`} strokeWidth={2} />
          </div>
        </div>
        <div className={`text-2xl font-extrabold mt-3 ${t.value}`}>{value}</div>
        {subtitle && <div className="text-xs text-[var(--muted)] mt-1.5">{subtitle}</div>}
      </div>
    </div>
  );
}
