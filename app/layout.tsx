import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import AuthGate from "@/components/AuthGate";
import HakEdisOtomatik from "@/components/HakEdisOtomatik";
import Bildirimler from "@/components/Bildirim";

// Chrome may fire beforeinstallprompt before the client bundle loads; catch it here so the
// "Uygulamayı İndir" button (lib/install.ts) can still use it.
const INSTALL_CAPTURE_SCRIPT = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__kasaInstall=e;});`;
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Panzehir Reklam - Kasa Defteri",
  description: "Panzehir Reklam kasa ve cari takip sistemi",
  applicationName: "Panzehir Kasa",
  // iOS home-screen install: open full screen with the app name under the icon.
  appleWebApp: {
    capable: true,
    title: "Panzehir Kasa",
    statusBarStyle: "black",
  },
};

export const viewport: Viewport = {
  themeColor: "#14132a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="tr"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: INSTALL_CAPTURE_SCRIPT }} />
      </head>
      <body className="h-full overflow-hidden print:h-auto print:overflow-visible">
        <AuthGate>
          {/* Eksik maaş hak edişlerini uygulama açılışında tamamlar; hiçbir şey çizmez. */}
          <HakEdisOtomatik />
          {/* Dağıtım gibi kendiliğinden olan işlerin sonucunu söyleyen kısa şerit. */}
          <Bildirimler />
          <div className="flex flex-col md:flex-row h-screen print:h-auto">
            <Sidebar />
            <main className="flex-1 min-h-0 overflow-y-auto px-4 py-6 md:px-12 md:py-10 max-w-[1400px] w-full print:p-0 print:max-w-none print:h-auto print:overflow-visible">
              {children}
            </main>
          </div>
        </AuthGate>
      </body>
    </html>
  );
}
