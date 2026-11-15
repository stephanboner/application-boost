import { test, expect } from "@playwright/test";
import {
  createMockState,
  mockApiRoutes,
  setMockSessionCookie,
} from "./_fixtures/mock-api";

// ============================================================
// Apply-Flow (Smoke)
// Deckt den Happy-Path ab: Apply → Parse → Qualify → Generate → Result
// mit gemockter Anthropic-/Supabase-API.
// ============================================================

test.describe("Apply-Flow (eingeloggt)", () => {
  test.beforeEach(async ({ page }) => {
    await setMockSessionCookie(page);
    await mockApiRoutes(page, createMockState());
  });

  test("Apply-Page rendert mit Recent-Drafts und Input-Panel", async ({ page }) => {
    await page.goto("/de/apply");

    // Linke Spalte: Input + Tab-Switch
    await expect(page.getByRole("button", { name: /Link/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Text/i }).first()).toBeVisible();

    // Rechte Spalte: 'Letzte Bewerbungen' aus dem Mock-State
    await expect(page.getByText(/Letzte Bewerbungen/i)).toBeVisible();
    await expect(page.getByText(/Kanton Graubünden/i)).toBeVisible(); // Fictional employer in the mock data
  });

  test("Job-Text einfügen → Stelle wird erkannt → Generate-Button aktiv", async ({ page }) => {
    await page.goto("/de/apply");

    // Auf Text-Tab wechseln
    await page.getByRole("button", { name: /Text/i }).first().click();

    // Stellentext einfügen (genug Zeichen, sonst greift die Min-Length-Validation)
    const longText =
      "Wir suchen eine Sachbearbeiterin (80-100%) für unsere Verwaltung in Chur. " +
      "Voraussetzungen: KV-Abschluss, gute MS-Office-Kenntnisse, Deutsch als Muttersprache. " +
      "Aufgaben umfassen Schriftverkehr, Aktenführung und Telefonzentrale. Wir freuen uns auf Ihre Bewerbung.";
    await page.locator("textarea").first().fill(longText);

    // Stelle analysieren
    await page.getByRole("button", { name: /Stelle analysieren/i }).click();

    // Erkennungs-Card erscheint (animate-fade-up). Wir greifen den
    // spezifischen "80–100%"-Text, weil "Sachbearbeiter/in" alleine auch
    // in der Recent-Drafts-Liste vorkommt.
    await expect(page.getByText(/Erkannt/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Sachbearbeiter\/in 80.100%/i)).toBeVisible();

    // Generate-Button wird sichtbar
    await expect(
      page.getByRole("button", { name: /Bewerbungsschreiben erstellen/i })
    ).toBeVisible();
  });

  test("Vollständiger Stream führt zum gespeicherten Ergebnis", async ({ page }) => {
    await seedJob(page);
    await page.goto("/de/apply/generating");
    await expect(page).toHaveURL(/\/de\/apply\/result/);
    await expect(page.locator("textarea").first()).toHaveValue(/Sehr geehrte Frau Meier/);
  });

  test("Abgebrochener Stream zeigt einen Fehler statt eines Teil-Ergebnisses", async ({ page }) => {
    await page.route("**/api/generate", (route) => route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: 'event: chunk\ndata: "Unvollständiges Schreiben"\n\n',
    }));
    await seedJob(page);
    await page.goto("/de/apply/generating");
    await expect(page.getByRole("button", { name: "Nochmal versuchen" })).toBeVisible();
    await expect(page).toHaveURL(/\/de\/apply\/generating/);
    await expect(page.getByText("Unvollständiges Schreiben")).not.toBeVisible();
  });
});

async function seedJob(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem("bewerbungsboost-flow", JSON.stringify({
      state: {
        parsedJob: {
          title: "Sachbearbeiter/in 80–100%",
          company: "Kanton Graubünden",
          location: "Chur",
          tasks: ["Schriftverkehr"],
          mustHave: ["KV-Abschluss"],
          niceToHave: [],
          tone: "formal",
          language: "de",
        },
        selectedTone: "balanced",
        selectedLength: "standard",
        selectedLetterLanguage: "de",
        qualifyAnswers: [],
      },
      version: 0,
    }));
  });
}


