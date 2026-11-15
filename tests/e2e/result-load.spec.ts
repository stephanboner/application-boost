import { test, expect } from "@playwright/test";
import {
  createMockState,
  mockApiRoutes,
  setMockSessionCookie,
} from "./_fixtures/mock-api";

// ============================================================
// Result-Page laden aus History (Smoke)
// Deckt: ?id=… lädt eine Bewerbung, Briefkopf rendert mit
// Empfänger, Datum und Brieftext.
// ============================================================

test.describe("Result-Page aus History", () => {
  test.beforeEach(async ({ page }) => {
    await setMockSessionCookie(page);
    await mockApiRoutes(page, createMockState());
  });

  test("Lädt Bewerbung anhand der ID und zeigt Brieftext", async ({ page }) => {
    await page.goto("/de/apply/result?id=00000000-0000-0000-0000-000000000001");

    // Topbar zeigt Jobtitel
    await expect(page.getByText(/Sachbearbeiter\/in/i).first()).toBeVisible({ timeout: 7000 });

    // Brieftext-Auszug
    await expect(page.getByText(/Sehr geehrte Damen und Herren/i)).toBeVisible();
    await expect(page.getByText(/Maria Muster/i).first()).toBeVisible();

    // Sidebar: Passgenauigkeit, Sprache, Tone-Pills
    await expect(page.getByText(/Übereinstimmung/i)).toBeVisible();

    // Tone-Pills (Formell / Ausgewogen / Persönlich) — exact match, weil
    // "↺ Ausgewogen-Variante neu generieren" ebenfalls existiert.
    await expect(page.getByRole("button", { name: "Formell", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ausgewogen", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Persönlich", exact: true })).toBeVisible();
  });

  test("Brief ist editierbar und triggert Auto-Save-Status", async ({ page }) => {
    await page.goto("/de/apply/result?id=00000000-0000-0000-0000-000000000001");

    // Warten bis Brief geladen ist
    await expect(page.getByText(/Sehr geehrte Damen und Herren/i)).toBeVisible({ timeout: 7000 });

    // Brieftext editieren
    const textarea = page.locator("textarea").first();
    await textarea.focus();
    await textarea.press("End");
    await textarea.type(" Zusatz.", { delay: 30 });

    // Save-Status erscheint ('Speichert…' oder '✓ Gespeichert')
    await expect(
      page.getByText(/Speichert|Gespeichert/i)
    ).toBeVisible({ timeout: 5000 });
  });
});
