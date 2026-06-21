# Handoff — Global Price Agreement build-out (API pricing · version-comparison · invoice-date lock · PDFs · description-match)

**Date:** 2026-06-20 · **Branch:** `cleverwork/price-agreement-audit`.
✅ **ALIGNED + PUSHED: dev (local) = `origin/main` = `39a14c9`, 0/0.** Coolify auto-builds `origin/main` → `cc.proexteriorsus.net` (verify `/healthz` buildCommit = `39a14c9` once the build settles). Local `main` is stale — ignore; `origin/main` is the only thing that deploys.
**Full logs:** `context/memory/2026-06-19.md` (evening) + `context/memory/2026-06-20.md`. **Prior handoff:** `docs/handoffs/archive/2026-06-19-pm-dashboard-reworks.md`.

This was a multi-session marathon that built the **Global Price Agreement (GPA)** system end-to-end. The vendor-agnostic catalog (`products`/`vendors`/`price_agreement_items`/`product_vendor_price_observations`) already existed (ABC-seeded Jun 4–8); we **extended** it rather than rebuilding. Schemas applied to shared prod through **migration 141** (all additive/idempotent; files in `schemas/cleverwork-roofer/`).

## ✅ What shipped (live on prod DB + `origin/main`)

1. **Best-vendor price** (mig 132): `v_vendor_price_normalized` + `v_best_vendor_price` (lowest base_uom price per canonical product; ABC-only today, multi-vendor-ready). **OCR price-list ingest** (mig 133): `ingest_price_list_observations()` + review queue. Docs: `docs/51`.
2. **ABC per-branch API price seed** (mig 134/135) — `integrations/bridges/abc-supply/price-seed.mjs`. Ran **606 purchased products × 150 priceable branches** (the API only prices branches our 11 Ship-To accounts hold — out-of-list → 401; ~546 national branches need an ABC account-expansion request). `v_branch_item_api_price` = item×branch → current API price, cycle `2026-06`.
3. **"API Price" column on ALL 5 line dashboards**, branch-tied to each doc's branch: Invoice Audit, Order Audit (`/api/order-audit/lines`), Agreement Builder, **Price Agreement Audit**, Estimate Audit (mig 140: estimate line → `product_mapping_id` → ABC item → API price). Proof it must be branch-specific: same item ranges $16.90–$27.30/BG across branches.
4. **PA Audit reworked**: scoped to the **99 GPA items** (53 families; non-GPA hidden); per branch shows each GPA item's negotiated + API price + variance. KPIs: API Coverage 100% · Negotiated 47% · Agreements Expired/Expiring · Avg Variance · **Price Changes to Review**. Purple Agreement pill → opens the stored PDF.
5. **Invoice-date price lock** (mig 137): both invoice-audit views compare each line to the agreement **effective at invoice time** (most recent `effective_date ≤ invoice_date`, locked until superseded). Open $ At Risk $4,437 → **$3,341** (date-correct).
6. **Price-list version-comparison engine** (mig 138): `v_agreement_version` / `v_agreement_version_delta` (per-item % change vs prior version → **accept 0–3% / review 3–6% / critical >6%** / decrease / new_item), `agreement_version_review` queue + `refresh_agreement_version_review()` (auto-accepts 0–3%, flags >6% `slack_queued`). Surfaced in PA Audit (KPI 64 = 31 review + 33 critical; per-item ▲% badges).
7. **Agreement PDFs** (mig 136): private `agreements` bucket; 7 PDFs uploaded, 4 linked (KC #2036874-20; Wichita #2036874-16 Jun/Apr/Sep). `/api/price-agreement/pdf/[agreementId]` signs + redirects.
8. **Item-id by description** (mig 139): family-level PDFs (Denver/Dallas, no item codes) → `ingest-price-list-pdf.mjs` (2-column parse, 221 rows) + `match-price-list-staging.mjs` (trigram match → 98 high / 93 review / 30 none). **Price List Review surface** `/accounting/price-agreement/review` (confirm/correct/reject + Promote → agreement; APIs review/update + review/promote).
9. **Product image chip** (mig 141): public `product-images` bucket; `fetch-product-images.mjs` pulled 91/99 GPA images. PA Audit price-list table: image chip first column, click → enlarge, click → close.
10. **Invoice Audit** quick fixes: office bars open-scoped; oldest-first sort (FIFO); purple callout shows PO for all 169/172 (client/job when AccuLynx-matched).

## ▶ WHERE WE LEFT OFF (open, in rough priority)

- **Image chip — Chris to VISUAL-VERIFY** (his gate; functionally verified, screenshot tool wouldn't capture). PA Audit → expand a Wichita branch → category → thumbnails first column, click to enlarge. Then optionally extend the chip to Builder + branch price list.
- **Denver/Dallas promotion**: Chris reviews the staged matches in `/accounting/price-agreement/review` (now readable — theme fix `39a14c9`), confirms/corrects, clicks **Promote → agreement**. Promote creates `abc_price_agreements` (`PE-DENVER-49` / `PE-DALLAS-41`) + items + branch match, links the stored PDF, refreshes version-comparison.
- **Price crons (task #8)**: schedule `price-seed.mjs` monthly on the 15th (all 150 branches) + a 30-day baseline, on the **agent host** (Hetzner/Coolify — not this sandbox). Cron flips the cycle key (next = `2026-07`).
- **Accounting Slack** (queued by Chris): >6% critical version-comparison changes → message all items to Accounting. Rows already flagged `slack_queued=true` in `agreement_version_review`; wire the send.
- **ABC account-expansion request** for the ~546 unpriceable national branches (draft for the `docs/47` ABC API thread).

## Key files
- Seed/ingest scripts: `integrations/bridges/abc-supply/{price-seed,fetch-product-images,upload-agreement-pdfs,ingest-price-list-pdf,match-price-list-staging}.mjs`.
- Schemas 132–141: `schemas/cleverwork-roofer/`. Docs: `docs/51` (GPA best-vendor + OCR).
- Review surface: `src/pages/accounting/price-agreement/review.astro` + `/api/price-agreement/review/{update,promote}.ts`.
