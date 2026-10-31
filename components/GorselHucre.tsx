"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { gorselEkle, gorselSil } from "@/lib/db";
import { gorselGetir, onizlemeGetir } from "@/lib/hooks";
import { gorselDosyalari, gorselHazirla } from "@/lib/gorsel";
import type { GorselAlani } from "@/lib/types";

// Loads its preview only once scrolled into view, so a long order list doesn't fetch every image.
function Onizleme({ id, onClick }: { id: string; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let iptal = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        onizlemeGetir(id).then((s) => !iptal && setSrc(s));
      },
      { rootMargin: "200px" }
    );
    io.observe(el);
    return () => {
      iptal = true;
      io.disconnect();
    };
  }, [id]);

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={-1}
      className="w-20 h-20 rounded-md overflow-hidden bg-[#f1f1f4] shrink-0 ring-1 ring-[var(--border)] hover:ring-[var(--border-strong)]"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL previews, not optimizable */}
      {src && <img src={src} alt="" className="w-full h-full object-cover" />}
    </button>
  );
}

// The object URL is created and revoked with the effect, and set on the <img> directly.
function YerelOnizleme({ dosya, onSil }: { dosya: File; onSil: () => void }) {
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(dosya);
    if (imgRef.current) imgRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [dosya]);
  return (
    <span className="relative w-20 h-20 rounded-md overflow-hidden bg-[#f1f1f4] shrink-0 ring-1 ring-[var(--border)] group">
      {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
      <img ref={imgRef} alt="" className="w-full h-full object-cover" />
      <button
        type="button"
        tabIndex={-1}
        className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center"
        onClick={onSil}
        aria-label="Kaldır"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}

// An image cell: click it and Ctrl+V a screenshot, drop files on it, or pick files with "+".
// Saved orders upload right away; an unsaved entry row keeps the files until the order is saved.
export default function GorselHucre({
  ids,
  alan,
  siparisId,
  bekleyenler,
  onBekleyenler,
}: {
  ids: string[];
  alan: GorselAlani;
  siparisId?: string;
  bekleyenler?: File[];
  onBekleyenler?: (dosyalar: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [yukleniyor, setYukleniyor] = useState(0);
  const [surukle, setSurukle] = useState(false);
  const [acik, setAcik] = useState<number | null>(null);

  async function ekle(dosyalar: File[]) {
    if (!dosyalar.length) return;
    if (!siparisId) {
      onBekleyenler?.([...(bekleyenler ?? []), ...dosyalar]);
      return;
    }
    setYukleniyor((n) => n + dosyalar.length);
    for (const d of dosyalar) {
      try {
        await gorselEkle(siparisId, alan, await gorselHazirla(d));
      } catch (err) {
        console.error(err);
        alert(`Görsel eklenemedi: ${err instanceof Error ? err.message : ""}`);
      } finally {
        setYukleniyor((n) => n - 1);
      }
    }
  }

  return (
    <div
      tabIndex={0}
      className={`min-h-[84px] min-w-[120px] rounded-lg px-1 py-1 flex flex-wrap items-center gap-1 outline-none transition-colors focus:ring-2 focus:ring-[var(--focus-ring)] focus:bg-white ${
        surukle ? "bg-[var(--accent-blue-soft)] ring-2 ring-[var(--accent-blue)]/30" : "hover:bg-[#f6f6f8]"
      }`}
      title="Tıklayıp Ctrl+V ile yapıştırın, sürükleyip bırakın ya da + ile seçin"
      onClick={(e) => e.stopPropagation()}
      onPaste={(e) => {
        const dosyalar = gorselDosyalari(e.clipboardData);
        if (!dosyalar.length) return;
        e.preventDefault();
        ekle(dosyalar);
      }}
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes("Files")) return;
        e.preventDefault();
        setSurukle(true);
      }}
      onDragLeave={() => setSurukle(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSurukle(false);
        ekle(gorselDosyalari(e.dataTransfer));
      }}
    >
      {ids.map((id, i) => (
        <Onizleme key={id} id={id} onClick={() => setAcik(i)} />
      ))}
      {bekleyenler?.map((d, i) => (
        <YerelOnizleme key={i} dosya={d} onSil={() => onBekleyenler?.(bekleyenler.filter((_, j) => j !== i))} />
      ))}
      {yukleniyor > 0 && (
        <span className="w-20 h-20 rounded-md bg-[#f1f1f4] flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-[var(--muted)]" />
        </span>
      )}
      <button
        type="button"
        tabIndex={-1}
        className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--muted-soft)] hover:text-[var(--foreground)] hover:bg-[#ececf0]"
        onClick={() => inputRef.current?.click()}
        aria-label="Görsel ekle"
      >
        <ImagePlus className="w-4 h-4" />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          ekle([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      {acik !== null && siparisId && (
        <GorselGoruntuleyici ids={ids} baslangic={acik} siparisId={siparisId} alan={alan} onClose={() => setAcik(null)} />
      )}
    </div>
  );
}

export function GorselGoruntuleyici({
  ids,
  baslangic,
  siparisId,
  alan,
  onClose,
}: {
  ids: string[];
  baslangic: number;
  siparisId: string;
  alan: GorselAlani;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(baslangic);
  const [src, setSrc] = useState<string | null>(null);
  const [silOnay, setSilOnay] = useState(false);
  const [busy, setBusy] = useState(false);
  const id = ids[Math.min(index, ids.length - 1)];

  useEffect(() => {
    if (!id) return;
    let iptal = false;
    // Show the preview immediately, then swap in the full image.
    onizlemeGetir(id).then((s) => !iptal && s && setSrc((eski) => eski ?? s));
    gorselGetir(id).then((g) => !iptal && g && setSrc(g.veri));
    return () => {
      iptal = true;
    };
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") git(1);
      if (e.key === "ArrowLeft") git(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function git(adim: number) {
    if (ids.length < 2) return;
    setSrc(null);
    setSilOnay(false);
    setIndex((i) => (i + adim + ids.length) % ids.length);
  }

  async function sil() {
    setBusy(true);
    try {
      await gorselSil(siparisId, alan, id);
      if (ids.length <= 1) onClose();
      else {
        setSrc(null);
        setSilOnay(false);
        setIndex((i) => Math.min(i, ids.length - 2));
      }
    } catch (err) {
      console.error(err);
      alert("Görsel silinemedi, lütfen tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  if (!id) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/85 flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 text-white/80 text-sm" onClick={(e) => e.stopPropagation()}>
        <span className="tabular">
          {alan === "siparis" ? "Sipariş görseli" : "Biten ürün"} · {index + 1} / {ids.length}
        </span>
        <div className="flex items-center gap-2">
          {silOnay ? (
            <>
              <span className="text-white">Bu görseli silmek istediğine emin misin?</span>
              <button className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20" onClick={() => setSilOnay(false)}>
                Vazgeç
              </button>
              <button className="px-3 py-1.5 rounded-lg bg-[var(--brand)] text-white disabled:opacity-40" disabled={busy} onClick={sil}>
                Evet, sil
              </button>
            </>
          ) : (
            <button className="px-3 py-1.5 rounded-lg hover:bg-white/10 inline-flex items-center gap-1.5" onClick={() => setSilOnay(true)}>
              <Trash2 className="w-4 h-4" /> Sil
            </button>
          )}
          <button className="w-9 h-9 rounded-lg hover:bg-white/10 flex items-center justify-center" onClick={onClose} aria-label="Kapat">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center gap-2 px-2 pb-6">
        {ids.length > 1 && (
          <button
            className="w-11 h-11 rounded-full text-white/80 hover:bg-white/10 flex items-center justify-center shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              git(-1);
            }}
            aria-label="Önceki"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        <div className="flex-1 min-w-0 h-full flex items-center justify-center">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL from Firestore
            <img src={src} alt="" className="max-w-full max-h-full object-contain rounded" onClick={(e) => e.stopPropagation()} />
          ) : (
            <Loader2 className="w-6 h-6 animate-spin text-white/60" />
          )}
        </div>
        {ids.length > 1 && (
          <button
            className="w-11 h-11 rounded-full text-white/80 hover:bg-white/10 flex items-center justify-center shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              git(1);
            }}
            aria-label="Sonraki"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
