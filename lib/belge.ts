// Çek / senet gibi vade tarihli borç kayıtlarının türü, açıklamadan okunur ("Senet · No 123456 ·
// Ziraat Bankası"). Ayrı bir alan açılmadı: belge no ve banka da aynı açıklama metninde duruyor,
// tür yalnızca listelerde "7 senet · 2 çek" gibi bir özet yazmak için gerekiyor.
export type BelgeTuru = "cek" | "senet";

// Kelime sınırına bakılır, yoksa "çekildi", "çekme" gibi sözcükler de çek sayılırdı.
const KALIP: Record<BelgeTuru, RegExp> = {
  senet: /(^|[^a-zçğıöşü])senet(ler)?([^a-zçğıöşü]|$)/,
  cek: /(^|[^a-zçğıöşü])(çek|cek)(ler)?([^a-zçğıöşü]|$)/,
};

export function belgeTuru(aciklama?: string): BelgeTuru | null {
  if (!aciklama) return null;
  const s = aciklama.toLocaleLowerCase("tr-TR");
  if (KALIP.senet.test(s)) return "senet";
  if (KALIP.cek.test(s)) return "cek";
  return null;
}

// "7 senet · 2 çek · 3 kalem": bir firmanın açık kalemlerinin tür dökümü.
export function belgeOzeti(aciklamalar: (string | undefined)[]): string {
  let cek = 0;
  let senet = 0;
  let diger = 0;
  for (const a of aciklamalar) {
    const t = belgeTuru(a);
    if (t === "senet") senet += 1;
    else if (t === "cek") cek += 1;
    else diger += 1;
  }
  const parcalar: string[] = [];
  if (senet) parcalar.push(`${senet} senet`);
  if (cek) parcalar.push(`${cek} çek`);
  if (diger) parcalar.push(`${diger} kalem`);
  return parcalar.join(" · ");
}
