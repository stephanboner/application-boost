import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { JOB_OUTPUT_SCHEMA } from "@/lib/job-output-schema";
import { reserveAIQuota } from "@/lib/ai-budget";
import { childLogger } from "@/lib/logger";
import { ApiErrorResponse } from "@/lib/api-helpers";

const log = childLogger({ module: "anthropic" });

// Singleton Anthropic-Client (server-side only)
let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      log.error({ failureCode: "AI_CONFIGURATION" }, "AI client configuration missing");
      throw new ApiErrorResponse("Der KI-Zugang ist nicht eingerichtet. Die Konfiguration muss geprüft werden.", 503, "AI_CONFIGURATION");
    }
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      maxRetries: 0,
      timeout: 20_000,
    });
  }
  return client;
}

export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

// Konfig-Konstanten aus der Architektur
export const AI_CONFIG = {
  jobParser: {
    model: MODEL,
    max_tokens: 2000,
    outputSchema: JOB_OUTPUT_SCHEMA,
    temperature: 0.1, // Strukturierter Output
    timeoutMs: 30_000,
  },
  cvMatcher: {
    model: MODEL,
    max_tokens: 1200,
    temperature: 0.1,
    timeoutMs: 30_000,
  },
  writer: {
    model: MODEL,
    max_tokens: 2400,
    temperature: 0.7, // Kreatives Schreiben
  },
  rewrite: {
    model: MODEL,
    max_tokens: 500,
    temperature: 0.7,
  },
  toneAdjust: {
    model: MODEL,
    max_tokens: 1200,
    temperature: 0.5,
  },
  cvParser: {
    model: MODEL,
    max_tokens: 4096,
    temperature: 0.1,
    timeoutMs: 45_000,
  },
} as const;

export type AIConfig = { model: string; max_tokens: number; temperature: number; timeoutMs?: number; outputSchema?: Record<string, unknown> };

/** Classify typed SDK errors; provider messages/bodies can contain private data. */
function toAIError(err: unknown): ApiErrorResponse {
  if (err instanceof ApiErrorResponse) return err;
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new ApiErrorResponse("Die KI hat nicht rechtzeitig geantwortet. Bitte erneut versuchen.", 504, "AI_TIMEOUT");
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new ApiErrorResponse("Der KI-Anbieter ist vorübergehend nicht erreichbar. Bitte später erneut versuchen.", 503, "AI_PROVIDER_UNAVAILABLE");
  }
  if (err instanceof Anthropic.APIError) {
    if (err.status === 402) {
      return new ApiErrorResponse("Die KI-Abrechnung ist nicht verfügbar. Bitte das Guthaben und die Zahlungsdaten beim KI-Anbieter prüfen.", 503, "AI_BILLING");
    }
    if (err.status === 401 || err.status === 403) {
      return new ApiErrorResponse("Der KI-Zugang funktioniert derzeit nicht. Die Konfiguration muss geprüft werden.", 503, "AI_CONFIGURATION");
    }
    if (err.status === 404) {
      return new ApiErrorResponse("Das konfigurierte KI-Modell ist nicht verfügbar. Die Konfiguration muss geprüft werden.", 503, "AI_MODEL_UNAVAILABLE");
    }
    if (err.status === 429) {
      return new ApiErrorResponse("Das Limit beim KI-Anbieter ist erreicht. Bitte später erneut versuchen.", 503, "AI_PROVIDER_LIMIT");
    }
    if (err.status === 504) {
      return new ApiErrorResponse("Die KI hat nicht rechtzeitig geantwortet. Bitte erneut versuchen.", 504, "AI_TIMEOUT");
    }
    if ((err.status ?? 0) >= 500) {
      return new ApiErrorResponse("Der KI-Anbieter ist vorübergehend nicht verfügbar. Bitte später erneut versuchen.", 503, "AI_PROVIDER_UNAVAILABLE");
    }
    return new ApiErrorResponse("Der KI-Anbieter hat die Anfrage abgelehnt. Bitte später erneut versuchen.", 502, "AI_REQUEST_REJECTED");
  }
  return new ApiErrorResponse("Die KI-Anfrage ist fehlgeschlagen. Bitte erneut versuchen.", 500, "AI_UNKNOWN");
}

