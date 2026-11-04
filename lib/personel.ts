// Personel maaş carisi: dönem hesabı (otomatik hak ediş), ekstre ve kalan.
//
// Kalan = devreden + hak edişler + mesai + ekler − kesintiler − ödemeler
//
// **Tek kaynak kuralı:** ödemeler `personelHareketleri` koleksiyonunda tutulmaz; personele yapılan
// her ödeme `personelId` taşıyan bir Kasa kaydıdır (yon "giden"). Böylece hem Personel sayfasından
// hem Kasa'dan yapılan ödeme aynı ekstreye düşer ve para iki kez sayılmaz.
import { formatDate, monthLabel } from "./format";
import { hareketlerOf } from "./hareketler";
import { mahsupEtiketi, sayilan } from "./kayit";
import type { Calisan, KasaKaydi, MaasTuru, PersonelHareketi, PersonelHareketTuru } from "./types";

export const MAAS_TURU_LABEL: Record<MaasTuru, string> = {
  haftalik: "Haftalık",
  aylik: "Aylık",
};

export const HAREKET_LABEL: Record<PersonelHareketTuru, string> = {
  hakedis: "Hak ediş",
  mesai: "Mesai",
  ek: "Ek (prim vb.)",
  kesinti: "Kesinti",
};

export function maasTuru(c: Pick<Calisan, "maasTuru">): MaasTuru {
  return c.maasTuru ?? "aylik";
}

// Kesinti kalanı düşürür, diğerleri artırır.
export function hareketIsareti(tur: PersonelHareketTuru): 1 | -1 {
  return tur === "kesinti" ? -1 : 1;
}

// ---- Dönemler ----
// Haftalık dönem Pazartesi başlar; dönem kimliği haftanın Pazartesi tarihinden türetilir
// ("h2026-11-02"). Aylık dönem ayın 1'i ("a2026-11"). ISO hafta numarası yerine Pazartesi tarihi
// kullanılıyor: yıl sonu hafta numarası karmaşası olmadan aynı sonucu veriyor.

function isoOf(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function pazartesiOf(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const gun = d.getDay(); // 0 Pazar, 1 Pazartesi
  d.setDate(d.getDate() - (gun === 0 ? 6 : gun - 1));
  return isoOf(d);
}

export function donemKimligi(tur: MaasTuru, iso: string): string {
  return tur === "haftalik" ? `h${pazartesiOf(iso)}` : `a${iso.slice(0, 7)}`;
}

// Dönemin başladığı gün: hak ediş satırının tarihi.
export function donemBasi(donem: string): string {
  return donem.startsWith("h") ? donem.slice(1) : `${donem.slice(1)}-01`;
}

export function donemEtiketi(donem: string): string {
  if (!donem.startsWith("h")) return monthLabel(donem.slice(1));
  const bas = donem.slice(1);
  return `${formatDate(bas)} – ${formatDate(gunEkle(bas, 6))} haftası`;
}

// Takvim günü ekler (ms aritmetiği yerine), böylece saat kaymaları bir günü geri atamaz.
function gunEkle(iso: string, gun: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + gun);
  return isoOf(d);
}

// Geçmişe dönük tamamlama sınırı: devreden tarihi çok eskiyse yüzlerce satır üretilmesin.
const EN_FAZLA_HAFTA = 26;
const EN_FAZLA_AY = 12;

// Bugüne kadar başlamış, henüz yazılmamış hak ediş dönemleri. Başlangıç noktası devreden tarihi;
// yoksa bugünün dönemi (geçmişe dönük tamamlama yapılmaz, çünkü ne zamandan beri çalıştığı bilinmiyor).
export function eksikDonemler(c: Calisan, hareketler: PersonelHareketi[], bugun: string): string[] {
  if (c.pasif || !c.maasTutari || c.maasTutari <= 0) return [];
  const tur = maasTuru(c);
  const varOlan = new Set(hareketler.filter((h) => h.personelId === c.id && h.donem).map((h) => h.donem!));

  const baslangic = c.devredenTarihi && c.devredenTarihi <= bugun ? c.devredenTarihi : bugun;
  const donemler: string[] = [];
  if (tur === "haftalik") {
    let gun = pazartesiOf(baslangic);
    // Devreden tarihi hafta ortasındaysa o hafta zaten devredene dahil sayılır; sonraki haftadan başla.
    if (c.devredenTarihi && gun < c.devredenTarihi) gun = gunEkle(gun, 7);
    for (let i = 0; i < EN_FAZLA_HAFTA && gun <= bugun; i++) {
      donemler.push(`h${gun}`);
      gun = gunEkle(gun, 7);
    }
  } else {
    const [y0, m0] = baslangic.split("-").map(Number);
    // Devreden tarihi ayın 1'i değilse o ay devredene dahil; sonraki aydan başla.
    const ilk = c.devredenTarihi && c.devredenTarihi.slice(-2) !== "01" ? 1 : 0;
    for (let i = ilk; i < EN_FAZLA_AY + ilk; i++) {
      const d = new Date(y0, m0 - 1 + i, 1);
      const ay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (`${ay}-01` > bugun) break;
      donemler.push(`a${ay}`);
    }
  }
  return donemler.filter((d) => !varOlan.has(d));
}

// Bu dönem işlendi mi? (Personel kartında "Bu hafta / bu ay işlendi" bilgisi için.)
export function buDonemIslendi(c: Calisan, hareketler: PersonelHareketi[], bugun: string): boolean {
  const donem = donemKimligi(maasTuru(c), bugun);
  return hareketler.some((h) => h.personelId === c.id && h.donem === donem);
}

// ---- Ekstre ----

