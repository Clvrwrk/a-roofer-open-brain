# 59 — Invoice Audit UI/UX Rebuild + Alex SOP Presentation Plan

**Date:** 2026-06-28
**Owner:** Chris (Cleverwork)
**Surface:** Command Center → `/accounting/invoice-audit` ("Index/Invoice Audit") on **https://cc.proexteriorsus.net**
**Related:** [`docs/57`](57-alex-rivers-sops.md) (Alex SOPs — morning_abc_sync v3 cascade), [`docs/46`](46-uom-pricing-normalization.md) (UOM), [`docs/27`](27-hetzner-coolify-agent-host.md) (Coolify deploy).
**Status:** PLAN **APPROVED 2026-06-28**. Execution begins at Gate 0. (Clarifications D2/D7 folded in.)

> This is a **live-site build**. It is governed by the Live⇄Dev deploy contract (CLAUDE.md rule 11)
> and the hard rules (no destructive SQL; additive/idempotent migrations; WorkOS auth on API routes;
> trust-tier discipline). Every task below carries a **validation gate**; three tasks carry an explicit
> **red-team pass** (minimum two required). Nothing executes until Gate 0 passes and Chris approves.

---

## 1. Goal

Make the Invoice Audit surface present SOP work as performed by the named agents (Alex / Maya), give
Lucinda a bounded date search over the actionable invoice set, surface the full price-benchmark
cascade visually, and let a human cleanly reverse decisions on an invoice.

## 2. Decisions captured (2026-06-28)

| # | Decision | Choice |
|---|---|---|
| D1 | Agent attribution | **By actual actor + role split.** Variance/audit/holds → **Alex**; intake/surfacing → **Maya**; a human (Lucinda) shows as the human. Agent vs human visually distinguished (badge). |
| D2 | Date filter | **Default-bound + "Show all" check.** Defaults to OPEN + ≥60-day (on `invoice_date`); `date1↔date2` narrows within that default. A **"Show all" checkbox** escapes the bound (all invoices incl. paid / recent / credit memos). Replaces the old Open/Paid/All selector. Office + tolerance filters stay. |
| D3 | "Go back" scope | **Per-invoice.** Resets all line dispositions on one invoice to neutral. |
| D4 | "Go back" depth | **Status + reverse internal effects.** Reset to neutral (new append-only record), reverse `not-to-be-paid` holds, cancel **draft** credit-memo candidates. Does **not** recall already-sent external comms. |
| D5 | Most-recent-invoice price | Column between **API Price** and **Negotiated**; value = newest **prior** invoice for **same item + same branch** (= morning_abc_sync Check 3). |
| D6 | Display variance cascade | negotiated present → vs negotiated; negotiated blank → vs **API**; invoice price < API → vs **most-recent**. Badge shows which benchmark drove Var%/$. Mirrors the audit engine cascade. |
| D7 | Credit-memo column | **Credit-memo invoices only:** the third price column becomes **"Org Inv Price"** = the same item's price on the **original invoice** referenced by the credit memo (`abc_invoices.original_invoice_reference`), *replacing* "Most Recent Invoice Price". The variance cascade for a credit-memo line compares against **Org Inv Price** (did the credit correctly reverse the original charge?). Non-credit-memo invoices are unaffected. |

## 3. Scope

**In scope:** (A) cascade benchmark data layer; (B) open+60-day scope filter; (C) most-recent column +
cascade display; (D) date1↔date2 filter replacing status selector; (E) Alex/Maya attribution; (F)
per-invoice "go back" reset with internal-effect reversal.

**Out of scope — deferred TODO (tracked, NOT built here):**
- **Bug A:** closing a nest while a line is selected leaves the disposition window open. Closing a nest must behave like deselecting all lines (close the disposition window).
- **Bug B:** marking a single line "passed" collapses the whole nest. "Passed" must affect only that line and leave the nest open; nest open/close only via mouse click.
- These are site-wide interaction bugs; fix in a dedicated follow-up after this build lands.

## 4. Affected code (from discovery)

| Concern | Path |
|---|---|
| Page | `app/command-center/src/pages/accounting/invoice-audit.astro` |
| Client tree/UI | `app/command-center/src/scripts/invoice-audit-tree.ts` |
| Data loaders | `app/command-center/src/lib/invoice-audit.ts` |
| Detail API | `app/command-center/src/pages/api/invoice-audit/invoice.ts` |
| Mark/audit API | `app/command-center/src/pages/api/invoice-audit/mark.ts` |
| Batch/payment APIs | `app/command-center/src/pages/api/invoice-audit/{process-batch,return-batch,confirm-paid,reconcile}.ts` |
| Variance views | `schemas/cleverwork-roofer/99-invoice-audit-views.sql` (`v_invoice_audit_line`) |
| Line audit table | `schemas/cleverwork-roofer/100-invoice-line-audit.sql` (`invoice_line_audit`, `v_invoice_line_audit_current`) |
| Benchmarks | `v_branch_item_api_price` (API), `abc_invoice_lines` (prior), `abc_ship_to_branch_access` (ship_to→branch) |

