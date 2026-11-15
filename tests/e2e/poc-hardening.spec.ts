import { test, expect, type Page } from "@playwright/test";
import { createMockState, mockApiRoutes, setMockSessionCookie } from "./_fixtures/mock-api";

test.beforeEach(async ({ page }) => {
  await setMockSessionCookie(page);
  await mockApiRoutes(page, createMockState());
});

test("CV über 4 MB wird bereits vor dem Upload abgewiesen", async ({ page }) => {
  let uploads = 0;
  await page.route("**/api/cv/parse-upload", (route) => {
    uploads++;
    return route.fulfill({ status: 500 });
  });
  await page.goto("/de/cv");
  await page.getByRole("button", { name: /Lebenslauf hochladen/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "oversized.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(4 * 1024 * 1024 + 1),
  });
  await expect(page.getByText("Datei zu gross (max. 4 MB).", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Lebenslauf analysieren/ })).not.toBeVisible();
  expect(uploads).toBe(0);
});

test("CV-KI-Fehler zeigt Referenz und erlaubt einen erfolgreichen erneuten Upload", async ({ page }) => {
  const requestId = "11111111-2222-4333-8444-555555555555";
  const uploadError = page.getByRole("alert").filter({ hasText: "Fehlerreferenz:" });
  let uploads = 0;
  await page.route("**/api/cv/parse-upload", (route) => {
    uploads++;
    return route.fulfill({
      status: uploads === 1 ? 504 : 200, contentType: "application/json", headers: { "X-Request-ID": requestId },
      body: JSON.stringify(uploads === 1
        ? { error: "Die KI hat nicht rechtzeitig geantwortet. Bitte erneut versuchen.", code: "AI_TIMEOUT" }
        : { cv: { ...createMockState().cv, firstName: "Testimport" } }),
    });
  });
  await page.goto("/de/cv");
  await page.getByRole("button", { name: /Lebenslauf hochladen/ }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "test-cv.pdf", mimeType: "application/pdf", buffer: Buffer.from("test file") });
  await page.getByRole("button", { name: /Lebenslauf analysieren/ }).click();
  await expect(uploadError).toContainText("Die KI hat nicht rechtzeitig geantwortet.");
  await expect(uploadError).toContainText(`Fehlerreferenz: AI_TIMEOUT · ${requestId}`);
  await expect(page.getByText("📎 test-cv.pdf", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Lebenslauf analysieren/ })).toBeEnabled();
  await page.getByRole("button", { name: /Lebenslauf analysieren/ }).click();
  await expect(page.locator('input[name="firstName"]')).toHaveValue("Testimport");
  await expect(uploadError).not.toBeVisible();
  expect(uploads).toBe(2);
});

test("CV-Upload behält bei einer HTML-Fehlerantwort die Referenz und leert sie bei Dateiwechsel", async ({ page }) => {
  const requestId = "11111111-2222-4333-8444-555555555555";
  const uploadError = page.getByRole("alert").filter({ hasText: "Fehlerreferenz:" });
  await page.route("**/api/cv/parse-upload", (route) => route.fulfill({
    status: 502, contentType: "text/html", headers: { "X-Request-ID": requestId }, body: "<html>upstream error</html>",
  }));
  await page.goto("/de/cv");
  await page.getByRole("button", { name: /Lebenslauf hochladen/ }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "test-cv.pdf", mimeType: "application/pdf", buffer: Buffer.from("test file") });
  await page.getByRole("button", { name: /Lebenslauf analysieren/ }).click();
  await expect(uploadError).toContainText("Upload fehlgeschlagen.");
  await expect(uploadError).toContainText(requestId);
  await page.locator('input[type="file"]').setInputFiles({ name: "another-cv.pdf", mimeType: "application/pdf", buffer: Buffer.from("another test file") });
  await expect(uploadError).not.toBeVisible();
  await expect(page.getByRole("button", { name: /Lebenslauf analysieren/ })).toBeEnabled();
});

test("Blockierter Stellen-Link führt zur Texteingabe ohne zusätzliche Einwilligung", async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/parse-job", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: false, error: "URL_NOT_READABLE" }) });
  });
  await page.goto("/de/apply");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.locator('input[type="url"]').fill("https://example.com/job");
  await page.getByRole("button", { name: /Stelle analysieren/ }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toEqual({ type: "url", content: "https://example.com/job" });
  await expect(page.getByText("Diese Seite konnte nicht gelesen werden. Bitte kopieren Sie den Stellentext.")).toBeVisible();
  await page.getByRole("button", { name: /Text/i }).first().click();
  await expect(page.locator("textarea").first()).toBeVisible();
});

test("Fehlender KI-Abgleich zeigt durchgehend keine erfundene Bewertung", async ({ page }) => {
  await page.route("**/api/qualify", (route) => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ success: false, match: null }),
  }));
  await page.route("**/api/generate", (route) => route.fulfill({
    contentType: "text/event-stream",
    body: 'event: matchScore\ndata: null\n\nevent: chunk\ndata: "Sehr geehrte Damen und Herren, ein vollständiges Testschreiben."\n\nevent: applicationId\ndata: "00000000-0000-0000-0000-000000000001"\n\nevent: done\ndata: true\n\n',
  }));
  await seedDraft(page);
  await page.goto("/de/apply/qualify");
  await expect(page.getByRole("alert").filter({ hasText: "Sie können ohne Bewertung fortfahren." })).toBeVisible();
  await expect(page.getByText(/\d+% Match/)).not.toBeVisible();
  await page.getByRole("button", { name: "Bewerbungsschreiben erstellen", exact: true }).click();
  await expect(page).toHaveURL(/\/de\/apply\/result/);
  await expect(page.getByText("Keine Bewertung verfügbar", { exact: true })).toBeVisible();
  await expect(page.getByText("50%", { exact: true })).not.toBeVisible();
  await expect(page.getByText("0%", { exact: true })).not.toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/de\/apply\/result/);
  await expect(page.locator("textarea").first()).toHaveValue(/ein vollständiges Testschreiben/);
  await expect(page.getByText("Keine Bewertung verfügbar", { exact: true })).toBeVisible();
});

