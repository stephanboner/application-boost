import { describe, it, expect, vi, beforeEach } from "vitest";

const transport = vi.hoisted(() => ({ fetch: vi.fn(), agents: [] as Array<{ connect: { lookup: (...args: unknown[]) => void } }>, destroy: vi.fn() }));
vi.mock("undici", () => ({
  fetch: transport.fetch,
  Agent: class {
    constructor(options: { connect: { lookup: (...args: unknown[]) => void } }) { transport.agents.push(options); }
    async destroy() { transport.destroy(); }
  },
}));

// Mock dns/promises before importing the SUT
vi.mock("dns/promises", () => ({
  default: { lookup: vi.fn() },
  lookup: vi.fn(),
}));

import dns from "dns/promises";
import { assertSafeExternalUrl, isPrivateIp, fetchSafeExternalUrl, readBoundedText } from "../url-safety";

const mockedLookup = dns.lookup as unknown as ReturnType<typeof vi.fn>;

describe("url-safety", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mockedLookup.mockReset();
    transport.fetch.mockReset();
    transport.agents.length = 0;
    transport.destroy.mockClear();
  });

  describe("isPrivateIp", () => {
    it.each([
      "10.0.0.1",
      "127.0.0.1",
      "0.0.0.0",
      "169.254.169.254",
      "172.16.0.5",
      "172.31.255.255",
      "192.168.1.1",
      "100.64.0.1",
      "224.0.0.1",
    ])("flags %s as private", (ip) => {
      expect(isPrivateIp(ip)).toBe(true);
    });

    it.each(["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1"])(
      "accepts public IPv4 %s",
      (ip) => {
        expect(isPrivateIp(ip)).toBe(false);
      }
    );

    it.each(["::1", "fe80::1", "fc00::1", "fd12:3456:789a::1", "ff00::1"])(
      "flags IPv6 %s as private",
      (ip) => {
        expect(isPrivateIp(ip)).toBe(true);
      }
    );

    it("detects IPv4-mapped private IPv6", () => {
      expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
      expect(isPrivateIp("::ffff:8.8.8.8")).toBe(false);
      expect(isPrivateIp("::ffff:7f00:1")).toBe(true);
      expect(isPrivateIp("0:0:0:0:0:ffff:a9fe:a9fe")).toBe(true);
    });

    it("rejects malformed input conservatively", () => {
      expect(isPrivateIp("nope")).toBe(true);
    });
  });

  describe("assertSafeExternalUrl", () => {
    it("rejects invalid URLs", async () => {
      const r = await assertSafeExternalUrl("not a url");
      expect(r.ok).toBe(false);
    });

    it("rejects non-http schemes", async () => {
      const r = await assertSafeExternalUrl("file:///etc/passwd");
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/http/);
    });

    it("rejects ftp", async () => {
      const r = await assertSafeExternalUrl("ftp://example.com");
      expect(r.ok).toBe(false);
    });

    it("rejects localhost without DNS lookup", async () => {
      const r = await assertSafeExternalUrl("http://localhost/foo");
      expect(r.ok).toBe(false);
      expect(mockedLookup).not.toHaveBeenCalled();
    });

    it("rejects GCP metadata host", async () => {
      const r = await assertSafeExternalUrl(
        "http://metadata.google.internal/"
      );
      expect(r.ok).toBe(false);
    });

    it("rejects direct private IP in URL without DNS lookup", async () => {
      const r = await assertSafeExternalUrl("http://169.254.169.254/latest");
      expect(r.ok).toBe(false);
      expect(mockedLookup).not.toHaveBeenCalled();
    });

    it("rejects a hexadecimal IPv4-mapped metadata URL", async () => {
      expect((await assertSafeExternalUrl("http://[::ffff:a9fe:a9fe]/latest")).ok).toBe(false);
      expect(mockedLookup).not.toHaveBeenCalled();
    });

    it("accepts a direct public IP without DNS lookup", async () => {
      const r = await assertSafeExternalUrl("http://8.8.8.8/");
      expect(r.ok).toBe(true);
      expect(mockedLookup).not.toHaveBeenCalled();
    });

    it("resolves hostnames and blocks if any address is private", async () => {
      mockedLookup.mockResolvedValue([
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]);
      const r = await assertSafeExternalUrl("https://example.com/jobs");
      expect(r.ok).toBe(false);
    });

    it("allows hostnames that only resolve to public IPs", async () => {
      mockedLookup.mockResolvedValue([
        { address: "93.184.216.34", family: 4 },
      ]);
      const r = await assertSafeExternalUrl("https://example.com/jobs");
      expect(r.ok).toBe(true);
    });

    it("rejects when DNS lookup fails", async () => {
      mockedLookup.mockRejectedValue(new Error("ENOTFOUND"));
      const r = await assertSafeExternalUrl("https://no-such-host.invalid/");
      expect(r.ok).toBe(false);
    });
  });

  it("blocks a public URL redirecting to cloud metadata before the second fetch", async () => {
    mockedLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    transport.fetch.mockResolvedValue(new Response(null, {
      status: 302, headers: { location: "http://169.254.169.254/latest" },
    }));
    await expect(fetchSafeExternalUrl("https://example.com/jobs")).rejects.toThrow(/Private/);
    expect(transport.fetch).toHaveBeenCalledTimes(1);
    expect(transport.fetch.mock.calls[0][1].redirect).toBe("manual");
    expect(transport.destroy).toHaveBeenCalledTimes(1);
  });

  it("uses only the validated address when DNS changes before the connection", async () => {
    mockedLookup.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    transport.fetch.mockResolvedValue(new Response("A public job"));
    await fetchSafeExternalUrl("https://example.com/job");
    const lookup = transport.agents[0].connect.lookup;
    const single = vi.fn();
    lookup("example.com", { family: 4 }, single);
    expect(single).toHaveBeenCalledWith(null, "93.184.216.34", 4);
    const all = vi.fn();
    lookup("example.com", { all: true }, all);
    expect(all).toHaveBeenCalledWith(null, [{ address: "93.184.216.34", family: 4 }]);
    expect(mockedLookup).toHaveBeenCalledTimes(1);
    expect(transport.fetch.mock.calls[0][0]).toBe("https://example.com/job");
  });

  it("rejects a connector lookup for an unvalidated hostname", async () => {
    mockedLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    transport.fetch.mockResolvedValue(new Response("job"));
    await fetchSafeExternalUrl("https://example.com/job");
    const callback = vi.fn();
    transport.agents[0].connect.lookup("metadata.google.internal", {}, callback);
    expect(callback.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it("drops credentials when redirecting to a different origin", async () => {
    mockedLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    transport.fetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://other.example/job" } }))
      .mockResolvedValueOnce(new Response("job"));
    await fetchSafeExternalUrl("https://example.com/job", { headers: { Authorization: "test-token", Cookie: "test-session" } });
    expect(transport.fetch.mock.calls[1][1].headers).not.toHaveProperty("authorization");
    expect(transport.fetch.mock.calls[1][1].headers).not.toHaveProperty("cookie");
    expect(transport.destroy).toHaveBeenCalledTimes(2);
  });

  it("destroys the dispatcher after network errors and oversized responses", async () => {
    mockedLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    transport.fetch.mockRejectedValueOnce(new Error("offline"));
    await expect(fetchSafeExternalUrl("https://example.com/job")).rejects.toThrow("offline");
    expect(transport.destroy).toHaveBeenCalledTimes(1);
    transport.fetch.mockResolvedValueOnce(new Response("x".repeat(1_000_001)));
    await expect(fetchSafeExternalUrl("https://example.com/job")).rejects.toThrow(/gross/);
    expect(transport.destroy).toHaveBeenCalledTimes(2);
  });

  it("reads bounded UTF-8 responses", async () => {
    expect(await readBoundedText(new Response("Grüezi"), 20)).toBe("Grüezi");
    await expect(readBoundedText(new Response("too large"), 3)).rejects.toThrow(/gross/);
  });
});

