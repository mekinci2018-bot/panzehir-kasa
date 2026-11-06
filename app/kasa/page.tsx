"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowLeftRight, Handshake } from "lucide-react";
import TransferModal from "@/components/TransferModal";
import MahsupModal from "@/components/MahsupModal";
import SatirMenu from "@/components/SatirMenu";
import { KAYIT_TURU_LABEL, kayitTutari, mahsupEtiketi, ozelKayitMi, sayilan, transferMi } from "@/lib/kayit";
import StatStrip from "@/components/StatStrip";
import PageHeader from "@/components/PageHeader";
import KayitDetayModal from "@/components/KayitDetayModal";
import SiparisDetayModal, { SiparisOdemeModal } from "@/components/SiparisDetayModal";
import BugunAranacaklar, { type AramaSatiri } from "@/components/BugunAranacaklar";
import FirmaFormModal from "@/components/FirmaFormModal";
import { hesapEtiketi } from "@/components/OdemeSekliSelect";
import FirmaLink from "@/components/FirmaLink";
import MonthNav from "@/components/MonthNav";
import AyKasaOzeti from "@/components/AyKasaOzeti";
import { SiraCubugu } from "@/components/SiraBasligi";
import { sirala, useSiralama, type SiraSutunlari } from "@/lib/siralama";
import { aylikKasa } from "@/lib/donem";
import {
  kartOnerileri,
  useBankaHesaplari,
  useCalisanlar,
  useFirmalar,
  useKasaKayitlari,
  usePersonelHareketleri,
  useSiparisler,
} from "@/lib/hooks";
import { personelBorcuToplami } from "@/lib/personel";
import { firmaSiparisOzetleri, siparisHesap } from "@/lib/siparis";
import { dagitimToplamlari, kayitKalani, siparisOdemeSatirlari } from "@/lib/dagitim";
import { tahsilatYap } from "@/lib/tahsilat";
import { cariOzetleri, firmaTuru } from "@/lib/firma";
import { addKasaKaydi, kaydiGeriAl } from "@/lib/db";
import { tumHareketler, signed } from "@/lib/hareketler";
import { siparisWaMesaji } from "@/lib/whatsapp";
import { ODEME_SEKLI_LABEL, bakiyeEtiketi, currentMonthKey, formatDate, formatTL, isoDayOf, todayISO } from "@/lib/format";
import type { BankaHesabi, Firma, KasaKaydi } from "@/lib/types";
import type { FirmaSecimi } from "@/components/FirmaSecici";
import KayitRow, { type DraftKayit } from "./KayitRow";

const DRAFT_COUNT = 5;
const GERI_AL_MS = 5000;

const emptyDraft = (): DraftKayit => ({
  tarih: todayISO(),
  firma: "",
  firmaId: "",
  personelId: "",
  aciklama: "",
  toplamTutar: "",
  alinanTutar: "",
  odemeSekli: "nakit",
  bankaHesapId: "",
  kartAciklama: "",
  yon: "gelen",
});

interface DraftSlot {
  key: number;
  value: DraftKayit;
}

let draftSeq = 0;
const newSlot = (value: DraftKayit = emptyDraft()): DraftSlot => ({ key: ++draftSeq, value });

function focusFirstEmptyDraft() {
  requestAnimationFrame(() => {
    const inputs = document.querySelectorAll<HTMLInputElement>('tr[data-draft] input[data-field="firma"]');
    const target = [...inputs].find((i) => !i.value) ?? inputs[0];
    target?.focus();
  });
}

