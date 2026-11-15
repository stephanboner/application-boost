import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { decryptLetter, encrypt } from "@/lib/encryption";
import { withApiHandler, requireAuth, parseAndValidateBody, ApiErrorResponse } from "@/lib/api-helpers";
import type { Application } from "@/types";

const patchSchema = z.object({
  letter: z.string().min(1).max(20_000).refine((value) => value.trim().length > 0, "Brief darf nicht leer sein").optional(),
  tone: z.enum(["formal", "balanced", "personal"]).optional(),
  language: z.string().min(2).max(8).optional(),
});

// ============================================================
// GET /api/history        – Liste oder Einzeldatensatz (?id=xxx)
// DELETE /api/history?id  – Eintrag löschen
// ============================================================

const APPLICATION_COLUMNS =
  "id, job_title, company, letter_enc, tone, language, word_count, is_exported, created_at, updated_at";

interface ApplicationRow {
  id: string;
  job_title: string;
  company: string;
  letter_enc: string;
  tone: string;
  language: string;
  word_count: number | null;
  is_exported: boolean;
  created_at: string;
  updated_at: string;
}

function rowToApplication(row: ApplicationRow, userId: string, letter: string): Application {
  return {
    id: row.id,
    userId,
    jobTitle: row.job_title,
    company: row.company,
    letter,
    tone: row.tone as Application["tone"],
    language: row.language,
    wordCount: row.word_count ?? undefined,
    isExported: row.is_exported,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safeDecrypt(enc: string, fallback: string): string {
  try {
    return decryptLetter(enc);
  } catch {
    return fallback;
  }
}

export const GET = withApiHandler(async (req: NextRequest) => {
  const { user, supabase } = await requireAuth();
  const { searchParams } = new URL(req.url);

  // Einzeldatensatz
  const id = searchParams.get("id");
  if (id) {
    const { data: row, error } = await supabase
      .from("applications")
      .select(APPLICATION_COLUMNS)
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle<ApplicationRow>();

    if (error) {
      throw new ApiErrorResponse("Bewerbung konnte nicht geladen werden", 500, "SERVER_ERROR");
    }
    if (!row) {
      throw new ApiErrorResponse("Bewerbung nicht gefunden", 404, "NOT_FOUND");
    }

    let letter: string;
    try {
      letter = decryptLetter(row.letter_enc);
      if (!letter.trim()) throw new Error("Empty letter");
    } catch {
      throw new ApiErrorResponse("Brief konnte nicht entschlüsselt werden", 500, "SERVER_ERROR");
    }

    return NextResponse.json({
      application: rowToApplication(row, user.id, letter),
    });
  }

  // Liste
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 50);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  const { data, error } = await supabase
    .from("applications")
    .select(APPLICATION_COLUMNS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)
    .returns<ApplicationRow[]>();

  if (error) {
    throw new ApiErrorResponse("Verlauf konnte nicht geladen werden", 500, "SERVER_ERROR");
  }

  const applications: Application[] = (data ?? []).map((row) =>
    rowToApplication(row, user.id, safeDecrypt(row.letter_enc, "[Brief konnte nicht entschlüsselt werden]"))
  );

  return NextResponse.json({ applications, total: applications.length });
});

export const PATCH = withApiHandler(async (req: NextRequest) => {
  const { user, supabase } = await requireAuth();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) throw new ApiErrorResponse("ID fehlt", 400, "VALIDATION_ERROR");

  const body = await parseAndValidateBody(req, patchSchema);

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.letter !== undefined) {
    update.letter_enc = encrypt(body.letter);
    update.word_count = body.letter.split(/\s+/).filter(Boolean).length;
  }
  if (body.tone !== undefined) update.tone = body.tone;
  if (body.language !== undefined) update.language = body.language;

  const { data: updated, error } = await supabase
    .from("applications")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) throw new ApiErrorResponse("Speichern fehlgeschlagen", 500, "SERVER_ERROR");
  if (!updated) throw new ApiErrorResponse("Bewerbung nicht gefunden", 404, "NOT_FOUND");
  return NextResponse.json({ success: true });
});

export const DELETE = withApiHandler(async (req: NextRequest) => {
  const { user, supabase } = await requireAuth();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    throw new ApiErrorResponse("ID fehlt", 400, "VALIDATION_ERROR");
  }

  const { error } = await supabase
    .from("applications")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    throw new ApiErrorResponse("Löschen fehlgeschlagen", 500, "SERVER_ERROR");
  }

  return NextResponse.json({ success: true });
});
