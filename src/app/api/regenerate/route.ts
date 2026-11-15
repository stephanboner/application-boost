import { NextRequest, NextResponse } from "next/server";
import { callClaude, AI_CONFIG } from "@/lib/anthropic";
import { buildRewritePrompt, buildToneAdjustPrompt, buildLanguageRewritePrompt } from "@/lib/prompts";
import { enforceRateLimit } from "@/lib/rate-limit";
import { withApiHandler, requireAuth, parseAndValidateBody, ApiErrorResponse } from "@/lib/api-helpers";
import { regenerateRequestSchema } from "@/lib/schemas";
import { childLogger } from "@/lib/logger";

const log = childLogger({ route: "api/regenerate" });
export const maxDuration = 60;

// ============================================================
// POST /api/regenerate
// Abschnitt / Ton / Sprache anpassen
// ============================================================

export const POST = withApiHandler(async (req: NextRequest) => {
  const { user } = await requireAuth();

  const { type, content, feedback, newTone, newLanguage, context } =
    await parseAndValidateBody(req, regenerateRequestSchema);
  await enforceRateLimit(user.id, "generate");

  let prompt: { system: string; user: string };
  let config: { model: string; max_tokens: number; temperature: number } = AI_CONFIG.rewrite;

  if (type === "section" && context) {
    prompt = buildRewritePrompt(content, context, feedback);
  } else if (type === "tone" && newTone) {
    prompt = buildToneAdjustPrompt(content, newTone);
    config = AI_CONFIG.toneAdjust;
  } else if (type === "language" && newLanguage) {
    prompt = buildLanguageRewritePrompt(content, newLanguage);
    config = AI_CONFIG.toneAdjust;
  } else {
    // Zod-Refinement sollte das bereits verhindern, aber defensiv:
    throw new ApiErrorResponse(
      "Ungültiger Typ oder fehlende Parameter",
      400,
      "VALIDATION_ERROR"
    );
  }

  try {
    const result = await callClaude(prompt.system, prompt.user, config);
    return NextResponse.json({ success: true, result });
  } catch (err) {
    if (err instanceof ApiErrorResponse) throw err;
    log.error({ err, userId: user.id, type }, "Regenerate failed");
    throw new ApiErrorResponse("Überarbeitung fehlgeschlagen", 500, "SERVER_ERROR");
  }
});