test("Stellenimport zeigt Fehlerreferenz, behält Eingabe und erlaubt Wiederholung", async ({ page }) => {
  await setMockSessionCookie(page);
  await mockApiRoutes(page, createMockState());
  const requestId = "11111111-2222-4333-8444-555555555555";
  let attempts = 0;
  await page.route("**/api/parse-job", (route) => route.fulfill({
    status: ++attempts === 1 ? 500 : 200, contentType: "application/json", headers: { "X-Request-ID": requestId },
    body: JSON.stringify(attempts === 1 ? { error: "Interner Fehler", code: "SERVER_ERROR" } : {
      success: true, job: { title: "Strategische Leitung", company: "Testinstitut", tasks: ["Strategie entwickeln"], mustHave: [], niceToHave: [] },
    }),
  }));
  await page.goto("/de/apply");
  const url = "https://ch.finder.work/vacancy/273471502";
  await page.locator('input[type="url"]').fill(url);
  await page.getByRole("button", { name: "→ Stelle analysieren", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Fehlerreferenz:" })).toContainText(`SERVER_ERROR · ${requestId}`);
  await expect(page.locator('input[type="url"]')).toHaveValue(url);
  await page.getByRole("button", { name: "→ Stelle analysieren", exact: true }).click();
  await expect(page.getByText("Strategische Leitung", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Fehlerreferenz:" })).not.toBeVisible();
});

test("Stellenimport verarbeitet HTML-Fehler ohne Verlust der Referenz", async ({ page }) => {
  await setMockSessionCookie(page);
  await mockApiRoutes(page, createMockState());
  const requestId = "11111111-2222-4333-8444-555555555555";
  await page.route("**/api/parse-job", (route) => route.fulfill({
    status: 502, contentType: "text/html", headers: { "X-Request-ID": requestId }, body: "<html>PRIVATE_GATEWAY_BODY</html>",
  }));
  await page.goto("/de/apply");
  await page.locator('input[type="url"]').fill("https://example.ch/job");
  await page.getByRole("button", { name: "→ Stelle analysieren", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Fehlerreferenz:" })).toContainText(requestId);
  await expect(page.getByText("PRIVATE_GATEWAY_BODY")).not.toBeVisible();
});

test("Freiwillige Motivation bleibt beim Matching-Retry erhalten und erreicht die Generierung", async ({ page }) => {
  await setMockSessionCookie(page);
  await mockApiRoutes(page, createMockState());
  let attempts = 0;
  await page.route("**/api/qualify", (route) => route.fulfill({
    status: ++attempts === 1 ? 503 : 200, contentType: "application/json",
    body: JSON.stringify(attempts === 1 ? { code: "AI_TIMEOUT" } : { success: true, match: { topMatches: [], gaps: [], keywords: [], matchScore: 70 } }),
  }));
  await seedJob(page);
  await page.goto("/de/apply/qualify");
  const motivation = "Ich möchte Forschung und Verwaltung verbinden.";
  const field = page.getByRole("textbox", { name: "Ihre Motivation (optional)", exact: true });
  await field.fill(motivation);
  await page.getByRole("button", { name: "Nochmal versuchen", exact: true }).click();
  await expect(page.getByText("70% Match", { exact: true })).toBeVisible();
  await expect(field).toHaveValue(motivation);
  const request = page.waitForRequest("**/api/generate");
  await page.getByRole("button", { name: "Bewerbungsschreiben erstellen", exact: true }).click();
  expect((await request).postDataJSON().qualifyAnswers).toContainEqual({ requirement: "Motivation für Stelle und Arbeitgeber", answer: motivation });
});


test("Platzhalter-Stelle wird nicht als erkannt angezeigt und Texteingabe bleibt möglich", async ({ page }) => {
  await setMockSessionCookie(page);
  await mockApiRoutes(page, createMockState());
  await page.route("**/api/parse-job", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ success: true,
      job: { title: "Unbekannt", company: "Unbekannt", tasks: [], mustHave: [], niceToHave: [] } }),
  }));
  await page.goto("/de/apply");
  await page.locator('input[type="url"]').fill("https://ch.finder.work/vacancy/273471502");
  await page.getByRole("button", { name: "→ Stelle analysieren", exact: true }).click();
  await expect(page.getByText("Kein Stelleninserat erkannt. Bitte prüfen Sie Ihre Eingabe.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Bewerbungsschreiben erstellen/ })).not.toBeVisible();
  await page.getByRole("button", { name: /Text/i }).first().click();
  await expect(page.locator("textarea").first()).toBeVisible();
});
