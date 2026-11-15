import { NextResponse } from "next/server";
import { withApiHandler, ApiErrorResponse } from "@/lib/api-helpers";
import { createServiceClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/encryption";

export const dynamic = "force-dynamic";
export const GET = withApiHandler(async () => {
  if (!process.env.ANTHROPIC_API_KEY) throw new ApiErrorResponse("Dienst nicht verfügbar", 503, "SERVER_ERROR");
  encrypt("healthcheck");
  const { error } = await createServiceClient().from("ai_usage_daily").select("day", { head: true }).limit(0);
  if (error) throw new ApiErrorResponse("Dienst nicht verfügbar", 503, "SERVER_ERROR");
  return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
});
