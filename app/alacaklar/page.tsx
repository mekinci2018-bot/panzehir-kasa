import OutstandingList from "@/components/OutstandingList";

export default function AlacaklarPage() {
  return (
    <OutstandingList
      yon="gelen"
      title="Alacaklar"
      subtitle="Henüz tahsil edilmemiş alacaklar."
      amountLabel="Alacak Tutarı"
      actionLabel="Ödeme Al"
    />
  );
}
