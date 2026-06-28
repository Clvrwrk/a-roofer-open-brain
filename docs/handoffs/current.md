# Project Handoff — A Roofer's Open Brain (Command Center)

**Project:** a-roofers-open-brain
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain (`origin`)
**Production URL:** https://cc.proexteriorsus.net (Coolify ← GitHub `main`; shared prod Supabase `rnhmvcpsvtqjlffpsayu`)
**Date:** 2026-06-28 10:34
**Agent:** Lead Orchestrator
**Reason:** End of session (/project-handoff)

> ⚠️ **StormWatch Pause (still active)** — property-layer pipeline deploy paused pending Reonomy/ZoomInfo terms + E2E validation. Artifacts committed ≠ deployed.

---

## TL;DR — where we left off

- **Validated all 5 of Alex's daily SOPs against prod** in a one-step walkthrough; rewrote them in `docs/57` (morning_abc_sync v3).
- **Designed + approved `docs/59`** — the Invoice Audit UI/UX rebuild + Alex/Maya SOP-presentation plan (6 tasks, 3 red-team passes).
- **Built Task 1** — `v_invoice_audit_line_cascade` (benchmark cascade view), applied to prod (migration 154), RT-1 passed. Live in DB; no surface consumes it yet.
- `main == origin/main == e73da79`. On branch **`contrib/cleverwork/invoice-audit-sop-presentation`** (even with main) for the remaining UI tasks. Tree clean.

---

## Accomplished This Session

