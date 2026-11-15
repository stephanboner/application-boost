import type { MetadataRoute } from "next";

// ============================================================
// PWA-Manifest — macht die App auf iOS/Android zum Homescreen-AddOn.
// Wird unter /manifest.webmanifest ausgeliefert.
// ============================================================

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BewerbungsBoost",
    short_name: "BewerbungsBoost",
    description:
      "Ihr Bewerbungsschreiben in Minuten — KI-gestützt und mehrsprachig. Interne Vorschauversion (PoC).",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FAFAF7",
    theme_color: "#2D5A3D",
    lang: "de-CH",
    categories: ["productivity", "business"],
    // Icons werden dynamisch von src/app/icon.tsx + src/app/apple-icon.tsx
    // generiert (ImageResponse) und sind unter /icon und /apple-icon abrufbar.
    icons: [
      {
        src: "/icon?v=1",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon?v=1",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}

