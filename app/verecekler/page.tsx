"use client";

import { ArrowUpFromLine } from "lucide-react";
import OutstandingList from "@/components/OutstandingList";

export default function VereceklerPage() {
  return (
    <OutstandingList
      yon="giden"
      title="Borçlar"
      subtitle="Tedarikçilere ve diğer kişilere ödenmesi gereken tutarlar."
      amountLabel="Borç Tutarı"
      actionLabel="Ödeme Yap"
      icon={ArrowUpFromLine}
      emptyTitle="Henüz borç yok"
      emptyDescription="Kasa'da 'Çıkış' işlemi girip tamamını peşin ödemediğinde kalan tutar burada listelenir."
    />
  );
}