export interface PersonelSatiri {
  key: string;
  tarih: string;
  aciklama: string;
  tur: PersonelHareketTuru | "devreden" | "odeme";
  hakedis: number; // kalanı artıran tutar
  odeme: number; // kalanı azaltan tutar (ödeme ya da kesinti)
  bakiye: number; // yürüyen kalan
  hareket?: PersonelHareketi; // düzenle / sil için
  kayitId?: string; // ödeme satırının Kasa kaydı
}

// Tarih sırasıyla: devreden, hak edişler / mesai / ek / kesintiler ve Kasa'dan yapılan ödemeler.
export function personelEkstresi(
  c: Calisan,
  hareketler: PersonelHareketi[],
  kayitlar: KasaKaydi[]
): PersonelSatiri[] {
  const satirlar: Omit<PersonelSatiri, "bakiye">[] = [];

  if (c.devredenAlacak && Math.abs(c.devredenAlacak) > 0.005) {
    satirlar.push({
      key: "devreden",
      tarih: c.devredenTarihi || "0000-00-00",
      aciklama: "Geçmişten devreden alacak",
      tur: "devreden",
      hakedis: c.devredenAlacak > 0 ? c.devredenAlacak : 0,
      odeme: c.devredenAlacak < 0 ? -c.devredenAlacak : 0,
    });
  }

  for (const h of hareketler) {
    if (h.personelId !== c.id) continue;
    const arti = hareketIsareti(h.tur) > 0;
    const etiket = h.tur === "hakedis" && h.donem ? `Hak ediş · ${donemEtiketi(h.donem)}` : HAREKET_LABEL[h.tur];
    const saat = h.tur === "mesai" && h.saat ? ` · ${h.saat} saat` : "";
    satirlar.push({
      key: `h-${h.id}`,
      tarih: h.tarih,
      aciklama: [etiket + saat, h.aciklama].filter(Boolean).join(" · "),
      tur: h.tur,
      hakedis: arti ? h.tutar : 0,
      odeme: arti ? 0 : h.tutar,
      hareket: h,
    });
  }

  // Ödemeler: personelId taşıyan Kasa kayıtlarının para hareketleri (sonradan eklenen ödeme satırları
  // da kendi tarihinde sayılır). Mahsupta kasadan para çıkmaz ama personelin alacağı kapanır:
  // üçüncü taraf personele ödediği için sayılan tutar ödeme olarak işlenir.
  for (const k of kayitlar) {
    if (k.tur === "mahsup" && k.karsiPersonelId === c.id) {
      satirlar.push({
        key: `m-${k.id}`,
        tarih: k.tarih,
        aciklama: [mahsupEtiketi(k), k.aciklama].filter(Boolean).join(" · "),
        tur: "odeme",
        hakedis: 0,
        odeme: sayilan(k),
        kayitId: k.id,
      });
      continue;
    }
    if (k.personelId !== c.id || k.tur) continue;
    for (const hareket of hareketlerOf(k)) {
      if (hareket.tutar === 0) continue;
      const cikis = hareket.yon === "giden";
      satirlar.push({
        key: `k-${k.id}-${hareket.odemeIndex ?? "p"}`,
        tarih: hareket.tarih,
        aciklama: [cikis ? "Ödeme" : "Personelden tahsil", k.aciklama].filter(Boolean).join(" · "),
        tur: "odeme",
        hakedis: cikis ? 0 : hareket.tutar,
        odeme: cikis ? hareket.tutar : 0,
        kayitId: k.id,
      });
    }
  }

  satirlar.sort((a, b) => (a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : 0));
  let bakiye = 0;
  return satirlar.map((s) => {
    bakiye += s.hakedis - s.odeme;
    return { ...s, bakiye };
  });
}

export interface PersonelOzet {
  kalan: number; // pozitifse personele borç
  hakedis: number;
  odenen: number;
  sonOdemeTarihi?: string;
  sonOdemeTutari?: number;
}

export function personelOzeti(c: Calisan, hareketler: PersonelHareketi[], kayitlar: KasaKaydi[]): PersonelOzet {
  const satirlar = personelEkstresi(c, hareketler, kayitlar);
  let hakedis = 0;
  let odenen = 0;
  let sonOdemeTarihi: string | undefined;
  let sonOdemeTutari: number | undefined;
  for (const s of satirlar) {
    hakedis += s.hakedis;
    odenen += s.odeme;
    if (s.tur === "odeme" && s.odeme > 0 && (!sonOdemeTarihi || s.tarih >= sonOdemeTarihi)) {
      sonOdemeTarihi = s.tarih;
      sonOdemeTutari = s.odeme;
    }
  }
  return { kalan: hakedis - odenen, hakedis, odenen, sonOdemeTarihi, sonOdemeTutari };
}

// Genel Durum ve (sonraki adımda) Kasa özet şeridi için: aktif personelin kalan toplamı. Genel
// Durum'da ticari borçlardan ayrı gösterilir ama Net Finansal Durum'dan düşülür.
export function personelBorcuToplami(
  calisanlar: Calisan[],
  hareketler: PersonelHareketi[],
  kayitlar: KasaKaydi[]
): { toplam: number; satirlar: { calisan: Calisan; kalan: number }[] } {
  const satirlar = calisanlar
    .filter((c) => !c.pasif)
    .map((c) => ({ calisan: c, kalan: personelOzeti(c, hareketler, kayitlar).kalan }))
    .filter((s) => Math.abs(s.kalan) > 0.005)
    .sort((a, b) => b.kalan - a.kalan);
  return { toplam: satirlar.reduce((s, x) => s + x.kalan, 0), satirlar };
}
