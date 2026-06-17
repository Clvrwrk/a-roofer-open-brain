# 39 — Price List Audit & Accounting Suite: Go-Live Plan

**Status:** DRAFT for review — nothing deployed. Plan → Review → Deploy.
**Owner:** Chris (CTO/AI Admin). Approvers: Lucinda (Accounting), Roberto (Ops).
**Supabase project:** `rnhmvcpsvtqjlffpsayu`.

Covers the surfaces built in the 2026-06-17 session (Sessions 1–11):
Invoice Audit screen + 6 KPI drill-downs, Negotiated Item Catalog, and the
Price List Audit (vendor→branch coverage tree + requests tracker). All are
**sample data today** (some keyed to live territory branches).

---

## TL;DR

The DB is **not empty** — most live sources already exist. Go-live is mostly
**mapping sample loaders → existing tables + closing a short gap list**, not
building data from scratch. Two things to decide up front: (1) reconcile our
proposed request table with the **existing `price_refresh_request`** table, and
(2) fix the **RLS-disabled security finding** (see §6).

---

## 1. Data-readiness matrix (sample surface → live source)

Legend: ✅ live source exists · ⚠️ exists, needs derivation/logic · ❌ gap.

### Price List Audit — vendor→branch coverage tree (`/accounting/vendor-regions`)
| Need | Live source | State |
|---|---|---|
| Vendors / branches | `vendors` (5), `vendor_branches` (756), `abc_vendor_branches` (720) | ✅ |
| PE offices + 2-hour drive-time isochrone | `office` (5, `drive_time_minutes`/`boundary`) | ✅ |
| **In-scope (≤2h drive-time)** branch set | `branch_office_candidate` (72 — every office whose boundary contains a branch) | ✅ |
| Negotiated coverage per branch (full/partial/none) | `price_agreements` (7) + `price_agreement_items` (317); `abc_price_agreements` (99) + `abc_price_list_items` (1067) + `abc_price_agreement_branch_matches` (887) | ✅ |
| Item pricing source (Negotiated / Invoice-Mean / API / One-Off / No-Price) | `price_agreement_items` (negotiated); `product_vendor_price_observations` (2205) + `product_vendor_pricing` mat-view (invoice mean); `abc_price_observation_lines` (444k, API) | ⚠️ classifier to build |
| Order-trigger (ordered at a no-agreement branch) | `abc_orders` (3146), `abc_order_lines` (18391) | ✅ |
| **Requests tracker + weekly follow-up** | **`price_refresh_request` already exists** ("price-list refresh email queue … awaiting_verification → approved → ready_to_send") | ✅ reconcile (see §2.1) |
| Recipients: sales rep | `reps` (7) | ⚠️ partial |
| Recipients: branch manager | — | ❌ gap |

### Invoice Audit + drill-downs (`/accounting/invoice-audit`, `/accounting/audit/*`)
| Need | Live source | State |
|---|---|---|
| Invoices + lines | `abc_invoices` (520), `abc_invoice_lines` (2462), `abc_line_items` (16282), `invoice_documents` (2844) | ✅ |
| Price-agreement reference / variance | `price_agreement_items`, `abc_price_list_items`; gap logic in `abc-price-gaps.ts` | ✅ |
| Pending audit / out-of-tolerance / $ at risk / no-price | derived (invoice price vs agreement) — pattern exists in `accounting-dashboard.ts` | ⚠️ derive |
| Credit memos | `credit_memo_requests` (0), `credit_memo_request_lines` (0) — tables ready, unpopulated | ⚠️ workflow |
| Avg resolution time | `dashboard_action_log` (6), `invoice_action_log` (410) | ⚠️ derive |

### Negotiated Item Catalog (`/accounting/price-list/catalog`)
| Need | Live source | State |
|---|---|---|
| Spend by SKU (period: M/Q/A) | `abc_line_items`, `abc_order_lines`, `abc_invoice_lines` | ✅ |
| Revenue/Qty by State & by PE office | join branches → `office` | ✅ |
| Coverage per item | `price_agreement_items` | ✅ |
| **Margin impact** | — (algorithm undefined) | ❌ placeholder |

**The app already queries live** in `vendor-territories.ts`, `accounting-dashboard.ts`,
`price-foundation.ts`, `abc-price-gaps.ts`, `live-work.ts` — follow that pattern.

---

## 2. Gap punch-list (close before/at go-live)

