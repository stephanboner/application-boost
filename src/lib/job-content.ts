import "server-only";
import { extractJobText, isBlockedJobPage } from "@/lib/job-text";
import { fetchSafeExternalUrl } from "@/lib/url-safety";

export async function fetchJobContent(url: string): Promise<string | null> {
  try {
    const response = await fetchSafeExternalUrl(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BewerbungsBoost/1.0)", Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(4000),
    });
    if (response.ok && !(response.headers.get("content-type") ?? "").match(/pdf|octet-stream/i)) {
      const html = await response.text();
      const text = extractJobText(html, url);
      if (!html.startsWith("%PDF") && !isBlockedJobPage(html) && text.length >= 200) return text;
    }
  } catch { /* The user can paste the job text when direct fetching fails. */ }

  return null;
}
