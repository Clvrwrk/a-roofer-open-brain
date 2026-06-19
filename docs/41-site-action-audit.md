# 41 — Full-Site Action Audit (every page, every trigger)

**Date:** 2026-06-18 · **Scope:** every interactive trigger on every built page of the Command Center.
**Method:** a 26-agent static+wiring audit (12 surface auditors, each with an independent adversarial
validator, + a completeness critic) → then a **dynamic/data-layer pass** (drive the running app +
before/after Supabase) that corrected the static findings. **Audit-first**: this is the findings report;
fixes are batched after review.

## How coverage was guaranteed
1. **Pages** enumerated mechanically from `pages/**/*.astro` (excluding `/api` and the `" 2"` iCloud
   duplicates) → 13 surfaces. 2. **Triggers** extracted from each page **and** its bound code —
   inline `<script>` blocks *and* `scripts/*.ts`, covering `<button>`, `<a href>`, `<select>`,
   `<input>`, `<form>`, `[data-*]` actions, and every `addEventListener`. 3. **Each trigger** classified
   (navigation / persist-or-disposition / pure-UI / export), its handler + endpoint + Supabase
   table verified to exist. 4. **Completeness critic** re-derived the page/script list independently.
   **~220 interactive triggers** inventoried across the 13 surfaces.

## The key lesson: static analysis over-called; the dynamic pass is mandatory
The static audit (even with validators) read **migration files**, not the **live DB**, and produced
**3 false positives** on its highest-priority "dead" findings. The dynamic/data pass caught all three:

| Static "DEAD" claim | Reality (dynamic-verified) |
|---|---|
| `mark-paid` writes `gate_override` (missing column) → runtime fail | **LIVE.** `invoice_documents.gate_override` (+`_by/_at/_reason`) exists; endpoint is error-handled per step. |
| `/accounting/review-queue` → 404 | **LIVE.** Renders the real "ABC Review Queue" page via `accounting/[slug].astro`. |
| `invoice_action_log` = dead persistence target | Table exists; `mark-paid` correctly writes `dashboard_action_log` — a mis-attribution, not a bug. |

→ Verdicts below are the **dynamic-corrected** truth.

## Resolution status (2026-06-18)
All 3 confirmed defects **FIXED + verified** (before/after Supabase, test rows removed):
- **#1 estimate persistence** → `87f2da9` (schema 112 overlay + save endpoint + Save button).
- **#2 "Request Price List"** → `f1ef2ba` (new `request-price-list` endpoint; persists to `price_refresh_request`).
- **#3 marketing nav + cleanup** → `eaf3ffd` (Marketing dept added to nav; orphan script + 37 `" 2"` dupes removed).
- **Suspect #4 (Reopen)** → `6daf392` — Chris chose **preserve**; reopen now keeps prior resolution/note (updates status only). Verified.
- **Suspect #5 (AuditQueue KPI param)** → `6daf392` — Chris chose **pass filter through**; nav cards append `?filterCol=&filterVal=` and the queue reads them on init.

**All audit findings are now resolved.** Net real defects this audit caught + fixed: 2 dead persist actions (estimate, Request Price List) + 1 nav gap + 2 semantic/UX suspects; 3 static false-positives were disproven by the dynamic pass.

## Confirmed REAL defects (ranked)

| # | Severity | Trigger / surface | What's wrong | Fix |
|---|---|---|---|---|
| 1 | **HIGH** | **Estimate edits not persisted** — `operations/estimate-audit.astro` + `scripts/estimate-audit.ts` | Edits recalc **locally only**; the code literally toasts *"Recalculated locally — not saved."* No `fetch`, no Supabase write. An ops edit is lost on reload. (Your requirement: estimate updates must persist.) | Add a save path: a `POST /api/operations/estimate-audit/line` (auth-gated) writing to the estimate line table; wire the editable inputs to it with a before/after-verified upsert. |
| 2 | **HIGH** | **"Request Price List"** button — `accounting/vendor-regions.astro` via `scripts/price-list-coverage.ts:190,207-217` | **Placebo.** The handler flips local `reqOverride[branch]` + toasts "Drafted… awaiting approval" but makes **no network call** — nothing persists to `price_refresh_request`; the "drafted" state vanishes on reload. **This is almost certainly the button you clicked.** | Wire the click to `POST /api/price-agreement/request-renewal` (the same persisted call the working "Request renewal" button uses); set `reqOverride` only on a 200; surface real errors. |
| 3 | **MED** | **Marketing department unreachable** — `lib/nav.ts` | `/marketing/hail-zones` and `/marketing/markets` routes return 200 but the **marketing department is absent from `nav.ts`**, so they can't be reached by clicking. | Add a marketing block to `nav.ts` (`status:'built'`) with both leaf items, matching the other departments. |

