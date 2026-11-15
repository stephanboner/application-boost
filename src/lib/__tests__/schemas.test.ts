import { describe, it, expect } from "vitest";
import {
  cvProfileSchema,
  generateRequestSchema,
  regenerateRequestSchema,
  jobParseRequestSchema,
  parsedJobSchema,
} from "../schemas";

describe("cvProfileSchema", () => {
  it("accepts minimal valid input and applies defaults", () => {
    const result = cvProfileSchema.parse({
      firstName: "Maria",
      lastName: "Muster",
      location: "Chur",
    });
    expect(result.workExperience).toEqual([]);
    expect(result.languages).toEqual([]);
    expect(result.cvSource).toBe("manual");
    expect(result.language).toBe("de");
  });

  it("rejects missing firstName", () => {
    expect(() =>
      cvProfileSchema.parse({ lastName: "Muster", location: "Chur" })
    ).toThrow();
  });

  it("rejects invalid language level", () => {
    expect(() =>
      cvProfileSchema.parse({
        firstName: "X",
        lastName: "Y",
        location: "Z",
        languages: [{ id: "1", name: "DE", level: "Z9" }],
      })
    ).toThrow();
  });
});

describe("generateRequestSchema", () => {
  const baseJob = { title: "Dev", company: "Acme" };

  it("applies defaults for optional fields", () => {
    const r = generateRequestSchema.parse({ jobData: baseJob });
    expect(r.tone).toBe("balanced");
    expect(r.length).toBe("standard");
    expect(r.letterLanguage).toBe("de");
    expect(r.qualifyAnswers).toEqual([]);
    expect(r.companyAddress).toBe("");
  });

  it("rejects invalid letterLanguage", () => {
    expect(() =>
      generateRequestSchema.parse({ jobData: baseJob, letterLanguage: "xx" })
    ).toThrow();
  });
});

describe("regenerateRequestSchema", () => {
  it("accepts type=tone with newTone", () => {
    expect(() =>
      regenerateRequestSchema.parse({
        type: "tone",
        content: "Brief",
        newTone: "formal",
      })
    ).not.toThrow();
  });

  it("rejects type=tone without newTone", () => {
    expect(() =>
      regenerateRequestSchema.parse({ type: "tone", content: "Brief" })
    ).toThrow();
  });

  it("rejects type=section without context", () => {
    expect(() =>
      regenerateRequestSchema.parse({ type: "section", content: "Brief" })
    ).toThrow();
  });

  it("accepts type=language with newLanguage", () => {
    expect(() =>
      regenerateRequestSchema.parse({
        type: "language",
        content: "Brief",
        newLanguage: "fr",
      })
    ).not.toThrow();
  });
});

describe("parsedJobSchema (Claude-Job-Parser output)", () => {
  // Claude liefert oft `null` für fehlende Werte. Schema muss tolerant sein.
  it("accepts null for optional string fields (industry/location/contactPerson/address)", () => {
    const result = parsedJobSchema.parse({
      title: "Sachbearbeiterin",
      company: "Gemeinde X",
      industry: null,
      location: null,
      contactPerson: null,
      address: null,
    });
    expect(result.industry).toBeUndefined();
    expect(result.location).toBeUndefined();
    expect(result.contactPerson).toBeUndefined();
    expect(result.address).toBeUndefined();
  });

  it("accepts null for tone/language (falls back to defaults)", () => {
    const result = parsedJobSchema.parse({
      title: "Dev",
      company: "Acme",
      tone: null,
      language: null,
    });
    expect(result.tone).toBe("formal");
    expect(result.language).toBe("de");
  });

  it("accepts null for array fields (tasks/mustHave/niceToHave)", () => {
    const result = parsedJobSchema.parse({
      title: "Dev",
      company: "Acme",
      tasks: null,
      mustHave: null,
      niceToHave: null,
    });
    expect(result.tasks).toEqual([]);
    expect(result.mustHave).toEqual([]);
    expect(result.niceToHave).toEqual([]);
  });

  it("still rejects missing title or company", () => {
    expect(() => parsedJobSchema.parse({ company: "Acme" })).toThrow();
    expect(() => parsedJobSchema.parse({ title: "Dev" })).toThrow();
  });
});

describe("jobParseRequestSchema", () => {
  it("trims and rejects short content", () => {
    expect(() => jobParseRequestSchema.parse({ type: "url", content: "  short  " })).toThrow();
  });

  it("accepts URL payload", () => {
    const r = jobParseRequestSchema.parse({
      type: "url",
      content: "https://example.com/stelle/1234",
    });
    expect(r.type).toBe("url");
  });
});
