// Personel maaş carisi: dönem hesabı (otomatik hak ediş), ekstre ve kalan.
//
// Kalan = devreden + hak edişler + mesai + ekler − kesintiler − ödemeler
//
// **Tek kaynak kuralı:** ödemeler `personelHareketleri` koleksiyonunda tutulmaz; personele yapılan
// her ödeme `personelId` taşıyan bir Kasa kaydıdır (yon "giden"). Böylece hem Personel sayfasından
// hem Kasa'dan yapılan ödeme aynı ekstreye düşer ve para iki kez sayılmaz.
import { formatDate, monthLabel, shiftMonthKey } from "./format";
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
// **Sınır bugünden geriye sayılır**; bugünün dönemi her zaman üretilir. Eskiden sınır başlangıç
// tarihinden sayılıyordu, bu yüzden devreden tarihi 26 haftadan / 12 aydan eskiyse bugünün dönemi
// hiç üretilmiyor, personel kalıcı olarak "bu hafta işlenmedi" görünüyordu.
const EN_FAZLA_HAFTA = 26;
const EN_FAZLA_AY = 12;

function devredenTarihiOf(c: Calisan): string | undefined {
  return c.devredenTarihi?.trim() ? c.devredenTarihi : undefined;
}

// Hak edişi yazılması gereken dönemler, eskiden yeniye. Başlangıç devreden tarihi; yoksa yalnızca
// bugünün dönemi (ne zamandan beri çalıştığı bilinmediği için geriye dönük tamamlama yapılmaz).
// Devreden tarihi bir dönemin ortasındaysa o dönem devredene dahil sayılır ve yazılmaz.
export function uretilecekDonemler(c: Calisan, bugun: string): string[] {
  if (c.pasif || !c.maasTutari || c.maasTutari <= 0) return [];
  const devreden = devredenTarihiOf(c);
  // Devreden tarihi ileriye dönükse hak ediş henüz başlamamıştır.
  if (devreden && devreden > bugun) return [];

  const donemler: string[] = [];
  if (maasTuru(c) === "haftalik") {
    let ilk = pazartesiOf(devreden ?? bugun);
    if (devreden && ilk < devreden) ilk = gunEkle(ilk, 7);
    for (let gun = pazartesiOf(bugun), i = 0; i < EN_FAZLA_HAFTA && gun >= ilk; i++, gun = gunEkle(gun, -7)) {
      donemler.push(`h${gun}`);
    }
  } else {
    let ilkAy = (devreden ?? bugun).slice(0, 7);
    if (devreden && !devreden.endsWith("-01")) ilkAy = shiftMonthKey(ilkAy, 1);
    for (let ay = bugun.slice(0, 7), i = 0; i < EN_FAZLA_AY && ay >= ilkAy; i++, ay = shiftMonthKey(ay, -1)) {
      donemler.push(`a${ay}`);
    }
  }
  return donemler.reverse();
}

// Üretilmesi gerekenlerden henüz yazılmamış olanlar.
export function eksikDonemler(c: Calisan, hareketler: PersonelHareketi[], bugun: string): string[] {
  const varOlan = new Set(hareketler.filter((h) => h.personelId === c.id && h.donem).map((h) => h.donem!));
  return uretilecekDonemler(c, bugun).filter((d) => !varOlan.has(d));
}

export type HakEdisDurum = "islendi" | "devredene-dahil" | "eksik" | "yok";

// Bu dönemin durumu. Hep `uretilecekDonemler`e bakar, bu yüzden ekranda yazan ile yazılacak hak
// ediş birbirinden kopamaz:
//   islendi         — bu dönemin hak edişi yazılı
//   devredene-dahil — devreden tarihi bu dönemin içinde, maaşı devreden alacağın içinde sayılıyor
//   eksik           — yazılması gerekiyor ("şimdi işle" gerçekten bir şey yazar)
//   yok             — pasif ya da maaş tutarı girilmemiş
//
// Eskiden burada yalnızca "bu dönemin kaydı var mı?" sorulduğu için devredene dahil dönemler
// "işlenmedi" görünüyor, "şimdi işle" düğmesi de sessizce hiçbir şey yapmıyordu.
export function hakEdisDurumu(
  c: Calisan,
  hareketler: PersonelHareketi[],
  bugun: string
): { durum: HakEdisDurum; eksik: number } {
  if (c.pasif || !c.maasTutari || c.maasTutari <= 0) return { durum: "yok", eksik: 0 };
  const donem = donemKimligi(maasTuru(c), bugun);
  const eksikler = eksikDonemler(c, hareketler, bugun);
  if (eksikler.includes(donem)) return { durum: "eksik", eksik: eksikler.length };
  const yazili = hareketler.some((h) => h.personelId === c.id && h.donem === donem);
  return { durum: yazili ? "islendi" : "devredene-dahil", eksik: eksikler.length };
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
