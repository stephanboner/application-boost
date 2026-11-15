import { NextRequest, NextResponse } from "next/server";
import { callClaude, AI_CONFIG } from "@/lib/anthropic";
import { buildCVParserPrompt } from "@/lib/prompts";
import { withApiHandler, requireAuth, ApiErrorResponse } from "@/lib/api-helpers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { MAX_CV_UPLOAD_BYTES, CV_UPLOAD_TYPES } from "@/lib/upload-limits";
import { cvImportSchema } from "@/lib/schemas";
import { parseAIOutput } from "@/lib/ai-output";
import { childLogger } from "@/lib/logger";

const log = childLogger({ route: "api/cv/parse-upload" });

export const maxDuration = 60;

export const POST = withApiHandler(async (request: NextRequest) => {
  const { user } = await requireAuth();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw new ApiErrorResponse("Ungültige Anfrage", 400, "VALIDATION_ERROR");
  }

  const file = formData.get("file") as File | null;
  if (!(file instanceof File)) {
    throw new ApiErrorResponse("Keine Datei übermittelt", 400, "VALIDATION_ERROR");
  }

  if (!CV_UPLOAD_TYPES.some((type) => type === file.type)) {
    throw new ApiErrorResponse(
      "Nur PDF und Word-Dateien (.docx) sind erlaubt",
      400,
      "VALIDATION_ERROR"
    );
  }

  if (file.size > MAX_CV_UPLOAD_BYTES) {
    throw new ApiErrorResponse("Datei zu gross (max. 4 MB)", 413, "VALIDATION_ERROR");
  }

  await enforceRateLimit(user.id, "parse-cv");

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let rawText = "";
  try {
    if (file.type === "application/pdf") {
      const pdfParse = (await import("pdf-parse")).default;
      // Legacy PDF.js assumes slice() copies bytes. Buffer.slice() returns a
      // shared view and can corrupt cross-reference parsing on valid PDFs.
      // @types/pdf-parse only declares Buffer; its implementation also accepts Uint8Array.
      const parseBytes = pdfParse as (data: Uint8Array) => ReturnType<typeof pdfParse>;
      const result = await parseBytes(new Uint8Array(arrayBuffer));
      rawText = result.text;
    } else {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      rawText = result.value;
    }
  } catch {
    throw new ApiErrorResponse("Datei konnte nicht gelesen werden", 422);
  }

  if (!rawText.trim()) {
    throw new ApiErrorResponse(
      "Kein Text in der Datei gefunden. Bitte prüfen Sie, ob der Lebenslauf Text enthält.",
      422
    );
  }

  const prompt = buildCVParserPrompt(rawText);

  let jsonText: string;
  try {
    jsonText = await callClaude(prompt.system, prompt.user, AI_CONFIG.cvParser);
  } catch (err) {
    if (err instanceof ApiErrorResponse) throw err;
    log.error({ failureCode: "AI_UNKNOWN" }, "CV analysis failed unexpectedly");
    throw new ApiErrorResponse(
      "CV-Analyse fehlgeschlagen. Bitte erneut versuchen.",
      500,
      "AI_UNKNOWN"
    );
  }

  let parsed;
  try {
    parsed = parseAIOutput(jsonText, cvImportSchema);
  } catch {
    log.error({ failureCode: "AI_INVALID_OUTPUT" }, "CV analysis returned invalid profile data");
    throw new ApiErrorResponse(
      "CV-Analyse ergab kein gültiges Ergebnis. Bitte erneut versuchen.",
      502,
      "AI_INVALID_OUTPUT"
    );
  }

  return NextResponse.json({ cv: parsed });
});

