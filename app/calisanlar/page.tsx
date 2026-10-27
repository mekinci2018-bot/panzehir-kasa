"use client";

import { useState } from "react";
import { useCalisanlar } from "@/lib/hooks";
import { addCalisan, deleteCalisan, updateCalisan } from "@/lib/db";
import type { Calisan } from "@/lib/types";

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [adding, setAdding] = useState(false);

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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold">Çalışanlar</h1>
        <p className="text-sm text-[var(--muted)] mt-1">Hızlı iletişim bilgileri.</p>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--muted)] text-xs uppercase tracking-wide">
                {FIELDS.map((f) => (
                  <th key={f.key} className="px-4 py-3 font-semibold">{f.label}</th>
                ))}
                <th className="px-4 py-3 font-semibold w-[100px]"></th>
              </tr>
            </thead>
            <tbody>
              {!loading && calisanlar.length === 0 && !adding && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[var(--muted)]">
                    Henüz çalışan eklenmedi.
                  </td>
                </tr>
              )}
              {calisanlar.map((c) =>
                editingId === c.id ? (
                  <EditRow key={c.id} form={form} setForm={setForm} onSave={() => saveEdit(c.id)} onCancel={() => setEditingId(null)} />
                ) : (
                  <tr key={c.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3 font-medium">{c.adSoyad}</td>
                    <td className="px-4 py-3">{c.tcKimlikNo || "-"}</td>
                    <td className="px-4 py-3">
                      {c.telefon ? <a className="text-[var(--brand)] hover:underline" href={`tel:${c.telefon}`}>{c.telefon}</a> : "-"}
                    </td>
                    <td className="px-4 py-3">{c.adres || "-"}</td>
                    <td className="px-4 py-3">{c.acilDurumKisisi || "-"}</td>
                    <td className="px-4 py-3">{c.acilTelefon || "-"}</td>
                    <td className="px-4 py-3">{c.not || "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <button className="icon-btn" onClick={() => startEdit(c)} title="Düzenle">✎</button>
                        <button className="icon-btn" onClick={() => deleteCalisan(c.id)} title="Sil">🗑</button>
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
      </div>

      {!adding && (
        <button className="btn-secondary self-start" onClick={() => setAdding(true)}>
          + Yeni Çalışan Ekle
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
    <tr className="border-t border-[var(--border)] bg-gray-50/60">
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
