import { greeting, longDateTR } from "@/lib/format";

export default function PageHeader({
  title,
  description,
  showGreeting = false,
}: {
  title: string;
  description: string;
  showGreeting?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {showGreeting && (
        <div className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider">
          {greeting()} · {longDateTR()}
        </div>
      )}
      <h1 className="text-[26px] font-semibold tracking-[-0.02em]">{title}</h1>
      <p className="text-sm text-[var(--muted)]">{description}</p>
    </div>
  );
}
