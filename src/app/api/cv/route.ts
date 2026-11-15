import { NextRequest, NextResponse } from "next/server";
import { encryptJson, decryptJson } from "@/lib/encryption";
import { withApiHandler, requireAuth, parseAndValidateBody, ApiErrorResponse } from "@/lib/api-helpers";
import { cvProfileSchema } from "@/lib/schemas";
import { childLogger } from "@/lib/logger";
import type { CVProfile } from "@/types";

const log = childLogger({ route: "api/cv" });

// ============================================================
// GET /api/cv  – CV des eingeloggten Nutzers abrufen
// PUT /api/cv  – CV aktualisieren (verschlüsselt speichern)
// ============================================================

export const GET = withApiHandler(async () => {
  const { user, supabase } = await requireAuth();

  const { data, error } = await supabase
    .from("cv_profiles")
    .select("parsed_json_enc, has_cv, cv_source, language, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    throw new ApiErrorResponse("CV nicht gefunden", 404, "NOT_FOUND");
  }

  if (!data.has_cv || !data.parsed_json_enc) {
    return NextResponse.json({
      hasCv: false,
      cvSource: data.cv_source,
      language: data.language,
    });
  }

  let cv: CVProfile;
  try {
    cv = decryptJson<CVProfile>(data.parsed_json_enc);
  } catch {
    throw new ApiErrorResponse("CV-Entschlüsselung fehlgeschlagen", 500, "SERVER_ERROR");
  }

  return NextResponse.json({
    ...cv,
    hasCv: data.has_cv,
    cvSource: data.cv_source,
    updatedAt: data.updated_at,
  });
});

export const PUT = withApiHandler(async (req: NextRequest) => {
  const { user, supabase } = await requireAuth();
  const cvData = await parseAndValidateBody(req, cvProfileSchema);

  let encryptedJson: string;
  try {
    encryptedJson = encryptJson(cvData);
  } catch {
    throw new ApiErrorResponse("Verschlüsselung fehlgeschlagen", 500, "SERVER_ERROR");
  }

  const { error } = await supabase
    .from("cv_profiles")
    .upsert({
      user_id: user.id,
      parsed_json_enc: encryptedJson,
      has_cv: true,
      cv_source: cvData.cvSource,
      language: cvData.language,
    }, { onConflict: "user_id" });

  if (error) {
    log.error({ err: error, userId: user.id }, "CV save failed");
    throw new ApiErrorResponse("Speichern fehlgeschlagen", 500, "SERVER_ERROR");
  }

  return NextResponse.json({ success: true });
});
