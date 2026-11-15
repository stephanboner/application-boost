/** Public page text only. No scripts are executed and no linked URLs are fetched. */
export const JOB_TEXT_LIMIT = 12000;

export function htmlToJobText(html: string): string {
  return html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|amp|nbsp|quot|apos|lt|gt);/gi, (entity, code: string) => {
      const named: Record<string, string> = { amp: "&", nbsp: " ", quot: '"', apos: "'", lt: "<", gt: ">" };
      if (!code.startsWith("#")) return named[code.toLowerCase()] ?? entity;
      const value = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff) ? String.fromCodePoint(value) : " ";
    }).replace(/\s+/g, " ").trim();
}

/** Prefer the detail page's JobPosting over navigation and related vacancies. */
export function extractJobText(html: string, sourceUrl?: string): string {
  const postings: Record<string, unknown>[] = [];
  const collect = (value: unknown, depth = 0) => {
    if (depth > 5 || postings.length > 30) return;
    if (Array.isArray(value)) { value.slice(0, 100).forEach((v) => collect(v, depth + 1)); return; }
    if (!value || typeof value !== "object") return;
    const entry = value as Record<string, unknown>;
    if ([entry["@type"]].flat().includes("JobPosting")) postings.push(entry);
    if (entry["@graph"]) collect(entry["@graph"], depth + 1);
  };
  for (const script of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    try { collect(JSON.parse(script[1])); } catch { /* Ignore broken metadata; visible content remains available. */ }
  }
  const sameUrl = (value: unknown) => {
    if (typeof value !== "string" || !sourceUrl) return false;
    try {
      const candidate = new URL(value, sourceUrl); const source = new URL(sourceUrl);
      candidate.hash = ""; source.hash = "";
      return candidate.href === source.href;
    } catch { return false; }
  };
  const posting = postings.find((p) => sameUrl(p.url) || sameUrl(p["@id"])) ?? (postings.length === 1 ? postings[0] : undefined);
  if (posting && typeof posting.description === "string" && htmlToJobText(posting.description).length >= 200) {
    const org = posting.hiringOrganization as Record<string, unknown> | undefined;
    const details = [typeof posting.title === "string" ? `Stelle: ${posting.title}` : "",
      typeof org?.name === "string" ? `Arbeitgeber: ${org.name}` : "",
      posting.description,
      ...["qualifications", "responsibilities", "skills", "educationRequirements", "experienceRequirements", "industry"]
        .map((key) => typeof posting[key] === "string" ? `${key}: ${posting[key]}` : "")];
    return htmlToJobText(details.filter(Boolean).join("\n")).slice(0, JOB_TEXT_LIMIT);
  }
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1] ?? html;
  const main = body.match(/<(?:main|article)\b[^>]*>([\s\S]*?)<\/(?:main|article)\s*>/i)?.[1] ?? body;
  return htmlToJobText(main.replace(/<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")).slice(0, JOB_TEXT_LIMIT);
}

/** Detect interstitials in HTML and reader text, not ordinary mentions in a job. */
export function isBlockedJobPage(content: string): boolean {
  const text = htmlToJobText(content).toLowerCase();
  return /(?:<title[^>]*>|^title:\s*)just a moment(?:\.{3}|…)/im.test(content)
    || /(?:^|\n)warning:.*(?:requiring captcha|security verification)/i.test(content)
    || text.includes("this page is displayed while the website verifies you are not a bot")
    || (text.includes("performing security verification") && text.includes("protect against malicious bots"))
    || (text.includes("verify you are human") && /challenge-platform|cf-chl-|captcha/i.test(content));
}

/** A schema-valid placeholder is not a recognised vacancy. Shared with the UI. */
export function isRecognisedJob(job: { title: string; tasks: string[]; mustHave: string[]; niceToHave: string[] }): boolean {
  const title = job.title.trim();
  return !!title && !/^(?:unbekannt|unknown|n\/a|nicht (?:bekannt|angegeben|verfügbar)|not (?:found|available|specified)|[-–—?]+)[.!]?$/i.test(title)
    && [...job.tasks, ...job.mustHave, ...job.niceToHave].some((item) => item.trim().length > 0);
}
