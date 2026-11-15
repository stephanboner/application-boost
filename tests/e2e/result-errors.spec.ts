import { test, expect, type Page } from "@playwright/test";
import { createMockState, mockApiRoutes, setMockSessionCookie } from "./_fixtures/mock-api";

const idA = "00000000-0000-0000-0000-000000000001";
const idB = "00000000-0000-0000-0000-000000000002";
const resultUrl = `/de/apply/result?id=${idA}`;
const editor = (page: Page) => page.getByRole("textbox", { name: "Bewerbungsschreiben bearbeiten" });
const draft = (page: Page) => page.evaluate(() => JSON.parse(sessionStorage.getItem("bewerbungsboost-flow")!).state);

test.beforeEach(async ({ page }) => {
  await setMockSessionCookie(page);
  await mockApiRoutes(page, createMockState());
});

test("Angeklickte Bewerbung ersetzt den vorhandenen Entwurf samt Varianten und Sprache", async ({ page }) => {
  const state = createMockState();
  state.applications.push({ id: idB, job_title: "Projektleitung B", company: "Firma B", letter: "Dear team, letter B.",
    tone: "personal", language: "en", created_at: "2026-10-11T12:00:00Z" });
  await mockApiRoutes(page, state);
  await page.goto(resultUrl);
  await expect(editor(page)).toHaveValue(/Sehr geehrte/);
  await page.getByRole("button", { name: "Formell", exact: true }).click();
  await expect(editor(page)).toHaveValue(/FORMELLE VERSION/);
  await page.goto("/de/apply");
  await page.getByRole("button", { name: /Projektleitung B/ }).click();
  await expect(editor(page)).toHaveValue("Dear team, letter B.");
  await expect(page.getByRole("combobox", { name: "Sprache" })).toHaveValue("en");
  const saved = await draft(page);
  expect(saved.currentApplicationId).toBe(idB);
  expect(saved.letterVariants).toEqual({ personal: "Dear team, letter B." });
  expect(saved.companyAddress).toBe("");
  expect(saved.customDateLine).toBeNull();
});

test("Ladefehler zeigt eine Meldung und kann erneut geladen werden", async ({ page }) => {
  let fail = true;
  await page.route("**/api/history**", (route) => {
    if (route.request().method() === "GET" && new URL(route.request().url()).searchParams.get("id") && fail) {
      return route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"Laden fehlgeschlagen"}' });
    }
    return route.fallback();
  });
  await page.goto(resultUrl);
  await expect(page.getByRole("alert").filter({ hasText: "konnte nicht geladen werden" })).toBeVisible();
  await expect(editor(page)).not.toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Erneut laden", exact: true }).click();
  await expect(editor(page)).toHaveValue(/Sehr geehrte/);
});

test("Neuladen derselben Bewerbung behält noch nicht gespeicherte Änderungen", async ({ page }) => {
  await page.goto(resultUrl);
  await expect(editor(page)).toHaveValue(/Sehr geehrte/);
  await editor(page).fill("Noch nicht gespeicherte Fassung im aktuellen Tab.");
  await page.reload();
  await expect(editor(page)).toHaveValue("Noch nicht gespeicherte Fassung im aktuellen Tab.");
  expect((await draft(page)).currentApplicationId).toBe(idA);
});

test("Fehlende Bewerbung zeigt weder eine leere Seite noch den alten Brief", async ({ page }) => {
  await page.goto(resultUrl);
  await expect(editor(page)).toHaveValue(/Sehr geehrte/);
  await page.goto(`/de/apply/result?id=${idB}`);
  await expect(page.getByRole("alert").filter({ hasText: "gelöscht oder ist nicht verfügbar" })).toBeVisible();
  await expect(editor(page)).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Zum Verlauf" })).toBeVisible();
});

test("Ein erfolgreicher Aufruf mit leerem Brief wird nicht als editierbares Dokument geöffnet", async ({ page }) => {
  await page.route("**/api/history**", (route) => route.fulfill({ contentType: "application/json",
    body: JSON.stringify({ application: { id: idA, letter: "" } }) }));
  await page.goto(resultUrl);
  await expect(page.getByRole("alert").filter({ hasText: "konnte nicht geladen werden" })).toBeVisible();
  await expect(editor(page)).not.toBeVisible();
});

