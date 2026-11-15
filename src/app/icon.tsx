import { ImageResponse } from "next/og";

// ============================================================
// Favicon / Standard-App-Icon (PNG, runtime-generiert)
// Wird unter /icon ausgeliefert. Browser-Tabs + PWA-Manifest.
// ============================================================

export const size = { width: 512, height: 512 };
export const contentType = "image/png";
export const runtime = "nodejs";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#2D5A3D",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Quadratisch — die Browser/OS clippen ggf. rund.
        }}
      >
        {/* Vier weiße Listen-Striche als SVG-Inhalt */}
        <svg
          width="64%"
          height="64%"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="4" y="8"    width="16" height="3" rx="1.5" fill="white" />
          <rect x="4" y="14.5" width="24" height="3" rx="1.5" fill="white" />
          <rect x="4" y="21"   width="12" height="3" rx="1.5" fill="white" />
        </svg>
      </div>
    ),
    { ...size }
  );
}

