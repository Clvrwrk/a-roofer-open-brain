
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

## 06-03: ob-acculynx Slack bot + Coolify provisioning DEFERRED to separate project (2026-07-01)

Chris's decision: the Slack team is in-flight on another project, so provisioning the ob-acculynx
Slack bot (and therefore the Coolify secrets `OB_ACCULYNX_BOT_TOKEN` +
`AGENT_SERVICE_TOKEN_SHA256_OB_ACCULYNX`) moves into THAT project, not this one. Code is fully
deployed and inert (roster identity live @942649a, token count 13). Resume recipe in
06-03-SUMMARY.md: set the two env vars → redeploy → confirm token count 13→14 → run the Task 4
cross-department enqueue smoke test. Related open config item from Phase 5 finding #4 (Slack
notify bot not in target channel) naturally folds into the same Slack project.
