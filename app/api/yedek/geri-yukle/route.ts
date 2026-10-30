// Restores a Drive backup (Ayarlar → Geri Yükleme). The current data is backed up to Drive first.
import { hataYaniti, yetkiKontrol } from "@/lib/server/admin";
import { geriYukle } from "@/lib/server/yedek";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    if ((await yetkiKontrol(req)) !== "kullanici") return Response.json({ hata: "Yetkisiz" }, { status: 401 });
    const { ad } = (await req.json().catch(() => ({}))) as { ad?: string };
    if (!ad) return Response.json({ hata: "Yedek seçilmedi." }, { status: 400 });
    return Response.json(await geriYukle(ad));
  } catch (err) {
    return hataYaniti(err);
  }
}
