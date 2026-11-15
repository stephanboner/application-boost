import { createServiceClient } from "@/lib/supabase/server";
import { childLogger } from "@/lib/logger";
import { ApiErrorResponse } from "@/lib/api-helpers";

const log = childLogger({ module: "rate-limit" });

const configuredLimit = Number(process.env.RATE_LIMIT_MAX_PER_HOUR ?? "10");
const MAX_PER_HOUR = Number.isSafeInteger(configuredLimit) && configuredLimit > 0
  ? configuredLimit
  : 10;

// ============================================================
// Rate-Limiting für KI-Aktionen
// Standard: 10 Anfragen pro Aktion, Nutzer und Stunde
// Atomisch via Supabase-RPC (kein TOCTOU-Race-Condition)
// ============================================================

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
}

export async function checkRateLimit(
  userId: string,
  action = "generate"
): Promise<RateLimitResult> {
  // Aktuelle Stunde als Window-Start
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setMinutes(0, 0, 0);

  try {
    const supabase = createServiceClient();
    // Atomisches Increment via RPC – verhindert Race Conditions bei parallelen Requests
    const { data: newCount, error } = await supabase.rpc(
      "increment_rate_limit_if_allowed",
      {
        p_user_id: userId,
        p_action: action,
        p_window_start: windowStart.toISOString(),
        p_max_count: MAX_PER_HOUR,
      }
    );

    if (error) {
      throw error;
    }

    if (!Number.isSafeInteger(newCount) || newCount === 0) {
      throw new Error("Ungültige Rate-Limit-Antwort");
    }

    if (newCount < 0) {
      // RPC gibt negative Zahl zurück wenn Limit erreicht
      const nextHour = new Date(windowStart);
      nextHour.setHours(nextHour.getHours() + 1);
      const retryAfterSeconds = Math.ceil(
        (nextHour.getTime() - now.getTime()) / 1000
      );

      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds,
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, MAX_PER_HOUR - newCount),
    };
  } catch (err) {
    log.error({ err, userId, action }, "Rate-Limit-Fehler");
    throw new ApiErrorResponse(
      "Dienst vorübergehend nicht verfügbar. Bitte später erneut versuchen.",
      503,
      "SERVER_ERROR",
      60
    );
  }
}

export async function enforceRateLimit(userId: string, action = "generate"): Promise<void> {
  const result = await checkRateLimit(userId, action);
  if (!result.allowed) {
    throw new ApiErrorResponse("Rate-Limit erreicht", 429, "RATE_LIMIT", result.retryAfterSeconds);
  }
}