for (const failure of ["server", "quota", "invalid", "network"] as const) {
  test(`Tonfehler (${failure}) erhält den bisherigen Text und die Auswahl`, async ({ page }) => {
    await page.route("**/api/regenerate", (route) => {
      if (failure === "network") return route.abort();
      return route.fulfill({ status: failure === "quota" ? 429 : failure === "server" ? 500 : 200,
        contentType: "application/json", body: failure === "invalid" ? '{"success":true,"result":""}' : '{"error":"KI nicht verfügbar"}' });
    });
    await page.goto(resultUrl);
    await expect(editor(page)).toHaveValue(/Sehr geehrte/);
    const original = await editor(page).inputValue();
    await page.getByRole("button", { name: "Formell", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: failure === "quota" ? "KI-Limit" : "Änderung ist fehlgeschlagen" })).toBeVisible();
    await expect(editor(page)).toHaveValue(original);
    await expect(page.getByRole("button", { name: "Ausgewogen", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect((await draft(page)).selectedTone).toBe("balanced");
  });
}

test("Sprachfehler erhält Sprache und Brief und erlaubt einen erneuten Versuch", async ({ page }) => {
  let fail = true;
  await page.route("**/api/regenerate", (route) => fail
    ? route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"Übersetzung fehlgeschlagen"}' })
    : route.fulfill({ contentType: "application/json", body: '{"success":true,"result":"Dear team, translated letter."}' }));
  await page.goto(resultUrl);
  await expect(editor(page)).toHaveValue(/Sehr geehrte/);
  const original = await editor(page).inputValue();
  const language = page.getByRole("combobox", { name: "Sprache" });
  await language.selectOption("en");
  await expect(page.getByRole("alert").filter({ hasText: "Änderung ist fehlgeschlagen" })).toBeVisible();
  await expect(language).toHaveValue("de");
  await expect(editor(page)).toHaveValue(original);
  fail = false;
  await language.selectOption("en");
  await expect(language).toHaveValue("en");
  await expect(editor(page)).toHaveValue("Dear team, translated letter.");
  await expect(page.getByRole("alert").filter({ hasText: "Änderung ist fehlgeschlagen" })).not.toBeVisible();
});

test("Übersetzung verwirft alte Tonvarianten statt in die alte Sprache zurückzuwechseln", async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/regenerate", (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true,
      result: body.type === "language" ? "Dear team, translated letter." : "Tone variant in current language." }) });
  });
  await page.goto(resultUrl);
  await expect(editor(page)).toHaveValue(/Sehr geehrte/);
  await page.getByRole("button", { name: "Formell", exact: true }).click();
  await expect(editor(page)).toHaveValue("Tone variant in current language.");
  await page.getByRole("button", { name: "Ausgewogen", exact: true }).click();
  await page.getByRole("combobox", { name: "Sprache" }).selectOption("en");
  await expect(editor(page)).toHaveValue("Dear team, translated letter.");
  expect((await draft(page)).letterVariants).toEqual({ balanced: "Dear team, translated letter." });
  await page.getByRole("button", { name: "Formell", exact: true }).click();
  await expect.poll(() => requests.length).toBe(3);
  expect(requests[2]).toMatchObject({ type: "tone", content: "Dear team, translated letter." });
});

for (const failure of ["missing", "server", "unconfirmed"] as const) {
  test(`Speicherfehler (${failure}) zeigt keinen falschen Erfolg und lässt sich wiederholen`, async ({ page }) => {
    let fail = true;
    const writes: Record<string, unknown>[] = [];
    await page.route("**/api/history**", (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      writes.push(route.request().postDataJSON());
      return route.fulfill({ status: fail ? failure === "missing" ? 404 : failure === "server" ? 500 : 200 : 200,
        contentType: "application/json", body: fail ? '{"error":"Nicht gespeichert"}' : '{"success":true}' });
    });
    await page.goto(resultUrl);
    await expect(editor(page)).toHaveValue(/Sehr geehrte/);
    await editor(page).fill("Meine geänderte Fassung.");
    await expect(page.getByRole("alert").filter({ hasText: failure === "missing" ? "Nicht gespeichert" : "Speichern fehlgeschlagen" })).toBeVisible();
    await expect(page.getByText("✓ Gespeichert!", { exact: true })).not.toBeVisible();
    await expect(editor(page)).toHaveValue("Meine geänderte Fassung.");
    fail = false;
    await page.getByRole("button", { name: "Erneut speichern", exact: true }).click();
    await expect(page.getByText("✓ Gespeichert!", { exact: true })).toBeVisible();
    expect(writes.at(-1)).toMatchObject({ letter: "Meine geänderte Fassung.", tone: "balanced", language: "de" });
  });
}

test("Verzögerte Speicherantwort überschreibt keine neuere Fassung", async ({ page }) => {
  const writes: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  await page.route("**/api/history**", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    writes.push(route.request().postDataJSON().letter);
    if (writes.length === 1) await firstGate;
    return route.fulfill({ contentType: "application/json", body: '{"success":true}' });
  });
  await page.goto(resultUrl);
  await expect(editor(page)).toHaveValue(/Sehr geehrte/);
  await editor(page).fill("Erste Fassung");
  await expect.poll(() => writes.length).toBe(1);
  await editor(page).fill("Neueste Fassung");
  releaseFirst();
  await expect.poll(() => writes.length).toBe(2);
  await expect(page.getByText("✓ Gespeichert!", { exact: true })).toBeVisible();
  expect(writes).toEqual(["Erste Fassung", "Neueste Fassung"]);
});

test("Löschfehler behält den Eintrag und erlaubt einen erneuten Löschversuch", async ({ page }) => {
  let fail = true;
  await page.route("**/api/history**", (route) => route.request().method() === "DELETE"
    ? route.fulfill({ status: fail ? 500 : 200, contentType: "application/json",
      body: fail ? '{"error":"Nicht gelöscht"}' : '{"success":true}' })
    : route.fallback());
  await page.goto("/de/history");
  await expect(page.getByText("Sachbearbeiter/in", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Löschen", exact: true }).click();
  await page.getByRole("button", { name: "Löschen", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Löschen fehlgeschlagen" })).toBeVisible();
  await expect(page.getByText("Sachbearbeiter/in", { exact: true })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Löschen", exact: true }).click();
  await expect(page.getByText("Noch keine Bewerbungen erstellt.")).toBeVisible();
});
