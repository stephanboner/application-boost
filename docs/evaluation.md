# Testing and evaluation plan

## What is covered

| Layer | Checks | Limits |
| --- | --- | --- |
| Type and style | TypeScript and ESLint | Does not establish functional correctness |
| Unit / integration | Vitest covers schemas, URL safety, prompt assembly, encryption, error handling and API transport | Mostly synthetic and mocked provider responses |
| Database | Isolated PGlite migration and access tests | Not backup recovery or a live Supabase penetration test |
| Browser | Playwright tests for application flows, auth, editor and error states | Mocks; not a real paid-model end-to-end production flow |
| Supply chain | npm audit, security-patch verification, Dependabot and Gitleaks | Detects known patterns, not all possible vulnerabilities |
| Localization | Message key and placeholder consistency for 11 locales | Not native-speaker editorial QA |

## What a model-quality claim would require

**Hypothesis:** Separating requirement parsing, evidence matching and writing may reduce unsubstantiated claims and improve requirement coverage compared with a single-prompt baseline.

**Dataset:** Fixed synthetic CV/job pairs covering entry-level, career changes, experienced specialists, missing must-have requirements, absent motivation, and multilingual applications. No real candidate data.

**Protocol:** Run both pipelines multiple times with the same model, version and settings. Blind and randomize the outputs before scoring. Record token cost, latency and failure classes.

**Rubric:** Factual grounding, job requirement coverage, honest handling of gaps, specificity, readable tone, language/formatting and appropriate contact details. Invented skills, metrics, management scope or motivation count as **critical failures**.

**Status:** This controlled evaluation has **not been performed**. A match percentage is an uncalibrated model assessment, not a probability of employment. No conversion, hiring or user adoption claims are made.

## Release review
Check keyboard accessibility, mobile layouts, PDF/DOCX exports, quota exhaustion, account isolation, deletion and sanitized logs using disposable test accounts.
