import { ImageResponse } from "next/og";

// ============================================================
// Apple-Touch-Icon (PNG, 180×180, runtime-generiert)
// Wird unter /apple-icon ausgeliefert.
//
// iOS verlangt PNG mit deckendem Hintergrund (kein Alpha) — sonst
// rendert iOS einen schwarzen Hintergrund unter dem Icon auf dem
// Homescreen. Daher setzen wir hier explizit #2D5A3D als Background.
// ============================================================

export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const runtime = "nodejs";

export default function AppleIcon() {
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
        }}
      >
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

