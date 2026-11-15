"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/lib/navigation";
import { useApplicationStore } from "@/store/application";
import { useApplicationHydration } from "@/store/use-hydration";
import { AppShell } from "@/components/AppShell";

const STEPS = [
  { key: "step1", durationMs: 1800 },
  { key: "step2", durationMs: 1800 },
  { key: "step3", durationMs: 1600 },
  { key: "step4", durationMs: 3000 },
] as const;

// ── Logo pulse icon ────────────────────────────────────────────
function LogoIcon() {
  return (
    <div
      className="w-16 h-16 rounded-[14px] bg-acc flex items-center justify-center animate-pulse-logo mx-auto mb-6"
      style={{ boxShadow: "0 8px 32px rgba(45,90,61,0.25)" }}
    >
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <rect x="4"  y="8"  width="16" height="3" rx="1.5" fill="white" />
        <rect x="4"  y="14.5" width="24" height="3" rx="1.5" fill="white" />
        <rect x="4"  y="21" width="12" height="3" rx="1.5" fill="white" />
      </svg>
    </div>
  );
}

function GeneratingPageContent() {
  const t = useTranslations("generating");
  const router = useRouter();
  const searchParams = useSearchParams();
  const isRegenerate = searchParams.get("mode") === "regenerate";

  const {
    parsedJob, selectedTone, selectedLength, selectedLetterLanguage,
    contactPerson, qualifyAnswers, companyAddress,
    currentApplicationId,
    setLetter, setVariant, clearVariants, setKeywords, setMatchScore,
    setCurrentApplicationId, setIsGenerating, setGenerateError,
    resetStreaming, appendStreamingText, setGenerationProgress,
    streamingText, generateError,
  } = useApplicationStore();

  const [currentStep, setCurrentStep] = useState(0);
  const [isSlowWarning, setIsSlowWarning] = useState(false);
  const hasHydrated = useApplicationHydration();
  const hasStarted = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (hasHydrated && !parsedJob) { router.replace("/apply"); }
  }, [hasHydrated, parsedJob, router]);

  useEffect(() => {
    if (!hasHydrated || hasStarted.current || !parsedJob) return;
    hasStarted.current = true;

    setIsGenerating(true);
    resetStreaming();
    setGenerateError(null);
    // Frischer Flow (apply → qualify → generating): alle Varianten verwerfen.
    // Regenerate-Flow (Button im Result-Page): andere Varianten beibehalten,
    // nur die aktuelle wird ersetzt.
    if (!isRegenerate) {
      clearVariants();
      setCurrentApplicationId(null);
    }
    // matchScore wird beibehalten (kommt aus Qualify-Schritt) — SSE-Event aus
    // /api/generate überschreibt es bei Bedarf.

    const slowTimer = setTimeout(() => setIsSlowWarning(true), 20_000);
    const abort = new AbortController();
    abortRef.current = abort;

    // Step progression
    let stepIndex = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = (idx: number) => {
      if (idx < STEPS.length - 1) {
        const t = setTimeout(() => {
          stepIndex++;
          setCurrentStep(stepIndex);
          setGenerationProgress(stepIndex as 0 | 1 | 2 | 3 | 4);
          schedule(idx + 1);
        }, STEPS[idx].durationMs);
        timers.push(t);
      }
    };
    schedule(0);

    (async () => {
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobData: parsedJob,
            tone: selectedTone,
            length: selectedLength,
            contactPerson: contactPerson || undefined,
            letterLanguage: selectedLetterLanguage,
            qualifyAnswers: qualifyAnswers.length > 0 ? qualifyAnswers : undefined,
            companyAddress: companyAddress || undefined,
            // Bei Regenerate: ID mitgeben, damit Backend updated statt einfügt
            applicationId: isRegenerate && currentApplicationId
              ? currentApplicationId
              : undefined,
          }),
          signal: abort.signal,
        });

        if (!res.ok) {
          const err = await res.json();
          setGenerateError(err.error ?? t("errorDesc"));
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("Kein Stream");

        const decoder = new TextDecoder();
        let fullLetter = "";
        let keywords: string[] = [];
        let buffer = "";
        let serverError = false;
        let completed = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // Server hat 'error' geschickt → Stream abbrechen, nicht weiter sammeln
          if (serverError) {
            try { await reader.cancel(); } catch { /* */ }
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const event of events) {
            const lines = event.split("\n");
            let eventType = "";
            let data = "";
            for (const line of lines) {
              if (line.startsWith("event: ")) eventType = line.slice(7).trim();
              if (line.startsWith("data: "))  data = line.slice(6);
            }
            if (!data) continue;

            switch (eventType) {
              case "keywords":
                try { keywords = JSON.parse(data); } catch { /* */ }
                break;
              case "matchScore":
                try {
                  const score: unknown = JSON.parse(data);
                  setMatchScore(typeof score === "number" && Number.isFinite(score) ? score : null);
                } catch {
                  const n = parseInt(data, 10);
                  setMatchScore(Number.isFinite(n) ? n : null);
                }
                break;
              case "applicationId":
                try {
                  const id = JSON.parse(data);
                  if (typeof id === "string") setCurrentApplicationId(id);
                } catch { /* */ }
                break;
              case "chunk":
                try {
                  const chunk = JSON.parse(data);
                  if (typeof chunk === "string") { fullLetter += chunk; appendStreamingText(chunk); }
                } catch { /* */ }
                break;
              case "done":
                completed = true;
                setCurrentStep(STEPS.length - 1);
                setGenerationProgress(4);
                break;
              case "error":
                // Optionale Server-Message extrahieren (Format: {"message": "..."})
                try {
                  const payload = JSON.parse(data);
                  setGenerateError(payload?.message ?? t("errorDesc"));
                } catch {
                  setGenerateError(t("errorDesc"));
                }
                serverError = true;
                break;
            }
          }
        }

        if (!serverError && (!completed || !fullLetter.trim())) {
          setGenerateError(t("errorDesc"));
          return;
        }

        // Bei Server-Fehler: nicht navigieren — Error-UI bleibt sichtbar
        if (fullLetter && !serverError) {
          setLetter(fullLetter);
          setVariant(selectedTone, fullLetter); // Initialvariante cachen
          setKeywords(keywords);
          clearTimeout(slowTimer);
          timers.forEach(clearTimeout);
          router.replace("/apply/result");
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setGenerateError(t("errorDesc"));
      } finally {
        clearTimeout(slowTimer);
        timers.forEach(clearTimeout);
        setIsGenerating(false);
      }
    })();

    return () => {
      hasStarted.current = false;
      abortRef.current?.abort();
      timers.forEach(clearTimeout);
      clearTimeout(slowTimer);
    };
  }, [hasHydrated, parsedJob]); // eslint-disable-line react-hooks/exhaustive-deps

  if (generateError) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-full">
          <div className="card max-w-md w-full text-center p-8">
            <span className="text-4xl block mb-4">😔</span>
            <h2 className="font-serif text-[22px] font-semibold text-text mb-2">{t("errorTitle")}</h2>
            <p className="text-[14px] text-sub mb-6">{generateError}</p>
            <button className="btn-primary w-full" onClick={() => router.replace("/apply")}>
              {t("retryButton")}
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex items-center justify-center min-h-full px-4 md:px-6 py-6 md:py-10">
        <div className="w-full max-w-[480px] text-center">
          <LogoIcon />

          <h1 className="font-serif font-semibold text-[22px] md:text-[26px] text-text mb-1">
            {t("title")}
          </h1>
          <p className="text-[13px] md:text-[14px] text-sub mb-6">
            {t("timeNote")}
          </p>

          {/* Job card */}
          {parsedJob && (
            <div className="card text-left mb-6 p-4">
              <p className="section-label mb-1">{t("forJob")}</p>
              <p className="text-[15px] font-semibold text-text">{parsedJob.title}</p>
              <p className="text-[13px] text-sub">
                {parsedJob.company}{parsedJob.location ? ` · ${parsedJob.location}` : ""}
              </p>
            </div>
          )}

          {/* Steps */}
          <div className="space-y-2 mb-6 text-left">
            {STEPS.map((step, i) => {
              const done   = i < currentStep;
              const active = i === currentStep;
              return (
                <div
                  key={step.key}
                  className={`flex items-center gap-3 px-4 py-3 rounded-[10px] transition-all duration-500
                    ${active ? "bg-acc-light"  : ""}
                    ${done   ? "opacity-50"    : ""}
                    ${!active && !done ? "opacity-30" : ""}
                  `}
                >
                  {/* Bubble */}
                  <div className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0 transition-colors
                    ${done   ? "bg-acc text-white"      : ""}
                    ${active ? "bg-acc text-white"      : ""}
                    ${!active && !done ? "bg-border text-sub2" : ""}
                  `}>
                    {done ? "✓" : i + 1}
                  </div>
                  <span className={`text-[14px] font-medium ${active ? "text-acc" : "text-sub"}`}>
                    {t(step.key)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Streaming preview */}
          {streamingText && (
            <div
              className="rounded-card p-4 text-left mb-4 max-h-32 overflow-hidden relative fade-mask-bottom"
              style={{ background: "#F3EDE4" }}
            >
              <p className="streaming-text text-[13px] text-sub cursor-blink">
                {streamingText.slice(-300)}
              </p>
            </div>
          )}

          {isSlowWarning && (
            <p className="text-[13px] text-sub2 mb-4">{t("slowNote")}</p>
          )}

          <button
            className="btn-ghost text-sub2 text-[13px]"
            onClick={() => { abortRef.current?.abort(); router.replace("/apply"); }}
          >
            {t("cancelButton")}
          </button>
        </div>
      </div>
    </AppShell>
  );
}

export default function GeneratingPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="flex items-center justify-center h-full">
            <svg className="animate-spin text-acc" width="28" height="28" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="11" stroke="currentColor" strokeWidth="3" strokeOpacity=".2" />
              <path d="M14 3A11 11 0 0 1 25 14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
        </AppShell>
      }
    >
      <GeneratingPageContent />
    </Suspense>
  );
}

