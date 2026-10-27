"use client";

import { useState } from "react";
import { Landmark, Copy, Check, Pencil, Trash2, Plus } from "lucide-react";
import { useBankaHesaplari } from "@/lib/hooks";
import { addBankaHesabi, deleteBankaHesabi, updateBankaHesabi } from "@/lib/db";
import type { BankaHesabi } from "@/lib/types";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

const empty = { banka: "", hesapSahibi: "", iban: "", aciklama: "" };

export default function BankaBilgileriPage() {
  const { hesaplar, loading } = useBankaHesaplari();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [adding, setAdding] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function startEdit(h: BankaHesabi) {
    setEditingId(h.id);
    setForm({ banka: h.banka, hesapSahibi: h.hesapSahibi, iban: h.iban, aciklama: h.aciklama });
  }

  async function saveEdit(id: string) {
    await updateBankaHesabi(id, form);
    setEditingId(null);
    setForm(empty);
  }

  async function saveNew() {
    if (!form.banka.trim() && !form.iban.trim()) return;
    await addBankaHesabi(form);
    setForm(empty);
    setAdding(false);
  }

  async function copy(h: BankaHesabi) {
    try {
      await navigator.clipboard.writeText(h.iban.replace(/\s/g, ""));
      setCopiedId(h.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {}
  }

  return (
    <div className="page-enter flex flex-col gap-6">
      <PageHeader title="Banka Hesapları" description="İşletmenin banka ve IBAN bilgileri — müşterilere paylaşmak için hızlıca kopyalanabilir." />

      <div className="card overflow-hidden">
        {!loading && hesaplar.length === 0 && !adding ? (
          <EmptyState
            icon={Landmark}
            title="Henüz banka hesabı eklenmedi"
            description="Aşağıdaki '+ Yeni Banka Hesabı Ekle' butonuyla ilk hesabını ekleyebilirsin."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-zebra">
              <thead>
                <tr className="text-left text-[var(--foreground)] text-xs uppercase tracking-wide bg-gray-50 border-b border-[var(--border)]">
                  <th className="px-5 py-3 font-bold">Banka</th>
                  <th className="px-5 py-3 font-bold">Hesap Sahibi</th>
                  <th className="px-5 py-3 font-bold">IBAN</th>
                  <th className="px-5 py-3 font-bold">Açıklama</th>
                  <th className="px-5 py-3 font-bold w-[190px]"></th>
                </tr>
              </thead>
              <tbody>
                {hesaplar.map((h) =>
                  editingId === h.id ? (
                    <EditRow key={h.id} form={form} setForm={setForm} onSave={() => saveEdit(h.id)} onCancel={() => setEditingId(null)} />
                  ) : (
                    <tr key={h.id} className="border-t border-[var(--border)]">
                      <td className="px-5 py-3 font-medium">{h.banka}</td>
                      <td className="px-5 py-3">{h.hesapSahibi}</td>
                      <td className="px-5 py-3 font-mono tracking-wide">{h.iban}</td>
                      <td className="px-5 py-3 text-[var(--muted)]">{h.aciklama}</td>
                      <td className="px-5 py-3">
                        <div className="flex gap-2 justify-end">
                          <button className="btn-secondary !py-1.5 !px-3 !text-xs inline-flex items-center gap-1.5" onClick={() => copy(h)}>
                            {copiedId === h.id ? <Check className="w-3.5 h-3.5 text-[var(--accent-green)]" /> : <Copy className="w-3.5 h-3.5" />}
                            {copiedId === h.id ? "Kopyalandı" : "Kopyala"}
                          </button>
                          <button className="icon-btn" onClick={() => startEdit(h)} title="Düzenle">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button className="icon-btn hover:!text-[var(--brand)]" onClick={() => deleteBankaHesabi(h.id)} title="Sil">
                            <Trash2 className="w-4 h-4" />
                          </button>
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
          <Plus className="w-4 h-4" /> Yeni Banka Hesabı Ekle
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
      <td className="px-5 py-2">
        <input className="input-sm bg-white border border-[var(--border)]" value={form.banka} onChange={(e) => setForm({ ...form, banka: e.target.value })} placeholder="Banka adı" />
      </td>
      <td className="px-5 py-2">
        <input className="input-sm bg-white border border-[var(--border)]" value={form.hesapSahibi} onChange={(e) => setForm({ ...form, hesapSahibi: e.target.value })} placeholder="Hesap sahibi" />
      </td>
      <td className="px-5 py-2">
        <input className="input-sm bg-white border border-[var(--border)] font-mono" value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} placeholder="TR.." />
      </td>
      <td className="px-5 py-2">
        <input className="input-sm bg-white border border-[var(--border)]" value={form.aciklama} onChange={(e) => setForm({ ...form, aciklama: e.target.value })} placeholder="Açıklama" />
      </td>
      <td className="px-5 py-2">
        <div className="flex gap-2 justify-end">
          <button className="btn-primary !py-1.5 !px-3 !text-xs" onClick={onSave}>Kaydet</button>
          <button className="btn-secondary !py-1.5 !px-3 !text-xs" onClick={onCancel}>Vazgeç</button>
        </div>
      </td>
    </tr>
  );
}
