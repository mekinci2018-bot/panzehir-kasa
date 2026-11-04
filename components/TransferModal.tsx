"use client";

import { useMemo, useState } from "react";
import { ArrowDownUp, Plus } from "lucide-react";
import { addBankaHesabi, kayitSil, transferGuncelle, transferYap } from "@/lib/db";
import { useBankaHesaplari, useKasaKayitlari } from "@/lib/hooks";
import { signed, tumHareketler } from "@/lib/hareketler";
import { formatTL, todayISO, tutarOku } from "@/lib/format";
import { hesapEtiketi } from "./OdemeSekliSelect";
import TarihAlani from "./TarihAlani";
import type { KasaKaydi } from "@/lib/types";

// Hesaplar arası transfer (virman): Nakit Kasa ve bütün banka hesapları arasında, her yönde.
// Kart / POS yoktur (oradan para aktarılmaz, tahsilat yapılır). Tek kayıt, iki bacak.
const NAKIT = "nakit";

type Secim = string; // "nakit" ya da banka hesabı kimliği

function bacakOf(secim: Secim): { odemeSekli: "nakit" | "havale"; bankaHesapId?: string } {
  return secim === NAKIT ? { odemeSekli: "nakit" } : { odemeSekli: "havale", bankaHesapId: secim };
}

