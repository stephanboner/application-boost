import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { getLanguageOption } from "@/lib/constants";
import type { ApplicationFlowState, LetterTone, LetterLength, LetterLanguage, JobParseRequest, ParsedJob, QualifyAnswer } from "@/types";

type Variants = Partial<Record<LetterTone, string>>;

// ============================================================
// Zustand Store – Bewerbungs-Flow
// Persistiert im SessionStorage dieses Tabs; wird beim Abmelden gelöscht.
// ============================================================

const initialState = {
  currentStep: "job-input" as const,
  jobInput: null,
  parsedJob: null,
  isParsingJob: false,
  parseError: null,
  isGenerating: false,
  generationProgress: 0 as const,
  streamingText: "",
  generateError: null,
  letter: null,
  letterVariants: {} as Variants,
  keywords: [] as string[],
  matchScore: null as number | null,
  selectedTone: "balanced" as LetterTone,
  selectedLength: "standard" as LetterLength,
  selectedLetterLanguage: "de" as LetterLanguage,
  contactPerson: "",
  qualifyAnswers: [] as QualifyAnswer[],
  companyAddress: "",
  customDateLine: null as string | null,
  currentApplicationId: null,
};

export const useApplicationStore = create<ApplicationFlowState>()(
  persist(
    (set) => ({
      ...initialState,

      setJobInput: (input: JobParseRequest) =>
        set({ jobInput: input, parseError: null }),

      setParsedJob: (job: ParsedJob) =>
        set({ parsedJob: job, currentStep: "job-input" }),

      /**
       * Neuer Job → alle Felder der alten Bewerbung verwerfen.
       * Damit z.B. nicht Ansprechperson oder Firmenadresse vom alten Job
       * in die neue Qualify-Page leakt.
       * Behält nur User-Präferenzen (Tone, Sprache, Length).
       */
      startNewJob: (job: ParsedJob) =>
        set({
          parsedJob: job,
          currentStep: "job-input",
          // Job-spezifische Felder zurücksetzen:
          contactPerson: "",
          companyAddress: "",
          customDateLine: null,
          qualifyAnswers: [],
          letter: null,
          letterVariants: {},
          keywords: [],
          matchScore: null,
          currentApplicationId: null,
          streamingText: "",
          generateError: null,
          isGenerating: false,
          generationProgress: 0,
        }),

      setIsParsingJob: (v: boolean) => set({ isParsingJob: v }),

      setParseError: (err: string | null) => set({ parseError: err }),

      setIsGenerating: (v: boolean) =>
        set({ isGenerating: v, currentStep: v ? "generating" : "result" }),

      setGenerationProgress: (step: 0 | 1 | 2 | 3 | 4) =>
        set({ generationProgress: step }),

      appendStreamingText: (chunk: string) =>
        set((state) => ({ streamingText: state.streamingText + chunk })),

      resetStreaming: () => set({ streamingText: "", generationProgress: 0 }),

      setGenerateError: (err: string | null) =>
        set({ generateError: err, isGenerating: false }),

      setLetter: (letter: string) =>
        set({ letter, currentStep: "result", isGenerating: false }),

      setVariant: (tone: LetterTone, content: string) =>
        set((state) => ({
          letterVariants: { ...state.letterVariants, [tone]: content },
        })),

      clearVariants: () => set({ letterVariants: {} }),

      setKeywords: (kw: string[]) => set({ keywords: kw }),

      setMatchScore: (score: number | null) => set({ matchScore: score }),

      setTone: (tone: LetterTone) => set({ selectedTone: tone }),

      setLength: (length: LetterLength) => set({ selectedLength: length }),

      setLetterLanguage: (lang: LetterLanguage) => set({ selectedLetterLanguage: lang }),

      setContactPerson: (name: string) => set({ contactPerson: name }),

      setQualifyAnswers: (answers: QualifyAnswer[]) => set({ qualifyAnswers: answers }),
      setCompanyAddress: (address: string) => set({ companyAddress: address }),
      setCustomDateLine: (line: string | null) => set({ customDateLine: line }),

      setCurrentApplicationId: (id: string | null) =>
        set({ currentApplicationId: id }),

      // Replace the complete document together, including its variants and
      // language. Nothing from the previously opened application may carry over.
      loadSavedApplication: (application) =>
        set((state) => ({
          ...initialState,
          selectedLength: state.selectedLength,
          currentStep: "result",
          currentApplicationId: application.id,
          letter: application.letter,
          letterVariants: { [application.tone]: application.letter },
          selectedTone: application.tone,
          selectedLetterLanguage: getLanguageOption(application.language)?.code ?? "de",
          parsedJob: {
            title: application.jobTitle,
            company: application.company,
            tasks: [], mustHave: [], niceToHave: [],
            tone: "formal", language: application.language,
          },
        })),

      reset: () => set(initialState),
    }),
    {
      name: "bewerbungsboost-flow",
      version: 1,
      // Earlier releases could persist a fabricated fallback score. Preserve
      // the draft, but require a fresh assessment after this upgrade.
      migrate: (persisted) => ({
        ...(persisted as Partial<ApplicationFlowState>),
        matchScore: null,
      }),
      // SessionStorage: bleibt im Tab, wird beim Schliessen gelöscht
      storage: createJSONStorage(() =>
        typeof window !== "undefined"
          ? sessionStorage
          : {
              getItem: () => null,
              setItem: () => {},
              removeItem: () => {},
            }
      ),
      // Bewerbungsentwurf im aktuellen Tab halten; enthält persönlichen Text.
      partialize: (state) => ({
        currentStep: state.currentStep,
        parsedJob: state.parsedJob,
        letter: state.letter,
        letterVariants: state.letterVariants,
        keywords: state.keywords,
        matchScore: state.matchScore,
        selectedTone: state.selectedTone,
        selectedLength: state.selectedLength,
        selectedLetterLanguage: state.selectedLetterLanguage,
        contactPerson: state.contactPerson,
        qualifyAnswers: state.qualifyAnswers,
        companyAddress: state.companyAddress,
        customDateLine: state.customDateLine,
        currentApplicationId: state.currentApplicationId,
      }),
    }
  )
);

