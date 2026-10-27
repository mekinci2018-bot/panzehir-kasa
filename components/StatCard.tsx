export default function StatCard({
  title,
  value,
  subtitle,
  tone = "default",
}: {
  title: string;
  value: string;
  subtitle?: string;
  tone?: "default" | "green" | "red" | "amber";
}) {
  const toneClass =
    tone === "green"
      ? "text-[var(--accent-green)]"
      : tone === "red"
      ? "text-[var(--brand)]"
      : tone === "amber"
      ? "text-[var(--accent-amber)]"
      : "text-[var(--foreground)]";

  return (
    <div className="card p-5 flex-1 min-w-[220px]">
      <div className="text-sm text-[var(--muted)] font-medium">{title}</div>
      <div className={`text-3xl font-extrabold mt-2 ${toneClass}`}>{value}</div>
      {subtitle && <div className="text-xs text-[var(--muted)] mt-1">{subtitle}</div>}
    </div>
  );
}
