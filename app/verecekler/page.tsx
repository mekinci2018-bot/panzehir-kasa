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
      newLabel="Yeni Borç"
      icon={ArrowUpFromLine}
      emptyTitle="Henüz borç yok"
      emptyDescription="'Yeni Borç' ile ekleyebilir ya da Kasa'da peşin ödenmeyen bir 'Çıkış' girebilirsin."
    />
  );
}
