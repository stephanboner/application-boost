import { test, expect } from "@playwright/test";
import {
  createMockState,
  mockApiRoutes,
  setMockSessionCookie,
} from "./_fixtures/mock-api";

// ============================================================
// Mobile-Layout (Smoke)
//
// Läuft im iPhone-13-Viewport (siehe playwright.config.ts).
// Stellt sicher, dass:
// - Die Sidebar auf Mobile NICHT sichtbar ist
// - Die Bottom-Nav stattdessen erscheint
// - Der Mobile-Header (slim) sichtbar ist
// - Kein horizontales Scrollen entsteht
// ============================================================

test.describe("Mobile-Layout (iPhone)", () => {
  test.beforeEach(async ({ page }) => {
    await setMockSessionCookie(page);
    await mockApiRoutes(page, createMockState());
  });

  test("Apply-Page: Sidebar versteckt, Bottom-Nav sichtbar", async ({ page }) => {
    await page.goto("/de/apply");

    // Die Desktop-Sidebar ist hidden md:flex — auf iPhone unsichtbar
    const sidebar = page.locator("aside.hidden.md\\:flex");
    await expect(sidebar).toBeHidden();

    // Bottom-Nav ist sichtbar (3 Items: Bewerbung / Verlauf / Profil)
    await expect(page.getByRole("link", { name: /Bewerbung/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Meine Bewerbungen/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Mein Profil/i }).first()).toBeVisible();
  });

  test("Apply-Page: kein horizontales Scrolling", async ({ page }) => {
    await page.goto("/de/apply");
    // Layout darf nicht breiter sein als der Viewport (390px iPhone 13)
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1); // ±1px Toleranz
  });

  test("Result-Page: Topbar wrappt, Brief füllt Mobile-Breite", async ({ page }) => {
    await page.goto("/de/apply/result?id=00000000-0000-0000-0000-000000000001");

    // Tone-Pills sichtbar (sollten nach unten gewrappt sein)
    await expect(page.getByRole("button", { name: "Formell", exact: true })).toBeVisible({ timeout: 7000 });

    // Brief-Stage sichtbar
    await expect(page.getByText(/Sehr geehrte Damen und Herren/i)).toBeVisible();

    // Sidebar ist unter dem Brief (gestackt) — Passgenauigkeit-Card sichtbar
    await expect(page.getByText(/Übereinstimmung/i)).toBeVisible();

    // Kein horizontales Scrolling
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  // NOTE: History- und Profile-Pages sind Server-Components mit direktem
  // Supabase-Auth-Check. Ohne echte Supabase-Verbindung redirecten sie zur
  // Auth-Page und lassen sich daher nicht in E2E-Smoke-Tests prüfen.
  // Apply + Result decken das Mobile-Layout aus dem AppShell schon ab.

  test("Landing-Page: Headline lesbar, CTA touchbar", async ({ page }) => {
    // Logout-Cookie nicht setzen → unauthentifizierter View
    await page.context().clearCookies();
    await page.goto("/de");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Bewerbungsschreiben/i);

    // CTA-Button ist sichtbar und mindestens 44px hoch (Touch-Target)
    const cta = page.getByRole("link", { name: /Jetzt kostenlos starten/i }).first();
    await expect(cta).toBeVisible();
    const box = await cta.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });
});
