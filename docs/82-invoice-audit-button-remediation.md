# 82 — Invoice Audit dashboard: click-trace audit & remediation plan

**Date:** 2026-08-05 · **Status:** PLAN (nothing implemented; blocked on open questions §5)
**Trigger:** Chris's review of the deployed Phase 3 dashboard (docs/81) — zero SRS/QXO invoices, no CM approval path, Price List button empty for inheriting branches, CM link 404s.
**Diagram:** `outputs/invoice-audit-v2/button-audit-2026-08-05.{png,excalidraw}`
**Trace basis:** every clickable on `/accounting/invoice-audit` at HEAD `0d4d550`.

## 1. Direct answers to the four reported issues

1. **Zero SRS/QXO invoices** — the page reads only `abc_*` tables. The generic `vendor_invoices` tables (mig 192) are empty and no app code reads them. SRS supplied 31 invoice **PDFs** (no CSV/API) so ingestion requires the parse pipeline; QXO source files have not been supplied yet. This is Phase 5, not a regression.
2. **No way to approve a credit memo** — real gap. Phase 3 removed dispositions; the credit-memos page only offers *Mark sent / Mark received / Close* for `requested` CMs — there is no draft→approved action anywhere. Fix = the new per-invoice **Approve** button (§4).
3. **Price List button empty for 2-hour-window branches** — three stacked causes: (a) the enable-gate is hardcoded `true` server-side (`invoice-audit.ts:855`), so the button never greys; (b) the branch page and `v_branch_price_list` join agreements **only** via ship-to `abc_price_agreement_branch_matches`; (c) migration 195's office-inheritance views are consumed **nowhere** — including the audit engine's own `negotiated_price` lateral. Inheriting branches therefore read as 100% No-Price (this inflates the 1,054 No-Price KPI too).
4. **"View credit memo request →" → not found** — the link renders for any invoice with a discrepancy line, but the page requires a `credit_memo_requests` row with `request_kind='requested'`; only the 30 Wave-B invoices have one. Additionally, even for those, the page's line table reads the removed `credit-flag` decisions → renders empty.

## 2. Full clickable inventory & verdicts

| Element | Target | Verdict | Remedy |
|---|---|---|---|
| Search / office / date range / Show all / tolerance / To-audit / Due now | client filters | ✅ works | keep |
| Theme System/Light/Dark | localStorage | ✅ works | keep |
| **Process** | `POST /api/invoice-audit/process-stamp` | ⚠️ works (40 today) | hide on S/W variant (stamps globally); Phase 6 pipeline must produce new `audit_pending` rows |
| **Manage** → Mark Paid-Verified | `GET pending-verification` (sweep) / `POST verify-paid` | ⚠️ works (72 listed) | Phase 6 weekly file must keep feeding `exported`; drop dead `#manage-<batchId>` focus |
| KPI "Credit Memo Requested" | removed credit-flag decisions | ❌ always $0 | recompute from `credit_memo_requests` (draft+approved) |
| 📄 Invoice | `GET /api/invoice-audit/pdf/{n}` | ✅ works | keep |
| 📋 Price List | `/accounting/price-list/branch` | ❌ empty for inheriting branches; gate inert | real gate; office-inherited fallback (`v_office_vendor_price_item`) w/ "inherited from {office} · {agreement}" banner |
| View credit memo request → | `/accounting/credit-memos/{n}` | ❌ 404 unless Wave-B CM row | render only when CM exists; page reads `invoice_line_reaudit` |
| ↩ Go back | `POST /api/invoice-audit/reset` | ⚠️ stale semantics | new copy (no holds), guard `paid_pending_verification`/`paid_verified`, reset `invoice_pipeline_status` too |
| S/W variant (`?audit=service_warranty`) | same page | ❌ shows zero rows by default; action-less | mode-aware defaults; hide Process/Manage; define S/W v2 flow (question) |
| `#manage` deep link | opens Manage | ✅ | keep |
| 12 orphaned API routes | — | 💀 dead | delete + 2 test files (after agent write-path decision — `mark`/`run-disposition` are agent-allowlisted) |

Dead code flagged: `compactInvoiceAuditForInitialPayload` (0 callers), `triggerDownload`, `pendingManageBatch`.

## 3. Root-cause fixes (sequenced)

**R1 — Wire office inheritance into the audit engine (migration 201).** Replace the `negotiated_price` lateral (ship-to branch-matches only) with the office-inherited, invoice-date-effective, lowest-price-wins resolution — the same rules as the Wave B engine (`scripts/invoice-audit-v2/wave-b-reaudit.sql`) and docs/81 §4. This is the root cause behind the Price List button, the inflated No-Price count, and audit variances. Rollout gate: run old vs new side-by-side and report the KPI deltas before cutover.

