export default function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <svg width="34" height="34" viewBox="0 0 48 48" className="shrink-0">
        <g fill="none" stroke="#e11d2a" strokeWidth="4" strokeLinejoin="round">
          <path d="M24 4 L44 24 L24 44 L4 24 Z" />
        </g>
        <path d="M24 12 L36 24 L24 36" fill="none" stroke="#1c2430" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!compact && (
        <div className="leading-tight">
          <div className="font-extrabold tracking-wide text-[15px] text-[var(--foreground)]">
            PANZEHİR
          </div>
          <div className="text-[10px] tracking-[0.25em] text-[var(--muted)] font-semibold -mt-0.5">
            REKLAM
          </div>
        </div>
      )}
    </div>
  );
}
