import { formatTL, monthLabel } from "@/lib/format";
import type { HesapDonemi, KasaHesabi } from "@/lib/donem";

const SATIRLAR: { anahtar: KasaHesabi | "toplam"; ad: string }[] = [
  { anahtar: "nakit", ad: "Nakit Kasa" },
  { anahtar: "banka", ad: "Banka" },
  { anahtar: "kart", ad: "Kart / POS" },
  { anahtar: "toplam", ad: "Toplam" },
];

// Opening balance carried from earlier months, the month's in/out, and the closing balance.
export default function AyKasaOzeti({ ay, donem }: { ay: string; donem: Record<KasaHesabi | "toplam", HesapDonemi> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[520px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-[var(--muted)]">
            <th className="text-left font-medium px-5 py-2"></th>
            <th className="text-right font-medium px-3 py-2">Önceki aydan devreden</th>
            <th className="text-right font-medium px-3 py-2">Giriş</th>
            <th className="text-right font-medium px-3 py-2">Çıkış</th>
            <th className="text-right font-medium px-5 py-2">{monthLabel(ay)} sonu</th>
          </tr>
        </thead>
        <tbody>
          {SATIRLAR.map(({ anahtar, ad }) => {
            const d = donem[anahtar];
            const toplam = anahtar === "toplam";
            return (
              <tr key={anahtar} className={toplam ? "border-t border-[var(--border)] font-semibold" : ""}>
                <td className="px-5 py-1.5">{ad}</td>
                <td className="px-3 py-1.5 text-right tabular text-[var(--muted)]">{formatTL(d.devreden)}</td>
                <td className="px-3 py-1.5 text-right tabular text-[var(--accent-green)]">{d.giris ? `+${formatTL(d.giris)}` : "—"}</td>
                <td className="px-3 py-1.5 text-right tabular">{d.cikis ? `−${formatTL(d.cikis)}` : "—"}</td>
                <td className={`px-5 py-1.5 text-right tabular ${toplam ? "" : "font-medium"} ${d.aySonu < 0 ? "text-[var(--brand)]" : ""}`}>
                  {formatTL(d.aySonu)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
