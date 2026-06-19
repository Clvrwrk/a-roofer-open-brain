# Handoff — Invoice Audit walkthrough fixes · segmentation · site speed · credit memos

**Date:** 2026-06-19 · **Branch:** `cleverwork/price-agreement-audit` = `origin/main` = deployed (Coolify), all at commit **`dffc50d`** (verified equal this session). **Confirm before app work:** `git fetch origin` → all three refs equal → branch from there. · **Full logs:** `context/memory/2026-06-19.md` (this session, blocks through 10:31) + `context/memory/2026-06-18.md`. · **Prior handoff:** `docs/handoffs/archive/2026-06-18-2017.md`.

## ▶ WHERE WE LEFT OFF (end of 2026-06-19)
Chris did a human walkthrough of the Invoice Audit and gave **6 findings + a segmentation ask**. **All 6 + segmentation + a client-blocking speed fix are DONE and deployed.** Three follow-ups remain, each gated on something outside the session (a host, a Chris decision, or a scheduled pass).

### DONE & deployed this session
- **Item 2 — At Risk KPI** now counts only *un-audited* overcharge (a `passed` audit, incl. the historical backfill, clears exposure) + new **"Credit Memo Requested"** KPI. Headline dropped **$877K → ~$6.2K** (≈99% was a UOM artifact).
- **Item 3 — UOM pricing** fixed for all ×3/×4/×5 bundled SKUs: audit views compare/display **`effective_unit_price` (extended÷qty)**, never raw `unit_price` (e.g. `02MLHLXABB` $387→$129/SQ). Schema 99 + 113.
- **Item 5 — branch price list** (`/accounting/price-list/branch`): branch name+address, agreement **number** pill (was internal id "#7"), scoped to the agreement active on the invoice date. Schema 101.
- **Item 6 — blank auditable lines**: root cause was `invoiceLineRows()` reading flat keys; ABC invoice payload nests qty/uom under `shippedQty|priceQty`, price under `pricePerUnitAmount|extendedPriceAmount`. Fixed parser + backfilled 171 lines + raw-fallback in views + post-sync canary. Schema 113.
- **Segmentation (12 categories)** — `roof_system_category` + `classify_roof_system()` + `item_roof_system_category` overrides (schema 114). Collapsible, default-collapsed category sections **site-wide**: Invoice Audit, Order Audit, Estimate Audit, branch price list. Documented as the standard in **`docs/40` §5a**.
- **Site speed (client-blocking)** — Order Audit **22s → 0.45s**: scope to the active window + lazy-load lines per order via `/api/order-audit/lines`. Also fixed a pre-existing **PostgREST 1000-row cap** that was hiding >half of invoice-audit lines.
- **Item 1 — credit memos (COMPLETE)** — `/accounting/audit/credit-memos` is live (was mock):
  - **Received CMs** (vendor issued): `v_credit_memo_audit` (schema 115) resolves the original invoice + line-by-line unit-price match (Matches/Mismatch/Partial/No-reference). Packet page (`/accounting/credit-memos/[invoice]`) → **Approve / Needs-review / Reject** writes `credit_memo_requests`.
  - **Requested CMs** (we claim a credit): Invoice-Audit `credit-flag`/`credit-noflag` dispositions **auto-create** a tracked `requested` request; lifecycle **draft → sent (+14d follow-up) → received → close** via the packet page. Queue merges both with a **Type** filter + `$ Requested`/`Awaiting Vendor` KPIs. Schema 116 (`request_kind`).

### ▶ OPEN — pick up here (all gated)
1. **Item 4 — daily invoice-PDF auto-pull.** 45 invoices lack a PDF; all have `invoice_id`. Plan: a `syncInvoicePdfs()` pass in `integrations/bridges/abc-supply/mirror-backfill.mjs` (call ABC `GET /api/invoice/v1/invoices/pdf/{invoiceId}` — needs a binary fetch, the JSON helper won't do; upload to the private `invoices` bucket; upsert `invoice_documents` source=`portal_sync`). **Code only — runs/verifies on the Hetzner/Coolify agent host, NOT in this sandbox** (the ABC sync can't run here).
2. **Metal / Tile / Siding categories** — the bulk of the ~19% "Uncategorized". **Chris decision**: add as categories (→15) or leave. Refine any item via `item_roof_system_category`.
3. **RLS on 7 exposed tables** (`agreement_packages`, `agreement_package_items`, `agreement_package_submissions`, `estimate_audit_edits`, `spatial_ref_sys`, 2× `_backup_*`) — Chris's scheduled **DB-health agent pass**.
- Optional: auto-approve-all-matching received CMs; apply the lazy-line pattern to Invoice Audit (1.2s).

## ▶ REPEATING-ISSUE PLAYBOOKS — read `docs/42` before touching ABC data
1. **ABC ingestion mapping drift** — the mapper has twice (orders schema 108, invoices schema 113) read flat keys that don't exist while `raw` held the values → null columns. Always check `raw` shape first; COALESCE from `raw` in views; the post-sync canary warns on recurrence.
2. **UOM normalization** — invoice `unit_price` is per-pack for bundled SKUs; the only correct per-UOM price is `effective_unit_price = extended/qty`. Never compare raw `unit_price`.
3. **PostgREST 1000-row cap** — any `.select()` over a table that can exceed ~1000 rows must paginate (`.range()`).

## ▶ STANDING INSTRUCTIONS (Chris)
- **Vendor data = official API docs FIRST, then the `<vendor>-api` data-map skill** — don't re-research schemas. Built: abc-supply-api, acculynx-api. TODO: EagleView/GAF/Roofr.
- **Verify against the LIVE DB, not migration files.**
- **Validation layer on every agent** (pair builds/audits with an adversarial verifier).
- **Zero external agent sends (v1)** — agents draft/notify internally; humans send externally. Credit-memo "Mark sent" only *logs* that a human sent it.
- **All dashboards function the same** — new line-list surfaces follow `docs/40` (category sections, `.range()` pagination, scoped deep-links, both themes).

## Environment / deploy
Source = GitHub `Clvrwrk/a-roofer-open-brain`; **canonical LIVE = `origin/main`** = dev `cleverwork/price-agreement-audit`. `git push origin main` auto-deploys (Coolify); verify `curl -s https://cc.proexteriorsus.net/healthz | grep buildCommit`. Local dev `127.0.0.1:4321` (Local Operator). Supabase `rnhmvcpsvtqjlffpsayu`; schemas mirrored through **116** (all additive/idempotent, applied live). ABC sync `mirror-backfill.mjs --env=production` on the real host (not this sandbox). Build gate: `cd app/command-center && npm run build`.

## Note
`excalidraw.log` shows as modified in `git status` — a stray tracked log, unrelated to this work; left untouched.
