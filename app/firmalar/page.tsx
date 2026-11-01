"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Building2, Link2, Merge, Plus, Search, Upload, Wand2 } from "lucide-react";
import { useFirmalar, useKasaKayitlari, useSiparisler } from "@/lib/hooks";
import { firmaSiparisOzetleri, siparisOdemeleri } from "@/lib/siparis";
import { addFirma, firmaTelefonGuncelle, FirmaZatenVar, kayitlariFirmayaBagla, kilitleriTamamla } from "@/lib/db";
import { benzerFirmalar, cariOzetleri, FIRMA_TURU_LABEL, firmaAdiDuzenle, firmaAnahtari, firmaTuru } from "@/lib/firma";
import { telefonNormallestir } from "@/lib/telefonIceAktar";
import { formatDate, formatTL } from "@/lib/format";
import type { Firma, FirmaTuru } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import YukleniyorSatiri from "@/components/YukleniyorSatiri";
import BakiyeHucre from "@/components/BakiyeHucre";
import { SiraTh } from "@/components/SiraBasligi";
import { sirala, useSiralama, type SiraSutunlari } from "@/lib/siralama";
import FirmaBirlestirModal from "@/components/FirmaBirlestirModal";
import FirmaIslemMenu from "@/components/FirmaIslemMenu";
import FirmaFormModal, { TurSecici } from "@/components/FirmaFormModal";
import TopluTelefonModal from "@/components/TopluTelefonModal";

const SEKMELER: { tur: FirmaTuru; label: string }[] = [
  { tur: "musteri", label: "Müşteriler" },
  { tur: "tedarikci", label: "Tedarikçiler" },
  { tur: "gider", label: "Gider Kalemleri" },
];

interface EslesmeyenGrup {
  anahtar: string;
  ad: string; // the most common spelling among the records
  kayitIds: string[];
  onerilenTur: FirmaTuru; // only outgoing records → probably a supplier
  tam?: Firma; // a company with exactly this normalized name
  benzer: Firma[];
}

