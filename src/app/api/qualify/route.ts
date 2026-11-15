import { NextRequest, NextResponse } from "next/server";
import { assessCVWithJob } from "@/lib/cv-matching";
import { withApiHandler, requireAuth, loadUserCV, parseAndValidateBody } from "@/lib/api-helpers";
import { qualifyRequestSchema } from "@/lib/schemas";
import { enforceRateLimit } from "@/lib/rate-limit";
export const maxDuration = 60;

// POST /api/qualify – CV-Matcher gegen geparsten Job
export const POST = withApiHandler(async (req: NextRequest) => {
  const { user, supabase } = await requireAuth();
  const { jobData } = await parseAndValidateBody(req, qualifyRequestSchema);

  const cv = await loadUserCV(supabase, user.id);
  await enforceRateLimit(user.id, "qualify");

  const match = await assessCVWithJob(cv, jobData);
  return NextResponse.json({ success: true, match, matchStatus: "available" });
});

