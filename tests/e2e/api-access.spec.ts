import { test, expect } from "@playwright/test";
import { setMockSessionCookie } from "./_fixtures/mock-api";

// These requests exercise the built Next.js API, without page.route mocks.
test("App-APIs lehnen fehlende Anmeldung ab, bevor Daten oder KI verwendet werden", async ({ request }) => {
  for (const path of ["/api/cv", "/api/history"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(401);
  }
  for (const path of ["/api/parse-job", "/api/qualify", "/api/generate", "/api/regenerate", "/api/cv/parse-upload"]) {
    const response = await request.post(path, { data: {} });
    expect(response.status(), path).toBe(401);
  }
  expect((await request.delete("/api/profile/data")).status()).toBe(401);
});

test("CV-Upload lehnt ein Textfeld statt einer Datei ab", async ({ page }) => {
  await setMockSessionCookie(page);
  const response = await page.context().request.post("/api/cv/parse-upload", {
    multipart: { file: "Kein Datei-Upload" },
  });
  expect(response.status()).toBe(400);
});
