"use client";

import { useId } from "react";
import { ODEME_SEKLI_LABEL } from "@/lib/format";
import type { BankaHesabi, OdemeSekli } from "@/lib/types";

export interface OdemeSecimi {
  odemeSekli: OdemeSekli;
  bankaHesapId: string; // "" when none
  kartAciklama: string; // "" when none; only for kart
}

export function hesapEtiketi(h: BankaHesabi): string {
  return h.aciklama ? `${h.banka} · ${h.aciklama}` : h.banka || h.iban;
}

export default function OdemeSekliSelect({
  value,
  hesaplar,
  kartOnerileri = [],
  onChange,
  size = "sm",
}: {
  value: OdemeSecimi;
  hesaplar: BankaHesabi[];
  kartOnerileri?: string[];
  onChange: (next: OdemeSecimi) => void;
  size?: "sm" | "md";
}) {
  const listId = useId();
  const cls = size === "sm" ? "select-field" : "select-field select-field-md";
  // Inactive accounts are hidden, except one an existing record is already linked to.
  const secilebilir = hesaplar.filter((h) => !h.pasif || h.id === value.bankaHesapId);
  const aktifler = hesaplar.filter((h) => !h.pasif);

  return (
    <div className="flex flex-wrap gap-1.5">
      <select
        className={`${cls} min-w-0 flex-1`}
        value={value.odemeSekli}
        onChange={(e) => {
          const odemeSekli = e.target.value as OdemeSekli;
          onChange({
            odemeSekli,
            bankaHesapId: odemeSekli === "havale" ? value.bankaHesapId || aktifler[0]?.id || "" : "",
            kartAciklama: odemeSekli === "kart" ? value.kartAciklama : "",
          });
        }}
      >
        {(Object.keys(ODEME_SEKLI_LABEL) as OdemeSekli[]).map((k) => (
          <option key={k} value={k}>
            {ODEME_SEKLI_LABEL[k]}
          </option>
        ))}
      </select>

      {value.odemeSekli === "kart" && (
        <>
          <input
            className={`${cls} min-w-0 flex-1 cursor-text`}
            list={listId}
            placeholder="Nereye çekildi?"
            title="Örn. Ziraat POS"
            value={value.kartAciklama}
            onChange={(e) => onChange({ ...value, kartAciklama: e.target.value })}
          />
          <datalist id={listId}>
            {kartOnerileri.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </>
      )}

      {value.odemeSekli === "havale" &&
        (secilebilir.length === 0 ? (
          <select className={`${cls} min-w-0 flex-1 text-[var(--muted)]`} disabled>
            <option>Önce Banka Hesapları&apos;ndan hesap ekleyin</option>
          </select>
        ) : (
          <select
            className={`${cls} min-w-0 flex-1`}
            value={value.bankaHesapId}
            onChange={(e) => onChange({ ...value, bankaHesapId: e.target.value })}
          >
            <option value="">Hesap seçin…</option>
            {secilebilir.map((h) => (
              <option key={h.id} value={h.id}>
                {hesapEtiketi(h)}
                {h.pasif ? " (pasif)" : ""}
              </option>
            ))}
          </select>
        ))}
    </div>
  );
}
