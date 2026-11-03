"use client";

import { useMemo, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { useFirmalar, useKasaKayitlari, useSiparisler } from "@/lib/hooks";
import { firmaGeriYukle, kayitGeriYukle, odemeSatiriGeriYukle, siparisGeriYukle } from "@/lib/db";
import type { KasaKaydi, Odeme } from "@/lib/types";
import { FIRMA_TURU_LABEL, firmaTuru } from "@/lib/firma";
import { ODEME_SEKLI_LABEL, formatDate, formatTL } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import YukleniyorSatiri from "@/components/YukleniyorSatiri";
import { SiraTh } from "@/components/SiraBasligi";
import { sirala, useSiralama, type SiraSutunlari } from "@/lib/siralama";

const SAKLAMA_GUN = 30;
const GUN_MS = 24 * 60 * 60 * 1000;

interface CopKalemi {
  id: string;
  tarih: string;
  firma: string;
  aciklama: string;
  yon?: "gelen" | "giden";
  siparis?: boolean;
  odeme: string;
  tutar: number;
  silinmeTarihi: number;
  geriYukle: () => Promise<unknown>;
}

// İşlem: Giriş → Çıkış → Sipariş.
const COP_SUTUNLARI: SiraSutunlari<CopKalemi> = {
  tarih: (k) => k.tarih,
  firma: (k) => k.firma,
  islem: (k) => (k.siparis ? 2 : k.yon === "gelen" ? 0 : 1),
  odeme: (k) => k.odeme,
  toplam: (k) => k.tutar,
  silinme: (k) => k.silinmeTarihi,
};

export default function CopKutusuPage() {
  const { kayitlar, silinenler: silinenKayitlar, loading } = useKasaKayitlari();
  const { silinenler: silinenSiparisler } = useSiparisler();
  const { silinenler: silinenFirmalar } = useFirmalar();
  const [simdi] = useState(() => Date.now());

  const firmaKalemleri = useMemo(
    () =>
      silinenFirmalar
        .filter((f) => (f.silinmeTarihi ?? 0) >= simdi - SAKLAMA_GUN * GUN_MS)
        .sort((a, b) => (b.silinmeTarihi ?? 0) - (a.silinmeTarihi ?? 0)),
    [silinenFirmalar, simdi]
  );

  // A single payment line deleted from a record that is itself still alive. It has no document of
  // its own, so it is found by scanning the live records' odemeler arrays.
  const odemeKalemleri = useMemo(() => {
    const sinir = simdi - SAKLAMA_GUN * GUN_MS;
    const list: { key: string; kayit: KasaKaydi; index: number; odeme: Odeme }[] = [];
    for (const k of kayitlar) {
      (k.odemeler ?? []).forEach((o, index) => {
        if (o.silindi && (o.silinmeTarihi ?? 0) >= sinir) list.push({ key: `${k.id}-o${index}`, kayit: k, index, odeme: o });
      });
    }
    return list.sort((a, b) => (b.odeme.silinmeTarihi ?? 0) - (a.odeme.silinmeTarihi ?? 0));
  }, [kayitlar, simdi]);

  // Older deletions stay in the database but are no longer offered for restore.
  const items = useMemo(() => {
    const sinir = simdi - SAKLAMA_GUN * GUN_MS;
    // A payment deleted together with its order is restored with the order, so it isn't listed alone.
    const siparisIleSilinen = new Set(
      silinenKayitlar
        .filter((k) => k.siparisId && silinenSiparisler.some((s) => s.id === k.siparisId && s.silinmeTarihi === k.silinmeTarihi))
        .map((k) => k.id)
    );
    const kalemler: CopKalemi[] = [
      ...silinenKayitlar
        .filter((k) => !siparisIleSilinen.has(k.id))
        .map((k) => ({
          id: k.id,
          tarih: k.tarih,
          firma: k.firma,
          aciklama: k.aciklama,
          yon: k.yon,
          odeme: [ODEME_SEKLI_LABEL[k.odemeSekli] ?? k.odemeSekli, k.kartAciklama].filter(Boolean).join(" · "),
          tutar: k.toplamTutar,
          silinmeTarihi: k.silinmeTarihi ?? 0,
          geriYukle: () => kayitGeriYukle(k.id),
        })),
      ...silinenSiparisler.map((s) => {
        const odemeIds = silinenKayitlar.filter((k) => k.siparisId === s.id && k.silinmeTarihi === s.silinmeTarihi).map((k) => k.id);
        return {
          id: s.id,
          tarih: s.tarih,
          firma: s.firmaAdi,
          aciklama: s.urun,
          siparis: true,
          odeme: odemeIds.length ? `${odemeIds.length} ödeme ile` : "",
          tutar: s.tutar,
          silinmeTarihi: s.silinmeTarihi ?? 0,
          geriYukle: () => siparisGeriYukle(s.id, odemeIds),
        };
      }),
    ];
    return kalemler.filter((k) => k.silinmeTarihi >= sinir).sort((a, b) => b.silinmeTarihi - a.silinmeTarihi);
  }, [silinenKayitlar, silinenSiparisler, simdi]);
  const { sira, sirala: siraDegistir } = useSiralama("cop-kutusu");
  const sirali = useMemo(() => sirala(items, sira, COP_SUTUNLARI), [items, sira]);

  return (
    <div className="page-enter flex flex-col gap-6">
      <PageHeader
        title="Çöp Kutusu"
        description={`Silinen kayıtlar ${SAKLAMA_GUN} gün boyunca burada durur ve geri alınabilir. Hiçbir toplamda sayılmazlar.`}
      />

      <div className="card overflow-hidden">
        {loading && items.length === 0 ? (
          <YukleniyorSatiri />
        ) : items.length === 0 ? (
          <EmptyState icon={Trash2} title="Çöp kutusu boş" description="Bir kaydı ya da siparişi detay penceresinden sildiğinde burada görünür." />
        ) : (
          <div className="table-scroll">
            <table className="w-full text-sm data-table">
              <thead>
                <tr>
                  <SiraTh sutun="tarih" sira={sira} onSirala={siraDegistir} className="w-[110px]">Tarih</SiraTh>
                  <SiraTh sutun="firma" sira={sira} onSirala={siraDegistir}>Firma / Açıklama</SiraTh>
                  <SiraTh sutun="islem" sira={sira} onSirala={siraDegistir} className="w-[90px]">İşlem</SiraTh>
                  <SiraTh sutun="odeme" sira={sira} onSirala={siraDegistir} className="w-[150px]">Ödeme</SiraTh>
                  <SiraTh sutun="toplam" sira={sira} onSirala={siraDegistir} className="w-[130px] text-right">Toplam</SiraTh>
                  <SiraTh sutun="silinme" sira={sira} onSirala={siraDegistir} className="w-[130px]">Silinme</SiraTh>
                  <th className="w-[120px]"></th>
                </tr>
              </thead>
              <tbody>
                {sirali.map((k) => {
                  const kalanGun = Math.max(0, SAKLAMA_GUN - Math.floor((simdi - k.silinmeTarihi) / GUN_MS));
                  return (
                    <tr key={k.id}>
                      <td className="tabular">{formatDate(k.tarih)}</td>
                      <td>
                        <div className="font-medium">{k.firma}</div>
                        <div className="text-xs text-[var(--muted)]">{k.aciklama}</div>
                      </td>
                      <td>
                        {k.siparis ? (
                          <span className="badge bg-[var(--accent-blue-soft)] text-[var(--accent-blue)]">Sipariş</span>
                        ) : (
                          <span className={`badge ${k.yon === "gelen" ? "badge-giris" : "badge-cikis"}`}>
                            {k.yon === "gelen" ? "Giriş" : "Çıkış"}
                          </span>
                        )}
                      </td>
                      <td className="text-[var(--muted)]">{k.odeme || "—"}</td>
                      <td className="num">{formatTL(k.tutar)}</td>
                      <td>
                        <div className="tabular">{new Date(k.silinmeTarihi).toLocaleDateString("tr-TR")}</div>
                        <div className="text-[11px] text-[var(--muted)]">{kalanGun} gün kaldı</div>
                      </td>
                      <td>
                        <div className="flex justify-end">
                          <button
                            className="btn-secondary !py-1.5 !px-3 !text-xs inline-flex items-center gap-1.5"
                            onClick={() => k.geriYukle()}
                          >
                            <RotateCcw className="w-3.5 h-3.5" /> Geri al
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {odemeKalemleri.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--border)]">
            <h2 className="text-sm font-semibold">Silinen Ödemeler</h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Bir kayıttan silinen tek ödeme satırları. Geri alınınca kaydın alınan tutarı ve kasa toplamları yine artar.
            </p>
          </div>
          <div className="table-scroll">
            <table className="w-full text-sm data-table">
              <thead>
                <tr>
                  <th className="w-[110px]">Tarih</th>
                  <th>Firma / Kayıt</th>
                  <th className="w-[180px]">Ödeme</th>
                  <th className="w-[130px] text-right">Tutar</th>
                  <th className="w-[130px]">Silinme</th>
                  <th className="w-[120px]"></th>
                </tr>
              </thead>
              <tbody>
                {odemeKalemleri.map(({ key, kayit, index, odeme }) => {
                  const silinmeTarihi = odeme.silinmeTarihi ?? 0;
                  const kalanGun = Math.max(0, SAKLAMA_GUN - Math.floor((simdi - silinmeTarihi) / GUN_MS));
                  return (
                    <tr key={key}>
                      <td className="tabular">{formatDate(odeme.tarih)}</td>
                      <td>
                        <div className="font-medium">{kayit.firma}</div>
                        <div className="text-xs text-[var(--muted)]">{kayit.aciklama || (kayit.yon === "gelen" ? "Tahsilat" : "Ödeme")}</div>
                      </td>
                      <td className="text-[var(--muted)]">
                        {[ODEME_SEKLI_LABEL[odeme.odemeSekli] ?? odeme.odemeSekli, odeme.kartAciklama].filter(Boolean).join(" · ")}
                      </td>
                      <td className="num">{formatTL(odeme.tutar)}</td>
                      <td>
                        <div className="tabular">{new Date(silinmeTarihi).toLocaleDateString("tr-TR")}</div>
                        <div className="text-[11px] text-[var(--muted)]">{kalanGun} gün kaldı</div>
                      </td>
                      <td>
                        <div className="flex justify-end">
                          <button
                            className="btn-secondary !py-1.5 !px-3 !text-xs inline-flex items-center gap-1.5"
                            onClick={() => odemeSatiriGeriYukle(kayit, index)}
                          >
                            <RotateCcw className="w-3.5 h-3.5" /> Geri al
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {firmaKalemleri.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--border)]">
            <h2 className="text-sm font-semibold">Silinen Firmalar</h2>
          </div>
          <div className="table-scroll">
            <table className="w-full text-sm data-table">
              <thead>
                <tr>
                  <th>Firma</th>
                  <th className="w-[140px]">Tür</th>
                  <th className="w-[130px]">Silinme</th>
                  <th className="w-[120px]"></th>
                </tr>
              </thead>
              <tbody>
                {firmaKalemleri.map((f) => {
                  const silinmeTarihi = f.silinmeTarihi ?? 0;
                  const kalanGun = Math.max(0, SAKLAMA_GUN - Math.floor((simdi - silinmeTarihi) / GUN_MS));
                  return (
                    <tr key={f.id}>
                      <td className="font-medium">{f.ad}</td>
                      <td className="text-[var(--muted)]">{FIRMA_TURU_LABEL[firmaTuru(f)]}</td>
                      <td>
                        <div className="tabular">{new Date(silinmeTarihi).toLocaleDateString("tr-TR")}</div>
                        <div className="text-[11px] text-[var(--muted)]">{kalanGun} gün kaldı</div>
                      </td>
                      <td>
                        <div className="flex justify-end">
                          <button
                            className="btn-secondary !py-1.5 !px-3 !text-xs inline-flex items-center gap-1.5"
                            onClick={() => firmaGeriYukle(f)}
                          >
                            <RotateCcw className="w-3.5 h-3.5" /> Geri al
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