## Suspect (decide intent — not necessarily bugs)

| # | Surface | Note | Action |
|---|---|---|---|
| 4 | price-foundation **"Reopen"** (`review.ts`) | Persists, but reopening doesn't clear the prior `resolution`/`note`. | Decide semantics; if reopen should reset, null those fields in the upsert. |
| 5 | AuditQueue **KPI cards that navigate** (`audit-queue.ts:169`) | Navigate without a filter query param → destination shows unfiltered data. Cosmetic. | Append `?filterCol=&filterVal=` + read on init, or accept by-design. |
| 6 | **estimate-audit** (5 inputs) | Same root as #1 — all editable estimate fields are local-only. | Folded into fix #1. |

## Cleanup
- **`scripts/abc-price-gaps.ts`** — orphaned (imported nowhere); 5 latent triggers. Deprecate or wire.
- **~22 `" 2.astro"/" 2.ts"` iCloud duplicate files** — not real routes; delete.

## Verified-LIVE (dynamic, end-to-end with before/after Supabase + cleanup)
- **Invoice "Mark passed"** + 6 disposition actions → `invoice_line_audit` ✓ (tested: row written, then removed).
- **Agreement Builder** Save / Draft-for-review / Issue-link / public Submit → `agreement_package_*` ✓ (verified across slices 2-5 this session).
- **"Request renewal"** (price-agreement-audit) → `price_refresh_request` ✓ (wired, idempotent, auth-gated).
- **mark-paid**, **work-queue decision**, **territory assign**, **price-foundation resolve/reject/defer** → wired with per-step error handling; target tables/columns confirmed in the live DB (static+schema verified; full click-test ready on request).

## Audit matrix summary (dynamic-corrected)

| Surface | Triggers | Live | Dead | Suspect | Validator |
|---|---:|---:|---:|---:|---|
| home-territory | 16 | 16 | 0 | 0 | solid |
| invoice-audit | 30 | 30 | 0 | 0 | solid (mark-paid false-positive cleared) |
| estimate-audit | 13 | 8 | 0 | 5 | **edits local-only → fix #1** |
| order-audit | 14 | 14 | 0 | 0 | solid |
| price-agreement-audit | 8 | 8 | 0 | 0 | solid |
| agreement-builder | 12 | 12 | 0 | 0 | solid |
| agreement-submit | 5 | 5 | 0 | 0 | solid |
| price-list | 26 | 25 | **1** | 0 | **"Request Price List" placebo → fix #2** |
| price-foundation | 20 | 19 | 0 | 1 | solid |
| accounting-shell | ~17 | ~17 | 0 | 1 | solid (mark-paid cleared) |
| departments | 47 | 46 | 0 | 1 | marketing nav gap → fix #3 |
| snapshot-agents | 10 | 10 | 0 | 0 | solid |

**Totals: ~220 triggers · 2 confirmed dead (estimate non-persist, Request Price List) · 1 reachability
gap (marketing nav) · 2 cosmetic/semantic suspects · 3 static false-positives cleared by the dynamic pass.**

## Recommended fix order (on approval)
1. **#1 estimate persistence** (your stated requirement; highest value).
2. **#2 Request Price List** wire-up (the dead button you hit).
3. **#3 marketing nav** + **cleanup** (orphan script, `" 2"` dupes).
4. **#4/#5** suspects — confirm intent, then adjust.
Each fix re-tested with the same click → network → before/after-Supabase method.
