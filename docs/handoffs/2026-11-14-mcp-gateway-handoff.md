# Project Handoff — Company MCP gateway for staff AI agents (pe-connect)
**Project:** Staff AI agent gateway: the gateway in `mcp.proexteriorsus.net`, its data contract in `CRM_PWA`, the A3 in a-roofers-open-brain
**Repo:** https://github.com/Clvrwrk/mcp.proexteriorsus.net (gateway) · https://github.com/Clvrwrk/CRM_PWA (data contract) · https://github.com/Clvrwrk/a-roofer-open-brain (A3 and this file)
**Production URL:** not yet deployed. No staging host exists either. The gateway has only run in tests.
**Date:** 2026-11-14 18:40 PST (2026-11-15 02:40 UTC)
**Agent:** Lead Orchestrator (Claude Code), with Ringer workers on GPT-5.6 Sol
**Reason:** User-requested (`/project-handoff`)

This is a topic handoff. It supersedes the MCP handoff written on 2026-11-13 (`docs/handoffs/current.md` on branch `contrib/cleverwork/pe-connect-a3-decisions`, PR 76). It does not replace `docs/handoffs/current.md` on `main`. It is a dated file on purpose: four open pull requests (76, 79, 81, 82) each rewrite `current.md`, and whichever merges last would erase the others.

---

## Where it stands in one paragraph

Twelve of thirteen gateway tickets are built and merged. The CRM offers the gateway a complete read-only contract of six database functions, and the gateway has five company tools on that contract, the approved 27-role map, an administrator runbook and a staff guide. All of it runs only in tests, against stand-in CRM functions. Nothing is deployed, no CRM migration is applied to any database, the gateway's database role is installed nowhere, and no agent product is connected. Only ticket 13 (staging deploy and acceptance) remains, and parts of it wait on Chris.

## Accomplished This Session

### 1. Review of all eight handoffs from 2026-11-13

- Read and checked against live state: MCP gateway, PDF previews, estimate builder, hr org chart, Job Activity nest, PM host, CenterPoint, Google Maps.
- Finding still open: brain PRs 76, 79, 81 and 82 each replace `docs/handoffs/current.md`. They should become dated topic files before any merges.

### 2. CRM data contract, completed (Clvrwrk/CRM_PWA, all merged to `main`)

- PR 319, merged `a496d059`: schema `mcp_api`, `crm_private.mcp_membership`, `mcp_api.effective_access`, `mcp_api.directory_search`, `ops/mcp-gateway/install-role.sql`.
- PR 329, merged `fae19328`:
  - `supabase/migrations/20261202100000_mcp_api_jobs_and_notes.sql`: `mcp_api.find_jobs`, `mcp_api.get_job`, `mcp_api.list_job_notes`, and a replacement of `mcp_api.effective_access`.
  - The grant rule now matches `crm_private.hr_grant_at`: the grant in effect today, then the latest. Before, a future-dated change hid a grant the HR screen still showed.
  - `find_jobs` follows the set-based plan of `crm.search_efforts` and applies `crm_private.effort_visible(m,m,e)` to every row.
  - `list_job_notes` reads through `crm_private.job_notes_page` unchanged and writes nothing.
  - `supabase/contracts/mcp_api/v1/seeded-role-keys.json`: the real 27 role keys. `role-keys.json` stays fixture-only.
- PR 337, merged `75793081`:
  - `supabase/migrations/20261204090000_mcp_api_org_chart.sql`: `mcp_api.org_chart(user, org, office)`, mirroring `crm.read_hr_org_chart`.
- Tests: `tests/database/mcp-api-contract.test.ts`, `mcp-api-jobs.test.ts`, `mcp-api-org-chart.test.ts` (38 tests, run together on Postgres 17). Static pins: `scripts/test-mcp-api-contract.mjs`, `test-mcp-api-jobs.mjs`, `test-mcp-api-org-chart.mjs`.
- Docs: `docs/architecture/MCP-API.md`, entries in `docs/delivery/STATUS.md`.
- Gateway ticket 02 (issue 3) closed.

### 3. Gateway tools (Clvrwrk/mcp.proexteriorsus.net, all merged to `main`)

