"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Users, Plus, Clock, Wallet, Check, AlertTriangle, Pencil, EyeOff, RotateCcw, Trash2 } from "lucide-react";
import { useBankaHesaplari, useCalisanlar, useKasaKayitlari, usePersonelHareketleri } from "@/lib/hooks";
import { personelOzeti, hakEdisDurumu, maasTuru, MAAS_TURU_LABEL, eksikDonemler, donemBasi, type HakEdisDurum } from "@/lib/personel";
import { deleteCalisan, hakEdisYaz, personelOdemeYap, updateCalisan } from "@/lib/db";
import { formatDate, formatTL, todayISO } from "@/lib/format";
import type { Calisan, MaasTuru } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import YukleniyorSatiri from "@/components/YukleniyorSatiri";
import SatirMenu from "@/components/SatirMenu";
import PersonelFormModal from "@/components/PersonelFormModal";
import PersonelHareketModal from "@/components/PersonelHareketModal";
import AmountModal from "@/components/AmountModal";

export default function CalisanlarPage() {
  const { calisanlar, loading } = useCalisanlar();
  const { hareketler } = usePersonelHareketleri();
  const { kayitlar } = useKasaKayitlari();
  const { hesaplar } = useBankaHesaplari();
  const [yeni, setYeni] = useState(false);
  const [duzenlenen, setDuzenlenen] = useState<Calisan | null>(null);
  const [mesaiFor, setMesaiFor] = useState<Calisan | null>(null);
  const [odemeFor, setOdemeFor] = useState<Calisan | null>(null);

  const bugun = todayISO();
  const ozetler = useMemo(
    () => new Map(calisanlar.map((c) => [c.id, personelOzeti(c, hareketler, kayitlar)])),
    [calisanlar, hareketler, kayitlar]
  );

  const aktifler = calisanlar.filter((c) => !c.pasif);
  const pasifler = calisanlar.filter((c) => c.pasif);
  const odenecek = (liste: Calisan[]) => liste.reduce((s, c) => s + Math.max(0, ozetler.get(c.id)?.kalan ?? 0), 0);
  const personelBorcu = odenecek(aktifler);

  // Haftalık üstte, aylık altta. maasTuru() olmayan eski kayıtlar "aylık" sayılır, bu yüzden iki
  // bölümün toplamı her zaman aktif personelin tamamıdır.
  const bolumler: { tur: MaasTuru; kisiler: Calisan[] }[] = [
    { tur: "haftalik", kisiler: aktifler.filter((c) => maasTuru(c) === "haftalik") },
    { tur: "aylik", kisiler: aktifler.filter((c) => maasTuru(c) === "aylik") },
  ];

  // Geçmişi olan personel silinmez, yalnızca pasife alınır (firma silmedeki kuralla aynı).
  function silinebilirMi(c: Calisan) {
    return !hareketler.some((h) => h.personelId === c.id) && !kayitlar.some((k) => k.personelId === c.id);
  }

  async function sil(c: Calisan) {
    if (!window.confirm(`${c.adSoyad} silinsin mi? Bu personelin hiç hareketi ve kasa kaydı yok.`)) return;
    try {
      await deleteCalisan(c.id);
    } catch (err) {
      console.error(err);
      alert("Silinemedi, lütfen tekrar deneyin.");
    }
  }

  async function eksikleriIsle(c: Calisan) {
    const donemler = eksikDonemler(c, hareketler, bugun);
    if (donemler.length === 0) return;
    try {
      await hakEdisYaz(c.id, donemler.map((donem) => ({ donem, tarih: donemBasi(donem), tutar: c.maasTutari! })));
    } catch (err) {
      console.error(err);
      alert("Hak ediş işlenemedi, lütfen tekrar deneyin.");
    }
  }

  function satir(c: Calisan) {
    const { durum, eksik } = hakEdisDurumu(c, hareketler, bugun);
    return (
      <PersonelSatir
        key={c.id}
        calisan={c}
        ozet={ozetler.get(c.id)!}
        durum={durum}
        eksikDonem={eksik}
        silinebilir={silinebilirMi(c)}
        onDuzenle={() => setDuzenlenen(c)}
        onMesai={() => setMesaiFor(c)}
        onOdeme={() => setOdemeFor(c)}
        onPasif={() => updateCalisan(c.id, { pasif: !c.pasif })}
        onSil={() => sil(c)}
        onEksikleriIsle={() => eksikleriIsle(c)}
      />
    );
  }

  return (
    <div className="page-enter flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="Personel"
          description="Maaş carisi: hak edişler, mesai, ek ve kesintiler, ödemeler ve kalan alacak."
        />
        <button className="btn-primary inline-flex items-center gap-2" onClick={() => setYeni(true)}>
          <Plus className="w-4 h-4" /> Yeni Personel
        </button>
      </div>

      {aktifler.length > 0 && (
        <div className="card px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--muted)]">
            Personel borcu · {aktifler.length} aktif personel
          </span>
          <span className="tabular text-[19px] font-semibold">{formatTL(personelBorcu)}</span>
        </div>
      )}

      {loading && calisanlar.length === 0 ? (
        <div className="card">
          <YukleniyorSatiri />
        </div>
      ) : calisanlar.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Users}
            title="Henüz personel eklenmedi"
            description="'Yeni Personel' ile ad soyad, maaş türü ve tutarını girerek başla. Maaş hak edişi haftalık personelde her Pazartesi, aylık personelde her ayın 1'inde otomatik işlenir."
          />
        </div>
      ) : (
        <>
          {bolumler
            .filter((b) => b.kisiler.length > 0)
            .map((b) => (
              <section key={b.tur} className="flex flex-col gap-2.5">
                <BolumBasligi baslik={`${MAAS_TURU_LABEL[b.tur]} Personel`} kisi={b.kisiler.length} toplam={odenecek(b.kisiler)} />
                {b.kisiler.map(satir)}
              </section>
            ))}

          {pasifler.length > 0 && (
            <section className="flex flex-col gap-2.5 opacity-65">
              <BolumBasligi baslik="Pasif personel" kisi={pasifler.length} />
              {pasifler.map(satir)}
            </section>
          )}
        </>
      )}

      {(yeni || duzenlenen) && (
        <PersonelFormModal
          calisan={duzenlenen ?? undefined}
          onClose={() => {
            setYeni(false);
            setDuzenlenen(null);
          }}
        />
      )}

      {mesaiFor && <PersonelHareketModal calisan={mesaiFor} tur="mesai" onClose={() => setMesaiFor(null)} />}

      {odemeFor && (
        <AmountModal
          title={`Ödeme Yap — ${odemeFor.adSoyad}`}
          kalan={Math.max(0, ozetler.get(odemeFor.id)?.kalan ?? 0)}
          hesaplar={hesaplar}
          defaultSecim={{ odemeSekli: "nakit", bankaHesapId: "", kartAciklama: "" }}
          onayEtiketi="Ödemeyi kaydet"
          onClose={() => setOdemeFor(null)}
          onConfirm={async (tutar, secim, tarih) => {
            try {
              await personelOdemeYap(odemeFor, { tutar, tarih, ...secim });
              setOdemeFor(null);
            } catch (err) {
              console.error(err);
              alert("Ödeme kaydedilemedi, lütfen tekrar deneyin.");
            }
          }}
        />
      )}
    </div>
  );
}

