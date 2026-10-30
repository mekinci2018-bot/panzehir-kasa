// Backup file format, shared by the server (Drive backups, restore) and the browser ("Bilgisayara
// İndir"), so any backup file can be restored the same way. Plain TypeScript, no Firebase imports.

export const YEDEK_UYGULAMA = "panzehir-kasa";

// Images are large; they only go into full (weekly / "görseller dahil") backups.
export const GORSEL_KOLEKSIYONLARI = ["gorseller", "gorselOnizlemeleri"];

// Backup status lives here; it is never backed up or overwritten by a restore.
export const SISTEM_KOLEKSIYONU = "sistem";

// What the browser exports (it cannot list collections; the server backs up whatever exists).
export const UYGULAMA_KOLEKSIYONLARI = ["kasaKayitlari", "bankaHesaplari", "calisanlar", "firmalar", "firmaAdlari", "siparisler"];

export interface YedekDosyasi {
  uygulama: typeof YEDEK_UYGULAMA;
  surum: 1;
  olusturma: string; // ISO time
  gorsellerDahil: boolean;
  // collection → document id → fields
  koleksiyonlar: Record<string, Record<string, unknown>>;
}

// Firestore timestamps are written as { __zaman: ms } and turned back into timestamps on restore.
export function zamanDuzle(deger: unknown): unknown {
  if (Array.isArray(deger)) return deger.map(zamanDuzle);
  if (deger && typeof deger === "object") {
    const o = deger as { toMillis?: () => number };
    if (typeof o.toMillis === "function") return { __zaman: o.toMillis() };
    return Object.fromEntries(Object.entries(deger).map(([k, v]) => [k, zamanDuzle(v)]));
  }
  return deger;
}

// Turkish wall-clock date/time of a moment, whatever the server's time zone.
export function trZaman(ms: number): { tarih: string; saat: string; haftaGunu: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value])
  );
  const gunler = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return { tarih: `${p.year}-${p.month}-${p.day}`, saat: `${p.hour}${p.minute}`, haftaGunu: gunler.indexOf(p.weekday) };
}

export type YedekAdTuru = "gunluk" | "tam" | "elle" | "elle-tam" | "geri-yukleme-oncesi" | "geri-yukleme-oncesi-tam";

// panzehir-yedek-2026-10-31.json            nightly
// panzehir-yedek-2026-10-31-elle-1542.json  "Şimdi Yedek Al"
// panzehir-tam-yedek-2026-11-02.json.gz     weekly full (with images); large ones get .001, .002 … parts
export function yedekDosyaAdi(tur: YedekAdTuru, ms: number): string {
  const { tarih, saat } = trZaman(ms);
  const tam = tur === "tam" || tur === "elle-tam" || tur === "geri-yukleme-oncesi-tam";
  const ek = tur === "elle" || tur === "elle-tam" ? `-elle-${saat}` : tur.startsWith("geri-yukleme-oncesi") ? `-geri-yukleme-oncesi-${saat}` : "";
  return tam ? `panzehir-tam-yedek-${tarih}${ek}.json.gz` : `panzehir-yedek-${tarih}${ek}.json`;
}

// A split full backup's parts share one name: "x.json.gz.001", "x.json.gz.002" → "x.json.gz".
export function yedekGrupAdi(dosyaAdi: string): string {
  return dosyaAdi.replace(/\.\d{3}$/, "");
}

export function yedekTarihi(dosyaAdi: string): string | null {
  return dosyaAdi.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}

export function tamYedekMi(dosyaAdi: string): boolean {
  return dosyaAdi.startsWith("panzehir-tam-yedek-");
}
