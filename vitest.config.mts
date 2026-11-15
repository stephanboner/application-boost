import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // tests/e2e/* sind Playwright-Tests — niemals von Vitest ausführen,
    // sonst kollidiert test.describe() aus @playwright/test mit Vitest.
    exclude: ["**/node_modules/**", "**/.next/**", "tests/e2e/**"],
    coverage: {
      reporter: ["text", "html"],
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/supabase/**", "**/*.d.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});

