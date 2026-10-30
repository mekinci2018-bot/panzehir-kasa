"use client";

import { useState } from "react";
import { Download, Share } from "lucide-react";
import { promptInstall, useInstallDurumu } from "@/lib/install";

export default function InstallButton() {
  const durum = useInstallDurumu();
  const [yardim, setYardim] = useState(false);

  if (durum === "yuklu") return null;

  return (
    <div className="px-3">
      <button
        onClick={() => (durum === "hazir" ? promptInstall() : setYardim((v) => !v))}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-white bg-white/[0.06] hover:bg-white/[0.1] transition-colors"
      >
        <Download className="w-[16px] h-[16px] shrink-0" strokeWidth={1.75} />
        Uygulamayı İndir
      </button>
      {yardim && (
        <p className="mt-2 px-3 text-[12px] leading-relaxed text-[var(--sidebar-text)]">
          {durum === "ios" && (
            <>
              Safari&apos;de alttaki <Share className="inline w-3.5 h-3.5 -mt-0.5" /> Paylaş simgesine dokunun,
              ardından <span className="text-white">Ana Ekrana Ekle</span>&apos;yi seçin.
            </>
          )}
          {durum === "android" && (
            <>
              Chrome menüsünden (⋮) <span className="text-white">Uygulamayı yükle</span> ya da{" "}
              <span className="text-white">Ana ekrana ekle</span>&apos;yi seçin.
            </>
          )}
          {durum === "masaustu" && (
            <>
              Adres çubuğunun sağındaki yükle simgesine ya da tarayıcı menüsünden (⋮ / …){" "}
              <span className="text-white">Uygulamayı yükle</span> seçeneğine tıklayın. Zaten yüklüyse
              orada <span className="text-white">Uygulamada aç</span> görünür.
            </>
          )}
        </p>
      )}
    </div>
  );
}