function providerRequestId(err: unknown): string | undefined {
  const id = err instanceof Anthropic.APIError ? err.request_id : undefined;
  return typeof id === "string" && /^req_[A-Za-z0-9_-]{1,100}$/.test(id) ? id : undefined;
}

// Nicht-streamender API-Call mit einem expliziten, budgetierten Retry
export async function callClaude(
  system: string,
  user: string,
  config: AIConfig
): Promise<string> {
  const claude = getAnthropicClient();
  // A retry shares the deadline; it must not double the route's execution time.
  const deadline = Date.now() + (config.timeoutMs ?? 45_000);

  for (let attempt = 1; attempt <= 2; attempt++) {
    await reserveAIQuota(system, config.outputSchema ? user + JSON.stringify(config.outputSchema) : user, config.max_tokens);
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw toAIError(new Anthropic.APIConnectionTimeoutError());
    const started = Date.now();
    try {
      // The installed SDK forwards extra body fields; the HTTP integration test
      // verifies output_config reaches the provider without upgrading unrelated APIs.
      const request = {
        model: config.model,
        max_tokens: config.max_tokens,
        temperature: config.temperature,
        system,
        messages: [{ role: "user" as const, content: user }],
        ...(config.outputSchema ? { output_config: { format: { type: "json_schema", schema: config.outputSchema } } } : {}),
      };
      const response = await claude.messages.create(request, { timeout: Math.min(config.timeoutMs ?? 20_000, remainingMs) });

      log.info({ model: response.model, inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens, durationMs: Date.now() - started,
        stopReason: response.stop_reason, attempt }, "AI request finished");
      // The installed SDK predates newer stop reasons returned by the API.
      const stopReason = response.stop_reason as string | null;
      if (stopReason === "max_tokens") {
        throw new ApiErrorResponse("Die KI-Antwort wurde wegen des Antwortlimits abgeschnitten. Bitte erneut versuchen oder die Angaben manuell erfassen.", 502, "AI_OUTPUT_LIMIT");
      }
      if (stopReason === "refusal") {
        throw new ApiErrorResponse("Die KI hat die Verarbeitung abgelehnt. Bitte die Angaben manuell erfassen.", 422, "AI_REFUSAL");
      }
      if (stopReason !== "end_turn") {
        throw new ApiErrorResponse("Die KI-Antwort ist unvollständig. Bitte erneut versuchen.", 502, "AI_INCOMPLETE");
      }
      const text = response.content.filter((block) => block.type === "text").map((block) => block.text).join("");
      if (!text.trim()) throw new ApiErrorResponse("Die KI hat kein Ergebnis zurückgegeben. Bitte erneut versuchen.", 502, "AI_EMPTY_OUTPUT");
      return text;
    } catch (err) {
      const retriable = err instanceof Anthropic.APIConnectionError ||
        (err instanceof Anthropic.APIError && (err.status === 429 || (err.status ?? 0) >= 500));
      const failure = toAIError(err);
      const willRetry = attempt < 2 && retriable && deadline - Date.now() > 5_500;
      log.error({ failureCode: failure.code, providerStatus: err instanceof Anthropic.APIError ? err.status : undefined,
        providerRequestId: providerRequestId(err), model: config.model,
        durationMs: Date.now() - started, attempt, willRetry }, "AI request failed");
      if (!willRetry) throw failure;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error("Claude API Fehler");
}

export async function createClaudeStream(system: string, user: string, config: AIConfig, signal: AbortSignal) {
  await reserveAIQuota(system, user, config.max_tokens);
  return getAnthropicClient().messages.stream({
    ...config, system, messages: [{ role: "user", content: user }],
  }, { signal: AbortSignal.any([signal, AbortSignal.timeout(40_000)]) });
}

