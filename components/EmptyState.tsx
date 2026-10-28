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
      <div className="w-11 h-11 rounded-full bg-[#f3f3f6] flex items-center justify-center">
        <Icon className="w-5 h-5 text-[var(--muted)]" strokeWidth={1.6} />
      </div>
      <div className="font-medium text-[var(--foreground)]">{title}</div>
      <p className="text-sm text-[var(--muted)] max-w-sm">{description}</p>
    </div>
  );
}
