// Backups to Google Drive and restores from them. Used by the nightly cron and by Ayarlar.
import { gunzipSync, gzipSync } from "node:zlib";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "./admin";
import { dosyaIndir, dosyalariListele, dosyaSil, dosyaYukle, klasorId, type DriveDosyasi } from "./drive";
import {
  GORSEL_KOLEKSIYONLARI,
  SISTEM_KOLEKSIYONU,
  YEDEK_UYGULAMA,
  tamYedekMi,
  yedekDosyaAdi,
  yedekGrupAdi,
  yedekTarihi,
  zamanDuzle,
  type YedekAdTuru,
  type YedekDosyasi,
} from "../yedekBicimi";
import type { YedekSonucu, YedekTuru } from "../types";

const GUNLUK_SAKLAMA_GUN = 30;
const TAM_SAKLAMA_ADET = 8;
const PARCA_BOYUTU = 200 * 1024 * 1024; // full backups larger than this are uploaded in parts

// Every top-level collection except the status one; images only when asked.
export async function veriAktar(gorsellerDahil: boolean): Promise<YedekDosyasi> {
  const db = adminDb();
  const koleksiyonlar: YedekDosyasi["koleksiyonlar"] = {};
  for (const ref of await db.listCollections()) {
    if (ref.id === SISTEM_KOLEKSIYONU) continue;
    if (!gorsellerDahil && GORSEL_KOLEKSIYONLARI.includes(ref.id)) continue;
    const snap = await ref.get();
    koleksiyonlar[ref.id] = Object.fromEntries(snap.docs.map((d) => [d.id, zamanDuzle(d.data())]));
  }
  return { uygulama: YEDEK_UYGULAMA, surum: 1, olusturma: new Date().toISOString(), gorsellerDahil, koleksiyonlar };
}

async function durumYaz(sonuc: YedekSonucu) {
  const otomatik = sonuc.tur === "gunluk" || sonuc.tur === "tam";
  await adminDb()
    .collection(SISTEM_KOLEKSIYONU)
    .doc("yedek")
    .set(
      {
        son: sonuc,
        ...(sonuc.tur === "gunluk" ? { sonOtomatik: sonuc } : {}),
        ...(sonuc.tur === "gunluk" && sonuc.basarili ? { sonBasariliOtomatik: sonuc.zaman } : {}),
        ...((sonuc.tur === "tam" || sonuc.tur === "elle-tam") && sonuc.basarili ? { sonTam: sonuc } : {}),
        // A failed weekly full backup also shows as a failed nightly run, so the menu warns.
        ...(otomatik && !sonuc.basarili ? { sonOtomatik: sonuc } : {}),
      },
      { merge: true }
    );
}

// Takes a backup, uploads it, prunes old ones and records the outcome in sistem/yedek.
export async function yedekAl(tur: YedekTuru, gorsellerDahil = tur === "tam" || tur === "elle-tam"): Promise<YedekSonucu> {
  const zaman = Date.now();
  try {
    const veri = await veriAktar(gorsellerDahil);
    const json = Buffer.from(JSON.stringify(veri), "utf8");
    const adTuru: YedekAdTuru = tur === "geri-yukleme-oncesi" && gorsellerDahil ? "geri-yukleme-oncesi-tam" : tur;
    const ad = yedekDosyaAdi(adTuru, zaman);
    const klasor = await klasorId();
    const yuklenen: DriveDosyasi[] = [];

    if (gorsellerDahil) {
      const gz = gzipSync(json);
      const parcaSayisi = Math.ceil(gz.length / PARCA_BOYUTU);
      for (let i = 0; i < parcaSayisi; i++) {
        const parcaAdi = parcaSayisi > 1 ? `${ad}.${String(i + 1).padStart(3, "0")}` : ad;
        yuklenen.push(await dosyaYukle(klasor, parcaAdi, gz.subarray(i * PARCA_BOYUTU, (i + 1) * PARCA_BOYUTU), "application/gzip"));
      }
    } else {
      yuklenen.push(await dosyaYukle(klasor, ad, json, "application/json"));
    }

    const sonuc: YedekSonucu = {
      zaman,
      tur,
      basarili: true,
      dosyalar: yuklenen.map((d) => d.name),
      boyut: yuklenen.reduce((s, d) => s + d.size, 0),
    };
    await durumYaz(sonuc);
    // Pruning problems must not mark a successful backup as failed.
    await temizle(klasor).catch((err) => console.error("Eski yedekler silinemedi", err));
    return sonuc;
  } catch (err) {
    const sonuc: YedekSonucu = { zaman, tur, basarili: false, hata: err instanceof Error ? err.message : String(err) };
    await durumYaz(sonuc).catch((e) => console.error("Yedek durumu yazılamadı", e));
    throw err;
  }
}

