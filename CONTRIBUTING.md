# Contributing

Application Boost (BewerbungsBoost in the app) is an experimental project. Contributions should keep the scope small, verifiable and privacy-conscious.

## Local setup

See the [README](README.md) and [example environment file](.env.local.example). Use an isolated Supabase project and synthetic content. Never commit credentials, applicant documents, private logs, database dumps or real user information.

## Before proposing a change

```bash
npm ci
npm run type-check
npm run lint
npm test
npm run check:db
npm run check:security-patch
npm run build
```

When changing a user-facing flow, run the Playwright suite using the local fixtures described in the [local development guide](docs/local-development.md). When changing dependencies, review `npm audit --omit=dev --audit-level=moderate`.

Changes to models or prompts should include tests for response validation, missing evidence, error paths and untrusted external inputs. Do not claim better writing quality without an evaluation on repeatable, synthetic cases.

## Pull requests

Describe **why** the change is useful, its scope, the checks performed, any migration impact and known limitations. Keep screenshots and sample CVs synthetic. Never include private application records in issues or PRs.

The repository is currently not distributed under an open-source license. Please do not assume permission to redistribute its contents.
