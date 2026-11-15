"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/lib/navigation";
import { Logo } from "@/components/Logo";
import { PocBanner } from "@/components/PocBanner";

const STEPS = [
  { num: "01", key: "step1" as const },
  { num: "02", key: "step2" as const },
  { num: "03", key: "step3" as const },
];

export default function OnboardingPage() {
  const t = useTranslations("onboarding");
  const router = useRouter();

  return (
    <div className="min-h-screen min-h-dvh bg-bg flex flex-col">
      <PocBanner />
      {/* Header */}
      <header className="border-b border-border-light">
        <div className="max-w-[680px] mx-auto px-6 py-4">
          <Logo size={30} />
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-[520px] text-center">
          {/* Welcome eyebrow */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-chip bg-acc-light border border-acc-mid text-[13px] font-semibold text-acc mb-6">
            👋 {t("welcomeBadge")}
          </div>

          {/* Headline */}
          <h1 className="font-serif font-semibold text-[34px] leading-tight tracking-[-0.5px] text-text mb-3">
            {t("title")}
          </h1>
          <p className="text-[15px] text-sub mb-10 leading-relaxed">
            {t("subtitle")}
          </p>

          {/* Steps */}
          <div className="space-y-3 mb-10 text-left">
            {STEPS.map((step) => (
              <div
                key={step.key}
                className="card flex items-center gap-4 py-4 px-5"
              >
                <span
                  className="font-serif font-light text-[28px] leading-none flex-shrink-0"
                  style={{ color: "#C4DAC8" }}
                >
                  {step.num}
                </span>
                <span className="text-[14px] font-semibold text-text">
                  {t(step.key)}
                </span>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <button
            className="btn-primary w-full text-[15px] py-3 min-h-[48px]"
            onClick={() => router.push("/cv")}
          >
            {t("startButton")} →
          </button>

          <button
            className="btn-ghost w-full mt-3"
            onClick={() => router.push("/apply")}
          >
            {t("skipButton")}
          </button>
        </div>
      </main>
    </div>
  );
}
