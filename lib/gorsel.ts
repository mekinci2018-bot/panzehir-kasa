// Browser-side image shrinking before upload: Firestore documents are capped at 1 MB and images are
// stored as base64 data URLs (no Firebase Storage), so every image is resized and re-encoded first.

const TAM_KENAR = 1600;
const TAM_HEDEF = 150 * 1024; // bytes; quality steps down until the image fits
const TAM_SINIR = 700 * 1024; // hard cap: base64 adds a third, which still keeps the document under 1 MB
const ONIZLEME_KENAR = 200;

export interface HazirGorsel {
  veri: string;
  onizleme: string;
  genislik: number;
  yukseklik: number;
}

function olcekle(kaynak: ImageBitmap, enUzun: number): HTMLCanvasElement {
  const oran = Math.min(1, enUzun / Math.max(kaynak.width, kaynak.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(kaynak.width * oran));
  canvas.height = Math.max(1, Math.round(kaynak.height * oran));
  const ctx = canvas.getContext("2d")!;
  // Transparent PNGs would turn black in JPEG fallback; paint white underneath.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(kaynak, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function blobAl(canvas: HTMLCanvasElement, tur: string, kalite: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Görsel kodlanamadı"))), tur, kalite)
  );
}

// WebP where the browser can encode it (older Safari can't and silently returns PNG): JPEG then.
async function kodla(canvas: HTMLCanvasElement, hedef: number): Promise<Blob> {
  let tur = "image/webp";
  let blob = await blobAl(canvas, tur, 0.82);
  if (blob.type !== tur) {
    tur = "image/jpeg";
    blob = await blobAl(canvas, tur, 0.82);
  }
  for (const kalite of [0.72, 0.62, 0.52, 0.42]) {
    if (blob.size <= hedef) break;
    blob = await blobAl(canvas, tur, kalite);
  }
  return blob;
}

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function gorselHazirla(dosya: Blob): Promise<HazirGorsel> {
  if (!dosya.type.startsWith("image/")) throw new Error("Bu dosya bir görsel değil.");
  const bitmap = await createImageBitmap(dosya);
  try {
    let tam = olcekle(bitmap, TAM_KENAR);
    let blob = await kodla(tam, TAM_HEDEF);
    // A very detailed image can stay large even at low quality; shrink it further.
    while (blob.size > TAM_SINIR && tam.width > 600) {
      tam = olcekle(bitmap, Math.round(Math.max(tam.width, tam.height) * 0.75));
      blob = await kodla(tam, TAM_HEDEF);
    }
    if (blob.size > TAM_SINIR) throw new Error("Görsel küçültülemedi.");
    const onizleme = await kodla(olcekle(bitmap, ONIZLEME_KENAR), 20 * 1024);
    return { veri: await dataUrl(blob), onizleme: await dataUrl(onizleme), genislik: tam.width, yukseklik: tam.height };
  } finally {
    bitmap.close();
  }
}

// Images from a paste or drop event; pasted screenshots arrive as items, files as files.
export function gorselDosyalari(veri: DataTransfer | null): File[] {
  if (!veri) return [];
  const dosyalar = [...veri.files].filter((f) => f.type.startsWith("image/"));
  if (dosyalar.length) return dosyalar;
  return [...veri.items]
    .filter((i) => i.kind === "file" && i.type.startsWith("image/"))
    .map((i) => i.getAsFile())
    .filter((f): f is File => !!f);
}
