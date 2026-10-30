// Firebase Admin for the backup API routes (server only). Credentials come from Vercel environment
// variables, never from the repo.
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

// Same account as KASA_EMAIL in lib/firebase.ts (kept separate so server code never loads the client SDK).
const KASA_EMAIL = "kasa@panzehir-kasa.app";

// Thrown when a required environment variable is missing; routes answer 503 with the names.
export class KurulumHatasi extends Error {
  constructor(public eksikler: string[]) {
    super(`Yedekleme kurulmamış. Eksik ortam değişkenleri: ${eksikler.join(", ")}`);
  }
}

export function ortam(...adlar: string[]): string[] {
  const eksik = adlar.filter((a) => !process.env[a]);
  if (eksik.length) throw new KurulumHatasi(eksik);
  return adlar.map((a) => process.env[a]!);
}

// FIREBASE_SERVICE_ACCOUNT holds the downloaded key file, as raw JSON or base64 of it.
function servisHesabi() {
  const [ham] = ortam("FIREBASE_SERVICE_ACCOUNT");
  try {
    return JSON.parse(ham);
  } catch {
    return JSON.parse(Buffer.from(ham, "base64").toString("utf8"));
  }
}

let _app: App | null = null;
function adminApp(): App {
  if (!_app) _app = getApps()[0] ?? initializeApp({ credential: cert(servisHesabi()) });
  return _app;
}

export function adminDb(): Firestore {
  return getFirestore(adminApp());
}

export type Yetki = "cron" | "kullanici" | null;

// The nightly cron sends CRON_SECRET (Vercel adds it as a Bearer token); the app sends the shared
// account's Firebase ID token.
export async function yetkiKontrol(req: Request): Promise<Yetki> {
  const jeton = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!jeton) return null;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && jeton === cronSecret) return "cron";
  // Outside the try: missing credentials must surface as a setup error, not as "Yetkisiz".
  const auth = getAuth(adminApp());
  try {
    const kullanici = await auth.verifyIdToken(jeton);
    return kullanici.email === KASA_EMAIL ? "kullanici" : null;
  } catch {
    return null;
  }
}

// Standard JSON error answers for the backup routes.
export function hataYaniti(err: unknown): Response {
  if (err instanceof KurulumHatasi) {
    return Response.json({ hata: err.message, eksikler: err.eksikler }, { status: 503 });
  }
  console.error(err);
  return Response.json({ hata: err instanceof Error ? err.message : "Bilinmeyen hata" }, { status: 500 });
}
