import { benzerFirmalar, firmaAnahtari } from "./firma";
import type { Firma } from "./types";

// Kabul edilen bütün biçimleri ("0532...", "532...", "+90 532...") tek biçime çevirir:
// "0532 123 45 67". Geçerli bir 10 haneli TR cep/telefon numarasına benzemiyorsa null döner.
export function telefonNormallestir(ham: string): string | null {
  let rakam = ham.replace(/\D/g, "");
  if (rakam.startsWith("90") && rakam.length === 12) rakam = rakam.slice(2);
  else if (rakam.startsWith("0") && rakam.length === 11) rakam = rakam.slice(1);
  if (rakam.length !== 10) return null;
  return `0${rakam.slice(0, 3)} ${rakam.slice(3, 6)} ${rakam.slice(6, 8)} ${rakam.slice(8, 10)}`;
}

export interface IceAktarilanSatir {
  ad: string;
  telefon: string; // normalize edilmemiş, kaynak metindeki hali
}

// İki sütun (Firma <TAB> Telefon), Excel/Sheets'ten kopyalanınca her satır arasına TAB koyar.
// Virgülle ya da birden çok boşlukla ayrılmış olması da kabul edilir.
export function metniAyristir(girdi: string): IceAktarilanSatir[] {
  const satirlar: IceAktarilanSatir[] = [];
  for (const satirRaw of girdi.split(/\r?\n/)) {
    const satir = satirRaw.trim();
    if (!satir) continue;
    const parcalar = satir.includes("\t")
      ? satir.split("\t")
      : satir.includes(",")
        ? satir.split(",")
        : satir.split(/\s{2,}/);
    if (parcalar.length < 2) continue;
    const ad = parcalar[0].trim();
    const telefon = parcalar.slice(1).join(" ").trim();
    if (ad && telefon) satirlar.push({ ad, telefon });
  }
  return satirlar;
}

// Tırnaklı alanları da anlayan minimal bir CSV satır ayrıştırıcı (Google Kişiler dahil).
function csvSatirAyristir(satir: string): string[] {
  const alanlar: string[] = [];
  let alan = "";
  let tirnakIcinde = false;
  for (let i = 0; i < satir.length; i++) {
    const c = satir[i];
    if (tirnakIcinde) {
      if (c === '"') {
        if (satir[i + 1] === '"') {
          alan += '"';
          i++;
        } else tirnakIcinde = false;
      } else alan += c;
    } else if (c === '"') tirnakIcinde = true;
    else if (c === ",") {
      alanlar.push(alan);
      alan = "";
    } else alan += c;
  }
  alanlar.push(alan);
  return alanlar;
}

function basliktanSutunBul(basliklar: string[], anahtarlar: string[]): number {
  return basliklar.findIndex((b) => anahtarlar.some((a) => b.toLocaleLowerCase("tr").includes(a)));
}

// Firma | Telefon biçiminde basit bir CSV'yi ya da Google Kişiler'den dışa aktarılan, onlarca
// sütunlu bir CSV'yi (Name, Phone 1 - Value, ...) kabul eder. Başlıkta uygun sütun bulunamazsa ilk
// sütunu ad, telefona benzeyen (7+ rakamlı) ilk hücreyi telefon sayar.
export function csvAyristir(icerik: string): IceAktarilanSatir[] {
  const satirlarRaw = icerik.split(/\r?\n/).filter((s) => s.trim());
  if (satirlarRaw.length === 0) return [];
  const basliklar = csvSatirAyristir(satirlarRaw[0]).map((b) => b.trim());
  const adSutun = basliktanSutunBul(basliklar, ["name", "ad", "isim", "firma"]);
  const telefonSutun = basliktanSutunBul(basliklar, ["phone", "telefon", "tel"]);

  const satirlar: IceAktarilanSatir[] = [];
  for (const satirRaw of satirlarRaw.slice(1)) {
    const hucreler = csvSatirAyristir(satirRaw);
    const ad = (adSutun >= 0 ? hucreler[adSutun] : hucreler[0])?.trim();
    if (!ad) continue;
    let telefon = telefonSutun >= 0 ? hucreler[telefonSutun]?.trim() : "";
    if (!telefon) {
      telefon = hucreler.find((h, i) => i !== adSutun && (h.replace(/\D/g, "").length >= 7))?.trim() ?? "";
    }
    if (telefon) satirlar.push({ ad, telefon });
  }
  return satirlar;
}

export interface EslesmeSonucu {
  satir: IceAktarilanSatir;
  telefonGecerli: string | null; // normalize edilmiş hali, null ise tanınamadı
  firma?: Firma; // tam eşleşme
  benzerFirma?: Firma; // tam eşleşme yok ama yakın bir ad var ("bunu mu demek istediniz")
}

// Her girilen satırı mevcut firmalarla eşleştirir: önce normalize edilmiş adla tam eşleşme, yoksa
// yakın ad önerisi.
export function eslesmeleriBul(satirlar: IceAktarilanSatir[], firmalar: Firma[]): EslesmeSonucu[] {
  return satirlar.map((satir) => {
    const anahtar = firmaAnahtari(satir.ad);
    const firma = firmalar.find((f) => f.anahtar === anahtar);
    const benzerFirma = firma ? undefined : benzerFirmalar(satir.ad, firmalar, 1)[0];
    return { satir, telefonGecerli: telefonNormallestir(satir.telefon), firma, benzerFirma };
  });
}
