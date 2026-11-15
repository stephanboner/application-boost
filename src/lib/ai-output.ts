import "server-only";
import type { ZodTypeAny, z } from "zod";

/** Contains categories only, never the provider response or rejected values. */
export class AIOutputError extends Error {
  constructor(public readonly stage: "json" | "schema") {
    super(stage === "json" ? "Ungültige JSON-Antwort der KI" : "KI-Antwort entspricht nicht dem erwarteten Format");
  }
}

/** Validate the whole response; do not salvage fragments from broken JSON. */
export function parseAIOutput<S extends ZodTypeAny>(text: string, schema: S): z.infer<S> {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  let value: unknown;
  try {
    value = JSON.parse(clean);
  } catch {
    throw new AIOutputError("json");
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    // Zod errors can contain user-supplied values: keep them out of logs.
    throw new AIOutputError("schema");
  }
  return result.data;
}
