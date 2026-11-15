// ============================================================
// Shared helpers für API-Routes
// Entfernt Boilerplate (Auth-Check, CV-Laden, Error-Responses)
// ============================================================

import { NextResponse } from "next/server";
import type { ZodTypeAny, z } from "zod";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { decryptJson } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import type { ApiError, CVProfile } from "@/types";
import { cvProfileSchema } from "@/lib/schemas";
import { randomUUID } from "node:crypto";
import { requestContext } from "@/lib/request-context";

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Fehler, der von requireAuth/loadUserCV etc. geworfen wird.
 * Wird vom withApiHandler-Wrapper abgefangen und in eine JSON-Response umgewandelt.
 */
export class ApiErrorResponse extends Error {
  constructor(
    public readonly message: string,
    public readonly status: number,
    public readonly code?: ApiError["code"],
    public readonly retryAfter?: number
  ) {
    super(message);
  }
}

// --- Response-Helpers ---

export function apiError(
  message: string,
  status: number,
  code?: ApiError["code"],
  retryAfter?: number
): NextResponse<ApiError> {
  const body: ApiError = { error: message, code, retryAfter };
  const headers: Record<string, string> = {};
  if (retryAfter) headers["Retry-After"] = String(retryAfter);
  return NextResponse.json<ApiError>(body, { status, headers });
}

/**
 * Wrapper für API-Route-Handler. Fängt ApiErrorResponse automatisch ab und
 * gibt eine saubere JSON-Response zurück. Auch unerwartete Fehler werden geloggt
 * und als 500 serialisiert.
 */
export function withApiHandler<TArgs extends unknown[], TResponse extends Response>(
  handler: (...args: TArgs) => Promise<TResponse>
) {
  return async (...args: TArgs): Promise<Response> => {
    const requestId = randomUUID();
    return requestContext.run({ requestId }, async () => {
      const started = Date.now();
      let response: Response;
      try {
        response = await handler(...args);
      } catch (err) {
        if (err instanceof ApiErrorResponse) {
          response = apiError(err.message, err.status, err.code, err.retryAfter);
        } else {
          logger.error({ err }, "Unhandled API error");
          response = apiError("Interner Fehler", 500, "SERVER_ERROR");
        }
      }
      response.headers.set("X-Request-ID", requestId);
      const request = args[0] instanceof Request ? args[0] : null;
      const fields = { status: response.status, durationMs: Date.now() - started,
        route: request ? new URL(request.url).pathname : undefined };
      if (response.status >= 500) logger.error(fields, "API request failed");
      else logger.info(fields, "API request handled");
      return response;
    });
  };
}

// --- Auth ---

export async function requireAuth(): Promise<{
  user: User;
  supabase: SupabaseServerClient;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new ApiErrorResponse("Nicht angemeldet", 401, "UNAUTHORIZED");
  }
  return { user, supabase };
}

// --- CV laden + entschlüsseln ---

export async function loadUserCV(
  supabase: SupabaseServerClient,
  userId: string
): Promise<CVProfile> {
  const { data: cvRow } = await supabase
    .from("cv_profiles")
    .select("parsed_json_enc, has_cv")
    .eq("user_id", userId)
    .maybeSingle();

  if (!cvRow?.has_cv || !cvRow.parsed_json_enc) {
    throw new ApiErrorResponse(
      "CV nicht gefunden. Bitte Profil einrichten.",
      404,
      "NOT_FOUND"
    );
  }

  try {
    const validated = cvProfileSchema.parse(decryptJson<unknown>(cvRow.parsed_json_enc));
    return { ...validated, userId, hasCv: true };
  } catch {
    throw new ApiErrorResponse(
      "CV-Entschlüsselung fehlgeschlagen",
      500,
      "SERVER_ERROR"
    );
  }
}

// --- JSON-Body parsen ---

export async function parseJsonBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiErrorResponse("Ungültige Anfrage", 400, "VALIDATION_ERROR");
  }
}

/**
 * Parst den Request-Body und validiert ihn mit einem Zod-Schema.
 * Wirft bei Schema-Verletzung eine 400-Response mit der ersten Fehlermeldung.
 */
export async function parseAndValidateBody<S extends ZodTypeAny>(
  req: Request,
  schema: S
): Promise<z.infer<S>> {
  const raw = await parseJsonBody<unknown>(req);
  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first.path.length ? `${first.path.join(".")}: ` : "";
    throw new ApiErrorResponse(
      `${path}${first.message}`,
      400,
      "VALIDATION_ERROR"
    );
  }
  return result.data;
}

