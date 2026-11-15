import { NextRequest, NextResponse } from "next/server";
import { withApiHandler, requireAuth, ApiErrorResponse } from "@/lib/api-helpers";
import { createServiceClient } from "@/lib/supabase/server";

export const DELETE = withApiHandler(async (req: NextRequest) => {
  const { user } = await requireAuth();
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).origin !== new URL(req.url).origin) {
    throw new ApiErrorResponse("Ungültiger Ursprung", 403, "UNAUTHORIZED");
  }
  const { error } = await createServiceClient().rpc("delete_user_poc_data", { p_user_id: user.id });
  if (error) throw error;
  return NextResponse.json({ success: true });
});