export default function TransferModal({
  kayit,
  onClose,
}: {
  kayit?: KasaKaydi; // varsa düzenleme
  onClose: () => void;
}) {
  const { hesaplar } = useBankaHesaplari();
  const { kayitlar } = useKasaKayitlari();
  const [kaynak, setKaynak] = useState<Secim>(kayit ? (kayit.bankaHesapId ?? NAKIT) : NAKIT);
  const [hedef, setHedef] = useState<Secim>(kayit ? (kayit.hedefBankaHesapId ?? NAKIT) : "");
  const [tutar, setTutar] = useState(kayit ? String(kayit.toplamTutar) : "");
  const [tarih, setTarih] = useState(kayit?.tarih ?? todayISO());
  const [aciklama, setAciklama] = useState(kayit?.aciklama ?? "");
  const [yeniAcik, setYeniAcik] = useState<"kaynak" | "hedef" | null>(null);
  const [yeniSahip, setYeniSahip] = useState("");
  const [yeniBanka, setYeniBanka] = useState("");
  const [kaydediliyor, setKaydediliyor] = useState(false);

  // Her hesabın güncel bakiyesi: yetersiz bakiyede uyarı verilir ama işlem engellenmez.
  const bakiyeler = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of tumHareketler(kayitlar)) {
      if (h.odemeSekli === "kart") continue;
      const anahtar = h.odemeSekli === "nakit" ? NAKIT : (h.bankaHesapId ?? "");
      if (!anahtar) continue;
      m.set(anahtar, (m.get(anahtar) ?? 0) + signed(h));
    }
    return m;
  }, [kayitlar]);

  // Pasif hesaplar yeni transferde listelenmez; düzenlenen kaydın hesabı listede kalır.
  const secenekler = useMemo(() => {
    const liste: { deger: Secim; etiket: string }[] = [{ deger: NAKIT, etiket: "Nakit Kasa" }];
    for (const h of hesaplar) {
      if (h.pasif && h.id !== kayit?.bankaHesapId && h.id !== kayit?.hedefBankaHesapId) continue;
      liste.push({ deger: h.id, etiket: hesapEtiketi(h) + (h.pasif ? " (pasif)" : "") });
    }
    return liste;
  }, [hesaplar, kayit]);

  const miktar = tutarOku(tutar);
  const kaynakBakiye = bakiyeler.get(kaynak) ?? 0;
  const yetersiz = miktar > 0 && miktar > kaynakBakiye;
  const ayniHesap = !!hedef && kaynak === hedef;
  const gecerli = miktar > 0 && !!tarih && !!hedef && !ayniHesap;

  async function hesapEkle(nereye: "kaynak" | "hedef") {
    const sahip = yeniSahip.trim();
    const banka = yeniBanka.trim();
    if (!sahip && !banka) return;
    try {
      const ref = await addBankaHesabi({ banka, hesapSahibi: sahip, iban: "", aciklama: "" });
      if (nereye === "kaynak") setKaynak(ref.id);
      else setHedef(ref.id);
      setYeniAcik(null);
      setYeniSahip("");
      setYeniBanka("");
    } catch (err) {
      console.error(err);
      alert("Hesap eklenemedi, lütfen tekrar deneyin.");
    }
  }

  async function kaydet() {
    if (!gecerli || kaydediliyor) return;
    setKaydediliyor(true);
    const girdi = {
      tarih,
      tutar: miktar,
      kaynak: bacakOf(kaynak),
      hedef: bacakOf(hedef),
      aciklama,
    };
    try {
      if (kayit) await transferGuncelle(kayit.id, girdi);
      else await transferYap(girdi);
      onClose();
    } catch (err) {
      console.error(err);
      alert("Transfer kaydedilemedi, lütfen tekrar deneyin.");
      setKaydediliyor(false);
    }
  }

  // Bileşen değil, satır üreten bir yardımcı: render sırasında bileşen tanımlanırsa her çizimde
  // yeniden oluşur ve içindeki alanların durumu sıfırlanır.
  function hesapSatiri(nereye: "kaynak" | "hedef") {
    const deger = nereye === "kaynak" ? kaynak : hedef;
    const ayarla = nereye === "kaynak" ? setKaynak : setHedef;
    return (
      <div>
        <label className="field-label">{nereye === "kaynak" ? "Kaynak hesap (çıkış)" : "Hedef hesap (giriş)"}</label>
        <select
          className="select-field select-field-md w-full"
          value={deger}
          onChange={(e) => {
            if (e.target.value === "__yeni") setYeniAcik(nereye);
            else ayarla(e.target.value);
          }}
        >
          {nereye === "hedef" && (
            <option value="" disabled>
              Hesap seçin…
            </option>
          )}
          {secenekler.map((s) => (
            <option key={s.deger} value={s.deger}>
              {s.etiket}
            </option>
          ))}
          <option value="__yeni">+ Yeni hesap ekle…</option>
        </select>
        <div className="text-[11px] text-[var(--muted)] mt-1 tabular">
          {deger ? `Bakiye ${formatTL(bakiyeler.get(deger) ?? 0)}` : "—"}
        </div>
        {yeniAcik === nereye && (
          <div className="mt-2 p-3 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)] flex flex-col gap-2">
            <input
              className="input-field !py-1.5 !text-[13px]"
              autoFocus
              placeholder="Hesap sahibi"
              value={yeniSahip}
              onChange={(e) => setYeniSahip(e.target.value)}
            />
            <input
              className="input-field !py-1.5 !text-[13px]"
              placeholder="Banka adı"
              value={yeniBanka}
              onChange={(e) => setYeniBanka(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && hesapEkle(nereye)}
            />
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary !py-1 !px-2.5 !text-xs" onClick={() => setYeniAcik(null)}>
                Vazgeç
              </button>
              <button
                className="btn-primary !py-1 !px-2.5 !text-xs inline-flex items-center gap-1"
                onClick={() => hesapEkle(nereye)}
              >
                <Plus className="w-3 h-3" /> Ekle ve seç
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card w-full max-w-lg p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        <div>
          <h3 className="font-semibold text-base">{kayit ? "Transferi düzenle" : "Hesaplar arası transfer"}</h3>
          <p className="text-sm text-[var(--muted)]">
            Para bir hesabımızdan diğerine geçer. Toplam kasa değişmez, gelir ya da gider sayılmaz.
          </p>
        </div>

        {hesapSatiri("kaynak")}

        <button
          type="button"
          className="btn-secondary self-center !py-1 !px-2.5 !text-xs inline-flex items-center gap-1.5"
          title="Yönü çevir"
          onClick={() => {
            const k = kaynak;
            setKaynak(hedef || NAKIT);
            setHedef(k);
          }}
        >
          <ArrowDownUp className="w-3.5 h-3.5" /> Yönü çevir
        </button>

        {hesapSatiri("hedef")}

        <div>
          <label className="field-label">Tutar</label>
          <input
            className="input-field num text-lg"
            value={tutar}
            onChange={(e) => setTutar(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && kaydet()}
            placeholder="0,00"
          />
          {yetersiz && (
            <p className="text-[11px] text-[var(--accent-orange)] font-medium mt-1">
              Kaynak hesapta yeterli bakiye yok (bakiye {formatTL(kaynakBakiye)}). Yine de kaydedebilirsin.
            </p>
          )}
        </div>

        <TarihAlani value={tarih} onChange={setTarih} />

        <div>
          <label className="field-label">Açıklama</label>
          <input
            className="input-field"
            value={aciklama}
            onChange={(e) => setAciklama(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && kaydet()}
            placeholder="İsteğe bağlı"
          />
        </div>

        {ayniHesap && <p className="text-[12px] text-[var(--brand)] font-medium">Kaynak ve hedef aynı hesap olamaz.</p>}

        <div className="flex gap-2 justify-end items-center">
          {kayit && (
            <button
              className="text-[13px] text-[var(--brand)] font-medium hover:underline mr-auto"
              onClick={async () => {
                if (!window.confirm("Bu transfer Çöp Kutusu'na gönderilsin mi? İki bacağı birlikte kalkar.")) return;
                try {
                  await kayitSil(kayit.id);
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
            {kayit ? "Kaydet" : "Transferi kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}
