// ============================================================
// Zentrale Konstanten für Sprachen, Töne, Längen
// Single Source of Truth – wird von Frontend, API und Prompts gelesen
// ============================================================

import type { LetterLanguage, LetterTone, LetterLength } from "@/types";

export interface LanguageOption {
  code: LetterLanguage;
  label: string;       // Native Selbstbezeichnung (für UI-Selectors)
  flag: string;        // Emoji-Flag
  fullName: string;    // Vollname für Prompts, z.B. "Ukrainisch (Українська)"
  salutation: string;  // Default-Anrede bei fehlendem Kontaktnamen
}

export const LETTER_LANGUAGES: readonly LanguageOption[] = [
  { code: "de", label: "Deutsch", flag: "🇩🇪", fullName: "Deutsch", salutation: "Sehr geehrte Damen und Herren" },
  { code: "fr", label: "Français", flag: "🇫🇷", fullName: "Français", salutation: "Madame, Monsieur" },
  { code: "it", label: "Italiano", flag: "🇮🇹", fullName: "Italiano", salutation: "Gentile Signora, Gentile Signore" },
  { code: "en", label: "English", flag: "🇬🇧", fullName: "English", salutation: "Dear Sir or Madam" },
  { code: "uk", label: "Українська", flag: "🇺🇦", fullName: "Ukrainisch (Українська)", salutation: "Шановні пані та панове" },
  { code: "sr", label: "Srpski", flag: "🇷🇸", fullName: "Serbisch (Srpski)", salutation: "Poštovane dame i gospodo" },
  { code: "sq", label: "Shqip", flag: "🇦🇱", fullName: "Albanisch (Shqip)", salutation: "Të nderuara zonja dhe zotërinj" },
  { code: "hr", label: "Hrvatski", flag: "🇭🇷", fullName: "Kroatisch (Hrvatski)", salutation: "Poštovane dame i gospodo" },
  { code: "pt", label: "Português", flag: "🇵🇹", fullName: "Portugiesisch (Português)", salutation: "Exma. Senhora, Exmo. Senhor" },
  { code: "es", label: "Español", flag: "🇪🇸", fullName: "Spanisch (Español)", salutation: "Estimadas señoras y estimados señores" },
  { code: "rm", label: "Rumantsch", flag: "🇨🇭", fullName: "Rumantsch", salutation: "Chara dunna, char cavalier" },
];

export function getLanguageOption(code: string): LanguageOption | undefined {
  return LETTER_LANGUAGES.find((l) => l.code === code);
}

// --- Ton-Optionen ---
export const LETTER_TONES: readonly { value: LetterTone; label: string }[] = [
  { value: "formal", label: "Formell" },
  { value: "balanced", label: "Ausgewogen" },
  { value: "personal", label: "Persönlich" },
];

// --- Längen-Optionen ---
export const LETTER_LENGTHS: readonly { value: LetterLength; approxWords: number }[] = [
  { value: "short", approxWords: 200 },
  { value: "standard", approxWords: 350 },
  { value: "long", approxWords: 500 },
];

// --- Sprach-Level (für CV-Sprachen) ---
export const LANGUAGE_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2", "native"] as const;
