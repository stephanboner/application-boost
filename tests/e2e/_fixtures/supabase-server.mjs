// Local-only Supabase fixture: server-side auth checks cannot be intercepted
// by page.route(). No production connection or real credentials are used.
import http from "node:http";
import { createCipheriv, randomBytes } from "node:crypto";

const port = Number(process.env.E2E_SUPABASE_PORT ?? 3201);
const user = {
  id: "00000000-0000-0000-0000-000000000099",
  email: "maria@example.invalid",
  aud: "authenticated",
  role: "authenticated",
  created_at: "2026-05-10T10:00:00Z",
  app_metadata: {},
  user_metadata: {},
};

// Non-personal fixture data for the server-rendered history page. The key
// matches the published test placeholder in playwright.config.ts and CI.
const iv = randomBytes(12);
const cipher = createCipheriv("aes-256-gcm",
  Buffer.from("0000000000000000000000000000000000000000000000000000000000000000", "hex"), iv);
const ciphertext = Buffer.concat([cipher.update("Testbrief aus dem Verlauf", "utf8"), cipher.final()]);
const application = {
  id: "00000000-0000-0000-0000-000000000001", user_id: user.id,
  job_title: "Sachbearbeiter/in", company: "Kanton Graubünden",
  letter_enc: `v1:${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${ciphertext.toString("base64")}`,
  tone: "balanced", language: "de", word_count: 5, is_exported: false,
  created_at: "2026-05-10T10:00:00Z", updated_at: "2026-05-10T10:00:00Z",
};

http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "apikey, authorization, content-type, x-client-info, x-supabase-api-version");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  const requestUrl = new URL(req.url, `http://127.0.0.1:${port}`);
  const path = requestUrl.pathname;
  if (path === "/health") { res.end('{"ok":true}'); return; }
  if (path === "/auth/v1/logout" && req.method === "POST") {
    res.writeHead(204); res.end(); return;
  }
  if (path === "/auth/v1/user") {
    if (req.headers.authorization !== "Bearer mock-token") {
      res.writeHead(401); res.end('{"code":"bad_jwt","message":"Invalid JWT"}'); return;
    }
    res.end(JSON.stringify(user)); return;
  }
  if (path === "/rest/v1/applications" && req.method === "GET") {
    const id = requestUrl.searchParams.get("id");
    res.end(JSON.stringify(!id || id === `eq.${application.id}` ? [application] : [])); return;
  }
  if (path.startsWith("/rest/v1/")) { res.end("[]"); return; }
  res.writeHead(404); res.end('{"error":"Unknown fixture route"}');
}).listen(port, "127.0.0.1", () => console.log(`Supabase fixture listening on ${port}`));