export interface YedekGrubu {
  ad: string; // group name (parts merged)
  tarih: string | null;
  tam: boolean;
  boyut: number;
  olusturma: string;
  dosyalar: DriveDosyasi[]; // parts in order
}

export async function yedekleriListele(klasor?: string): Promise<YedekGrubu[]> {
  const dosyalar = (await dosyalariListele(klasor ?? (await klasorId()))).filter((d) => d.name.startsWith("panzehir-"));
  const gruplar = new Map<string, YedekGrubu>();
  for (const d of dosyalar) {
    const ad = yedekGrupAdi(d.name);
    const g = gruplar.get(ad) ?? { ad, tarih: yedekTarihi(ad), tam: tamYedekMi(ad), boyut: 0, olusturma: d.createdTime, dosyalar: [] };
    g.dosyalar.push(d);
    g.boyut += d.size;
    if (d.createdTime < g.olusturma) g.olusturma = d.createdTime;
    gruplar.set(ad, g);
  }
  for (const g of gruplar.values()) g.dosyalar.sort((a, b) => a.name.localeCompare(b.name));
  return [...gruplar.values()].sort((a, b) => (a.olusturma < b.olusturma ? 1 : -1));
}

// Keeps 30 days of regular backups and the latest 8 full ones.
export async function temizle(klasor: string) {
  const gruplar = await yedekleriListele(klasor);
  const sinir = new Date(Date.now() - GUNLUK_SAKLAMA_GUN * 864e5).toISOString().slice(0, 10);
  const silinecek = [
    ...gruplar.filter((g) => !g.tam && g.tarih && g.tarih < sinir),
    ...gruplar.filter((g) => g.tam).slice(TAM_SAKLAMA_ADET),
  ];
  for (const g of silinecek) for (const d of g.dosyalar) await dosyaSil(d.id);
}

function zamanGeriCevir(deger: unknown): unknown {
  if (Array.isArray(deger)) return deger.map(zamanGeriCevir);
  if (deger && typeof deger === "object") {
    const o = deger as Record<string, unknown>;
    if (typeof o.__zaman === "number" && Object.keys(o).length === 1) return Timestamp.fromMillis(o.__zaman);
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, zamanGeriCevir(v)]));
  }
  return deger;
}

// Replaces every collection in the backup with its contents. Collections the backup doesn't hold
// (images, in a daily backup) are left as they are. The current data is backed up first.
export async function geriYukle(grupAdi: string): Promise<{ oncekiYedek: YedekSonucu; koleksiyonlar: Record<string, number> }> {
  const grup = (await yedekleriListele()).find((g) => g.ad === grupAdi);
  if (!grup) throw new Error("Yedek dosyası bulunamadı.");

  const parcalar = await Promise.all(grup.dosyalar.map((d) => dosyaIndir(d.id)));
  let ham = Buffer.concat(parcalar);
  if (grup.ad.endsWith(".gz")) ham = gunzipSync(ham);
  const veri = JSON.parse(ham.toString("utf8")) as YedekDosyasi;
  if (veri.uygulama !== YEDEK_UYGULAMA || !veri.koleksiyonlar) throw new Error("Bu dosya bir Panzehir Kasa yedeği değil.");

  const oncekiYedek = await yedekAl("geri-yukleme-oncesi", veri.gorsellerDahil);

  const db = adminDb();
  const yazici = db.bulkWriter();
  const sayilar: Record<string, number> = {};
  try {
    for (const [ad, belgeler] of Object.entries(veri.koleksiyonlar)) {
      if (ad === SISTEM_KOLEKSIYONU) continue;
      const ref = db.collection(ad);
      const mevcut = await ref.listDocuments();
      for (const d of mevcut) if (!(d.id in belgeler)) yazici.delete(d);
      for (const [id, alanlar] of Object.entries(belgeler)) yazici.set(ref.doc(id), zamanGeriCevir(alanlar) as Record<string, unknown>);
      sayilar[ad] = Object.keys(belgeler).length;
    }
    await yazici.close();
    await db
      .collection(SISTEM_KOLEKSIYONU)
      .doc("yedek")
      .set({ sonGeriYukleme: { zaman: Date.now(), dosya: grup.ad, basarili: true } }, { merge: true });
  } catch (err) {
    await db
      .collection(SISTEM_KOLEKSIYONU)
      .doc("yedek")
      .set(
        { sonGeriYukleme: { zaman: Date.now(), dosya: grup.ad, basarili: false, hata: err instanceof Error ? err.message : String(err) } },
        { merge: true }
      )
      .catch(() => {});
    throw err;
  }
  return { oncekiYedek, koleksiyonlar: sayilar };
}