### Alex daily SOP validation (prod walkthrough) → `docs/57` rewrite
- Ran all 5 dailies against prod, one at a time, with decision gates. Corrected a key misdiagnosis: the audit's "6% coverage" was a *history-vs-recent artifact*, not a broken matching foundation (the audit chain `v_invoice_audit_line` is correct; branch matches are time-versioned to current agreements).
- **SOP 1** `agreement_ingestion_sweep` → re-scoped to a daily *freshness audit* (canonical table `abc_price_agreements` already exists); source extractors split to a build task (#6).
- **SOP 2** `morning_abc_sync` → **v3**: scope = OPEN + unpaid + ≥60-days-old (rolling), benchmark **cascade** (agreement → API → recent same-item/same-branch), per-invoice **gross $25 floor**, ≥6%→hold+credit-memo, 3–6%→weekly, recurring grouped, all-unmatched→Jordan. Daily full set.
- **SOP 3** coverage → triage retained as future refinement (current decision: all unmatched → Jordan).
- **SOP 4** gap_followup → owner = **Jordan** (overrides deployed Lucinda model); wire `due_at`+7d/`cycle_count`.
- **SOP 5** variance_daily_summary → digest template rewritten; drop the 3–6% line.

### Invoice Audit rebuild plan → `docs/59` (APPROVED)
- Decisions: D1 attribution by actor+role (Alex=variance/holds, Maya=intake, human shown); D2 date filter hard-bound to open+60d **+ "Show all" check**, replaces status selector; D3 per-invoice "Go back"; D4 reset = status + reverse internal effects (holds, draft credit memos), append-only; D5 Most-Recent column; D6 cascade display; **D7 credit memos → "Org Inv Price" column** (original invoice price, replaces Most-Recent).
- Deferred (tracked, not built): nest-close should close disposition window; "passed" must not collapse nest.

### Task 1 — benchmark cascade view (built, RT-1 passed)
- `schemas/cleverwork-roofer/154-invoice-audit-cascade.sql`: `v_invoice_audit_line_cascade` — per line negotiated→API→recent / org_inv(credit memos), `benchmark_source`+`benchmark_price`+cascaded variance. Applied to prod (additive).
- RT-1 fixes: org_inv ref-format mismatch (`-1` vs `-001` → base-number match; 0→106 CM lines resolve); `recent` now excludes prior credit memos.
- Validated open+60d: 82 lines (api 10 / recent 36 / none 36); 5 ACTION invoices ($1,165.46) + 12 weekly; 36 lines → Jordan.

### Commits this session (on `main` unless noted)
- `98296aa` docs(accounting): docs/57 SOP validation + docs/59 plan
- `b9c9abc` feat(agents): Open Engine v1.0.1 (AGENTS.md + pe-cc-* bumps)
- `83c0dfd` docs(kb): Open Engine / Open Skills knowledge base
- `e73da79` feat(audit): benchmark cascade view (migration 154) — **latest, on main + contrib**

## Git State
- **Branch:** `contrib/cleverwork/invoice-audit-sop-presentation` (= `9882e5e`, 3 commits ahead of main + migration 157 applied to prod)
- **Last commit:** `9882e5e` — "feat(audit): date1↔date2 filter + Show all (docs/59 Task 4)"
- **`main`/`origin/main` = `02bd71f`** — contrib NOT merged yet (deploy is Gate 7).
- **Uncommitted:** ~44 concurrent DevTeam/SEO files (not invoice-audit; left in place per Chris) + `env.d.ts` (astro build artifact). Schemas mirrored through **157**.

## Task Cut Off
None — clean boundary. Task 1 committed + converged to main (migration is live in prod, so its source belongs on main).

---

## Next Task — Start Here

**Done since last handoff (all on `contrib/...`, preview-verified vs prod, build clean, 8 tests pass):**
Task 2 `d7bb284` (actionable scope), Task 3 `6f99fb1` (cascade column + badge), **migration 157** (cascade credit-memo coverage fix — view 154 missed all CMs), Task 4 `9882e5e` (date1↔date2 + "Show all").

**⚠ Tree state:** a concurrent **DevTeam/SEO** session left ~44 uncommitted files in the tree (agents/dev-engine, scripts, proposals, docs/59-endpoint-auth-matrix, schemas 155/156, modified access-control/middleware/prewarm). Per Chris, **commit only invoice-audit files** (explicit paths). Do NOT sweep these into the contrib branch or revert them.

**Task:** docs/59 **Task 5** — Alex/Maya attribution.

**What to check / do:**
1. On branch `contrib/cleverwork/invoice-audit-sop-presentation` (resume here). `git fetch`; tree still holds the DevTeam WIP — stage only invoice-audit paths.
2. **Task 5:** map action→persona (variance/audit/holds/credit-memo → **Alex**; intake/surfacing → **Maya**; human → human) from `dashboard_action_log.actor_type` + `action_type`/`source`; add an agent-vs-human badge. The line audit cell (`src/scripts/invoice-audit-tree.ts`, `auditCell`) shows `✓ {auditedBy}` from `v_invoice_line_audit_current` (approved_by/source) — verify whether actor_type is reachable there or needs joining.
3. **Task 6:** per-invoice "Go back" API (`api/invoice-audit/reset`, WorkOS-gated) — append neutral/pending records, reverse `not-to-be-paid` holds, cancel **draft** credit memos; never touch sent comms; cannot reset paid. Button on invoice header. → **RT-2**.
4. **Gate 7 — RT-3** integration/security, then merge contrib→main, push, Coolify deploy, verify on cc.proexteriorsus.net. NOTE: deploy must navigate the concurrent DevTeam WIP still in the tree.
- Verify UI with the preview tools (`command-center` launch config, port 4321, AUTH_MODE=disabled → Local Operator). Screenshot proof per task.

**Prompt to use:** "Read docs/handoffs/current.md and docs/59. Resume the Invoice Audit rebuild on branch contrib/cleverwork/invoice-audit-sop-presentation at Task 5 (Alex/Maya attribution). Tasks 2–4 + migration 157 are done. Commit only invoice-audit paths (concurrent DevTeam WIP is in the tree)."

## Decisions Made This Session
- **Audit matching is NOT broken** — low coverage was history-vs-recent scope; the daily SOP audits recent/aged invoices, not 36mo of history. Don't "fix" the matching foundation.
- **morning_abc_sync v3** — open+unpaid+≥60d, benchmark cascade, per-invoice gross $25 floor, all-unmatched→Jordan, daily full set (open filter self-bounds; paid drop out).
- **Cascade view is the shared foundation** for both the UI and morning_abc_sync v3 (task #9). Applied to prod early (additive) so dev surfaces can consume it → its source (154) converged to main.
- **Go-back is append-only** (new neutral record), never deletes (hard rule 1); reverses holds + *draft* credit memos only; leaves sent comms.
- **Live branch = `main`** (re-confirmed via coolify skill: app `og0rmt02rff8qti9nlfk3nr7`, push-to-main webhook).

## Blockers Requiring Human Action
1. **morning_abc_sync v3 is spec-complete but NOT a running job** — fleet is dormant (crons paused, no host scheduler) and AI cannot launch the autonomous agent on prod (classifier-blocked; first run is human-kicked). Tomorrow's automated 7am run won't happen without build+deploy of the host scheduler. (Cascade view + numbers are ready; task #9.)
2. **StormWatch** live deploy — paused (standing).
3. **Carried debt:** ABC full catalog sync owed on Hetzner; rotate Sentry build token; provision Jordan/Sam agent `.env`s.

## Verification Commands
1. `git status --short` → empty.
2. `git rev-parse --short main origin/main` (separately) → both `e73da79`.
3. `psql`/MCP: `SELECT benchmark_source, count(*) FROM v_invoice_audit_line_cascade GROUP BY 1;` → returns negotiated/api/recent/org_inv/none buckets.
4. Open+60d audit set = 17 invoices / 82 lines (5 action $1,165.46).

---

## Full Context

### What was built across recent sessions (running list — append, never delete)
- Invoice & order audit: UOM-normalized pricing (`price_per_uom`, migs 119–122, `docs/46`), resumable review hierarchy, Global Price List review.
- Agreement Builder / Estimate Audit UOM normalization + coverage explain.
- Command Center performance pass; Observability (Sentry); WorkOS agent auth; vendor territory map (live).
- Agent fleet: 7 profiles + schema, deploy, `validate-agent.py`, crons, Ops Conductor; Kasm/Slack onboarding automation.
- **Invoice "To Be Paid" two-phase payment loop** (migration 153, `v_invoice_payment_reconciliation`).
- StormWatch/ZoomInfo lead pipeline (committed, deploy-paused).
- **Headless agent runtime proven** (docs/56); **Alex SOPs** designed + validated (docs/57); Open Engine = DevTeam plane (docs/58, v1.0.1 AGENTS.md).
- **Benchmark cascade view** `v_invoice_audit_line_cascade` (migration 154) — foundation for morning_abc_sync v3 + Invoice Audit rebuild (docs/59).
- **Alex weekly Monday deliverable** designed (docs/57 §3c, `weekly_payment_package`, task #13): daily comms = per-invoice Slack messages; Monday = per-vendor QuickBooks invoices-to-be-paid CSV + NEW detailed decision CSV (per-line pricing/benchmark/variance/decision/logic from the cascade view + `dashboard_action_log`), both posted as Slack download URLs.

### Key invariants (never violate)
- Additive/idempotent migrations only; never destructive (hard rule 1).
- Compare prices in ABC pricing UOM via `price_per_uom` + `v_item_uom_map` — never raw `quantity`/`uom`/`pricePerUnitAmount`.
- `main` is the only branch that deploys; converge contrib branches, never strand work (hard rule 11). Local `main` drifts stale — `git fetch` + branch from `origin/main`.
- Zero external sends (v1): agents draft; humans send. Agent emails `@cc.proexteriorsus.net`.
- Schemas mirrored through **154**.

### Service / deployment map
| Service | Detail |
|---|---|
| Command Center (prod) | https://cc.proexteriorsus.net — Coolify builds `app/command-center/Dockerfile` from GitHub `main` (app uuid `og0rmt02rff8qti9nlfk3nr7`) |
| Supabase (shared dev+prod) | project `rnhmvcpsvtqjlffpsayu` — additive migrations live for both immediately |
| Agent host | Hetzner/Coolify (`docs/27`) — Kasm desktops; host scheduler for agent crons belongs here (not built) |
| Auth | WorkOS-gated dashboards; agents `Authorization: Bearer <service-token>` on `/api/*` (skill `workos-agent-auth`) |

**Prior context:** `context/memory/2026-06-28.md` (daily log); archived handoff `docs/handoffs/archive/2026-06-28-1034.md`.
