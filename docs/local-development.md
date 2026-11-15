# Local development

Application Boost requires an isolated **test** Supabase project and your own Anthropic API key for real AI calls. Do not use real CVs, user records or production credentials.

**Prerequisites:** Node.js 22.12+ (Node 24 recommended) and npm.

1. Run **npm ci** and copy **.env.local.example** to **.env.local**.
2. Set the test Supabase URL and keys, Anthropic key, and an independent random 32-byte hexadecimal **ENCRYPTION_KEY**.
3. For a *new* database, apply [supabase/schema.sql](../supabase/schema.sql). For an existing database, use [versioned migrations](../supabase/migrations/), not the initial schema.
4. Run **npm run dev**.

Generate a key with Node's **crypto.randomBytes(32).toString('hex')**. Keep the service-role key, encryption key and model provider key on the server; never prefix them with **NEXT_PUBLIC_**.

**Before a change:** Run **npm run type-check**, **npm run lint**, **npm test**, **npm run check:db**, **npm run check:security-patch**, **npm run build**. For E2E tests, install Chromium with **npx playwright install chromium**; the [CI environment](../.github/workflows/ci.yml) shows safe mock values.

**Operational boundary:** Passing local tests is not equivalent to a production privacy review, real-model E2E suite, recovery drill or security assessment.
