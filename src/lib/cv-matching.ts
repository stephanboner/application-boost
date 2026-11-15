import "server-only";
import { callClaude, AI_CONFIG } from "@/lib/anthropic";
import { buildCVMatcherPrompt } from "@/lib/prompts";
import { parseAIOutput } from "@/lib/ai-output";
import { cvMatchSchema } from "@/lib/schemas";
import { ApiErrorResponse } from "@/lib/api-helpers";
import { childLogger } from "@/lib/logger";
import type { CVProfile, ParsedJob } from "@/types";

const log = childLogger({ module: "cv-matching" });

/** The matching API needs the actual failure; generation may omit an assessment. */
export async function assessCVWithJob(cv: CVProfile, job: ParsedJob) {
  const prompt = buildCVMatcherPrompt(cv, job);
  const output = await callClaude(prompt.system, prompt.user, AI_CONFIG.cvMatcher);
  try {
    return parseAIOutput(output, cvMatchSchema);
  } catch {
    throw new ApiErrorResponse("Der CV-Abgleich hat kein gültiges Ergebnis geliefert. Bitte erneut versuchen.", 502, "AI_INVALID_OUTPUT");
  }
}

export async function matchCVWithJob(cv: CVProfile, job: ParsedJob) {
  try {
    return await assessCVWithJob(cv, job);
  } catch (err) {
    // Provider/output failures are optional; admission-control failures must stop all AI work.
    if (err instanceof ApiErrorResponse && !err.code?.startsWith("AI_")) throw err;
    log.warn({ err }, "CV matching unavailable");
    return null;
  }
}
