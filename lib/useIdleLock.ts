"use client";

import { useEffect } from "react";
import { logout } from "./firebase";

export const IDLE_LOCK_MS = 5 * 60 * 1000;

// Last activity is shared through localStorage so activity in one tab keeps the others unlocked.
const STORAGE_KEY = "kasa:sonIslem";
const WRITE_THROTTLE_MS = 5000;
const CHECK_INTERVAL_MS = 30 * 1000;
const EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "wheel", "scroll"] as const;

function readLast(): number {
  try {
    return Number(localStorage.getItem(STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function markActivity() {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {}
}

export function useIdleLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    // Without a stored value (storage blocked, first run) fall back to this tab's own timer.
    let localLast = Date.now();
    let lastWrite = 0;

    function check() {
      const last = Math.max(readLast(), localLast);
      if (Date.now() - last >= IDLE_LOCK_MS) logout();
    }

    function onActivity() {
      const now = Date.now();
      localLast = now;
      if (now - lastWrite > WRITE_THROTTLE_MS) {
        lastWrite = now;
        markActivity();
      }
    }

    function onVisible() {
      if (document.visibilityState === "visible") check();
    }

    // A session restored after a long break (sleep, closed browser) locks right away.
    const stored = readLast();
    if (stored && Date.now() - stored >= IDLE_LOCK_MS) {
      logout();
      return;
    }

    markActivity();
    for (const e of EVENTS) window.addEventListener(e, onActivity, { passive: true });
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(check, CHECK_INTERVAL_MS);

    return () => {
      for (const e of EVENTS) window.removeEventListener(e, onActivity);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [enabled]);
}
