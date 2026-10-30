"use client";

import { useMemo, useState } from "react";
import { Users, Pencil, Trash2, Plus } from "lucide-react";
import { useCalisanlar, useKasaKayitlari } from "@/lib/hooks";
import { cariOzetleri } from "@/lib/firma";
import { formatTL } from "@/lib/format";
import { addCalisan, deleteCalisan, updateCalisan } from "@/lib/db";
import type { Calisan } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import YukleniyorSatiri from "@/components/YukleniyorSatiri";

const empty = {
  adSoyad: "",
  tcKimlikNo: "",
  telefon: "",
  adres: "",
  acilDurumKisisi: "",
  acilTelefon: "",
  not: "",
};

const FIELDS: { key: keyof typeof empty; label: string }[] = [
  { key: "adSoyad", label: "Ad Soyad" },
  { key: "tcKimlikNo", label: "T.C. Kimlik No" },
  { key: "telefon", label: "Telefon" },
  { key: "adres", label: "Adres" },
  { key: "acilDurumKisisi", label: "Acil Durum Kişisi" },
  { key: "acilTelefon", label: "Acil Telefon" },
  { key: "not", label: "Not" },
];

export default function CalisanlarPage() {
  const { calisanlar, loading } = useCalisanlar();
  const { kayitlar } = useKasaKayitlari();
  // Kasa records linked with personelId (picked from the Personel group in the company picker).
  const ozetler = useMemo(() => cariOzetleri(kayitlar, "personelId"), [kayitlar]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [adding, setAdding] = useState(false);
  const [silinecek, setSilinecek] = useState<string | null>(null);

  function startEdit(c: Calisan) {
    setEditingId(c.id);
    setForm({
      adSoyad: c.adSoyad,
      tcKimlikNo: c.tcKimlikNo,
      telefon: c.telefon,
      adres: c.adres,
      acilDurumKisisi: c.acilDurumKisisi,
      acilTelefon: c.acilTelefon,
      not: c.not,
    });
  }

  async function saveEdit(id: string) {
    await updateCalisan(id, form);
    setEditingId(null);
    setForm(empty);
  }

  async function saveNew() {
    if (!form.adSoyad.trim()) return;
    await addCalisan(form);
    setForm(empty);
    setAdding(false);
  }

  return (
    <div className="page-enter flex flex-col gap-6">
      <PageHeader title="Personel" description="Çalışanların hızlı iletişim ve acil durum bilgileri." />

      <div className="card overflow-hidden">
        {loading && calisanlar.length === 0 ? (
          <YukleniyorSatiri />
        ) : calisanlar.length === 0 && !adding ? (
          <EmptyState
            icon={Users}
            title="Henüz personel eklenmedi"
            description="Aşağıdaki '+ Yeni Personel Ekle' butonuyla ilk kaydı ekleyebilirsin."
          />
        ) : (
          <div className="table-scroll">
            <table className="w-full text-sm data-table">
              <thead>
                <tr>
                  {FIELDS.map((f) => (
                    <th key={f.key} >{f.label}</th>
                  ))}
                  <th className="w-[100px]"></th>
                </tr>
              </thead>
              <tbody>
                {calisanlar.map((c) =>
                  editingId === c.id ? (
                    <EditRow key={c.id} form={form} setForm={setForm} onSave={() => saveEdit(c.id)} onCancel={() => setEditingId(null)} />
                  ) : (
                    <tr key={c.id} className="border-t border-[var(--border)]">
                      <td className="px-4 py-3">
                        <div className="font-medium">{c.adSoyad}</div>
                        {ozetler.has(c.id) && (
                          <div className="text-xs text-[var(--muted)] tabular">
                            Kasa: {formatTL(ozetler.get(c.id)!.harcama)} ödeme · {ozetler.get(c.id)!.kayitSayisi} kayıt
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">{c.tcKimlikNo || "—"}</td>
                      <td className="px-4 py-3">
                        {c.telefon ? <a className="text-[var(--brand)] hover:underline" href={`tel:${c.telefon}`}>{c.telefon}</a> : "—"}
                      </td>
                      <td className="px-4 py-3">{c.adres || "—"}</td>
                      <td className="px-4 py-3">{c.acilDurumKisisi || "—"}</td>
                      <td className="px-4 py-3">{c.acilTelefon || "—"}</td>
                      <td className="px-4 py-3">{c.not || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-end">
                          <button className="icon-btn" onClick={() => startEdit(c)} title="Düzenle">
                            <Pencil className="w-4 h-4" />
                          </button>
                          {silinecek === c.id ? (
                            <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
                              <span className="text-[var(--brand-dark)] font-medium">Silinsin mi?</span>
                              <button className="btn-secondary !py-1 !px-2 !text-xs" onClick={() => setSilinecek(null)}>
                                Vazgeç
                              </button>
                              <button
                                className="btn-primary !bg-[var(--brand)] hover:!bg-[var(--brand-dark)] !py-1 !px-2 !text-xs"
                                onClick={() => {
                                  setSilinecek(null);
                                  deleteCalisan(c.id);
                                }}
                              >
                                Evet, sil
                              </button>
                            </span>
                          ) : (
                            <button className="icon-btn hover:!text-[var(--brand)]" onClick={() => setSilinecek(c.id)} title="Sil">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                )}
                {adding && (
                  <EditRow form={form} setForm={setForm} onSave={saveNew} onCancel={() => { setAdding(false); setForm(empty); }} />
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!adding && (
        <button className="btn-secondary self-start inline-flex items-center gap-2" onClick={() => setAdding(true)}>
          <Plus className="w-4 h-4" /> Yeni Personel Ekle
        </button>
      )}
    </div>
  );
}

function EditRow({
  form,
  setForm,
  onSave,
  onCancel,
}: {
  form: typeof empty;
  setForm: (f: typeof empty) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <tr className="border-t border-[var(--border)] bg-[var(--surface-hover)]">
      {FIELDS.map((f) => (
        <td key={f.key} className="px-4 py-2">
          <input
            className="input-sm bg-white border border-[var(--border)]"
            value={form[f.key]}
            onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
            placeholder={f.label}
          />
        </td>
      ))}
      <td className="px-4 py-2">
        <div className="flex gap-2 justify-end">
          <button className="btn-primary !py-1.5 !px-3 !text-xs" onClick={onSave}>Kaydet</button>
          <button className="btn-secondary !py-1.5 !px-3 !text-xs" onClick={onCancel}>Vazgeç</button>
        </div>
      </td>
    </tr>
  );
}
