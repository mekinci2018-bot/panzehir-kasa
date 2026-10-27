import Image from "next/image";

export default function Logo({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="bg-white rounded-lg px-2 py-1 inline-flex">
        <Image src="/logo.png" alt="Panzehir Reklam" width={44} height={25} className="object-contain" />
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl px-4 py-3.5 w-full flex items-center justify-center">
      <Image
        src="/logo.png"
        alt="Panzehir Reklam"
        width={739}
        height={415}
        className="w-full h-auto object-contain"
        priority
      />
    </div>
  );
}
