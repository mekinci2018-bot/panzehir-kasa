"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, EyeOff, Merge, MoreHorizontal, Pencil, RotateCcw, Tag, Trash2 } from "lucide-react";
import { firmaPasifYap, firmaSil, firmaTuruDegistir } from "@/lib/db";
import { FIRMA_TURU_LABEL, firmaAnahtari, firmaTuru } from "@/lib/firma";
import type { Firma, FirmaTuru, KasaKaydi, Siparis } from "@/lib/types";
import FirmaBirlestirModal from "./FirmaBirlestirModal";

const TURLER: FirmaTuru[] = ["musteri", "tedarikci", "gider"];

// "⋯" menu for one company: edit, change type, merge into another, or delete (only possible once
// it has no kayıt/sipariş left — otherwise it offers merge or deactivate instead).
export default function FirmaIslemMenu({
  firma,
  firmalar,
  kayitlar,
  siparisler,
  onEdit,
  onDeleted,
}: {
  firma: Firma;
  firmalar: Firma[];
  kayitlar: KasaKaydi[];
  siparisler: Siparis[];
  onEdit: () => void;
  onDeleted?: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [turAcik, setTurAcik] = useState(false);
  const [pos, setPos] = useState<{ right: number; top: number } | null>(null);
  const [modal, setModal] = useState<null | "sil" | "birlestir-sec">(null);
  const [birlestirHedef, setBirlestirHedef] = useState<Firma | null>(null);
  const [busy, setBusy] = useState(false);

  const kayitSayisi = useMemo(
    () => kayitlar.filter((k) => k.firmaId === firma.id).length + siparisler.filter((s) => s.firmaId === firma.id).length,
    [kayitlar, siparisler, firma.id]
  );

  useLayoutEffect(() => {
    if (!open) return;
    const yerlestir = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (r) setPos({ right: window.innerWidth - r.right, top: r.bottom + 4 });
    };
    yerlestir();
    const kapat = (e: Event) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      setTurAcik(false);
    };
    const kacis = (e: KeyboardEvent) => e.key === "Escape" && kapat(e);
    window.addEventListener("scroll", yerlestir, true);
    window.addEventListener("resize", yerlestir);
    document.addEventListener("pointerdown", kapat, true);
    document.addEventListener("keydown", kacis);
    return () => {
      window.removeEventListener("scroll", yerlestir, true);
      window.removeEventListener("resize", yerlestir);
      document.removeEventListener("pointerdown", kapat, true);
      document.removeEventListener("keydown", kacis);
    };
  }, [open]);

  function kapatMenu() {
    setOpen(false);
    setTurAcik(false);
  }

  async function turDegistir(t: FirmaTuru) {
    kapatMenu();
    if (t === firmaTuru(firma)) return;
    try {
      await firmaTuruDegistir(firma, t);
    } catch (err) {
      console.error(err);
      alert("Tür değiştirilemedi, lütfen tekrar deneyin.");
    }
  }

  async function pasifTogla() {
    setBusy(true);
    try {
      await firmaPasifYap(firma.id, !firma.pasif);
      setModal(null);
    } catch (err) {
      console.error(err);
      alert("İşlem tamamlanamadı, lütfen tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  async function sil() {
    setBusy(true);
    try {
      await firmaSil(firma);
      setModal(null);
      onDeleted?.();
    } catch (err) {
      console.error(err);
      alert("Silinemedi, lütfen tekrar deneyin.");
      setBusy(false);
    }
  }

  const menu =
    open && pos
      ? createPortal(
          <div
            role="menu"
            className="fixed z-[60] card shadow-[var(--shadow-pop)] py-1 w-[220px] text-sm"
            style={{ right: pos.right, top: pos.top }}
          >
            <button
              className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--surface-hover)]"
              onClick={() => {
                kapatMenu();
                onEdit();
              }}
            >
              <Pencil className="w-3.5 h-3.5 text-[var(--muted)]" /> Düzenle
            </button>

            <button
              className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--surface-hover)]"
              onClick={() => setTurAcik((v) => !v)}
            >
              <Tag className="w-3.5 h-3.5 text-[var(--muted)]" />
              <span className="flex-1">Türünü değiştir</span>
              <ChevronRight className={`w-3.5 h-3.5 text-[var(--muted-soft)] transition-transform ${turAcik ? "rotate-90" : ""}`} />
            </button>
            {turAcik && (
              <div className="pb-1">
                {TURLER.map((t) => (
                  <button
                    key={t}
                    className={`w-full text-left pl-9 pr-3 py-1.5 hover:bg-[var(--surface-hover)] ${
                      firmaTuru(firma) === t ? "font-semibold" : "text-[var(--muted)]"
                    }`}
                    onClick={() => turDegistir(t)}
                  >
                    {FIRMA_TURU_LABEL[t]}
                    {firmaTuru(firma) === t ? " ✓" : ""}
                  </button>
                ))}
              </div>
            )}

            <div className="my-1 border-t border-[var(--border)]" />

            <button
              className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--surface-hover)]"
              onClick={() => {
                kapatMenu();
                setBirlestirHedef(null);
                setModal("birlestir-sec");
              }}
            >
              <Merge className="w-3.5 h-3.5 text-[var(--muted)]" /> Birleştir
            </button>

            <button
              className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--surface-hover)] hover:!text-[var(--brand)]"
              onClick={() => {
                kapatMenu();
                setModal("sil");
              }}
            >
              <Trash2 className="w-3.5 h-3.5 text-[var(--muted)]" /> Sil
            </button>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        className="icon-btn"
        title="İşlemler"
        onClick={() => (open ? kapatMenu() : setOpen(true))}
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
      </button>
      {menu}

      {modal === "sil" &&
        (kayitSayisi === 0 ? (
          <Dogrula
            baslik="Firmayı sil"
            mesaj={
              <>
                <strong>{firma.ad}</strong> silinsin mi? Hiç kaydı yok; Çöp Kutusu&apos;na gidecek ve 30 gün içinde geri alınabilir.
              </>
            }
            butonEtiketi="Evet, sil"
            busy={busy}
            onVazgec={() => setModal(null)}
            onOnayla={sil}
          />
        ) : (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
            <div className="card w-full max-w-md p-6 flex flex-col gap-4">
              <h3 className="font-semibold text-base">Firmayı sil</h3>
              <p className="text-sm text-[var(--muted)]">
                <strong>{firma.ad}</strong> doğrudan silinemez: {kayitSayisi} kaydı var. Bunun yerine başka bir firmayla
                birleştirebilir ya da seçicilerde görünmeyecek şekilde pasif yapabilirsin; geçmiş kayıtlarda görünmeye devam eder.
              </p>
              <div className="flex flex-wrap gap-2 justify-end">
                <button className="btn-secondary" onClick={() => setModal(null)}>
                  Vazgeç
                </button>
                <button
                  className="btn-secondary inline-flex items-center gap-1.5"
                  disabled={busy}
                  onClick={pasifTogla}
                >
                  {firma.pasif ? <RotateCcw className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  {firma.pasif ? "Aktif yap" : "Pasif yap"}
                </button>
                <button
                  className="btn-primary inline-flex items-center gap-1.5"
                  onClick={() => {
                    setModal("birlestir-sec");
                    setBirlestirHedef(null);
                  }}
                >
                  <Merge className="w-3.5 h-3.5" /> Birleştir
                </button>
              </div>
            </div>
          </div>
        ))}

      {modal === "birlestir-sec" &&
        (birlestirHedef ? (
          <FirmaBirlestirModal
            firmalar={[firma, birlestirHedef]}
            kayitlar={kayitlar}
            siparisler={siparisler}
            onClose={() => setModal(null)}
            onDone={() => setModal(null)}
          />
        ) : (
          <BirlestirSecici firma={firma} firmalar={firmalar} onVazgec={() => setModal(null)} onSec={setBirlestirHedef} />
        ))}
    </>
  );
}

