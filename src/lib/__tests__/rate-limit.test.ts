import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase-Service-Client bevor das Modul importiert wird
const rpcMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({ rpc: rpcMock }),
}));

import { checkRateLimit, enforceRateLimit } from "../rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("allows the request when the RPC returns a positive count", async () => {
    rpcMock.mockResolvedValue({ data: 3, error: null });
    const res = await checkRateLimit("user-1");
    expect(res.allowed).toBe(true);
    expect(res.remaining).toBeGreaterThanOrEqual(0);
  });

  it("denies the request when the RPC returns a negative count", async () => {
    rpcMock.mockResolvedValue({ data: -11, error: null });
    const res = await checkRateLimit("user-1");
    expect(res.allowed).toBe(false);
    expect(res.remaining).toBe(0);
    expect(res.retryAfterSeconds).toBeGreaterThan(0);
    expect(res.retryAfterSeconds).toBeLessThanOrEqual(3600);
  });

  it("blocks paid AI calls when the database returns an error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(checkRateLimit("user-1")).rejects.toMatchObject({ status: 503, retryAfter: 60 });
  });

  it("blocks paid AI calls on a network exception", async () => {
    rpcMock.mockRejectedValue(new Error("network"));
    await expect(checkRateLimit("user-1")).rejects.toMatchObject({ status: 503 });
  });

  it.each([null, undefined, 0, "3", NaN])("rejects an invalid counter %s", async (value) => {
    rpcMock.mockResolvedValue({ data: value, error: null });
    await expect(checkRateLimit("user-1")).rejects.toMatchObject({ status: 503 });
  });

  it("returns a 429 with retry information when the quota is exhausted", async () => {
    rpcMock.mockResolvedValue({ data: -10, error: null });
    await expect(enforceRateLimit("user-1")).rejects.toMatchObject({ status: 429, code: "RATE_LIMIT" });
  });

  it("passes action to the RPC", async () => {
    rpcMock.mockResolvedValue({ data: 1, error: null });
    await checkRateLimit("user-1", "rewrite");
    expect(rpcMock).toHaveBeenCalledWith(
      "increment_rate_limit_if_allowed",
      expect.objectContaining({ p_user_id: "user-1", p_action: "rewrite" })
    );
  });
});

