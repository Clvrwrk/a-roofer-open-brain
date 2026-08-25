# 108 — Repo-wide customer PII in committed records (open, needs a human)

**Status:** OPEN · **Found:** 2026-08-22, during PR #9 review · **Severity:** hard rule 2 violation

## What

Real customers' names are committed across the repo, in several places next to their
outstanding invoice balances. CLAUDE.md hard rule 2 forbids PII in any committed file.

This is **not** introduced by PR #9. It is present on `main` today and predates that work.
PR #9 surfaced it and removed one instance from its own daily log (`8b142f6`).

## Scope, as measured

One pattern — a job code followed by a person's name (`KS-158: <name>`) — appears in
**18 tracked files**:

```text
.planning/ROADMAP.md
.planning/phases/01-foundation-.../01-02-PLAN.md
.planning/phases/01-foundation-.../01-RESEARCH.md
.planning/phases/02-multi-location-full-ingestion/02-04-SUMMARY.md
.planning/phases/04-sandbox-write-.../04-PATTERNS.md
app/command-center/src/lib/executive-pipeline.test.ts
context/memory/2026-08-19.md
docs/96-credit-memo-work-surface.md
docs/knowledge-base/acculynx/data/jobs.md
integrations/bridges/jobtread/mirror/b3-execute/execution-report.md
integrations/bridges/jobtread/mirror/pilot-selection/pilot-selection.md
schemas/cleverwork-roofer/104-invoice-acculynx-match-view.sql
schemas/cleverwork-roofer/254-po-number-canonical-acculynx-job.sql
skills/cleverwork-roofer/acculynx-api/SKILL.md
supabase/functions/acculynx-read-sweep/sweep.test.ts
supabase/functions/acculynx-sync/resources/crm-pipeline.test.ts
supabase/functions/acculynx-write-action/action.test.ts
supabase/functions/acculynx-write-sweep/sweep.test.ts
```

**That is one pattern of several.** Others already seen and not yet enumerated repo-wide:

- a client column in a table (`| CO-356 | <name> |`) — `docs/101`, `docs/103`
- prose mentions (`job 10, <name> (TX)`) — `docs/103`, `schemas/…/263`
- **a table of five named private individuals against what each of them owes** — `docs/103`
- bare prospect rows with no job code — `integrations/bridges/jobtread/mirror/pilot-selection`

## Why it was not fixed in PR #9

A first pass (`11dbdc4`, reverted by `0e2d709`) matched only the four names a review had
already surfaced, and left most of the data in place — which reads as "redacted" while it
is not. That is worse than leaving it untouched, so it was reverted and escalated instead.

Two things make a complete sweep a project rather than a patch:

1. **Test fixtures assert on these names.** Redacting `executive-pipeline.test.ts` and the
   four `supabase/functions/**/*.test.ts` files means rewriting test expectations, not
   editing prose.
2. **Real vs synthetic is a judgment call.** Some fixture names may be invented. Telling
   which is which needs knowledge of the data that an agent working from the repo does not
   have, and guessing wrong either leaves PII or corrupts a test's meaning.

## Decisions needed

1. **Policy — what counts as PII here?** Private individuals' names are clearly in scope.
   **Nothing below is exempt yet.** These are *proposed* exemptions for a human to accept or
   reject; until that happens every named record stays in scope, and none has been retained
   on the strength of this list:
   - **vendor-side business contacts** (e.g. the SRS sales agent named in `docs/101`) —
     business contacts rather than customers, and material to the pricing narrative;
   - **commercial and government entities** (`Lone Star Towers`, `Bureau of Indian Affairs`,
     `JPMC #143923`) — organisations, not people;
   - **property addresses.** In this repo the *property* is the primary key and atoms about a
     place carry `property_id`; the address is data hanging off that key, not the key itself.
     Redacting addresses would defeat the point of the brain, and they identify a place rather
     than a person — customer names are the line.
2. **Replacement token.** `private client` keeps tables readable and preserves the job
   number, which is the operational key — AccuLynx stays the system of record for identity.
3. **Git history.** Redacting the tree does not purge history. At least four commits carry
   the data (`c1203f0`, `12988a6`, `2cd9204`, `8b142f6`). Purging needs a history rewrite:
   destructive, coordination-heavy, and a human decision.
4. **Prevention.** A pre-commit or CI check for the job-code-plus-name pattern would stop
   recurrence. Cheap, and the reason this went unnoticed for so long.

## Recommendation

Run this as its own change, one workstream at a time, docs before test fixtures, with the
policy in §1 settled first. Do not attach it to an unrelated feature PR.
