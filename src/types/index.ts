// ============================================================
// BewerbungsBoost – Zentrale TypeScript-Typen
// ============================================================

// --- CV / Lebenslauf ---

export interface WorkExperience {
  id: string;
  jobTitle: string;
  employer: string;
  duration: string; // z.B. "2020–heute" oder "Jan 2018 – Dez 2019"
  description?: string;
}

export interface Education {
  id: string;
  degree: string;
  institution: string;
  duration: string;
}

export interface Language {
  id: string;
  name: string;
  level: "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | "native";
}

export interface CVProfile {
  userId: string;
  firstName: string;
  lastName: string;
  phone?: string;
  location: string;
  workExperience: WorkExperience[];
  education: Education[];
  skills: string[]; // Freitext-Array
  languages: Language[];
  hasCv: boolean;
  cvSource: "pdf" | "manual";
  language: string; // Bevorzugte App-Sprache
  updatedAt?: string;
}

// --- Job-Parsing ---

export type JobTone = "formal" | "casual" | "startup";

export interface ParsedJob {
  title: string;
  company: string;
  industry?: string;
  location?: string;
  tasks: string[]; // max. 5 Kernaufgaben
  mustHave: string[]; // Pflichtanforderungen
  niceToHave: string[]; // Wünschenswert
  tone: JobTone;
  language: string; // z.B. "de", "fr", "it"
  contactPerson?: string;
  address?: string; // Company address for letter header (street, zip, city)
  rawText?: string; // Originaltext (für Debugging)
}

export interface JobParseRequest {
  type: "url" | "text";
  content: string; // URL oder Text
}

export interface JobParseResponse {
  success: boolean;
  job?: ParsedJob;
  error?: string;
  fromCache?: boolean;
}

// --- CV-Matching (intern, nie direkt dem Nutzer gezeigt) ---

export interface CVMatchResult {
  topMatches: string[]; // Top-3 Übereinstimmungen
  gaps: string[]; // Lücken
  keywords: string[]; // Keywords aus Stelleninserat
  matchScore: number | null; // null: no reliable assessment available
}

export interface QualifyAnswer {
  requirement: string;
  answer: string; // User's clarification (empty = not applicable)
}

// --- Generierung ---

export type LetterTone = "formal" | "balanced" | "personal";
export type LetterLength = "short" | "standard" | "long";
export type LetterLanguage = "de" | "fr" | "it" | "en" | "rm" | "uk" | "sr" | "sq" | "hr" | "pt" | "es";

export interface GenerateRequest {
  jobData: ParsedJob;
  tone?: LetterTone;
  length?: LetterLength;
  contactPerson?: string;
  letterLanguage?: LetterLanguage;
  feedback?: string; // Für Nachbesserungs-Prompts
  qualifyAnswers?: QualifyAnswer[];
  companyAddress?: string;
}

export interface GenerateResponse {
  success: boolean;
  letter?: string;
  keywords?: string[];
  matchScore?: number;
  error?: string;
}

// --- Bewerbungsverlauf ---

export interface Application {
  id: string;
  userId: string;
  jobTitle: string;
  company: string;
  letter: string; // Entschlüsselter Text
  tone: LetterTone;
  language: string;
  wordCount?: number;
  isExported: boolean;
  createdAt: string;
  updatedAt: string;
}

// --- Zustand (Zustand-Store) ---

export interface ApplicationFlowState {
  // Schritt-Tracking
  currentStep: "job-input" | "generating" | "result";

  // Job-Daten
  jobInput: JobParseRequest | null;
  parsedJob: ParsedJob | null;
  isParsingJob: boolean;
  parseError: string | null;

  // Generierung
  isGenerating: boolean;
  generationProgress: 0 | 1 | 2 | 3 | 4; // 0=idle, 1-4=Schritte
  streamingText: string; // Partieller Output während Streaming
  generateError: string | null;

  // Ergebnis
  letter: string | null;
  letterVariants: Partial<Record<LetterTone, string>>;
  keywords: string[];
  matchScore: number | null;
  selectedTone: LetterTone;
  selectedLength: LetterLength;
  selectedLetterLanguage: LetterLanguage;
  contactPerson: string;
  qualifyAnswers: QualifyAnswer[];
  companyAddress: string;
  /**
   * Vom User überschriebene Datumszeile (z.B. "Chur, 21. Mai 2026").
   * Wenn null → wird automatisch aus heute + CV.location berechnet.
   */
  customDateLine: string | null;
  currentApplicationId: string | null;

  // Aktionen
  setJobInput: (input: JobParseRequest) => void;
  setParsedJob: (job: ParsedJob) => void;
  /**
   * Setzt einen neuen Job und verwirft ALLE Daten der vorherigen Bewerbung
   * (Ansprechperson, Firmenadresse, Brief, Varianten, Match-Score etc.).
   * Aufrufen wenn der User explizit eine neue Stelle analysiert.
   */
  startNewJob: (job: ParsedJob) => void;
  setIsParsingJob: (v: boolean) => void;
  setParseError: (err: string | null) => void;
  setIsGenerating: (v: boolean) => void;
  setGenerationProgress: (step: 0 | 1 | 2 | 3 | 4) => void;
  appendStreamingText: (chunk: string) => void;
  resetStreaming: () => void;
  setGenerateError: (err: string | null) => void;
  setLetter: (letter: string) => void;
  setVariant: (tone: LetterTone, content: string) => void;
  clearVariants: () => void;
  setKeywords: (kw: string[]) => void;
  setMatchScore: (score: number | null) => void;
  setTone: (tone: LetterTone) => void;
  setLength: (length: LetterLength) => void;
  setLetterLanguage: (lang: LetterLanguage) => void;
  setContactPerson: (name: string) => void;
  setQualifyAnswers: (answers: QualifyAnswer[]) => void;
  setCompanyAddress: (address: string) => void;
  setCustomDateLine: (line: string | null) => void;
  setCurrentApplicationId: (id: string | null) => void;
  loadSavedApplication: (application: Application) => void;
  reset: () => void;
}

// --- API-Fehler ---

export type AIErrorCode = "AI_CONFIGURATION" | "AI_BILLING" | "AI_MODEL_UNAVAILABLE" | "AI_REQUEST_REJECTED"
  | "AI_PROVIDER_LIMIT" | "AI_PROVIDER_UNAVAILABLE" | "AI_TIMEOUT" | "AI_OUTPUT_LIMIT"
  | "AI_REFUSAL" | "AI_INCOMPLETE" | "AI_EMPTY_OUTPUT" | "AI_INVALID_JSON" | "AI_INVALID_JOB_DATA" | "AI_INVALID_OUTPUT" | "AI_UNKNOWN";

export interface ApiError {
  error: string;
  code?: "RATE_LIMIT" | "UNAUTHORIZED" | "NOT_FOUND" | "SERVER_ERROR" | "VALIDATION_ERROR" | AIErrorCode;
  retryAfter?: number; // Sekunden bis nächster Versuch möglich
}

