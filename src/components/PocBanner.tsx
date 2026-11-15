"use client";

import { useTranslations } from "next-intl";

/**
 * Persistenter Hinweis-Banner: Diese App ist eine interne Vorschauversion
 * (Proof of Concept) und darf nur mit Test-/Dummydaten verwendet werden.
 *
 * Client-Component (useTranslations), damit er auch in den client-seitigen
 * Screens (apply, result, generating) innerhalb der AppShell funktioniert.
 */
export function PocBanner() {
  const t = useTranslations("common");

  return (
    <div
      role="alert"
      className="w-full bg-s-warn-bg border-b border-s-warn-border px-4 py-2 text-center flex-shrink-0"
    >
      <p className="text-[12px] md:text-[13px] text-s-warn-text leading-snug">
        <span aria-hidden="true">⚠️ </span>
        {t("pocBanner")}
      </p>
    </div>
  );
}
