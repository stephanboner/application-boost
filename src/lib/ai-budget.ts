import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { ApiErrorResponse } from "@/lib/api-helpers";
import { childLogger } from "@/lib/logger";

const log = childLogger({ module: "ai-budget" });

function positiveLimit(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Ungültige Konfiguration: ${name}`);
  return value;
}

/** Reserve EVERY paid attempt. Lost connections/retries are never refunded.
 * UTF-8 bytes + message overhead conservatively bound input token usage.
 * This bounds calls/tokens, not currency-denominated provider spending. */
export async function reserveAIQuota(system: string, user: string, maxTokens: number): Promise<void> {
  const reservedTokens = Buffer.byteLength(system + user, "utf8") + 1024 + maxTokens;
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCHours(24, 0, 0, 0);
  const retryAfter = Math.ceil((tomorrow.getTime() - now.getTime()) / 1000);
  let allowed: unknown;
  try {
    const { data, error } = await createServiceClient().rpc("reserve_ai_quota", {
      p_tokens: reservedTokens,
      p_max_calls: positiveLimit("AI_MAX_CALLS_PER_DAY", 100),
      p_max_tokens: positiveLimit("AI_MAX_RESERVED_TOKENS_PER_DAY", 500_000),
    });
    if (error) throw error;
    if (typeof data !== "boolean") throw new Error("Ungültige Budget-Antwort");
    allowed = data;
  } catch (err) {
    log.error({ err }, "AI budget check unavailable");
    throw new ApiErrorResponse("KI vorübergehend nicht verfügbar. Bitte später erneut versuchen.", 503, "SERVER_ERROR", 60);
  }
  if (!allowed) {
    log.warn({ reservedTokens }, "Global daily AI quota reached");
    throw new ApiErrorResponse("Das gemeinsame KI-Tageslimit ist erreicht. Bitte morgen erneut versuchen.", 429, "RATE_LIMIT", retryAfter);
  }
}
