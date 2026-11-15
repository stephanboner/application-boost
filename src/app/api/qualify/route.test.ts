import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ApiErrorResponse } from "@/lib/api-helpers";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), match: vi.fn(), quota: vi.fn() }));
vi.mock("@/lib/api-helpers", async (original) => ({
  ...await original<typeof import("@/lib/api-helpers")>(), requireAuth: mocks.auth,
  loadUserCV: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/lib/cv-matching", () => ({ assessCVWithJob: mocks.match }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: mocks.quota }));
import { POST } from "./route";
const request = () => new NextRequest("https://example.com/api/qualify", {
  method: "POST", body: JSON.stringify({ jobData: { title: "IT", company: "Test" } }),
});
describe("matching API", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user: { id: "user" }, supabase: {} }); mocks.quota.mockResolvedValue(undefined); });
  it("returns the actual provider failure with a request reference", async () => {
    mocks.match.mockRejectedValue(new ApiErrorResponse("Abgleich-Antwort wurde abgeschnitten", 502, "AI_OUTPUT_LIMIT"));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Abgleich-Antwort wurde abgeschnitten", code: "AI_OUTPUT_LIMIT" });
    expect(response.headers.get("X-Request-ID")).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("returns a successful assessment", async () => {
    const match = { topMatches: ["IT"], gaps: [], keywords: ["IT"], matchScore: 75 };
    mocks.match.mockResolvedValue(match);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, match, matchStatus: "available" });
  });
  it("preserves budget errors and retry information", async () => {
    mocks.match.mockRejectedValue(new ApiErrorResponse("Tageslimit", 429, "RATE_LIMIT", 100));
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("100");
  });
});
