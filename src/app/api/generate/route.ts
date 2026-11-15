import { NextRequest } from "next/server";
import { withApiHandler, requireAuth, loadUserCV, parseAndValidateBody } from "@/lib/api-helpers";
import { generateRequestSchema } from "@/lib/schemas";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createLetterResponse } from "@/lib/letter-generation";

export const maxDuration = 90;

export const POST = withApiHandler(async (req: NextRequest) => {
  const { user, supabase } = await requireAuth();
  const input = await parseAndValidateBody(req, generateRequestSchema);
  const cv = await loadUserCV(supabase, user.id);
  await enforceRateLimit(user.id, "generate");
  return createLetterResponse(req, input, cv, user.id, supabase);
});