function Dogrula({
  baslik,
  mesaj,
  butonEtiketi,
  busy,
  onVazgec,
  onOnayla,
}: {
  baslik: string;
  mesaj: React.ReactNode;
  butonEtiketi: string;
  busy: boolean;
  onVazgec: () => void;
  onOnayla: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md p-6 flex flex-col gap-4">
        <h3 className="font-semibold text-base">{baslik}</h3>
        <p className="text-sm text-[var(--muted)]">{mesaj}</p>
        <div className="flex gap-2 justify-end">
          <button className="btn-secondary" onClick={onVazgec}>
            Vazgeç
          </button>
          <button className="btn-primary !bg-[var(--brand)] hover:!bg-[var(--brand-dark)] disabled:opacity-40" disabled={busy} onClick={onOnayla}>
            {butonEtiketi}
          </button>
        </div>
      </div>
    </div>
  );
}

// Step 1 of a single-row "Birleştir": pick the other company before showing FirmaBirlestirModal.
function BirlestirSecici({
  firma,
  firmalar,
  onVazgec,
  onSec,
}: {
  firma: Firma;
  firmalar: Firma[];
  onVazgec: () => void;
  onSec: (f: Firma) => void;
}) {
  const [arama, setArama] = useState("");
  const liste = useMemo(() => {
    const k = firmaAnahtari(arama);
    return firmalar.filter((f) => f.id !== firma.id && (!k || f.anahtar.includes(k))).slice(0, 30);
  }, [firmalar, firma.id, arama]);

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md p-6 flex flex-col gap-3">
        <h3 className="font-semibold text-base">
          <strong>{firma.ad}</strong>&apos;ı hangi firmayla birleştireceksin?
        </h3>
        <input
          className="input-field"
          autoFocus
          placeholder="Firma ara"
          value={arama}
          onChange={(e) => setArama(e.target.value)}
        />
        <div className="max-h-64 overflow-y-auto -mx-1.5 flex flex-col">
          {liste.length === 0 ? (
            <p className="text-sm text-[var(--muted)] px-1.5 py-3">Eşleşen firma yok.</p>
          ) : (
            liste.map((f) => (
              <button
                key={f.id}
                className="text-left px-3 py-2 rounded-lg hover:bg-[var(--surface-hover)] text-sm flex items-center justify-between gap-2"
                onClick={() => onSec(f)}
              >
                <span className="truncate font-medium">{f.ad}</span>
                <span className="text-[11px] text-[var(--muted)] shrink-0">{FIRMA_TURU_LABEL[firmaTuru(f)]}</span>
              </button>
            ))
          )}
        </div>
        <div className="flex gap-2 justify-end mt-1">
          <button className="btn-secondary" onClick={onVazgec}>
            Vazgeç
          </button>
        </div>
      </div>
    </div>
  );
}
