import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { routing } from "@/i18n/routing";

// Locale-Pattern dynamisch aus der Routing-Konfiguration ableiten,
// damit beim Hinzufügen einer Sprache hier nichts vergessen wird.
const localePattern = new RegExp(`/(${routing.locales.join("|")})(/|$)`);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // Locale aus Referer-Header ermitteln, damit nicht-deutschsprachige Nutzer
  // auf die richtige Seite weitergeleitet werden
  const referer = req.headers.get("referer") ?? "";
  const match = referer.match(localePattern);
  const locale = match?.[1] ?? "de";

  return NextResponse.redirect(
    new URL(`/${locale}/auth`, req.nextUrl.origin),
    303
  );
}

