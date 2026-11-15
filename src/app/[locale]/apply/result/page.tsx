"use client";

import { useState, useEffect, useRef, Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/lib/navigation";
import { useApplicationStore } from "@/store/application";
import { useApplicationHydration } from "@/store/use-hydration";
import { AppShell } from "@/components/AppShell";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import { buildLetterMeta, exportLetterAsWord, exportLetterAsPdf } from "@/lib/letter-export";
import { senderLines, recipientLines, dateWithLocation, parseAddressLines } from "@/lib/letter-format";
import type { Application, LetterTone, LetterLanguage, CVProfile } from "@/types";
import { LETTER_LANGUAGES } from "@/lib/constants";
import { EditableRecipient } from "./_components/EditableRecipient";
import { EditableDate } from "./_components/EditableDate";
import { useLetterAutosave, type SaveState } from "./_hooks/use-letter-autosave";

// ── Tone labels ───────────────────────────────────────────────
const TONES: { key: LetterTone; labelKey: "toneFormal" | "toneBalanced" | "tonePersonal" }[] = [
  { key: "formal", labelKey: "toneFormal" },
  { key: "balanced", labelKey: "toneBalanced" },
  { key: "personal", labelKey: "tonePersonal" },
];

// ── Skeleton overlay ──────────────────────────────────────────
function SkeletonOverlay({ label }: { label?: string }) {
  return (
    <div className="absolute inset-0 bg-paper/80 backdrop-blur-[2px] rounded-card flex flex-col items-center justify-center z-10 gap-3">
      <svg className="animate-spin text-acc" width="28" height="28" viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="14" r="11" stroke="currentColor" strokeWidth="3" strokeOpacity=".2" />
        <path d="M14 3A11 11 0 0 1 25 14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label && <p className="text-[12px] text-sub">{label}</p>}
    </div>
  );
}

// ── Save status indicator ─────────────────────────────────────
function SaveStatus({ state, missing, onRetry }: { state: SaveState; missing: boolean; onRetry: () => void }) {
  const t = useTranslations("result");
  if (state === "idle") return null;
  if (state === "saving")
    return <span className="text-[11px] text-sub2 inline-flex items-center gap-1">
      <svg className="animate-spin" width="10" height="10" viewBox="0 0 10 10" fill="none">
        <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.3" strokeOpacity=".3" />
        <path d="M5 1.5A3.5 3.5 0 0 1 8.5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
      {t("saving")}
    </span>;
  if (state === "saved")
    return <span className="text-[11px] text-acc inline-flex items-center gap-1">✓ {t("savedToHistory")}</span>;
  return <span role="alert" className="text-[11px] text-s-err-text text-right">
    {missing ? t("saveMissing") : `✗ ${t("saveError")}`}
    <button type="button" onClick={onRetry} className="underline ml-2">{t("retrySave")}</button>
  </span>;
}

function ResultPageContent() {
  const searchParams = useSearchParams();
  const appId = searchParams.get("id");
  // Each URL-selected document owns its requests, editor and save queue.
  return <ResultEditor key={appId ?? "draft"} appId={appId} />;
}

function ResultEditor({ appId }: { appId: string | null }) {
  const t = useTranslations("result");
  const router = useRouter();
  const hasHydrated = useApplicationHydration();

  const {
    letter, letterVariants, keywords, matchScore, parsedJob,
    selectedTone, selectedLetterLanguage,
    currentApplicationId, companyAddress, customDateLine,
    setLetter, setVariant, setTone, setLetterLanguage,
    loadSavedApplication, clearVariants,
    setCompanyAddress, setCustomDateLine,
    reset,
  } = useApplicationStore();

  const currentContent = letterVariants[selectedTone] ?? letter ?? "";
  const [editableLetter, setEditableLetter] = useState(currentContent);
  const [isCopied, setIsCopied]             = useState(false);
  const [isPdfLoading, setIsPdfLoading]     = useState(false);
  const [isRewriting, setIsRewriting]       = useState(false);
  const [isChangingLanguage, setIsChangingLanguage] = useState(false);
  const [isLoadingFromHistory, setIsLoadingFromHistory] = useState(!!appId);
  const [loadError, setLoadError] = useState<"missing" | "failed" | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  const revisionRequest = useRef<AbortController | null>(null);
  const revisionPending = useRef(false);
  const { saveStatus, saveMissing, save, scheduleSave, retrySave } = useLetterAutosave(currentApplicationId);
  const [cv, setCv] = useState<CVProfile | null>(null);

  // CV einmalig laden für den Briefkopf (Absender + Ort)
  useEffect(() => {
    let alive = true;
    fetch("/api/cv")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (alive && data?.hasCv) setCv(data as CVProfile);
      })
      .catch(() => { /* keine kritischer Fehler — fallback ohne Absender */ });
    return () => { alive = false; };
  }, []);

  // Keep the editor in sync with restored drafts and selected tone variants.
  useEffect(() => {
    setEditableLetter(currentContent);
  }, [currentContent]);

  // Initial redirect
  useEffect(() => {
    if (hasHydrated && !letter && !appId) { router.replace("/apply"); }
  }, [hasHydrated, letter, router, appId]);

  // Aus History laden
  useEffect(() => {
    if (!hasHydrated || !appId) return;
    const restored = useApplicationStore.getState();
    // Keep this document's unsaved edits on reload; another ID must always load.
    if (loadAttempt === 0 && restored.currentApplicationId === appId && restored.letter?.trim()) {
      setIsLoadingFromHistory(false);
      return;
    }
    const controller = new AbortController();
    setIsLoadingFromHistory(true);
    setLoadError(null);
    fetch(`/api/history?id=${encodeURIComponent(appId)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 404 ? "NOT_FOUND" : "LOAD_FAILED");
        return response.json();
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        const app: Application | undefined = data?.application;
        if (!app || app.id !== appId || typeof app.letter !== "string" || !app.letter.trim()) {
          throw new Error("LOAD_FAILED");
        }
        loadSavedApplication(app);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLoadError(error instanceof Error && error.message === "NOT_FOUND" ? "missing" : "failed");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingFromHistory(false);
      });
    return () => controller.abort();
  }, [hasHydrated, appId, loadAttempt, loadSavedApplication]);

  useEffect(() => () => { revisionRequest.current?.abort(); }, []);

  const handleEdit = (value: string) => {
    setEditableLetter(value);
    setVariant(selectedTone, value);
    setLetter(value);
    scheduleSave({ letter: value, tone: selectedTone, language: selectedLetterLanguage });
  };

  // ── Tone change: aus Cache, oder neu generieren ────────────
  const handleToneChange = async (newTone: LetterTone) => {
    if (newTone === selectedTone || revisionPending.current) return;
    setRewriteError(null);

    // Cached variant verfügbar → instant switch
    if (letterVariants[newTone]) {
      setTone(newTone);
      setLetter(letterVariants[newTone]!);
      // Tone in DB updaten (Letter ist bereits gespeichert)
      save({ letter: letterVariants[newTone]!, tone: newTone, language: selectedLetterLanguage });
      return;
    }

    // Sonst: neu generieren
    const controller = new AbortController();
    revisionRequest.current = controller;
    revisionPending.current = true;
    setIsRewriting(true);
    try {
      const res = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "tone", content: editableLetter, newTone }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(res.status === 429 ? "RATE_LIMIT" : "REWRITE_FAILED");
      const data = await res.json();
      if (data.success !== true || typeof data.result !== "string" || !data.result.trim()) throw new Error("REWRITE_FAILED");
      if (controller.signal.aborted) return;
      setVariant(newTone, data.result);
      setLetter(data.result);
      setTone(newTone);
      save({ letter: data.result, tone: newTone, language: selectedLetterLanguage });
    } catch (error) {
      if (!controller.signal.aborted) setRewriteError(t(error instanceof Error && error.message === "RATE_LIMIT" ? "rewriteRateLimited" : "rewriteError"));
    } finally {
      if (!controller.signal.aborted) { setIsRewriting(false); revisionPending.current = false; }
    }
  };

  const handleLanguageChange = async (newLang: string) => {
    if (newLang === selectedLetterLanguage || revisionPending.current) return;
    setRewriteError(null);
    const controller = new AbortController();
    revisionRequest.current = controller;
    revisionPending.current = true;
    setIsChangingLanguage(true);
    try {
      const res = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "language", content: editableLetter, newLanguage: newLang }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(res.status === 429 ? "RATE_LIMIT" : "REWRITE_FAILED");
      const data = await res.json();
      if (data.success !== true || typeof data.result !== "string" || !data.result.trim()) throw new Error("REWRITE_FAILED");
      if (controller.signal.aborted) return;
      // Cached variants are in the old language and must be regenerated.
      clearVariants();
      setVariant(selectedTone, data.result);
      setLetter(data.result);
      setLetterLanguage(newLang as LetterLanguage);
      setCustomDateLine(null);
      save({ letter: data.result, tone: selectedTone, language: newLang as LetterLanguage });
    } catch (error) {
      if (!controller.signal.aborted) setRewriteError(t(error instanceof Error && error.message === "RATE_LIMIT" ? "rewriteRateLimited" : "rewriteError"));
    } finally {
      if (!controller.signal.aborted) { setIsChangingLanguage(false); revisionPending.current = false; }
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(editableLetter);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleNew = () => {
    revisionRequest.current?.abort();
    reset();
    router.push("/apply");
  };

  // ── Memoized values (müssen vor early-returns kommen — Hook-Reihenfolge!) ──
  const wordCount = useMemo(
    () => editableLetter.trim().split(/\s+/).filter(Boolean).length,
    [editableLetter]
  );

  if (!hasHydrated || isLoadingFromHistory) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-full">
          <p className="text-sub text-[14px]">{t("loading")}</p>
        </div>
      </AppShell>
    );
  }

  if (loadError) {
    return <AppShell>
      <div className="p-6 max-w-[680px] mx-auto">
        <p role="alert" className="text-s-err-text mb-4">{t(loadError === "missing" ? "loadNotFound" : "loadError")}</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-primary" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>{t("retryLoad")}</button>
          <button type="button" className="btn-secondary" onClick={() => router.push("/history")}>{t("backToHistory")}</button>
        </div>
      </div>
    </AppShell>;
  }

  if (!letter) return null;

  const meta = buildLetterMeta(parsedJob, selectedLetterLanguage);
  // Echte Match-Score aus AI; Fallback "—" wenn unbekannt
  const displayScore = matchScore != null ? `${Math.round(matchScore)}%` : "—";
  // Briefkopf-Daten (Schweizer Standardformat)
  const sender    = senderLines(cv);
  const recipient = recipientLines(parsedJob?.company, companyAddress);
  // Datum: vom User überschrieben → custom; sonst automatisch (heute + Ort)
  const dateLine  = customDateLine ?? dateWithLocation(meta.date, cv);
  const activeToneLabel = t(TONES.find((tone) => tone.key === selectedTone)?.labelKey ?? "toneBalanced");

  return (
    <AppShell>
      <div className="flex flex-col h-full">
        {/* ── Top bar (responsive — wrappt auf Mobile in zwei Reihen) ── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 md:px-6 py-3 bg-bg border-b border-border-light flex-shrink-0">
          {/* Titel + Meta */}
          <div className="min-w-0">
            <p className="text-[14px] md:text-[15px] font-bold text-text leading-tight truncate">
              {parsedJob?.title ?? t("title")}
            </p>
            {parsedJob && (
              <p className="text-[12px] text-sub truncate">
                {parsedJob.company} · {meta.date}
              </p>
            )}
          </div>

          {/* Actions: wrappen auf Mobile */}
          <div className="flex items-center gap-2 flex-wrap lg:flex-nowrap lg:flex-shrink-0">
            {/* Tone pill group */}
            <div className="flex bg-side rounded-chip p-0.5 border border-border-light">
              {TONES.map(({ key, labelKey }) => {
                const hasCache = !!letterVariants[key];
                return (
                  <button
                    key={key}
                    onClick={() => handleToneChange(key)}
                    disabled={isRewriting || isChangingLanguage}
                    aria-pressed={selectedTone === key}
                    title={hasCache ? t("toneCachedHint") : t("toneGenerateHint")}
                    className={`px-2.5 md:px-3 py-1 text-[12px] font-semibold rounded-chip transition-colors flex items-center gap-1
                      ${selectedTone === key
                        ? "bg-white text-text shadow-nav"
                        : "text-sub hover:text-text"
                      }`}
                  >
                    {t(labelKey)}
                    {hasCache && selectedTone !== key && (
                      <span className="w-1 h-1 rounded-full bg-acc" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="hidden md:block w-px h-5 bg-border mx-1" />

            <button onClick={handleCopy} className="btn-secondary-sm" disabled={isRewriting}>
              {isCopied ? `✓ ${t("copied")}` : t("copyText")}
            </button>
            <button
              onClick={async () => {
                setIsPdfLoading(true);
                try {
                  await exportLetterAsPdf({ letter: editableLetter, parsedJob, language: selectedLetterLanguage, companyAddress, cv });
                } finally { setIsPdfLoading(false); }
              }}
              className="btn-secondary-sm"
              disabled={isPdfLoading || isRewriting}
            >
              PDF
            </button>
            <button
              onClick={() => exportLetterAsWord({ letter: editableLetter, parsedJob, language: selectedLetterLanguage, companyAddress, cv })}
              className="btn-secondary-sm"
              disabled={isRewriting}
            >
              Word
            </button>
            <button onClick={handleNew} className="btn-primary-sm">
              + {t("newApplication")}
            </button>
          </div>
        </div>

        {rewriteError && <div role="alert" className="flex items-center justify-between gap-3 px-4 md:px-6 py-3 text-[13px] text-s-err-text bg-red-50">
          <p>{rewriteError}</p>
          <button type="button" className="underline flex-shrink-0" onClick={() => setRewriteError(null)}>{t("dismissError")}</button>
        </div>}

        {/* ── Main area (stackt unter lg) ──
            Wichtig: overflow-hidden + overflow-y-auto NUR auf Desktop. Auf
            Mobile soll die ganze Seite scrollen, nicht jede Spalte für sich
            — sonst wird der Editor in einen winzigen internen Scroll-Bereich
            geclippt. */}
        <div className="flex-1 flex flex-col lg:flex-row lg:overflow-hidden">
          {/* Letter stage
              - Desktop: floating-paper auf beigem Hintergrund (#ECE7DD)
              - Mobile: flach, ohne floating-paper-Rand (frisst sonst Breite) */}
          <div
            className="flex-1 flex items-start justify-center lg:overflow-y-auto lg:py-10 lg:px-6 bg-paper lg:bg-[#ECE7DD]"
          >
            <div
              className="w-full relative lg:rounded-card lg:shadow-paper"
              style={{ maxWidth: 580, background: "#FFFDF8" }}
            >
              {isRewriting && <SkeletonOverlay label={t("toneUpdating")} />}
              {isChangingLanguage && <SkeletonOverlay label={t("languageUpdating")} />}

              {/* ── Briefkopf (Schweizer Standardformat, alle Felder editierbar) ── */}
              <div className="px-6 md:px-12 pt-8 md:pt-12 pb-2">
                {/* Absender oben rechts (read-only — kommt aus CV-Profil) */}
                {sender.length > 0 && (
                  <div className="text-right mb-8 md:mb-10 leading-[1.5]">
                    {sender.map((line, i) => (
                      <p key={i} className="text-[11px] text-sub">
                        {line}
                      </p>
                    ))}
                  </div>
                )}

                {/* Empfänger (links) — editierbar */}
                <div className="mb-6 md:mb-8 min-h-[48px]">
                  <EditableRecipient
                    lines={recipient}
                    emptyPlaceholder={t("recipientPlaceholder")}
                    ariaLabel={t("editRecipientLabel")}
                    editHint={t("editRecipientHint")}
                    disabled={isRewriting || isChangingLanguage}
                    onSave={(raw) => {
                      // Wir extrahieren die Firma (erste Zeile, falls passt)
                      // und behandeln den Rest als Adresse. Pragmatisch: alles
                      // in companyAddress speichern, parsedJob.company bleibt.
                      // recipientLines() vereint sie wieder bei der Anzeige.
                      const newLines = parseAddressLines(raw);
                      // Wenn die erste Zeile dem aktuellen Firmenname gleicht,
                      // speichern wir nur den Rest in companyAddress.
                      const firma = (parsedJob?.company ?? "").trim().toLowerCase();
                      const rest =
                        newLines[0]?.toLowerCase() === firma
                          ? newLines.slice(1)
                          : newLines;
                      setCompanyAddress(rest.join("\n"));
                    }}
                  />
                </div>

                {/* Ort, Datum (rechts) — editierbar */}
                <div className="mb-4 md:mb-6">
                  <EditableDate
                    value={dateLine}
                    ariaLabel={t("editDateLabel")}
                    disabled={isRewriting || isChangingLanguage}
                    onSave={(v) => setCustomDateLine(v)}
                  />
                </div>

                {/* Trennlinie + Betreff */}
                <div className="border-t border-acc-mid pt-4 mb-2">
                  <p className="font-serif font-semibold text-[14px] text-acc leading-snug">
                    {meta.subject}
                  </p>
                </div>
              </div>

              {/* Editable letter body — auto-grow, kein interner Scrollbar */}
              <AutoGrowTextarea
                value={editableLetter}
                onChange={(e) => handleEdit(e.target.value)}
                className="w-full bg-transparent outline-none font-letter text-text px-6 md:px-12 pt-4 pb-8 focus:bg-acc-light/10 transition-colors"
                minHeight={320}
                disabled={isRewriting || isChangingLanguage}
                aria-label={t("editLetterLabel")}
              />

              {/* Bottom row: word-count + save status */}
              <div className="flex items-center justify-between gap-2 px-6 md:px-12 pb-8 text-[11px] text-sub2">
                <span title={t("charactersCount", { count: editableLetter.length })}>
                  {t("wordCount", { count: wordCount })}
                </span>
                <SaveStatus state={saveStatus} missing={saveMissing} onRetry={retrySave} />
              </div>
            </div>
          </div>

          {/* ── Sidebar (rechts auf Desktop, unten auf Mobile als 2-Col-Grid) ── */}
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4 p-4 lg:overflow-y-auto border-t lg:border-t-0 lg:border-l border-border-light bg-bg lg:flex-shrink-0 lg:w-[240px]"
          >
            {/* Match score */}
            <div className="card p-4 text-center">
              <p className="section-label mb-2">{t("matchTitle")}</p>
              <p
                className="font-serif font-semibold leading-none mb-3"
                style={{ fontSize: 36, color: "#2D5A3D" }}
              >
                {displayScore}
              </p>
              {matchScore == null && <p className="text-[11px] text-sub2">{t("matchUnavailable")}</p>}
              {matchScore != null && (
                <>
                  <div className="w-full h-[5px] bg-border rounded-full overflow-hidden mb-3">
                    <div
                      className="h-full bg-acc rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(Math.max(matchScore, 0), 100)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-sub2 leading-snug">
                    {t("matchDescription")}
                  </p>
                </>
              )}
            </div>

            {/* Language */}
            <div className="card p-4">
              <p className="section-label mb-2">{t("languageLabel")}</p>
              <select
                value={selectedLetterLanguage}
                aria-label={t("languageLabel")}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="field text-[13px]"
                disabled={isRewriting || isChangingLanguage}
              >
                {LETTER_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Keywords */}
            {keywords.length > 0 && (
              <div className="card p-4">
                <p className="section-label mb-3">{t("keywords")}</p>
                <ul className="space-y-1.5">
                  {keywords.slice(0, 8).map((kw) => (
                    <li key={kw} className="flex items-start gap-2 text-[13px] text-sub">
                      <span className="text-acc mt-0.5 text-[10px]">●</span>
                      {kw}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Komplett neu generieren — nur aktuelle Variante.
                Span über beide Spalten im mobilen 2-Col-Grid. */}
            <button
              onClick={() => router.push("/apply/generating?mode=regenerate")}
              className="btn-secondary w-full text-[13px] sm:col-span-2 lg:col-span-1"
              disabled={isRewriting || isChangingLanguage}
              title={t("regenerateTone", { tone: activeToneLabel })}
            >
              ↺ {t("regenerateTone", { tone: activeToneLabel })}
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default function ResultPage() {
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
      <ResultPageContent />
    </Suspense>
  );
}

