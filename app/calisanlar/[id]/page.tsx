"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Clock, Pencil, Plus, Trash2, Wallet, Minus } from "lucide-react";
import { useBankaHesaplari, useCalisanlar, useKasaKayitlari, usePersonelHareketleri } from "@/lib/hooks";
import { deletePersonelHareketi, personelOdemeYap } from "@/lib/db";
import { MAAS_TURU_LABEL, maasTuru, personelEkstresi, personelOzeti, type PersonelSatiri } from "@/lib/personel";
import { formatDate, formatTL, todayISO } from "@/lib/format";
import type { PersonelHareketTuru } from "@/lib/types";
import YukleniyorSatiri from "@/components/YukleniyorSatiri";
import SatirMenu from "@/components/SatirMenu";
import AmountModal from "@/components/AmountModal";
import PersonelFormModal from "@/components/PersonelFormModal";
import PersonelHareketModal from "@/components/PersonelHareketModal";
import { YazdirButonu, YazdirmaBasligi } from "@/components/Yazdir";

export default function PersonelEkstrePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { calisanlar, loading } = useCalisanlar();
  const { hareketler } = usePersonelHareketleri();
  const { kayitlar } = useKasaKayitlari();
  const { hesaplar } = useBankaHesaplari();
  const [bas, setBas] = useState("");
  const [son, setSon] = useState("");
  const [odemeAcik, setOdemeAcik] = useState(false);
  const [duzenleAcik, setDuzenleAcik] = useState(false);
  const [yeniHareket, setYeniHareket] = useState<PersonelHareketTuru | null>(null);
  const [duzenlenenId, setDuzenlenenId] = useState<string | null>(null);

  const calisan = calisanlar.find((c) => c.id === id);

  const tumSatirlar = useMemo(
    () => (calisan ? personelEkstresi(calisan, hareketler, kayitlar) : []),
    [calisan, hareketler, kayitlar]
  );
  const ozet = useMemo(
    () => (calisan ? personelOzeti(calisan, hareketler, kayitlar) : null),
    [calisan, hareketler, kayitlar]
  );

  // Tarih aralığı yalnızca görünümü süzer; bakiye yine en baştan yürür, böylece aralığın başındaki
  // devir doğru kalır.
  const gorunen = useMemo(
    () => tumSatirlar.filter((s) => (!bas || s.tarih >= bas) && (!son || s.tarih <= son)),
    [tumSatirlar, bas, son]
  );
  const aralikDevri = useMemo(() => {
    if (!bas) return 0;
    const once = tumSatirlar.filter((s) => s.tarih < bas);
    return once.length > 0 ? once[once.length - 1].bakiye : 0;
  }, [tumSatirlar, bas]);

  const duzenlenen = duzenlenenId ? hareketler.find((h) => h.id === duzenlenenId) : undefined;

  if (loading && !calisan) {
    return (
      <div className="card">
        <YukleniyorSatiri />
      </div>
    );
  }
  if (!calisan || !ozet) {
    return (
      <div className="card px-5 py-8 text-sm text-center text-[var(--muted)]">
        Personel bulunamadı.{" "}
        <Link href="/calisanlar" className="text-[var(--brand)] hover:underline">
          Personel listesine dön
        </Link>
      </div>
    );
  }

  const tur = maasTuru(calisan);
  const donem = bas || son ? `${bas ? formatDate(bas) : "baştan"} – ${son ? formatDate(son) : "bugüne"}` : "Tüm hareketler";

  async function hareketSil(satir: PersonelSatiri) {
    if (!satir.hareket) return;
    if (!window.confirm("Bu satır silinsin mi?")) return;
    try {
      await deletePersonelHareketi(satir.hareket.id);
    } catch (err) {
      console.error(err);
      alert("Silinemedi, lütfen tekrar deneyin.");
    }
  }

  return (
    <div className="page-enter flex flex-col gap-5">
      <YazdirmaBasligi baslik="Personel Maaş Ekstresi" altBaslik={calisan.adSoyad} donem={donem} />

      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div className="flex flex-col gap-1">
          <Link
            href="/calisanlar"
            className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] inline-flex items-center gap-1 w-fit"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Personel
          </Link>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">{calisan.adSoyad}</h1>
          <p className="text-sm text-[var(--muted)]">
            {MAAS_TURU_LABEL[tur]} maaş · {calisan.maasTutari ? formatTL(calisan.maasTutari) : "tutar girilmemiş"}
            {calisan.mesaiSaatUcreti ? ` · mesai ${formatTL(calisan.mesaiSaatUcreti)}/saat` : ""}
            {calisan.pasif ? " · pasif" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary inline-flex items-center gap-1.5" onClick={() => setOdemeAcik(true)}>
            <Wallet className="w-4 h-4" /> Ödeme Yap
          </button>
          <button className="btn-secondary inline-flex items-center gap-1.5" onClick={() => setYeniHareket("mesai")}>
            <Clock className="w-4 h-4" /> Mesai
          </button>
          <button className="btn-secondary inline-flex items-center gap-1.5" onClick={() => setYeniHareket("ek")}>
            <Plus className="w-4 h-4" /> Ek
          </button>
          <button className="btn-secondary inline-flex items-center gap-1.5" onClick={() => setYeniHareket("kesinti")}>
            <Minus className="w-4 h-4" /> Kesinti
          </button>
          <button className="btn-secondary inline-flex items-center gap-1.5" onClick={() => setDuzenleAcik(true)}>
            <Pencil className="w-4 h-4" /> Kart
          </button>
          <YazdirButonu dosyaAdi={`Personel Ekstresi - ${calisan.adSoyad}`} />
        </div>
      </div>

      <div className="card overflow-hidden grid grid-cols-2 md:grid-cols-4 gap-px !bg-[var(--border)]">
        {[
          { ad: "Devreden", tutar: calisan.devredenAlacak ?? 0, alt: calisan.devredenTarihi ? formatDate(calisan.devredenTarihi) : "—" },
          { ad: "Toplam hak ediş", tutar: ozet.hakedis, alt: "Devreden + maaş + mesai + ek" },
          { ad: "Toplam ödenen", tutar: ozet.odenen, alt: "Ödemeler + kesintiler" },
        ].map((x) => (
          <div key={x.ad} className="px-5 py-4 bg-[var(--surface)]">
            <div className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-[var(--muted)]">{x.ad}</div>
            <div className="tabular text-[17px] font-semibold mt-1">{formatTL(x.tutar)}</div>
            <div className="text-[11px] text-[var(--muted-soft)] mt-0.5">{x.alt}</div>
          </div>
        ))}
        <div className={`px-5 py-4 ${ozet.kalan > 0.005 ? "bg-[var(--accent-orange-soft)]" : "bg-[var(--accent-green-soft)]"}`}>
          <div
            className={`text-[10.5px] font-semibold uppercase tracking-[0.1em] ${
              ozet.kalan > 0.005 ? "text-[var(--accent-orange)]" : "text-[var(--accent-green)]"
            }`}
          >
            Kalan
          </div>
          <div
            className={`tabular text-[22px] font-semibold mt-0.5 ${
              ozet.kalan > 0.005 ? "text-[var(--accent-orange)]" : "text-[var(--accent-green)]"
            }`}
          >
            {formatTL(ozet.kalan)}
          </div>
          <div className="text-[11px] text-[var(--muted)] mt-0.5">
            {ozet.kalan > 0.005 ? "Personele borç" : ozet.kalan < -0.005 ? "Personelden alacak" : "Hesap kapalı"}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div>
          <label className="field-label">Başlangıç</label>
          <input type="date" className="input-field" value={bas} max={son || todayISO()} onChange={(e) => setBas(e.target.value)} />
        </div>
        <div>
          <label className="field-label">Bitiş</label>
          <input type="date" className="input-field" value={son} min={bas} onChange={(e) => setSon(e.target.value)} />
        </div>
        {(bas || son) && (
          <button
            className="btn-secondary !py-1.5 !px-3 !text-xs"
            onClick={() => {
              setBas("");
              setSon("");
            }}
          >
            Aralığı temizle
          </button>
        )}
      </div>

      <div className="card overflow-hidden print:border-0">
        <div className="table-scroll">
          <table className="rapor-tablo">
            <thead>
              <tr>
                <th className="w-[110px]">Tarih</th>
                <th>Açıklama</th>
                <th className="sag w-[130px]">Hak ediş</th>
                <th className="sag w-[130px]">Ödeme</th>
                <th className="sag w-[140px]">Bakiye</th>
                <th className="w-[44px] print:hidden"></th>
              </tr>
            </thead>
            <tbody>
              {bas && (
                <tr>
                  <td className="tabular text-[var(--muted)]">{formatDate(bas)}</td>
                  <td className="text-[var(--muted)]">Aralık başı devir</td>
                  <td className="sag">—</td>
                  <td className="sag">—</td>
                  <td className="sag tabular text-[var(--muted)]">{formatTL(aralikDevri)}</td>
                  <td className="print:hidden" />
                </tr>
              )}
              {gorunen.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-[var(--muted)] py-6">
                    Bu aralıkta hareket yok.
                  </td>
                </tr>
              ) : (
                gorunen.map((s) => (
                  <tr key={s.key}>
                    <td className="tabular">{s.tarih === "0000-00-00" ? "—" : formatDate(s.tarih)}</td>
                    <td>{s.aciklama}</td>
                    <td className="sag">{s.hakedis ? formatTL(s.hakedis) : "—"}</td>
                    <td className={`sag ${s.odeme ? "text-[var(--accent-green)]" : ""}`}>{s.odeme ? formatTL(s.odeme) : "—"}</td>
                    <td className="sag tabular font-medium">{formatTL(s.bakiye)}</td>
                    <td className="print:hidden">
                      {s.hareket && (
                        <SatirMenu
                          ogeler={[
                            { label: "Düzenle", icon: Pencil, onClick: () => setDuzenlenenId(s.hareket!.id) },
                            { label: "Sil", icon: Trash2, onClick: () => hareketSil(s), tehlikeli: true },
                          ]}
                        />
                      )}
                    </td>
                  </tr>
                ))
              )}
              <tr className="toplam">
                <td colSpan={2}>Toplam · {gorunen.length} satır</td>
                <td className="sag">{formatTL(gorunen.reduce((t, s) => t + s.hakedis, 0))}</td>
                <td className="sag">{formatTL(gorunen.reduce((t, s) => t + s.odeme, 0))}</td>
                <td className="sag">{formatTL(ozet.kalan)}</td>
                <td className="print:hidden" />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-[var(--muted-soft)] print:hidden">
        Ödemeler Kasa&apos;ya personel seçilerek yazılan Çıkış kayıtlarından gelir; Kasa sayfasından girilen personel
        çıkışları da bu ekstrede görünür.
      </p>

      {odemeAcik && (
        <AmountModal
          title={`Ödeme Yap — ${calisan.adSoyad}`}
          kalan={Math.max(0, ozet.kalan)}
          hesaplar={hesaplar}
          defaultSecim={{ odemeSekli: "nakit", bankaHesapId: "", kartAciklama: "" }}
          onayEtiketi="Ödemeyi kaydet"
          onClose={() => setOdemeAcik(false)}
          onConfirm={async (tutar, secim, tarih) => {
            try {
              await personelOdemeYap(calisan, { tutar, tarih, ...secim });
              setOdemeAcik(false);
            } catch (err) {
              console.error(err);
              alert("Ödeme kaydedilemedi, lütfen tekrar deneyin.");
            }
          }}
        />
      )}

      {yeniHareket && (
        <PersonelHareketModal calisan={calisan} tur={yeniHareket} onClose={() => setYeniHareket(null)} />
      )}

      {duzenlenen && (
        <PersonelHareketModal
          calisan={calisan}
          tur={duzenlenen.tur}
          hareket={duzenlenen}
          onClose={() => setDuzenlenenId(null)}
        />
      )}

      {duzenleAcik && <PersonelFormModal calisan={calisan} onClose={() => setDuzenleAcik(false)} />}
    </div>
  );
}
