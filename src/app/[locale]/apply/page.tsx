"use client";

import { isRecognisedJob } from "@/lib/job-text";

import { useState, useEffect, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/lib/navigation";
import { useApplicationStore } from "@/store/application";
import { AppShell } from "@/components/AppShell";
import { LETTER_LANGUAGES } from "@/lib/constants";
import { parsedJobSchema } from "@/lib/schemas";
import type { ParsedJob, LetterLanguage } from "@/types";

type InputMode = "url" | "text";

interface RecentDraft {
  id: string;
  jobTitle: string;
  company: string;
  createdAt: string;
  language: string;
}

// ── Spinner ───────────────────────────────────────────────────
function Spinner() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="2" strokeOpacity=".3" />
      <path d="M7 1.5A5.5 5.5 0 0 1 12.5 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ── List icon ─────────────────────────────────────────────────
function ListIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="3" y="4"  width="8"  height="1.6" rx=".8" fill="#2D5A3D" />
      <rect x="3" y="8"  width="12" height="1.6" rx=".8" fill="#2D5A3D" />
      <rect x="3" y="12" width="6"  height="1.6" rx=".8" fill="#2D5A3D" />
    </svg>
  );
}

export default function ApplyPage() {
  const t = useTranslations("apply");
  const router = useRouter();

  const [mode, setMode] = useState<InputMode>("url");
  const [input, setInput] = useState("");
  const [isParsing, startParsing] = useTransition();
  const [parseError, setParseError] = useState("");
  const [parseErrorReference, setParseErrorReference] = useState<string | null>(null);
  const [previewJob, setPreviewJob] = useState<ParsedJob | null>(null);
  const [recentDrafts, setRecentDrafts] = useState<RecentDraft[]>([]);

  const { startNewJob, setJobInput, selectedLetterLanguage, setLetterLanguage } =
    useApplicationStore();

  // Letzte 5 Bewerbungen laden
  useEffect(() => {
    fetch("/api/history?limit=5")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.applications) {
          setRecentDrafts(
            data.applications.map((a: { id: string; jobTitle: string; company: string; createdAt: string; language: string }) => ({
              id: a.id,
              jobTitle: a.jobTitle,
              company: a.company,
              createdAt: a.createdAt,
              language: a.language,
            }))
          );
        }
      })
      .catch(() => { /* */ });
  }, []);

  const handleParse = () => {
    if (!input.trim()) return;
    if (mode === "url") {
      try { new URL(input.trim()); }
      catch { setParseError(t("errors.urlInvalid")); return; }
    } else if (input.trim().length < 100) {
      setParseError(t("errors.textTooShort")); return;
    }
    setParseError("");
    setParseErrorReference(null);
    setPreviewJob(null);

    startParsing(async () => {
      let res: Response;
      let data: Record<string, unknown>;
      try {
        res = await fetch("/api/parse-job", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: mode, content: input.trim() }),
        });
      } catch { setParseError(t("errors.serverError")); return; }
      const headerId = res.headers.get("X-Request-ID");
      const requestId = headerId && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(headerId) ? headerId : null;
      setParseErrorReference(requestId);
      try {
        const raw: unknown = await res.json();
        data = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      } catch { setParseError(t("errors.serverError")); return; }
      const job = parsedJobSchema.safeParse(data.job);
      if (!res.ok || data.success !== true || !job.success) {
        const code = typeof data.code === "string" && /^[A-Z0-9_]{1,80}$/.test(data.code)
          ? data.code : res.ok && data.success === true ? "AI_INVALID_OUTPUT" : null;
        setParseErrorReference([code, requestId].filter(Boolean).join(" · ") || null);
        if (data.error === "URL_NOT_READABLE" || data.error === "PDF_NOT_SUPPORTED" || data.error === "JS_RENDERED_PAGE")
          setParseError(t("errors.urlNotReadable"));
        else if (data.error === "NO_JOB_FOUND")
          setParseError(t("errors.noJobFound"));
        else if (code?.startsWith("AI_"))
          setParseError(t("errors.analysisFailed"));
        else
          setParseError(t("errors.serverError"));
        return;
      }
      if (!isRecognisedJob(job.data)) {
        setParseError(t("errors.noJobFound"));
        return;
      }
      setParseErrorReference(null);
      setPreviewJob(job.data);
    });
  };

  const handleGenerate = () => {
    if (!previewJob) return;
    setJobInput({ type: mode, content: input.trim() });
    // startNewJob (statt setParsedJob) verwirft alle Daten der vorherigen
    // Bewerbung (Ansprechperson, Firmenadresse, Brief, Varianten, etc.),
    // damit nichts vom alten Job in den neuen leakt.
    startNewJob(previewJob);
    router.push("/apply/qualify");
  };

  return (
    <AppShell>
      <div className="px-4 py-6 md:px-8 md:py-10">
        <div className="max-w-[960px] mx-auto">
          {/* ── Header ── */}
          <div className="mb-6 md:mb-8 text-center">
            <h1 className="font-serif font-semibold text-[24px] md:text-[32px] tracking-[-0.5px] text-text leading-tight">
              {t("title")}
            </h1>
            <p className="text-[13px] md:text-[14px] text-sub mt-2">{t("subtitle")}</p>
          </div>

          {/* ── Main 2-Spalten Grid (stackt unter lg) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 lg:gap-8">
            {/* ── Linke Spalte: Input ── */}
            <div className="space-y-5">
              <div className="card p-4 md:p-6">
                {/* Tab toggle */}
                <div className="flex bg-side rounded-[9px] p-0.5 border border-border-light mb-5">
                  {(["url", "text"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => { setMode(m); setInput(""); setPreviewJob(null); setParseError(""); }}
                      className={`flex-1 py-2 text-[13px] font-semibold rounded-[7px] transition-colors
                        ${mode === m ? "bg-white text-text shadow-nav" : "text-sub hover:text-text"}`}
                    >
                      {m === "url" ? "🔗 Link" : "📋 Text"}
                    </button>
                  ))}
                </div>

                {/* Input */}
                <div className="mb-4">
                  <label className="field-label">
                    {mode === "url" ? t("urlLabel") : t("textLabel")}
                  </label>
                  {mode === "url" ? (
                    <input
                      type="url"
                      value={input}
                      onChange={(e) => { setInput(e.target.value); setParseError(""); setPreviewJob(null); }}
                      className="field"
                      placeholder={t("urlPlaceholder")}
                      disabled={isParsing}
                    />
                  ) : (
                    <textarea
                      value={input}
                      onChange={(e) => { setInput(e.target.value); setParseError(""); setPreviewJob(null); }}
                      className="field resize-none"
                      rows={6}
                      placeholder={t("textPlaceholder")}
                      disabled={isParsing}
                    />
                  )}
                  {parseError && <div role="alert" className="field-error">
                    <p>{parseError}</p>
                    {parseErrorReference && <p className="text-[11px] break-words mt-1">{t("errors.errorReference")}: <span className="font-mono">{parseErrorReference}</span></p>}
                  </div>}

                </div>

                {/* Analyse button */}
                <button
                  className="btn-secondary w-full"
                  onClick={handleParse}
                  disabled={isParsing || !input.trim()}
                >
                  {isParsing ? <><Spinner /> {t("parsing")}</> : `→ ${t("parseButton")}`}
                </button>

                {/* Parsed job card */}
                {previewJob && (
                  <div className="rounded-card border border-acc-mid bg-acc-light/40 p-4 mt-5 animate-fade-up space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-white border border-acc-mid flex items-center justify-center flex-shrink-0">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M2 5l2.5 2.5L8 3" stroke="#2D5A3D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                      <span className="section-label text-acc">{t("previewTitle")}</span>
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold text-text">{previewJob.title}</p>
                      <p className="text-[13px] text-sub mt-0.5">
                        {previewJob.company}{previewJob.location ? ` · ${previewJob.location}` : ""}
                      </p>
                    </div>
                    {previewJob.mustHave.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {previewJob.mustHave.slice(0, 5).map((s) => (
                          <span key={s} className="text-[12px] text-sub bg-white border border-border-light rounded-chip px-2.5 py-0.5">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Language select + Generate */}
                {previewJob && (
                  <div className="mt-5 space-y-3">
                    <div>
                      <label className="field-label">{t("letterLanguage")}</label>
                      <select
                        value={selectedLetterLanguage}
                        onChange={(e) => setLetterLanguage(e.target.value as LetterLanguage)}
                        className="field"
                      >
                        {LETTER_LANGUAGES.map((lang) => (
                          <option key={lang.code} value={lang.code}>
                            {lang.flag} {lang.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button className="btn-primary w-full" onClick={handleGenerate}>
                      {t("generateButton")} →
                    </button>
                  </div>
                )}
              </div>

              {/* Hilfe / Tipps */}
              {!previewJob && (
                <div className="card bg-side border-border p-5">
                  <p className="section-label mb-3">💡 {t("tipsTitle")}</p>
                  <ol className="space-y-2 text-[13px] text-sub">
                    <li className="flex items-start gap-2">
                      <span className="font-serif font-semibold text-acc flex-shrink-0">1.</span>
                      {t("tip1")}
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-serif font-semibold text-acc flex-shrink-0">2.</span>
                      {t("tip2")}
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-serif font-semibold text-acc flex-shrink-0">3.</span>
                      {t("tip3")}
                    </li>
                  </ol>
                </div>
              )}
            </div>

            {/* ── Rechte Spalte: Recent Drafts ── */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="section-label">{t("recentTitle")}</p>
                {recentDrafts.length > 0 && (
                  <button
                    onClick={() => router.push("/history")}
                    className="text-[12px] text-acc font-medium hover:underline"
                  >
                    {t("showAll")} →
                  </button>
                )}
              </div>

              {recentDrafts.length === 0 ? (
                <div className="card bg-side border-border p-6 text-center">
                  <div
                    className="font-serif font-light text-[42px] leading-none mb-2"
                    style={{ color: "#C4DAC8" }}
                  >
                    ✦
                  </div>
                  <p className="text-[13px] text-sub">
                    {t("recentEmpty")}
                  </p>
                  <p className="text-[12px] text-sub2 mt-1">
                    {t("recentEmptyHint")}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentDrafts.map((draft) => (
                    <button
                      key={draft.id}
                      onClick={() => router.push(`/apply/result?id=${draft.id}`)}
                      className="card-hover w-full text-left flex items-start gap-3 p-3"
                    >
                      <div className="w-8 h-8 rounded-[7px] bg-acc-light flex items-center justify-center flex-shrink-0">
                        <ListIcon />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-text truncate leading-tight">
                          {draft.jobTitle}
                        </p>
                        <p className="text-[12px] text-sub truncate mt-0.5">
                          {draft.company}
                        </p>
                        <p className="text-[11px] text-sub2 mt-1">
                          {new Date(draft.createdAt).toLocaleDateString("de-CH")} · {draft.language.toUpperCase()}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

