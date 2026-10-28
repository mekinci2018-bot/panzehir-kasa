"use client";

import { ArrowDownToLine } from "lucide-react";
import OutstandingList from "@/components/OutstandingList";

export default function AlacaklarPage() {
  return (
    <OutstandingList
      yon="gelen"
      title="Alacaklar"
      subtitle="Müşterilerden tahsil edilmeyi bekleyen tutarlar."
      amountLabel="Alacak Tutarı"
      actionLabel="Ödeme Al"
      newLabel="Yeni Alacak"
      icon={ArrowDownToLine}
      emptyTitle="Henüz alacak yok"
      emptyDescription="'Yeni Alacak' ile ekleyebilir ya da Kasa'da peşin alınmayan bir 'Giriş' girebilirsin."
    />
  );
}
