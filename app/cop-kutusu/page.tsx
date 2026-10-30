"use client";

import { useMemo, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { useKasaKayitlari } from "@/lib/hooks";
import { kayitGeriYukle } from "@/lib/db";
import { ODEME_SEKLI_LABEL, formatDate, formatTL } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

const SAKLAMA_GUN = 30;
const GUN_MS = 24 * 60 * 60 * 1000;

export default function CopKutusuPage() {
  const { silinenler, loading } = useKasaKayitlari();
  const [simdi] = useState(() => Date.now());

  // Older deletions stay in the database but are no longer offered for restore.
  const items = useMemo(() => {
    const sinir = simdi - SAKLAMA_GUN * GUN_MS;
    return silinenler
      .filter((k) => (k.silinmeTarihi ?? 0) >= sinir)
      .sort((a, b) => (b.silinmeTarihi ?? 0) - (a.silinmeTarihi ?? 0));
  }, [silinenler, simdi]);

  return (
    <div className="page-enter flex flex-col gap-6">
      <PageHeader
        title="Çöp Kutusu"
        description={`Silinen kayıtlar ${SAKLAMA_GUN} gün boyunca burada durur ve geri alınabilir. Hiçbir toplamda sayılmazlar.`}
      />

      <div className="card overflow-hidden">
        {!loading && items.length === 0 ? (
          <EmptyState icon={Trash2} title="Çöp kutusu boş" description="Bir kaydı detay penceresinden sildiğinde burada görünür." />
        ) : (
          <div className="table-scroll">
            <table className="w-full text-sm data-table">
              <thead>
                <tr>
                  <th className="w-[110px]">Tarih</th>
                  <th>Firma / Açıklama</th>
                  <th className="w-[90px]">İşlem</th>
                  <th className="w-[150px]">Ödeme</th>
                  <th className="w-[130px] text-right">Toplam</th>
                  <th className="w-[130px]">Silinme</th>
                  <th className="w-[120px]"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((k) => {
                  const kalanGun = Math.max(0, SAKLAMA_GUN - Math.floor((simdi - (k.silinmeTarihi ?? 0)) / GUN_MS));
                  return (
                    <tr key={k.id}>
                      <td className="tabular">{formatDate(k.tarih)}</td>
                      <td>
                        <div className="font-medium">{k.firma}</div>
                        <div className="text-xs text-[var(--muted)]">{k.aciklama}</div>
                      </td>
                      <td>
                        <span className={`badge ${k.yon === "gelen" ? "badge-giris" : "badge-cikis"}`}>
                          {k.yon === "gelen" ? "Giriş" : "Çıkış"}
                        </span>
                      </td>
                      <td>
                        {ODEME_SEKLI_LABEL[k.odemeSekli] ?? k.odemeSekli}
                        {k.kartAciklama && <div className="text-xs text-[var(--muted)]">{k.kartAciklama}</div>}
                      </td>
                      <td className="num">{formatTL(k.toplamTutar)}</td>
                      <td>
                        <div className="tabular">{k.silinmeTarihi ? new Date(k.silinmeTarihi).toLocaleDateString("tr-TR") : "—"}</div>
                        <div className="text-[11px] text-[var(--muted)]">{kalanGun} gün kaldı</div>
                      </td>
                      <td>
                        <div className="flex justify-end">
                          <button
                            className="btn-secondary !py-1.5 !px-3 !text-xs inline-flex items-center gap-1.5"
                            onClick={() => kayitGeriYukle(k.id)}
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
    </div>
  );
}
