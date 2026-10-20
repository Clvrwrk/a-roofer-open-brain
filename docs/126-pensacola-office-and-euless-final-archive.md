# 126 — Pensacola, FL office + SRS SRPEN book; Euless final archive (2026-10-20)

```
545 Brent Ln, Pensacola FL ──120-min Routes isochrone──▶ office.boundary
        │                                                     │
        │                           assign_branch_territories()│ (simulated first: 10 changes, all here)
        ▼                                                     ▼
  region FL ◀─ office "Pensacola, FL" ◀─ pricing_territory_office_id ─ ABC ×3 · SRS ×2 · QXO ×5
                                                              │
  SRS invoice "Branch: SRPEN" ─alias─▶ SBP-PENSACOLA ─────────┤
                                                              ▼
                         price_agreements 484ede71 (anchored SBP-PENSACOLA, 27 SKUs, evergreen)
                         priced for every SRS branch whose office = Pensacola (SBP-MOBILE too)
```

## Pensacola (migs 327, 328)

| Item | Value |
|---|---|
| Office | `4a1d6c2e-0f3b-4e8a-9c27-5e1b8d3f6a90` "Pensacola, FL", brick_mortar, region `FL` |
| Coordinates | 30.474544, −87.222206 (US Census geocoder, exact address match) |
| Ring | 120 min, `google_routes_bearing_v1`, 24 bearings, mean radius ≈ 95 km |
| Covered branches | ABC: Pensacola ×2, Mobile AL · SRS: SBP-PENSACOLA (SRPEN), SBP-MOBILE · QXO: Pensacola, Milton, Mobile, Robertsdale AL, Gulfport MS |
| Posture | SRS = active · QXO = no_book · ABC = **unrecorded** (awaiting Chris) |
| SRS book | `484ede71-87b2-462f-b1cb-e2dc57619fda`, effective 2026-10-19, evergreen, 27 item-number rows, PDF `agreements/pensacola-srs-srpen-quotes-oct2026.pdf` |

Chris's rulings (2026-10-20):
1. "Two mile radius" meant the standard **2-hour drive-time** ring (a literal 2 miles would exclude SRPEN, ~7 mi away).
2. Conflicting quote prices → **latest quote wins**: GAF0699900TA $100/SQ (not $103), TOPTS381900 $11/EA (not $9).
3. **Evergreen**: the quotes' 30-day close date (2026-11-18) is documentary only.
4. **Scope**: anchored to SRPEN; every SRS branch assigned to Pensacola inherits the book.

Notes: SRS prints `SRPEN` on its documents, so a `vendor_branch_alias` row maps it to `SBP-PENSACOLA` (mig 253 pattern). Price UOM is the quote's pricing UOM (cap nails BX not BKT; 750 vent EA not PC). TAMPST is marked discontinued on the quote (replacement TAMSS, not yet priced). Silo check: a hypothetical SBP-MOBILE GAF0699900TA line prices at $100; an SBP-DENVER line does not.

## Euless, TX (mig 329)

Euless had been `is_active = false` since 2026-08-05, with 0 branches and 0 invoices resolving to it. Every former Euless-area invoice already prices through Richardson. Remaining leaks, now closed:
- `territory_snapshot()` returned every office with a boundary, inactive ones included, plus their candidate rows. It now returns active offices only.
- The offline map snapshot (`app/command-center/src/data/vendor-territories-snapshot.json`, June vintage) still drew Euless and lacked Atlanta. It was regenerated from the live RPC.
- `frequently_ordered_office_map` 'Wichita Falls TX' → Richardson (alternate; Fort Worth remains primary).

Candidate rows and the boundary polygon are retained as history (hard rule 1).

## Trap recorded

`assign_branch_territories()` (applied directly to prod as mig 194; not in the repo) sweeps **every** undecided branch nationwide and resets anything outside all active rings to `out_of_boundary`. Before calling it for a new office, simulate the diff (see the query in this session's log) and confirm the only changes are inside the new ring.