- PR 25, merged `1c695c9` (ticket 08):
  - `contracts/crm/mcp_api/v1/` and `contracts/crm/PIN.json`: the CRM contract vendored at `75793081` with sha256 checksums. `scripts/vendor-contract.ts` re-vendors.
  - `src/contract-validator.ts`: strict JSON Schema checks, no dependency.
  - `src/connectors/crm-hr.ts`: `findJobs`, `getJob`, and a `ContractBreachReporter` (an extra field is dropped and reported).
  - `src/tool-registry.ts`: `crm.find_job`, `crm.get_job` under `crm.jobs.read`.
  - `seed/005_job_tools.sql`: invented Jobs and stand-in functions.
- PR 26, merged `b08bc1f` (ticket 09): `crm.list_job_notes` under `crm.job_notes.read`, `seed/006_job_notes_tool.sql`.
- PR 27, merged `da9c02e` (ticket 10): `hr.directory_search` on the real contract envelope, `hr.org_chart` under `hr.org_chart.read`, `seed/007_hr_tools.sql`.
- PR 28, merged `b85f7bc` (ticket 11): `docs/staff/README.md`, the staff guide. Validated by two Ringer review rounds, four read-only lanes each.
- PR 29, merged `471eb95` (no ticket): `access/company/` holds the approved 27-role map, the four company capabilities and no agent product. `tests/company-policy.test.ts` parses the approved table so the YAML and the document cannot drift.
- Gateway `main` is `471eb95`. `npm test`: 6 files, 130 tests pass.

### 4. Method notes worth keeping

- Local CRM database tests are possible: a throwaway `postgres:17-alpine` on the docker host, tunnelled to `127.0.0.1:55439`. One suite takes about 20 seconds, against 35 minutes for a CRM CI run. The exact commands are in the resume memory.
- A Codex worker needs `sandbox_workspace_write.network_access=true` to reach that database or to open the gateway's local test listeners.
- Ringer's check is capped at 60 seconds (`CHECK_TIMEOUT_S`). Run the full gateway suite (about 52 seconds) as the orchestrator, not twice inside a check.

## Git State

| Repo | Branch | Last commit | Uncommitted |
|------|--------|-------------|-------------|
| a-roofers-open-brain (this worktree) | `claude/mcp-pdf-load-speed-handoff-d4f0e0` | the commit that adds this handoff | none |
| mcp.proexteriorsus.net (`/Volumes/M1 Application SSD/Projects/mcp.proexteriorsus.net`) | `main` | `471eb95` — "Merge pull request #29 from Clvrwrk/policy/company-role-map" | none |
| CRM_PWA (clone at `Archives/home-builds/mcp-gateway-build/crm-pwa-split`) | detached at `75793081` | "mcp_api contract: org chart, one office per call, under the CRM's own HR rule (#337)" | none |

CRM `main` has moved on to `7202a494` through other sessions' work. That does not affect the vendored contract, which is pinned at `75793081`.

## Task Cut Off

None. The session ended at a clean boundary. No test container or tunnel is running.

## Next Task — Start Here

**Task:** Ticket 13, staging deploy and acceptance (gateway issue 14). Start with the parts that need nothing from Chris.

**What to check / do:**
1. Read gateway issue 14 and `docs/admin/README.md` ("What is true today").
2. Build, in order, each as its own pull request:
   - A real Postgres provider behind the existing query interface (`src/database.ts`), for the working database and the separate audit database. Today every run and every operator command uses a private embedded database, so the kill switch, registration and offboarding cannot affect a running gateway.
   - A Dockerfile that ships `contracts/` and `access/` (schemas are read at runtime), and reports `buildCommit` on `/healthz` from the build.
   - Sentry wiring behind an environment placeholder, replacing the stderr `ContractBreachReporter`. The self-heal kit (`scripts/self-heal/`, `.github/workflows/self-heal.yml`).
3. Stop and ask Chris before anything that touches a host or a database: creating the Coolify app, creating or choosing a staging database, applying the three CRM migrations, running `ops/mcp-gateway/install-role.sql`.
4. When the first Coolify app is created from a branch, write "switch its source to `main` after merge" as an open checkbox the moment the app exists.
5. Acceptance needs a signed-in check on a test-named host. Confirm the WorkOS staging test person exists before the deploy, not after.

**If CRM CI fails on SR-24:** every new `crm` or `crm_private` function needs a pin in a changed `scripts/test-*.mjs` file. Pins inside a vitest file do not count.

