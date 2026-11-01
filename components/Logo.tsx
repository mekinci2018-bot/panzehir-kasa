import Image from "next/image";
import Link from "next/link";

// logo-light.png is logo.png with the navy wordmark turned white, for the dark sidebar.
// Links back to Kasa, the app's home screen; `clickable={false}` on the PIN screen, where there's
// nothing to navigate to yet.
export default function Logo({
  compact = false,
  clickable = true,
  onClick,
}: {
  compact?: boolean;
  clickable?: boolean;
  onClick?: () => void;
}) {
  const img = (
    <Image
      src="/logo-light.png"
      alt="Panzehir Reklam"
      width={581}
      height={130}
      className={compact ? "w-[108px] h-auto" : "w-[164px] h-auto"}
      priority
    />
  );
  if (!clickable) return img;
  return (
    <Link href="/kasa" onClick={onClick} className="cursor-pointer" aria-label="Kasa'ya git">
      {img}
    </Link>
  );
}