---

## 5. Plan — phased, gated

### Gate 0 — Prerequisites & deploy contract (BLOCKING)
- **0.1** Clean the working tree: commit/handle the currently-uncommitted `docs/57`, the `pe-cc-*` SKILL.md
  version bumps, and untracked `agents/dev-engine/AGENTS.md`. Tree must be empty before app work (rule 11).
- **0.2** Confirm the branch Coolify actually builds for `cc.proexteriorsus.net` (use the `coolify` skill —
  do **not** assume `main`). Record it in the daily log.
- **0.3** Branch `contrib/cleverwork/invoice-audit-sop-presentation` **from the confirmed live branch**.
- **0.4** Confirm local dev server runs against prod DB and the audit page renders pre-change (baseline screenshot).
- **Gate:** clean tree ✓; live branch confirmed & recorded ✓; baseline renders ✓.

### Task 1 — Cascade benchmark data layer  ⟵ shared with morning_abc_sync (docs/57 task #9)
- Build the benchmark cascade in SQL (additive `CREATE OR REPLACE VIEW`, no drops): extend `v_invoice_audit_line`
  (or add a sibling view) exposing, per line: `negotiated_price`, `api_price` (via `v_branch_item_api_price`,
  branch from `abc_ship_to_branch_access`, UOM-aligned), `recent_invoice_price` (newest prior invoice, same
  item + same branch, `price_per_uom`), the **cascaded** `variance_pct`/`variance_ext`, and `benchmark_source`
  ∈ {negotiated, api, recent, **org_inv**, none}.
