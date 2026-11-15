import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import crypto from "node:crypto";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), ai: vi.fn(), fetch: vi.fn(), safe: vi.fn(), from: vi.fn(), eq: vi.fn(), one: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/api-helpers", async (original) => ({ ...await original<typeof import("@/lib/api-helpers")>(), requireAuth: mocks.auth }));
vi.mock("@/lib/anthropic", () => ({ callClaude: mocks.ai, AI_CONFIG: { jobParser: { max_tokens: 2000 } } }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn() }));
vi.mock("@/lib/url-safety", () => ({ assertSafeExternalUrl: mocks.safe }));
vi.mock("@/lib/job-content", () => ({ fetchJobContent: mocks.fetch }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ from: mocks.from }) }));
import { POST } from "./route";

const request = (type: string, content: string) => new NextRequest("https://example.com/api/parse-job", { method: "POST", body: JSON.stringify({ type, content }) });
const job = { title: "IT", company: "Test", tasks: ["Software entwickeln"], mustHave: [], niceToHave: [], tone: "formal", language: "de" };
describe("private job cache boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user: { id: "user-a" } });
    mocks.ai.mockResolvedValue(JSON.stringify(job)); mocks.safe.mockResolvedValue({ ok: true }); mocks.fetch.mockResolvedValue("Job details");
    const query = { select: () => query, eq: mocks.eq, gt: () => query, maybeSingle: mocks.one, upsert: mocks.upsert };
    mocks.from.mockReturnValue(query); mocks.eq.mockReturnValue(query);
    mocks.one.mockResolvedValue({ data: null, error: null }); mocks.upsert.mockResolvedValue({ error: null });
  });
  it("never reads or writes a cache for pasted text", async () => {
    const response = await POST(request("text", "Private job text"));
    expect(response.status).toBe(200); expect(mocks.from).not.toHaveBeenCalled();
  });
  it("scopes URL reads and writes to the authenticated user", async () => {
    const url = "https://example.com/job";
    await POST(request("url", url));
    const hash = crypto.createHash("sha256").update(`v6:user-a:url:${url}`).digest("hex");
    expect(mocks.eq).toHaveBeenCalledWith("content_hash", hash);
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "user-a");
    expect(mocks.upsert.mock.calls[0][0]).toMatchObject({ content_hash: hash, user_id: "user-a", source_type: "url" });
    expect(mocks.fetch).toHaveBeenCalledWith(url);
  });
  it("validates a cache hit and bypasses AI", async () => {
    mocks.one.mockResolvedValue({ data: { parsed_json: job }, error: null });
    expect((await (await POST(request("url", "https://example.com/job"))).json()).fromCache).toBe(true);
    expect(mocks.ai).not.toHaveBeenCalled();
  });
  it("ignores malformed cache entries and rejects malformed new model output", async () => {
    mocks.one.mockResolvedValue({ data: { parsed_json: { ...job, tasks: "wrong" } }, error: null });
    mocks.ai.mockResolvedValue(JSON.stringify({ ...job, mustHave: "wrong" }));
    const response = await POST(request("url", "https://example.com/job"));
    expect(response.status).toBe(502); expect((await response.json()).code).toBe("AI_INVALID_JOB_DATA"); expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("keeps the source excerpt instead of trusting model-supplied source text", async () => {
    mocks.ai.mockResolvedValue(JSON.stringify({ ...job, rawText: "MODEL_INVENTED_SOURCE" }));
    const data = await (await POST(request("text", "Actual source description"))).json();
    expect(data.job.rawText).toBe("Actual source description");
  });
  it("a thrown cache read does not prevent analysis", async () => {
    mocks.one.mockRejectedValue(new Error("cache offline"));
    expect((await POST(request("url", "https://example.com/job"))).status).toBe(200);
    expect(mocks.ai).toHaveBeenCalledTimes(1);
  });
  it("a thrown cache write does not turn a successful analysis into HTTP 500", async () => {
    mocks.upsert.mockRejectedValue(new Error("cache offline"));
    expect((await POST(request("url", "https://example.com/job"))).status).toBe(200);
  });

  it("distinguishes malformed JSON from invalid job fields without exposing output", async () => {
    mocks.ai.mockResolvedValue('Explanation: {"PRIVATE":"value"}');
    const response = await POST(request("text", "A genuine job posting"));
    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.code).toBe("AI_INVALID_JSON");
    expect(JSON.stringify(data)).not.toContain("PRIVATE");
  });

  it("does not cache or accept schema-valid unknown vacancies", async () => {
    mocks.ai.mockResolvedValue(JSON.stringify({ ...job, title: "Unbekannt", company: "Unbekannt", tasks: [] }));
    const response = await POST(request("url", "https://example.com/job"));
    expect(await response.json()).toMatchObject({ success: false, error: "NO_JOB_FOUND" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("ignores cached placeholders and refetches the actual vacancy", async () => {
    mocks.one.mockResolvedValue({ data: { parsed_json: { ...job, title: "Unbekannt", tasks: [] } }, error: null });
    const data = await (await POST(request("url", "https://example.com/job"))).json();
    expect(data).toMatchObject({ success: true, fromCache: false, job: { title: "IT" } });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
  it("does not call AI when no readable source was retrieved", async () => {
    mocks.fetch.mockResolvedValue(null);
    const data = await (await POST(request("url", "https://example.com/job"))).json();
    expect(data).toEqual({ success: false, error: "URL_NOT_READABLE" });
    expect(mocks.ai).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

});
