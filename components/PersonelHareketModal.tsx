"use client";

import { useState } from "react";
import { addPersonelHareketi, updatePersonelHareketi } from "@/lib/db";
import { HAREKET_LABEL, donemEtiketi } from "@/lib/personel";
import { formatTL, todayISO, tutarOku } from "@/lib/format";
import TarihAlani from "./TarihAlani";
import type { Calisan, PersonelHareketi, PersonelHareketTuru } from "@/lib/types";

// Mesai / Ek / Kesinti ekleme ve her hareketin (otomatik hak ediş dahil) düzenlenmesi.
// Mesaide tutar saat × saatlik ücretten gelir, istenirse elle değiştirilebilir.
export default function PersonelHareketModal({
  calisan,
  tur,
  hareket,
  onClose,
}: {
  calisan: Calisan;
  tur: PersonelHareketTuru;
  hareket?: PersonelHareketi; // varsa düzenleme
  onClose: () => void;
}) {
  const saatUcreti = calisan.mesaiSaatUcreti ?? 0;
  const [tarih, setTarih] = useState(hareket?.tarih ?? todayISO());
  const [saat, setSaat] = useState(hareket?.saat ? String(hareket.saat) : "");
  const [tutar, setTutar] = useState(hareket ? String(hareket.tutar) : "");
  const [aciklama, setAciklama] = useState(hareket?.aciklama ?? "");
  const [elleTutar, setElleTutar] = useState(!!hareket && !hareket.saat);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  // Mesaide saat girildiyse tutar hesaplanır; kullanıcı tutara dokunursa onun değeri geçerli olur.
  const saatSayi = Number(saat.replace(",", ".")) || 0;
  const hesaplanan = tur === "mesai" && !elleTutar && saatSayi > 0 ? saatSayi * saatUcreti : null;
  const sonTutar = hesaplanan ?? tutarOku(tutar);
  const gecerli = sonTutar > 0 && !!tarih;

  async function kaydet() {
    if (!gecerli || kaydediliyor) return;
    setKaydediliyor(true);
    try {
      if (hareket) {
        await updatePersonelHareketi(hareket.id, {
          tarih,
          tutar: sonTutar,
          aciklama: aciklama.trim(),
          saat: tur === "mesai" && !elleTutar ? saatSayi : undefined,
        });
      } else {
        await addPersonelHareketi({
          personelId: calisan.id,
          tur,
          tarih,
          tutar: sonTutar,
          aciklama: aciklama.trim(),
          saat: tur === "mesai" && !elleTutar ? saatSayi : undefined,
        });
      }
      onClose();
    } catch (err) {
      console.error(err);
      alert("Kaydedilemedi, lütfen tekrar deneyin.");
      setKaydediliyor(false);
    }
  }

  const baslik = hareket ? `${HAREKET_LABEL[tur]} · düzenle` : HAREKET_LABEL[tur];

  return (
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card w-full max-w-md p-6 flex flex-col gap-4">
        <div>
          <h3 className="font-semibold text-base">{baslik}</h3>
          <p className="text-sm text-[var(--muted)]">{calisan.adSoyad}</p>
          {hareket?.donem && (
            <p className="text-[11px] text-[var(--muted)] mt-1">Otomatik hak ediş · {donemEtiketi(hareket.donem)}</p>
          )}
        </div>

        <TarihAlani value={tarih} onChange={setTarih} />

        {tur === "mesai" && (
          <div>
            <label className="field-label">Mesai saati</label>
            <input
              className="input-field num"
              autoFocus
              value={saat}
              onChange={(e) => {
                setSaat(e.target.value);
                setElleTutar(false);
              }}
              placeholder="0"
            />
            <p className="text-[11px] text-[var(--muted)] mt-1">
              {saatUcreti > 0
                ? `Saatlik ücret ${formatTL(saatUcreti)} · tutar ${formatTL(saatSayi * saatUcreti)}`
                : "Personel kartında saatlik mesai ücreti girilmemiş; tutarı elle yazabilirsin."}
            </p>
          </div>
        )}

        <div>
          <label className="field-label">Tutar{hesaplanan !== null ? " (saatten hesaplandı)" : ""}</label>
          <input
            className="input-field num text-lg"
            autoFocus={tur !== "mesai"}
            value={hesaplanan !== null ? String(hesaplanan) : tutar}
            onChange={(e) => {
              setElleTutar(true);
              setTutar(e.target.value);
            }}
            onKeyDown={(e) => e.key === "Enter" && kaydet()}
            placeholder="0,00"
          />
          {tur === "kesinti" && <p className="text-[11px] text-[var(--muted)] mt-1">Kesinti, personelin kalan alacağını azaltır.</p>}
        </div>

        <div>
          <label className="field-label">Açıklama</label>
          <input
            className="input-field"
            value={aciklama}
            onChange={(e) => setAciklama(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && kaydet()}
            placeholder={tur === "ek" ? "Örn. bayram primi" : tur === "kesinti" ? "Örn. avans kesintisi" : "İsteğe bağlı"}
          />
        </div>

        <div className="flex gap-2 justify-end">
          <button className="btn-secondary" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn-primary" onClick={kaydet} disabled={!gecerli || kaydediliyor}>
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}
