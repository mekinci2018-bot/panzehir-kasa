"use client";

import { useEffect, useRef } from "react";
import { useCalisanlar, usePersonelHareketleri } from "@/lib/hooks";
import { hakEdisYaz } from "@/lib/db";
import { donemHakEdisGunu, eksikDonemler, maasTuru } from "@/lib/personel";
import { todayISO } from "@/lib/format";
import { bildir } from "./Bildirim";

// Otomatik maaş hak edişi **dönem sonunda** yazılır: haftalık personele Cumartesi, aylık personele
// ayın son günü. Süren dönemin maaşı yazılmaz (kalan erken şişmesin). Uygulama açıldığında bitmiş
// ama yazılmamış dönemler tamamlanır.
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
      let kisi = 0;
      let donem = 0;
      for (const c of calisanlar) {
        const donemler = eksikDonemler(c, hareketler, bugun);
        if (donemler.length === 0) continue;
        try {
          await hakEdisYaz(
            c.id,
            donemler.map((d) => ({ donem: d, tarih: donemHakEdisGunu(d), tutar: c.maasTutari! }))
          );
          kisi += 1;
          donem += donemler.length;
          console.info(`Hak ediş işlendi: ${c.adSoyad} · ${maasTuru(c)} · ${donemler.length} dönem`);
        } catch (err) {
          // Çalışmazsa sessizce geçilir: Personel sayfası eksik dönemi gösterir, elle de eklenebilir.
          console.error("Hak ediş yazılamadı", c.adSoyad, err);
        }
      }
      // Sessizce yazmak yerine söylüyor: maaş borcu kendiliğinden arttığında nedeni görünsün.
      if (donem > 0) bildir(`Maaş hak edişi işlendi · ${kisi} personel · ${donem} dönem`);
    })();
  }, [calisanlar, hareketler, calisanlarLoading, hareketlerLoading]);

  return null;
}
