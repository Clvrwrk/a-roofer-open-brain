# 84 — Full GUI surface audit: every pill, table, link vs live data

**Date:** 2026-08-05 · **Trigger:** Chris — "audit every GUI surface and identify all data pills, links, tables, work surfaces that are not live with actual links to data; if that data is corrupt we need to fix it."
**Method:** three parallel audit agents (accounting pages / all other pages / API routes + data loaders) traced every rendered element to its data source and flagged: LEGACY (pre-v2 pricing model), BROKEN (dead fields, missing markup, 501 stubs), ABC-ONLY (blind to SRS/QXO), SAMPLE (demo fixtures presented as live). Verdicts below verified against code; DB-existence spot-checks by the orchestrator.

## 1. Headline

The invoice-audit surface, credit-memo flow, executive pipeline, and territory map are LIVE on the v2 model. Around them sit **three rings of rot**:

1. **Pre-v2 pricing model still running** in the Order Audit, Estimate Audit, the 12 `[slug]` accounting dashboards (`abc-price-gaps` engine), the gaps page, and the Agreement Builder internals — all still keyed on ship-to matches / `ceo_verified` / expiry-disqualifies.
2. **Demo fixtures presented as live**: the five `accounting/audit/*` queue pages (fabricated invoice numbers + synthetic fiscal-year multipliers + one literal "$2.1k" KPI), the Price List Requests tracker (clock frozen at 2026-06-17), the price-list catalog fallback, `dashboard.astro` (hardcoded mock with an undefined component).
3. **Dead wiring**: six map count elements with no markup, 501-stub agent-auth endpoints advertised as live on `/agents`, an Open-Items column that is structurally always 0, sales call-priority branch never fetched, 7 dashboard slugs that query nothing while claiming `readiness:"live"`.

## 2. Fixed same-day (this session)

- CM **Approve button dead-click** (inline stopPropagation swallowed the delegated handler) — fixed; KPI card now flips `N approved ($X) · M draft` live.
- **Checkbox semantics corrected**: a checked negotiated-variance line now JOINS the CM claim set via `POST /api/credit-memos/add-line` (refreshes stale wave rows to live-engine numbers, retotals the draft); No-Price/UOM keep the reviewed-valid ack. The 3 wrongly-passed lines re-opened.
- `dueNow` missing from the empty totals literal (crash path on the primary page) — fixed.
- `isAgreementOnFile` ceo_verified gate (last hard gate on the map) — dropped.
- Earlier same day: TX overlap resolution (mig 207), all-vendor office cards, demo Price List Requests panel removed, 288 legacy agent passes re-opened (mig 206).

## 3. Ranked remediation waves

**W1 — pricing-model cutover (wrong numbers today):**
1. Order Audit: `v_order_audit_line` still prices via ship-to branch-matches (schema 121) — needs the migration-201-style office-inherited cutover; its $-At-Risk / Flagged / No-Agreement KPIs are all misstated.
2. Estimate Audit: `v_estimate_audit_job.negotiated_pricing` = EXISTS(branch_matches) — every inheriting/non-ABC branch shows "No agreement" red. Repoint to `v_office_vendor_agreements`.
3. `lib/abc-price-gaps.ts` (engine behind all 12 `[slug]` dashboards): carries every legacy pattern at once (ceo gate at :841, ship-to joins, ABC-only, expiry-disqualifies, "Not CEO verified"/"Expired at invoice date" reasons). Retire the dashboards or rebuild on the v2 views. Its credit-memo table diverges from `credit_memo_requests`.
4. `branch-price-list.ts` invoice-scoped path (:121-145) still resolves via ship-to + expiry-filter and returns before office inheritance — a scoped Price List can read "no agreement" for an inheriting branch.
5. `api/price-agreement/review/promote.ts` actively writes NEW legacy rows (`abc_price_agreements` + branch matches, `ceo_verified:false`). Port to `price_agreements` / office model (folds into docs/83 P2 Ingest).
6. `frequently_ordered_import` vs `v_negotiable_items` — two competing "negotiable universe" sources; docs/83 gap rule (≥2 lifetime purchases) supersedes both.

**W2 — sample/broken pages (lying to the user):**
7. Delete or wire the five `accounting/audit/*` sample pages (fabricated data, dead deep links, synthetic year history; only `audit/credit-memos` is live).
8. Delete `dashboard.astro` (hardcoded mock, undefined component, dead `/acculynx` link).
9. `price-list-coverage.ts`: PLC_TODAY frozen at 2026-06-17 + profile fixtures (panel already pulled from vendor-regions; lib + orphaned component can go, superseded by docs/83 P2).
10. Price-list catalog: hardcoded ABC vendor filter, permanently-empty "Margin Impact (TBD)" column, sample fallback that silently replaces live data.
11. `/agents` page: Open-Items column always 0 (loads only the system surface); `AGENT_AUTH_SOURCE.version` renders empty; auth panel advertises 501-stub endpoints as live.
12. Sales call-priority: `buildSalesItems(pipelineRows, [])` — `vw_call_priority` never fetched; the nav leaf always falls back. Marketing "Campaign approvals" metric structurally 0; `/marketing/markets` + `/system/actions` slugs match no items; three stale `sourceSummary` strings.

**W3 — map/UX consistency:**
13. Territory map: restore-or-delete the dead `[data-vt-count]` counts strip; add `agreement_expired` to the Status filter + office branchCounts (split "missing" vs "expired-evergreen"); base `isNegotiated`/popup "Negotiated" KPI on in-force (not in-date) coverage; waterfall should prefer office coverage over the legacy region path.
14. `gaps → builder` link drops its `?branch=&focus=` params (builder ignores them).
15. `credit-memo.ts:51` + `disposition.ts:41` missing `request_kind` filters (latent multi-row error).
16. Retired-residue cleanup: dead disposition/comms CSS in invoice-audit.astro, `AuditMode` service_warranty plumbing, dead `[data-approval-action]` handler, unused AppShell `surface` prop, four orphaned components, orphaned `product-surface.json` route + its 4 snapshot RPCs, `invoice-payment.ts` (Phase 6 CSV contract — keep, documented).

**W4 — multi-vendor sweep (as SRS/QXO data lands, Phase 5):**
17. Vendor hardcodes: `agreement-package.ts:202` `.eq("vendor","ABC Supply Co.")`, `agreement-builder-overview.ts` VENDOR const, `invoice-payment.ts` invoiceVendor(), invoice-audit CSV vendor cell, weekly page ABC fallback, submit-agreement page label (vendor column exists but isn't selected), sync-health counting only ABC runs, Open-Invoices/credit-memo KPIs keyed to `abc_invoices`.

Most of W1's engine work and W2's request-tracker work is absorbed by the docs/83 Price Agreement Management build (P1–P3) — these waves should be sequenced with it, not in parallel.

## 4. Reference

Full per-element registers (file:line, source chain, verdict, fix direction for every pill/table/link on every page) live in the 2026-08-05 audit agent transcripts; this doc carries every actionable finding. DB objects verified present during the audit: `invoice_pipeline_status`, `service_warranty_audit_queue`, `mv_office_agreement_versions`, `v_office_vendor_agreements`, `frequently_ordered_import`. Flagged as possibly nonexistent (display-string only, never queried): `abc_api_pull`, `crm_pipeline.balance_due` label, the four orphaned snapshot RPCs.
