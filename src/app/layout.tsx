import "@fontsource-variable/plus-jakarta-sans/wght.css";
import "@fontsource-variable/fraunces/wght.css";
import "@fontsource-variable/fraunces/wght-italic.css";
import "@fontsource-variable/lora/wght.css";
import "@fontsource-variable/lora/wght-italic.css";
import { getLocale } from "next-intl/server";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import "@/app/globals.css";

// ── PWA-Metadata (für Homescreen-Add auf iOS/Android) ─────────
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  applicationName: "BewerbungsBoost",
  title: { default: "BewerbungsBoost", template: "%s · BewerbungsBoost" },
  description:
    "Ihr Bewerbungsschreiben in Minuten — KI-gestützt und mehrsprachig. Interne Vorschauversion (PoC).",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "BewerbungsBoost",
    statusBarStyle: "default",
  },
  // Next.js 16 emits mobile-web-app-capable; keep the legacy iOS tag too.
  other: { "apple-mobile-web-app-capable": "yes" },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#2D5A3D",
  // viewport-fit=cover füllt den Bildschirm aus, sodass safe-area-Insets
  // (Notch, Home-Indicator) per env() korrekt adressiert werden können.
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  // userScalable bleibt true (Accessibility) — KEIN maximum-scale setzen.
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      className="h-full"
    >
      <body className="min-h-full antialiased font-sans bg-bg text-text">
        {children}
        <Analytics />
      </body>
    </html>
  );
}

