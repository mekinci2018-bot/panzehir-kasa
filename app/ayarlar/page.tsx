"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, CloudUpload, Download, History, Loader2, RotateCcw, XCircle } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useYedekDurumu } from "@/lib/hooks";
import {
  YedekApiHatasi,
  bilgisayaraIndir,
  boyutYaz,
  driveGeriYukle,
  driveYedekleri,
  simdiYedekAl,
  type DriveYedegi,
} from "@/lib/yedekIstemci";
import type { YedekSonucu, YedekTuru } from "@/lib/types";

const TUR_LABEL: Record<YedekTuru, string> = {
  gunluk: "Gece yedeği",
  tam: "Haftalık tam yedek",
  elle: "Elle alınan yedek",
  "elle-tam": "Elle alınan tam yedek",
  "geri-yukleme-oncesi": "Geri yükleme öncesi yedek",
};

const ONAY_METNI = "GERİ YÜKLE";

function zamanYaz(ms: number) {
  return new Date(ms).toLocaleString("tr-TR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type Islem = { tur: "yedek" | "indir" | "liste" | "geri"; metin: string } | null;
type Mesaj = { tur: "tamam" | "hata"; metin: string; eksikler?: string[] } | null;

export default function AyarlarPage() {
  const { durum, loading } = useYedekDurumu();
  const [gorsellerDahil, setGorsellerDahil] = useState(false);
  const [islem, setIslem] = useState<Islem>(null);
  const [mesaj, setMesaj] = useState<Mesaj>(null);
  const [yedekler, setYedekler] = useState<DriveYedegi[] | null>(null);
  const [secili, setSecili] = useState<DriveYedegi | null>(null);

  async function calistir(i: NonNullable<Islem>, is: () => Promise<string>) {
    setIslem(i);
    setMesaj(null);
    try {
      setMesaj({ tur: "tamam", metin: await is() });
    } catch (err) {
      console.error(err);
      setMesaj({
        tur: "hata",
        metin: err instanceof Error ? err.message : "İşlem tamamlanamadı.",
        eksikler: err instanceof YedekApiHatasi ? err.eksikler : undefined,
      });
    } finally {
      setIslem(null);
    }
  }

  const mesgul = islem !== null;

  return (
    <div className="page-enter flex flex-col gap-6 max-w-3xl">
      <PageHeader title="Ayarlar" description="Yedekleme ve geri yükleme." />

      <section className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="font-semibold">Yedek durumu</h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            Her gece 03:00&apos;te Google Drive&apos;daki &ldquo;Panzehir Yedekler&rdquo; klasörüne görseller hariç yedek alınır; pazar
            gecesi görseller dahil tam yedek de alınır. Son 30 günün yedekleri ve son 8 tam yedek saklanır.
          </p>
        </div>
        {loading ? (
          <div className="px-5 py-6 text-sm text-[var(--muted)] flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor…
          </div>
        ) : (
          <dl className="divide-y divide-[var(--border)] text-sm">
            <DurumSatiri baslik="Son otomatik yedek" sonuc={durum?.sonOtomatik} />
            <DurumSatiri baslik="Son tam yedek" sonuc={durum?.sonTam} />
            <DurumSatiri baslik="En son yedek" sonuc={durum?.son} />
            {durum?.sonGeriYukleme && (
              <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                <dt className="text-[var(--muted)]">Son geri yükleme</dt>
                <dd className="flex items-center gap-2">
                  {durum.sonGeriYukleme.basarili ? (
                    <CheckCircle2 className="w-4 h-4 text-[var(--accent-green)]" />
                  ) : (
                    <XCircle className="w-4 h-4 text-[var(--brand)]" />
                  )}
                  <span className="tabular">{zamanYaz(durum.sonGeriYukleme.zaman)}</span>
                  <span className="text-xs text-[var(--muted)] truncate max-w-[260px]">{durum.sonGeriYukleme.dosya}</span>
                </dd>
              </div>
            )}
          </dl>
        )}
      </section>

      <section className="card p-5 flex flex-col gap-4">
        <div>
          <h2 className="font-semibold">Elle yedek</h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            &ldquo;Şimdi Yedek Al&rdquo; Drive&apos;a yükler; &ldquo;Bilgisayara İndir&rdquo; dosyayı bu cihaza kaydeder.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none w-fit">
          <input type="checkbox" className="w-4 h-4 accent-[var(--ink)]" checked={gorsellerDahil} onChange={(e) => setGorsellerDahil(e.target.checked)} />
          Görseller dahil (tam yedek; dosya büyük olur)
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-primary inline-flex items-center gap-2 disabled:opacity-40"
            disabled={mesgul}
            onClick={() =>
              calistir({ tur: "yedek", metin: "Drive'a yedekleniyor…" }, async () => {
                const s = await simdiYedekAl(gorsellerDahil);
                return `Yedek Drive'a yüklendi: ${s.dosyalar?.join(", ")} (${boyutYaz(s.boyut ?? 0)})`;
              })
            }
          >
            {islem?.tur === "yedek" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
            Şimdi Yedek Al
          </button>
          <button
            className="btn-secondary inline-flex items-center gap-2 disabled:opacity-40"
            disabled={mesgul}
            onClick={() =>
              calistir({ tur: "indir", metin: "Hazırlanıyor…" }, async () => {
                const boyut = await bilgisayaraIndir(gorsellerDahil, (metin) => setIslem({ tur: "indir", metin }));
                return `Yedek dosyası indirildi (${boyutYaz(boyut)}).`;
              })
            }
          >
            {islem?.tur === "indir" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Bilgisayara İndir
          </button>
        </div>
        {islem && (islem.tur === "yedek" || islem.tur === "indir") && <p className="text-xs text-[var(--muted)]">{islem.metin}</p>}
      </section>

      <section className="card overflow-hidden">
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)]">
          <div>
            <h2 className="font-semibold">Geri yükleme</h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Drive&apos;daki bir yedeğe dönülür. Öncesinde mevcut verinin yedeği otomatik olarak alınır.
            </p>
          </div>
          <button
            className="btn-secondary inline-flex items-center gap-2 disabled:opacity-40"
            disabled={mesgul}
            onClick={() =>
              calistir({ tur: "liste", metin: "Yedekler getiriliyor…" }, async () => {
                const liste = await driveYedekleri();
                setYedekler(liste);
                return liste.length ? `Drive'da ${liste.length} yedek bulundu.` : "Drive'da henüz yedek yok.";
              })
            }
          >
            {islem?.tur === "liste" ? <Loader2 className="w-4 h-4 animate-spin" /> : <History className="w-4 h-4" />}
            {yedekler ? "Listeyi yenile" : "Drive'daki yedekleri göster"}
          </button>
        </div>
        {yedekler && yedekler.length > 0 && (
          <ul className="divide-y divide-[var(--border)] max-h-[50vh] overflow-y-auto">
            {yedekler.map((y) => (
              <li key={y.ad} className="px-5 py-2.5 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{y.ad}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {zamanYaz(Date.parse(y.olusturma))} · {boyutYaz(y.boyut)}
                    {y.tam ? " · görseller dahil" : ""}
                    {y.parca > 1 ? ` · ${y.parca} parça` : ""}
                  </div>
                </div>
                <button
                  className="btn-secondary !py-1.5 !px-3 !text-xs inline-flex items-center gap-1.5 shrink-0 disabled:opacity-40"
                  disabled={mesgul}
                  onClick={() => setSecili(y)}
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Geri yükle
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {mesaj && (
        <div
          className={`rounded-[12px] px-4 py-3 text-sm ${
            mesaj.tur === "tamam" ? "bg-[var(--accent-green-soft)] text-[var(--accent-green)]" : "bg-[var(--brand-soft)] text-[var(--brand-dark)]"
          }`}
        >
          {mesaj.metin}
          {mesaj.eksikler && (
            <p className="mt-1 text-xs">
              Vercel → Settings → Environment Variables bölümüne şu değişkenleri ekleyip yeniden yayınlayın:{" "}
              <span className="font-mono">{mesaj.eksikler.join(", ")}</span>
            </p>
          )}
        </div>
      )}

      {secili && (
        <GeriYukleOnayi
          yedek={secili}
          busy={islem?.tur === "geri"}
          onClose={() => setSecili(null)}
          onConfirm={() =>
            calistir({ tur: "geri", metin: "Geri yükleniyor…" }, async () => {
              const r = await driveGeriYukle(secili.ad);
              setSecili(null);
              const toplam = Object.values(r.koleksiyonlar).reduce((s, n) => s + n, 0);
              return `Geri yükleme tamamlandı (${toplam} belge). Önceki verinin yedeği: ${r.oncekiYedek.dosyalar?.join(", ")}`;
            })
          }
        />
      )}
    </div>
  );
}

function DurumSatiri({ baslik, sonuc }: { baslik: string; sonuc?: YedekSonucu }) {
  return (
    <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-2">
      <dt className="text-[var(--muted)]">{baslik}</dt>
      <dd className="flex items-center gap-2 min-w-0">
        {!sonuc ? (
          <span className="text-[var(--muted-soft)]">Henüz yok</span>
        ) : (
          <>
            {sonuc.basarili ? (
              <CheckCircle2 className="w-4 h-4 text-[var(--accent-green)] shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-[var(--brand)] shrink-0" />
            )}
            <span className="tabular">{zamanYaz(sonuc.zaman)}</span>
            <span className="text-xs text-[var(--muted)] truncate max-w-[280px]" title={sonuc.hata ?? sonuc.dosyalar?.join(", ")}>
              {sonuc.basarili ? `${TUR_LABEL[sonuc.tur]} · ${boyutYaz(sonuc.boyut ?? 0)}` : sonuc.hata}
            </span>
          </>
        )}
      </dd>
    </div>
  );
}

function GeriYukleOnayi({
  yedek,
  busy,
  onClose,
  onConfirm,
}: {
  yedek: DriveYedegi;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [yazi, setYazi] = useState("");
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md p-6 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-[var(--brand-soft)] flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-[var(--brand)]" />
          </div>
          <div>
            <h3 className="font-semibold text-base">Bu yedeğe geri dönülsün mü?</h3>
            <p className="text-sm text-[var(--muted)] mt-1">
              <span className="font-medium text-[var(--foreground)]">{yedek.ad}</span> yüklenecek. Bu yedekten sonra girilen kayıtlar ve
              siparişler silinir, değiştirilenler eski hâline döner.
              {yedek.tam ? " Görseller de bu yedektekilerle değiştirilir." : " Görseller olduğu gibi kalır."}
            </p>
            <p className="text-sm text-[var(--muted)] mt-2">Başlamadan önce mevcut verinin yedeği Drive&apos;a otomatik alınır.</p>
          </div>
        </div>
        <div>
          <label className="field-label">Onaylamak için {ONAY_METNI} yazın</label>
          <input className="input-field" value={yazi} onChange={(e) => setYazi(e.target.value)} autoFocus />
        </div>
        <div className="flex gap-2 justify-end">
          <button className="btn-secondary" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button
            className="btn-primary !bg-[var(--brand)] hover:!bg-[var(--brand-dark)] inline-flex items-center gap-2 disabled:opacity-40"
            disabled={busy || yazi.trim().toLocaleUpperCase("tr-TR") !== ONAY_METNI}
            onClick={onConfirm}
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Geri yükle
          </button>
        </div>
      </div>
    </div>
  );
}
