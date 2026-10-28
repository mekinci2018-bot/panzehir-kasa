import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import AuthGate from "@/components/AuthGate";
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
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="tr"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <AuthGate>
          <div className="flex flex-col md:flex-row min-h-screen">
            <Sidebar />
            <main className="flex-1 px-4 py-6 md:px-12 md:py-10 max-w-[1400px] w-full">{children}</main>
          </div>
        </AuthGate>
      </body>
    </html>
  );
}
