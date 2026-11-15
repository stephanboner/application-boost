import { JOB_TEXT_LIMIT } from "@/lib/job-text";
// ============================================================
// Zod-Schemas für API-Inputs
// Single Source of Truth für Validierung an den Systemgrenzen
// ============================================================

import { z } from "zod";
import { LETTER_LANGUAGES, LANGUAGE_LEVELS } from "@/lib/constants";

const LANGUAGE_CODES = LETTER_LANGUAGES.map((l) => l.code) as [string, ...string[]];

export const letterToneSchema = z.enum(["formal", "balanced", "personal"]);
export const letterLengthSchema = z.enum(["short", "standard", "long"]);
export const letterLanguageSchema = z.enum(LANGUAGE_CODES);
export const jobToneSchema = z.enum(["formal", "casual", "startup"]);
export const languageLevelSchema = z.enum(LANGUAGE_LEVELS);

// --- CV (PUT /api/cv) ---

const workExperienceSchema = z.object({
  id: z.string().max(100),
  jobTitle: z.string().min(1).max(300),
  employer: z.string().min(1).max(300),
  duration: z.string().max(100),
  description: z.string().max(3000).optional(),
});

const educationSchema = z.object({
  id: z.string().max(100),
  degree: z.string().min(1).max(300),
  institution: z.string().max(300),
  duration: z.string().max(100),
});

const languageEntrySchema = z.object({
  id: z.string().max(100),
  name: z.string().min(1).max(100),
  level: languageLevelSchema,
});

export const cvProfileSchema = z.object({
  firstName: z.string().min(1, "Vorname ist pflicht").max(100),
  lastName: z.string().min(1, "Nachname ist pflicht").max(100),
  phone: z.string().max(100).optional().default(""),
  location: z.string().min(1, "Ort ist pflicht").max(300),
  workExperience: z.array(workExperienceSchema).max(50).default([]),
  education: z.array(educationSchema).max(50).default([]),
  skills: z.array(z.string().max(200)).max(100).default([]),
  languages: z.array(languageEntrySchema).max(50).default([]),
  cvSource: z.enum(["pdf", "manual"]).optional().default("manual"),
  language: z.string().max(20).optional().default("de"),
});

// Imports may be incomplete. The user reviews them before the stricter save.
const importText = (max: number) => z.string().max(max).nullish().transform((value) => value ?? "");
export const cvImportSchema = cvProfileSchema.extend({
  firstName: importText(100),
  lastName: importText(100),
  phone: importText(100),
  location: importText(300),
  workExperience: z.array(workExperienceSchema.extend({
    jobTitle: importText(300), employer: importText(300), duration: importText(100),
    description: importText(3000),
  })).max(50).default([]),
  education: z.array(educationSchema.extend({
    degree: importText(300), institution: importText(300), duration: importText(100),
  })).max(50).default([]),
  cvSource: z.literal("pdf").default("pdf"),
}).refine((cv) => !!(cv.firstName || cv.lastName || cv.workExperience.length || cv.education.length),
  "Keine Lebenslaufdaten gefunden");

export const cvMatchSchema = z.object({
  topMatches: z.array(z.string().min(1).max(1000)).max(20),
  gaps: z.array(z.string().min(1).max(1000)).max(20),
  keywords: z.array(z.string().min(1).max(200)).max(30),
  matchScore: z.number().finite().min(0).max(100),
});

// --- Parsed Job (verwendet in /qualify und /generate) ---

// Hilfs-Helper: optionaler String, der auch null/leere Werte akzeptiert
const optionalString = z.preprocess(
  (v) => (v == null || v === "" ? undefined : v),
  z.string().max(6000).optional()
);

export const parsedJobSchema = z.object({
  title: z.string().min(1).max(300),
  company: z.string().min(1).max(300),
  industry: optionalString,
  location: optionalString,
  tasks: z.array(z.string().max(1000)).max(30).nullish().transform((v) => v ?? []),
  mustHave: z.array(z.string().max(1000)).max(50).nullish().transform((v) => v ?? []),
  niceToHave: z.array(z.string().max(1000)).max(50).nullish().transform((v) => v ?? []),
  tone: z.preprocess(
    (v) => (typeof v === "string" ? v.toLowerCase() : v == null ? undefined : v),
    jobToneSchema.default("formal")
  ),
  language: z.preprocess(
    (v) => (typeof v === "string" ? v.toLowerCase() : v == null ? undefined : v),
    z.string().max(20).default("de")
  ),
  contactPerson: optionalString,
  address: optionalString,
  rawText: z.string().max(JOB_TEXT_LIMIT).nullish().transform((v) => v || undefined),
});

// --- POST /api/parse-job ---

export const jobParseRequestSchema = z.object({
  type: z.enum(["url", "text"]),
  content: z.string().trim().min(10, "Inhalt zu kurz").max(50_000),
});

// --- POST /api/qualify ---

export const qualifyRequestSchema = z.object({
  jobData: parsedJobSchema,
});

// --- POST /api/generate ---

const qualifyAnswerSchema = z.object({
  requirement: z.string().max(1000),
  answer: z.string().max(3000),
});

export const generateRequestSchema = z.object({
  jobData: parsedJobSchema,
  tone: letterToneSchema.default("balanced"),
  length: letterLengthSchema.default("standard"),
  contactPerson: z.string().max(300).optional(),
  letterLanguage: letterLanguageSchema.default("de"),
  qualifyAnswers: z.array(qualifyAnswerSchema).max(50).default([]),
  companyAddress: z.string().max(1000).default(""),
  // Bei Regenerate: bestehende Application updaten statt neu anlegen
  applicationId: z.string().uuid().optional(),
});

// --- POST /api/regenerate ---

export const regenerateRequestSchema = z
  .object({
    type: z.enum(["section", "tone", "language"]),
    content: z.string().min(1, "Inhalt fehlt").max(20_000),
    feedback: z.string().max(3000).optional(),
    newTone: letterToneSchema.optional(),
    newLanguage: letterLanguageSchema.optional(),
    context: z
      .object({
        jobTitle: z.string(),
        company: z.string(),
        tone: letterToneSchema,
      })
      .optional(),
  })
  .refine(
    (d) =>
      (d.type === "section" && !!d.context) ||
      (d.type === "tone" && !!d.newTone) ||
      (d.type === "language" && !!d.newLanguage),
    { message: "Ungültiger Typ oder fehlende Parameter" }
  );

export type CVProfileInput = z.infer<typeof cvProfileSchema>;
export type GenerateRequestInput = z.infer<typeof generateRequestSchema>;
export type RegenerateRequestInput = z.infer<typeof regenerateRequestSchema>;
export type JobParseRequestInput = z.infer<typeof jobParseRequestSchema>;
export type QualifyRequestInput = z.infer<typeof qualifyRequestSchema>;

