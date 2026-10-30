import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import {
  initializeAuth,
  browserSessionPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let _app: FirebaseApp | null = null;
function getFirebaseApp(): FirebaseApp {
  if (!_app) _app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return _app;
}

let _db: Firestore | null = null;
export function getDb(): Firestore {
  if (!_db) _db = getFirestore(getFirebaseApp());
  return _db;
}

let _auth: Auth | null = null;
function getAuthInstance(): Auth {
  // Session persistence: the login lives only as long as this window/tab, so every launch of the
  // installed app (or a new tab) asks for the PIN again instead of reusing a remembered login.
  if (!_auth) _auth = initializeAuth(getFirebaseApp(), { persistence: browserSessionPersistence });
  return _auth;
}

// The whole office shares one Firebase email/password account; the 6-digit PIN is its password.
// The PIN itself lives only in Firebase Auth, never in this repo. firestore.rules allows only this email.
export const KASA_EMAIL = "kasa@panzehir-kasa.app";

function isKasaUser(user: User | null): user is User {
  return !!user && !user.isAnonymous && user.email === KASA_EMAIL;
}

let readyPromise: Promise<User> | null = null;

// Resolves once the shared account is signed in. Data hooks only mount behind AuthGate, so this
// normally resolves immediately.
export function ensureSignedIn(): Promise<User> {
  if (typeof window === "undefined") {
    // Firebase client SDK only runs in the browser; effects that call this never fire on the server.
    return new Promise(() => {});
  }
  if (readyPromise) return readyPromise;
  readyPromise = new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      getAuthInstance(),
      (user) => {
        if (isKasaUser(user)) {
          unsubscribe();
          resolve(user);
        }
      },
      reject
    );
  });
  return readyPromise;
}

export type AuthDurum = "yukleniyor" | "giris-yok" | "giris-var";

export function watchAuth(cb: (durum: AuthDurum) => void): () => void {
  const authInstance = getAuthInstance();
  return onAuthStateChanged(authInstance, (user) => {
    // Sessions left over from the old anonymous sign-in must not count as logged in.
    if (user && !isKasaUser(user)) {
      signOut(authInstance);
      return;
    }
    cb(user ? "giris-var" : "giris-yok");
  });
}

export async function loginWithPin(pin: string): Promise<void> {
  await signInWithEmailAndPassword(getAuthInstance(), KASA_EMAIL, pin);
}

export async function logout(): Promise<void> {
  await signOut(getAuthInstance());
}
