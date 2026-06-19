<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**Full handoff: `docs/handoffs/current.md`.** 3-item sequence is through Item 3. **Item 1 (AR feed) is the only open business Q:** how is `invoice_documents.payment_status` fed (Make off the ABC portal CSV, or manual)? No ABC API for AR/paid/due — portal CSV only.

## Standing instructions (Chris, 2026-06-18)
- **Vendor data = docs FIRST, then the data-map skill.** Read the vendor's official API docs (source of truth) + `skills/cleverwork-roofer/<vendor>-api/SKILL.md` before researching schemas. Built: abc-supply-api (docs apidocs.abcsupply.com), acculynx-api. TODO: EagleView/GAF/Roofr.
- **Validation layer on every agent** (audits/builds): pair work with an independent adversarial verifier.
- **Verify against the LIVE DB, not migration files** (a static audit gave 3 false "dead" positives).
- **Zero external agent sends (v1):** agents draft + notify Lucinda/Roberto internally; humans send externally from Hermes/Google Workspace (`agents.proexteriorsus.net`). Enforced by `lib/outbound-guard.ts`.

## Command Center — LIVE (all on `main`, design-system)
Home territory map · Invoice Audit · **Order Audit** (`/operations/order-audit`, priced variance + 60d auto-archive) · Estimate Audit (edits now PERSIST, schema 112) · Price Agreement Audit + **Agreement Builder** (`/accounting/price-agreement/builder`: per-branch A+B worksheet → PDF/CSV → single-claim magic link; recipient Justin Garza) · Price List Coverage (Request Price List now persists) · Price Foundation · Marketing dept (now in nav).

## Key findings (business actions)
- All item-bearing ABC price agreements EXPIRED → renewals; only ~66/857 A+B SKUs negotiated anywhere.
- PE job# is in `acculynx_jobs.job_name` ("KS-157: Client"), not `job_number` (179/1240) → matching ~33%.

## Environment / Deploy
Source = GitHub `Clvrwrk/a-roofer-open-brain`; **canonical LIVE = `origin/main`** = dev `cleverwork/price-agreement-audit`. `git push origin main` auto-deploys (Coolify). Verify `curl -s https://cc.proexteriorsus.net/healthz | grep buildCommit`. Local dev `127.0.0.1:4321` (Local Operator). Supabase `rnhmvcpsvtqjlffpsayu`. Schemas mirrored thru 112. ABC sync `mirror-backfill.mjs --env=production` (real host). Docs: builder `docs/40`, site audit `docs/41`.