1. **§2.1 Reconcile request tracker with `price_refresh_request`.** An existing
   table already models "territory has no current price list → email request →
   Lucinda verifies → send." **Recommendation: use/extend `price_refresh_request`
   and DROP the proposed `schemas/.../95-price-list-requests.sql`** (or fold its
   missing columns — vendor/branch grain, weekly-follow-up cadence — into the
   existing table additively). Decide before any schema apply.
2. **Branch-manager contacts** — needed so a request can draft recipients
   (sales rep is in `reps`). *(Go-live task, per Chris.)*
3. **Pricing-source classifier** — one function/view that labels each item×branch
   Negotiated / Invoice-Mean / API / One-Off / No-Price from the sources above.
4. **Margin-impact algorithm** — still a labeled placeholder; needs Chris's formula.
5. **Resolved-audit history** for Avg Resolution — derive from the action logs.
6. **Real per-year data** — the Year filter currently synthesizes 2024/25 from a
   factor; pull true per-year spend from order/invoice history.

---

## 3. Build phase (swap sample loaders → live queries)

Per surface, replace the sample builders with Supabase-backed loaders, reusing
the existing live-query + review-overlay pattern (`price_foundation_review_actions`
shows the model: derive queues live, store only human state):

- `lib/price-list-coverage.ts` → `loadPriceListCoverage()` from branches × offices ×
  `branch_office_candidate` × agreements × orders. In-scope from `branch_office_candidate`.
- `lib/price-list.ts` (catalog) → spend rollups from `abc_*_lines`.
- `lib/audit-queues.ts` + invoice-audit page → from `abc_invoice_lines` × agreements.
- Add DB **views** where helpful: `v_branch_price_coverage`, `v_price_list_request_aging`
  (additive, idempotent — repo rule).

