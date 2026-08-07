# Project Handoff — Pro Exteriors Open Brain / Command Center
**Project:** a-roofers-open-brain (Command Center app + brain schemas)
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain
**Production URL:** https://cc.proexteriorsus.net (Coolify, deploys from `main`; verify via `/healthz` `buildCommit`)
**Date:** 2026-08-07 00:05 (CT 02:05)
**Agent:** Lead Orchestrator (Claude Code, Fable 5)
**Reason:** User-requested wrapup + full Linear documentation

> Prior handoff (Friday WIP/AR + PE-US-AGENTS cutover, 2026-08-06 09:15) archived under `docs/handoffs/archive/`.
> Linear this session: PEC-180/181/182 (payment memos) + session report + learnings log (see Linear section of the wrap report).

---

## Accomplished This Session (2026-08-06 07:00 → 08-07 00:05)

### 1 · Friday WIP/AR horizontal scroll (deployed `0ada49f`)
- `app/command-center/src/pages/accounting/friday-wip.astro`: `min-width:0` on `.fw-group` — round 3's `overflow-x:clip` + grid `min-width:auto` had clipped tables with no scrollbar.

### 2 · Price-agreement OFFICE silo (migs 217, 222; deployed)
- `schemas/cleverwork-roofer/217-office-silo-legacy-shipto-arm.sql`: legacy ship-to arm office-constrained in all 4 audit views. Pre-fix: 188 cross-office lines, 94 flagged, $3,212.04 erroneous claims on 46 approved (unsent) CMs — all retracted via `credit_memo_claims_sync_all()` (24 CMs auto-cancelled; open CMs 71→47, $5,132.46→$1,920.42 exact).
- 43 human `accept-neg` lines vs wrong-office prices reset to pending (Chris-directed one-time; 41 now No-Price, 2 in tolerance, 0 new claims). Weekly CM email rebuilt: 47 inv / 98 lines / $1,920.42, all same-office (verified 0/98 cross).
- Mig 222: generic-arm office join → strict equality (unknown office ⇒ No-Price).

### 3 · QBO re-auth + sync restored (PEC-175 closed)
- Re-auth via Intuit OAuth **Playground** (app PE-CC-Dashboard; its registered redirect IS the playground). **Canonical creds: 1P `QBO - PROD TOKENS` (CW_Master)**, fields `QUICKBOOKS_PROD_{CLIENT_ID,CLIENT_SECRET,REFRESH_TOKEN,REALM_ID}`. First save was old values re-consolidated (caught by fingerprint compare — `op read | shasum`, never values); second save succeeded.
- Sync ran clean; `refresh_wip_ar_master()` run manually: costs_incurred_asof Jul 27 → Aug 6, $1.19M costs over 101/115 jobs, Billed AR $777,021.55 tie intact.
- `integrations/bridges/quickbooks/mirror-backfill.mjs`: rotated refresh tokens now persisted to master.env (atomic tmp+rename, 0600) AND process.env (mid-run rotation bug) — root cause of both token deaths. Smoke-tested on host.

### 4 · Coolify API restored
- New Root API token → 1P **CW_Master → `coolify.proexteriorsus.net - Root API`**; root `.env` commented line refreshed in place. **App uuid changed with the 8/4 rebuild: `lu5txzhyoza7uuz0scwpobv7`** (old `og0rmt02…` dead) — patched coolify skill, `scripts/coolify-redeploy.sh`, docs/27.

### 5 · Vendor payment memos → paid-verified (docs/86, mig 218, PEC-180/181/182; deployed `d3e201a`)
- Raw vendor-agnostic pair `vendor_payment_memos`/`_lines` keyed (vendor_slug, invoice_number) → `vendor_payment_memo_apply()` drives `invoice_payment_processed`. `POST /api/accounting/payment-memos/process` (accounting + approval.decide) refuses memos whose line sums don't tie the printed totals.
- Backfilled May/June/July ABC memos (scans; vision-transcribed 164 lines, tied to the penny + 164/164 in mirror): **133 invoices paid_verified** (incl. 2009332466-001 flipped from `returned_reason='testing'`), 31 credit docs recorded. Paid-pending-verification 75→20. Idempotency + totals-guard proven live.
- ⚠️ July scan p4 shows the **Amex CVV in the clear** — Chris to redact Dropbox copy (noted PEC-182).

### 6 · CM receipt reconciliation (mig 220; deployed `bc173f6`)
- `credit_memo_receipts` + `credit_memo_reconcile()` on the 15-min cron: arriving CM docs (≥2026-08-01) exact-match open requests → request `received`/satisfied + `external_credit_memo_number`; mismatch/ambiguous/no-request → pending receipt on `/accounting/credit-memos/weekly` with **Approve / Re-request** buttons (`/api/credit-memos/receipt-review`). Queue starts empty (no credits arrived yet).

