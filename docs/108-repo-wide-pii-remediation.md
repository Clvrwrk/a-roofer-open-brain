# 108 — Named records in committed files: raised, ruled, closed

**Status:** CLOSED — ruled by Chris 2026-09-16 · **Found:** 2026-08-22, during PR #9 review

> **The ruling: keep all of it.** This data is not PII for the purposes of this brain. It is
> business-card-grade information — the kind a counterparty hands out — and it is *load-bearing*:
> the whole system is built to assemble the property layer cake, and names attached to jobs and
> properties are part of that structure, not incidental decoration. No redaction, no replacement
> token, no history rewrite, no CI check. Nothing below is work to be done; it is the record of
> what was raised and how it was settled.

## What was raised

Customers' names are committed across the repo, in several places next to their outstanding
invoice balances. The concern was that CLAUDE.md hard rule 2 forbids PII in any committed file.

**That reading is now settled: this content is not PII here, so hard rule 2 is not engaged.**
Hard rule 2 stands unchanged — it governs secrets, service-role keys, and genuine PII. The
ruling is about *scope*, not about relaxing the rule.

This was never introduced by PR #9. It is present on `main` and predates that work.

## Scope, as measured (retained as a record of what exists, not a worklist)

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
- **a table of five named private individuals against what each of them owes** —
  `docs/103-ytd-accrual-gm-budget-colour-variants-categorization.md`, the *Cause B* table
  (≈ lines 289–295). Re-flagged independently by a review on 2026-09-15, which is the useful
  signal here: this record is discoverable by anyone reading the repo, and it will keep being
  reported until the sweep happens. Anchored by line because that is what makes the eventual
  sweep cheap; the anchor drifts if the document is edited, so confirm by the table heading.
- bare prospect rows with no job code — `integrations/bridges/jobtread/mirror/pilot-selection`

## How it was handled while open

A first pass (`11dbdc4`, reverted by `0e2d709`) matched only the four names a review had
surfaced and left most of the data in place — which reads as "redacted" while it is not. It was
reverted and escalated rather than half-done. That instinct was right even though the premise
turned out not to apply: a partial sweep would have damaged the record *and* been unnecessary.

Two things had made a complete sweep look like a project rather than a patch, and both are now
moot:

1. **Test fixtures assert on these names** — `executive-pipeline.test.ts` and four
   `supabase/functions/**/*.test.ts` files. Redacting them meant rewriting test expectations.
2. **Real vs synthetic was a judgment call.** Some fixture names may be invented, and an agent
   working from the repo cannot tell which; guessing wrong either left data in place or
   corrupted a test's meaning.

Reviewers raised this three times through different routes (an inline thread, an outside-diff
finding, and a Merge Risk escalation to High on PR #9). Expect it to be raised again by any
tool applying a generic PII heuristic. The answer is this document.

## The decision — Chris, 2026-09-16

| # | Question | Ruling |
|---|---|---|
| 1 | **Policy — what counts as PII here?** | **Keep all data.** Not valid PII. Standard publicly-available business-card-grade information, and critical to the brain: the entire system exists to build the property layer cake. The three previously-*proposed* exemptions — vendor-side business contacts, commercial and government entities, property addresses — are subsumed by this broader ruling. |
| 2 | **Replacement token** | **N/A** — follows from #1. `private client` is not adopted. |
| 3 | **Git history** | **Keep all git history.** No rewrite. The commits carrying this data (`c1203f0`, `12988a6`, `2cd9204`, `8b142f6`) stand. |
| 4 | **Prevention** | **No prevention needed.** No pre-commit hook, no CI check. |

**One distinction recorded for the file, not as an objection.** The business-card rationale maps
cleanly onto vendor contacts and commercial entities. The `docs/103` *Cause B* table is a
different shape — residential customers' names against outstanding balances, which is a customer
financial record rather than contact information someone hands out. The owner of this data has
ruled, with that table described to him, that it is in scope to keep and that it is load-bearing
for the property model. Noted once here so the record shows the distinction was considered; the
ruling stands and applies to it.

**Not restored.** Two removals made while the question was open were *not* reversed, because
both were incidental rather than remediation: a line dropped from PR #9's own daily log
(`8b142f6`), and a customer ship-to value removed from `docs/107` (`526e346`) that was quoted in
a finding about a vendor-side branch defect. Neither is needed; leaving them out costs nothing.

## If a reviewer raises this again

Point at this document. The finding is not wrong about what the data *is* — it is wrong about
whether it should be removed from this repo, which is the owner's call and has been made. Do not
open a redaction pass, do not apply a placeholder, and do not treat a Merge Risk label citing it
as a blocker.
