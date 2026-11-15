import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { SignOutForm } from "@/components/SignOutForm";
import { DeletePocData } from "@/components/DeletePocData";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "profile" });
  const tNav = await getTranslations({ locale, namespace: "nav" });
  const tCommon = await getTranslations({ locale, namespace: "common" });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth`);

  const { data: cvProfile } = await supabase
    .from("cv_profiles")
    .select("has_cv, language, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const initials = (user.email ?? "?")[0].toUpperCase();
  const emailName = user.email?.split("@")[0] ?? "";

  return (
    <AppShell>
      <div className="p-4 md:p-8">
        <div className="max-w-[720px] mx-auto space-y-4">
          <h1 className="font-serif font-semibold text-[22px] md:text-[24px] text-text mb-5 md:mb-6">{t("title")}</h1>

          {/* ── Avatar card ── */}
          <div className="card flex items-center gap-3 md:gap-4 py-4 md:py-5">
            <div className="w-12 h-12 md:w-[60px] md:h-[60px] rounded-full bg-acc flex items-center justify-center text-white text-[18px] md:text-[22px] font-semibold flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-serif font-semibold text-[17px] md:text-[20px] text-text leading-tight truncate">{emailName}</p>
              <p className="text-[12px] md:text-[13px] text-sub mt-0.5 truncate">{user.email}</p>
            </div>
            <Link href={`/${locale}/cv`} className="btn-secondary-sm flex-shrink-0">
              {t("editCv")}
            </Link>
          </div>

          {/* ── 2-column grid ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* CV-Status */}
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <span>💼</span>
                <p className="section-label">{t("cvStatus")}</p>
              </div>
              <p className="text-[14px] font-semibold text-text">
                {cvProfile?.has_cv ? t("cvPresent") : t("cvMissing")}
              </p>
              {cvProfile?.updated_at && (
                <p className="text-[12px] text-sub mt-0.5">
                  {t("updatedAt", { date: new Date(cvProfile.updated_at).toLocaleDateString(locale) })}
                </p>
              )}
            </div>

            {/* PoC-Hinweis */}
            <div className="card bg-s-warn-bg border-s-warn-border">
              <div className="flex items-start gap-2">
                <span className="text-lg">⚠️</span>
                <div>
                  <p className="text-[13px] font-semibold text-s-warn-text mb-1">
                    PoC
                  </p>
                  <p className="text-[12px] text-s-warn-text/80 leading-relaxed">
                    {tCommon("pocBanner")}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Sprache der Oberfläche ── */}
          <div className="card">
            <p className="section-label mb-3">{t("language")}</p>
            <div className="flex gap-1.5 flex-wrap">
              {[
                { code: "de", label: "Deutsch",     flag: "🇩🇪" },
                { code: "fr", label: "Français",    flag: "🇫🇷" },
                { code: "it", label: "Italiano",    flag: "🇮🇹" },
                { code: "en", label: "English",     flag: "🇬🇧" },
                { code: "rm", label: "Rumantsch",   flag: "🇨🇭" },
                { code: "uk", label: "Українська",  flag: "🇺🇦" },
                { code: "sr", label: "Srpski",      flag: "🇷🇸" },
                { code: "sq", label: "Shqip",       flag: "🇦🇱" },
                { code: "hr", label: "Hrvatski",    flag: "🇭🇷" },
                { code: "pt", label: "Português",   flag: "🇵🇹" },
                { code: "es", label: "Español",     flag: "🇪🇸" },
              ].map((lang) => (
                <a
                  key={lang.code}
                  href={`/${lang.code}/profile`}
                  className={`inline-flex items-center gap-1.5 text-[13px] px-3 py-1.5 rounded-chip font-medium transition-colors
                    ${lang.code === locale
                      ? "bg-acc text-white"
                      : "bg-border-light text-sub hover:bg-border hover:text-text"}`}
                >
                  <span>{lang.flag}</span>
                  <span>{lang.label}</span>
                </a>
              ))}
            </div>
          </div>

          {/* ── Quick links ── */}
          <div className="card">
            <p className="section-label mb-3">{t("quickLinks")}</p>
            <div className="divide-y divide-border-light">
              <Link
                href={`/${locale}/history`}
                className="flex items-center justify-between py-3 hover:bg-bg -mx-2 px-2 rounded-btn transition-colors"
              >
                <span className="text-[14px] text-text">{tNav("history")}</span>
                <span className="text-[14px] text-acc font-medium">{t("openLink")} →</span>
              </Link>
              <Link
                href={`/${locale}/apply`}
                className="flex items-center justify-between py-3 hover:bg-bg -mx-2 px-2 rounded-btn transition-colors"
              >
                <span className="text-[14px] text-text">{tNav("apply")}</span>
                <span className="text-[14px] text-acc font-medium">{t("startLink")} →</span>
              </Link>
            </div>
          </div>

          {/* ── Abmelden ── */}
          <DeletePocData />
          <SignOutForm />
        </div>
      </div>
    </AppShell>
  );
}

