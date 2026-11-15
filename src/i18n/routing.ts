import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["de", "fr", "it", "en", "rm", "uk", "sr", "sq", "hr", "pt", "es"],
  defaultLocale: "de",
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
