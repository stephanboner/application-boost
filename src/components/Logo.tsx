import React from "react";

interface LogoProps {
  size?: number;
  textClass?: string;
}

export function Logo({ size = 32, textClass }: LogoProps) {
  return (
    <div className="flex items-center gap-2.5">
      {/* Icon square */}
      <div
        className="flex items-center justify-center rounded-[8px] bg-acc flex-shrink-0"
        style={{ width: size, height: size }}
      >
        {/* List-lines SVG */}
        <svg
          width={size * 0.55}
          height={size * 0.55}
          viewBox="0 0 18 18"
          fill="none"
        >
          <rect x="1" y="3"  width="10" height="2" rx="1" fill="white" />
          <rect x="1" y="8"  width="14" height="2" rx="1" fill="white" />
          <rect x="1" y="13" width="8"  height="2" rx="1" fill="white" />
        </svg>
      </div>
      {/* Wordmark */}
      <span
        className={
          textClass ??
          "font-serif font-semibold text-[16px] tracking-[-0.3px] text-text leading-none"
        }
      >
        BewerbungsBoost
      </span>
    </div>
  );
}
