import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { decryptLetter } from "@/lib/encryption";
import { AppShell } from "@/components/AppShell";
import { HistoryList } from "./HistoryList";

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "history" });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth`);

  const { data: rows } = await supabase
    .from("applications")
    .select("id, job_title, company, letter_enc, tone, language, word_count, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const applications = (rows ?? []).map((row) => {
    let preview = "";
    try {
      const full = decryptLetter(row.letter_enc);
      preview = full.substring(0, 150) + "…";
    } catch { preview = t("decryptError"); }
    return {
      id: row.id,
      jobTitle: row.job_title,
      company: row.company,
      tone: row.tone ?? "balanced",
      language: row.language ?? "de",
      wordCount: row.word_count ?? null,
      createdAt: row.created_at,
      preview,
    };
  });

  return (
    <AppShell>
      <div className="p-4 md:p-8">
        <div className="max-w-[680px] mx-auto">
          <div className="mb-5 md:mb-6">
            <h1 className="font-serif font-semibold text-[22px] md:text-[24px] text-text">{t("title")}</h1>
            <p className="text-[13px] text-sub mt-1">
              {t("countLabel", { count: applications.length })}
            </p>
          </div>

          <HistoryList initialApps={applications} locale={locale} />
        </div>
      </div>
    </AppShell>
  );
}
