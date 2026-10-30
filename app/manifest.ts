import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Panzehir Kasa Defteri",
    short_name: "Panzehir Kasa",
    description: "Panzehir Reklam kasa ve cari takip sistemi",
    lang: "tr",
    start_url: "/kasa",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#14132a",
    theme_color: "#14132a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
