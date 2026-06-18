# Handoff — Command Center: audits, vendor pulls, AcuLynx matching, design system

**Date:** 2026-06-18 · **Branch:** `main` @ `9136075` (= `origin/main` = dev branch `cleverwork/price-agreement-audit`, deployed) · **Full logs:** `context/memory/2026-06-17.md` (Sessions 1–19) + `context/memory/2026-06-18.md`

## ▶ NEW STANDING INSTRUCTION (from Chris, 2026-06-18) — vendor API skills
**Stop re-researching vendor schemas every session — it wastes tokens.** For any
vendor we have a documented API for, there must be an **API data-map skill** that
says exactly where each kind of data is stored (table.column), which endpoint
populates it, and — critically — **what is NOT available via the API and must be
human-in-the-loop ingested** (e.g. ABC AR/paid status). Before searching vendor
tables or wondering if an endpoint exists, **read the skill first.**
- ✅ Created this session: `skills/cleverwork-roofer/abc-supply-api/SKILL.md` (full ABC API↔table map + HIL notes) and a Brain-data-map section added to `skills/cleverwork-roofer/acculynx-api/SKILL.md`.
- TODO: same treatment for EagleView, GAF, Roofr, and any other documented vendor API as we touch them. Keep these skills updated when schema/endpoints change.

## ▶ PICK UP HERE — the three-item sequence (Item 2 in progress)
Chris's sequence: **Item 1 (AR feed) → Item 2 (Orders audit + AcuLynx verify) → Item 3 (price-agreement builder).**

### Item 1 — AR feed / "169 active invoices" — VERIFIED, 1 question pending
- Paid/unpaid data lives in **`invoice_documents.payment_status` / `paid_at`** (the audit uses it). **The ABC API has NO AR/paid/balance/due endpoint** (entire catalog verified). So open/paid/due-date/total-due (the "169 active" + due dates from ABC's portal) come ONLY from the **ABC portal CSV export** (`ABCSUPPLY_*.csv`), human-in-the-loop. No API substitute.
- **PENDING Q for Chris:** how does `invoice_documents.payment_status` get populated today (Make flow off the CSV? manual import?). If a process already refreshes it → audit converges to ~169 on its own. If not → **build the AR-CSV ingestion** (table cols for total_due/due_date/terms + a loader that flips open/paid + adds due dates).

### Item 2 — Orders audit under Operations + Order↔AcuLynx verification — IN PROGRESS
- **Done:** refreshed orders (3,146 → +32 via the nightly pull); **fixed the order-sync PO-extraction bug** (PO is `raw.salesOrder.purchaseOrder` = `"CO-227: Client"`, not `purchaseOrderNumber`; committed). Confirmed: order lines have **no price** (pre-pricing) → the audit is the **Order↔AcuLynx verification + item coverage**, not price variance. **349 orders match AcuLynx jobs** via PO prefix.
- **NEXT (build):** `v_order_audit_*` views (Office→Branch→Order→Line, reading PO from `raw.salesOrder.purchaseOrder` since the column is still empty for existing rows) + `v_order_acculynx_match` + `lib/order-audit.ts` + `pages/operations/order-audit.astro` (mirror invoice-audit design system) + nav "Order Audit" under Operations. Use **AcuLynx `id` as permanent key + `{Region}-TEMP-{short id}`** labels for prospect-stage jobs (Chris confirmed orders DO happen pre-approval).

### Item 3 — vendor-agnostic price-agreement builder (PDF + CSV + magic link) — REQUIREMENTS LOCKED, build after Item 2
- Send branch mgr + regional rep an email with **PDF + attached CSV + magic link** for every negotiated item when opening/renewing a branch.
- **Item list:** purchased-in-36mo set (~1,473) curated to **~500** (the negotiate/don't-negotiate rules). **Validation:** magic-link submission is primary (email "approved" reply = fallback signal, via AgentMail reply-to).
- **Digital view:** top-level items with expand to colors/variations; **price entered at top level inherits to all down-levels; a down-level override becomes primary.** Prefill = latest agreement price per item, **0 if no agreement ever existed.** Vendor-agnostic data model. The 5 ABC branch PDFs in `…/reabcinvoices/` show the agreement format to mirror.

## What's LIVE now (all on `main`, deployed, design-system consistent)
- **Home = territory map** (color lens, branch/office KPI popups + matching side card w/ PE-office assignment persistence + Active Price List link, state auto-fit, default = Richardson TX). Logo text removed.
- **Invoice Audit** (`/accounting/invoice-audit`): Office→Branch→Invoice→Line drill-down, live; **defaults to Open invoices** (Open/Paid/All); line-level **audit (Audited Y/N)** with auto-pass (Matched Negotiated Price) + Lucinda paid-backfill + mark-passed API; PDF link (signed URL); per-invoice **Price List** new-window link; **AcuLynx job#/client/type** on matched invoices.
- **Estimate Audit** (`/operations/estimate-audit`): live Office→Job→Estimate→Line editable tree.
- **Price Agreement Audit** (`/abc-price-agreement-gaps`): agreement-lifecycle dashboard (all 5 item-bearing agreements EXPIRED) + **Request Renewal** persists to `price_refresh_request` (drafted, no auto-send).
- **Price List Coverage / Negotiated Catalog / Price Foundation**: live + design-system (catalog now real spend 2023-26).
- **Branch price list** standalone page (`/accounting/price-list/branch?branch=`).

## Infra / deploy (working)
- `git push origin main` **auto-deploys** via GitHub→Coolify webhook (fixed this session). Verify: `curl -s https://cc.proexteriorsus.net/healthz | grep buildCommit`. Manual fallback + full SOP in `docs/27`.
- Schemas mirrored: `schemas/cleverwork-roofer/98–105`. Migrations applied live to `rnhmvcpsvtqjlffpsayu`.

## Known data-quality findings (business actions for Chris)
1. **All item-bearing ABC price agreements are expired** → renewals (Item 3 / Request Renewal).
2. **AcuLynx job-number coverage is low** (179/1240 jobs have a PE number) → caps job-matching at ~33%; the TEMP-number scheme + populating numbers upstream is the fix.
3. **Invoice/order paid status + due dates are portal-only** (no ABC API) → the AR-CSV feed (Item 1).
