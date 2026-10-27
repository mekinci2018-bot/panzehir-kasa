import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged, type Auth, type User } from "firebase/auth";

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
  if (!_auth) _auth = getAuth(getFirebaseApp());
  return _auth;
}

let readyPromise: Promise<User> | null = null;

export function ensureSignedIn(): Promise<User> {
  if (typeof window === "undefined") {
    // Firebase client SDK only runs in the browser; effects that call this never fire on the server.
    return new Promise(() => {});
  }
  if (readyPromise) return readyPromise;
  readyPromise = new Promise((resolve, reject) => {
    const authInstance = getAuthInstance();
    const unsubscribe = onAuthStateChanged(
      authInstance,
      (user) => {
        if (user) {
          unsubscribe();
          resolve(user);
        } else {
          signInAnonymously(authInstance).catch(reject);
        }
      },
      reject
    );
  });
  return readyPromise;
}
