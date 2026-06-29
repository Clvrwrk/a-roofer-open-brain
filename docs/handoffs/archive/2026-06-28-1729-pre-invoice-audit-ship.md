# Project Handoff — A Roofer's Open Brain (Command Center)

**Project:** a-roofers-open-brain
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain (`origin`)
**Production URL:** https://cc.proexteriorsus.net (Coolify ← GitHub `main`; shared prod Supabase `rnhmvcpsvtqjlffpsayu`)
**Date:** 2026-06-28 11:36
**Agent:** Lead Orchestrator
**Reason:** End of session (/project-handoff)

> ⚠️ **StormWatch Pause (still active)** — property-layer pipeline deploy paused pending Reonomy/ZoomInfo terms + E2E validation. Artifacts committed ≠ deployed.
> ⚠️ **Concurrent-tree anomaly** — a DevTeam/SEO session left ~44 uncommitted files in the working tree (~10:52 burst). Per Chris: **commit only invoice-audit paths**; do not sweep, revert, or deploy them. They are still uncommitted.

---

## TL;DR — where we left off

- **Built docs/59 Tasks 2, 3, 4** + a prod cascade bug fix — all preview-verified against the live prod DB, `astro build` clean, 8 unit tests passing. Committed on `contrib/cleverwork/invoice-audit-sop-presentation` (4 commits ahead of `main`).
- **Task 2** actionable scope (open + ≥60d + non-CM) = single source of truth; **Task 3** cascade 3rd-price column + benchmark badge (Most Recent / Org Inv Price); **Task 4** date1↔date2 + "Show all" replacing the status selector.
- **Migration 157** (applied to prod) fixed a Task-1 cascade bug: view 154 sourced `abc_invoice_lines` (no credit-memo lines live there) → returned **zero rows for every credit memo**, so D7 Org Inv never fired. Now covers 930 CM rows.
- **`main`/`origin/main` = `02bd71f`** — contrib deliberately NOT merged (deploy is Gate 7). Schemas mirrored through **157**.
- **Next: Task 5** (Alex/Maya attribution), then Task 6 (reset + RT-2), then Gate 7 (RT-3 + deploy).

---

## Accomplished This Session

### Task 2 — actionable scope in the data layer (`d7bb284`)
- `app/command-center/src/lib/invoice-audit.ts`: `SCOPE_MIN_AGE_DAYS=60`, `scopeCutoffDate`, `isInvoiceActionable` (open && ≥60d && !creditMemo), `buildScopeAndTotals`. Per-invoice `actionable` flag + `InvoiceAuditData.scope` (cutoff + default date range) wired through all 3 builders (full, summary, detail).
- Audit-finding KPIs (at-risk, credit-memo requested, no-price, flagged, audited, pending) rescoped to the actionable set; payment KPIs (to-be-paid, awaiting) + open/paid/CM counts kept open-set.
- `…/lib/invoice-audit.unit.test.ts`: aged two fixtures to ≥60d + added a boundary test (age/CM/paid gates, scope metadata). **8 tests pass. Prod anchor = 17 actionable invoices.**

