import { vi } from "vitest";
vi.mock("server-only", () => ({}));

// Test-Env: deterministischer 32-Byte-Key (64 Hex-Zeichen)
process.env.ENCRYPTION_KEY =
  "0000000000000000000000000000000000000000000000000000000000000000";
// Default: Logger auf silent, Tests können überschreiben
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "silent";

