import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Lora, Manrope } from "next/font/google";

import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const metadataBaseUrl = (() => {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!appUrl) {
    return undefined;
  }

  try {
    return new URL(appUrl);
  } catch {
    return undefined;
  }
})();

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700"],
  preload: false,
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: metadataBaseUrl,
  applicationName: "Diary AI",
  title: {
    default: "Diary AI",
    template: "%s | Diary AI",
  },
  icons: {
    icon: [
      { url: "/icons/brand-mark.svg", sizes: "any", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
      { url: "/icon.png", sizes: "64x64", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"],
  },
  openGraph: {
    title: "Diary AI",
    description: "Личный дневник с метриками, голосовым вводом и AI-разбором.",
    images: ["/icons/icon-512.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Diary AI",
    description: "Личный дневник с метриками, голосовым вводом и AI-разбором.",
    images: ["/icons/icon-512.png"],
  },
  manifest: "/manifest.webmanifest",
  description: "Личный дневник с метриками, голосовым вводом и AI-разбором.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Diary AI",
  },
};

export const viewport: Viewport = {
  themeColor: "#2f6f61",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      suppressHydrationWarning
      className={`${manrope.variable} ${lora.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
