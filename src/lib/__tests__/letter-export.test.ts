import { describe, it, expect } from "vitest";
import { buildLetterMeta } from "../letter-export";

describe("buildLetterMeta", () => {
  const job = { title: "Data Engineer", company: "Acme AG" };

  it("uses the German prefix by default", () => {
    const meta = buildLetterMeta(job, "de");
    expect(meta.subject).toBe("Bewerbung als Data Engineer – Acme AG");
  });

  it.each([
    ["fr", "Candidature pour"],
    ["it", "Candidatura per"],
    ["en", "Application for"],
    ["pt", "Candidatura para"],
    ["es", "Solicitud para"],
  ])("uses the %s prefix", (lang, prefix) => {
    const meta = buildLetterMeta(job, lang);
    expect(meta.subject.startsWith(prefix)).toBe(true);
  });

  it("falls back to a generic subject without job", () => {
    const meta = buildLetterMeta(null, "de");
    expect(meta.subject).toBe("Bewerbungsschreiben");
  });

  it("uses an unknown language's fallback prefix", () => {
    const meta = buildLetterMeta(job, "zz");
    expect(meta.subject.startsWith("Bewerbung als")).toBe(true);
  });

  it("formats a date string", () => {
    const meta = buildLetterMeta(job, "de");
    // "22. April 2026" o.ä. – nur Grundsanität
    expect(meta.date).toMatch(/\d{4}/);
  });
});
