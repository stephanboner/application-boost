import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ApiErrorResponse } from "@/lib/api-helpers";
import { decrypt } from "@/lib/encryption";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  enforceRateLimit: vi.fn(),
  create: vi.fn(),
  stream: vi.fn(),
  single: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("@/lib/api-helpers", async (original) => ({
  ...await original<typeof import("@/lib/api-helpers")>(),
  requireAuth: mocks.requireAuth,
  loadUserCV: vi.fn().mockResolvedValue({ firstName: "Maria", lastName: "Muster" }),
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@/lib/anthropic", async (original) => ({
  ...await original<typeof import("@/lib/anthropic")>(),
  callClaude: async (...args: unknown[]) => {
    const response = await mocks.create(...args);
    return response.content[0].text;
  },
  createClaudeStream: async (...args: unknown[]) => mocks.stream(...args),
}));
vi.mock("@/lib/prompts", () => ({
  buildCVMatcherPrompt: () => ({ system: "match", user: "profile" }),
  buildWritingPrompt: () => ({ system: "write", user: "job" }),
}));

import { POST } from "./route";

const userId = "00000000-0000-0000-0000-000000000099";
const savedId = "00000000-0000-4000-8000-000000000001";
const letter = "Sehr geehrte Frau Meier,\n\nMein Bewerbungsschreiben.";

function request(applicationId?: string) {
  return new NextRequest("http://localhost/api/generate", {
    method: "POST",
    body: JSON.stringify({
      jobData: { title: "Sachbearbeiterin", company: "Kanton Graubünden" },
      ...(applicationId ? { applicationId } : {}),
    }),
    headers: { "Content-Type": "application/json" },
  });
}

describe("generation and persistence boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const query = {
      insert: mocks.insert,
      update: mocks.update,
      eq: mocks.eq,
      select: () => query,
      single: mocks.single,
    };
    mocks.insert.mockReturnValue(query);
    mocks.update.mockReturnValue(query);
    mocks.eq.mockReturnValue(query);
    mocks.single.mockResolvedValue({ data: { id: savedId }, error: null });
    mocks.requireAuth.mockResolvedValue({ user: { id: userId }, supabase: { from: () => query } });
    mocks.enforceRateLimit.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue({ content: [{ type: "text", text: '{"topMatches":[],"gaps":[],"keywords":[],"matchScore":82}' }] });
    mocks.stream.mockImplementation(async function* () {
      yield { type: "content_block_delta", delta: { type: "text_delta", text: letter } };
      yield { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 20 } };
      yield { type: "message_stop" };
    });
  });

  it("emits a saved ID and done only after storing the encrypted letter", async () => {
    const response = await POST(request());
    const events = await response.text();
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    const saved = mocks.insert.mock.calls[0][0];
    expect(saved.user_id).toBe(userId);
    expect(decrypt(saved.letter_enc)).toBe(letter);
    expect(events).toContain(`event: applicationId\ndata: "${savedId}"`);
    expect(events.indexOf("event: applicationId")).toBeLessThan(events.indexOf("event: done"));
  });

  it("reports a save failure without claiming successful completion", async () => {
    mocks.single.mockResolvedValue({ data: null, error: { message: "database unavailable" } });
    const events = await (await POST(request())).text();
    expect(events).toContain("event: error");
    expect(events).toContain("nicht gespeichert");
    expect(events).not.toContain("event: done");
    expect(events).not.toContain("event: applicationId");
  });

  it("does not save or mark an empty model response as done", async () => {
    mocks.stream.mockImplementation(async function* () {});
    const events = await (await POST(request())).text();
    expect(events).toContain("event: error");
    expect(events).not.toContain("event: done");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("filters regeneration updates by both application and user", async () => {
    const events = await (await POST(request(savedId))).text();
    expect(mocks.eq).toHaveBeenCalledWith("id", savedId);
    expect(mocks.eq).toHaveBeenCalledWith("user_id", userId);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(events).toContain("event: done");
  });

  it("does not report success when the requested application was not updated", async () => {
    mocks.single.mockResolvedValue({ data: null, error: null });
    const events = await (await POST(request(savedId))).text();
    expect(events).toContain("event: error");
    expect(events).not.toContain("event: applicationId");
    expect(events).not.toContain("event: done");
  });

  it("blocks the model when the quota check is unavailable", async () => {
    mocks.enforceRateLimit.mockRejectedValue(new ApiErrorResponse("Nicht verfügbar", 503, "SERVER_ERROR", 60));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.stream).not.toHaveBeenCalled();
  });

  it("uses no made-up score when matching returns malformed fields", async () => {
    mocks.create.mockResolvedValue({ content: [{ type: "text", text: '{"topMatches":"wrong","gaps":[],"keywords":[],"matchScore":50}' }] });
    const events = await (await POST(request())).text();
    expect(events).toContain("event: matchScore\ndata: null");
    expect(events).toContain("event: done");
  });

  it("still generates and saves the letter when the optional matcher times out", async () => {
    mocks.create.mockRejectedValue(new ApiErrorResponse("Abgleich hat nicht rechtzeitig geantwortet", 504, "AI_TIMEOUT"));
    const response = await POST(request());
    const events = await response.text();
    expect(response.status).toBe(200);
    expect(events).toContain("event: matchScore\ndata: null");
    expect(events).toContain("event: done");
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    expect(decrypt(mocks.insert.mock.calls[0][0].letter_enc)).toBe(letter);
  });

  it.each([
    ["RATE_LIMIT", 429],
    ["SERVER_ERROR", 503],
  ] as const)("does not start writing when matcher admission fails with %s", async (code, status) => {
    mocks.create.mockRejectedValue(new ApiErrorResponse("KI-Kontingent nicht verfügbar", status, code, 60));
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(mocks.stream).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it.each(["max_tokens", "refusal"])("does not save a letter stopped with %s", async (reason) => {
    mocks.stream.mockImplementation(async function* () {
      yield { type: "content_block_delta", delta: { type: "text_delta", text: letter } };
      yield { type: "message_delta", delta: { stop_reason: reason }, usage: { output_tokens: 20 } };
      yield { type: "message_stop" };
    });
    const events = await (await POST(request())).text();
    expect(events).toContain("event: error");
    expect(events).not.toContain("event: done");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("does not save a nonempty stream without a final stop event", async () => {
    mocks.stream.mockImplementation(async function* () {
      yield { type: "content_block_delta", delta: { type: "text_delta", text: letter } };
    });
    const events = await (await POST(request())).text();
    expect(events).toContain("event: error");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests before starting paid model calls", async () => {
    mocks.requireAuth.mockRejectedValue(new ApiErrorResponse("Nicht angemeldet", 401, "UNAUTHORIZED"));
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
