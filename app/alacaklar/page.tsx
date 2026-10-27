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
      icon={ArrowDownToLine}
      emptyTitle="Henüz alacak yok"
      emptyDescription="Kasa'da 'Giriş' işlemi girip tamamını peşin almadığında kalan tutar burada listelenir."
    />
  );
}
