# 98 — Branch → office → agreement coverage audit (2026-08-19)

Follow-on from docs/97. Four questions from Chris, answered against prod.

## 1. "Shipping Branch" on the invoice PDF — is it in the API?

**Yes. It is the field we already key on.** The PDF's `Shipping Branch: 113 Wichita, KS
(316) 265-8276` is the API's `branch` object:

```json
"branch": { "number": "113", "name": "113 Wichita, KS", "city": "Wichita",
            "state": "KS", "postal": "67214-4015", "addressLine1": "1321 E 1st St N", "phone": "" }
```

Verified on the invoice in the screenshot (`2008759785-001`): `branch_number_extracted =
'113'`, matching the PDF exactly. No OCR is needed and none is performed for this field.

My earlier phrasing — "there is no Ship By Branch field" — was literally true of the field
*name* and unhelpful about the substance. ABC labels it `branch` in JSON and "Shipping
Branch" on the printed form; they are the same thing, and it is hop 0 of the pricing chain.
The only thing the PDF carries that the API does not is the branch **phone number** (the
API returns `""`).

## 2. Do SRS and QXO follow the same workflow as ABC?

**No — three materially different pipelines.** This matters because "the workflow" has been
described as if it were one thing.

| | ABC | SRS | QXO |
|---|---|---|---|
| ingest | **REST API** (`partners.abcsupply.com`) + CSV history | **PDF extraction** | **PDF extraction** |
| invoices | 1,089 (`abc_invoices`) | 90 (`vendor_invoices`) | 6 (`vendor_invoices`) |
| raw payload | full structured JSON | `{source_file, return_address, notes}` | `{file, source}` |
| branch key | `raw->'branch'->>'number'` → **number match** | `vendor_branch_id` **FK**, 90/90 | `vendor_branch_id` **NULL, 0/6** |
| agreements | `abc_price_agreements` / `abc_price_list_items` | `price_agreements` / `price_agreement_items` | same tables — **none exist** |
| office → agreement | `mv_office_agreement_versions`, **latest non-superseded version** as at the invoice date | direct join on `is_active` + `effective_date <=` — **no supersession logic** | n/a |
| can price today | yes | yes | **no** |

Three asymmetries worth fixing:

1. **QXO invoices carry no `vendor_branch_id`** (0 of 6). The vendor arm of
   `v_invoice_audit_invoice` joins `vendor_branches ON vb.id = vi.vendor_branch_id`, so QXO
   resolves no branch → no office → no price, even if agreements existed.
2. **SRS has no version-supersession rule.** ABC picks the latest non-superseded version of
   an agreement number for the office as at the invoice date. SRS takes any active
   agreement with `effective_date <= invoice_date`, ordered by UOM match then *lowest
   price*. A superseded SRS agreement can therefore win.
3. **QXO has no agreements at all** (see §4).

## 3. Match on `branch.storefront` — do SRS and QXO have the same key?

**No, and it would not solve the collision.** Verified:

- `storeFront` / `branch.storefront` is present on ABC records and is **always the constant
  `"abc"`** — 676 invoices and all 3,178 orders. It identifies the API you called, not the
  vendor of a given branch.
- SRS and QXO are **PDF-sourced**. Their `raw` is a file pointer; there is no storefront, no
  branch object, no structured vendor key.

So storefront cannot police the ABC↔QXO branch-number collision, because QXO never comes
through that API. The structural key is our own `vendors.id` FK on `vendor_branches` and
`vendor_invoices` — which is exactly what migration 238 enforces. Retracting my earlier
suggestion that storefront would make the silo structural: it would not.

## 4. Are branches 472, 184, 516 outside the 2-hour window?

**No — and my earlier read was wrong twice over.** Those were **QXO's** rows. ABC had **no
row at all** for those numbers, which is precisely why the unscoped lateral reached for
QXO's. Five ABC branch numbers appear on real invoices with no `vendor_branches` row:

| ABC branch | inside a 2h isochrone? | invoices | value |
|---|---|---:|---:|
| 472 Lenexa, KS | **yes — Kansas City, MO** | 1 | −$422.14 |
| 184 Conley, GA | **yes — Atlanta (Jonesboro), GA** | 1 | $2,477.60 |
| 516 Doraville, GA | **yes — Atlanta (Jonesboro), GA** | 2 | $1,302.79 |
| 519 Smyrna, GA | **yes — Atlanta (Jonesboro), GA** | 2 | $1,446.51 |
| 036 Longview, TX | no — outside every boundary | 1 | $145.74 |

Fixed by **migration 239**: backfilled from the ABC branch master with office assignment
computed by `ST_Contains` against each office's stored isochrone. Not hand-assigned.

### The wider audit — every covered branch vs. its office's agreement

Every branch **already in** `vendor_branches` and inside a 2-hour boundary is assigned to an
office — 0 gaps across all three vendors (ABC 68, QXO 59, SRS 38). The gap is one level up:
**8 of 15 (office × vendor) pairs have covered branches and no agreement at all.**

| office | vendor | covered branches | agreements |
|---|---|---:|---:|
| Atlanta (Jonesboro), GA | ABC | 19 | **0** |
| Atlanta (Jonesboro), GA | QXO | 12 | **0** |
| Atlanta (Jonesboro), GA | SRS | 11 | **0** |
| Denver (Greenwood Village), CO | QXO | 14 | **0** |
| Kansas City, MO | QXO | 13 | **0** |
| Kansas City, MO | SRS | 3 | **0** |
| Richardson, TX | QXO | 15 | **0** |
| Wichita, KS | QXO | 5 | **0** |
| Denver | ABC | 16 | 3 |
| Denver | SRS | 10 | 1 |
| Kansas City, MO | ABC | 9 | 1 |
| Richardson, TX | ABC | 23 | 2 |
| Richardson, TX | SRS | 17 | 1 |
| Wichita, KS | ABC | 7 | 4 |
| Wichita, KS | SRS | 2 | 1 |

Two headlines:

- **QXO has zero agreements at every office** — 59 covered branches with no negotiated book.
- **Atlanta has zero agreements for any vendor** — 42 covered branches. $5,226.90 of ABC
  spend across 5 invoices already sits there and cannot be audited.

Also: the **Euless, TX** office has **0 branches assigned** to it at all. *(Resolved
2026-08-20: permanently closed — see the addendum.)*

The four newly-covered branches still price as no-price, and correctly so: Atlanta has no
agreement, and the Lenexa invoice's three items (`02MLVIA3HE`, `GGA2620TB`, `SGDE185TB`) are
simply not on the Kansas City agreement — an item-coverage gap, which is what the Agreement
Gaps queue exists to work.

## What to do next, in order

1. **Get an ABC agreement on file for Atlanta.** 19 covered branches, $5.2k already invoiced
   and un-auditable.
2. **Decide what QXO is.** 59 covered branches, 6 PDF-extracted invoices, no agreements, no
   branch FK. Either it is a real vendor to negotiate and wire up, or its branches should not
   be marked covered.
3. ~~Populate `vendor_branch_id` on QXO invoices~~ — **done, migrations 240/242.** All 3
   resolve: DENTON → Denton Branch (Richardson, TX), SALINA → Salina Branch- Mw
   (Wichita, KS), WICHITA → 986 Wichita Branch (Wichita, KS), the last by Chris's decision
   over an ambiguous pair.
4. ~~Give SRS the same version-supersession rule as ABC~~ — **done, migration 241.** Guard
   only; SRS has one version per number today, fingerprint unchanged.
5. **Euless, TX has no branches** — confirm the office is real and in use.
6. Re-run this audit whenever a branch is added; the queries are in this doc's git history.


## Addendum — branch identity is now resolved at ingest (migrations 240–244)

Chris asked whether to mint a PE UUID per branch. **We already have one:**
`vendor_branches.id`. A second PE-side uuid would be pure indirection and would not have
prevented any bug found this week. The defect was never a missing identifier — it was
resolving vendor **text** at **query time**. The data made the case:

| vendor | resolved to our uuid... | identity bugs |
|---|---|---|
| SRS | at **ingest** (FK on 90/90 invoices) | **none** |
| ABC | at **query time**, by branch number | bled into QXO's rows (mig 238) |
| QXO | never — only a scraped city string | could not resolve at all |

So the work was to give ABC and QXO what SRS already had:

- **`vendor_branch_alias`** (240) — a vendor's label → `vendor_branches.id`, resolved once
  and recorded. A CHECK enforces `status='resolved' ⇒ FK NOT NULL`, so a guess cannot
  become a fact. Ambiguity is stored *as* ambiguity with the candidates attached.
- **`abc_invoices.vendor_branch_id`** (243) — the FK ABC never had; 1,089 of 1,089 backfilled.
- **Ingest triggers** (243) on `abc_invoices` and `vendor_invoices` — a new invoice resolves
  its branch on the way in. An unknown label leaves the FK NULL → no office → no price,
  which is correct fail-closed behaviour and visible, instead of silently borrowing
  whichever vendor's row shared the number.
  *Trap:* `branch_number_extracted` is a STORED generated column and is not populated during
  a BEFORE trigger — the trigger reads `raw->'branch'->>'number'` directly.
- **Views switched to the FK** (244), after proving equivalence: the FK yields the identical
  office as the old text join on all 1,089 invoices, 0 disagreements. `at_risk` and row count
  unchanged; the only display delta is the 3 QXO invoices gaining a real branch and office.

**Nothing joins on a vendor's branch text any more.** Adding a new vendor that reuses ABC's
numbering is now a data problem (rows in `vendor_branch_alias`), not a correctness risk.

Where a *new* identifier would earn its keep — and it is not a branch uuid — is a **physical
location** entity that several vendor branches map to (a site changing hands between vendors,
or two vendors' branches treated as one supply point). Nothing in the data needs that today.


## Addendum 2 — decisions recorded 2026-08-20 (migration 245)

Chris ruled on three of the open items. They are now **data, not report text** — the audit
above is a standing view, `v_office_vendor_agreement_coverage`.

### Euless, TX is permanently closed

Richardson, TX is the only DFW office. `office.is_active = false`; the isochrone is retained
so history still resolves. Safe to close: 0 branches assigned, 0 suggested, 0 agreements, and
of the 51 branches inside its boundary, 49 are also inside Richardson's.

Nothing in the codebase gated on `office.is_active`, so closure alone would not have stopped
a future assignment picking Euless. Added `office_for_point(lon, lat)` — **active offices
only** — as the one way to ask the containment question from now on.

**One consequence, flagged rather than decided.** The two **Wichita Falls, TX** branches
(ABC + QXO 249) were auto-assigned to Richardson *through the Euless isochrone* and carry no
human territory decision. With Euless closed they sit inside no active 2-hour boundary. Their
assignment is left as-is — no coverage change today — but an automated re-sweep would drop
them to `out_of_boundary`. **Needs a keep-or-drop ruling.** Both rows are annotated in
`vendor_branches.notes`.

(The two **Austin, TX** ABC branches are also outside every boundary, but they carry
`territory_decided_by = 'Chris Hussey'` from 2026-06-10 — deliberate overrides, unaffected by
this closure.)

### Posture recorded per (office, vendor)

New table `office_vendor_agreement_status`: `active` · `pending` · `no_book` · `not_pursued`.

- **Atlanta × ABC → `pending`.** 19 covered branches; $5,226.90 already invoiced and
  un-auditable until a book exists.
- **QXO × all 5 active offices → `no_book`.** 12 + 14 + 13 + 15 + 5 = **59 covered branches**,
  known and accepted. QXO lines price as no-price **by design, not by defect** — that
  distinction is now recorded, so the surface stops reading as a bug.

### Still unruled

Eight pairs remain `unrecorded`. Six of them have a live agreement and only need the status
backfilled for tidiness. **Two have no book and no ruling:**

| office | vendor | covered branches | live agreements |
|---|---|---:|---:|
| Atlanta (Jonesboro), GA | SRS | 11 | 0 |
| Kansas City, MO | SRS | 3 | 0 |
