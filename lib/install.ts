"use client";

import { useSyncExternalStore } from "react";

// Not in the TS DOM lib yet (Chromium-only API).
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __kasaInstall?: BeforeInstallPromptEvent | null;
  }
}

// Chrome fires beforeinstallprompt once, often before this bundle has loaded. An inline script in
// app/layout.tsx catches it early into window.__kasaInstall; this module picks it up from there and
// keeps listening for later firings.
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  // Production only: in dev the worker would cache hot-reload chunks and serve stale code.
  if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }

  deferred = window.__kasaInstall ?? null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    window.__kasaInstall = null;
    notify();
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

// hazir: one-click prompt available. ios / android / masaustu: no prompt (already installed in this
// browser, browser decided not to offer it, or no API), so the button shows manual instructions.
export type InstallDurumu = "yuklu" | "hazir" | "ios" | "android" | "masaustu";

function snapshot(): InstallDurumu {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "yuklu";
  if (deferred) return "hazir";
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return "masaustu";
}

export function useInstallDurumu(): InstallDurumu {
  // Server snapshot "yuklu" renders nothing until the client knows the real state.
  return useSyncExternalStore(subscribe, snapshot, () => "yuklu");
}

export async function promptInstall(): Promise<void> {
  if (!deferred) return;
  const e = deferred;
  await e.prompt();
  await e.userChoice;
  deferred = null;
  window.__kasaInstall = null;
  notify();
}
