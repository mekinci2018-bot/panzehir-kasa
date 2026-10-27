import type { LucideIcon } from "lucide-react";

export default function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center text-center gap-3 px-6 py-14">
      <div className="w-12 h-12 rounded-full bg-[var(--brand-soft)] flex items-center justify-center">
        <Icon className="w-6 h-6 text-[var(--brand)]" strokeWidth={1.8} />
      </div>
      <div className="font-semibold text-[var(--foreground)]">{title}</div>
      <p className="text-sm text-[var(--muted)] max-w-sm">{description}</p>
    </div>
  );
}
