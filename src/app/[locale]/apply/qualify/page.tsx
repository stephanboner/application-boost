"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/lib/navigation";
import { useApplicationStore } from "@/store/application";
import { useApplicationHydration } from "@/store/use-hydration";
import { AppShell } from "@/components/AppShell";
import type { QualifyAnswer } from "@/types";
import { cvMatchSchema } from "@/lib/schemas";

interface MatchResult {
  topMatches: string[];
  gaps: string[];
  matchScore: number;
}

function MatchScore({ score }: { score: number }) {
  const colors =
    score >= 70 ? "border-s-ok-border bg-s-ok-bg text-s-ok-text" :
    score >= 40 ? "border-s-warn-border bg-s-warn-bg text-s-warn-text" :
    "border-s-err-border bg-red-50 text-s-err-text";

  return (
    <div role="meter" aria-label="Match" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100}
      className={`rounded-card border p-5 md:p-6 ${colors}`}>
      <p className="flex items-baseline gap-2.5 mb-4">
        <span className="text-[44px] md:text-[52px] font-semibold leading-none tracking-tight tabular-nums">{score}%</span>{" "}
        <span className="text-[16px] font-semibold">Match</span>
      </p>
      <div aria-hidden="true" className="h-2 rounded-full bg-white/70 overflow-hidden">
        <div className="h-full rounded-full bg-current" style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export default function QualifyPage() {
  const t = useTranslations("qualify");
  const router = useRouter();
  const hasHydrated = useApplicationHydration();

  const {
    parsedJob, contactPerson, setContactPerson,
    qualifyAnswers, setQualifyAnswers, setCompanyAddress, companyAddress,
    setMatchScore,
  } = useApplicationStore();

  const [isLoading, setIsLoading] = useState(true);
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [matchErrorReference, setMatchErrorReference] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [motivation, setMotivation] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [localAddress, setLocalAddress] = useState("");
  const [localContact, setLocalContact] = useState("");

  useEffect(() => {
    if (!hasHydrated) return;
    setMotivation(qualifyAnswers.find((qa) => qa.requirement === "Motivation für Stelle und Arbeitgeber")?.answer ?? "");
    setAnswers(Object.fromEntries(qualifyAnswers.map((qa) => [qa.requirement, qa.answer])));
  }, [hasHydrated, qualifyAnswers]);

  useEffect(() => { if (hasHydrated && !parsedJob) router.replace("/apply"); }, [hasHydrated, parsedJob, router]);

  useEffect(() => {
    if (parsedJob) {
      setLocalContact(contactPerson || parsedJob.contactPerson || "");
      setLocalAddress(companyAddress || parsedJob.address || "");
    }
  }, [parsedJob, contactPerson, companyAddress]);

  useEffect(() => {
    if (!hasHydrated || !parsedJob) return;
    setIsLoading(true);
    setMatch(null);
    setMatchScore(null);
    setMatchError(null);
    setMatchErrorReference(null);
    const abort = new AbortController();
    fetch("/api/qualify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobData: parsedJob }),
      signal: abort.signal,
    })
      .then(async (response) => {
        if (abort.signal.aborted) return;
        const headerId = response.headers.get("X-Request-ID");
        const requestId = headerId && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(headerId) ? headerId : null;
        setMatchErrorReference(requestId);
        const raw: unknown = await response.json();
        if (abort.signal.aborted) return;
        const data = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
        const result = cvMatchSchema.safeParse(data.match);
        if (response.ok && data.success === true && result.success) {
          setMatch(result.data);
          setMatchScore(Math.round(result.data.matchScore));
          setMatchErrorReference(null);
        } else {
          const code = typeof data.code === "string" && /^[A-Z0-9_]{1,80}$/.test(data.code)
            ? data.code : response.ok && data.success === true ? "AI_INVALID_OUTPUT" : null;
          setMatchErrorReference([code, requestId].filter(Boolean).join(" · ") || null);
          setMatchError(typeof data.error === "string" ? data.error : null);
        }
      })
      .catch(() => { if (!abort.signal.aborted) { setMatch(null); setMatchScore(null); } })
      .finally(() => { if (!abort.signal.aborted) setIsLoading(false); });
    return () => abort.abort();
  }, [hasHydrated, parsedJob, setMatchScore, retry]);

  const handleGenerate = () => {
    const qualifyAnswers: QualifyAnswer[] = (match?.gaps ?? []).map((req) => ({
      requirement: req,
      answer: answers[req] ?? "",
    }));
    if (motivation.trim()) qualifyAnswers.push({ requirement: "Motivation für Stelle und Arbeitgeber", answer: motivation.trim() });
    setQualifyAnswers(qualifyAnswers);
    setCompanyAddress(localAddress);
    setContactPerson(localContact);
    router.push("/apply/generating");
  };

  if (!hasHydrated || !parsedJob) return null;

  return (
    <AppShell>
      <div className="p-4 md:p-8">
        <div className="max-w-[680px] mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div>
              <h1 className="font-serif font-semibold text-[24px] text-text leading-tight">
                {t("title")}
              </h1>
              <p className="text-[13px] text-sub mt-1">
                {parsedJob.title} · {parsedJob.company}
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="card text-center py-16">
              <svg className="animate-spin text-acc mx-auto mb-3" width="28" height="28" viewBox="0 0 28 28" fill="none">
                <circle cx="14" cy="14" r="11" stroke="currentColor" strokeWidth="3" strokeOpacity=".2" />
                <path d="M14 3A11 11 0 0 1 25 14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              <p className="text-sub text-[14px]">{t("loading")}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {match && <MatchScore score={match.matchScore} />}
              {!match && (
                <div role="alert" className="card text-[13px] text-sub space-y-3">
                  <p>{t("unavailable")}</p>
                  {matchError && <p>{matchError}</p>}
                  {matchErrorReference && (
                    <p className="text-[11px] break-words">
                      {t("errorReference")}: <span className="font-mono">{matchErrorReference}</span>
                    </p>
                  )}
                  <button className="btn-secondary" onClick={() => setRetry((value) => value + 1)}>
                    {t("retryButton")}
                  </button>
                </div>
              )}
              {/* Top matches */}
              {match && match.topMatches.length > 0 && (
                <div className="card">
                  <h2 className="section-label text-acc mb-3 flex items-center gap-2">
                    <span>✓</span> {t("matchesTitle")}
                  </h2>
                  <ul className="space-y-2">
                    {match.topMatches.map((m) => (
                      <li key={m} className="flex items-start gap-2 text-[14px] text-text">
                        <span className="text-acc mt-1 text-[10px] flex-shrink-0">●</span>
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Gaps with input fields */}
              {match && match.gaps.length > 0 ? (
                <div className="card border-s-warn-border">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-s-warn-text">⚠</span>
                    <h2 className="font-serif font-semibold text-[16px] text-text">
                      {t("gapsTitle")}
                    </h2>
                  </div>
                  <p className="text-[13px] text-sub mb-5">{t("gapsHint")}</p>
                  <div className="space-y-4">
                    {match.gaps.map((gap, index) => (
                      <div key={gap}>
                        <label htmlFor={`qualify-gap-${index}`} className="field-label normal-case tracking-normal text-[13px] text-text">
                          {gap}
                        </label>
                        <textarea
                          id={`qualify-gap-${index}`}
                          value={answers[gap] ?? ""}
                          onChange={(e) => setAnswers((p) => ({ ...p, [gap]: e.target.value }))}
                          className="field resize-none"
                          rows={2}
                          placeholder={t("gapPlaceholder")}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : match && match.gaps.length === 0 ? (
                <div className="badge-green w-full p-4 text-[14px] font-medium text-center rounded-card">
                  ✓ {t("noGaps")}
                </div>
              ) : null}

              <div className="card">
                <label htmlFor="qualify-motivation" className="font-serif font-semibold text-[16px] text-text block mb-2">{t("motivationTitle")}</label>
                <p id="qualify-motivation-hint" className="text-[13px] text-sub mb-3">{t("motivationHint")}</p>
                <textarea id="qualify-motivation" aria-describedby="qualify-motivation-hint" value={motivation}
                  onChange={(e) => setMotivation(e.target.value)} maxLength={1500} rows={3}
                  className="field resize-none" placeholder={t("motivationPlaceholder")} />
              </div>

              {/* Contact */}
              <div className="card">
                <h2 className="font-serif font-semibold text-[16px] text-text mb-4">
                  {t("contactTitle")}
                </h2>
                <div className="space-y-3">
                  <div>
                    <label htmlFor="qualify-contact" className="field-label">{t("contactPerson")}</label>
                    <input
                      id="qualify-contact" type="text"
                      value={localContact}
                      onChange={(e) => setLocalContact(e.target.value)}
                      className="field"
                      placeholder={t("contactPersonPlaceholder")}
                    />
                  </div>
                  <div>
                    <label htmlFor="qualify-address" className="field-label">{t("address")}</label>
                    <p className="text-[12px] text-sub2 mb-1.5 -mt-0.5">{t("addressHint")}</p>
                    <textarea id="qualify-address"
                      value={localAddress}
                      onChange={(e) => setLocalAddress(e.target.value)}
                      className="field resize-none"
                      rows={3}
                      placeholder={t("addressPlaceholder")}
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button className="btn-secondary flex-shrink-0" onClick={() => router.back()}>
                  ← {t("backButton")}
                </button>
                <button className="btn-primary flex-1" onClick={handleGenerate}>
                  {t("generateButton")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

