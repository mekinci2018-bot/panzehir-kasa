import Link from "next/link";

// A company name that opens its cari ekstre (an employee's opens Personel). Free-text names from
// older records stay plain text.
export default function FirmaLink({
  firmaId,
  personelId,
  ad,
  className = "",
}: {
  firmaId?: string;
  personelId?: string;
  ad: string;
  className?: string;
}) {
  const href = firmaId ? `/firmalar/${firmaId}` : personelId ? "/calisanlar" : null;
  if (!href) return <span className={className}>{ad}</span>;
  return (
    <Link
      href={href}
      className={`${className} hover:underline underline-offset-2 decoration-[var(--border-strong)]`}
      onClick={(e) => e.stopPropagation()}
      title={firmaId ? "Cari ekstreyi aç" : "Personel"}
    >
      {ad}
    </Link>
  );
}
