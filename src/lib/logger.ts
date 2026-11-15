// ============================================================
// Strukturiertes Logging (pino)
// Produktions-Output: JSON auf stdout (Vercel captured)
// Dev-Output: pretty-printed via pino-pretty
// ============================================================

import pino, { type Logger } from "pino";
import { requestContext } from "@/lib/request-context";

const isDev = process.env.NODE_ENV !== "production";

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
  base: { service: "bewerbungsboost" },
  mixin: () => requestContext.getStore() ?? {},
  serializers: {
    err: (err: unknown) => {
      const value = err as { name?: unknown; status?: unknown; code?: unknown } | null;
      return { type: typeof value?.name === "string" ? value.name : "ServiceError",
        status: typeof value?.status === "number" ? value.status : undefined,
        code: typeof value?.code === "string" && /^[A-Z0-9_]{1,80}$/.test(value.code) ? value.code : undefined };
    },
  },
  redact: { paths: ["password", "token", "apiKey", "cv", "letter", "body", "prompt", "system", "user",
    "headers.authorization", "headers.cookie", "*.password", "*.token", "*.apiKey"], remove: true },
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss" },
        },
      }
    : {}),
});

/**
 * Child-Logger mit festem Kontext (z. B. `{ route: "api/generate" }`).
 * Alle Felder landen in jedem Log-Event.
 */
export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}

