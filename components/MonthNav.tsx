import { ChevronLeft, ChevronRight } from "lucide-react";
import { monthLabel, shiftMonthKey } from "@/lib/format";

export default function MonthNav({
  monthKey,
  onChange,
}: {
  monthKey: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        className="icon-btn"
        onClick={() => onChange(shiftMonthKey(monthKey, -1))}
        aria-label="Önceki ay"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <div className="font-bold text-lg min-w-[140px] text-center">{monthLabel(monthKey)}</div>
      <button
        className="icon-btn"
        onClick={() => onChange(shiftMonthKey(monthKey, 1))}
        aria-label="Sonraki ay"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
