# Security policy

This is a **proof of concept**, not a service approved for real personal applicant data. Use synthetic documents and accounts only.

## Reporting a vulnerability

Do not disclose vulnerabilities, API keys, tokens, database URLs, user records or exploit details in a public issue. Prefer GitHub's **private vulnerability reporting** if it is enabled for this repository. Otherwise, contact the repository maintainer privately through an established channel before sharing details. Public GitHub issues are appropriate only for non-sensitive bugs.

## Security boundaries

- Keep `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY` and versioned encryption keys on the server; never expose them through `NEXT_PUBLIC_*`.
- Check that the project's Supabase RLS policies and migrations are applied before using persistent data.
- Treat uploaded CVs, scraped vacancies and model output as untrusted inputs.
- Do not log raw applicant data, documents, prompts or provider error bodies.
- Test changes to URL fetching, request authentication, deletion, encryption or quota enforcement.

The [architecture](docs/architecture.md) describes the implemented safeguards and its limitations. These are not claims of a completed external security audit.
