import { Loader2 } from "lucide-react";

// Shown in a card or table while its data arrives for the first time (later visits load from cache).
export default function YukleniyorSatiri({ metin = "Yükleniyor…" }: { metin?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-[var(--muted)]">
      <Loader2 className="w-4 h-4 animate-spin" />
      {metin}
    </div>
  );
}