### Task 3 — cascade 3rd-price column + badge (`6f99fb1`)
- `…/scripts/invoice-audit-tree.ts`: contextual 3rd price column between API and Negotiated — "Most Recent" / **"Org Inv Price"** for credit memos (D5/D7); Var%/$ + Tolerance + benchmark-source badge from the cascade (D6).
- `…/lib/invoice-audit.ts`: detail loader joins `v_invoice_audit_line_cascade` per line; revived the never-populated `apiPrice` from the cascade's UOM-aligned `api_price`.
- **`schemas/cleverwork-roofer/157-invoice-audit-cascade-creditmemo-fix.sql`** (applied to prod): repoint cascade main CTE `abc_invoice_lines` → `v_invoice_lines_complete` so CM lines (which don't live in abc_invoice_lines) join. 930 CM rows now covered, 109 org_inv resolved.
- Verified live: normal `2008871791-001` → `+19.0% Recent` ($555.79 vs $467); CM `2005666536-001` → `Org Inv` 0% variance (correct reversal). Column order exact, no console errors.

### Task 4 — date filter + "Show all" (`9882e5e`)
- `…/accounting/invoice-audit.astro`: replaced `#iv-status` with `#iv-date1`/`#iv-date2` (default [oldest actionable→cutoff], ≤cutoff cap) + `#iv-showall`. + date-range CSS. KPI scope copy updated.
- `…/scripts/invoice-audit-tree.ts`: invoice nodes carry `data-date`/`data-actionable`/`data-cm`; filter computes scope (actionable | all) × date range; rollups track active scope; Show-all lifts the date cap.
- Verified live: default 17/975; Show all reveals paid+CM; date narrowing works; restore returns to 17.

### Checkpoint docs (`4fc68bf`)
- `context/memory/2026-06-28.md` session block + this handoff.

### Commits this session (all on `contrib/cleverwork/invoice-audit-sop-presentation`)
- `d7bb284` Task 2 · `6f99fb1` Task 3 (+ mig 157) · `9882e5e` Task 4 · `4fc68bf` handoff. `main` untouched at `02bd71f`.

## Git State
- **Branch:** `contrib/cleverwork/invoice-audit-sop-presentation` (= `9882e5e`, 3 commits ahead of main + migration 157 applied to prod)
- **Last commit:** `9882e5e` — "feat(audit): date1↔date2 filter + Show all (docs/59 Task 4)"
- **`main`/`origin/main` = `02bd71f`** — contrib NOT merged yet (deploy is Gate 7).
- **Uncommitted:** ~44 concurrent DevTeam/SEO files (not invoice-audit; left in place per Chris) + `env.d.ts` (astro build artifact). Schemas mirrored through **157**.

## Task Cut Off
None — clean boundary. Tasks 2–4 each committed atomically on `contrib`; migration 157 applied to prod. Stopped before Task 5 (Alex/Maya attribution). Contrib intentionally unmerged (deploy = Gate 7).

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
1. `git log --oneline 02bd71f..HEAD` (on contrib) → `d7bb284`, `6f99fb1`, `9882e5e`, `4fc68bf`.
2. `git status --short` → only the concurrent DevTeam WIP + `env.d.ts` (no invoice-audit/handoff files).
3. `npx vitest run src/lib/invoice-audit.unit.test.ts` (in app/command-center) → 8 passed.
4. `SELECT count(*) FROM v_invoice_audit_line_cascade WHERE is_credit_memo;` → 930 (CM coverage live, mig 157).
5. Dev server (`command-center`, port 4321, AUTH_MODE=disabled): `/accounting/invoice-audit` default shows 17 actionable of 975; "Show all" reveals paid+CM.

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
- **Benchmark cascade view** `v_invoice_audit_line_cascade` (migration 154, CM-coverage fixed in **157**) — foundation for morning_abc_sync v3 + Invoice Audit rebuild (docs/59).
- **Invoice Audit rebuild (docs/59) Tasks 2–4 SHIPPED to `contrib`** (not deployed): actionable open+60d scope + KPI rescope; cascade 3rd-price column (Most Recent / Org Inv Price) + benchmark badge; date1↔date2 + "Show all" filter.
- **Alex weekly Monday deliverable** designed (docs/57 §3c, `weekly_payment_package`, task #13): daily comms = per-invoice Slack messages; Monday = per-vendor QuickBooks invoices-to-be-paid CSV + NEW detailed decision CSV (per-line pricing/benchmark/variance/decision/logic from the cascade view + `dashboard_action_log`), both posted as Slack download URLs.

### Key invariants (never violate)
- Additive/idempotent migrations only; never destructive (hard rule 1).
- Compare prices in ABC pricing UOM via `price_per_uom` + `v_item_uom_map` — never raw `quantity`/`uom`/`pricePerUnitAmount`.
- `main` is the only branch that deploys; converge contrib branches, never strand work (hard rule 11). Local `main` drifts stale — `git fetch` + branch from `origin/main`.
- Zero external sends (v1): agents draft; humans send. Agent emails `@cc.proexteriorsus.net`.
- Schemas mirrored through **157**.

### Service / deployment map
| Service | Detail |
|---|---|
| Command Center (prod) | https://cc.proexteriorsus.net — Coolify builds `app/command-center/Dockerfile` from GitHub `main` (app uuid `og0rmt02rff8qti9nlfk3nr7`) |
| Supabase (shared dev+prod) | project `rnhmvcpsvtqjlffpsayu` — additive migrations live for both immediately |
| Agent host | Hetzner/Coolify (`docs/27`) — Kasm desktops; host scheduler for agent crons belongs here (not built) |
| Auth | WorkOS-gated dashboards; agents `Authorization: Bearer <service-token>` on `/api/*` (skill `workos-agent-auth`) |

**Prior context:** `context/memory/2026-06-28.md` (daily log); archived handoffs `docs/handoffs/archive/2026-06-28-1136.md` (this session's predecessor) and `…-1034.md`.
