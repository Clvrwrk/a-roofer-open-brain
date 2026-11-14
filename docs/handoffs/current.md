# Project Handoff — Company MCP gateway for staff AI agents (pe-connect)
**Project:** Staff AI agent gateway: the A3 in a-roofers-open-brain, the gateway in `mcp.proexteriorsus.net`, the data contract in `CRM_PWA`
**Repo:** https://github.com/Clvrwrk/mcp.proexteriorsus.net (gateway) · https://github.com/Clvrwrk/CRM_PWA (data contract) · https://github.com/Clvrwrk/a-roofer-open-brain (A3)
**Production URL:** not yet deployed. No staging host exists either. The gateway has only run in tests.
**Date:** 2026-11-13 20:55 PST
**Agent:** Lead Orchestrator (Claude Code), with Ringer workers on GPT-5.6 Sol
**Reason:** User-requested (/project-handoff)

The previous handoff (CRM journey work, 2026-10-06) is at `docs/handoffs/archive/2026-11-13-2050-crm-journey-handoff-2026-10-06.md`.

---

## Accomplished This Session

### Proposal (a-roofers-open-brain)

- `proposals/a3-pe-connect-agent-gateway.md`: wrote the A3 for one company-owned remote MCP gateway that staff agents (Grok Bot, ChatGPT dots, Claude Duet) connect to. Merged as PR 74 (`7f296285`, admin override at Chris's instruction).
- Two Ringer review rounds on the A3 (run `pe-connect-a3-review`, five lanes): 42 findings, then 31 with none at P0. Both rounds were applied. The text after the second revision has not been reviewed again.
- PR 76 (open): records Chris's decisions in the A3. Decision 1 (10x exemption), decision 2 (new repo), decision 8 (27-role catalog map), and the "build to staging" status.

### Gateway (Clvrwrk/mcp.proexteriorsus.net, new repo, `main` at `059470f`, 59 tests pass)

- Issue 1: the spec. Issues 2 to 14: thirteen tickets (ticket NN is issue NN+1), each with a `Blocked by:` line.
- PR 15 (ticket 01): walking skeleton. Streamable HTTP MCP server, one seeded tool call end to end, `/healthz` with `buildCommit`.
- PR 16 (ticket 03): agent instruction standard. Server instructions, tool description standard, usage guide (`docs/agents/`).
- PR 17 (ticket 04): policy. `access/capabilities.yaml`, `role-map.yaml`, `agent-ceilings.yaml`; effective access is the intersection; training gate fails closed.
- PR 19 (ticket 06): instance registry, kill switch, call limits, JSON-RPC batch rejection, refusal status codes.
- PR 20 (ticket 07): audit store in a separate append-only database.
- PR 21 (ticket 05): sign-in as an OAuth 2.1 protected resource with WorkOS AuthKit as the authorization server. Tested only against a local stand-in issuer.
- PR 22 (ticket 12): administrator runbook (`docs/admin/`, ten pages).
- PR 18, then PR 23 and 24: role map. The nine-role residential map (PR 18) used keys that are not in the real catalog. PR 23 replaced it with a map over the 27 HR catalog roles, which Chris approved as written (`docs/admin/role-map-from-catalog.md`).

### CRM data contract (Clvrwrk/CRM_PWA)

- PR 317 (merged as `f6f07305`): the HR org chart access tables, split out of PR 308 so the gateway was not blocked by the screens.
- PR 319 (open, branch `chussey/mcp-api-contract-v1`, head `dff9f968`): ticket 02, first slice.
  - `supabase/migrations/20261202090000_mcp_api_contract.sql`: schema `mcp_api`, `crm_private.mcp_membership`, `mcp_api.effective_access`, `mcp_api.directory_search`.
  - `ops/mcp-gateway/install-role.sql` and `README.md`: installer for the `mcp_gateway` database role.
  - `supabase/contracts/mcp_api/v1/`: JSON schemas, fixtures, role keys, README.
  - `tests/database/mcp-api-contract.test.ts`: 9 tests. `scripts/test-mcp-api-contract.mjs`: the SR-24 pins.
  - `docs/architecture/MCP-API.md` and a `docs/delivery/STATUS.md` entry.
  - CI passed on `dafb4fed` and again on `235576f2` (9 database tests on Postgres 17). `dff9f968` merges main after PR 308 landed; its CI run had just started when this was written.

### What changed underneath this work (another session, same day)

- CRM_PWA PR 308 merged as `be899eda` at 2026-11-14 02:28Z. hr.proexteriorsus.net reports that commit.
- Migrations `20261201090000`, `20261201100000` and `20261201110000` (tables, writers including `crm.read_hr_access`, and the 27-role seed) are applied to production. Source: the CRM `docs/delivery/STATUS.md` entry, approved by Chris 2026-11-13 22:19Z. This session did not check the production ledger itself.

## Git State

| Repo | Branch | Last commit | Uncommitted |
|------|--------|-------------|-------------|
| a-roofers-open-brain (this worktree) | `contrib/cleverwork/pe-connect-a3-decisions` (PR 76) | the commit that adds this handoff | none |
| mcp.proexteriorsus.net | `main` | `059470f` — "Merge pull request #24 from Clvrwrk/docs/runbook-role-map-links" | none |
| CRM_PWA (clone at `Archives/home-builds/mcp-gateway-build/crm-pwa-split`) | `chussey/mcp-api-contract-v1` (PR 319) | `dff9f968` — "Merge origin/main (hr org chart rebuild, #308) into chussey/mcp-api-contract-v1" | none |

## Task Cut Off

None. The session ended at a clean boundary. One check was still running: CI for PR 319 on `dff9f968`.

## Next Task — Start Here

**Task:** Land PR 319, then build ticket 02b (job and job-notes functions in `mcp_api`).

**What to check / do:**
1. Read the real CI result for PR 319: `gh run list -R Clvrwrk/CRM_PWA --branch chussey/mcp-api-contract-v1 --limit 3`, then `gh run view <id> --json conclusion`. Do not trust `gh run watch | tail`.
2. If green and Chris says merge: `gh pr merge 319 -R Clvrwrk/CRM_PWA --squash`. If CRM `main` has moved again, merge it in first; `docs/delivery/STATUS.md` and the skip list in `scripts/test-my-jobs.mjs` conflict every time.
3. Now that PR 308 is on `main`, read `crm.read_hr_access` in `20261201100000_hr_org_chart_access_writers.sql` and compare it with `mcp_api.effective_access`. Reuse its helpers (`crm_private.hr_role_current`, `hr_grant_at`, `hr_oc_scope`) where they do the same job.
4. Check `supabase/contracts/mcp_api/v1/role-keys.json` against the merged seed. It holds two keys (`client_support_lead`, `field_coordinator`) that are not in `20261201110000_hr_role_catalog_matrix_seed.sql`. Decide whether they are test-only fixtures or should be the real 27.
5. Ticket 02b in a new CRM branch: `mcp_api.find_jobs`, `mcp_api.get_job`, `mcp_api.list_job_notes` (coverage and cursor, never marks anything read). Reuse `crm_private.effort_visible(m,m,e)` and `crm_private.job_notes_page`. Then `org_chart`.
6. Then gateway tickets 08 to 10 (issues 9, 10, 11): vendor the contract at a pinned CRM commit and build the tools.

**If CRM CI fails on SR-24:** every new `crm` or `crm_private` function needs a pin in a `scripts/test-*.mjs` file changed in the same diff. Pins inside a vitest file do not count.

**If CRM CI fails in `test:db:my-jobs`:** the new migration is missing from the skip list in `scripts/test-my-jobs.mjs`.

**Prompt to use:** "Read docs/handoffs/current.md in the pe-workflow-ai-connectivity worktree and the memory file mcp-gateway-build-resume. Check CI on CRM_PWA PR 319, then start ticket 02b."

## Decisions Made This Session

- **10x gate exemption:** Chris classed the gateway as mission-grade infrastructure (hard rule 9).
- **New repo `Clvrwrk/mcp.proexteriorsus.net`:** the gateway is not part of the client brain and must not share its lineage.
- **Build to staging with seeded test data only:** no agent product is connected and no production data is read until A3 decisions 3 to 8 are settled.
- **Tracker is GitHub issues in the new repo:** spec is issue 1.
- **Two test seams:** the MCP HTTP endpoint, and the CRM database functions in the CRM test suite.
- **Phase one is read-only CRM and HR:** no Historian or client-brain tool is exposed to a vendor-hosted agent (hard rule 5). QuickBooks is never reachable.
- **Access source is the HR role catalog (27 roles):** Chris approved the map as written. The earlier nine-role residential map is superseded.
- **Documentation is a first-class deliverable:** Chris corrected the first breakdown for lacking instructions for human users and for agents. Staff guide, admin runbook, agent-facing instructions and `AGENTS.md` are tickets, not afterthoughts.
- **Ringer engine:** GPT-5.6 Sol.
- **PR 308 was split, not merged by this session:** Chris chose "split out the migration" (PR 317) while another session finished the screens.
- **Contract lives in CRM_PWA, the gateway vendors it:** the gateway never reads CRM tables. It gets `USAGE` on `mcp_api` and `EXECUTE` on the readers through a `NOLOGIN NOINHERIT` role.

## Blockers Requiring Human Action

1. **PR 76 (a-roofers-open-brain)** — merge state is BLOCKED on review. Needs Chris's admin merge. Merging to `main` triggers a Command Center build because the commit hook bumps `version.ts`.
2. **PR 319 (CRM_PWA)** — Chris to say merge once CI is green. Not applied to any database; the `mcp_gateway` role is not installed anywhere.
3. **Ticket 13 (staging deploy)** — needs a WorkOS staging test person and a Sentry project.
4. **A3 section 9, decisions 3 to 7** — still open. They gate connecting any agent product.
5. **WorkOS staging** — register the gateway URL as a resource indicator, turn on client registration, and read the real claim names for org, client id and session from an AuthKit token. The code assumes `org_id`, `client_id`, `sid`.

## Verification Commands

1. `cd "/Volumes/M1 Application SSD/Projects/mcp.proexteriorsus.net" && npm test` — should report 59 tests passing.
2. `gh issue list -R Clvrwrk/mcp.proexteriorsus.net --state open` — should list issues 1, 3, 9, 10, 11, 12, 14.
3. `gh pr view 319 -R Clvrwrk/CRM_PWA --json state,mergeStateStatus` — `OPEN`, and not `DIRTY`.
4. `curl -s https://hr.proexteriorsus.net/healthz` — `buildCommit` should be `be899eda…` or later.
5. `cd ~/mcp-gateway-build/crm-pwa-split && node scripts/test-mcp-api-contract.mjs` — prints `mcp api contract pins: ok`.

## Full Context

### What was built across ALL sessions (complete feature list)

Earlier CRM and Command Center work is listed in the archived handoff named at the top. For this project:

- A3 proposal, merged, twice reviewed.
- Gateway repo with spec, thirteen tickets, and tickets 01, 03, 04, 05, 06, 07, 12 merged.
- Approved 27-role map.
- CRM tables for role grants (PR 317, merged; applied to production by another session).
- CRM `mcp_api` contract v1, first slice (PR 319, open).

### What is NOT true yet (do not report otherwise)

- The gateway is not deployed anywhere. `GATEWAY_MODE=test` only.
- The operator commands (kill switch, register, audit tail) each start a private embedded database. They cannot affect a running gateway. There is no working kill switch, rollback or offboarding until ticket 13 adds a persistent Postgres.
- The only tool is a seeded directory lookup. No job, notes or org chart tool exists.
- Sign-in has never run against real WorkOS.
- Nine moderate `npm audit` findings in dev dependencies are not triaged.
- The gateway repo and CRM_PWA have automatic CodeRabbit and Greptile reviews turned off. None of the merged gateway PRs had a bot review.

### Architecture decisions

- TypeScript on Node 22, official MCP SDK, Streamable HTTP only, stateless.
- PGlite (embedded Postgres) for dev and tests, because Docker on this Mac points at the remote Hetzner host and there is no local Postgres. CRM database tests run only in CI (about 15 minutes, Postgres 17).
- Refusals: 401 means sign in; 403 unregistered instance or no membership; 503 kill switch; 429 with `Retry-After`; 400 for a JSON-RPC batch. The refusal text is fixed and tells the agent to stop and tell the person.
- Policy bundle is hashed (SHA-256); a catalog that does not match the bundle is refused.
- Audit sink is insert-only against a separate database.

### Design system (if applicable)

Not applicable. The gateway has no screens. Any future admin screen follows https://ds.proexteriorsus.net and needs a mockup first.

### Key invariants (never violate)

- Staging and seeded data only until Chris settles A3 decisions 3 to 8: this is the approval the build runs under.
- No client-brain or Historian tool to a vendor-hosted agent: hard rule 5.
- Read-only in phase one; QuickBooks never: hard rule 13.
- CRM migrations are additive and are not applied to production without Chris.
- Never call anything live without the three checks in the global deploy rule (running commit, source branch, signed-in page with real data). Claude cannot sign in to production sites.
- When the first Coolify app is created from a branch, switch its source to `main` after the merge.

### Service / deployment map (if applicable)

| Service | Detail |
|---------|--------|
| Gateway | not deployed. Planned staging host `mcp-staging.proexteriorsus.net`; planned production `mcp.proexteriorsus.net` |
| CRM | https://crm.proexteriorsus.net — `buildCommit` `d961dbcb` at 2026-11-14 04:49Z |
| HR | https://hr.proexteriorsus.net — `buildCommit` `be899eda` |
| Command Center | https://cc.proexteriorsus.net — `buildCommit` `60b975c8` |
| Shared Supabase | project `rnhmvcpsvtqjlffpsayu` (production data; the gateway must not touch it yet) |
| Ringer | `~/Library/CloudStorage/Dropbox-AIA4/Cleverwork Main/GROK/OpenEngine/repos/ringer`; run `mcp-gateway-build`; workdir `~/mcp-gateway-build` |
| Linear | PEC-976 (status record, links the GitHub issues) and PEC-977 (items that need Chris) |
| Resume memory | `mcp-gateway-build-resume.md` and `pe-connect-a3-resume.md` in the Claude project memory folder |
