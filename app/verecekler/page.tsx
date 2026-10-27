import OutstandingList from "@/components/OutstandingList";

export default function VereceklerPage() {
  return (
    <OutstandingList
      yon="giden"
      title="Verecekler"
      subtitle="Henüz ödenmemiş borçlar."
      amountLabel="Verecek Tutarı"
      actionLabel="Ödeme Yap"
    />
  );
}
