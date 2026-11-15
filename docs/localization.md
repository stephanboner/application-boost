# Localization

The BewerbungsBoost user interface uses [next-intl](https://next-intl.dev/) and translation catalogues in `messages/<locale>.json`. The reference locale is **German (Swiss orthography)**, and routing is configured in `src/i18n/routing.ts`.

## Supported UI locales

| Locale | Language | Convention |
| --- | --- | --- |
| `de` | German | Swiss spelling, formal `Sie` |
| `en` | English | Neutral international English |
| `fr` | French | Formal `vous` |
| `it` | Italian | Informal `tu` in the UI |
| `rm` | Romansh | Rumantsch Grischun, formal `Vus` |
| `uk` | Ukrainian | Polite plural forms |
| `sr` | Serbian | Latin script, predominantly Ekavian |
| `sq` | Albanian | Polite forms |
| `hr` | Croatian | Standard Croatian |
| `pt` | Portuguese | European Portuguese (`pt-PT`) |
| `es` | Spanish | Formal `usted` |

**Coverage:** all catalogues contain the same message keys and compatible interpolation placeholders. This is structural completeness, **not** a claim of native-speaker-reviewed language quality. Romansh and other less commonly tested locales should be reviewed with speakers before broad distribution.

## Adding or changing a message

1. Add the key to `messages/de.json` and provide a translation in **each** of the ten other catalogues.
2. Keep variables such as `{name}`, `{lang}`, `{date}` and `{count}` identical in every locale. Do not translate variable names.
3. Use `useTranslations("section")` in client components, or `getTranslations({locale,namespace:"section"})` on the server. Do **not** hardcode German in screens that have language routing.
4. Keep nouns consistent: CV, job posting, application, match/assessment and cover letter are not interchangeable.
5. Avoid claims of assured job suitability or improved hiring outcomes; the AI match is only an assessment.
6. Test UI text length, mobile wrapping, input placeholders, accessibility labels, password reset and delete confirmations in multiple locales.

## Automated verification

```bash
npm run type-check
npm test
npm run build
npm run test:e2e
```

`src/i18n/messages.test.ts` checks that each locale has exactly the same paths as the German reference, that no string is empty, and that each interpolation placeholder occurs the same number of times. Browser smoke tests check the localized landing-page headings for all supported locales. These checks cannot detect inaccurate, awkward or culturally inappropriate translations.

## Known scope limits

The UI language and the language chosen for an **exported letter** are independent choices. Model output and user-provided job content may be in other languages. In addition, provider/API errors are not always localization-ready; never display unfiltered provider error bodies. Review document formatting, punctuation and date conventions separately from UI translations.
