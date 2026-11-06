"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import FirmaLink from "@/components/FirmaLink";
import WhatsappButonu from "@/components/WhatsappButonu";
import FirmaFormModal from "@/components/FirmaFormModal";
import AmountModal from "@/components/AmountModal";
import { SiparisOdemeModal } from "@/components/SiparisDetayModal";
import { hesapEtiketi } from "@/components/OdemeSekliSelect";
import { YazdirButonu, YazdirmaBasligi } from "@/components/Yazdir";
import YukleniyorSatiri from "@/components/YukleniyorSatiri";
import {
  kartOnerileri,
  useBankaHesaplari,
  useCalisanlar,
  useFirmalar,
  useKasaKayitlari,
  usePersonelHareketleri,
  useSiparisler,
} from "@/lib/hooks";
import { MAAS_TURU_LABEL, maasTuru, personelBorcuToplami } from "@/lib/personel";
import { cariEtkileri, ozelKayitMi } from "@/lib/kayit";
import { FIRMA_TURU_LABEL, firmaTuru, kayitBakiyesi, siparisBakiyesi } from "@/lib/firma";
import { siparisHesap } from "@/lib/siparis";
import { dagitimToplamlari, kayitKalani } from "@/lib/dagitim";
import { tahsilatYap } from "@/lib/tahsilat";
import { bildir } from "@/components/Bildirim";
import { signed, tumHareketler, type Hareket } from "@/lib/hareketler";
import { firmaWaMesaji, siparisWaMesaji } from "@/lib/whatsapp";
import { daysSince, formatDate, formatTL, longDateTR, vadeDurumu, type VadeDurumu } from "@/lib/format";
import type { Calisan, Firma, FirmaTuru, KasaKaydi, Siparis } from "@/lib/types";

// Kuruş altı artıklar (kayan nokta toplamları) bakiye sayılmaz.
const EPS = 0.005;
const SON_HAREKET = 8;
const LISTE_SINIRI = 10; // tabloda gösterilen cari sayısı; kalanı için "Tümünü gör"

const VADE_RENK: Record<VadeDurumu, string> = {
  gecti: "text-[var(--accent-red)]",
  yaklasiyor: "text-[var(--accent-orange)]",
  normal: "",
};

// Alacak yaşlandırması: her cari, en eski açık kaleminin gecikmesine göre tek bir dilime girer.
const YAS_DILIMLERI: { ad: string; ustSinir: number; renk: string; yazi: string }[] = [
  { ad: "0–30 gün", ustSinir: 30, renk: "#9aa0b4", yazi: "text-[var(--muted)]" },
  { ad: "31–60 gün", ustSinir: 60, renk: "var(--accent-blue)", yazi: "" },
  { ad: "61–90 gün", ustSinir: 90, renk: "var(--accent-orange)", yazi: "text-[var(--accent-orange)]" },
  { ad: "90+ gün", ustSinir: Infinity, renk: "var(--accent-red)", yazi: "text-[var(--accent-red)] font-medium" },
];

function dilimIndeksi(gecikmeGunu: number): number {
  return YAS_DILIMLERI.findIndex((d) => gecikmeGunu <= d.ustSinir);
}

// ---- Hazır değerler ----

type HesapTuru = "Nakit" | "Banka" | "POS";

interface HesapSatiri {
  key: string;
  ad: string;
  tur: HesapTuru;
  bakiye: number;
  sonTarih?: string;
  hareketler: Hareket[]; // en yeniden eskiye
  link: { href: string; etiket: string };
}

const yeniden = (a: Hareket, b: Hareket) => (a.tarih < b.tarih ? 1 : -1);

// ---- Cari (firma / personel / serbest metin) ----

interface Cari {
  key: string;
  ad: string;
  firmaId?: string;
  personelId?: string;
  tur?: FirmaTuru;
  telefon?: string;
  bakiye: number; // + ticari alacak, − ticari borç
  acikSiparis: number;
  acikKalem: number; // açık borç kalemi sayısı (kasa kayıtları)
  enEskiAlacak?: string;
  enEskiBorc?: string;
  hedefTarih?: string; // "Tahsilat Al" hangi kaleme açılacak
  hedefSiparis?: Siparis;
  hedefKayit?: KasaKaydi;
  waSiparis?: Siparis; // hazır WhatsApp mesajı bu siparişe göre yazılır
}

