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
    <div className="flex flex-col gap-1">
      {showGreeting && (
        <div className="text-sm font-medium text-[var(--brand)]">
          {greeting()} · {longDateTR()}
        </div>
      )}
      <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
      <p className="text-sm text-[var(--muted)]">{description}</p>
    </div>
  );
}
