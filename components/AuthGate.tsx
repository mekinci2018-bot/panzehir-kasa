"use client";

import { useEffect, useRef, useState } from "react";
import { FirebaseError } from "firebase/app";
import { Lock } from "lucide-react";
import { loginWithPin, watchAuth, type AuthDurum } from "@/lib/firebase";
import Logo from "./Logo";

const PIN_LENGTH = 6;

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [durum, setDurum] = useState<AuthDurum>("yukleniyor");

  useEffect(() => watchAuth(setDurum), []);

  if (durum === "yukleniyor") return <div className="min-h-screen bg-[var(--sidebar-bg)]" />;
  if (durum === "giris-yok") return <PinEkrani />;
  return <>{children}</>;
}

function hataMesaji(err: unknown): string {
  if (err instanceof FirebaseError) {
    if (err.code === "auth/too-many-requests") return "Çok fazla hatalı deneme. Biraz bekleyip tekrar deneyin.";
    if (err.code === "auth/network-request-failed") return "İnternet bağlantısı yok.";
  }
  return "Şifre hatalı.";
}

function PinEkrani() {
  const [digits, setDigits] = useState<string[]>(Array(PIN_LENGTH).fill(""));
  const [hata, setHata] = useState("");
  const [busy, setBusy] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => refs.current[0]?.focus(), []);

  async function submit(pin: string) {
    setBusy(true);
    setHata("");
    try {
      await loginWithPin(pin);
    } catch (err) {
      setHata(hataMesaji(err));
      setDigits(Array(PIN_LENGTH).fill(""));
      setBusy(false);
      requestAnimationFrame(() => refs.current[0]?.focus());
    }
  }

  // Fills from position i onward, so both typing and pasting a full PIN work.
  function fill(i: number, raw: string) {
    const gelen = raw.replace(/\D/g, "");
    const next = [...digits];
    if (!gelen) {
      next[i] = "";
      setDigits(next);
      return;
    }
    let pos = i;
    for (const ch of gelen) {
      if (pos >= PIN_LENGTH) break;
      next[pos++] = ch;
    }
    setDigits(next);
    setHata("");
    if (next.every((d) => d)) submit(next.join(""));
    else refs.current[Math.min(pos, PIN_LENGTH - 1)]?.focus();
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      e.preventDefault();
      const next = [...digits];
      next[i - 1] = "";
      setDigits(next);
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === "ArrowRight" && i < PIN_LENGTH - 1) refs.current[i + 1]?.focus();
  }

  return (
    <div className="min-h-screen bg-[var(--sidebar-bg)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm flex flex-col items-center text-center">
        <Logo />
        <div className="mt-10 w-11 h-11 rounded-full bg-white/[0.06] flex items-center justify-center">
          <Lock className="w-5 h-5 text-white/80" strokeWidth={1.75} />
        </div>
        <h1 className="mt-4 text-white text-lg font-medium">Kasa Defteri</h1>
        <p className="mt-1 text-sm text-[var(--sidebar-text)]">Devam etmek için 6 haneli şifreyi girin.</p>

        <div className={`mt-8 flex gap-2.5 ${hata ? "pin-shake" : ""}`} key={hata}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="password"
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              aria-label={`Şifre hanesi ${i + 1}`}
              disabled={busy}
              value={d}
              onChange={(e) => fill(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              onFocus={(e) => e.target.select()}
              className="w-11 h-13 rounded-xl bg-white/[0.06] border border-white/10 text-center text-xl text-white tabular outline-none transition-colors focus:border-white/40 focus:bg-white/[0.09] disabled:opacity-50"
            />
          ))}
        </div>

        <div className="mt-5 h-5 text-sm text-[#ff8a8e]">{busy ? <span className="text-[var(--sidebar-text)]">Kontrol ediliyor…</span> : hata}</div>
      </div>
    </div>
  );
}
