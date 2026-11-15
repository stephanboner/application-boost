import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ApiErrorResponse } from "@/lib/api-helpers";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/api-helpers", async (original) => ({ ...await original<typeof import("@/lib/api-helpers")>(), requireAuth: mocks.auth }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ rpc: mocks.rpc }) }));
import { DELETE } from "./route";
describe("delete own PoC data", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user: { id: "current-user" } }); mocks.rpc.mockResolvedValue({ error: null }); });
  it("ignores user IDs from the client and uses the authenticated account", async () => {
    const response = await DELETE(new NextRequest("https://example.com/api/profile/data?user_id=other-user", { method: "DELETE" }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("delete_user_poc_data", { p_user_id: "current-user" });
  });
  it("rejects requests from a different origin", async () => {
    const response = await DELETE(new NextRequest("https://example.com/api/profile/data", { method: "DELETE", headers: { origin: "https://other.example" } }));
    expect(response.status).toBe(403); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects an unauthenticated deletion", async () => {
    mocks.auth.mockRejectedValue(new ApiErrorResponse("Nicht angemeldet", 401, "UNAUTHORIZED"));
    expect((await DELETE(new NextRequest("https://example.com/api/profile/data", { method: "DELETE" }))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
