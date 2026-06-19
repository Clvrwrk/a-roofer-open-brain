# Handoff — Command Center: vendor audits, Agreement Builder, full-site action audit

**Date:** 2026-06-18 (late) · **Branch:** `cleverwork/price-agreement-audit` = `origin/main` = deployed (Coolify). **Confirm before app work:** `git fetch origin` → both refs equal → branch from there. · **Full logs:** `context/memory/2026-06-17.md` + `context/memory/2026-06-18.md`.

## ▶ WHERE WE LEFT OFF (end of 2026-06-18)
**The 3-item sequence is through Item 3; a full-site action audit ran and all its findings are fixed + deployed.**

- **Item 1 (AR feed)** — STILL THE ONLY OPEN BUSINESS Q. How is `invoice_documents.payment_status` populated today (Make flow off the ABC portal CSV, or manual)? If a process refreshes it, the audit converges to ~169 on its own; if not, build the AR-CSV ingestion. No ABC API for AR/paid/due — portal CSV only.
- **Item 2 (Order Audit)** — DONE & deployed. `/operations/order-audit` — priced variance audit (order unit price vs negotiated), 60-day/invoiced auto-archive. Schemas 106-108.
- **Item 3 (Price Agreement Builder)** — DONE & deployed (all 5 slices, schemas 109-111). `/accounting/price-agreement/builder`: per-branch A+B worksheet → editable+persisted → PDF/CSV → drafted handoff (outbound guard) → single-claim magic link. Recipient = Justin Garza. Plan/status: `docs/40`.
- **Full-site action audit** — DONE (`docs/41`). ~220 triggers, 13 surfaces, 26-agent workflow + dynamic/data pass. Found + FIXED: estimate edits now persist (schema 112), "Request Price List" now persists, marketing nav added, reopen-preserve, KPI filter pass-through. 3 static "dead" findings were false positives (verify against the LIVE DB, not migration files).

**Next options:** Item 1 AR-CSV ingestion (needs Chris's answer first); EagleView/GAF/Roofr vendor API-data-map skills; or whatever Chris prioritizes.

## ▶ STANDING INSTRUCTION (Chris, 2026-06-18) — vendor API skills + docs-first
**Stop re-researching vendor schemas every session — it wastes tokens.** For any
vendor we have a documented API for, there must be an **API data-map skill** that
says exactly where each kind of data is stored (table.column), which endpoint
populates it, and — critically — **what is NOT available via the API and must be
human-in-the-loop ingested** (e.g. ABC AR/paid status). Before searching vendor
tables or wondering if an endpoint exists, **read the skill first.**
- ✅ Created this session: `skills/cleverwork-roofer/abc-supply-api/SKILL.md` (full ABC API↔table map + HIL notes) and a Brain-data-map section added to `skills/cleverwork-roofer/acculynx-api/SKILL.md`.
- TODO: same treatment for EagleView, GAF, Roofr, and any other documented vendor API as we touch them. Keep these skills updated when schema/endpoints change.

## ▶ PICK UP HERE — the three-item sequence (Item 3 next)
Chris's sequence: **Item 1 (AR feed) → Item 2 (Orders audit + AcuLynx verify) → Item 3 (price-agreement builder).** Item 2 is DONE & deployed; Item 3 is the next build (requirements locked, below). Item 1 still waits on Chris's answer about the `payment_status` feed.

### Item 1 — AR feed / "169 active invoices" — VERIFIED, 1 question pending
- Paid/unpaid data lives in **`invoice_documents.payment_status` / `paid_at`** (the audit uses it). **The ABC API has NO AR/paid/balance/due endpoint** (entire catalog verified). So open/paid/due-date/total-due (the "169 active" + due dates from ABC's portal) come ONLY from the **ABC portal CSV export** (`ABCSUPPLY_*.csv`), human-in-the-loop. No API substitute.
- **PENDING Q for Chris:** how does `invoice_documents.payment_status` get populated today (Make flow off the CSV? manual import?). If a process already refreshes it → audit converges to ~169 on its own. If not → **build the AR-CSV ingestion** (table cols for total_due/due_date/terms + a loader that flips open/paid + adds due dates).

### Item 2 — Orders audit under Operations + Order↔AcuLynx verification — DONE (commit 7d20eeb, deployed)
- **Built:** Schema 106 (`v_order_audit_order`, `v_order_audit_line`, `v_order_acculynx_match`, applied to prod) + `lib/order-audit.ts` (paginated) + `pages/operations/order-audit.astro` + `scripts/order-audit-tree.ts` + nav "Order Audit" under Operations. Mirrors the Invoice Audit design system (Office→Branch→Order→Line, theme toggle, deep-link, lazy line render).
- **Verification + coverage view** (order lines are pre-pricing → no variance). PO read from `raw->'salesOrder'->>'purchaseOrder'` (the column is empty 0/3178 — sync fix is new-pulls-only), date from `raw.dates.orderedOn`, $ total from `raw.orderAmounts.total`, status from `raw.salesOrder.status`.
- **Live:** 3,178 orders · 354 matched to a PE job (11%) · $7.32M ordered · 16,116/18,593 lines (87%) uncovered by a current agreement. Same upstream caps as invoices (AcuLynx PE# coverage; expired/empty agreements).
- **Deferred:** the `{Region}-TEMP-{short id}` prospect-stage labeling (AcuLynx `id` as permanent key) is not yet surfaced here — orders match on PO→job_name prefix only. Add when wiring prospect-stage orders.

### Item 3 — vendor-agnostic price-agreement builder (PDF + CSV + magic link) — REQUIREMENTS LOCKED, build after Item 2
- Send branch mgr + regional rep an email with **PDF + attached CSV + magic link** for every negotiated item when opening/renewing a branch.
- **Item list:** purchased-in-36mo set (~1,473) curated to **~500** (the negotiate/don't-negotiate rules). **Validation:** magic-link submission is primary (email "approved" reply = fallback signal, via AgentMail reply-to).
- **Digital view:** top-level items with expand to colors/variations; **price entered at top level inherits to all down-levels; a down-level override becomes primary.** Prefill = latest agreement price per item, **0 if no agreement ever existed.** Vendor-agnostic data model. The 5 ABC branch PDFs in `…/reabcinvoices/` show the agreement format to mirror.

## What's LIVE now (all on `main`, deployed, design-system consistent)
- **Home = territory map** (color lens, branch/office KPI popups + matching side card w/ PE-office assignment persistence + Active Price List link, state auto-fit, default = Richardson TX). Logo text removed.
- **Invoice Audit** (`/accounting/invoice-audit`): Office→Branch→Invoice→Line drill-down, live; **defaults to Open invoices** (Open/Paid/All); line-level **audit (Audited Y/N)** with auto-pass (Matched Negotiated Price) + Lucinda paid-backfill + mark-passed API; PDF link (signed URL); per-invoice **Price List** new-window link; **AcuLynx job#/client/type** on matched invoices.
- **Estimate Audit** (`/operations/estimate-audit`): live Office→Job→Estimate→Line editable tree.
- **Order Audit** (`/operations/order-audit`): live Office→Branch→Order→Line verification + coverage tree (AcuLynx job match + negotiated coverage; orders are pre-pricing so no $ variance).
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
