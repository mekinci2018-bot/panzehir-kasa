// Ayarlar: GET lists the backups in Drive, POST takes one now ("Şimdi Yedek Al").
// Both need the shared account's Firebase ID token.
import { hataYaniti, yetkiKontrol } from "@/lib/server/admin";
import { yedekAl, yedekleriListele } from "@/lib/server/yedek";

export const maxDuration = 300;

export async function GET(req: Request) {
  try {
    if ((await yetkiKontrol(req)) !== "kullanici") return Response.json({ hata: "Yetkisiz" }, { status: 401 });
    const gruplar = await yedekleriListele();
    return Response.json({
      yedekler: gruplar.map((g) => ({ ad: g.ad, tarih: g.tarih, tam: g.tam, boyut: g.boyut, olusturma: g.olusturma, parca: g.dosyalar.length })),
    });
  } catch (err) {
    return hataYaniti(err);
  }
}

export async function POST(req: Request) {
  try {
    if ((await yetkiKontrol(req)) !== "kullanici") return Response.json({ hata: "Yetkisiz" }, { status: 401 });
    const { gorsellerDahil } = (await req.json().catch(() => ({}))) as { gorsellerDahil?: boolean };
    const sonuc = await yedekAl(gorsellerDahil ? "elle-tam" : "elle");
    return Response.json({ sonuc });
  } catch (err) {
    return hataYaniti(err);
  }
}
