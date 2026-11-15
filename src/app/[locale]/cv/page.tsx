"use client";

import { useState, useTransition, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { useRouter } from "@/lib/navigation";
import { AppShell } from "@/components/AppShell";
import type { CVProfile } from "@/types";
import { UploadTab } from "./_components/UploadTab";
import { PersonalInfoCard } from "./_components/PersonalInfoCard";
import { WorkExperienceCard } from "./_components/WorkExperienceCard";
import { EducationCard } from "./_components/EducationCard";
import { LanguagesCard } from "./_components/LanguagesCard";

export default function CVPage() {
  const t = useTranslations("cv");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSaved, setIsSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<"upload" | "manual">("manual");
  const [importBanner, setImportBanner] = useState(false);

  const { register, control, handleSubmit, reset, formState: { errors } } = useForm<CVProfile>({
    defaultValues: {
      firstName: "", lastName: "", phone: "", location: "",
      workExperience: [], education: [], skills: [], languages: [],
    },
  });

  useEffect(() => {
    fetch("/api/cv")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.hasCv) reset(data); })
      .catch(() => { /* */ });
  }, [reset]);

  const handleImported = (cv: CVProfile) => {
    reset(cv);
    setImportBanner(true);
    setActiveTab("manual");
  };

  const onSubmit = (data: CVProfile) => {
    startTransition(async () => {
      const res = await fetch("/api/cv", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, cvSource: "manual" }),
      });
      if (res.ok) {
        setIsSaved(true);
        setTimeout(() => router.push("/apply"), 1500);
      }
    });
  };

  return (
    <AppShell>
      <div className="p-4 md:p-8">
        <div className="max-w-[720px] mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h1 className="font-serif font-semibold text-[24px] text-text">{t("title")}</h1>
            <p className="text-[13px] text-sub mt-1">{t("subtitle")}</p>
          </div>

          {/* Tab switch */}
          <div className="flex bg-side rounded-[9px] p-0.5 border border-border-light mb-6">
            <button
              onClick={() => setActiveTab("manual")}
              className={`flex-1 py-2 text-[13px] font-semibold rounded-[7px] transition-colors
                ${activeTab === "manual" ? "bg-white text-text shadow-nav" : "text-sub hover:text-text"}`}
            >
              ✏️ {t("manualTab")}
            </button>
            <button
              onClick={() => setActiveTab("upload")}
              className={`flex-1 py-2 text-[13px] font-semibold rounded-[7px] transition-colors
                ${activeTab === "upload" ? "bg-white text-text shadow-nav" : "text-sub hover:text-text"}`}
            >
              📤 {t("uploadTab")}
            </button>
          </div>

          {activeTab === "upload" && (
            <UploadTab
              onImported={handleImported}
              onSwitchToManual={() => setActiveTab("manual")}
            />
          )}

          {activeTab === "manual" && (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {importBanner && (
                <div className="card bg-s-ok-bg border-s-ok-border flex items-start gap-3 py-3">
                  <span className="text-lg flex-shrink-0">✅</span>
                  <div>
                    <p className="font-semibold text-s-ok-text text-[14px]">{t("uploadSuccess")}</p>
                    <p className="text-[13px] text-s-ok-text/80 mt-0.5">{t("uploadImportNote")}</p>
                  </div>
                </div>
              )}

              <PersonalInfoCard register={register} errors={errors} />
              <WorkExperienceCard control={control} register={register} />
              <EducationCard control={control} register={register} />
              <LanguagesCard control={control} register={register} />

              <div className="pt-2">
                {isSaved ? (
                  <div className="btn-primary w-full justify-center pointer-events-none">
                    ✓ {t("savedMessage")}
                  </div>
                ) : (
                  <button type="submit" className="btn-primary w-full" disabled={isPending}>
                    {isPending ? t("saving") : `💾 ${t("saveButton")}`}
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </AppShell>
  );
}
