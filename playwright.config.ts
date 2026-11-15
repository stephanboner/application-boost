import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.E2E_PORT ?? "3100";
const BASE_URL = `http://localhost:${PORT}`;
const SUPABASE_PORT = process.env.E2E_SUPABASE_PORT ?? "3201";

/**
 * Playwright-E2E-Tests.
 *
 * Strategie:
 * - Eigener Port (3100), damit der Dev-Server (3000) parallel laufen kann.
 * - `webServer`: startet `next start` mit Test-Env-Vars und Mock-Werten,
 *   damit keine echte Supabase-/Anthropic-Verbindung nötig ist.
 * - Tests intercepten /api/* per page.route() — siehe tests/e2e/_fixtures/.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "de-CH",
    // Optionaler bereits installierter Browser für lokale Testumgebungen.
    launchOptions: process.env.E2E_CHROMIUM_PATH
      ? { executablePath: process.env.E2E_CHROMIUM_PATH }
      : undefined,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // Mobile-Tests laufen nur im 'mobile'-Project (anderer Viewport).
      testIgnore: /mobile-.*\.spec\.ts/,
    },
    // Mobile-Viewport: iPhone-13-Geometrie auf Chromium emuliert
    // (kein Webkit nötig → kein zusätzlicher Browser-Install in CI).
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        defaultBrowserType: "chromium",
      },
      testMatch: /mobile-.*\.spec\.ts/,
    },
  ],
  webServer: [{
    command: "node tests/e2e/_fixtures/supabase-server.mjs",
    url: `http://127.0.0.1:${SUPABASE_PORT}/health`,
    reuseExistingServer: !process.env.CI,
    env: { E2E_SUPABASE_PORT: SUPABASE_PORT },
  }, {
    command: `PORT=${PORT} npm run start -- --hostname localhost`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Server-Auth nutzt die lokale Supabase-Fixture; App-API-Aufrufe sind gemockt.
      NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPABASE_PORT}`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      ANTHROPIC_API_KEY: "test-anthropic-key",
      ENCRYPTION_KEY:
        "0000000000000000000000000000000000000000000000000000000000000000",
    },
  }],
});