export default function KasaPage() {
  const { kayitlar, loading } = useKasaKayitlari();
  const { hesaplar } = useBankaHesaplari();
  const { firmalar } = useFirmalar();
  const { calisanlar } = useCalisanlar();
  const { hareketler: personelHareketleri } = usePersonelHareketleri();
  const { siparisler } = useSiparisler();
  const [drafts, setDrafts] = useState<DraftSlot[]>(() => Array.from({ length: DRAFT_COUNT }, () => newSlot()));
  const [geriAl, setGeriAl] = useState<{ id: string; draft: DraftKayit; mesaj?: string } | null>(null);
  const geriAlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [detayId, setDetayId] = useState<string | null>(null);
  const [siparisDetayId, setSiparisDetayId] = useState<string | null>(null);
  const [odemeSiparisId, setOdemeSiparisId] = useState<string | null>(null);
  const [telefonFirma, setTelefonFirma] = useState<Firma | null>(null);
  const [ozetAyi, setOzetAyi] = useState(currentMonthKey);
  const [transferAcik, setTransferAcik] = useState(false);
  // Mahsup penceresi: satırdan açılınca ilgili taraf önceden seçili gelir.
  const [mahsup, setMahsup] = useState<{ odeyen?: FirmaSecimi; alan?: FirmaSecimi } | null>(null);

  useEffect(() => () => {
    if (geriAlTimer.current) clearTimeout(geriAlTimer.current);
  }, []);

  const oneriler = useMemo(() => kartOnerileri(kayitlar), [kayitlar]);
  const ayDonemi = useMemo(() => aylikKasa(kayitlar, ozetAyi), [kayitlar, ozetAyi]);
  const toplamlar = useMemo(() => dagitimToplamlari(kayitlar), [kayitlar]);
  const odemeler = toplamlar.siparis;
  const kayitDagitimlari = toplamlar.kayit;
  const ozetler = useMemo(() => cariOzetleri(kayitlar, "firmaId", siparisler, odemeler), [kayitlar, siparisler, odemeler]);
  const siparisOzetleri = useMemo(() => firmaSiparisOzetleri(siparisler, odemeler), [siparisler, odemeler]);
  const personelOzetleri = useMemo(() => cariOzetleri(kayitlar, "personelId"), [kayitlar]);
  // Aktif personelin kalan maaş alacağı. Ödenecek Borç'tan ayrı duruyor: ticari borç değil, ama
  // gerçek bir yükümlülük (Genel Durum'da da öyle sayılıyor).
  const personelBorcu = useMemo(
    () => personelBorcuToplami(calisanlar, personelHareketleri, kayitlar).toplam,
    [calisanlar, personelHareketleri, kayitlar]
  );

  // Customers and suppliers show their balance; expense items and staff only what was spent.
  function cariOzetMetni(d: DraftKayit): string | undefined {
    if (d.personelId) {
      const o = personelOzetleri.get(d.personelId);
      return `Personel · toplam ödeme ${formatTL(o?.harcama ?? 0)}`;
    }
    const firma = firmalar.find((f) => f.id === d.firmaId);
    if (!firma) return undefined;
    const o = ozetler.get(firma.id);
    if (firmaTuru(firma) === "gider") return `Gider kalemi · toplam harcama ${formatTL(o?.harcama ?? 0)}`;
    const so = siparisOzetleri.get(firma.id);
    if (!o && !so) return "Yeni cari · henüz hareket yok";
    return [
      `Bakiye ${bakiyeEtiketi(o?.bakiye ?? 0)}`,
      `${so?.acik ?? 0} açık sipariş`,
      `${so?.teslimOdenmedi ?? 0} teslim edildi/ödenmedi`,
    ].join(" · ");
  }

  const stats = useMemo(() => {
    let nakit = 0;
    let banka = 0;
    let kartPos = 0;
    let toplamAlacak = 0;
    let toplamBorc = 0;

    for (const h of tumHareketler(kayitlar)) {
      if (h.odemeSekli === "nakit") nakit += signed(h);
      else if (h.odemeSekli === "havale") banka += signed(h);
      else kartPos += signed(h);
    }
    for (const k of kayitlar) {
      // Transfer / mahsup kayıtları kapalı kaydedilir (alınan = toplam), yine de açıkça atlanıyor.
      if (k.durum !== "aktif" || ozelKayitMi(k)) continue;
      const kalan = kayitKalani(k, kayitDagitimlari);
      if (kalan <= 0) continue;
      if (k.yon === "gelen") toplamAlacak += kalan;
      else toplamBorc += kalan;
    }
    // Order remainders are owed to us too; their payments are already in the Kasa totals above.
    for (const s of siparisler) toplamAlacak += siparisHesap(s, odemeler).kalan;
    return { nakit, banka, kartPos, toplam: nakit + banka + kartPos, toplamAlacak, toplamBorc };
  }, [kayitlar, siparisler, odemeler, kayitDagitimlari]);

  // Entered today (by save time, not the record's own date), newest first.
  const bugunGirilenler = useMemo(() => {
    const bugun = todayISO();
    return kayitlar.filter((k) => isoDayOf(k.createdAt) === bugun).sort((a, b) => b.createdAt - a.createdAt);
  }, [kayitlar]);

  const detay = detayId ? kayitlar.find((k) => k.id === detayId) : undefined;
  const siparisDetay = siparisDetayId ? siparisler.find((s) => s.id === siparisDetayId) : undefined;
  const odemeSiparis = odemeSiparisId ? siparisler.find((s) => s.id === odemeSiparisId) : undefined;

  // Ödeme günü geçmiş/bugün olan açık siparişler ile bugünün/geçmişin tahsilat notları, firma
  // bazında gruplu tek liste.
  const aramaListesi = useMemo(() => {
    const bugun = todayISO();
    const map = new Map<string, AramaSatiri>();
    for (const s of siparisler) {
      const h = siparisHesap(s, odemeler);
      const odemeGecti = !!s.odemeGunu && s.odemeGunu <= bugun && h.kalan > 0.005;
      const notlar = (s.tahsilatNotlari ?? []).filter((n) => n.tarih <= bugun);
      if (!odemeGecti && notlar.length === 0) continue;
      const satir: AramaSatiri =
        map.get(s.firmaId) ??
        ({
          firmaId: s.firmaId,
          firmaAdi: s.firmaAdi,
          telefon: firmalar.find((f) => f.id === s.firmaId)?.telefon,
          sebepler: [],
          toplamKalan: 0,
          waMesaj: siparisWaMesaji(s, h),
        } as AramaSatiri);
      if (odemeGecti) {
        satir.sebepler.push(`Ödeme günü ${formatDate(s.odemeGunu!)} · ${formatTL(h.kalan)}`);
        satir.toplamKalan += h.kalan;
        if (!satir.odemeAlinacakSiparis || h.kalan > siparisHesap(satir.odemeAlinacakSiparis, odemeler).kalan) {
          satir.odemeAlinacakSiparis = s;
          satir.waMesaj = siparisWaMesaji(s, h);
        }
      }
      for (const n of notlar) satir.sebepler.push(`Not: ${n.metin}`);
      map.set(s.firmaId, satir);
    }
    return [...map.values()].sort((a, b) => b.toplamKalan - a.toplamKalan);
  }, [siparisler, odemeler, firmalar]);

  function bildirimGoster(id: string, draft: DraftKayit, mesaj?: string) {
    if (geriAlTimer.current) clearTimeout(geriAlTimer.current);
    setGeriAl({ id, draft, mesaj });
    geriAlTimer.current = setTimeout(() => setGeriAl(null), GERI_AL_MS);
  }

  async function saveDraft(key: number) {
    const slot = drafts.find((s) => s.key === key);
    if (!slot || !(slot.value.firmaId || slot.value.personelId)) return;
    const d = slot.value;

    // The saved row leaves the form and a fresh empty row is appended, keeping DRAFT_COUNT.
    setDrafts((prev) => [...prev.filter((s) => s.key !== key), newSlot()]);
    focusFirstEmptyDraft();

    try {
      const toplam = Number(d.toplamTutar) || 0;
      const pesin = Number(d.alinanTutar) || 0;
      // Firmadan para alındı ama satış yok (Toplam boş, yalnızca Peşin dolu): bu bir tahsilattır.
      // Açık kalemlere eskiden yeniye dağıtılır; eskiden böyle bir giriş cariye hiç yansımıyordu.
      if (d.firmaId && d.yon === "gelen" && toplam <= 0 && pesin > 0) {
        const { id, mesaj } = await tahsilatYap(
          {
            firmaId: d.firmaId,
            firma: d.firma.trim(),
            tarih: d.tarih,
            tutar: pesin,
            odemeSekli: d.odemeSekli,
            bankaHesapId: d.bankaHesapId,
            kartAciklama: d.kartAciklama,
            aciklama: d.aciklama.trim(),
          },
          { kayitlar, siparisler }
        );
        bildirimGoster(id, d, mesaj);
        return;
      }
      const ref = await addKasaKaydi({
        tarih: d.tarih,
        firma: d.firma.trim(),
        firmaId: d.firmaId,
        personelId: d.personelId,
        aciklama: d.aciklama.trim(),
        toplamTutar: toplam,
        alinanTutar: pesin,
        odemeSekli: d.odemeSekli,
        bankaHesapId: d.bankaHesapId,
        kartAciklama: d.kartAciklama,
        yon: d.yon,
      });
      bildirimGoster(ref.id, d);
    } catch (err) {
      console.error(err);
      setDrafts((prev) => [slot, ...prev.slice(0, DRAFT_COUNT - 1)]);
      alert("Kayıt kaydedilemedi, lütfen tekrar deneyin.");
    }
  }

  // Undo puts the entry back into the form so it can be corrected and saved again.
  async function geriAlUygula() {
    if (!geriAl) return;
    const { id, draft } = geriAl;
    if (geriAlTimer.current) clearTimeout(geriAlTimer.current);
    setGeriAl(null);
    try {
      await kaydiGeriAl(id);
      setDrafts((prev) => {
        // The restored entry takes the place of an empty row, at the top so it is easy to spot.
        const bos = prev.findIndex((s) => !s.value.firma.trim());
        const kalan = bos === -1 ? prev.slice(0, DRAFT_COUNT - 1) : prev.filter((_, i) => i !== bos);
        return [newSlot(draft), ...kalan];
      });
    } catch (err) {
      console.error(err);
      alert("Geri alınamadı; kaydı Arşiv'den açıp silebilirsin.");
    }
  }

  function updateDraft(key: number, patch: Partial<DraftKayit>) {
    setDrafts((prev) => prev.map((s) => (s.key === key ? { ...s, value: { ...s.value, ...patch } } : s)));
  }

  return (
    <div className="page-enter flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="Kasa"
          description="İşlemleri Excel'de yazar gibi girin. Tab ile hücreler arasında gezin, Enter ile kaydedin; kayıt Arşiv'e gider."
          showGreeting
        />
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-secondary inline-flex items-center gap-1.5" onClick={() => setTransferAcik(true)}>
            <ArrowLeftRight className="w-4 h-4" /> Transfer
          </button>
          <button className="btn-secondary inline-flex items-center gap-1.5" onClick={() => setMahsup({})}>
            <Handshake className="w-4 h-4" /> Mahsup
          </button>
        </div>
      </div>

      <StatStrip
        items={[
          {
            title: "Toplam Kasa",
            value: formatTL(stats.toplam),
            hint: "Nakit + Banka + Kart / POS",
            tone: "green",
            vurgulu: true,
          },
          {
            title: "Nakit Kasa",
            value: formatTL(stats.nakit),
            hint: "Elde bulunan nakit para",
            tone: "green",
          },
          {
            title: "Banka",
            value: formatTL(stats.banka),
            hint: "Banka havalesi ile giren/çıkanların toplam bakiyesi",
            tone: "blue",
          },
          {
            title: "Kart / POS",
            value: formatTL(stats.kartPos),
            hint: "Kredi kartı ile alınanlar",
            tone: "violet",
          },
          {
            title: "Tahsil Edilecek",
            value: formatTL(stats.toplamAlacak),
            hint: "Müşterilerden alınacak toplam",
            tone: "orange",
          },
          {
            title: "Ödenecek Borç",
            value: formatTL(stats.toplamBorc),
            hint: "Tedarikçilere ödenecek toplam",
            tone: "red",
          },
          {
            title: "Personel Borcu",
            value: formatTL(personelBorcu),
            hint: "Aktif personelin kalan maaş alacağı; Ödenecek Borç'a dahil değil",
            tone: "slate",
          },
        ]}
      />

      <BugunAranacaklar items={aramaListesi} onOdeme={(s) => setOdemeSiparisId(s.id)} onTelefonEksik={(firmaId) => setTelefonFirma(firmalar.find((f) => f.id === firmaId) ?? null)} />

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Aylık kasa özeti</h2>
          <MonthNav monthKey={ozetAyi} onChange={setOzetAyi} />
        </div>
        <div className="py-2">
          <AyKasaOzeti ay={ozetAyi} donem={ayDonemi} />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="table-scroll">
          <table className="w-full text-sm data-table">
            <thead>
              <tr>
                <th>Firma / Açıklama</th>
                <th className="w-[140px]">Tarih</th>
                <th className="w-[130px] text-right">Toplam Tutar</th>
                <th className="w-[280px]">Ödeme Şekli</th>
                <th className="w-[100px]">İşlem</th>
                <th className="w-[130px] text-right" title="Kalan tutar otomatik olarak Alacaklar/Borçlar'a düşer">
                  Peşin Ödenen
                </th>
                <th className="w-[52px]"></th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((s) => (
                <KayitRow
                  key={`draft-${s.key}`}
                  value={s.value}
                  hesaplar={hesaplar}
                  firmalar={firmalar}
                  calisanlar={calisanlar}
                  cariOzet={cariOzetMetni(s.value)}
                  siparisler={siparisler}
                  onSiparisDetay={setSiparisDetayId}
                  kartOnerileri={oneriler}
                  onSave={() => saveDraft(s.key)}
                  onChange={(patch) => updateDraft(s.key, patch)}
                  onOzelIslem={(tur) =>
                    tur === "transfer"
                      ? setTransferAcik(true)
                      : setMahsup({
                          odeyen: s.value.firmaId ? { firmaId: s.value.firmaId, firma: s.value.firma } : undefined,
                        })
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-2.5 border-t border-[var(--border)] text-[11px] text-[var(--muted-soft)]">
          Peşin ödenmeyen kısım otomatik olarak Alacaklar / Borçlar&apos;a düşer.
        </div>
      </div>

      <BugunGirilenler
        items={bugunGirilenler}
        loading={loading}
        hesaplar={hesaplar}
        onSelect={setDetayId}
        onMahsup={(k) =>
          setMahsup({
            odeyen:
              k.yon === "gelen" && (k.firmaId || k.personelId)
                ? { firmaId: k.firmaId ?? "", personelId: k.personelId, firma: k.firma }
                : undefined,
            alan:
              k.yon === "giden" && (k.firmaId || k.personelId)
                ? { firmaId: k.firmaId ?? "", personelId: k.personelId, firma: k.firma }
                : undefined,
          })
        }
      />

      {/* Transfer ve mahsup kendi pencerelerinde düzenlenir. */}
      {detay && transferMi(detay) && <TransferModal key={detay.id} kayit={detay} onClose={() => setDetayId(null)} />}
      {detay && detay.tur === "mahsup" && (
        <MahsupModal
          key={detay.id}
          kayit={detay}
          komisyonId={kayitlar.find((k) => k.tur === "mahsup-komisyon" && k.mahsupId === detay.id)?.id ?? null}
          onClose={() => setDetayId(null)}
        />
      )}
      {detay && !transferMi(detay) && detay.tur !== "mahsup" && (
        <KayitDetayModal
          key={detay.id}
          kayit={detay}
          hesaplar={hesaplar}
          kartOnerileri={oneriler}
          onClose={() => setDetayId(null)}
        />
      )}

      {siparisDetay && (
        <SiparisDetayModal
          key={siparisDetay.id}
          siparis={siparisDetay}
          odemeSatirlari={siparisOdemeSatirlari(siparisDetay.id, kayitlar)}
          odemeler={odemeler}
          hesaplar={hesaplar}
          kartOnerileri={oneriler}
          onClose={() => setSiparisDetayId(null)}
        />
      )}

      {odemeSiparis && (
        <SiparisOdemeModal
          siparis={odemeSiparis}
          kalan={siparisHesap(odemeSiparis, odemeler).kalan}
          hesaplar={hesaplar}
          kartOnerileri={oneriler}
          onClose={() => setOdemeSiparisId(null)}
        />
      )}

      {telefonFirma && (
        <FirmaFormModal
          firma={telefonFirma}
          firmalar={firmalar}
          bagliKayitlar={[]}
          bagliSiparisIds={[]}
          odaklan="telefon"
          onClose={() => setTelefonFirma(null)}
        />
      )}

      {transferAcik && <TransferModal onClose={() => setTransferAcik(false)} />}

      {mahsup && <MahsupModal baslangic={mahsup} onClose={() => setMahsup(null)} />}

      {geriAl && (
        <div className="toast-in fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 rounded-xl bg-[var(--ink)] text-white pl-4 pr-2 py-2 text-sm shadow-[var(--shadow-pop)]">
          <span className="tabular">{geriAl.mesaj ?? "Arşive kaydedildi"}</span>
          <span className="text-white/30">·</span>
          <button className="font-semibold text-white hover:bg-white/10 rounded-lg px-2.5 py-1 transition-colors" onClick={geriAlUygula}>
            Geri al
          </button>
        </div>
      )}
    </div>
  );
}

// Amounts sort signed: money out counts as negative, like the "−" shown in the list.
const BUGUN_SUTUNLARI: SiraSutunlari<KasaKaydi> = {
  saat: (k) => k.createdAt,
  firma: (k) => k.firma,
  aciklama: (k) => k.aciklama,
  tutar: (k) => (k.yon === "gelen" ? kayitTutari(k) : -kayitTutari(k)),
};

function BugunGirilenler({
  items,
  loading,
  hesaplar,
  onSelect,
  onMahsup,
}: {
  items: KasaKaydi[];
  loading: boolean;
  hesaplar: BankaHesabi[];
  onSelect: (id: string) => void;
  onMahsup: (k: KasaKaydi) => void;
}) {
  const { sira, sirala: siraDegistir } = useSiralama("kasa.bugun");
  const sirali = useMemo(() => sirala(items, sira, BUGUN_SUTUNLARI), [items, sira]);
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">
          Bugün girilenler
          {items.length > 0 && <span className="ml-2 text-xs font-normal text-[var(--muted)]">{items.length} kayıt</span>}
        </h2>
        <Link href="/arsiv" className="text-xs text-[var(--muted)] font-medium hover:text-[var(--foreground)] inline-flex items-center gap-1">
          Arşiv <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      {items.length > 1 && (
        <SiraCubugu
          className="mb-1"
          sutunlar={[["saat", "Saat"], ["firma", "Firma"], ["aciklama", "Açıklama"], ["tutar", "Tutar"]]}
          sira={sira}
          onSirala={siraDegistir}
        />
      )}
      {items.length === 0 ? (
        <p className="text-sm text-[var(--muted)] py-2">{loading ? "yükleniyor…" : "Bugün henüz kayıt girilmedi."}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border)] -mx-2">
          {sirali.map((k) => {
            const hesap = hesaplar.find((h) => h.id === k.bankaHesapId);
            const hedefHesap = hesaplar.find((h) => h.id === k.hedefBankaHesapId);
            const odeme = [ODEME_SEKLI_LABEL[k.odemeSekli], hesap ? hesapEtiketi(hesap) : k.kartAciklama]
              .filter(Boolean)
              .join(" · ");
            const saat = new Date(k.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
            // Transfer: iki bacak tek satırda; mahsup: iki taraf ve sayılan tutar. İkisi de ±
            // gösterilmez, çünkü kasayı artırıp azaltmazlar.
            const ozel = ozelKayitMi(k);
            const transferYazi = transferMi(k)
              ? `${hesap ? hesapEtiketi(hesap) : "Nakit Kasa"} → ${hedefHesap ? hesapEtiketi(hedefHesap) : "Nakit Kasa"}`
              : "";
            return (
              <li key={k.id}>
                <div
                  role="button"
                  tabIndex={0}
                  className="w-full text-left px-2 py-2 rounded-lg hover:bg-[var(--surface-hover)] flex items-center gap-3 text-sm transition-colors cursor-pointer"
                  onClick={() => onSelect(k.id)}
                  onKeyDown={(e) => e.key === "Enter" && onSelect(k.id)}
                >
                  <span className="tabular text-xs text-[var(--muted)] w-10 shrink-0">{saat}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 min-w-0">
                      {transferMi(k) ? (
                        <span className="font-medium truncate">Transfer</span>
                      ) : (
                        <FirmaLink
                          firmaId={k.firmaId}
                          personelId={k.personelId}
                          ad={k.firma}
                          className="font-medium truncate"
                        />
                      )}
                      {ozel && (
                        <span className="badge bg-[var(--accent-blue-soft)] text-[var(--accent-blue)] shrink-0">
                          {KAYIT_TURU_LABEL[k.tur!]}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-[var(--muted)] truncate block">
                      {k.tur === "mahsup"
                        ? [mahsupEtiketi(k), k.aciklama].filter(Boolean).join(" · ")
                        : [transferYazi || k.aciklama, transferYazi ? k.aciklama : odeme].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span
                    className={`tabular font-medium shrink-0 ${
                      ozel ? "text-[var(--muted)]" : k.yon === "gelen" ? "text-[var(--accent-green)]" : ""
                    }`}
                  >
                    {ozel ? "" : k.yon === "gelen" ? "+" : "−"}
                    {formatTL(k.tur === "mahsup" ? sayilan(k) : kayitTutari(k))}
                  </span>
                  {!ozel && (k.firmaId || k.personelId) && (
                    <span onClick={(e) => e.stopPropagation()}>
                      <SatirMenu
                        ogeler={[{ label: "Mahsup", icon: Handshake, onClick: () => onMahsup(k) }]}
                        baslik="Diğer işlemler"
                      />
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