### 7 · SRS/QXO lit up in Invoice Audit (migs 221/221b; deployed `bc173f6`)
- Audit views UNION `vendor_invoices`; generic pricing arm vendor- AND office-siloed; `invoice_line_audit.vendor_slug` collision guard; `v_invoice_audit_invoice_vendor` map. Live: SRS 30 inv/242 lines → 12 flagged, **$2,879.55 at risk** vs SRS L4 agreements (177 No-Price); QXO 3 inv No-Price (= valid, no agreements). Open Invoices 270→303.

### 8 · End-to-end vendor-silo eval (docs/87, mig 223; deployed `0b39bc2`) — Chris mandate "zero errors, this is money"
- Two exhaustive sweeps (59 links/routes + all write paths). **Critical: mig-222's vendor fix had landed in dead code** — live loaders never stamped `Invoice.vendor`; fixed in `loadFreshInvoiceAuditSummary` + `loadInvoiceAuditInvoiceDetail` and verified through the live page payload (30×"srs", 3×"qxo").
- Mig 223: `credit_memo_requests` + `invoice_payment_processed` re-keyed `(vendor_slug, invoice_number[, request_kind])`; `invoice_line_reaudit.vendor_slug`; claims-sync vendor-scoped per-CM (223b); payment-memo apply vendor-scoped.
- App: classify/review-line/add-line stamp `vendor_slug` (+ line↔invoice ownership check); AR-paid gated to ABC; 📋 gate per (vendor,office) via `v_office_vendor_agreements`; PDF ABC-fallback gated; mark-paid refuses non-ABC; order-audit link explicit vendor; detail fetch collision-safe.
- **`silo_assertions()`** + nightly pg_cron (09:30 UTC → `dashboard_action_log`, workflow `silo-assertions`). First run caught 12 mislabeled (cancelled/$0) SRS CM requests — corrected with packet provenance. **Current: 0 violations.**

