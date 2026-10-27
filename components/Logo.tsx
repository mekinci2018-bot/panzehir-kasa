import Image from "next/image";

export default function Logo({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <Image src="/logo.png" alt="Panzehir Reklam" width={40} height={22} className="object-contain" />
    );
  }
  return (
    <Image
      src="/logo.png"
      alt="Panzehir Reklam"
      width={185}
      height={104}
      className="object-contain -ml-2"
      priority
    />
  );
}