**If a gateway test that passed before now fails after a seed change:** the new seed changed shared data. Test-only people, role grants and agent instances belong inside the test file, never in the global seed.

**If a command naming `.env.example` is refused:** a permission rule on this machine blocks it. Do not work around it; document settings in `README.md` and the runbook.

**Prompt to use:** "Read docs/handoffs/2026-11-14-mcp-gateway-handoff.md on branch claude/mcp-pdf-load-speed-handoff-d4f0e0 and the memory file mcp-gateway-build-resume. Then read gateway issue 14 and start the parts of ticket 13 that need nothing from me, beginning with the real Postgres provider."

## Decisions Made This Session

- **Merge order for CRM main was MCP first** (Chris: "Yes, merge 319 first"). Each CRM merge puts the other open CRM PRs behind `main`.
- **CodeRabbit was skipped on CRM PR 329** (Chris: "Merge mcp gateway, skip cr review"). Greptile's two findings on it were fixed first.
- **The gateway never widens a CRM rule.** `org_chart` mirrors `crm.read_hr_org_chart`: managers and department heads only, within their offices. Holding the capability lets an agent ask; the CRM decides.
- **One generic refusal.** A missing record, another organization's record and a record the person cannot see return the same answer, in the CRM functions and in the tools.
- **`crm.job_notes.read` is its own capability,** because the approved map gives the three accounting roles Jobs without Job notes.
- **The contract is vendored with checksums.** CI cannot read the private CRM repository, so `PIN.json` is the drift guard.
- **No new dependency for schema validation.** `src/contract-validator.ts` covers exactly what the vendored schemas use.
- **Two policy bundles.** `access/` stays the test bundle and the default. `access/company/` is the real one, selected with `POLICY_DIRECTORY`. It lists no agent product, so it refuses everything until one passes the company review.
- **Gateway tool PRs were merged without a bot review.** Automatic reviews are off for that repository and none was requested.
- **The staff guide stays in plain language.** Reviewers asked for internal field names and HTTP details; those belong in `docs/agents/usage-guide.md`.

## Blockers Requiring Human Action

1. **Ticket 13 inputs:** a WorkOS staging test person who can reach a signed-in page without a CAPTCHA, and a Sentry project.
2. **Staging database and role:** approval to apply the three CRM migrations (`20261202090000`, `20261202100000`, `20261204090000`) and to install the `mcp_gateway` role. No staging database is known to exist.
3. **An agent product for staging.** The company bundle lists none. Acceptance needs an entry, which waits on a product passing the company review, or a decision to use a staging-only entry.
4. **Office names for the org chart.** The tool needs an office key and the agent has no way to look one up. Decide: add an office list to something the agent already reads, or add a small offices function to the CRM contract.
5. **Who may see the org chart.** The approved map gives every role the capability; the CRM refuses everyone except managers and department heads. Staff outside management will see refusals until the CRM rule changes.
6. **A3 section 9, decisions 3 to 7.** They gate connecting any agent product or reading production data.
7. **PR 76 (a-roofers-open-brain)** still needs Chris's admin merge. It records the A3 decisions. See the note on `current.md` at the top.
8. **WorkOS staging setup:** register the gateway URL as a resource indicator, turn on client registration, and read the real claim names from an AuthKit token. The code assumes `org_id`, `client_id`, `sid`.

## Verification Commands

1. `cd "/Volumes/M1 Application SSD/Projects/mcp.proexteriorsus.net" && git log --oneline -1` — `471eb95 Merge pull request #29 …`.
2. `cd "/Volumes/M1 Application SSD/Projects/mcp.proexteriorsus.net" && npm test` — `Test Files 6 passed (6)`, `Tests 130 passed (130)`.
3. `gh issue list -R Clvrwrk/mcp.proexteriorsus.net --state open` — issues 1 and 14 only.
4. `gh pr list -R Clvrwrk/mcp.proexteriorsus.net --state open` — none.
5. `gh pr view 337 -R Clvrwrk/CRM_PWA --json state,mergeCommit` — `MERGED`, `75793081…`.
6. `docker ps -a --filter name=crm-test-mcp` — no container.

## Full Context

### What was built across ALL sessions (complete feature list)

