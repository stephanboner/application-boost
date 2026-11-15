import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { callClaude, AI_CONFIG } from "@/lib/anthropic";
import { buildJobParserPrompt } from "@/lib/prompts";
import { withApiHandler, requireAuth, parseAndValidateBody, ApiErrorResponse } from "@/lib/api-helpers";
import { jobParseRequestSchema, parsedJobSchema } from "@/lib/schemas";
import { AIOutputError, parseAIOutput } from "@/lib/ai-output";
import { isRecognisedJob, JOB_TEXT_LIMIT } from "@/lib/job-text";
import { fetchJobContent } from "@/lib/job-content";
import { enforceRateLimit } from "@/lib/rate-limit";
import { assertSafeExternalUrl } from "@/lib/url-safety";
import { childLogger } from "@/lib/logger";
import type { ParsedJob } from "@/types";

const log = childLogger({ route: "api/parse-job" });

// ============================================================
// POST /api/parse-job
// Parst ein Stelleninserat (URL oder Text) via Claude, 24h-Cache
// ============================================================

export const maxDuration = 90;

export const POST = withApiHandler(async (req: NextRequest) => {
  const { user } = await requireAuth();
  const { type, content } = await parseAndValidateBody(req, jobParseRequestSchema);
  await enforceRateLimit(user.id, "parse-job");

  // URL cache is server-only and scoped to the authenticated user.
  // Pasted text is never persisted here; legacy global hashes are not reused.
  const contentHash = crypto.createHash("sha256").update(`v6:${user.id}:${type}:${content.trim()}`).digest("hex");
  let serviceClient: ReturnType<typeof createServiceClient> | undefined;
  if (type === "url") {
    const safety = await assertSafeExternalUrl(content);
    if (!safety.ok) throw new ApiErrorResponse(safety.reason ?? "Ungültige URL", 400, "VALIDATION_ERROR");
    try {
      serviceClient = createServiceClient();
      const { data: cached, error } = await serviceClient.from("job_cache")
        .select("parsed_json").eq("content_hash", contentHash)
        .eq("user_id", user.id)
        .gt("expires_at", new Date().toISOString()).maybeSingle();
      if (error) log.warn({ err: error }, "Job cache read failed");
      if (cached?.parsed_json) {
        const validated = parsedJobSchema.safeParse(cached.parsed_json);
        if (validated.success && isRecognisedJob(validated.data)) return NextResponse.json({ success: true, job: validated.data, fromCache: true });
        log.warn("Ignoring invalid cached job");
      }
    } catch { log.warn("Job cache unavailable; continuing without cache"); }
  }

  // 2. Text abrufen (falls URL)
  let jobText = content;

  if (type === "url") {
    const fetched = await fetchJobContent(content);
    if (!fetched) {
      return NextResponse.json(
        { success: false, error: "URL_NOT_READABLE" },
        { status: 200 }
      );
    }
    jobText = fetched;
  }

  // 3. Claude Job-Parser aufrufen
  const { system, user: userPrompt } = buildJobParserPrompt(jobText);

  let parsed: ParsedJob;
  try {
    const rawResponse = await callClaude(system, userPrompt, AI_CONFIG.jobParser);
    parsed = { ...parseAIOutput(rawResponse, parsedJobSchema), rawText: jobText.slice(0, JOB_TEXT_LIMIT) };
  } catch (err) {
    if (err instanceof ApiErrorResponse) throw err;
    const failureCode = err instanceof AIOutputError && err.stage === "json" ? "AI_INVALID_JSON" : "AI_INVALID_JOB_DATA";
    log.error({ failureCode, type }, "Claude job-parse failed");
    throw new ApiErrorResponse("Die Stellenanalyse hat kein gültiges Ergebnis geliefert. Bitte erneut versuchen oder den Inserattext einfügen.", 502, failureCode);
  }

  // Provider formatting guarantees do not establish that the source is a vacancy.
  if (!isRecognisedJob(parsed)) {
    return NextResponse.json({ success: false, error: "NO_JOB_FOUND" });
  }

  if (type === "url" && serviceClient) {
    try {
      const { error } = await serviceClient.from("job_cache").upsert({
        content_hash: contentHash, parsed_json: parsed, source_type: type,
        user_id: user.id,
        job_title: parsed.title, company: parsed.company,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      if (error) log.warn({ err: error }, "Job cache write failed");
    } catch { log.warn("Job cache write unavailable"); }
  }

  return NextResponse.json({ success: true, job: parsed, fromCache: false });
});
