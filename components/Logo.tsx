import Image from "next/image";

// logo-light.png is logo.png with the navy wordmark turned white, for the dark sidebar.
export default function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Image
      src="/logo-light.png"
      alt="Panzehir Reklam"
      width={581}
      height={130}
      className={compact ? "w-[108px] h-auto" : "w-[164px] h-auto"}
      priority
    />
  );
}
