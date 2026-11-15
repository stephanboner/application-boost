import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ApiErrorResponse } from "@/lib/api-helpers";
import { decryptLetter, encrypt } from "@/lib/encryption";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rest: vi.fn() }));
vi.mock("@/lib/api-helpers", async (original) => ({
  ...await original<typeof import("@/lib/api-helpers")>(), requireAuth: mocks.auth,
}));
import { GET, PATCH, DELETE } from "./route";

const id = "00000000-0000-0000-0000-000000000001";
const userId = "00000000-0000-0000-0000-000000000099";
const url = `https://example.com/api/history?id=${id}`;
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function row(letter = "Gespeicherter Bewerbungsbrief") {
  return { id, job_title: "Teststelle", company: "Testfirma", letter_enc: encrypt(letter),
    tone: "balanced", language: "de", word_count: 2, is_exported: false,
    created_at: "2026-10-11T12:00:00Z", updated_at: "2026-10-11T12:00:00Z" };
}

describe("history API error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Use the actual query builder so .select(), own-row filters and
    // maybeSingle's zero-row handling are exercised together.
    const supabase = createClient("https://fixture.supabase.test", "test-anon-key", {
      global: { fetch: mocks.rest },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    mocks.auth.mockResolvedValue({ user: { id: userId }, supabase });
  });

  it("loads and decrypts the requested own application", async () => {
    mocks.rest.mockResolvedValue(reply([row()]));
    const response = await GET(new NextRequest(url));
    expect(response.status).toBe(200);
    expect((await response.json()).application.letter).toBe("Gespeicherter Bewerbungsbrief");
    const query = new URL(mocks.rest.mock.calls[0][0]);
    expect(query.searchParams.get("id")).toBe(`eq.${id}`);
    expect(query.searchParams.get("user_id")).toBe(`eq.${userId}`);
  });

  it("returns 404 for a missing or inaccessible application", async () => {
    mocks.rest.mockResolvedValue(reply([]));
    expect((await GET(new NextRequest(url))).status).toBe(404);
  });

  it("keeps database failures distinct from missing records", async () => {
    mocks.rest.mockResolvedValue(reply({ code: "42501", message: "denied" }, 403));
    expect((await GET(new NextRequest(url))).status).toBe(500);
  });

  it("never returns a successful empty letter for damaged ciphertext", async () => {
    const damaged = { ...row(), letter_enc: "damaged-private-ciphertext" };
    mocks.rest.mockResolvedValue(reply([damaged]));
    const response = await GET(new NextRequest(url));
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).not.toContain("damaged-private-ciphertext");
    expect(body).not.toContain('"application"');
  });

  it("rejects an unreadable empty stored document", async () => {
    mocks.rest.mockResolvedValue(reply([row("")]));
    expect((await GET(new NextRequest(url))).status).toBe(500);
  });

  it("does not claim a save when the update matches zero rows", async () => {
    mocks.rest.mockResolvedValue(reply([]));
    const response = await PATCH(new NextRequest(url, { method: "PATCH",
      body: JSON.stringify({ letter: "Neue Fassung" }) }));
    expect(response.status).toBe(404);
    expect(await response.json()).not.toHaveProperty("success");
  });

  it("confirms only the returned own row and stores encrypted text", async () => {
    mocks.rest.mockResolvedValue(reply({ id }));
    const response = await PATCH(new NextRequest(url, { method: "PATCH",
      body: JSON.stringify({ letter: "Neue Fassung", tone: "formal", language: "fr", user_id: "other-user" }) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    const [input, init] = mocks.rest.mock.calls[0];
    const query = new URL(input);
    expect(query.searchParams.get("select")).toBe("id");
    expect(query.searchParams.get("id")).toBe(`eq.${id}`);
    expect(query.searchParams.get("user_id")).toBe(`eq.${userId}`);
    const update = JSON.parse(init.body);
    expect(update).not.toHaveProperty("user_id");
    expect(update.letter_enc).not.toContain("Neue Fassung");
    expect(decryptLetter(update.letter_enc)).toBe("Neue Fassung");
    expect(update).toMatchObject({ tone: "formal", language: "fr", word_count: 2 });
  });

  it("reports update errors", async () => {
    mocks.rest.mockResolvedValue(reply({ code: "42501", message: "denied" }, 403));
    const response = await PATCH(new NextRequest(url, { method: "PATCH", body: '{"letter":"Entwurf"}' }));
    expect(response.status).toBe(500);
  });

  it("does not replace a stored document with whitespace", async () => {
    const response = await PATCH(new NextRequest(url, { method: "PATCH", body: '{"letter":"   "}' }));
    expect(response.status).toBe(400);
    expect(mocks.rest).not.toHaveBeenCalled();
  });

  it("reports deletion errors", async () => {
    mocks.rest.mockResolvedValue(reply({ code: "42501", message: "denied" }, 403));
    expect((await DELETE(new NextRequest(url, { method: "DELETE" }))).status).toBe(500);
  });

  for (const [method, handler] of [["GET", GET], ["PATCH", PATCH], ["DELETE", DELETE]] as const) {
    it(`requires authentication for ${method}`, async () => {
      mocks.auth.mockRejectedValue(new ApiErrorResponse("Nicht angemeldet", 401, "UNAUTHORIZED"));
      expect((await handler(new NextRequest(url, { method }))).status).toBe(401);
      expect(mocks.rest).not.toHaveBeenCalled();
    });
  }
});