test("Ein alter Entwurf bleibt beim Update erhalten und verliert den früheren Ersatz-Score", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("bewerbungsboost-flow", JSON.stringify({
    state: { letter: "Gespeicherter Entwurf aus der vorherigen Version.", matchScore: 50,
      parsedJob: { title: "Teststelle", company: "Testfirma", tasks: [], mustHave: [], niceToHave: [], tone: "formal", language: "de" } },
    version: 0,
  })));
  await page.goto("/de/apply/result");
  await expect(page.locator("textarea").first()).toHaveValue("Gespeicherter Entwurf aus der vorherigen Version.");
  await expect(page.getByText("Keine Bewertung verfügbar", { exact: true })).toBeVisible();
  await expect(page.getByText("50%", { exact: true })).not.toBeVisible();
  await expect(page).toHaveURL(/\/de\/apply\/result/);
});

test("Eigene Daten werden nur nach Bestätigung gelöscht und der Entwurf wird geleert", async ({ page }) => {
  let deletions = 0;
  await page.route("**/api/profile/data", (route) => {
    expect(route.request().method()).toBe("DELETE");
    deletions++;
    return route.fulfill({ contentType: "application/json", body: '{"success":true}' });
  });
  await page.goto("/de/profile");
  await page.evaluate(() => sessionStorage.setItem("bewerbungsboost-flow", JSON.stringify({ state: { letter: "old draft" }, version: 1 })));
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "CV und Bewerbungen löschen", exact: true }).click();
  expect(deletions).toBe(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "CV und Bewerbungen löschen", exact: true }).click();
  await expect(page.getByRole("status")).toBeVisible();
  expect(deletions).toBe(1);
  expect(await page.evaluate(() => sessionStorage.getItem("bewerbungsboost-flow"))).toBeNull();
});

test("Matching zeigt den konkreten Fehler und kann ohne Verlust der Eingaben wiederholt werden", async ({ page }) => {
  const requestId = "11111111-2222-4333-8444-555555555555";
  let attempts = 0;
  await page.route("**/api/qualify", (route) => {
    attempts++;
    return route.fulfill({
      status: attempts === 1 ? 502 : 200, contentType: "application/json", headers: { "X-Request-ID": requestId },
      body: JSON.stringify(attempts === 1
        ? { error: "Die Abgleich-Antwort wurde abgeschnitten.", code: "AI_OUTPUT_LIMIT" }
        : { success: true, match: { topMatches: ["Projektleitung"], gaps: ["Branchenerfahrung"], keywords: ["IT"], matchScore: 78 } }),
    });
  });
  await seedDraft(page);
  await page.goto("/de/apply/qualify");
  const error = page.getByRole("alert").filter({ hasText: "Fehlerreferenz:" });
  await expect(error).toContainText(`AI_OUTPUT_LIMIT · ${requestId}`);
  await expect(error).toContainText("Die Abgleich-Antwort wurde abgeschnitten.");
  await expect(page.getByText(/\d+% Match/)).not.toBeVisible();
  await page.locator('input[type="text"]').fill("Frau Test");
  await page.getByRole("button", { name: "Nochmal versuchen", exact: true }).click();
  await expect(page.getByText("78% Match", { exact: true })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Projektleitung" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Branchenerfahrung" })).toBeVisible();
  await expect(error).not.toBeVisible();
  await expect(page.locator('input[type="text"]')).toHaveValue("Frau Test");
  expect(attempts).toBe(2);
});

test("Matching behält bei HTML-Fehlern die Referenz und verwirft ungültige Scores", async ({ page }) => {
  const requestId = "11111111-2222-4333-8444-555555555555";
  let attempts = 0;
  await page.route("**/api/qualify", (route) => {
    attempts++;
    return route.fulfill({
      status: attempts === 1 ? 502 : 200,
      contentType: attempts === 1 ? "text/html" : "application/json",
      headers: { "X-Request-ID": requestId },
      body: attempts === 1 ? "<html>upstream error</html>" : JSON.stringify({
        success: true, match: { topMatches: [], gaps: [], keywords: [], matchScore: 999 },
      }),
    });
  });
  await seedDraft(page);
  await page.goto("/de/apply/qualify");
  const error = page.getByRole("alert").filter({ hasText: "Fehlerreferenz:" });
  await expect(error).toContainText(requestId);
  await expect(page.getByText(/\d+% Match/)).not.toBeVisible();
  await page.getByRole("button", { name: "Nochmal versuchen", exact: true }).click();
  await expect(error).toContainText(`AI_INVALID_OUTPUT · ${requestId}`);
  await expect(page.getByText(/\d+% Match/)).not.toBeVisible();
});

async function seedDraft(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("bewerbungsboost-flow")) return;
    sessionStorage.setItem("bewerbungsboost-flow", JSON.stringify({
    state: { parsedJob: { title: "Teststelle", company: "Testfirma", tasks: [], mustHave: [], niceToHave: [], tone: "formal", language: "de" },
      selectedTone: "balanced", selectedLength: "standard", selectedLetterLanguage: "de", qualifyAnswers: [], matchScore: 50 },
    version: 0,
    }));
  });
}
