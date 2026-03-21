import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Diary AI",
    short_name: "Diary AI",
    description: "Личный дневник с метриками, голосовым вводом и AI-разбором.",
    start_url: "/diary",
    scope: "/",
    display: "standalone",
    background_color: "#f7f5ef",
    theme_color: "#2f6f61",
    lang: "ru",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
