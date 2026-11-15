import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Link } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { PocBanner } from "@/components/PocBanner";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing" });
  return { title: t("headline") };
}

const STEPS = [
  { num: "01", titleKey: "step1Title" as const, descKey: "step1Desc" as const },
  { num: "02", titleKey: "step2Title" as const, descKey: "step2Desc" as const },
  { num: "03", titleKey: "step3Title" as const, descKey: "step3Desc" as const },
];

export default async function LandingPage({ params }: PageProps) {
  const { locale } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect(`/${locale}/history`);

  const t = await getTranslations({ locale, namespace: "landing" });
  const tAuth = await getTranslations({ locale, namespace: "auth" });

  return (
    <div className="min-h-screen min-h-dvh bg-bg flex flex-col">
      <PocBanner />
      {/* ── Header ── */}
      <header className="border-b border-border-light">
        <div className="max-w-[900px] mx-auto px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-2">
          <Logo size={28} />
          <div className="flex items-center gap-2 md:gap-3">
            <Link href="/auth" className="btn-secondary-sm whitespace-nowrap">
              {tAuth("loginButton")}
            </Link>
            <Link href="/auth" className="btn-primary-sm whitespace-nowrap hidden sm:inline-flex">
              {t("cta")}
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-4 md:px-6 py-12 md:py-20">
        <div className="max-w-[900px] mx-auto">
          {/* Headline */}
          <h1 className="font-serif font-semibold text-[32px] md:text-[44px] lg:text-[52px] leading-[1.1] tracking-[-0.5px] md:tracking-[-1px] text-text mb-5 md:mb-6">
            {t("heroLead")}{" "}
            <em className="italic text-acc not-italic" style={{ fontStyle: "italic" }}>
              {t("heroEmphasis")}
            </em>
          </h1>

          {/* Sub copy */}
          <p className="text-[15px] md:text-[17px] text-sub leading-relaxed mb-8 md:mb-10 max-w-[540px] mx-auto">
            {t("subheadline")}
          </p>

          {/* CTA */}
          <Link href="/auth" className="btn-primary text-[15px] md:text-[16px] px-6 md:px-7 py-3 md:py-3.5 min-h-[48px] md:min-h-[52px]">
            {t("cta")} →
          </Link>
        </div>
      </section>

      {/* ── 3-Step Section ── */}
      <section className="bg-white border-y border-border-light py-10 md:py-16 px-4 md:px-6">
        <div className="max-w-[900px] mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10">
            {STEPS.map((step) => (
              <div key={step.num} className="flex flex-col gap-3">
                <span
                  className="font-serif font-light text-[36px] leading-none"
                  style={{ color: "#C4DAC8" }}
                >
                  {step.num}
                </span>
                <h3 className="text-[16px] font-bold text-text">
                  {t(step.titleKey)}
                </h3>
                <p className="text-[14px] text-sub leading-relaxed">
                  {t(step.descKey)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="py-10 md:py-16 px-4 md:px-6 text-center">
        <div className="max-w-[540px] mx-auto">
          <h2 className="font-serif font-semibold text-[22px] md:text-[26px] text-text mb-3 md:mb-4">
            {t("readyTitle")}
          </h2>
          <p className="text-[14px] md:text-[15px] text-sub mb-6 md:mb-8">
            {t("readyDescription")}
          </p>
          <Link href="/auth" className="btn-primary text-[15px] px-6 py-3">
            {t("cta")} →
          </Link>
        </div>
      </section>
    </div>
  );
}
