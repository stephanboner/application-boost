import { test, expect } from "@playwright/test";

test("App-Schriften mit Kursivstil und kyrillischer Lora laden aus dem eigenen Deployment", async ({ page, request }) => {
  const fontRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith(".woff2")) fontRequests.push(request.url());
  });
  await page.goto("/de");
  const loaded = await page.evaluate(async () => {
    const cases = [
      { font: '500 16px "Plus Jakarta Sans Variable"', family: "Plus Jakarta Sans Variable", text: "Grüezi" },
      { font: '400 16px "Fraunces Variable"', family: "Fraunces Variable", text: "Bewerbung" },
      { font: 'italic 400 16px "Fraunces Variable"', family: "Fraunces Variable", text: "Bewerbung" },
      { font: '400 16px "Lora Variable"', family: "Lora Variable", text: "Grüezi Українська" },
      { font: 'italic 500 16px "Lora Variable"', family: "Lora Variable", text: "Grüezi Українська" },
    ];
    return Promise.all(cases.map(async ({ font, family, text }) => {
      const faces = await document.fonts.load(font, text);
      return { font, loaded: faces.length > 0 && faces.every((face) => face.family.includes(family) && face.status === "loaded") };
    }));
  });
  expect(loaded.every((font) => font.loaded), JSON.stringify(loaded)).toBe(true);
  await expect(page.locator("body")).toHaveCSS("font-family", /Plus Jakarta Sans Variable/);
  expect(fontRequests.length).toBeGreaterThanOrEqual(5);
  expect(fontRequests.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);

  const licenses = await Promise.all(
    ["fraunces", "lora", "plus-jakarta-sans"].map((font) =>
      request.get(`/font-licenses/${font}.txt`, { maxRedirects: 0 })
    )
  );
  for (const license of licenses) {
    expect(license.status()).toBe(200);
    expect(await license.text()).toContain("SIL OPEN FONT LICENSE");
  }
});
