"use client";

// Browser side of backups: calls to the app's backup API, and "Bilgisayara İndir", which builds the
// file here because a server response can't carry a full backup (Vercel caps responses at 4.5 MB).
import { collection, getDocs } from "firebase/firestore";
import { ensureSignedIn, getDb, idToken } from "./firebase";
import {
  GORSEL_KOLEKSIYONLARI,
  UYGULAMA_KOLEKSIYONLARI,
  YEDEK_UYGULAMA,
  yedekDosyaAdi,
  zamanDuzle,
  type YedekDosyasi,
} from "./yedekBicimi";
import type { YedekSonucu } from "./types";

export class YedekApiHatasi extends Error {
  constructor(
    message: string,
    public eksikler?: string[]
  ) {
    super(message);
  }
}

async function api<T>(yol: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(yol, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await idToken()}` },
  });
  const veri = (await res.json().catch(() => ({}))) as T & { hata?: string; eksikler?: string[] };
  if (!res.ok) throw new YedekApiHatasi(veri.hata ?? `Sunucu hatası (${res.status})`, veri.eksikler);
  return veri;
}

export interface DriveYedegi {
  ad: string;
  tarih: string | null;
  tam: boolean;
  boyut: number;
  olusturma: string;
  parca: number;
}

export function driveYedekleri() {
  return api<{ yedekler: DriveYedegi[] }>("/api/yedek").then((r) => r.yedekler);
}

export function simdiYedekAl(gorsellerDahil: boolean) {
  return api<{ sonuc: YedekSonucu }>("/api/yedek", { method: "POST", body: JSON.stringify({ gorsellerDahil }) }).then((r) => r.sonuc);
}

export function driveGeriYukle(ad: string) {
  return api<{ oncekiYedek: YedekSonucu; koleksiyonlar: Record<string, number> }>("/api/yedek/geri-yukle", {
    method: "POST",
    body: JSON.stringify({ ad }),
  });
}

// Same file format as the Drive backups. With images it is gzipped like the weekly full backup.
export async function bilgisayaraIndir(gorsellerDahil: boolean, ilerleme?: (metin: string) => void): Promise<number> {
  await ensureSignedIn();
  const adlar = [...UYGULAMA_KOLEKSIYONLARI, ...(gorsellerDahil ? GORSEL_KOLEKSIYONLARI : [])];
  const koleksiyonlar: YedekDosyasi["koleksiyonlar"] = {};
  for (const ad of adlar) {
    ilerleme?.(`${ad} okunuyor…`);
    const snap = await getDocs(collection(getDb(), ad));
    koleksiyonlar[ad] = Object.fromEntries(snap.docs.map((d) => [d.id, zamanDuzle(d.data())]));
  }
  const veri: YedekDosyasi = { uygulama: YEDEK_UYGULAMA, surum: 1, olusturma: new Date().toISOString(), gorsellerDahil, koleksiyonlar };
  let blob = new Blob([JSON.stringify(veri)], { type: "application/json" });
  if (gorsellerDahil) {
    ilerleme?.("Sıkıştırılıyor…");
    blob = await new Response(blob.stream().pipeThrough(new CompressionStream("gzip"))).blob();
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = yedekDosyaAdi(gorsellerDahil ? "elle-tam" : "elle", Date.now());
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return blob.size;
}

export function boyutYaz(bayt: number): string {
  if (bayt < 1024) return `${bayt} B`;
  if (bayt < 1024 * 1024) return `${(bayt / 1024).toFixed(0)} KB`;
  return `${(bayt / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

// Menu warning: red when the latest nightly backup failed or the last good one is over 2 days old.
export function yedekUyarisi(
  durum: { sonOtomatik?: YedekSonucu; sonBasariliOtomatik?: number } | null,
  simdi: number
): { metin: string; kirmizi: boolean } {
  const zaman = (ms: number) =>
    new Date(ms).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  if (!durum?.sonBasariliOtomatik) {
    return { metin: durum?.sonOtomatik ? "Son otomatik yedek başarısız" : "Henüz otomatik yedek yok", kirmizi: true };
  }
  if (durum.sonOtomatik && !durum.sonOtomatik.basarili) {
    return { metin: `Son otomatik yedek başarısız (${zaman(durum.sonOtomatik.zaman)})`, kirmizi: true };
  }
  const eski = simdi - durum.sonBasariliOtomatik > 2 * 864e5;
  return { metin: `Son otomatik yedek: ${zaman(durum.sonBasariliOtomatik)}`, kirmizi: eski };
}
