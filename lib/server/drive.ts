// Google Drive v3 over plain REST, signed in as the owner through an OAuth refresh token (a service
// account has no storage quota in a personal Drive). Scope: drive.file, so the app only sees the
// folder and files it created itself.
import { ortam } from "./admin";

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
export const KLASOR_ADI = "Panzehir Yedekler";

export interface DriveDosyasi {
  id: string;
  name: string;
  size: number;
  createdTime: string;
}

let jeton: { deger: string; bitis: number } | null = null;

async function erisimJetonu(): Promise<string> {
  if (jeton && jeton.bitis > Date.now() + 60_000) return jeton.deger;
  const [clientId, clientSecret, refreshToken] = ortam("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google oturumu açılamadı (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  jeton = { deger: data.access_token, bitis: Date.now() + data.expires_in * 1000 };
  return jeton.deger;
}

async function drive(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${await erisimJetonu()}` },
  });
  if (!res.ok) throw new Error(`Google Drive hatası (${res.status}): ${await res.text()}`);
  return res;
}

// The backup folder; created on first use (DRIVE_FOLDER_ID can pin a specific one instead).
export async function klasorId(): Promise<string> {
  if (process.env.DRIVE_FOLDER_ID) return process.env.DRIVE_FOLDER_ID;
  const q = `name = '${KLASOR_ADI}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const res = await drive(`${API}/files?${new URLSearchParams({ q, fields: "files(id)", spaces: "drive" })}`);
  const { files } = (await res.json()) as { files: { id: string }[] };
  if (files[0]) return files[0].id;
  const olustur = await drive(`${API}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: KLASOR_ADI, mimeType: "application/vnd.google-apps.folder" }),
  });
  return ((await olustur.json()) as { id: string }).id;
}

// Resumable upload in a single request: works for any size the function can hold in memory.
export async function dosyaYukle(klasor: string, ad: string, icerik: Buffer, mimeType: string): Promise<DriveDosyasi> {
  const baslat = await drive(`${UPLOAD}/files?uploadType=resumable&fields=id,name,size,createdTime`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mimeType,
      "X-Upload-Content-Length": String(icerik.length),
    },
    body: JSON.stringify({ name: ad, parents: [klasor], mimeType }),
  });
  const konum = baslat.headers.get("location");
  if (!konum) throw new Error("Google Drive yükleme adresi vermedi.");
  const res = await drive(konum, {
    method: "PUT",
    headers: { "Content-Type": mimeType, "Content-Length": String(icerik.length) },
    body: new Uint8Array(icerik),
  });
  const d = (await res.json()) as { id: string; name: string; size?: string; createdTime: string };
  return { ...d, size: Number(d.size ?? icerik.length) };
}

export async function dosyalariListele(klasor: string): Promise<DriveDosyasi[]> {
  const sonuc: DriveDosyasi[] = [];
  let sayfa: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${klasor}' in parents and trashed = false`,
      fields: "nextPageToken, files(id,name,size,createdTime)",
      orderBy: "createdTime desc",
      pageSize: "1000",
      ...(sayfa ? { pageToken: sayfa } : {}),
    });
    const res = await drive(`${API}/files?${params}`);
    const data = (await res.json()) as { nextPageToken?: string; files: (Omit<DriveDosyasi, "size"> & { size?: string })[] };
    sonuc.push(...data.files.map((f) => ({ ...f, size: Number(f.size ?? 0) })));
    sayfa = data.nextPageToken;
  } while (sayfa);
  return sonuc;
}

export async function dosyaSil(id: string): Promise<void> {
  await drive(`${API}/files/${id}`, { method: "DELETE" });
}

export async function dosyaIndir(id: string): Promise<Buffer> {
  const res = await drive(`${API}/files/${id}?alt=media`);
  return Buffer.from(await res.arrayBuffer());
}
