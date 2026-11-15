// ============================================================
// SSRF-Schutz für serverseitige URL-Fetches
// - Erzwingt http/https
// - Löst Hostname via DNS auf und blockt private/loopback/
//   link-local/metadata IPs (IPv4 + IPv6)
// ============================================================

import "server-only";
import dns from "dns/promises";
import net from "net";
import { Agent, fetch as pinnedFetch, type Response as UndiciResponse } from "undici";

export interface UrlSafetyResult {
  ok: boolean;
  reason?: string;
}

// RFC1918 + Loopback + Link-Local + Carrier-NAT + Cloud-Metadata
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local + AWS/GCP-Metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // Carrier-Grade NAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 192 && b === 0 && (parts[2] === 0 || parts[2] === 2)) return true;
  if (a === 198 && b === 51 && parts[2] === 100) return true;
  if (a === 203 && b === 0 && parts[2] === 113) return true;
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique-local
  if (lower.startsWith("ff")) return true; // multicast
  // IPv4-mapped: ::ffff:a.b.c.d
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  // URL/DNS normalize mapped addresses to hexadecimal hextets.
  const halves = lower.split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const words = halves.length === 2
    ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right]
    : left;
  const values = words.map((word) => parseInt(word, 16));
  if (values.length === 8 && values.slice(0, 5).every((value) => value === 0) && values[5] === 0xffff) {
    return isPrivateIPv4([
      values[6] >> 8, values[6] & 255, values[7] >> 8, values[7] & 255,
    ].join("."));
  }
  // Other non-global address ranges (including NAT64) stay blocked.
  return (values[0] & 0xe000) !== 0x2000;
}

export function isPrivateIp(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return true; // unbekannte Form → konservativ blocken
}

async function resolveSafeExternalUrl(
  rawUrl: string
): Promise<UrlSafetyResult & { url?: URL; addresses?: { address: string; family: number }[] }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "Ungültige URL" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "Nur http/https erlaubt" };
  }
  if (parsed.port) return { ok: false, reason: "Nur Standard-Webports erlaubt" };

  if (parsed.username || parsed.password) return { ok: false, reason: "URL-Zugangsdaten sind nicht erlaubt" };
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!hostname) return { ok: false, reason: "Kein Hostname" };

  // "localhost" und bekannte Meta-Hostnames direkt ablehnen
  const lowerHost = hostname.toLowerCase();
  if (
    lowerHost === "localhost" ||
    lowerHost.endsWith(".localhost") ||
    lowerHost === "metadata.google.internal"
  ) {
    return { ok: false, reason: "Interner Host nicht erlaubt" };
  }

  // Direkte IP in URL? Prüfen ohne DNS.
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      return { ok: false, reason: "Private/Loopback-IP nicht erlaubt" };
    }
    return { ok: true, url: parsed, addresses: [{ address: hostname, family: net.isIP(hostname) }] };
  }

  // These exact addresses are supplied to the socket's lookup callback.
  let addrs: { address: string; family: number }[];
  try {
    addrs = await dns.lookup(hostname, { all: true });
  } catch {
    return { ok: false, reason: "Hostname nicht auflösbar" };
  }

  if (addrs.length === 0) return { ok: false, reason: "Keine IP gefunden" };
  for (const a of addrs) {
    if (isPrivateIp(a.address)) {
      return { ok: false, reason: "Hostname zeigt auf private IP" };
    }
  }
  return { ok: true, url: parsed, addresses: addrs };
}

export async function assertSafeExternalUrl(rawUrl: string): Promise<UrlSafetyResult> {
  const { ok, reason } = await resolveSafeExternalUrl(rawUrl);
  return { ok, reason };
}

/** Pin DNS at the socket, retain Host/TLS verification, recheck every redirect.
 * Buffer at most 1 MB, then destroy the per-request dispatcher on every path. */
export async function fetchSafeExternalUrl(rawUrl: string, options: Pick<RequestInit, "headers" | "signal"> = {}): Promise<Response> {
  let current = rawUrl;
  const headers = new Headers(options.headers);
  headers.delete("host");
  for (let redirects = 0; redirects <= 3; redirects++) {
    const safety = await resolveSafeExternalUrl(current);
    if (!safety.ok || !safety.url || !safety.addresses) throw new Error(safety.reason);
    const hostname = safety.url.hostname.replace(/^\[|\]$/g, "");
    const addresses = safety.addresses;
    const dispatcher = new Agent({
      connect: {
        timeout: 4000,
        lookup(lookupHost, lookupOptions, callback) {
          if (lookupHost.toLowerCase() !== hostname.toLowerCase()) {
            callback(new Error("Unerwarteter Zielhost"), "", 4);
            return;
          }
          const candidates = addresses.filter((entry) => !lookupOptions.family || entry.family === lookupOptions.family);
          if (!candidates.length) {
            callback(new Error("Keine geprüfte Zieladresse"), "", 4);
          } else if (lookupOptions.all) {
            callback(null, candidates);
          } else {
            callback(null, candidates[0].address, candidates[0].family);
          }
        },
      },
    });
    try {
      const response = await pinnedFetch(current, {
        headers: Object.fromEntries(headers), signal: options.signal,
        redirect: "manual", dispatcher,
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) {
        const body = await readBoundedText(response);
        return new Response([204, 205, 304].includes(response.status) ? null : body, {
          status: response.status, statusText: response.statusText, headers: Object.fromEntries(response.headers),
        });
      }
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location || redirects === 3) throw new Error("Zu viele oder ungültige Weiterleitungen");
      const next = new URL(location, current);
      if (next.origin !== safety.url.origin) {
        headers.delete("authorization");
        headers.delete("cookie");
      }
      current = next.toString();
    } finally {
      await dispatcher.destroy();
    }
  }
  throw new Error("Zu viele Weiterleitungen");
}

export async function readBoundedText(response: Response | UndiciResponse, maxBytes = 1_000_000): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("Antwort ist zu gross");
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel();
  }
}

