import { describe, it, expect, beforeEach } from "vitest";
import { useApplicationStore } from "../application";
import type { Application, ParsedJob } from "@/types";

const jobA: ParsedJob = {
  title: "Sachbearbeiter A",
  company: "Firma A",
  tasks: [],
  mustHave: [],
  niceToHave: [],
  tone: "formal",
  language: "de",
  contactPerson: "Frau A",
  address: "Strasse 1\n7000 Chur",
};

const jobB: ParsedJob = {
  title: "Sachbearbeiter B",
  company: "Firma B",
  tasks: [],
  mustHave: [],
  niceToHave: [],
  tone: "formal",
  language: "de",
};

describe("useApplicationStore — startNewJob Reset-Verhalten", () => {
  beforeEach(() => {
    useApplicationStore.getState().reset();
  });

  it("verwirft Ansprechperson + Firmenadresse beim neuen Job", () => {
    const s = useApplicationStore.getState();

    s.startNewJob(jobA);
    s.setContactPerson("Herr Muster");
    s.setCompanyAddress("Bahnhofstrasse 5\n8000 Zürich");

    // Sanity: alte Werte sind gesetzt
    expect(useApplicationStore.getState().contactPerson).toBe("Herr Muster");
    expect(useApplicationStore.getState().companyAddress).toBe("Bahnhofstrasse 5\n8000 Zürich");

    // Neuer Job → Reset
    s.startNewJob(jobB);

    expect(useApplicationStore.getState().contactPerson).toBe("");
    expect(useApplicationStore.getState().companyAddress).toBe("");
    expect(useApplicationStore.getState().parsedJob?.title).toBe("Sachbearbeiter B");
  });

  it("verwirft Brief, Varianten und Match-Score beim neuen Job", () => {
    const s = useApplicationStore.getState();

    s.startNewJob(jobA);
    s.setLetter("Sehr geehrte Damen und Herren,\n…");
    s.setVariant("formal", "Formelle Version");
    s.setVariant("personal", "Persönliche Version");
    s.setMatchScore(85);
    s.setKeywords(["Sachbearbeitung", "MS Office"]);
    s.setCurrentApplicationId("app-123");

    // Neuer Job → alles weg
    s.startNewJob(jobB);

    const next = useApplicationStore.getState();
    expect(next.letter).toBeNull();
    expect(next.letterVariants).toEqual({});
    expect(next.matchScore).toBeNull();
    expect(next.keywords).toEqual([]);
    expect(next.currentApplicationId).toBeNull();
  });

  it("verwirft Qualify-Antworten beim neuen Job", () => {
    const s = useApplicationStore.getState();

    s.startNewJob(jobA);
    s.setQualifyAnswers([
      { requirement: "Italienisch", answer: "Habe ich gelernt." },
    ]);

    s.startNewJob(jobB);

    expect(useApplicationStore.getState().qualifyAnswers).toEqual([]);
  });

  it("behält User-Präferenzen (Tone, Sprache, Länge) beim neuen Job", () => {
    const s = useApplicationStore.getState();

    s.setTone("personal");
    s.setLetterLanguage("fr");
    s.setLength("long");

    s.startNewJob(jobA);
    s.startNewJob(jobB);

    const next = useApplicationStore.getState();
    expect(next.selectedTone).toBe("personal");
    expect(next.selectedLetterLanguage).toBe("fr");
    expect(next.selectedLength).toBe("long");
  });

  it("setParsedJob (ohne 'New') verwirft job-spezifische Felder NICHT", () => {
    // Updating job metadata alone must not discard an existing draft.
    const s = useApplicationStore.getState();

    s.setLetter("Brief aus History");
    s.setContactPerson("Frau Vorhanden");
    s.setParsedJob(jobA);

    const next = useApplicationStore.getState();
    expect(next.letter).toBe("Brief aus History");
    expect(next.contactPerson).toBe("Frau Vorhanden");
    expect(next.parsedJob?.title).toBe("Sachbearbeiter A");
  });

  it("replaces the complete document when opening a different saved application", () => {
    const s = useApplicationStore.getState();
    s.startNewJob(jobA);
    s.setLetter("Brief A");
    s.setVariant("formal", "Alte formelle Variante A");
    s.setVariant("personal", "Alte persönliche Variante A");
    s.setMatchScore(85);
    s.setKeywords(["Alt"]);
    s.setCompanyAddress("Alte Adresse");
    s.setContactPerson("Alter Kontakt");
    s.setCustomDateLine("Altes Datum");
    s.setCurrentApplicationId("application-A");
    const application: Application = { id: "application-B", userId: "own-user", jobTitle: "Stelle B",
      company: "Firma B", letter: "Lettre B", tone: "balanced", language: "fr", isExported: false,
      createdAt: "2026-10-11T12:00:00Z", updatedAt: "2026-10-11T12:00:00Z" };
    s.loadSavedApplication(application);
    const next = useApplicationStore.getState();
    expect(next.currentApplicationId).toBe("application-B");
    expect(next.letter).toBe("Lettre B");
    expect(next.letterVariants).toEqual({ balanced: "Lettre B" });
    expect(next.selectedLetterLanguage).toBe("fr");
    expect(next.currentStep).toBe("result");
    expect(next.parsedJob).toMatchObject({ title: "Stelle B", company: "Firma B" });
    expect(next.matchScore).toBeNull();
    expect(next.keywords).toEqual([]);
    expect(next.contactPerson).toBe("");
    expect(next.companyAddress).toBe("");
    expect(next.customDateLine).toBeNull();
  });
});
