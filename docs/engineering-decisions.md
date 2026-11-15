# Engineering decisions and trade-offs

This note links the architectural choices in Application Boost to the code. They describe a prototype, not an independent security certification.

## 1. Separate extraction, assessment and writing
**Choice:** Use distinct model tasks for CV parsing, job parsing, CV-to-job assessment and drafting. Job parsing is constrained by a JSON schema and Zod validation; match scores can be unavailable rather than invented.

**Trade-off:** Extra API calls and latency, in exchange for narrower validation boundaries and testable error paths. See [job parser](../src/app/api/parse-job/route.ts), [prompts](../src/lib/prompts.ts) and [matching](../src/lib/cv-matching.ts).

## 2. Treat the vacancy URL as hostile input
**Choice:** Public HTTP(S) only; check IP ranges, resolved addresses, redirects and response limits. Reject CAPTCHA/challenge pages rather than treating them as job requirements.

**Trade-off:** Protected or JavaScript-rendered career sites may be unreadable. Manual paste is an intentional fallback, not a bypass. See [URL safety](../src/lib/url-safety.ts) and [job text recognition](../src/lib/job-text.ts).

## 3. Stream immediately, persist only on success
**Choice:** Use server-sent events for text chunks, match context, saved application ID and final completion. A full provider message, normal stop reason and successful encrypted save are required before the final success event.

**Trade-off:** Slightly more complex UI/error states in exchange for avoiding falsely completed draft records. See [letter generation](../src/lib/letter-generation.ts).

## 4. Isolate applicant records
**Choice:** Supabase Auth, row-level security, server-only AES-256-GCM for CV and letter content, and version-tagged ciphertext for key rotation.

**Boundary:** This is not end-to-end encryption. The server decrypts content, and selected data is sent to the external model when AI features run. A private deployment, secure key management and retention policy still require review. See [encryption](../src/lib/encryption.ts) and [schema](../supabase/schema.sql).

## 5. Budget model usage as part of product design
**Choice:** Apply per-user request limits, shared daily AI call/token reservations, bounded retries and optional per-user URL cache.

**Trade-off:** Legitimate high-volume workflows can be throttled, but the prototype prevents unbounded AI usage. See [budget](../src/lib/ai-budget.ts) and [rate limiting](../src/lib/rate-limit.ts).

## 6. Separate tests from evidence of product outcomes
Unit tests, database checks and mocked browser flows verify important correctness properties. They do **not** establish that cover letters are more persuasive or lead to better hiring outcomes. A reproducible evaluation protocol is outlined in [evaluation](evaluation.md).
