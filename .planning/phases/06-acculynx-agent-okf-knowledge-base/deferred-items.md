
## 06-03: astro check unavailable in this environment (2026-07-01)

`npx astro check` requires `@astrojs/check` + `typescript`, neither of which is a devDependency
in `app/command-center/package.json` / installed in `node_modules` (confirmed: 0 hits in
package-lock.json, no CI workflow invokes `astro check`). This is a pre-existing environment gap,
not caused by 06-03's changes. Per the package-manager-install exclusion (Rule 3), this executor
did not auto-install the missing dependency — installing an unverified package name outside an
explicit user/plan instruction is out of scope for auto-fix. `npx vitest run` (this repo's actual
test framework, 17/17 files, 98/98 tests green) was used as the verification gate instead. If
`astro check` is desired going forward, it needs its own explicit task/A3-adjacent decision to add
`@astrojs/check` + `typescript` as devDependencies.