export default function FirmalarPage() {
  const { firmalar, loading } = useFirmalar();
  const { kayitlar, silinenler } = useKasaKayitlari();
  // Renames and merges also carry records sitting in Çöp Kutusu, so a restore lands on the right company.
  const tumKayitlar = useMemo(() => [...kayitlar, ...silinenler], [kayitlar, silinenler]);
  const { siparisler, silinenler: silinenSiparisler } = useSiparisler();
  const tumSiparisler = useMemo(() => [...siparisler, ...silinenSiparisler], [siparisler, silinenSiparisler]);
  const [sekme, setSekme] = useState<FirmaTuru>("musteri");
  const [arama, setArama] = useState("");
  const [secili, setSecili] = useState<string[]>([]);
  const [form, setForm] = useState<{ firma?: Firma } | null>(null);
  const [birlestir, setBirlestir] = useState(false);
  const [topluTelefon, setTopluTelefon] = useState(false);

  // Companies created before name locks existed get theirs once, the first time this page loads.
  const kilitDenendi = useRef(false);
  useEffect(() => {
    if (loading || kilitDenendi.current || !firmalar.some((f) => !f.kilitli)) return;
    kilitDenendi.current = true;
    kilitleriTamamla(firmalar).catch((err) => console.error(err));
  }, [firmalar, loading]);

  const odemeler = useMemo(() => siparisOdemeleri(kayitlar), [kayitlar]);
  const ozetler = useMemo(() => cariOzetleri(kayitlar, "firmaId", siparisler, odemeler), [kayitlar, siparisler, odemeler]);
  const siparisOzetleri = useMemo(() => firmaSiparisOzetleri(siparisler, odemeler), [siparisler, odemeler]);

  const sayilar = useMemo(() => {
    const s: Record<FirmaTuru, number> = { musteri: 0, tedarikci: 0, gider: 0 };
    for (const f of firmalar) s[firmaTuru(f)] += 1;
    return s;
  }, [firmalar]);

  const { sira, sirala: siraDegistir } = useSiralama("firmalar");
  const liste = useMemo(() => {
    const k = firmaAnahtari(arama);
    const t = arama.replace(/\D/g, "");
    const giderMi = sekme === "gider";
    // The count, amount and date columns show different figures for expense items.
    const sutunlar: SiraSutunlari<Firma> = {
      ad: (f) => f.ad,
      telefon: (f) => f.telefon,
      adet: (f) => (giderMi ? ozetler.get(f.id)?.kayitSayisi ?? 0 : siparisOzetleri.get(f.id)?.siparisSayisi ?? 0),
      tutar: (f) => (giderMi ? ozetler.get(f.id)?.harcama ?? 0 : ozetler.get(f.id)?.bakiye ?? 0),
      son: (f) => (giderMi ? ozetler.get(f.id)?.sonTarih : siparisOzetleri.get(f.id)?.sonTarih),
    };
    return sirala(
      firmalar.filter(
        (f) =>
          firmaTuru(f) === sekme &&
          (!k || f.anahtar.includes(k) || (t.length >= 3 && !!f.telefon?.replace(/\D/g, "").includes(t)))
      ),
      sira,
      sutunlar
    );
  }, [firmalar, arama, sekme, sira, ozetler, siparisOzetleri]);

  const eslesmeyenler = useMemo(() => {
    const map = new Map<string, { kayitIds: string[]; adlar: Map<string, number>; gelenVar: boolean }>();
    for (const k of kayitlar) {
      if (k.firmaId || k.personelId || !k.firma.trim()) continue;
      const anahtar = firmaAnahtari(k.firma);
      const g = map.get(anahtar) ?? { kayitIds: [], adlar: new Map<string, number>(), gelenVar: false };
      g.kayitIds.push(k.id);
      g.adlar.set(k.firma.trim(), (g.adlar.get(k.firma.trim()) ?? 0) + 1);
      if (k.yon === "gelen") g.gelenVar = true;
      map.set(anahtar, g);
    }
    const gruplar: EslesmeyenGrup[] = [...map.entries()].map(([anahtar, g]) => {
      const ad = [...g.adlar.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const tam = firmalar.find((f) => f.anahtar === anahtar);
      return {
        anahtar,
        ad,
        kayitIds: g.kayitIds,
        onerilenTur: g.gelenVar ? "musteri" : "tedarikci",
        tam,
        benzer: tam ? [] : benzerFirmalar(ad, firmalar),
      };
    });
    return gruplar.sort((a, b) => b.kayitIds.length - a.kayitIds.length);
  }, [kayitlar, firmalar]);

  function toggle(id: string) {
    setSecili((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  const seciliFirmalar = secili.map((id) => firmalar.find((f) => f.id === id)).filter(Boolean) as Firma[];
  const gider = sekme === "gider";

  return (
    <div className="page-enter flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader title="Firmalar" description="Cari hesaplar ve gider kalemleri. Firma adına tıklayınca ekstresi açılır." />
        <div className="flex items-center gap-2">
          <button className="btn-secondary inline-flex items-center gap-2" onClick={() => setTopluTelefon(true)}>
            <Upload className="w-4 h-4" /> Toplu telefon ekle
          </button>
          <button className="btn-primary inline-flex items-center gap-2" onClick={() => setForm({})}>
            <Plus className="w-4 h-4" /> Yeni Firma
          </button>
        </div>
      </div>

      {eslesmeyenler.length > 0 && <Eslestirme gruplar={eslesmeyenler} firmalar={firmalar} />}

      <div className="flex flex-wrap gap-1.5">
        {SEKMELER.map((s) => (
          <button
            key={s.tur}
            className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
              sekme === s.tur ? "bg-[var(--ink)] text-white" : "bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
            onClick={() => {
              setSekme(s.tur);
              setSecili([]);
            }}
          >
            {s.label}
            <span className={`ml-1.5 tabular text-xs ${sekme === s.tur ? "text-white/60" : "text-[var(--muted-soft)]"}`}>{sayilar[s.tur]}</span>
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-soft)]" />
            <input
              className="input-field !pl-9"
              placeholder={gider ? "Gider kalemi ara" : "Firma adı ya da telefon ara"}
              value={arama}
              onChange={(e) => setArama(e.target.value)}
            />
          </div>
          {secili.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[var(--muted)]">{secili.length} seçildi</span>
              <button
                className="btn-primary !py-1.5 !px-3 !text-xs inline-flex items-center gap-1.5 disabled:opacity-40"
                disabled={secili.length !== 2}
                title={secili.length !== 2 ? "Birleştirmek için tam iki kayıt seçin" : undefined}
                onClick={() => setBirlestir(true)}
              >
                <Merge className="w-3.5 h-3.5" /> Birleştir
              </button>
              <button className="btn-secondary !py-1.5 !px-3 !text-xs" onClick={() => setSecili([])}>
                Temizle
              </button>
            </div>
          )}
        </div>

        {loading && firmalar.length === 0 ? (
          <YukleniyorSatiri />
        ) : sayilar[sekme] === 0 ? (
          <EmptyState
            icon={Building2}
            title={gider ? "Henüz gider kalemi yok" : `Henüz ${FIRMA_TURU_LABEL[sekme].toLocaleLowerCase("tr-TR")} yok`}
            description={
              gider
                ? "Kira, Elektrik, Yakıt gibi kalemleri Kasa'da yazarken 'Gider Kalemi' olarak ekleyebilirsin."
                : "'Yeni Firma' ile ekleyebilir, Kasa'da firma yazarken listeden ekleyebilir ya da yukarıdan eski kayıtları eşleştirebilirsin."
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="w-full text-sm data-table">
              <thead>
                <tr>
                  <th className="w-[44px]"></th>
                  <SiraTh sutun="ad" sira={sira} onSirala={siraDegistir}>{gider ? "Gider Kalemi" : "Firma"}</SiraTh>
                  {!gider && <SiraTh sutun="telefon" sira={sira} onSirala={siraDegistir} className="w-[150px]">Telefon</SiraTh>}
                  <SiraTh sutun="adet" sira={sira} onSirala={siraDegistir} className="w-[90px] text-right">{gider ? "Kayıt" : "Sipariş"}</SiraTh>
                  <SiraTh sutun="tutar" sira={sira} onSirala={siraDegistir} className="w-[170px] text-right">{gider ? "Toplam Harcama" : "Bakiye"}</SiraTh>
                  <SiraTh sutun="son" sira={sira} onSirala={siraDegistir} className="w-[120px]">{gider ? "Son işlem" : "Son sipariş"}</SiraTh>
                  <th className="w-[52px]"></th>
                </tr>
              </thead>
              <tbody>
                {liste.map((f) => {
                  const o = ozetler.get(f.id);
                  const so = siparisOzetleri.get(f.id);
                  return (
                    <tr key={f.id}>
                      <td>
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-[var(--ink)] cursor-pointer"
                          checked={secili.includes(f.id)}
                          onChange={() => toggle(f.id)}
                          aria-label={`${f.ad} seç`}
                        />
                      </td>
                      <td>
                        <Link href={`/firmalar/${f.id}`} className="font-medium hover:underline underline-offset-2 decoration-[var(--border-strong)]">
                          {f.ad}
                        </Link>
                        {f.pasif && <span className="badge bg-[#f1f1f4] text-[var(--muted)] ml-1.5">Pasif</span>}
                        {f.not && <div className="text-xs text-[var(--muted)] truncate max-w-md">{f.not}</div>}
                      </td>
                      {!gider && (
                        <td>
                          <TelefonHucre value={f.telefon ?? ""} onCommit={(v) => firmaTelefonGuncelle(f.id, telefonNormallestir(v) ?? v)} />
                        </td>
                      )}
                      <td className="num">{gider ? o?.kayitSayisi ?? 0 : so?.siparisSayisi ?? 0}</td>
                      <td className="num">{gider ? <span className="font-medium">{formatTL(o?.harcama ?? 0)}</span> : <BakiyeHucre bakiye={o?.bakiye ?? 0} />}</td>
                      <td className="tabular text-[var(--muted)]">
                        {gider ? (o?.sonTarih ? formatDate(o.sonTarih) : "—") : so?.sonTarih ? formatDate(so.sonTarih) : "—"}
                      </td>
                      <td>
                        <div className="flex items-center justify-end">
                          <FirmaIslemMenu
                            firma={f}
                            firmalar={firmalar}
                            kayitlar={tumKayitlar}
                            siparisler={tumSiparisler}
                            onEdit={() => setForm({ firma: f })}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {liste.length === 0 && sayilar[sekme] > 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-[var(--muted)] py-8">
                      &ldquo;{arama}&rdquo; ile eşleşen kayıt yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {form && (
        <FirmaFormModal
          firma={form.firma}
          varsayilanTur={sekme}
          firmalar={firmalar}
          bagliKayitlar={form.firma ? tumKayitlar.filter((k) => k.firmaId === form.firma!.id) : []}
          bagliSiparisIds={form.firma ? tumSiparisler.filter((s) => s.firmaId === form.firma!.id).map((s) => s.id) : []}
          onClose={() => setForm(null)}
        />
      )}

      {birlestir && seciliFirmalar.length === 2 && (
        <FirmaBirlestirModal
          firmalar={seciliFirmalar as [Firma, Firma]}
          kayitlar={tumKayitlar}
          siparisler={tumSiparisler}
          onClose={() => setBirlestir(false)}
          onDone={() => {
            setBirlestir(false);
            setSecili([]);
          }}
        />
      )}

      {topluTelefon && <TopluTelefonModal firmalar={firmalar} onClose={() => setTopluTelefon(false)} />}
    </div>
  );
}

function Eslestirme({ gruplar, firmalar }: { gruplar: EslesmeyenGrup[]; firmalar: Firma[] }) {
  const [acik, setAcik] = useState(false);
  const [busy, setBusy] = useState(false);
  const [secimler, setSecimler] = useState<Record<string, string>>({});
  const [turler, setTurler] = useState<Record<string, FirmaTuru>>({});
  const kayitSayisi = gruplar.reduce((s, g) => s + g.kayitIds.length, 0);

  // Safe to automate: exact matches, and names unlike any company or any other unmatched name.
  const otomatik = useMemo(() => {
    const sahte = gruplar.map((g) => ({ id: g.anahtar, ad: g.ad, anahtar: g.anahtar }) as Firma);
    const bagla = gruplar.filter((g) => g.tam);
    const ekle = gruplar.filter(
      (g) => !g.tam && g.benzer.length === 0 && benzerFirmalar(g.ad, sahte.filter((s) => s.id !== g.anahtar)).length === 0
    );
    return { bagla, ekle };
  }, [gruplar]);

  async function calistir(is: () => Promise<void>) {
    setBusy(true);
    try {
      await is();
    } catch (err) {
      console.error(err);
      alert("İşlem tamamlanamadı, lütfen tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  async function yeniFirmaIleBagla(g: EslesmeyenGrup, tur: FirmaTuru, mevcut: Firma[]) {
    let firma: Firma;
    try {
      firma = await addFirma(g.ad, mevcut, { tur });
    } catch (err) {
      if (!(err instanceof FirmaZatenVar)) throw err;
      firma = err.firma;
    }
    await kayitlariFirmayaBagla(g.kayitIds, firma);
    return firma;
  }

  function otomatikEslestir() {
    const { bagla, ekle } = otomatik;
    if (!confirm(`${bagla.length} ad mevcut firmaya bağlanacak, ${ekle.length} ad yeni firma olarak eklenecek. Devam edilsin mi?`)) return;
    calistir(async () => {
      for (const g of bagla) await kayitlariFirmayaBagla(g.kayitIds, g.tam!);
      const mevcut = [...firmalar];
      for (const g of ekle) mevcut.push(await yeniFirmaIleBagla(g, g.onerilenTur, mevcut));
    });
  }

  const otomatikSayi = otomatik.bagla.length + otomatik.ekle.length;

  return (
    <div className="card overflow-hidden">
      <div className="p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-[var(--accent-orange-soft)] flex items-center justify-center shrink-0">
            <Link2 className="w-4 h-4 text-[var(--accent-orange)]" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold">Eşleştirilmemiş kayıtlar</div>
            <div className="text-xs text-[var(--muted)]">
              Firması yazıyla girilmiş {kayitSayisi} kasa kaydı, {gruplar.length} farklı ad. Bağlanınca cari ekstrede görünürler.
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {otomatikSayi > 0 && (
            <button
              className="btn-primary !py-1.5 !px-3 !text-xs inline-flex items-center gap-1.5 disabled:opacity-40"
              disabled={busy}
              onClick={otomatikEslestir}
              title="Aynı adlı firmaya bağlar; hiçbir şeye benzemeyen adları yeni firma olarak ekler (yalnızca çıkışı olanlar Tedarikçi, diğerleri Müşteri). Benzer adlar elle kontrol için bırakılır."
            >
              <Wand2 className="w-3.5 h-3.5" /> Otomatik eşleştir ({otomatikSayi})
            </button>
          )}
          <button className="btn-secondary !py-1.5 !px-3 !text-xs" onClick={() => setAcik((v) => !v)}>
            {acik ? "Gizle" : "Tek tek eşleştir"}
          </button>
        </div>
      </div>
      {acik && (
        <ul className="border-t border-[var(--border)] divide-y divide-[var(--border)] max-h-[60vh] overflow-y-auto">
          {gruplar.map((g) => {
            const hedefId = secimler[g.anahtar] ?? g.tam?.id ?? g.benzer[0]?.id ?? "";
            const hedef = firmalar.find((f) => f.id === hedefId);
            const tur = turler[g.anahtar] ?? g.onerilenTur;
            return (
              <li key={g.anahtar} className="px-5 py-3 flex flex-col gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-[180px] flex-1">
                    <div className="font-medium">{g.ad}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {g.kayitIds.length} kayıt
                      {g.tam ? " · aynı adlı firma var" : g.benzer.length > 0 ? ` · benzer: ${g.benzer.map((b) => b.ad).join(", ")}` : ""}
                    </div>
                  </div>
                  <select
                    className="select-field select-field-md w-[240px] max-w-full"
                    value={hedefId}
                    onChange={(e) => setSecimler((s) => ({ ...s, [g.anahtar]: e.target.value }))}
                  >
                    <option value="">Firma seçin…</option>
                    {firmalar.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.ad}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn-primary !py-1.5 !px-3 !text-xs disabled:opacity-40"
                    disabled={busy || !hedef}
                    onClick={() => hedef && calistir(() => kayitlariFirmayaBagla(g.kayitIds, hedef))}
                  >
                    Bağla
                  </button>
                </div>
                {!g.tam && (
                  <div className="flex flex-wrap items-center gap-2 justify-end">
                    <span className="text-xs text-[var(--muted)]">ya da yeni ekle:</span>
                    <TurSecici size="sm" value={tur} onChange={(t) => setTurler((s) => ({ ...s, [g.anahtar]: t }))} />
                    <button
                      className="btn-secondary !py-1.5 !px-3 !text-xs disabled:opacity-40"
                      disabled={busy}
                      onClick={() => calistir(async () => void (await yeniFirmaIleBagla(g, tur, firmalar)))}
                      title={`"${firmaAdiDuzenle(g.ad)}" adıyla ekler ve bağlar`}
                    >
                      Ekle ve bağla
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Doğrudan listeden tıklayıp yazılabilir: Enter kaydeder, Tab bir alttaki firmanın telefon
// hücresine geçer (menü butonuna değil).
function TelefonHucre({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [taslak, setTaslak] = useState<string | null>(null);

  function kaydetVeKapat() {
    if (taslak !== null && taslak !== value) onCommit(taslak);
    setTaslak(null);
  }

  return (
    <input
      data-telefon-hucre
      className="input-sm tabular"
      placeholder="Telefon ekle"
      value={taslak ?? value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setTaslak(e.target.value)}
      onBlur={kaydetVeKapat}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        } else if (e.key === "Tab" && !e.shiftKey) {
          e.preventDefault();
          kaydetVeKapat();
          const hepsi = [...document.querySelectorAll<HTMLInputElement>("input[data-telefon-hucre]")];
          hepsi[hepsi.indexOf(e.currentTarget) + 1]?.focus();
        } else if (e.key === "Escape") {
          setTaslak(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
}


