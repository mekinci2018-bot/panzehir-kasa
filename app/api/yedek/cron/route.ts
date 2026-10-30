// Nightly backup, called by Vercel Cron (vercel.json) at 00:00 UTC = 03:00 Turkey time. Vercel sends
// CRON_SECRET as a Bearer token; anything else is refused.
import { hataYaniti, yetkiKontrol } from "@/lib/server/admin";
import { yedekAl } from "@/lib/server/yedek";
import { trZaman } from "@/lib/yedekBicimi";
import type { YedekSonucu } from "@/lib/types";

export const maxDuration = 300;

export async function GET(req: Request) {
  try {
    if ((await yetkiKontrol(req)) !== "cron") return Response.json({ hata: "Yetkisiz" }, { status: 401 });
    const sonuclar: YedekSonucu[] = [await yedekAl("gunluk")];
    // Sunday night: the run in the early hours of Monday (Turkey time) also takes the full backup.
    if (trZaman(Date.now()).haftaGunu === 1) sonuclar.push(await yedekAl("tam"));
    return Response.json({ tamam: true, sonuclar });
  } catch (err) {
    return hataYaniti(err);
  }
}
