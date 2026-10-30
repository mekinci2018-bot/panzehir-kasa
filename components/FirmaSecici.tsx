"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { addFirma, FirmaZatenVar } from "@/lib/db";
import { benzerFirmalar, FIRMA_TURU_LABEL, firmaAdiDuzenle, firmaAnahtari, firmaTuru } from "@/lib/firma";
import type { Calisan, Firma, FirmaTuru } from "@/lib/types";

// A record's counterparty: a company from firmalar, or an employee from calisanlar.
export interface FirmaSecimi {
  firmaId: string; // "" until a company is chosen or created
  personelId?: string; // set instead of firmaId when an employee is chosen
  firma: string; // display name
}

const LISTE_LIMIT = 8;
const YENI_TURLER: FirmaTuru[] = ["musteri", "tedarikci", "gider"];

type Secenek =
  | { tur: "firma"; firma: Firma }
  | { tur: "personel"; calisan: Calisan }
  | { tur: "yeni"; firmaTuru: FirmaTuru };

function secenekKey(s: Secenek): string {
  if (s.tur === "firma") return s.firma.id;
  if (s.tur === "personel") return `p-${s.calisan.id}`;
  return `yeni-${s.firmaTuru}`;
}

// Type-ahead picker: arrows + Enter/Tab pick from the list; the last options add a new company of a
// chosen type (customers and suppliers get a "Bunu mu demek istediniz?" check first). Enter with the
// list closed is left to the parent, so a Kasa row still saves on Enter.
export default function FirmaSecici({
  value,
  firmalar,
  calisanlar = [],
  onChange,
  className = "input-sm font-medium",
  placeholder = "Firma adı",
  autoFocus,
}: {
  value: FirmaSecimi;
  firmalar: Firma[];
  calisanlar?: Calisan[];
  onChange: (next: FirmaSecimi) => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [aktif, setAktif] = useState(0);
  // Pending "add new" that hit near-duplicates: the type it would be created as, and the matches.
  const [benzer, setBenzer] = useState<{ firmaTuru: FirmaTuru; firmalar: Firma[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  const anahtar = firmaAnahtari(value.firma);
  const tamFirma = anahtar ? firmalar.find((f) => f.anahtar === anahtar) : undefined;
  const tamPersonel = anahtar ? calisanlar.find((c) => firmaAnahtari(c.adSoyad) === anahtar) : undefined;

  const secenekler: Secenek[] = useMemo(() => {
    if (benzer) {
      return [
        ...benzer.firmalar.map((firma) => ({ tur: "firma" as const, firma })),
        { tur: "yeni" as const, firmaTuru: benzer.firmaTuru },
      ];
    }
    const uyan = (ad: string) => !anahtar || firmaAnahtari(ad).includes(anahtar);
    const once = (ad: string) => Number(!firmaAnahtari(ad).startsWith(anahtar));
    const firmaList: Secenek[] = firmalar
      .filter((f) => uyan(f.ad))
      .sort((a, b) => once(a.ad) - once(b.ad))
      .slice(0, LISTE_LIMIT)
      .map((firma) => ({ tur: "firma", firma }));
    const personelList: Secenek[] = calisanlar
      .filter((c) => uyan(c.adSoyad))
      .slice(0, anahtar ? LISTE_LIMIT : 4)
      .map((calisan) => ({ tur: "personel", calisan }));
    const yeni: Secenek[] =
      anahtar && !tamFirma && !tamPersonel ? YENI_TURLER.map((t) => ({ tur: "yeni", firmaTuru: t })) : [];
    return [...firmaList, ...personelList, ...yeni];
  }, [benzer, anahtar, firmalar, calisanlar, tamFirma, tamPersonel]);

  // The list is portaled to <body> with fixed coordinates, so table scroll areas and modals don't clip it.
  useLayoutEffect(() => {
    if (!open) return;
    const yerlestir = () => {
      const r = inputRef.current?.getBoundingClientRect();
      if (r) setPos({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 300) });
    };
    yerlestir();
    window.addEventListener("scroll", yerlestir, true);
    window.addEventListener("resize", yerlestir);
    return () => {
      window.removeEventListener("scroll", yerlestir, true);
      window.removeEventListener("resize", yerlestir);
    };
  }, [open]);

  function ac() {
    setOpen(true);
    setAktif(0);
  }

  function kapat() {
    setOpen(false);
    setBenzer(null);
  }

  function secFirma(f: Firma) {
    onChange({ firmaId: f.id, personelId: "", firma: f.ad });
    kapat();
  }

  function secPersonel(c: Calisan) {
    onChange({ firmaId: "", personelId: c.id, firma: c.adSoyad });
    kapat();
  }

  async function yeniEkle(tur: FirmaTuru, zorla: boolean) {
    if (!anahtar || busy) return;
    if (!zorla && tur !== "gider") {
      const b = benzerFirmalar(value.firma, firmalar);
      if (b.length > 0) {
        setBenzer({ firmaTuru: tur, firmalar: b });
        setAktif(0);
        return;
      }
    }
    setBusy(true);
    try {
      secFirma(await addFirma(value.firma, firmalar, { tur }));
    } catch (err) {
      if (err instanceof FirmaZatenVar) secFirma(err.firma);
      else {
        console.error(err);
        alert("Firma eklenemedi, lütfen tekrar deneyin.");
      }
    } finally {
      setBusy(false);
    }
  }

  function uygula(s: Secenek) {
    if (s.tur === "firma") secFirma(s.firma);
    else if (s.tur === "personel") secPersonel(s.calisan);
    else yeniEkle(s.firmaTuru, benzer !== null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        ac();
      }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = secenekler.length;
      if (n) setAktif((i) => (i + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const s = secenekler[aktif];
      if (s) uygula(s);
      else kapat();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      kapat();
    } else if (e.key === "Tab") {
      // Tab takes the highlighted company or employee, like Excel autocomplete; it never creates one.
      const s = secenekler[aktif];
      const bagli = value.firmaId || value.personelId;
      if (s && s.tur !== "yeni" && !bagli && anahtar) uygula(s);
      else kapat();
    }
  }

  function handleBlur() {
    // An exact name typed by hand is linked and shown with its stored spelling.
    if (tamFirma && (value.firmaId !== tamFirma.id || value.firma !== tamFirma.ad)) secFirma(tamFirma);
    else if (!tamFirma && tamPersonel && value.personelId !== tamPersonel.id) secPersonel(tamPersonel);
    else kapat();
  }

  function grupBasligi(s: Secenek, i: number) {
    const onceki = secenekler[i - 1];
    const baslik =
      s.tur === "personel" && onceki?.tur !== "personel"
        ? "Personel"
        : s.tur === "yeni" && onceki?.tur !== "yeni" && !benzer
          ? `"${firmaAdiDuzenle(value.firma)}" yeni olarak ekle`
          : null;
    if (!baslik) return null;
    return (
      <div
        className={`px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-[var(--muted)] truncate ${
          i > 0 ? "mt-1 border-t border-[var(--border)]" : ""
        }`}
      >
        {baslik}
      </div>
    );
  }

  const liste =
    open && pos && secenekler.length > 0
      ? createPortal(
          <div
            id={listId}
            role="listbox"
            className="fixed z-[60] card shadow-[var(--shadow-pop)] py-1 max-h-80 overflow-y-auto text-sm"
            style={{ left: pos.left, top: pos.top, width: pos.width }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {benzer && (
              <div className="px-3 pt-1.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-[var(--accent-orange)]">
                Bunu mu demek istediniz?
              </div>
            )}
            {secenekler.map((s, i) => (
              <div key={secenekKey(s)}>
                {grupBasligi(s, i)}
                <button
                  type="button"
                  tabIndex={-1}
                  className={`w-full text-left px-3 py-1.5 flex items-center gap-2 ${
                    i === aktif ? "bg-[#f1f1f4]" : "hover:bg-[var(--surface-hover)]"
                  } ${s.tur === "yeni" && benzer ? "border-t border-[var(--border)] mt-1 pt-2 text-[var(--muted)]" : ""}`}
                  onMouseEnter={() => setAktif(i)}
                  onClick={() => uygula(s)}
                >
                  {s.tur === "firma" && (
                    <>
                      <span className="truncate font-medium flex-1">{s.firma.ad}</span>
                      {firmaTuru(s.firma) !== "musteri" && (
                        <span className="text-[11px] text-[var(--muted)] shrink-0">{FIRMA_TURU_LABEL[firmaTuru(s.firma)]}</span>
                      )}
                    </>
                  )}
                  {s.tur === "personel" && <span className="truncate font-medium">{s.calisan.adSoyad}</span>}
                  {s.tur === "yeni" && (
                    <>
                      <Plus className="w-3.5 h-3.5 shrink-0 text-[var(--muted)]" />
                      {benzer ? (
                        <span className="truncate">
                          Hayır, yeni {FIRMA_TURU_LABEL[s.firmaTuru].toLocaleLowerCase("tr-TR")} olarak ekle:{" "}
                          <span className="font-medium text-[var(--foreground)]">{firmaAdiDuzenle(value.firma)}</span>
                        </span>
                      ) : (
                        <span className="truncate">{FIRMA_TURU_LABEL[s.firmaTuru]}</span>
                      )}
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <input
        ref={inputRef}
        className={className}
        data-field="firma"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value.firma}
        readOnly={busy}
        onChange={(e) => {
          const text = e.target.value;
          const k = firmaAnahtari(text);
          const tam = k ? firmalar.find((f) => f.anahtar === k) : undefined;
          onChange({ firmaId: tam?.id ?? "", personelId: "", firma: text });
          setBenzer(null);
          ac();
        }}
        onClick={() => (open ? kapat() : ac())}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
      {liste}
    </>
  );
}