- **Credit memos (D7):** for lines on a credit-memo invoice, also compute `org_inv_price` = the same item's price
  on the original invoice (`abc_invoices.original_invoice_reference` → that invoice's `abc_invoice_lines.price_per_uom`)
  and use it as the cascade benchmark **in place of** `recent_invoice_price`.
- **Validation gate:** read-only parity — numbers reconcile with docs/57 figures (e.g. open+60d = 17 inv/82 lines);
  zero division-by-zero; UOM alignment verified on a sample; no NULL-benchmark line silently treated as 0%.
- **🔴 Red-team pass RT-1 (data correctness):** adversarially probe — UOM mismatch handling; branch resolution when
  ship_to maps to multiple/zero branches (prefer `home_branch`); API price staleness (latest `observed_at`);
  performance on 38k `v_branch_item_api_price` rows; negative/zero prices; time-versioned agreement edge cases;
  confirm undercharges never net against overcharges. Fix all HIGH findings before proceeding.

### Task 2 — Open + 60-day scope filter (data layer)
- Apply the scope (`date_paid IS NULL` AND `invoice_date ≤ today−60d` AND `NOT is_credit_memo`) in
  `invoice-audit.ts` loaders + the invoice API. Single source of truth for "the actionable set." Credit memos are
  excluded from this default set but become visible via **"Show all"** (Task 4) and render with the Org Inv Price column (D7).
- **Validation gate:** filtered set matches the SQL scope count; paid/recent invoices are unreachable via this path;
  KPI cards recompute correctly.

### Task 3 — Most-recent / Org-Inv column + cascade display (UI)
- Insert a **contextual** third price column between API Price and Negotiated in `invoice-audit-tree.ts`:
  header/value = **"Most Recent Invoice Price"** for normal invoices, **"Org Inv Price"** for credit-memo invoices (D7).
- Render Var%/$ from the cascaded values + a small **benchmark-source badge** (Negotiated / API / Recent / Org Inv).
- **Validation gate (preview tools):** build clean; column order exact (Inv · API · **Most Recent/Org Inv** · Negotiated · Var% · Var$);
  credit-memo rows show Org Inv Price (from the referenced original invoice) and cascade against it; normal rows show Most Recent;
  cascade picks the right benchmark on hand-checked sample lines; no console errors; screenshot proof.

### Task 4 — Date filter (+ "Show all") replaces status selector (UI)
- Replace `#iv-status` (Open/Paid/All) with a `date1↔date2` control, default-bound to open+60d; default range =
  [oldest open+60d invoice_date → today−60d]. Add a **"Show all" checkbox** that escapes the bound (all invoices incl.
  paid / recent / credit memos). Keep office + tolerance filters.
- **Validation gate (preview):** default cannot select outside open+60d; "Show all" reveals paid/recent/credit-memo invoices;
  default range correct; interacts correctly with office/tolerance/to-audit filters; screenshot proof of both states.

### Task 5 — Alex/Maya attribution (UI + mapping)  ✅ DONE 2026-06-28
- **Done:** pure `attributeAuditActor(approved_by, source)` mapper in `invoice-audit.ts` (auto_match→Alex agent;
  named person→human; "Maya Chen" stays human, not the Maya agent; System backfill→system) + per-line
  `actorLabel/actorKind/actorPersona`; agent/human/system badge in `invoice-audit-tree.ts`. 6 unit tests; verified
  live (API JSON across all 3 actor types) + rendered DOM ("✓ Alex" + Agent badge); screenshot proof.
- Map action→persona: variance/audit/holds/credit-memo → **Alex**; intake/surfacing → **Maya**; human actor → human.
  Drive from `dashboard_action_log.actor_type` + `action_type`/`source`. Add an **agent-vs-human badge**.
- **Validation gate:** agent actions render the correct persona + badge; human (Lucinda/backfill) actions render as human;
  no action mis-attributed; client-facing copy reviewed; screenshot proof.

### Task 6 — Per-invoice "Go back" reset (UI + API)  ✅ DONE 2026-06-28 (RT-2 passed)
- **Done:** atomic `invoice_audit_reset()` RPC (migration 158) — APPENDS `pending` audit rows for every
  non-pending line, cancels only `draft` credit memos (new `cancelled` status), logs one
  `dashboard_action_log` entry, refuses paid/exported/credit-memo invoices. WorkOS-gated route
  `api/invoice-audit/reset.ts`; "↩ Go back" button in the invoice header (hidden on paid/CM).
- **RT-2 verified (live prod, zero permanent mutation):** guards return `not_found` / `credit_memo_not_resettable`
  / `invoice_paid` with no writes; success path re-pends 10 lines + cancels 1 draft CM; **idempotent** (2nd call →
  0 lines, 0 CMs, no 2nd log); **atomic** (whole op rolled back cleanly under BEGIN/ROLLBACK — prod restored to
  10 passed / draft CM / 0 logs); **append-only, no delete path**; button absent on all 803 paid + 230 CM invoices;
  UI handler round-trip (request body, toast, button removal) verified. astro build clean; 19 unit tests pass.
- New API route `api/invoice-audit/reset` (WorkOS-gated): for one invoice, **append** neutral/`pending` audit records
  for all its lines (never delete — hard rule 1), reverse `not-to-be-paid` holds, cancel **draft** credit-memo
  candidates; write a `dashboard_action_log` entry. Does **not** touch sent comms. Add the button to the invoice header.
- **Validation gate:** history retained (append-only verified); holds reversed; only *draft* credit memos cancelled;
  sent comms untouched; cannot reset a paid invoice; screenshot + DB-state proof.
- **🔴 Red-team pass RT-2 (reset safety):** transaction atomicity / partial-failure rollback; idempotency (double-click);
  authz (who may reset; not on paid/exported invoices); race with in-flight communication or payment export;
  audit-trail completeness; confirm no destructive delete path. Fix all HIGH findings.

### Gate 7 — Integration red-team + deploy
- **🔴 Red-team pass RT-3 (integration/security):** WorkOS auth on every new/changed API route; regression of the
  existing audit→disposition→batch→pay flow; trust-tier/consent boundaries intact; no PII leakage in new columns/badges;
  Live⇄Dev convergence (no stranded work).
- **Deploy:** merge `contrib/...` → confirmed live branch → push `origin` → Coolify build → verify on
  `cc.proexteriorsus.net` (not just localhost). Record deploy in daily log.
- **Gate:** RT-3 clean; deployed build verified live; daily log updated.

---

## 6. Sequencing & dependencies
- Task 1 is the foundation (feeds Tasks 3 + the morning_abc_sync v3 build). Task 2 can run parallel to 1.
- Tasks 3–6 depend on 1–2. Tasks 3/4/5 are UI-parallel; Task 6 is independent UI+API.
- RT-1 gates Task 1; RT-2 gates Task 6; RT-3 gates deploy. **Minimum two red-team passes satisfied (three planned).**

## 7. Rollback
- DB: views are `CREATE OR REPLACE` — revert by re-applying the prior view definition (kept in the migration).
  No table drops; `invoice_line_audit` stays append-only so resets are themselves reversible (append again).
- App: revert the contrib merge on the live branch; Coolify redeploys the prior commit.

## 8. Open assumptions (flag if wrong)
- "Index Audit" == the `/accounting/invoice-audit` surface (no separate "index" page found).
- Persona role split: Alex = pricing/variance lane; Maya = intake/surfacing lane (per docs/57 + daily log).
- "Neutral" maps to the existing `pending` audit status (no new status enum needed).
