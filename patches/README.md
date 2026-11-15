# braces: bounded recursion

`braces@3.0.3` is affected by [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) / CVE-2026-93687. No fixed npm release is available as of 2026-10-11. Here it is a development dependency of Tailwind, Chokidar and the Next.js ESLint tooling; production dependencies audit cleanly.

`braces-3.0.3.json` contains the five library-file security changes proposed in [upstream PR 72](https://github.com/micromatch/braces/pull/72), pinned to [commit 28d440b](https://github.com/FSDevelop/braces/commit/28d440b5dd449dbf1fe6f3506cf94ecca4d02660) and applied to the npm 3.0.3 sources. The proposal targets the upstream master branch, which also contains unrelated parser changes; the patch retains npm 3.0.3 behaviour outside those security hunks. That proposal is closed and unmerged; this is a locally maintained security patch, not an official release. Its MIT licence is included in `LICENSE.braces`.

The patch limits brace and parenthesis nesting to 100 before recursive processing; callers can request a stricter limit, but cannot raise the cap. `compile`, `expand` and `stringify` enforce the cap on caller-supplied ASTs too. Expansion rejects cyclic parent links. Normal glob, range and escaping behaviour remains covered by regression tests and the application build.

The `postinstall` hook applies the patch to every installed copy, including nested dependencies. SHA-256 checks accept only the exact original or already-patched files. Unexpected code or package versions fail installation rather than silently leaving the vulnerability open. No patch is downloaded at installation time and no package version is renamed to bypass scanning.

Use `npm ci` with lifecycle scripts enabled. If an environment disables them, run `npm run patch:security` explicitly. `npm run check:security-patch` verifies the installed hashes and executes attack and compatibility regressions; CI runs it before lint and build. Both commands also work when production-only installation omits `braces`.

`npm audit` still reports the upstream package and its dependent paths: it recognises versions, not local file corrections. Keep that finding visible. When a maintained official fix is released, verify its behaviour, upgrade the dependency paths, and remove this patch, its installation hook and its regression check together.
