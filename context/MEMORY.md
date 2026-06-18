<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**Full handoff: `docs/handoffs/current.md`.** Mid-sequence: Item 1 (AR feed) → **Item 2 (Order Audit + AcuLynx verify) — IN PROGRESS, build the dashboard next** → Item 3 (price-agreement builder, locked).

## Standing instruction (Chris, 2026-06-18)
**Vendor API skills — stop re-researching schemas (wastes tokens).** For any vendor with a documented API, read its data-map skill FIRST: where each datum lives (table.column), which endpoint feeds it, what's human-in-the-loop only. Built: `skills/cleverwork-roofer/abc-supply-api/` + acculynx-api (Brain data-map section). TODO: EagleView/GAF/Roofr.

## Command Center — LIVE state (all on `main`, design-system)
- **Home = territory map** (color lens, branch/office KPI popups + side card w/ PE-office assignment + Active Price List link, default Richardson TX).
- **Invoice Audit**: Office→Branch→Invoice→Line, live, defaults to Open invoices; line-level Audited Y/N (auto-pass + Lucinda paid-backfill + mark API); PDF + Price List links; AcuLynx job#/client/type on matched.
- **Estimate Audit** (`/operations/estimate-audit`): live editable Office→Job→Estimate→Line tree.
- **Price Agreement Audit**: agreement-lifecycle dashboard + Request Renewal (persists, drafted). **Price List Coverage / Negotiated Catalog (real spend) / Price Foundation**: live + design-system.

## Key data findings (business actions)
- **All item-bearing ABC price agreements are EXPIRED** → renewals.
- **PE job number is in `acculynx_jobs.job_name`** ("KS-157: Client"), not `job_number` (179/1240) → job-matching caps ~33%.
- **ABC API has NO AR/paid/due endpoint** → open/paid/due (the "169 active") come only from the ABC portal CSV (HIL). Paid status is in `invoice_documents.payment_status`. PENDING Q: how is it fed?

## Environment / Deploy
- Source of truth = GitHub `Clvrwrk/a-roofer-open-brain`; **canonical LIVE = `origin/main`** = dev `cleverwork/price-agreement-audit` (mirrors). `git push origin main` **auto-deploys** (GitHub→Coolify webhook FIXED). Verify: `curl -s https://cc.proexteriorsus.net/healthz | grep buildCommit`. SOP `docs/27`.
- Local dev `http://127.0.0.1:4321/` (Local Operator, no WorkOS). Supabase `rnhmvcpsvtqjlffpsayu`. Schemas mirrored `98–105`. ABC sync: `mirror-backfill.mjs --env=production --only=invoices|orders --detail-mode=missing` (nightly-safe; real host).
