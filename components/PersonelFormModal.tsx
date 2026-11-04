"use client";

import { useState } from "react";
import { addCalisan, updateCalisan } from "@/lib/db";
import { MAAS_TURU_LABEL, maasTuru } from "@/lib/personel";
import { tutarOku, todayISO } from "@/lib/format";
import type { Calisan, MaasTuru } from "@/lib/types";

// Personel kartı: yalnızca maaş carisi için gereken alanlar. Kişisel veriler (TC, telefon, adres,
// acil durum kişisi, not) Aşama 4'te kaldırıldı ve veritabanından da silindi.
export default function PersonelFormModal({
  calisan,
  onClose,
}: {
  calisan?: Calisan; // yoksa yeni kayıt
  onClose: () => void;
}) {
  const [adSoyad, setAdSoyad] = useState(calisan?.adSoyad ?? "");
  const [tur, setTur] = useState<MaasTuru>(calisan ? maasTuru(calisan) : "aylik");
  const [maasTutari, setMaasTutari] = useState(calisan?.maasTutari ? String(calisan.maasTutari) : "");
  const [mesaiUcreti, setMesaiUcreti] = useState(calisan?.mesaiSaatUcreti ? String(calisan.mesaiSaatUcreti) : "");
  const [devreden, setDevreden] = useState(calisan?.devredenAlacak ? String(calisan.devredenAlacak) : "");
  const [devredenTarihi, setDevredenTarihi] = useState(calisan?.devredenTarihi ?? "");
  const [pasif, setPasif] = useState(!!calisan?.pasif);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  const devredenTutar = tutarOku(devreden);

  async function kaydet() {
    if (!adSoyad.trim() || kaydediliyor) return;
    setKaydediliyor(true);
    const veri = {
      adSoyad: adSoyad.replace(/\s+/g, " ").trim(),
      maasTuru: tur,
      maasTutari: tutarOku(maasTutari),
      mesaiSaatUcreti: tutarOku(mesaiUcreti),
      devredenAlacak: devredenTutar,
      // Devreden tutar girilmişse tarihi de olsun: otomatik hak ediş bu tarihten sonra başlar.
      devredenTarihi: devredenTutar ? devredenTarihi || todayISO() : "",
      pasif,
    };
    try {
      if (calisan) await updateCalisan(calisan.id, veri);
      else await addCalisan(veri);
      onClose();
    } catch (err) {
      console.error(err);
      alert("Personel kaydedilemedi, lütfen tekrar deneyin.");
      setKaydediliyor(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card w-full max-w-lg p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        <h3 className="font-semibold text-base">{calisan ? "Personeli düzenle" : "Yeni personel"}</h3>

        <div>
          <label className="field-label">Ad Soyad</label>
          <input className="input-field" autoFocus value={adSoyad} onChange={(e) => setAdSoyad(e.target.value)} placeholder="Ad Soyad" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label">Maaş türü</label>
            <select className="select-field select-field-md w-full" value={tur} onChange={(e) => setTur(e.target.value as MaasTuru)}>
              {(Object.keys(MAAS_TURU_LABEL) as MaasTuru[]).map((t) => (
                <option key={t} value={t}>
                  {MAAS_TURU_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Maaş tutarı ({tur === "haftalik" ? "haftalık" : "aylık"})</label>
            <input className="input-field num" value={maasTutari} onChange={(e) => setMaasTutari(e.target.value)} placeholder="0,00" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label">Saatlik mesai ücreti</label>
            <input className="input-field num" value={mesaiUcreti} onChange={(e) => setMesaiUcreti(e.target.value)} placeholder="0,00" />
          </div>
          <div>
            <label className="field-label">Geçmişten devreden alacak</label>
            <input className="input-field num" value={devreden} onChange={(e) => setDevreden(e.target.value)} placeholder="0,00" />
          </div>
        </div>

        <div>
          <label className="field-label">Devreden alacağın tarihi</label>
          <input
            type="date"
            className="input-field"
            value={devredenTarihi}
            onChange={(e) => setDevredenTarihi(e.target.value)}
            disabled={!devredenTutar}
          />
          <p className="text-[11px] text-[var(--muted)] mt-1">
            {devredenTutar
              ? "Otomatik maaş hak edişi bu tarihten sonraki dönemler için işlenir; bu tarih ve öncesi devreden tutara dahil sayılır."
              : "Devreden alacak girilmediyse tarih gerekmez. Otomatik hak ediş bu durumda bulunduğumuz dönemden başlar."}
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={pasif} onChange={(e) => setPasif(e.target.checked)} />
          Pasif (işten ayrıldı — otomatik hak ediş işlenmez, Personel toplamına girmez; geçmişi görünmeye devam eder)
        </label>

        <div className="flex gap-2 justify-end mt-1">
          <button className="btn-secondary" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn-primary" onClick={kaydet} disabled={!adSoyad.trim() || kaydediliyor}>
            Kaydet
          </button>
        </div>
      </div>
    </div>
  );
}
