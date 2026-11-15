import { test, expect } from "@playwright/test";
import { createMockState, mockApiRoutes, setMockSessionCookie } from "./_fixtures/mock-api";

// ============================================================
// Passwort-Reset-Flow (Smoke)
//
// Wir testen die UI-Schritte, die keine echte E-Mail-Zustellung benötigen:
// 1. Auth-Page → "Passwort vergessen?"-Link öffnet Forgot-Form
// 2. E-Mail eingeben → Submit (Supabase-Endpoint wird gemockt)
// 3. Erfolgs-Banner erscheint
// 4. Reset-Page (direkter Aufruf ohne Token) zeigt 'Link ungültig'
// ============================================================

test.describe("Passwort-Reset", () => {
  test("Forgot-Link öffnet Forgot-Form und sendet Reset-Anfrage", async ({ page }) => {
    // Supabase-Reset-Endpoint mocken (POST /auth/v1/recover)
    await page.route("**/auth/v1/recover**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      })
    );

    await page.goto("/de/auth");

    // "Passwort vergessen?"-Link klicken
    await page.getByRole("button", { name: /Passwort vergessen/i }).click();

    // Forgot-Form ist sichtbar
    await expect(page.getByRole("heading", { name: /Passwort zurücksetzen/i })).toBeVisible();

    // E-Mail eingeben & abschicken
    await page.locator('input[type="email"]').fill("user@example.ch");
    await page.getByRole("button", { name: /Reset-Link senden/i }).click();

    // Erfolgs-Banner (Anti-Enumeration-Wording)
    await expect(
      page.getByText(/E-Mail-Adresse bei uns registriert ist, haben wir Ihnen/i)
    ).toBeVisible({ timeout: 5000 });
  });

  test("Reset-Page ohne Token zeigt 'Link ungültig'", async ({ page }) => {
    // Supabase Session-Check mocken: keine Session → wir landen im 'invalid'-State
    await page.route("**/auth/v1/user**", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ message: "no session" }),
      })
    );

    await page.goto("/de/auth/reset-password");

    // No session means invalid once SDK initialization and verification finish.
    await expect(
      page.getByText(/Link ist ungültig oder abgelaufen/i)
    ).toBeVisible({ timeout: 8000 });

    // Zurück-zur-Login-Button ist sichtbar
    await expect(page.getByRole("button", { name: /Anmelden/i })).toBeVisible();
  });
});

const testUser = {
  id: "00000000-0000-0000-0000-000000000099", email: "maria@example.invalid",
  aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};

for (const { delay, expires } of [{ delay: 0, expires: false }, { delay: 4000, expires: false }, { delay: 0, expires: true }]) {
  test(expires ? "Abgelaufene Recovery-Sitzung erlaubt eine neue Link-Anforderung" : `Gültiger PKCE-Reset nach ${delay}ms erlaubt Passwortänderung`, async ({ page }) => {
    await mockApiRoutes(page, createMockState());
    await page.context().addCookies([{
      name: "sb-127-auth-token-code-verifier", value: "base64-" + Buffer.from(JSON.stringify("test-verifier/recovery")).toString("base64url"),
      domain: "localhost", path: "/", sameSite: "Lax",
    }]);
    let exchanges = 0;
    let updates = 0;
    await page.route("**/auth/v1/token**", async (route) => {
      exchanges++;
      expect(route.request().postDataJSON().auth_code).toBe("test-recovery-code");
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({
        access_token: "mock-token", refresh_token: "mock-refresh", token_type: "bearer",
        expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: testUser,
      }) });
    });
    await page.route("**/auth/v1/user**", (route) => {
      if (route.request().method() === "PUT") {
        updates++;
        expect(route.request().postDataJSON().password).toBe("New-test-password-2026!");
        if (expires) return route.fulfill({ status: 401, contentType: "application/json", body: '{"code":"session_not_found","message":"Session expired"}' });
      }
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(testUser) });
    });
    await page.goto("/de/auth/reset-password?code=test-recovery-code");
    await expect(page.getByLabel("Passwort", { exact: true })).toBeVisible({ timeout: 12000 });
    await expect(page.getByText(/Link ist ungültig oder abgelaufen/)).not.toBeVisible();
    expect(new URL(page.url()).search).toBe("");
    await page.getByLabel("Passwort", { exact: true }).fill("New-test-password-2026!");
    await page.getByLabel("Passwort wiederholen", { exact: true }).fill("New-test-password-2026!");
    await page.getByRole("button", { name: "Passwort ändern", exact: true }).click();
    if (expires) {
      await expect(page.getByText(/Link ist ungültig oder abgelaufen/)).toBeVisible();
      await expect(page.locator('input[type="password"]')).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Reset-Link senden", exact: true })).toBeVisible();
    } else {
      await expect(page.getByText(/Passwort geändert/)).toBeVisible();
    }
    expect(exchanges).toBe(1);
    expect(updates).toBe(1);
  });
}

for (const location of ["query", "fragment"]) {
  test(`Abgelaufener Link (${location}) überstimmt bestehende Session und erlaubt einen neuen Link`, async ({ page }) => {
    await setMockSessionCookie(page);
    let requests = 0;
    await page.route("**/auth/v1/recover**", (route) => {
      requests++;
      expect(route.request().postDataJSON().email).toBe("maria@example.invalid");
      expect(new URL(route.request().url()).searchParams.get("redirect_to")).toBe(`${new URL(page.url()).origin}/de/auth/reset-password`);
      return route.fulfill({ contentType: "application/json", body: "{}" });
    });
    const params = "error=access_denied&error_code=otp_expired&error_description=Email+link+has+expired";
    await page.goto("/de/auth/reset-password" + (location === "query" ? "?" : "#") + params);
    await expect(page.getByText(/Link ist ungültig oder abgelaufen/)).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe("");
    expect(new URL(page.url()).search).toBe("");
    await page.getByRole("textbox", { name: "E-Mail" }).fill("maria@example.invalid");
    await page.getByRole("button", { name: "Reset-Link senden", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Falls die E-Mail-Adresse bei uns registriert ist");
    expect(requests).toBe(1);
  });
}

test("PKCE-Link ohne passenden Browser-Verifier verwendet keine bestehende Session", async ({ page }) => {
  await setMockSessionCookie(page);
  await page.goto("/de/auth/reset-password?code=code-from-another-browser");
  await expect(page.getByText(/Link ist ungültig oder abgelaufen/)).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test("Älterer impliziter Recovery-Link wird verifiziert und aus der URL entfernt", async ({ page }) => {
  await mockApiRoutes(page, createMockState());
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const jwt = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: testUser.id, exp: Math.floor(Date.now() / 1000) + 3600 })}.c2lnbmF0dXJl`;
  await page.goto(`/de/auth/reset-password#type=recovery&access_token=${jwt}&refresh_token=test-refresh`);
  await expect(page.getByLabel("Passwort", { exact: true })).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
});

test("Rücksetz-Anfrage zeigt ein Sendelimit und lässt die E-Mail stehen", async ({ page }) => {
  await page.route("**/auth/v1/recover**", (route) => route.fulfill({
    status: 429, contentType: "application/json", body: '{"code":"over_email_send_rate_limit","message":"Rate limit"}',
  }));
  await page.goto("/de/auth/reset-password#error_code=otp_expired");
  await page.getByRole("textbox", { name: "E-Mail" }).fill("maria@example.invalid");
  await page.getByRole("button", { name: "Reset-Link senden", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Zu viele Anfragen" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "E-Mail" })).toHaveValue("maria@example.invalid");
});