## Git State
- **Branch:** `main` == `origin/main`
- **Last commit:** `0b39bc2` — "fix(invoice-audit): end-to-end vendor-silo eval …" (this handoff commits after)
- **Uncommitted changes:** only this handoff + wrap docs (committed as part of wrapup)
- Migrations applied to prod this session: **217, 218 (payment memos), 220, 221/221b, 222, 223/223b** (+ parallel session's 218-maya/219 — note: two files named `218-*`, cosmetic)
- Deploys: `0ada49f`, `31a2f9d`(=217 docs), `d3e201a`, `bc173f6`, `9ddabf9`, `0b39bc2` — all verified via `/healthz`.

## Task Cut Off
None — session ended at a clean boundary (silo eval wave deployed and verified).

## Next Task — Start Here

**Task:** docs/87 deferred silo hardening (before SRS goes deeper into the CM flow)
**What to check / do:**
1. `invoice_audit_reset` vendor scoping (today fails-closed/404 for non-ABC — safe but blocks SRS resets).
2. `add-line` office/agreement context generic arm (SRS CM claims currently get null office/agreement metadata).
3. Delete dead code carrying old defaults: `lib/invoice-payment.ts` orphans, `loadInvoiceAudit`/`loadFreshInvoiceAudit`, `loadDecisionDetailCsv`.
4. Add a real typechecker to `check` (`astro check`/tsc) — the dead-code miss would have been a compile error.
5. Normalize `invoice_pipeline_status.vendor_slug` `'abc'` → `'abc-supply'`; label Agreement Builder ABC-only.

**If a silo violation alert appears** (dashboard_action_log workflow `silo-assertions`): treat as a stop-the-line bug; run `select * from silo_assertions();` and trace before any CM/payment action.

**Prompt to use:** "Read docs/handoffs/current.md and docs/87-vendor-silo-eval.md §Deferred. Implement the deferred silo hardening items 1–5, verifying each through the live call path."

## Decisions Made This Session

- **Office silo outranks no-regression** (Chris): agreements are office-specific due to regional pricing; unknown office ⇒ No-Price. Mirrors the vendor silo one level down.
- **Payment memos flow through raw vendor-agnostic tables first** (Chris); `(vendor_slug, invoice_number)` populates the working table — never parse→working directly.
- **Memo endpoint refuses untied totals** — transcription errors cannot reach the books.
- **CM satisfied = exact amount match, exactly one candidate**; everything else needs a human (Approve / Re-request).
- **One-time human-approval cleanups get explicit ledger provenance** (43-line reset; returned-row flip; 12 CM vendor corrections) — the normal gates stay for new work.
- **1P consolidation:** `QBO - PROD TOKENS` and `coolify.proexteriorsus.net - Root API` are canonical; per-var QBO items are legacy.

## Blockers Requiring Human Action

1. **Redact the Amex CVV** from `08042026_ABC Supply.pdf` p4 in Dropbox; crop payment-method pages from future memo scans.
2. None else — QBO restored, Coolify restored.

## Verification Commands
1. `curl -s https://cc.proexteriorsus.net/healthz` — `buildCommit` starts `0b39bc2`.
2. SQL: `select count(*) from silo_assertions();` — **0**.
3. SQL: `select status, count(*), round(sum(expected_credit),2) from credit_memo_requests where request_kind='requested' and status in ('draft','approved') group by 1;` — approved 47 / $1,920.42.
4. SQL: `select max(costs_incurred_asof) from wip_ar_master;` — ≥ 2026-08-06 (nightly QBO keeps it current).
5. `cd app/command-center && npm run build && npx vitest run` — Complete!, 293/293.
6. `curl -s "http://localhost:4399/accounting/invoice-audit" | grep -c '"vendor":"srs"'` (dev) — 30.

## Full Context

### What was built across ALL sessions (running list — never delete)
- OB1 memory spine; property-first schemas; UOM pricing contract (docs/46, migs 119–122); ABC invoice/order/estimate audit surfaces; territory map + WorkOS gating + agent service tokens; AccuLynx→JobTread gated write queue; QuickBooks read-only mirror (docs/74); Slack agent identities; AgentMail; Maya accounting inbox + CAT-first runtime (parallel session 8/6); Invoice Audit v2 (docs/81, migs 197–203); docs/82 remediation R1–R6; docs/83 Price Agreement Management; docs/84 GUI audit; Friday WIP/AR live board (docs/85, migs 215–216) + nightly Excel pack + Maya email + CPA accrual inputs; PE-US-AGENTS host (178.156.203.23), QBO nightly sync w/ token-rotation persistence; **office silo (migs 217/222) + $3,212.04 claim retraction; vendor payment memos (docs/86, mig 218) w/ 133 invoices paid-verified; CM receipt reconciliation (mig 220); SRS/QXO in Invoice Audit (migs 221) — SRS $2,879.55 at risk; vendor-silo re-key of money tables (mig 223) + nightly silo_assertions() guard (docs/87).**

### Architecture decisions
- Pricing: office-inherited, invoice-date-effective, evergreen (PAEXP), lowest-price-wins **within the (vendor, office) silo**; ship-to matches survive only office-constrained.
- Every money table keys `(vendor_slug, invoice_number)` — invoice numbers are NOT globally unique. Vendor slug vocabulary = `vendors.slug` (`abc-supply`, `srs`, `qxo`); `invoice_pipeline_status` still carries legacy `'abc'` (deferred normalization).
- `v_invoice_audit_invoice_vendor` is the one vendor-lookup seam for UI/API; `lib/branch-price-list.ts` and `price-agreements/propose` are the reference silo implementations.
- 15-min cron: matview refresh → `credit_memo_claims_sync_all()` → `credit_memo_reconcile()`. Nightly 09:30 UTC: `silo_assertions()` → action log.

### Key invariants (never violate)
- Additive/idempotent migrations only; archive, never delete.
- **A price agreement is specific to (vendor, PE office). No pricing join may cross either boundary; unknown office ⇒ No-Price; fail closed.**
- Compare prices only in the pricing UOM via `price_per_uom` (docs/46).
- Sent/received CMs are history; only draft/approved change.
- `main` is the only deploy branch; verify `/healthz` after every push. **A fix isn't fixed until verified through the LIVE call path.**
- QBO read-only forever; agents never email external domains.
- Never send Σ N to a lender — billed AR (Σ Q) is the receivable.

### Service / deployment map
| Service | Detail |
|---------|--------|
| Prod app | https://cc.proexteriorsus.net — Coolify app uuid **`lu5txzhyoza7uuz0scwpobv7`** (post-8/4-rebuild), builds `app/command-center/Dockerfile` from `main` |
| Prod DB | Supabase `rnhmvcpsvtqjlffpsayu` |
| Deploy check | `GET /healthz` → `buildCommit` (~30–90s, ~300s cold) |
| Agent host | PE-US-AGENTS `178.156.203.23` (root, `~/.ssh/hetzner_office`); repo `/opt/openbrain/a-roofers-open-brain`; timers: abc 07:30 UTC · qbo nightly 01:00 UTC · wip-pack 11:00 UTC · jt-sentinel 17:00 UTC |
| Secrets | 1P CW_Master via `op`: **`QBO - PROD TOKENS`**, **`coolify.proexteriorsus.net - Root API`**; provisioning: `op inject` → 600-perm scratch → `scp` → delete |
| Linear | team PE-CC-DevTeam; this session: PEC-180/181/182 + session report + learnings issues |
| Dev server | `.claude/launch.json` — port **4399** (4321 taken by Cursor) |
