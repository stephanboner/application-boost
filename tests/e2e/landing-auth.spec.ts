import { test, expect } from "@playwright/test";
import { setMockSessionCookie } from "./_fixtures/mock-api";

// ============================================================
// Landing-Page + Auth-Page (Smoke)
// Stellt sicher, dass die unauthentifizierten Pages rendern und
// die Navigation zur Auth-Page funktioniert.
// ============================================================

test.describe("Landing + Auth", () => {
  test("Landing-Page rendert und zeigt CTA", async ({ page }) => {
    await page.goto("/de");

    // Institutional attribution must not reappear in this independent project.
    await expect(page.getByText(/Kanton Graubünden|\bDVS\b/i)).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Bewerbungsschreiben/i);

    // Mindestens zwei CTAs zur Auth-Page
    const ctas = page.getByRole("link", { name: /Anmelden|Kostenlos starten|Jetzt starten/i });
    await expect(ctas.first()).toBeVisible();
  });

  test("PoC-Banner ist sichtbar, keine Security-Claims mehr", async ({ page }) => {
    await page.goto("/de");

    // PoC-Hinweis-Banner muss da sein (getByRole('alert').first() — Next.js
    // rendert zusätzlich einen leeren Route-Announcer mit role=alert).
    await expect(page.getByText(/Test- und Dummydaten/i)).toBeVisible();
    await expect(page.getByText(/Demoversion \(PoC\)/i)).toBeVisible();

    // Keine Datenschutz-/Verschlüsselungs-Claims mehr auf der Seite
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/verschlüsselt/i);
    expect(body).not.toMatch(/kein tracking/i);
    expect(body).not.toMatch(/sicher in der schweiz/i);
  });

  test("Auth-Page rendert Tab-Switcher", async ({ page }) => {
    await page.goto("/de/auth");

    // Tab-Buttons (Anmelden / Konto erstellen) — wir nehmen .first(), weil der
    // Submit-Button denselben Label trägt (by design).
    await expect(page.getByRole("button", { name: "Anmelden", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Konto erstellen/i }).first()).toBeVisible();

    // Login-Formular: Email- und Passwort-Inputs
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test("Locale-Routing: englische Variante lädt fehlerfrei", async ({ page }) => {
    // Smoke-Test: /en lädt ohne 500 und mindestens das BewerbungsBoost-Logo
    // ist sichtbar (Brand-String ist sprachunabhängig).
    const response = await page.goto("/en");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByText(/BewerbungsBoost/i).first()).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Your cover letter/i);
  });


  // Keep each locale in its own test to avoid the default per-test timeout
  // being shared by eleven page navigations.
  const expectedHeadlines: Array<[string, string]> = [
    ["de", "Ihr Bewerbungsschreiben"],
    ["en", "Your cover letter"],
    ["fr", "Votre lettre de motivation"],
    ["it", "La tua lettera di candidatura"],
    ["es", "Su carta de presentación"],
    ["pt", "A sua carta de candidatura"],
    ["rm", "Vossa brev da candidatura"],
    ["uk", "Ваш супровідний лист"],
    ["sr", "Vaše propratno pismo"],
    ["sq", "Letra juaj e motivimit"],
    ["hr", "Vaše motivacijsko pismo"],
  ];
  for (const [locale, heading] of expectedHeadlines) {
    test(`Landing page renders localized copy in ${locale}`, async ({ page }) => {
      const response = await page.goto(`/${locale}`);
      expect(response?.status(), `${locale} route should load`).toBeLessThan(400);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
    });
  }

  test("a forged session cookie never grants access to protected pages", async ({ page }) => {
    await setMockSessionCookie(page, "forged-token");
    await page.goto("/de/apply");
    await expect(page).toHaveURL(/\/de\/auth/);
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test("a forged session on the auth page does not cause a redirect loop", async ({ page }) => {
    await setMockSessionCookie(page, "forged-token");
    await page.goto("/de/auth");
    await expect(page).toHaveURL(/\/de\/auth$/);
  });

  test("Abmelden löscht den lokalen Entwurf und leitet mit GET zur Anmeldung", async ({ page }) => {
    await setMockSessionCookie(page);
    await page.goto("/de/profile");
    await page.evaluate(() => sessionStorage.setItem("bewerbungsboost-flow", JSON.stringify({
      state: { letter: "Persönlicher Entwurf aus der vorherigen Sitzung" }, version: 0,
    })));
    const redirected = page.waitForResponse(response =>
      response.url().endsWith("/de/auth") && response.request().isNavigationRequest()
    );
    await page.getByRole("button", { name: "Abmelden", exact: true }).click();
    const response = await redirected;
    expect(response.status()).toBe(200);
    expect(response.request().method()).toBe("GET");
    await expect(page).toHaveURL(/\/de\/auth$/);
    expect(await page.evaluate(() => sessionStorage.getItem("bewerbungsboost-flow"))).toBeNull();
  });
});

