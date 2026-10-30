"use client";

import { useMemo, useState } from "react";
import { Landmark, Copy, Check, Pencil, Trash2, Plus, ChevronDown, EyeOff, RotateCcw, CreditCard, CircleHelp } from "lucide-react";
import { useBankaHesaplari, useKasaKayitlari } from "@/lib/hooks";
import { addBankaHesabi, deleteBankaHesabi, hesapAta, updateBankaHesabi } from "@/lib/db";
import { tumHareketler, signed, type Hareket } from "@/lib/hareketler";
import { formatDate, formatTL } from "@/lib/format";
import type { BankaHesabi, KasaKaydi } from "@/lib/types";
import { hesapEtiketi } from "@/components/OdemeSekliSelect";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

const empty = { banka: "", hesapSahibi: "", iban: "", aciklama: "" };
const SON_HAREKET = 3;
const BELIRTILMEMIS = "Belirtilmemiş";

export default function BankaBilgileriPage() {
  const { hesaplar, loading } = useBankaHesaplari();
  const { kayitlar, loading: kayitlarLoading } = useKasaKayitlari();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [adding, setAdding] = useState(false);

  // Havale movements grouped by account, newest first. Those with no (or an unknown) account
  // go to "Hesap seçilmemiş", so all cards together add up to the Banka total on Kasa.
  const { hareketMap, secilmemis } = useMemo(() => {
    const map = new Map<string, Hareket[]>();
    const secilmemis: Hareket[] = [];
    const hesapIdleri = new Set(hesaplar.map((h) => h.id));
    for (const h of tumHareketler(kayitlar)) {
      if (h.odemeSekli !== "havale") continue;
      if (!h.bankaHesapId || !hesapIdleri.has(h.bankaHesapId)) {
        secilmemis.push(h);
        continue;
      }
      if (!map.has(h.bankaHesapId)) map.set(h.bankaHesapId, []);
      map.get(h.bankaHesapId)!.push(h);
    }
    const yeniden = (a: Hareket, b: Hareket) => (a.tarih < b.tarih ? 1 : -1);
    for (const list of map.values()) list.sort(yeniden);
    secilmemis.sort(yeniden);
    return { hareketMap: map, secilmemis };
  }, [kayitlar, hesaplar]);

  // Card movements grouped by where they were charged ("Ziraat POS"), largest first.
  const kartGruplari = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of tumHareketler(kayitlar)) {
      if (h.odemeSekli !== "kart") continue;
      const ad = h.kartAciklama || BELIRTILMEMIS;
      map.set(ad, (map.get(ad) ?? 0) + signed(h));
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [kayitlar]);

  const siraliHesaplar = useMemo(
    () => [...hesaplar].sort((a, b) => Number(!!a.pasif) - Number(!!b.pasif)),
    [hesaplar]
  );

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

  return (
    <div className="page-enter flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          title="Banka Hesapları"
          description="Hesap bilgileri, her hesaba yapılan havalelerin bakiyesi ve kart / POS tahsilatları."
        />
        {!adding && (
          <button className="btn-primary inline-flex items-center gap-2" onClick={() => { setAdding(true); setForm(empty); }}>
            <Plus className="w-4 h-4" /> Yeni Hesap
          </button>
        )}
      </div>

      <KartPosOzeti gruplar={kartGruplari} />

      {secilmemis.length > 0 && (
        <HesapSecilmemis hareketler={secilmemis} kayitlar={kayitlar} hesaplar={hesaplar} />
      )}

      {!loading && hesaplar.length === 0 && !adding && (
        <div className="card">
          <EmptyState
            icon={Landmark}
            title="Henüz banka hesabı eklenmedi"
            description="'Yeni Hesap' ile ilk hesabını ekle. Kasa'da 'Banka Havalesi' seçtiğinde bu hesaplar listelenir."
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {adding && (
          <HesapForm form={form} setForm={setForm} onSave={saveNew} onCancel={() => { setAdding(false); setForm(empty); }} />
        )}
        {siraliHesaplar.map((h) =>
          editingId === h.id ? (
            <HesapForm key={h.id} form={form} setForm={setForm} onSave={() => saveEdit(h.id)} onCancel={() => setEditingId(null)} />
          ) : (
            <HesapKarti
              key={h.id}
              hesap={h}
              hareketler={hareketMap.get(h.id) ?? []}
              open={openId === h.id}
              onToggle={() => setOpenId(openId === h.id ? null : h.id)}
              onEdit={() => startEdit(h)}
              onDelete={() => deleteBankaHesabi(h.id)}
              onTogglePasif={() => updateBankaHesabi(h.id, { pasif: !h.pasif })}
              silinebilir={!kayitlarLoading && !hareketMap.has(h.id)}
            />
          )
        )}
      </div>
    </div>
  );
}

function KartPosOzeti({ gruplar }: { gruplar: [string, number][] }) {
  const toplam = gruplar.reduce((s, [, t]) => s + t, 0);
  return (
    <div className="card overflow-hidden">
      <div className="p-5 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-[#f3f0fd] flex items-center justify-center shrink-0">
            <CreditCard className="w-4 h-4 text-[var(--accent-violet)]" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold">Kart / POS</div>
            <div className="text-xs text-[var(--muted)]">Kredi kartı ile alınanlar, çekildiği yere göre</div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">Toplam</div>
          <div className="tabular text-lg font-semibold">{formatTL(toplam)}</div>
        </div>
      </div>
      <div className="border-t border-[var(--border)]">
        {gruplar.length === 0 ? (
          <div className="px-5 py-4 text-xs text-[var(--muted)]">Henüz kredi kartı ile işlem yok.</div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[var(--border)]">
            {gruplar.map(([ad, tutar]) => (
              <li key={ad} className="bg-[var(--surface)] px-5 py-3 flex items-center justify-between gap-4 text-sm">
                <span className={`truncate ${ad === BELIRTILMEMIS ? "text-[var(--muted)] italic" : ""}`}>{ad}</span>
                <span className="tabular font-medium shrink-0">{formatTL(tutar)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function HesapSecilmemis({
  hareketler,
  kayitlar,
  hesaplar,
}: {
  hareketler: Hareket[];
  kayitlar: KasaKaydi[];
  hesaplar: BankaHesabi[];
}) {
  const [secili, setSecili] = useState<string | null>(null);
  const bakiye = hareketler.reduce((s, h) => s + signed(h), 0);
  const aktifler = hesaplar.filter((h) => !h.pasif);
  const anahtar = (h: Hareket) => `${h.kayitId}-${h.odemeIndex ?? "p"}`;

  async function ata(h: Hareket, bankaHesapId: string) {
    const kayit = kayitlar.find((k) => k.id === h.kayitId);
    if (!kayit || !bankaHesapId) return;
    try {
      await hesapAta(kayit, h.odemeIndex, bankaHesapId);
      setSecili(null);
    } catch (err) {
      console.error(err);
      alert("Hesap atanamadı, lütfen tekrar deneyin.");
    }
  }

  return (
    <div className="card overflow-hidden">
      <div className="p-5 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-[var(--accent-orange-soft)] flex items-center justify-center shrink-0">
            <CircleHelp className="w-4 h-4 text-[var(--accent-orange)]" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold">Hesap seçilmemiş</div>
            <div className="text-xs text-[var(--muted)]">Hesabı seçilmeden girilen havaleler. Hesap atamak için kayda tıklayın.</div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">Bakiye</div>
          <div className={`tabular text-lg font-semibold ${bakiye < 0 ? "text-[var(--brand)]" : ""}`}>{formatTL(bakiye)}</div>
        </div>
      </div>
      <ul className="border-t border-[var(--border)] divide-y divide-[var(--border)]">
        {hareketler.map((h) => {
          const key = anahtar(h);
          const acik = secili === key;
          return (
            <li key={key}>
              <button
                className="w-full text-left px-5 py-2.5 flex items-center justify-between gap-4 text-sm hover:bg-[var(--surface-hover)] transition-colors"
                onClick={() => setSecili(acik ? null : key)}
              >
                <div className="min-w-0">
                  <div className="truncate">{h.firma}</div>
                  <div className="text-xs text-[var(--muted)] tabular">
                    {formatDate(h.tarih)}
                    {h.aciklama ? ` · ${h.aciklama}` : ""}
                    {h.odemeIndex !== undefined ? " · sonradan ödeme" : ""}
                  </div>
                </div>
                <div className={`tabular font-medium shrink-0 ${h.yon === "gelen" ? "text-[var(--accent-green)]" : ""}`}>
                  {h.yon === "gelen" ? "+" : "−"}
                  {formatTL(h.tutar)}
                </div>
              </button>
              {acik && (
                <div className="px-5 pb-3 flex items-center gap-2">
                  {aktifler.length === 0 ? (
                    <span className="text-xs text-[var(--muted)] flex-1">Önce bir banka hesabı ekleyin.</span>
                  ) : (
                    <select
                      autoFocus
                      className="select-field select-field-md flex-1 min-w-0"
                      defaultValue=""
                      onChange={(e) => ata(h, e.target.value)}
                    >
                      <option value="" disabled>
                        Hangi hesaba atansın?
                      </option>
                      {aktifler.map((a) => (
                        <option key={a.id} value={a.id}>
                          {hesapEtiketi(a)}
                        </option>
                      ))}
                    </select>
                  )}
                  <button className="btn-secondary !py-1.5 !px-3 !text-xs" onClick={() => setSecili(null)}>
                    Vazgeç
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function HesapKarti({
  hesap,
  hareketler,
  open,
  onToggle,
  onEdit,
  onDelete,
  onTogglePasif,
  silinebilir,
}: {
  hesap: BankaHesabi;
  hareketler: Hareket[];
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePasif: () => void;
  silinebilir: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const gelen = hareketler.filter((h) => h.yon === "gelen").reduce((s, h) => s + h.tutar, 0);
  const giden = hareketler.filter((h) => h.yon === "giden").reduce((s, h) => s + h.tutar, 0);
  const bakiye = hareketler.reduce((s, h) => s + signed(h), 0);
  const gorunen = open ? hareketler : hareketler.slice(0, SON_HAREKET);

  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(hesap.iban.replace(/\s/g, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <div className={`card overflow-hidden ${hesap.pasif ? "opacity-60" : ""}`}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onToggle())}
        className="p-5 cursor-pointer hover:bg-[var(--surface-hover)] transition-colors"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-semibold truncate flex items-center gap-2">
              {hesap.banka || "Banka"}
              {hesap.pasif && <span className="badge bg-[#f1f1f4] text-[var(--muted)]">Pasif</span>}
            </div>
            <div className="text-xs text-[var(--muted)] truncate">
              {[hesap.hesapSahibi, hesap.aciklama].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[11px] uppercase tracking-wider text-[var(--muted)]">Bakiye</div>
            <div className={`tabular text-lg font-semibold ${bakiye < 0 ? "text-[var(--brand)]" : ""}`}>{formatTL(bakiye)}</div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            className="font-mono text-[13px] tracking-wide text-[var(--muted)] hover:text-[var(--foreground)] inline-flex items-center gap-1.5 min-w-0"
            onClick={copy}
            title="IBAN'ı kopyala"
          >
            <span className="truncate">{hesap.iban || "IBAN yok"}</span>
            {copied ? <Check className="w-3.5 h-3.5 text-[var(--accent-green)] shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
          </button>
          <div className="text-xs text-[var(--muted)] tabular shrink-0">
            <span className="text-[var(--accent-green)]">+{formatTL(gelen)}</span>
            <span className="mx-1.5 text-[var(--border-strong)]">/</span>
            <span>−{formatTL(giden)}</span>
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--border)]">
        {hareketler.length === 0 ? (
          <div className="px-5 py-4 text-xs text-[var(--muted)]">Bu hesaba bağlı havale yok.</div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {gorunen.map((h, i) => (
              <li key={`${h.kayitId}-${i}`} className="px-5 py-2.5 flex items-center justify-between gap-4 text-sm">
                <div className="min-w-0">
                  <div className="truncate">{h.firma}</div>
                  <div className="text-xs text-[var(--muted)] tabular">
                    {formatDate(h.tarih)}
                    {h.aciklama ? ` · ${h.aciklama}` : ""}
                  </div>
                </div>
                <div className={`tabular font-medium shrink-0 ${h.yon === "gelen" ? "text-[var(--accent-green)]" : ""}`}>
                  {h.yon === "gelen" ? "+" : "−"}
                  {formatTL(h.tutar)}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="px-5 py-2 flex items-center justify-between border-t border-[var(--border)]">
          {hareketler.length > SON_HAREKET ? (
            <button className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] inline-flex items-center gap-1" onClick={onToggle}>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
              {open ? "Daha az göster" : `Tüm hareketler (${hareketler.length})`}
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-1">
            <button className="icon-btn" onClick={onEdit} title="Düzenle">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            {/* Accounts with movements can't be deleted, only deactivated, so history stays intact. */}
            {!silinebilir || hesap.pasif ? (
              <button
                className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] inline-flex items-center gap-1 px-2 h-[30px] rounded-lg hover:bg-[#f1f1f4]"
                onClick={onTogglePasif}
                title={hesap.pasif ? "Yeni işlemlerde tekrar listelensin" : "Yeni işlemlerde listelenmesin; hareketleri görünmeye devam eder"}
              >
                {hesap.pasif ? <RotateCcw className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                {hesap.pasif ? "Aktif yap" : "Pasif yap"}
              </button>
            ) : (
              <button className="icon-btn hover:!text-[var(--brand)]" onClick={onDelete} title="Sil">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HesapForm({
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
    <div className="card p-5 flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="field-label">Banka</label>
          <input className="input-field" autoFocus value={form.banka} onChange={(e) => setForm({ ...form, banka: e.target.value })} placeholder="Banka adı" />
        </div>
        <div>
          <label className="field-label">Hesap sahibi</label>
          <input className="input-field" value={form.hesapSahibi} onChange={(e) => setForm({ ...form, hesapSahibi: e.target.value })} placeholder="Hesap sahibi" />
        </div>
      </div>
      <div>
        <label className="field-label">IBAN</label>
        <input className="input-field font-mono" value={form.iban} onChange={(e) => setForm({ ...form, iban: e.target.value })} placeholder="TR.." />
      </div>
      <div>
        <label className="field-label">Açıklama</label>
        <input className="input-field" value={form.aciklama} onChange={(e) => setForm({ ...form, aciklama: e.target.value })} placeholder="Örn. TL vadesiz" />
      </div>
      <div className="flex gap-2 justify-end mt-1">
        <button className="btn-secondary" onClick={onCancel}>Vazgeç</button>
        <button className="btn-primary" onClick={onSave}>Kaydet</button>
      </div>
    </div>
  );
}
