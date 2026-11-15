"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/navigation";

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common");
  const tNav = useTranslations("nav");
  const tErrors = useTranslations("errors");

  useEffect(() => {
    console.error("[BewerbungsBoost] Page error:", error);
  }, [error]);

  return (
    <div className="min-h-screen min-h-dvh bg-bg flex items-center justify-center px-4">
      <div className="card max-w-md w-full text-center p-8">
        <div
          className="font-serif font-light text-[60px] leading-none mb-4"
          style={{ color: "#C4DAC8" }}
        >
          ✦
        </div>
        <h2 className="font-serif font-semibold text-[22px] text-text mb-2">
          {t("error")}
        </h2>
        <p className="text-[14px] text-sub mb-6 leading-relaxed">
          {tErrors("unexpected")}
        </p>
        <div className="space-y-2">
          <button className="btn-primary w-full" onClick={reset}>
            {t("tryAgain")}
          </button>
          <Link href="/" className="btn-secondary w-full block text-center">
            {tNav("home")}
          </Link>
        </div>
      </div>
    </div>
  );
}

