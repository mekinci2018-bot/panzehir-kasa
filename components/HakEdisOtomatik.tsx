"use client";

import { useEffect, useRef } from "react";
import { useCalisanlar, usePersonelHareketleri } from "@/lib/hooks";
import { hakEdisYaz } from "@/lib/db";
import { donemBasi, eksikDonemler, maasTuru } from "@/lib/personel";
import { todayISO } from "@/lib/format";

// Otomatik maaş hak edişi: haftalık personele her Pazartesi, aylık personele her ayın 1'inde maaş
// tutarı hak ediş olarak yazılır. Uygulama açıldığında eksik dönemler tamamlanır.
//
// Belge kimliği `${personelId}_${donem}` olduğu için aynı dönem ikinci kez yazılamaz (iki cihaz aynı
// anda açılsa da tek satır oluşur). Bu bileşen hiçbir şey çizmez; layout'ta duruyor, bu yüzden
// hangi sayfadan girilirse girilsin bir kez çalışır.
export default function HakEdisOtomatik() {
  const { calisanlar, loading: calisanlarLoading } = useCalisanlar();
  const { hareketler, loading: hareketlerLoading } = usePersonelHareketleri();
  const calisti = useRef(false);

  useEffect(() => {
    if (calisti.current || calisanlarLoading || hareketlerLoading) return;
    if (calisanlar.length === 0) return;
    calisti.current = true;

    const bugun = todayISO();
    (async () => {
      for (const c of calisanlar) {
        const donemler = eksikDonemler(c, hareketler, bugun);
        if (donemler.length === 0) continue;
        try {
          await hakEdisYaz(
            c.id,
            donemler.map((donem) => ({ donem, tarih: donemBasi(donem), tutar: c.maasTutari! }))
          );
          console.info(`Hak ediş işlendi: ${c.adSoyad} · ${maasTuru(c)} · ${donemler.length} dönem`);
        } catch (err) {
          // Çalışmazsa sessizce geçilir: Personel sayfası eksik dönemi gösterir, elle de eklenebilir.
          console.error("Hak ediş yazılamadı", c.adSoyad, err);
        }
      }
    })();
  }, [calisanlar, hareketler, calisanlarLoading, hareketlerLoading]);

  return null;
}
