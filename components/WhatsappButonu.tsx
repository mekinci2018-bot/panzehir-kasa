"use client";

import { useState } from "react";
import { waTelefon } from "@/lib/whatsapp";
import WhatsappIcon from "./WhatsappIcon";

// Telefon yoksa gri/soluk bir simge: tıklayınca firmaya telefon eklemek için çağrılan onTelefonEksik
// açılır. Telefon varsa simge WhatsApp yeşili (#25D366); tıklayınca hazır mesaj (gönderilmeden önce
// düzenlenebilir) ve "Gönder" ile wa.me açılır.
export default function WhatsappButonu({
  telefon,
  mesaj,
  onTelefonEksik,
}: {
  telefon?: string;
  mesaj: string;
  onTelefonEksik: () => void;
}) {
  const [duzen, setDuzen] = useState<string | null>(null);
  const numara = waTelefon(telefon);

  if (!numara) {
    return (
      <button
        type="button"
        className="icon-btn opacity-50"
        title="Telefon yok, eklemek için tıklayın"
        onClick={(e) => {
          e.stopPropagation();
          onTelefonEksik();
        }}
      >
        <WhatsappIcon className="w-4 h-4" />
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        className="icon-btn !text-[#25D366] hover:!bg-[#e9f9ef]"
        title="WhatsApp ile yaz"
        onClick={(e) => {
          e.stopPropagation();
          setDuzen(mesaj);
        }}
      >
        <WhatsappIcon className="w-4 h-4" />
      </button>
      {duzen !== null && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
          onMouseDown={(e) => e.target === e.currentTarget && setDuzen(null)}
        >
          <div className="card w-full max-w-md p-5 flex flex-col gap-3">
            <h3 className="font-semibold text-base">WhatsApp mesajı</h3>
            <textarea
              className="input-field min-h-[120px] resize-none"
              autoFocus
              value={duzen}
              onChange={(e) => setDuzen(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setDuzen(null)}>
                Vazgeç
              </button>
              <a
                className="btn-primary !bg-[#25D366] hover:!brightness-95 inline-flex items-center gap-1.5"
                href={`https://wa.me/${numara}?text=${encodeURIComponent(duzen)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setDuzen(null)}
              >
                <WhatsappIcon className="w-3.5 h-3.5" /> Gönder
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
