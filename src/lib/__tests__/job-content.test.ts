import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/url-safety", () => ({ fetchSafeExternalUrl: mocks.fetch }));
import { fetchJobContent } from "../job-content";

describe("direct job fetching", () => {
  beforeEach(() => vi.clearAllMocks());
  it("extracts a readable job page with one direct request", async () => {
    mocks.fetch.mockResolvedValue(new Response("<main>" + "job details ".repeat(30) + "</main>"));
    expect(await fetchJobContent("https://example.com/job")).toContain("job details");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch.mock.calls[0][0]).toBe("https://example.com/job");
  });
  it("returns no content after a network failure without another destination", async () => {
    mocks.fetch.mockRejectedValue(new Error("offline"));
    expect(await fetchJobContent("https://example.com/job")).toBeNull();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
  it.each([403, 404, 429, 503])("does not forward an HTTP %s failure elsewhere", async (status) => {
    mocks.fetch.mockResolvedValue(new Response("Blocked content ".repeat(30), { status }));
    expect(await fetchJobContent("https://example.com/job")).toBeNull();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects a security interstitial even with HTTP 200 and sufficient text", async () => {
    const challenge = "<title>Just a moment...</title><main>Performing security verification. This website uses a security service to protect against malicious bots. This page is displayed while the website verifies you are not a bot.</main>";
    mocks.fetch.mockResolvedValue(new Response(challenge));
    expect(await fetchJobContent("https://example.com/job")).toBeNull();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
  it("accepts a genuine security vacancy mentioning CAPTCHA", async () => {
    const posting = "Security Engineer: Improve CAPTCHA and bot detection. Develop software with our team. ".repeat(8);
    mocks.fetch.mockResolvedValue(new Response(`<main>${posting}</main>`));
    expect(await fetchJobContent("https://example.com/job")).toContain("Security Engineer");
  });
  it.each(["application/pdf", "application/octet-stream"])("rejects %s instead of treating it as a job page", async (type) => {
    mocks.fetch.mockResolvedValue(new Response("%PDF ".repeat(50), { headers: { "content-type": type } }));
    expect(await fetchJobContent("https://example.com/job")).toBeNull();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects source text that is too short", async () => {
    mocks.fetch.mockResolvedValue(new Response("Loading..."));
    expect(await fetchJobContent("https://example.com/job")).toBeNull();
  });
});
