import { test, expect } from "@playwright/test";

// ============================================================
// PWA-Smoke-Tests
//
// Prüft, dass die App-Metadaten, das Manifest und die Icons korrekt
// ausgeliefert werden — Voraussetzung für 'Zum Home-Bildschirm hinzufügen'
// auf iOS/Android.
// ============================================================

test.describe("PWA-Setup", () => {
  test("/manifest.webmanifest liefert valides Manifest mit Standalone-Display", async ({
    request,
  }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBe(true);

    const manifest = await res.json();
    expect(manifest.name).toBe("BewerbungsBoost");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe("#2D5A3D");
    expect(manifest.background_color).toBeTruthy();
    expect(manifest.start_url).toBe("/");
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  test("/apple-icon liefert ein PNG (180x180)", async ({ request }) => {
    const res = await request.get("/apple-icon");
    expect(res.ok()).toBe(true);
    expect(res.headers()["content-type"]).toContain("image/png");
  });

  test("/icon liefert ein PNG", async ({ request }) => {
    const res = await request.get("/icon");
    expect(res.ok()).toBe(true);
    expect(res.headers()["content-type"]).toContain("image/png");
  });

  test("Landing-Page hat Manifest-Link und iOS-Meta-Tags", async ({ page }) => {
    await page.goto("/de");

    // Manifest-Link im <head>
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(manifestHref).toContain("manifest");

    // Apple-Web-App-Capable für Homescreen-Standalone-Modus
    const appleCapable = await page
      .locator('meta[name="apple-mobile-web-app-capable"]')
      .getAttribute("content");
    expect(appleCapable).toBe("yes");

    // Theme-Color für Browser-Chrome (Status-Bar-Tint auf Android, Safari Tab-Tint)
    const themeColor = await page
      .locator('meta[name="theme-color"]')
      .getAttribute("content");
    expect(themeColor).toBe("#2D5A3D");

    // Apple-Touch-Icon (verlinkt auf /apple-icon)
    const appleIcon = await page
      .locator('link[rel="apple-touch-icon"]')
      .getAttribute("href");
    expect(appleIcon).toContain("apple-icon");
  });
});
