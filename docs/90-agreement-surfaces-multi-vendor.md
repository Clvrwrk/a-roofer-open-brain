# 90 · Agreement surfaces → multi-vendor (PEC-196, 2026-08-09)

The agreement surfaces (Agreement Builder · Price Agreements · Price List Review)
get the same roster-driven multi-vendor treatment the CM pill got in docs/88.
This doc is the map: what is vendor-aware today, what is ABC-hardcoded, the
fail-closed guards shipped 2026-08-09, and how a future agent adds vendor N+1.

```
                 lib/cm-vendor-roster.ts — ONE roster, two status axes
                 { slug, label, acronym, cmStatus, agreementStatus }
                                     │
        ┌────────────────────────────┼─────────────────────────────┐
   agreementStatus:            agreementStatus:               agreementStatus:
      "live"                     "read_only"                   "coming_soon"
   (ABC today)                  (SRS today)                    (QXO today)
   full builder flow       coverage/worksheets/price       greyed everywhere,
   (ABC tables)            lists render via generic        "Coming Soon" tooltip
                           tables; builder send flow
                           refuses the slug (409)
```

## State of the world (2026-08-09 inventory, full detail in PEC-196)

- **Price Agreements page = the reference implementation.** `price-agreement-coverage.ts`
  and `price-agreement-management.ts` are fully vendor-aware: everything keyed
  `(office_id, vendor_id)`, dual-source items via `source: "abc" | "generic"`
  (`abc_price_list_items` int ids vs `price_agreement_items` uuids). Converge the
  other two surfaces on THIS pattern — do not invent a new discriminator.
- **Agreement Builder is ABC by construction.** Branch universe comes from
  `abc_vendor_branches` + `abc_price_agreement_branch_matches`
  (`agreement-package.ts:100-102`); every package row is stamped
  `vendor: "ABC Supply Co."`; NAM (`2036874`, Justin Garza) hardcoded in
  `agreement-builder-overview.ts:16-19` and the package/PDF/handoff endpoints.
  `normBranch` leading-zero stripping would MERGE colliding branch numbers across
  vendors — any rebuild must key branch maps by `(vendor_id, branch_number)`.
- **Price List Review is vendor-blind at the schema level.**
  `price_list_pdf_staging` has NO vendor column; `review/promote.ts` writes
  straight into ABC tables and resolves ship-tos via `like('2036874%')`. A non-ABC
  PDF promoted there would become an ABC agreement — the worst mis-file found.

## Fail-closed guards shipped 2026-08-09 (this is why nothing can mis-file today)

| Endpoint | Guard |
| --- | --- |
| `review/promote.ts` | META entries carry `vendor`; non-`abc-supply` → 409 `vendor_not_supported` |
| `package/items.ts` | `vendorSlug` body param (default abc-supply); non-ABC → 409 |
| `package/handoff.ts` | same 409 gate (handoff emails the ABC NAM) |
| `package/issue-link.ts` | same 409 gate (token fallback recipient is the ABC NAM) |
| `request-price-list.ts` | bare `branchNumber` now REQUIRES `vendorSlug` and resolves `vendor_branch_id`; unresolvable → 404 fail closed (branch numbers collide across vendors, docs/87) |

Builder toolbar now renders the roster vendor strip: ABC active · SRS `↗` link to
the multi-vendor Price Agreements page (read_only) · QXO greyed "Coming Soon".
Greyed buttons keep pointer events (tooltip rule, docs/88).

## The rebuild (remaining, tracked as PEC-196 sub-gaps)

1. **B1 — staging vendor column:** `price_list_pdf_staging.vendor_slug` (additive
   mig), review UI shows it, promote branches by vendor.
2. **B2 — generic promote path:** non-ABC promote writes `price_agreements` +
   `price_agreement_items` (uuid ids) + vendor-scoped branch link, reusing the
   Surface-2 dual-source read pattern.
3. **B3 — builder vendor threading:** branch universe from `vendor_branches`
   per roster vendor; `agreement_packages` gains `vendor_slug` keyed writes; NAM/
   recipient per-vendor in the roster (add `nam` fields when B3 lands).
4. **B4 — killing `normBranch` collisions:** branch maps keyed
   `(vendor_id, branch)`; no leading-zero stripping without a vendor key.
5. **B5 — `request-renewal.ts` dual-id:** accept uuid agreement ids (generic)
   alongside ints (ABC).
6. **B6 — vendor_branches office backfill:** 12 ABC invoice branches lack
   `pricing_territory_office_id` (the PEC-193 dead-click cause; URL office
   fallback covers the UX today).
7. **B7 — Alex queue tab** (lands with PEC-195 once its A3 is approved).

## FUTURE AGENTS — adding vendor N+1 to the agreement surfaces

1. Confirm the vendor exists in `vendors` (slug is the silo key — never invent a
   spelling; docs/87).
2. Add the roster entry in `lib/cm-vendor-roster.ts` with
   `agreementStatus: "coming_soon"`. That alone puts the greyed button on the
   builder strip. **Touch nothing else.**
3. Load its agreements into the GENERIC tables (`price_agreements` +
   `price_agreement_items`, keyed `vendor_id` + office) — never into `abc_*`
   tables. Coverage/worksheets/price lists light up automatically
   (`v_office_vendor_agreements` drives them).
4. Flip to `read_only` once the Price Agreements page renders its coverage and
   the branch price list resolves through the live call path.
5. Flip to `live` ONLY when B1–B3 exist for that vendor (staged-PDF promote and
   builder package flow proven end-to-end, `silo_assertions()` = 0).

Falsehoods to avoid: "ABC classes" on the builder page = Pareto A/B/C inventory
classes, NOT the vendor — do not rename them (see `methodology.astro`).
