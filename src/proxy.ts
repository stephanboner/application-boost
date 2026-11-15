import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { routing } from "@/i18n/routing";

const intlMiddleware = createMiddleware(routing);

const PROTECTED_ROUTES = ["/cv", "/apply", "/profile", "/history", "/onboarding"];
const localePattern = /^\/(de|fr|it|en|rm|uk|sr|sq|hr|pt|es)(\/|$)/;

/** Avoid network requests for visitors without this project's session cookie. */
function hasSessionCookie(request: NextRequest): boolean {
  const all = request.cookies.getAll();

  // Exakten Cookie-Namen aus der Supabase-URL ableiten.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (supabaseUrl) {
    try {
      const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
      const base = `sb-${projectRef}-auth-token`;
      if (all.some((c) => c.name === base || c.name.startsWith(base + "."))) {
        return true;
      }
    } catch { /* invalid URL */ }
  }

  return false;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const localeMatch = pathname.match(localePattern);
  const pathWithoutLocale = localeMatch
    ? pathname.replace(`/${localeMatch[1]}`, "") || "/"
    : pathname;

  // Cookie presence is only a hint. Trust the user returned by Supabase.
  let loggedIn = false;
  let supabaseResponse: NextResponse | null = null;
  if (hasSessionCookie(request)) {
    try {
      const result = await updateSession(request);
      loggedIn = result.user !== null;
      supabaseResponse = result.response;
    } catch { /* An unverified session never grants access. */ }
  }

  const withSessionCookies = (response: NextResponse) => {
    for (const cookie of supabaseResponse?.cookies.getAll() ?? []) {
      response.cookies.set(cookie);
    }
    return response;
  };

  // 3. Auth-Schutz für geschützte Routen
  const isProtected = PROTECTED_ROUTES.some((route) =>
    pathWithoutLocale === route || pathWithoutLocale.startsWith(`${route}/`)
  );

  if (isProtected && !loggedIn) {
    const locale = localeMatch?.[1] ?? "de";
    const loginUrl = new URL(`/${locale}/auth`, request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return withSessionCookies(NextResponse.redirect(loginUrl));
  }

  // 4. Eingeloggte Nutzer auf Landing Page oder /auth → direkt zur History.
  //    Ausnahme: /auth/reset-password muss zugänglich bleiben, weil der
  //    User dort durch den Magic-Link 'eingeloggt' ist und das Passwort
  //    ändern muss.
  const isLandingOrAuth =
    pathWithoutLocale === "/" ||
    pathWithoutLocale === "" ||
    pathWithoutLocale === "/auth";

  if (isLandingOrAuth) {
    if (loggedIn) {
      const locale = localeMatch?.[1] ?? "de";
      return withSessionCookies(NextResponse.redirect(new URL(`/${locale}/history`, request.url)));
    }
    return withSessionCookies(intlMiddleware(request));
  }

  // 5. next-intl: Locale-Routing und Redirect von / → /de
  const intlResponse = intlMiddleware(request);

  return withSessionCookies(intlResponse);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|font-licenses/|favicon.ico|manifest.webmanifest|icon$|apple-icon$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

