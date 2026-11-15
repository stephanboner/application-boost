import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Design Tokens – Forest Green Palette
        acc:              "#2D5A3D",
        "acc-light":      "#EAF2EC",
        "acc-mid":        "#C4DAC8",
        bg:               "#FAFAF7",
        side:             "#F3EDE4",
        paper:            "#FFFDF8",
        border:           "#E2D9CE",
        "border-light":   "#EDE7DF",
        text:             "#1A1B18",
        sub:              "#7A7468",
        sub2:             "#A8A09A",
        // Status
        "s-ok-bg":        "#EBF6EB",
        "s-ok-text":      "#2D6A2D",
        "s-ok-border":    "#BFE0BF",
        "s-info-bg":      "#EEF3FB",
        "s-info-text":    "#3455A0",
        "s-info-border":  "#C0CEEC",
        "s-warn-bg":      "#FEF8EC",
        "s-warn-text":    "#96610A",
        "s-warn-border":  "#F0DBA0",
        "s-err-text":     "#C0392B",
        "s-err-border":   "#F0C0BA",
      },
      fontFamily: {
        sans:   ["var(--font-jakarta)", "system-ui", "sans-serif"],
        serif:  ["var(--font-fraunces)", "Georgia", "serif"],
        letter: ["var(--font-lora)", "Georgia", "serif"],
      },
      borderRadius: {
        chip: "20px",
        card: "12px",
        btn:  "9px",
      },
      boxShadow: {
        card:        "0 2px 12px rgba(0,0,0,0.07)",
        "card-hover":"0 4px 16px rgba(0,0,0,0.10)",
        btn:         "0 2px 8px rgba(45,90,61,0.20)",
        logo:        "0 8px 32px rgba(45,90,61,0.25)",
        paper:       "0 2px 20px rgba(0,0,0,0.10)",
        nav:         "0 1px 3px rgba(0,0,0,0.06)",
      },
      animation: {
        "fade-up":    "fadeUp 300ms ease both",
        "pulse-logo": "pulseLogo 1500ms ease-in-out infinite",
        "blink":      "blink 1s step-end infinite",
        "pulse-slow": "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
      },
      keyframes: {
        fadeUp: {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseLogo: {
          "0%,100%": { transform: "scale(1)" },
          "50%":     { transform: "scale(1.06)" },
        },
        blink: {
          "0%,100%": { opacity: "1" },
          "50%":     { opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