**R2 — Credit-memo flow (the human approval loop).**
- New **Approve** button on the invoice bar (visible when a `draft` `credit_memo_requests` row exists): `draft → approved`, stamped `approved_by/at`. Un-approve allowed until the weekly email generates.
- Weekly packet builds **only from `approved`** requests (generator already exists).
- Weekly CM view page: renders the vendor HTML email in-app + download buttons (reconciliation/detail CSV + tracker).
- CM link + detail page fixed per §2; "Credit Memo Requested" KPI reads `credit_memo_requests`.

**R3 — Price List surface.** Office-inherited fallback in `branch-price-list.ts` + honest gate.

**R4 — Reset v2 semantics.** Copy + guards + `invoice_pipeline_status` sync.

**R5 — Cleanup. ✅ DONE 2026-08-05.** All six items shipped:
- **Routes deleted (12 + tests):** process-batch, register-batch, batches, batch/[batchId].csv, confirm-paid, return-batch, reconcile, release-credit-holds, mark, run-disposition, communications/preview, communications/action, plus their 2 API test files and the 2 orphaned lib unit tests. Orphaned libs removed with them: `invoice-payment-targets.ts`, `invoice-audit-communications.ts`, `invoice-audit-links.ts`, `invoice-audit-disposition.ts`. **Kept `invoice-payment.ts`** — it carries the docs/63 QB CSV header contract that Phase 6's Tuesday INV-PROCESSED producer will reuse.
- **Dead code removed:** `compactInvoiceAuditForInitialPayload`, `triggerDownload`, `pendingManageBatch` (legacy `#manage-<batchId>` links still open the Manage panel; the batch id is ignored).
- **v2 agent write path:** new `POST /api/invoice-audit/classify` — binary classification (`valid`/`discrepancy`, docs/81 decision 7), single-line or batch, appends to `invoice_line_audit` with `source='pipeline_v2'`, optional `paexpTag`, 400-validates classification values. Replaces the retired mark/run-disposition dispositions.
- **S/W surface retired (decision §5.4):** nav entry and the `?audit=service_warranty` variant removed (the param now just renders the normal audit); `loadServiceWarrantyAuditSummary` + its cache deleted. The queue table, transfer flow, and invoice-mode's *exclusion* of transferred invoices all remain.
- **"To Audit" KPI replaced** with **Claims To Review** — unreviewed claim lines across draft+approved CM invoices' latest re-audit runs, computed with the same math as `/api/credit-memos/pending`, so the card always agrees with the review-gate checkboxes.
- **Euless, TX archived (migration 204):** `office.is_active=false` + archive note (row, boundary, and candidate rings kept as history — hard rule 1); its 2 covered branches (both Wichita Falls, TX: abc-supply `wichita-falls-TX-76302-2723`, qxo `249`) repointed to Richardson; 42 branches' `suggested_office_id` re-suggested to their best *active* candidate (11 → Richardson, 31 → none — Euless was their only in-window office) with `is_suggested` flags synced; pricing matviews refreshed (post-refresh office mix: Wichita 530, Richardson 308, Denver 213, KC 21 — zero Euless). App-side, `vendor-territories.ts` now skips candidates whose office is archived, so archived drive-time rings never render.

**R6 — Producers (Phase 6).** Daily processing writes `invoice_pipeline_status`; Tuesday INV-PROCESSED file writes the payment ledger (`exported`), keeping Process/Manage alive. Phase 5 fills SRS/QXO.

## 4. New features (Chris 2026-08-05)

- **[Approve] on invoice bar** → adds the invoice's discrepancy lines to this week's credit memo email (see R2).
- **Credit-Memo pill repurposed** → opens the weekly HTML credit memo request email with a "download reconciliation spreadsheet" action. *Exact pill identity pending (question).* 

## 5. Decisions (Chris, 2026-08-05)

1. **CM pill = the KPI card.** Repurpose "Credit Memo Requested": value from `credit_memo_requests` (draft+approved), with a button opening the weekly HTML request email + reconciliation-spreadsheet/tracker downloads.
2. **Agent write-path = new v2 endpoint.** Delete all 12 orphaned routes (+ 2 test files); add one v2 endpoint for agents to record line classifications into `invoice_line_audit`.
3. **Engine cutover = now.** Migration 201 switches the live audit views to office-inherited, invoice-date-effective, lowest-price-wins pricing in one step, with a before/after KPI delta report delivered the same session.
4. **Service/Warranty surface = RETIRED.** Remove the nav entry and the `?audit=service_warranty` page variant; the `service_warranty_audit_queue` table and transfer flow remain (data untouched, hard rule 1).

**Still open:** QXO invoice source (CSV export? portal PDFs?) — required before QXO appears in the audit (Phase 5).
