"use client";

import { useMemo, useState } from "react";
import { kayitSil, komisyonKalemiBulVeyaOlustur, mahsupGuncelle, mahsupKaydet, KOMISYON_KALEMI } from "@/lib/db";
import { useBankaHesaplari, useCalisanlar, useFirmalar, useKasaKayitlari, kartOnerileri } from "@/lib/hooks";
import { FIRMA_TURU_LABEL, firmaTuru } from "@/lib/firma";
import { sayilan } from "@/lib/kayit";
import { formatTL, todayISO, tutarOku } from "@/lib/format";
import FirmaSecici, { type FirmaSecimi } from "./FirmaSecici";
import OdemeSekliSelect, { type OdemeSecimi } from "./OdemeSekliSelect";
import TarihAlani from "./TarihAlani";
import type { KasaKaydi } from "@/lib/types";

// Mahsup (aracılı ödeme): müşterinin kartı tedarikçinin POS'undan çekilir ya da müşteri parayı
// doğrudan tedarikçiye gönderir. Para kasaya hiç girmez; iki cari birden kapanır.
export default function MahsupModal({
  kayit,
  komisyonId,
  baslangic,
  onClose,
}: {
  kayit?: KasaKaydi; // varsa düzenleme
  komisyonId?: string | null; // düzenlemede bağlı komisyon belgesi
  baslangic?: { odeyen?: FirmaSecimi; alan?: FirmaSecimi }; // satırdan başlatılınca önceden seçili taraf
  onClose: () => void;
}) {
  const { firmalar } = useFirmalar();
  const { calisanlar } = useCalisanlar();
  const { hesaplar } = useBankaHesaplari();
  const { kayitlar } = useKasaKayitlari();

  const bos: FirmaSecimi = { firmaId: "", personelId: "", firma: "" };
  const [odeyen, setOdeyen] = useState<FirmaSecimi>(
    kayit
      ? { firmaId: kayit.firmaId ?? "", personelId: kayit.personelId ?? "", firma: kayit.firma }
      : (baslangic?.odeyen ?? bos)
  );
  const [alan, setAlan] = useState<FirmaSecimi>(
    kayit
      ? { firmaId: kayit.karsiFirmaId ?? "", personelId: kayit.karsiPersonelId ?? "", firma: kayit.karsiFirma ?? "" }
      : (baslangic?.alan ?? bos)
  );
  const [tarih, setTarih] = useState(kayit?.tarih ?? todayISO());
  const [tutar, setTutar] = useState(kayit ? String(kayit.toplamTutar) : "");
  const [sayilanMetin, setSayilanMetin] = useState(kayit ? String(sayilan(kayit)) : "");
  const [elleSayilan, setElleSayilan] = useState(!!kayit && sayilan(kayit) !== kayit.toplamTutar);
  const [secim, setSecim] = useState<OdemeSecimi>({
    odemeSekli: kayit?.odemeSekli ?? "kart",
    bankaHesapId: kayit?.bankaHesapId ?? "",
    kartAciklama: kayit?.kartAciklama ?? "",
  });
  const [aciklama, setAciklama] = useState(kayit?.aciklama ?? "");
  const [kaydediliyor, setKaydediliyor] = useState(false);

  const oneriler = useMemo(() => kartOnerileri(kayitlar), [kayitlar]);
  const cekilen = tutarOku(tutar);
  const sayilanTutar = elleSayilan ? tutarOku(sayilanMetin) : cekilen;
  const fark = cekilen - sayilanTutar;

  const alanFirma = alan.firmaId ? firmalar.find((f) => f.id === alan.firmaId) : undefined;
  const alanTuru = alan.personelId ? "personel" : alanFirma ? firmaTuru(alanFirma) : undefined;
  const ayniTaraf =
    (!!odeyen.firmaId && odeyen.firmaId === alan.firmaId) ||
    (!!odeyen.personelId && odeyen.personelId === alan.personelId);
  const gecerli =
    cekilen > 0 &&
    sayilanTutar > 0 &&
    sayilanTutar <= cekilen &&
    !!tarih &&
    !!(odeyen.firmaId || odeyen.personelId) &&
    !!(alan.firmaId || alan.personelId) &&
    !ayniTaraf;

  async function kaydet() {
    if (!gecerli || kaydediliyor) return;
    setKaydediliyor(true);
    try {
      // Komisyon kalemi yalnızca fark varsa gerekir; yoksa oluşturulur.
      const komisyonKalemi = fark > 0.005 ? await komisyonKalemiBulVeyaOlustur(firmalar) : null;
      const girdi = {
        tarih,
        odeyen: { firmaId: odeyen.firmaId || undefined, personelId: odeyen.personelId || undefined, ad: odeyen.firma },
        alan: {
          firmaId: alan.firmaId || undefined,
          personelId: alan.personelId || undefined,
          ad: alan.firma,
          tur: (alanTuru ?? "tedarikci") as "musteri" | "tedarikci" | "gider" | "personel",
        },
        tutar: cekilen,
        sayilanTutar,
        odemeSekli: secim.odemeSekli,
        bankaHesapId: secim.bankaHesapId || undefined,
        kartAciklama: secim.kartAciklama || undefined,
        aciklama,
      };
      if (kayit) await mahsupGuncelle(kayit.id, girdi, komisyonId ?? null, komisyonKalemi);
      else await mahsupKaydet(girdi, komisyonKalemi);
      onClose();
    } catch (err) {
      console.error(err);
      alert("Mahsup kaydedilemedi, lütfen tekrar deneyin.");
      setKaydediliyor(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card w-full max-w-lg p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        <div>
          <h3 className="font-semibold text-base">{kayit ? "Mahsubu düzenle" : "Mahsup (aracılı ödeme)"}</h3>
          <p className="text-sm text-[var(--muted)]">
            Müşteri parayı doğrudan tedarikçiye öder (kart POS&apos;tan çekilir ya da havale eder). Para kasaya hiç
            girmez: iki tarafın bakiyesi kapanır, Nakit / Banka / Kart ve Toplam Kasa değişmez.
          </p>
        </div>

        <TarihAlani value={tarih} onChange={setTarih} />

        <div>
          <label className="field-label">Ödeyen (müşteri)</label>
          <FirmaSecici
            value={odeyen}
            firmalar={firmalar}
            calisanlar={calisanlar}
            onChange={setOdeyen}
            className="input-field"
            placeholder="Ödeyen firma"
            autoFocus={!baslangic?.odeyen}
          />
        </div>

        <div>
          <label className="field-label">Alan (tedarikçi / personel / gider kalemi)</label>
          <FirmaSecici
            value={alan}
            firmalar={firmalar}
            calisanlar={calisanlar}
            onChange={setAlan}
            className="input-field"
            placeholder="Parayı alan taraf"
            autoFocus={!!baslangic?.odeyen}
          />
          {alanTuru && (
            <p className="text-[11px] text-[var(--muted)] mt-1">
              {alanTuru === "personel" ? "Personel" : FIRMA_TURU_LABEL[alanTuru]}
              {alanTuru === "personel"
                ? " · sayılan tutar personel ekstresine ödeme olarak düşer"
                : alanTuru === "gider"
                  ? " · sayılan tutar Harcama toplamına girer"
                  : " · sayılan tutar bu firmaya olan borcumuzdan düşer"}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="field-label">Çekilen tutar</label>
            <input
              className="input-field num text-lg"
              value={tutar}
              onChange={(e) => setTutar(e.target.value)}
              placeholder="0,00"
            />
          </div>
          <div>
            <label className="field-label">Karşı tarafa sayılan</label>
            <input
              className="input-field num text-lg"
              value={elleSayilan ? sayilanMetin : tutar}
              onChange={(e) => {
                setElleSayilan(true);
                setSayilanMetin(e.target.value);
              }}
              placeholder="0,00"
            />
          </div>
        </div>

        <div>
          <label className="field-label">Ödeme şekli (bilgi olarak)</label>
          <OdemeSekliSelect value={secim} hesaplar={hesaplar} kartOnerileri={oneriler} onChange={setSecim} size="md" />
          <p className="text-[11px] text-[var(--muted)] mt-1">
            &quot;Nereden çekildi&quot; yalnızca bilgi olarak saklanır; kasa hesaplarına işlemez.
          </p>
        </div>

        <div>
          <label className="field-label">Açıklama</label>
          <input
            className="input-field"
            value={aciklama}
            onChange={(e) => setAciklama(e.target.value)}
            placeholder="İsteğe bağlı"
          />
        </div>

        {cekilen > 0 && (
          <div className="rounded-lg bg-[var(--surface-hover)] border border-[var(--border)] px-4 py-3 text-[12.5px] flex flex-col gap-1">
            <div className="flex justify-between gap-3">
              <span className="text-[var(--muted)]">{odeyen.firma || "Ödeyen"} bakiyesinden düşecek</span>
              <span className="tabular font-medium">{formatTL(cekilen)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-[var(--muted)]">{alan.firma || "Alan"} tarafına sayılacak</span>
              <span className="tabular font-medium">{formatTL(sayilanTutar)}</span>
            </div>
            {fark > 0.005 && (
              <div className="flex justify-between gap-3 pt-1 border-t border-[var(--border)]">
                <span className="text-[var(--accent-orange)]">
                  Fark · {KOMISYON_KALEMI} kalemine bağlı gider belgesi yazılır
                </span>
                <span className="tabular font-medium text-[var(--accent-orange)]">{formatTL(fark)}</span>
              </div>
            )}
            {fark < -0.005 && (
              <div className="pt-1 border-t border-[var(--border)] text-[var(--brand)] font-medium">
                Sayılan tutar çekilen tutardan büyük olamaz.
              </div>
            )}
          </div>
        )}

        {ayniTaraf && <p className="text-[12px] text-[var(--brand)] font-medium">Ödeyen ve alan aynı taraf olamaz.</p>}

        <div className="flex gap-2 justify-end items-center">
          {kayit && (
            <button
              className="text-[13px] text-[var(--brand)] font-medium hover:underline mr-auto"
              onClick={async () => {
                const ek = komisyonId ? " Bağlı komisyon gideri de birlikte kalkar." : "";
                if (!window.confirm(`Bu mahsup Çöp Kutusu'na gönderilsin mi? İki tarafın bakiyesi eski haline döner.${ek}`))
                  return;
                try {
                  await kayitSil(kayit.id, komisyonId ? [komisyonId] : []);
                  onClose();
                } catch (err) {
                  console.error(err);
                  alert("Silinemedi, lütfen tekrar deneyin.");
                }
              }}
            >
              Sil
            </button>
          )}
          <button className="btn-secondary" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn-primary" onClick={kaydet} disabled={!gecerli || kaydediliyor}>
            {kayit ? "Kaydet" : "Mahsubu kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}