- A3 proposal `proposals/a3-pe-connect-agent-gateway.md`, merged (brain PR 74), twice reviewed.
- Gateway repository with spec (issue 1) and thirteen tickets.
- Gateway, merged: walking skeleton (PR 15), agent instruction standard (PR 16), policy (PR 17), instance registry, kill switch and call limits (PR 19), audit store (PR 20), WorkOS sign-in (PR 21), administrator runbook (PR 22), role map documents (PRs 18, 23, 24), job tools and vendored contract (PR 25), job notes tool (PR 26), HR tools (PR 27), staff guide (PR 28), company policy bundle (PR 29).
- CRM, merged: HR org chart access tables (PR 317), `mcp_api` contract in three slices (PRs 319, 329, 337).

### What is NOT true yet (do not report otherwise)

- The gateway is not deployed anywhere. It runs only with `GATEWAY_MODE=test`.
- The five tools have only run against stand-in CRM functions in an embedded database. The real functions have only run in the CRM's own database tests. The two have never run connected.
- No CRM migration for `mcp_api` is applied to any database. The `mcp_gateway` role is installed nowhere.
- `find_jobs` and `org_chart` have not been timed on production-size data.
- The operator commands (kill switch, register, audit tail) each start a private embedded database. There is no working kill switch, rollback or offboarding against a running gateway.
- Sign-in has never run against real WorkOS.
- The company policy bundle has only static tests. It has not run behind the HTTP endpoint.
- The staff guide's final wording was not re-reviewed after the second round's fixes.
- CodeRabbit did not review CRM PR 329 or 337. Greptile did not review PR 337. No bot reviewed gateway PRs 25 to 29.
- The static pin scripts in the CRM are not run by CI.
- Nine moderate `npm audit` findings in the gateway's dev dependencies are not triaged.

### Architecture decisions

- TypeScript on Node 22, official MCP SDK, Streamable HTTP only, stateless.
- PGlite (embedded Postgres) for gateway dev and tests. The real CRM SQL cannot load there, so `seed/005` to `seed/007` hold stand-in `mcp_api` functions with the contract's shapes, and the connector is also fed every vendored CRM fixture.
- Two authorities, kept apart: HR role grants decide which tools a person's agent may use; the CRM's own rules decide which records each function returns.
- The gateway reads the vendored schemas at runtime, so a container image must ship `contracts/`.
- Refusals: 401 sign in; 403 unregistered instance or no membership; 503 kill switch; 429 with `Retry-After`; 400 for a JSON-RPC batch. The refusal text is fixed.
- The audit sink is insert-only against a separate database. A result is released only after its event is stored.

### Design system (if applicable)

Not applicable. The gateway has no screens. Any future admin screen follows https://ds.proexteriorsus.net and needs a mockup first.

### Key invariants (never violate)

- Staging and seeded data only until Chris settles A3 decisions 3 to 8.
- No client-brain or Historian tool to a vendor-hosted agent (hard rule 5).
- Read-only in phase one; QuickBooks never (hard rule 13).
- CRM migrations are additive and are not applied to any hosted database without Chris.
- Never call anything live without the three checks: running commit, source branch, signed-in page with real data. Claude cannot sign in to production sites.
- Never edit `contracts/crm` by hand. Re-vendor from a CRM checkout.
- The approved role table (`docs/admin/role-map-from-catalog.md`) and `access/company/role-map.yaml` change together, by pull request.

### Service / deployment map (if applicable)

| Service | Detail |
|---------|--------|
| Gateway | not deployed. Planned staging host `mcp-staging.proexteriorsus.net`; planned production `mcp.proexteriorsus.net` |
| CRM | https://crm.proexteriorsus.net — `buildCommit` `d961dbcb` (does not contain the `mcp_api` work; no app code changed) |
| HR | https://hr.proexteriorsus.net — `buildCommit` `7202a494` |
| Command Center | https://cc.proexteriorsus.net — `buildCommit` `60b975c8` |
| Shared Supabase | project `rnhmvcpsvtqjlffpsayu` (production data; the gateway must not touch it yet) |
| Ringer | run `mcp-gateway-build`; workdir `~/mcp-gateway-build` (symlink to M1 `Archives/home-builds/mcp-gateway-build`); manifests `manifest-t02b-*`, `t02c`, `t08` to `t11`, `policy-company-role-map` |
| Linear | PEC-976 (status record) and PEC-977 (items that need Chris) |
| Resume memory | `mcp-gateway-build-resume.md` in the Claude project memory folder |