Keep the components/scripts/CSS as-is (they're data-shape agnostic).

---

## 4. Review phase (gate before deploy)

- [ ] Spot-check each surface's numbers vs source SQL (coverage %, $ at risk, top-200 spend).
- [ ] In-scope set matches `branch_office_candidate` (drive-time truth).
- [ ] Coverage classification matches `price_agreement_items` for a sampled branch.
- [ ] Migrations are **additive + idempotent**, no secrets, no destructive SQL.
- [ ] RLS/policies reviewed (see §6).
- [ ] Human-in-the-loop preserved: Request Price List **drafts** only (no auto-send).

---

## 5. Deploy phase (gated — only after review sign-off)

1. Apply additive migrations/views via Supabase MCP `apply_migration` (one at a time).
2. Add WorkOS env before exposing real auth: `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`,
   `WORKOS_COOKIE_PASSWORD`, `WORKOS_REDIRECT_URI`, `COMMAND_CENTER_AUTH_MODE=workos`.
3. Deploy app to Coolify (`https://cc.proexteriorsus.net`; DNS cutover pending).
4. Live smoke test (the routes in §1) + `get_advisors` re-run.

---

## 6. Security finding (MUST address) — RLS disabled

`get_advisors`/`list_tables` flagged **4 tables with Row Level Security disabled**
(readable/writable by anyone with the anon key):

- `public.abc_change_log` ← we created this 2026-06-17; **enable RLS + service-role policy.**
- `public._backup_abc_regions_20260605`, `public._backup_abc_vendor_branches_20260605` ← drop if verified, else enable RLS.
- `public.spatial_ref_sys` ← PostGIS system table (lower risk; common to leave, decide explicitly).

Remediation SQL (do **not** auto-apply — enabling RLS with no policy blocks all access):
```sql
ALTER TABLE public.abc_change_log ENABLE ROW LEVEL SECURITY;
-- + a service-role policy, e.g.:
CREATE POLICY abc_change_log_service ON public.abc_change_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```
Also: several `*_pre_dedupe_20260420` snapshot tables are marked "safe to drop after verification" — candidate cleanup.

---

## 6b. Review pass — VERIFIED against live DB (2026-06-17)

Decisions taken: reconcile to `price_refresh_request`; **Price List Coverage tree first**;
staging/branch before prod; fix RLS on `abc_change_log` now.

Schema inspection + counts confirmed the coverage-tree mapping:
- **Branches** = `vendor_branches` (756, canonical multi-vendor). It already carries
  `pricing_territory_office_id`, `pricing_status`, `manager_name/email`,
  `sales_rep_name/email`, `vendor_id`, lat/long/geom.
- **In-drive-time (≤2h)** = `branch_office_candidate.contains = true` (+ `drive_minutes`).
  **52 branches** are in drive-time; **54** have an assigned office. The other ~700 have
  no territory → "no price list needed" by default (matches the in-scope rule).
- **Coverage** is **region-level**: `office.region_id → price_agreements (is_active) → price_agreement_items`
  ("an office's negotiated price = the active agreement for its region"). **5 active agreements**,
  3 with a branch-level `vendor_branch_id`. Coverage full/partial/none = item coverage of the
  branch office's region agreement.
- **Order-trigger** = `abc_orders.branch_number` (3,146 orders across **70 branches**).
- **Recipients are EMPTY**: `manager_email` and `sales_rep_email` = **0 / 756 populated**.
  Schema is ready; data is not. → Request **display** is fine; Request **send** is blocked
  until contacts are loaded (go-live task, already held).
- **`price_refresh_request`** = 1 row, status `ready_to_send`; vendor/region-grained, no
  branch grain or follow-up fields. Reconciliation = additive ALTER (see migration below).

**Migration drafts (proposed, NOT applied — apply on a Supabase branch first):**
- `schemas/cleverwork-roofer/95-price-list-requests.sql` — additive ALTER on
  `price_refresh_request` (branch grain + scope flags + rep/branch-mgr recipients +
  weekly-follow-up cadence) + `v_price_refresh_request_aging` view.
- `schemas/cleverwork-roofer/96-rls-abc-change-log.sql` — enable RLS on `abc_change_log`
  + service-role (full) and authenticated (read-only) policies.

**Coverage-tree live loader (to build):** `loadPriceListCoverage()` from
`vendors × vendor_branches × branch_office_candidate × office × price_agreements × price_agreement_items`,
order-trigger from `abc_orders`, requests from `price_refresh_request`. Replaces the sample
`buildPriceListCoverage(surface)`; component/script/CSS unchanged.

## 6c. Recipient contacts — DON'T crawl; project from the ABC API (2026-06-17)

Investigated using Firecrawl on abcsupply.com/location. Finding: the **ABC public website
exposes manager NAME, phone, fax, hours, services — but NO emails and no sales rep** (account-level).
**The official ABC Location API already has the branch manager name AND email** in
`abc_vendor_branches.manager_json` (`{firstName,lastName,email}`, 696/720 populated) — strictly
better than the website. So crawling is the wrong primary tool.

The real blocker is a **branch-table crosswalk**: canonical `vendor_branches` (756) ↔ API mirror
`abc_vendor_branches` (720) were populated semi-independently. Clean keys are sparse —
`legacy_id→abc.id` = 67 (precise), `branch_number` = 71, lat/long present on only 149.

Decision (Chris): **API projection first, then Firecrawl backfill**; sales rep from
`price_agreements.sales_rep` for now. Plan:
1. `schemas/.../97-branch-contact-projection.sql` — tiered crosswalk view `v_vendor_branch_abc_xref`
   + idempotent backfill of `vendor_branches.manager_name/email` from the API (and `sales_rep_name`
   from agreements). Proposed/staging-first. Expected fill ≈ the seeded ABC set (~70-100; ~21-30 of
   the in-scope ~54).
2. **Firecrawl backfill** the in-scope branches the crosswalk can't resolve — manager name + phone +
   hours only (no email) — via `https://www.abcsupply.com/location/{city}-{ST}-{zip}`.
3. Sales-rep **email** stays a go-live task (not on site or Location API; account API later).

→ The §2.2 "branch-manager contact" gap is mostly SOLVABLE from data we already hold.

## 7. Decisions / gates needed before deploy

1. **Reconcile to `price_refresh_request`?** (recommended yes — avoid a duplicate table).
2. **First go-live scope:** whole suite, or Price List Coverage tree first?
3. **Deploy target:** Coolify prod + DNS cutover now, or staging first?
4. **RLS:** approve enabling RLS on `abc_change_log` (+ policy); decide on backups/spatial_ref_sys.
5. **Auth:** turn on WorkOS for the live surface, or keep local-operator for internal-only?

Open data gaps (#2.2 branch-manager, #2.4 margin algorithm) are **go-live tasks**,
not blockers for the read-only surfaces — they only gate the Request-send and the
margin column respectively.