function BolumBasligi({ baslik, kisi, toplam }: { baslik: string; kisi: number; toplam?: number }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
      {baslik} · {kisi} kişi
      {toplam !== undefined && (
        <>
          {" · "}Ödenecek <span className="tabular text-[var(--foreground)]">{formatTL(toplam)}</span>
        </>
      )}
    </h2>
  );
}

// Tam genişlikte tek satır. Geniş ekranda soldan sağa: ad soyad · son ödeme · işlenme durumu ·
// Kalan · butonlar. Telefonda `order` ile kırılıyor — ilk satırda ad soyad ve Kalan, altında son
// ödeme, işlenme durumu ve butonlar; tek DOM, ayrı bir mobil render yok.
function PersonelSatir({
  calisan,
  ozet,
  durum,
  eksikDonem,
  silinebilir,
  onDuzenle,
  onMesai,
  onOdeme,
  onPasif,
  onSil,
  onEksikleriIsle,
}: {
  calisan: Calisan;
  ozet: { kalan: number; sonOdemeTarihi?: string; sonOdemeTutari?: number };
  durum: HakEdisDurum;
  eksikDonem: number;
  silinebilir: boolean;
  onDuzenle: () => void;
  onMesai: () => void;
  onOdeme: () => void;
  onPasif: () => void;
  onSil: () => void;
  onEksikleriIsle: () => void;
}) {
  const tur = maasTuru(calisan);
  const donemAdi = tur === "haftalik" ? "Bu hafta" : "Bu ay";
  return (
    <div className="card px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2.5">
      <div className="order-1 min-w-0 flex-1">
        <Link href={`/calisanlar/${calisan.id}`} className="font-semibold hover:underline underline-offset-2">
          {calisan.adSoyad}
        </Link>
        <div className="text-[11.5px] text-[var(--muted)] mt-0.5">
          {MAAS_TURU_LABEL[tur]} · {calisan.maasTutari ? formatTL(calisan.maasTutari) : "maaş tutarı girilmemiş"}
          {calisan.mesaiSaatUcreti ? ` · mesai ${formatTL(calisan.mesaiSaatUcreti)}/saat` : ""}
        </div>
      </div>

      <div className="order-3 basis-full md:order-2 md:basis-auto md:w-44 text-[11.5px] text-[var(--muted)]">
        {ozet.sonOdemeTarihi ? (
          <>
            Son ödeme {formatDate(ozet.sonOdemeTarihi)} · <b className="tabular">{formatTL(ozet.sonOdemeTutari ?? 0)}</b>
          </>
        ) : (
          "Henüz ödeme yapılmadı"
        )}
      </div>

      {/* Uyarı yalnızca gerçekten yazılacak bir dönem varsa gösteriliyor; "devredene dahil"
          dönemlerde eskiden kalıcı "işlenmedi" yazıyor, düğme de hiçbir şey yapmıyordu. */}
      <div className="order-3 basis-full md:order-2 md:basis-auto md:w-52 text-[11.5px]">
        {eksikDonem > 0 ? (
          <button
            className="inline-flex items-center gap-1 text-left text-[var(--accent-orange)] font-medium hover:underline"
            onClick={onEksikleriIsle}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {donemAdi} işlenmedi
            {eksikDonem > 1 ? ` (${eksikDonem} dönem)` : ""} · şimdi işle
          </button>
        ) : durum === "islendi" ? (
          <span className="inline-flex items-center gap-1 text-[var(--accent-green)]">
            <Check className="w-3.5 h-3.5 shrink-0" /> {donemAdi} işlendi
          </span>
        ) : durum === "devredene-dahil" ? (
          <span className="text-[var(--muted-soft)]" title="Devreden alacak bu dönemin içinde girildiği için maaşı ayrıca yazılmıyor">
            {donemAdi} devredene dahil
          </span>
        ) : null}
      </div>

      <div className="order-2 md:order-3 shrink-0 text-right md:w-32">
        <div className="text-[10.5px] uppercase tracking-[0.1em] text-[var(--muted)]">Kalan</div>
        <div className={`tabular text-[19px] font-semibold ${ozet.kalan > 0.005 ? "text-[var(--accent-orange)]" : ""}`}>
          {formatTL(ozet.kalan)}
        </div>
      </div>

      <div className="order-4 basis-full md:basis-auto flex flex-wrap items-center gap-2 md:ml-auto">
        <button className="btn-primary !py-1.5 !px-3 !text-xs inline-flex items-center gap-1.5" onClick={onOdeme}>
          <Wallet className="w-3.5 h-3.5" /> Ödeme Yap
        </button>
        <button className="btn-secondary !py-1.5 !px-3 !text-xs inline-flex items-center gap-1.5" onClick={onMesai}>
          <Clock className="w-3.5 h-3.5" /> Mesai Ekle
        </button>
        <Link href={`/calisanlar/${calisan.id}`} className="btn-secondary !py-1.5 !px-3 !text-xs">
          Ekstre
        </Link>
        <SatirMenu
          ogeler={[
            { label: "Düzenle", icon: Pencil, onClick: onDuzenle },
            {
              label: calisan.pasif ? "Aktif yap" : "Pasif yap",
              icon: calisan.pasif ? RotateCcw : EyeOff,
              onClick: onPasif,
            },
            ...(silinebilir ? [{ label: "Sil", icon: Trash2, onClick: onSil, tehlikeli: true }] : []),
          ]}
        />
      </div>
    </div>
  );
}
