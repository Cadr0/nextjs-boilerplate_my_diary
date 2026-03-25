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
