import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ rpc }) }));
import { reserveAIQuota } from "../ai-budget";

describe("global AI budget", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T23:30:00Z"));
    rpc.mockResolvedValue({ data: true, error: null });
    vi.stubEnv("AI_MAX_CALLS_PER_DAY", "100");
    vi.stubEnv("AI_MAX_RESERVED_TOKENS_PER_DAY", "500000");
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
  it("reserves prompt bytes, overhead and maximum output before work", async () => {
    await reserveAIQuota("Grüezi", "test", 600);
    expect(rpc).toHaveBeenCalledWith("reserve_ai_quota", {
      p_tokens: Buffer.byteLength("Grüezitest", "utf8") + 1024 + 600, p_max_calls: 100, p_max_tokens: 500000,
    });
  });
  it("reports exhausted quota and the UTC reset time", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(reserveAIQuota("system", "user", 600)).rejects.toMatchObject({ status: 429, retryAfter: 1800 });
  });
  it.each([{ data: null, error: null }, { data: "true", error: null }, { data: null, error: { code: "PGRST" } }])("fails closed when the counter is unavailable", async (result) => {
    rpc.mockResolvedValue(result);
    await expect(reserveAIQuota("system", "user", 600)).rejects.toMatchObject({ status: 503 });
  });
  it("fails closed with an invalid configured limit", async () => {
    vi.stubEnv("AI_MAX_CALLS_PER_DAY", "bad");
    await expect(reserveAIQuota("system", "user", 600)).rejects.toMatchObject({ status: 503 });
    expect(rpc).not.toHaveBeenCalled();
  });
});
