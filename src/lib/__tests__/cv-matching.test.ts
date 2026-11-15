import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CVProfile, ParsedJob } from "@/types";
import { ApiErrorResponse } from "@/lib/api-helpers";

const mocks = vi.hoisted(() => ({ ai: vi.fn() }));
vi.mock("@/lib/anthropic", () => ({ callClaude: mocks.ai, AI_CONFIG: { cvMatcher: {} } }));
import { assessCVWithJob, matchCVWithJob } from "../cv-matching";

const cv: CVProfile = {
  userId: "test-user", firstName: "Test", lastName: "Muster", location: "Chur",
  workExperience: [], education: [], skills: [], languages: [], hasCv: true,
  cvSource: "manual", language: "de",
};
const job: ParsedJob = { title: "Teststelle", company: "Testfirma", tasks: [], mustHave: [], niceToHave: [], tone: "formal", language: "de" };

describe("optional CV assessment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a validated assessment when the AI succeeds", async () => {
    const match = { topMatches: [], gaps: [], keywords: [], matchScore: 75 };
    mocks.ai.mockResolvedValue(JSON.stringify(match));
    expect(await matchCVWithJob(cv, job)).toEqual(match);
  });

  it.each(["AI_TIMEOUT", "AI_OUTPUT_LIMIT"] as const)("continues without a fabricated score after %s", async (code) => {
    mocks.ai.mockRejectedValue(new ApiErrorResponse("Kein verwertbarer Abgleich", 503, code));
    expect(await matchCVWithJob(cv, job)).toBeNull();
  });

  it("preserves provider errors for a requested assessment", async () => {
    const failure = new ApiErrorResponse("Anbieter nicht erreichbar", 503, "AI_PROVIDER_UNAVAILABLE");
    mocks.ai.mockRejectedValue(failure);
    await expect(assessCVWithJob(cv, job)).rejects.toBe(failure);
  });

  it("classifies malformed assessments without exposing output", async () => {
    mocks.ai.mockResolvedValue('{"private":"PRIVATE_CV"}');
    await expect(assessCVWithJob(cv, job)).rejects.toMatchObject({ code: "AI_INVALID_OUTPUT", status: 502 });
    expect(await matchCVWithJob(cv, job)).toBeNull();
  });

  it.each([
    ["RATE_LIMIT", 429],
    ["SERVER_ERROR", 503],
  ] as const)("preserves the budget/admission failure %s", async (code, status) => {
    const failure = new ApiErrorResponse("KI-Kontingent nicht verfügbar", status, code, 60);
    mocks.ai.mockRejectedValue(failure);
    await expect(matchCVWithJob(cv, job)).rejects.toBe(failure);
  });
});