export default function GenelDurumPage() {
  const { kayitlar, loading } = useKasaKayitlari();
  const { siparisler } = useSiparisler();
  const { firmalar } = useFirmalar();
  const { hesaplar } = useBankaHesaplari();
  const { calisanlar } = useCalisanlar();
  const { hareketler: personelHareketleri } = usePersonelHareketleri();
  const [acikHesap, setAcikHesap] = useState<string | null>(null);
  const [tahsilatCari, setTahsilatCari] = useState<Cari | null>(null);
  const [telefonFirma, setTelefonFirma] = useState<Firma | null>(null);

  const toplamlar = useMemo(() => dagitimToplamlari(kayitlar), [kayitlar]);
  const odemeler = toplamlar.siparis;
  const kayitDagitimlari = toplamlar.kayit;
  const oneriler = useMemo(() => kartOnerileri(kayitlar), [kayitlar]);

  // Nakit, her banka hesabı, hesabı seçilmemiş havaleler ve POS; hepsi birlikte hazır değerleri verir.
  const hesapSatirlari = useMemo<HesapSatiri[]>(() => {
    const nakit: Hareket[] = [];
    const kart: Hareket[] = [];
    const secilmemis: Hareket[] = [];
    const hesapHareketleri = new Map<string, Hareket[]>();
    const hesapIdleri = new Set(hesaplar.map((h) => h.id));

    for (const h of tumHareketler(kayitlar)) {
      if (h.odemeSekli === "nakit") nakit.push(h);
      else if (h.odemeSekli === "kart") kart.push(h);
      else if (h.bankaHesapId && hesapIdleri.has(h.bankaHesapId)) {
        if (!hesapHareketleri.has(h.bankaHesapId)) hesapHareketleri.set(h.bankaHesapId, []);
        hesapHareketleri.get(h.bankaHesapId)!.push(h);
      } else secilmemis.push(h);
    }
    const topla = (l: Hareket[]) => l.reduce((s, h) => s + signed(h), 0);
    const satir = (
      key: string,
      ad: string,
      tur: HesapTuru,
      liste: Hareket[],
      link: { href: string; etiket: string }
    ): HesapSatiri => {
      const hareketler = liste.sort(yeniden);
      return { key, ad, tur, bakiye: topla(hareketler), sonTarih: hareketler[0]?.tarih, hareketler, link };
    };

    const satirlar: HesapSatiri[] = [satir("nakit", "Nakit Kasa", "Nakit", nakit, { href: "/arsiv", etiket: "Arşiv" })];

    // Banka hesapları bakiyesi büyükten küçüğe; pasif hesap yalnızca hareketi varsa görünür.
    satirlar.push(
      ...hesaplar
        .map((hesap) => ({ hesap, hareketler: hesapHareketleri.get(hesap.id) ?? [] }))
        .filter(({ hesap, hareketler }) => !hesap.pasif || hareketler.length > 0)
        .map(({ hesap, hareketler }) =>
          satir(`banka-${hesap.id}`, hesapEtiketi(hesap) + (hesap.pasif ? " (pasif)" : ""), "Banka", hareketler, {
            href: "/banka-bilgileri",
            etiket: "Banka Hesapları",
          })
        )
        .sort((a, b) => b.bakiye - a.bakiye)
    );

    if (secilmemis.length > 0) {
      satirlar.push(
        satir("secilmemis", "Hesap seçilmemiş havaleler", "Banka", secilmemis, {
          href: "/banka-bilgileri",
          etiket: "Hesap ata",
        })
      );
    }

    satirlar.push(satir("kart", "Kart / POS tahsilatları", "POS", kart, { href: "/banka-bilgileri", etiket: "Kart / POS" }));
    return satirlar;
  }, [kayitlar, hesaplar]);

  const hazirDegerler = useMemo(() => hesapSatirlari.reduce((s, r) => s + r.bakiye, 0), [hesapSatirlari]);

  // Firma (ya da personel / serbest metin) bazında net bakiye: sipariş kalanları ve kasa kayıtları
  // birlikte. Aynı carinin alacağı ile borcu birbirini götürür; net durum da bu rakamlardan çıkar.
  const cariler = useMemo<Cari[]>(() => {
    const map = new Map<string, Cari>();
    const al = (ad: string, firmaId?: string, personelId?: string): Cari => {
      const key = firmaId ? `f-${firmaId}` : personelId ? `p-${personelId}` : `ad-${ad}`;
      let c = map.get(key);
      if (!c) {
        const firma = firmaId ? firmalar.find((f) => f.id === firmaId) : undefined;
        c = {
          key,
          ad: firma?.ad ?? ad,
          firmaId,
          personelId,
          tur: firma ? firmaTuru(firma) : undefined,
          telefon: firma?.telefon,
          bakiye: 0,
          acikSiparis: 0,
          acikKalem: 0,
        };
        map.set(key, c);
      }
      return c;
    };

    for (const s of siparisler) {
      const c = al(s.firmaAdi, s.firmaId);
      c.bakiye += siparisBakiyesi(s, odemeler);
      const h = siparisHesap(s, odemeler);
      if (h.kalan <= EPS) continue;
      c.acikSiparis += 1;
      if (!c.enEskiAlacak || s.tarih < c.enEskiAlacak) c.enEskiAlacak = s.tarih;
      if (!c.hedefTarih || s.tarih < c.hedefTarih) {
        c.hedefTarih = s.tarih;
        c.hedefSiparis = s;
        c.hedefKayit = undefined;
      }
      if (!c.waSiparis || h.kalan > siparisHesap(c.waSiparis, odemeler).kalan) c.waSiparis = s;
    }

    for (const k of kayitlar) {
      if (!k.firmaId && !k.personelId && !k.firma) continue;
      // Bakiye etkisi tek yerden: normal kayıtta bir taraf, mahsupta iki taraf, transferde hiç.
      for (const etki of cariEtkileri(k, (x) => kayitBakiyesi(x, kayitDagitimlari))) {
        if (!etki.firmaId && !etki.personelId) continue;
        const hedef =
          etki.firmaId === k.firmaId || etki.personelId === k.personelId
            ? al(k.firma, k.firmaId, k.personelId)
            : al(k.karsiFirma ?? "—", etki.firmaId, etki.personelId);
        hedef.bakiye += etki.etki;
      }
      if (ozelKayitMi(k)) continue;
      const c = al(k.firma, k.firmaId, k.personelId);
      const kalan = kayitKalani(k, kayitDagitimlari);
      if (k.durum !== "aktif" || kalan <= EPS) continue;
      if (k.yon === "gelen") {
        if (!c.enEskiAlacak || k.tarih < c.enEskiAlacak) c.enEskiAlacak = k.tarih;
        if (!c.hedefTarih || k.tarih < c.hedefTarih) {
          c.hedefTarih = k.tarih;
          c.hedefKayit = k;
          c.hedefSiparis = undefined;
        }
      } else {
        c.acikKalem += 1;
        if (!c.enEskiBorc || k.tarih < c.enEskiBorc) c.enEskiBorc = k.tarih;
      }
    }

    return [...map.values()];
  }, [siparisler, kayitlar, firmalar, odemeler, kayitDagitimlari]);

  const alacaklar = useMemo(() => cariler.filter((c) => c.bakiye > EPS).sort((a, b) => b.bakiye - a.bakiye), [cariler]);
  const borclar = useMemo(() => cariler.filter((c) => c.bakiye < -EPS).sort((a, b) => a.bakiye - b.bakiye), [cariler]);
  const alacakToplam = useMemo(() => alacaklar.reduce((s, c) => s + c.bakiye, 0), [alacaklar]);
  const borcToplam = useMemo(() => borclar.reduce((s, c) => s - c.bakiye, 0), [borclar]);

  // Yaşlandırma: her carinin bakiyesi, en eski açık kaleminin gecikmesine göre dilimine yazılır.
  const yaslandirma = useMemo(() => {
    const dilimler = YAS_DILIMLERI.map(() => 0);
    for (const c of alacaklar) {
      const gun = c.enEskiAlacak ? Math.max(0, daysSince(c.enEskiAlacak)) : 0;
      dilimler[dilimIndeksi(gun)] += c.bakiye;
    }
    return dilimler;
  }, [alacaklar]);

  // Vade tarihi girilmiş, hâlâ açık borçlar (çek / senet buraya düşer), vadesi yakın olan önce.
  const vadeliBorclar = useMemo(
    () =>
      kayitlar
        .filter((k) => k.yon === "giden" && k.durum === "aktif" && k.vadeTarihi && kayitKalani(k, kayitDagitimlari) > EPS)
        .map((k) => ({ kayit: k, kalan: kayitKalani(k, kayitDagitimlari) }))
        .sort((a, b) => (a.kayit.vadeTarihi! < b.kayit.vadeTarihi! ? -1 : 1)),
    [kayitlar, kayitDagitimlari]
  );

  // Personel maaş borcu: aktif personelin kalan alacakları. Ticari borçlardan ayrı tutuluyor
  // (ticari değil, personel yükümlülüğü), bu yüzden Ticari Borçlar toplamına eklenmiyor.
  const personel = useMemo(
    () => personelBorcuToplami(calisanlar, personelHareketleri, kayitlar),
    [calisanlar, personelHareketleri, kayitlar]
  );

  // Personel borcu da gerçek bir yükümlülük: net durumdan düşülür. Ticari Borçlar toplamından ise
  // ayrı tutulur (ticari değil), raporda kendi tablosunda görünür.
  const net = hazirDegerler + alacakToplam - borcToplam - personel.toplam;
  const yukleniyor = loading && kayitlar.length === 0;
  const tarih = longDateTR();

  return (
    <div className="page-enter flex flex-col gap-5">
      <YazdirmaBasligi baslik="Finansal Durum Raporu" donem={`${tarih} itibarıyla`} />

      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div className="flex flex-col gap-1">
          <h1 className="text-[26px] font-semibold tracking-[-0.02em]">Finansal Durum Raporu</h1>
          <p className="text-sm text-[var(--muted)]">{tarih} itibarıyla hazır değerler, ticari alacaklar ve ticari borçlar.</p>
        </div>
        <YazdirButonu dosyaAdi={`Finansal Durum Raporu - ${tarih}`} />
      </div>

      <OzetSeridi
        hazirDegerler={hazirDegerler}
        alacak={alacakToplam}
        borc={borcToplam}
        personelBorcu={personel.toplam}
        net={net}
      />

      {yukleniyor ? (
        <div className="card">
          <YukleniyorSatiri />
        </div>
      ) : (
        <div className="card overflow-hidden print:border-0">
          <Bolum baslik="Hazır Değerler" altBaslik="Kasa ve Bankalar">
            <HazirDegerlerTablosu
              satirlar={hesapSatirlari}
              toplam={hazirDegerler}
              acik={acikHesap}
              onToggle={(key) => setAcikHesap(acikHesap === key ? null : key)}
            />
          </Bolum>

          <Bolum
            baslik="Ticari Alacaklar"
            altBaslik="Müşteriler"
            sag={alacaklar.length > 0 ? { href: "/alacaklar", sayi: alacaklar.length } : undefined}
          >
            <AlacakBolumu
              cariler={alacaklar}
              toplam={alacakToplam}
              yaslandirma={yaslandirma}
              odemeler={odemeler}
              onTahsilat={setTahsilatCari}
              onTelefonEksik={(firmaId) => setTelefonFirma(firmalar.find((f) => f.id === firmaId) ?? null)}
            />
          </Bolum>

          <Bolum
            baslik="Ticari Borçlar"
            altBaslik="Tedarikçiler"
            sag={borclar.length > 0 ? { href: "/verecekler", sayi: borclar.length } : undefined}
          >
            <BorcBolumu cariler={borclar} toplam={borcToplam} vadeliBorclar={vadeliBorclar} personel={personel} />
          </Bolum>
        </div>
      )}

      {tahsilatCari?.hedefSiparis && (
        <SiparisOdemeModal
          siparis={tahsilatCari.hedefSiparis}
          kalan={siparisHesap(tahsilatCari.hedefSiparis, odemeler).kalan}
          hesaplar={hesaplar}
          kartOnerileri={oneriler}
          onClose={() => setTahsilatCari(null)}
        />
      )}

      {tahsilatCari?.hedefKayit && (
        <AmountModal
          title={`Tahsilat Al — ${tahsilatCari.ad}`}
          kalan={kayitKalani(tahsilatCari.hedefKayit, kayitDagitimlari)}
          hesaplar={hesaplar}
          kartOnerileri={oneriler}
          defaultSecim={{ odemeSekli: "nakit", bankaHesapId: "", kartAciklama: "" }}
          onClose={() => setTahsilatCari(null)}
          onConfirm={async (tutar, secim, tarih) => {
            try {
              // Alacaklar'daki tek kalemle aynı yol: para önce bu kaleme, artanı firmanın
              // sıradaki en eski açık kalemine düşer.
              const hedef = tahsilatCari.hedefKayit!;
              const { mesaj } = await tahsilatYap(
                {
                  firmaId: hedef.firmaId ?? "",
                  firma: hedef.firma,
                  tarih,
                  tutar,
                  ...secim,
                  aciklama: hedef.aciklama,
                  oncelikli: { hedefTur: "kayit", id: hedef.id },
                },
                { kayitlar, siparisler }
              );
              bildir(mesaj);
              setTahsilatCari(null);
            } catch (err) {
              console.error(err);
              alert("Tahsilat kaydedilemedi, lütfen tekrar deneyin.");
            }
          }}
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
    </div>
  );
}

// Dört kutu: hazır değerler, ticari alacaklar, ticari borçlar ve vurgulu net finansal durum.
// Personel borcu ticari borçlardan ayrı durur ama net durumdan düşülür; izlenebilir olsun diye
// Ticari Borçlar kutusunun altında ayrıca yazılır.
function OzetSeridi({
  hazirDegerler,
  alacak,
  borc,
  personelBorcu,
  net,
}: {
  hazirDegerler: number;
  alacak: number;
  borc: number;
  personelBorcu: number;
  net: number;
}) {
  const artida = net >= 0;
  return (
    <div className="card overflow-hidden grid grid-cols-2 md:grid-cols-4 gap-px !bg-[var(--border)]">
      {[
        { ad: "Hazır Değerler", tutar: hazirDegerler, aciklama: "Nakit + Banka + Kart / POS", alt: "" },
        { ad: "Ticari Alacaklar", tutar: alacak, aciklama: "Müşterilerden tahsil edilecek", alt: "" },
        {
          ad: "Ticari Borçlar",
          tutar: borc,
          aciklama: "Tedarikçilere ödenecek",
          alt: personelBorcu > 0.005 ? `Personel borcu ayrı: ${formatTL(personelBorcu)}` : "",
        },
      ].map((x) => (
        <div key={x.ad} className="px-5 py-4 bg-[var(--surface)]">
          <div className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-[var(--muted)]">{x.ad}</div>
          <div className="tabular text-[19px] font-semibold mt-1">{formatTL(x.tutar)}</div>
          <div className="text-[11px] text-[var(--muted-soft)] mt-0.5">{x.aciklama}</div>
          {x.alt && <div className="text-[11px] text-[var(--muted)] mt-0.5">{x.alt}</div>}
        </div>
      ))}
      <div
        className={`px-5 py-4 ${artida ? "bg-[var(--accent-green-soft)]" : "bg-[var(--accent-red-soft)]"}`}
      >
        <div
          className={`text-[10.5px] font-semibold uppercase tracking-[0.1em] ${
            artida ? "text-[var(--accent-green)]" : "text-[var(--accent-red)]"
          }`}
        >
          Net Finansal Durum
        </div>
        <div
          className={`tabular text-[24px] font-semibold mt-0.5 tracking-[-0.01em] ${
            artida ? "text-[var(--accent-green)]" : "text-[var(--accent-red)]"
          }`}
        >
          {formatTL(net)}
        </div>
        <div className="text-[11px] text-[var(--muted)] mt-0.5">
          Hazır değerler + ticari alacaklar − ticari borçlar{personelBorcu > 0.005 ? " − personel borcu" : ""}
        </div>
      </div>
    </div>
  );
}

function Bolum({
  baslik,
  altBaslik,
  sag,
  children,
}: {
  baslik: string;
  altBaslik: string;
  sag?: { href: string; sayi: number };
  children: React.ReactNode;
}) {
  return (
    <section className="px-5 py-5 border-t border-[var(--border)] first:border-t-0 print:px-0 print:py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-2.5 border-b border-[var(--border-strong)] mb-3">
        <h2 className="rapor-bolum-baslik">
          {baslik}
          <span className="font-normal normal-case tracking-normal text-[12px] text-[var(--muted)] ml-2">— {altBaslik}</span>
        </h2>
        {sag && (
          <Link
            href={sag.href}
            className="text-[11px] text-[var(--muted)] font-medium hover:text-[var(--foreground)] inline-flex items-center gap-1 print:hidden"
          >
            Tümünü gör ({sag.sayi}) <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function HazirDegerlerTablosu({
  satirlar,
  toplam,
  acik,
  onToggle,
}: {
  satirlar: HesapSatiri[];
  toplam: number;
  acik: string | null;
  onToggle: (key: string) => void;
}) {
  return (
    <table className="rapor-tablo">
      <thead>
        <tr>
          <th>Hesap</th>
          <th className="w-[110px]">Tür</th>
          <th className="w-[130px]">Son hareket</th>
          <th className="sag w-[150px]">Bakiye</th>
        </tr>
      </thead>
      <tbody>
        {satirlar.map((s) => {
          const open = acik === s.key;
          return (
            <Fragment key={s.key}>
              <tr
                className="tiklanir"
                role="button"
                tabIndex={0}
                onClick={() => onToggle(s.key)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onToggle(s.key))}
                title="Son hareketleri aç"
              >
                <td className="font-medium">{s.ad}</td>
                <td className="text-[var(--muted)]">{s.tur}</td>
                <td className="tabular text-[var(--muted)]">{s.sonTarih ? formatDate(s.sonTarih) : "—"}</td>
                <td className={`sag font-medium ${s.bakiye < 0 ? "text-[var(--accent-red)]" : ""}`}>{formatTL(s.bakiye)}</td>
              </tr>
              {open && (
                <tr className="print:hidden">
                  <td colSpan={4} className="!pt-0 bg-[var(--surface-hover)]">
                    <HareketListesi satir={s} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
        <tr className="toplam">
          <td colSpan={3}>Toplam hazır değerler</td>
          <td className="sag">{formatTL(toplam)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function HareketListesi({ satir }: { satir: HesapSatiri }) {
  if (satir.hareketler.length === 0) {
    return <p className="text-[11.5px] text-[var(--muted)] py-1">Bu hesapta hareket yok.</p>;
  }
  return (
    <div className="flex flex-col gap-1.5 pt-1">
      <ul className="divide-y divide-[var(--border)]">
        {satir.hareketler.slice(0, SON_HAREKET).map((h, i) => (
          <li
            key={`${h.kayitId}-${h.odemeIndex ?? "p"}-${i}`}
            className="py-1.5 flex items-center justify-between gap-3 text-[12.5px]"
          >
            <span className="min-w-0">
              <span className="block truncate">
                <FirmaLink firmaId={h.firmaId} personelId={h.personelId} ad={h.firma} />
              </span>
              <span className="block text-[11px] text-[var(--muted)] tabular truncate">
                {formatDate(h.tarih)}
                {h.aciklama ? ` · ${h.aciklama}` : ""}
              </span>
            </span>
            <span className={`tabular font-medium shrink-0 ${h.yon === "gelen" ? "text-[var(--accent-green)]" : ""}`}>
              {h.yon === "gelen" ? "+" : "−"}
              {formatTL(h.tutar)}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-[var(--muted-soft)]">
          {satir.hareketler.length > SON_HAREKET ? `Son ${SON_HAREKET} hareket · toplam ${satir.hareketler.length}` : ""}
        </span>
        <Link
          href={satir.link.href}
          className="text-[11px] text-[var(--muted)] font-medium hover:text-[var(--foreground)] inline-flex items-center gap-1 shrink-0"
        >
          {satir.link.etiket} <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

function CariAdi({ c }: { c: Cari }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <FirmaLink firmaId={c.firmaId} personelId={c.personelId} ad={c.ad} className="font-medium" />
      {c.personelId && <span className="badge bg-[#f1f1f4] text-[var(--muted)]">Personel</span>}
      {c.tur && c.tur !== "musteri" && <span className="badge bg-[#f1f1f4] text-[var(--muted)]">{FIRMA_TURU_LABEL[c.tur]}</span>}
    </span>
  );
}

function Yaslandirma({ dilimler, toplam }: { dilimler: number[]; toplam: number }) {
  const oran = (t: number) => (toplam > EPS ? (t / toplam) * 100 : 0);
  return (
    <div className="mb-4">
      <div className="flex h-2 rounded-full overflow-hidden bg-[var(--border)]">
        {dilimler.map((t, i) =>
          t > EPS ? (
            <div key={i} style={{ width: `${oran(t)}%`, background: YAS_DILIMLERI[i].renk }} title={YAS_DILIMLERI[i].ad} />
          ) : null
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1.5 mt-2.5">
        {dilimler.map((t, i) => (
          <div key={i} className="flex items-baseline gap-2">
            <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5" style={{ background: YAS_DILIMLERI[i].renk }} />
            <span className="min-w-0">
              <span className="block text-[10.5px] uppercase tracking-[0.08em] text-[var(--muted)]">{YAS_DILIMLERI[i].ad}</span>
              <span className="block tabular text-[13px] font-medium">
                {formatTL(t)}
                <span className="text-[11px] font-normal text-[var(--muted)] ml-1.5">%{oran(t).toFixed(1)}</span>
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AlacakBolumu({
  cariler,
  toplam,
  yaslandirma,
  odemeler,
  onTahsilat,
  onTelefonEksik,
}: {
  cariler: Cari[];
  toplam: number;
  yaslandirma: number[];
  odemeler: Map<string, number>;
  onTahsilat: (c: Cari) => void;
  onTelefonEksik: (firmaId?: string) => void;
}) {
  if (cariler.length === 0) {
    return <p className="text-[13px] text-[var(--muted)] py-2">Açık ticari alacak bulunmuyor.</p>;
  }
  const gorunen = cariler.slice(0, LISTE_SINIRI);
  const kalanSayi = cariler.length - gorunen.length;
  const kalanTutar = toplam - gorunen.reduce((s, c) => s + c.bakiye, 0);

  return (
    <>
      <Yaslandirma dilimler={yaslandirma} toplam={toplam} />
      <table className="rapor-tablo">
        <thead>
          <tr>
            <th>Müşteri</th>
            <th className="sag w-[110px]">Açık sipariş</th>
            <th className="w-[120px]">En eski tarih</th>
            <th className="sag w-[110px]">Gecikme</th>
            <th className="sag w-[150px]">Bakiye</th>
            <th className="w-[80px] print:hidden"></th>
          </tr>
        </thead>
        <tbody>
          {gorunen.map((c) => {
            const gun = c.enEskiAlacak ? Math.max(0, daysSince(c.enEskiAlacak)) : 0;
            const dilim = YAS_DILIMLERI[dilimIndeksi(gun)];
            return (
              <tr key={c.key}>
                <td>
                  <CariAdi c={c} />
                </td>
                <td className="sag text-[var(--muted)]">{c.acikSiparis || "—"}</td>
                <td className="tabular text-[var(--muted)]">{c.enEskiAlacak ? formatDate(c.enEskiAlacak) : "—"}</td>
                <td className={`sag ${dilim.yazi}`}>{gun > 0 ? `${gun} gün` : "—"}</td>
                <td className="sag font-medium">{formatTL(c.bakiye)}</td>
                <td className="print:hidden">
                  <div className="flex items-center gap-0.5 justify-end">
                    <WhatsappButonu
                      telefon={c.telefon}
                      mesaj={
                        c.waSiparis ? siparisWaMesaji(c.waSiparis, siparisHesap(c.waSiparis, odemeler)) : firmaWaMesaji(c.bakiye)
                      }
                      onTelefonEksik={() => onTelefonEksik(c.firmaId)}
                    />
                    {(c.hedefSiparis || c.hedefKayit) && (
                      <button
                        type="button"
                        className="icon-btn"
                        title="Tahsilat al"
                        aria-label="Tahsilat al"
                        onClick={() => onTahsilat(c)}
                      >
                        <ArrowDownIcon />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {kalanSayi > 0 && (
            <tr>
              <td colSpan={4} className="text-[var(--muted)]">
                Diğer {kalanSayi} müşteri
              </td>
              <td className="sag text-[var(--muted)]">{formatTL(kalanTutar)}</td>
              <td className="print:hidden" />
            </tr>
          )}
          <tr className="toplam">
            <td colSpan={4}>Toplam ticari alacaklar · {cariler.length} müşteri</td>
            <td className="sag">{formatTL(toplam)}</td>
            <td className="print:hidden" />
          </tr>
        </tbody>
      </table>
    </>
  );
}

// Satır sonundaki küçük "Tahsilat al" simgesi (listeyi kalabalıklaştırmayan buton).
function ArrowDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="w-3.5 h-3.5">
      <path d="M12 4v10" strokeLinecap="round" />
      <path d="M7.5 10.5 12 15l4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19.5h14" strokeLinecap="round" />
    </svg>
  );
}

// Tedarikçi bakiyeleri (devir bakiyeleri dahil), altında vade tarihli ödemeler ve personel maaş
// borcu. Personel kalemi ticari borç sayılmadığı için Ticari Borçlar toplamına dahil edilmiyor.
function BorcBolumu({
  cariler,
  toplam,
  vadeliBorclar,
  personel,
}: {
  cariler: Cari[];
  toplam: number;
  vadeliBorclar: { kayit: KasaKaydi; kalan: number }[];
  personel: { toplam: number; satirlar: { calisan: Calisan; kalan: number }[] };
}) {
  const gorunen = cariler.slice(0, LISTE_SINIRI);
  const kalanSayi = cariler.length - gorunen.length;
  const kalanTutar = toplam - gorunen.reduce((s, c) => s - c.bakiye, 0);

  return (
    <>
      {cariler.length === 0 ? (
        <p className="text-[13px] text-[var(--muted)] py-2">Açık ticari borç bulunmuyor.</p>
      ) : (
        <table className="rapor-tablo">
          <thead>
            <tr>
              <th>Tedarikçi</th>
              <th className="sag w-[110px]">Açık kalem</th>
              <th className="w-[120px]">En eski tarih</th>
              <th className="sag w-[150px]">Bakiye</th>
            </tr>
          </thead>
          <tbody>
            {gorunen.map((c) => (
              <tr key={c.key}>
                <td>
                  <CariAdi c={c} />
                </td>
                <td className="sag text-[var(--muted)]">{c.acikKalem || "—"}</td>
                <td className="tabular text-[var(--muted)]">{c.enEskiBorc ? formatDate(c.enEskiBorc) : "—"}</td>
                <td className="sag font-medium">{formatTL(-c.bakiye)}</td>
              </tr>
            ))}
            {kalanSayi > 0 && (
              <tr>
                <td colSpan={3} className="text-[var(--muted)]">
                  Diğer {kalanSayi} tedarikçi
                </td>
                <td className="sag text-[var(--muted)]">{formatTL(kalanTutar)}</td>
              </tr>
            )}
            <tr className="toplam">
              <td colSpan={3}>Toplam ticari borçlar · {cariler.length} tedarikçi</td>
              <td className="sag">{formatTL(toplam)}</td>
            </tr>
          </tbody>
        </table>
      )}

      <div className="mt-5 pt-3 border-t border-[var(--border)]">
        <h3 className="rapor-bolum-baslik !text-[10.5px] text-[var(--muted)] mb-2">Vadesi Yaklaşan Ödemeler</h3>
        {vadeliBorclar.length === 0 ? (
          <p className="text-[12px] text-[var(--muted)]">
            Vade tarihi girilmiş açık borç kaydı bulunmuyor. Çek ve senetler vade tarihli borç olarak kaydedildiğinde bu
            tabloda listelenir.
          </p>
        ) : (
          <table className="rapor-tablo">
            <thead>
              <tr>
                <th className="w-[120px]">Vade</th>
                <th>Firma</th>
                <th>Açıklama</th>
                <th className="sag w-[150px]">Tutar</th>
              </tr>
            </thead>
            <tbody>
              {vadeliBorclar.map(({ kayit: k, kalan }) => {
                const durum = vadeDurumu(k.vadeTarihi!);
                return (
                  <tr key={k.id}>
                    <td className={`tabular ${VADE_RENK[durum]} ${durum === "normal" ? "text-[var(--muted)]" : "font-medium"}`}>
                      {durum === "gecti" && <AlertTriangle className="w-3 h-3 inline -mt-0.5 mr-1" />}
                      {formatDate(k.vadeTarihi!)}
                    </td>
                    <td>
                      <FirmaLink firmaId={k.firmaId} personelId={k.personelId} ad={k.firma} className="font-medium" />
                    </td>
                    <td className="text-[var(--muted)]">{k.aciklama || "—"}</td>
                    <td className={`sag font-medium ${VADE_RENK[durum]}`}>{formatTL(kalan)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-5 pt-3 border-t border-[var(--border)]">
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          <h3 className="rapor-bolum-baslik !text-[10.5px] text-[var(--muted)]">Personel</h3>
          <span className="text-[11px] text-[var(--muted)]">Aktif personelin kalan maaş alacağı</span>
        </div>
        {personel.satirlar.length === 0 ? (
          <p className="text-[12px] text-[var(--muted)] mt-1.5">Personele ödenmemiş maaş alacağı bulunmuyor.</p>
        ) : (
          <table className="rapor-tablo mt-1.5">
            <thead>
              <tr>
                <th>Personel</th>
                <th className="w-[140px]">Maaş</th>
                <th className="sag w-[150px]">Kalan</th>
              </tr>
            </thead>
            <tbody>
              {personel.satirlar.map(({ calisan, kalan }) => (
                <tr key={calisan.id}>
                  <td>
                    <Link href={`/calisanlar/${calisan.id}`} className="font-medium hover:underline underline-offset-2">
                      {calisan.adSoyad}
                    </Link>
                  </td>
                  <td className="text-[var(--muted)]">
                    {MAAS_TURU_LABEL[maasTuru(calisan)]}
                    {calisan.maasTutari ? ` · ${formatTL(calisan.maasTutari)}` : ""}
                  </td>
                  <td className={`sag font-medium ${kalan < 0 ? "text-[var(--accent-green)]" : ""}`}>{formatTL(kalan)}</td>
                </tr>
              ))}
              <tr className="toplam">
                <td colSpan={2}>Toplam personel borcu · {personel.satirlar.length} personel</td>
                <td className="sag">{formatTL(personel.toplam)}</td>
              </tr>
            </tbody>
          </table>
        )}
        <p className="text-[10.5px] text-[var(--muted-soft)] mt-1.5">
          Personel borcu ticari borç sayılmadığı için Ticari Borçlar toplamına dahil edilmez; Net Finansal Durum&apos;dan ise
          düşülür.
        </p>
      </div>
    </>
  );
}
