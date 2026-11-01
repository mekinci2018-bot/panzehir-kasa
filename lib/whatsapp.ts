import { formatTL } from "./format";
import type { SiparisHesap } from "./siparis";
import type { Siparis } from "./types";

// Converts a free-typed Turkish phone number ("0532 123 45 67", "532 123 45 67"...) into the
// digits-only international form wa.me needs ("905321234567"). Returns null when it doesn't look
// like a usable number at all.
export function waTelefon(ham?: string): string | null {
  if (!ham) return null;
  const rakam = ham.replace(/\D/g, "");
  if (rakam.length === 10 && rakam.startsWith("5")) return "90" + rakam; // 5XXXXXXXXX
  if (rakam.length === 11 && rakam.startsWith("0")) return "90" + rakam.slice(1); // 0 5XXXXXXXXX
  if (rakam.length === 12 && rakam.startsWith("90")) return rakam; // 90 5XXXXXXXXX
  if (rakam.length === 13 && rakam.startsWith("090")) return "90" + rakam.slice(3); // 0 90 5XXXXXXXXX (yanlış girilmiş)
  return rakam.length >= 10 ? rakam : null;
}

// Hazır mesaj, sipariş durumuna göre değişir; gönderilmeden önce düzenlenebilir.
export function siparisWaMesaji(s: Siparis, h: SiparisHesap): string {
  const urun = s.urun || "siparişiniz";
  if (s.uretim === "bitti") {
    return h.kalan > 0.005
      ? `Merhaba, ${urun} hazır, teslim almanızı bekliyoruz. Kalan tutar: ${formatTL(h.kalan)}.`
      : `Merhaba, ${urun} hazır, teslim almanızı bekliyoruz.`;
  }
  if (s.uretim === "teslim" && h.kalan > 0.005) {
    return `Merhaba, ${urun} siparişinizin kalan ödemesi ${formatTL(h.kalan)}. Uygun olduğunuzda tamamlayabilir misiniz? İyi günler dileriz.`;
  }
  return `Merhaba, ${urun} siparişinizle ilgili yazıyorum.`;
}
