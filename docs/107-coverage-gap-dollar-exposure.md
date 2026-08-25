# 107 — Rank coverage gaps by dollars, not by branch count

**Initial date:** 2026-08-20 · **Last updated:** 2026-08-24 · **Migrations:** 281, 282, 283, 284, 285 · **Ticket:** PEC-221

## The problem

`v_office_vendor_inheritance` already knows which (office × vendor) pairs have **zero priced
items** — `priced_items = 0` — and the Agreement Builder renders that as a gap count.

Read that metric precisely: it means the pair **cannot be audited through the office-ring
path**, not that no agreement exists. Denver × SRS carries two live agreements and still reads
zero, because neither is reachable. Whether an agreement exists, and whether a human has
accepted its absence, are separate facts held in `office_vendor_agreement_status`.
But the count treats every gap alike, and they are not alike.

```text
9 coverage gaps          <-- what the dashboard said
   |
   +-- 6 with ZERO invoices ever      $0        territory-only, nothing to chase
   +-- 3 with real purchasing        $28,362    money leaving un-audited today
```

Ranking by branch count actively misleads: Atlanta × ABC has **19** branches in the ring and
$5,226.90 of spend, while Denver × SRS has **7** branches and **$17,437.63**. The biggest
branch count was the smallest exposure.

This also corrects the priority recorded on 2026-08-19, which named Atlanta × ABC as the next
agreement to chase. Denver × SRS is 3.3× larger and was not on that list at all.

## Live exposure at time of writing

| Office × vendor | Invoices | Un-audited spend |
|---|---:|---:|
| Denver (Greenwood Village), CO × SRS Distribution | 4 | $17,437.63 |
| Wichita, KS × QXO | 2 | $5,697.47 |
| Atlanta (Jonesboro), GA × ABC Supply Co. | 5 | $5,226.90 |
| Richardson, TX × QXO | 1 | −$3,723.59 (net credit) |
| *five other pairs* | 0 | $0.00 |

Plus spend on branches with **no pricing territory** — outside the audit entirely, and
previously invisible in any surface. **$26,848.33 across 24 invoices** when first measured;
**$27,566.56 across 26 invoices** after migration 249 (a parallel session) dropped Wichita
Falls and Austin out of boundary. The delta is exactly the two Austin invoices leaving
Richardson's territory (−$718.23 there, +$718.23 here), so nothing was lost — the money moved
from a covered office into the honest "no office" bucket, which is the fail-closed behaviour
working as intended.

## Migration 281 — the two views

- `v_office_vendor_spend` — invoice count + spend per (office × vendor), resolved **only**
  through `vendor_branch_id` (migration 244's contract). Join it to
  `v_office_vendor_inheritance` on `(office_id, vendor_id)`.
- `v_unresolved_branch_spend` — spend that reaches no pricing office, split by cause.
  Fail-closed is correct, but it must stay *visible*, or money silently leaves the audit.

A useful result from the second view: `no_branch_resolved` returns **zero rows**. Every
invoice in the system resolves a branch — migration 243's ingest-time resolution is holding
at 100%. All the unresolved money is `branch_has_no_office`, a territory question, not an
identity one.

## Migration 282 — the address was never missing

The single largest un-audited bucket was ABC branch **176**: 11 invoices, **$19,356.94**, on
a branch row with no city and no state. It could never geocode, so it could never land in a
territory ring, so it could never be priced.

Per CONVENTIONS *structured source before OCR*, the address was already in
`abc_invoices.raw->'branch'`:

| Branch | Recovered from raw | Note |
|---|---|---|
| 176 | Webster, TX — 333 Tristar Dr | Houston area |
| 183 | Nolanville, TX | Killeen area |
| 305 | Sherman, TX — 2325 N Travis St | **~60 mi from the Richardson office** |

Branch 305 may well sit *inside* Richardson's drive-time ring; it reads `out_of_boundary`
today only because it had no coordinates to test. No invoice parser was needed to learn this.

**Trap worth remembering:** the payload is not uniformly rich. 10 of branch 176's 11 invoices
carry only `{"name":"176A","number":"176"}`; exactly **one** carries the full address. Taking
the newest invoice recovers nothing — the migration picks the **richest** payload per branch
(longest `addressLine1`).

7 of 23 city-less branches were recoverable this way; the other 16 have no address in any
payload and stay `no_address` — honestly unknown rather than guessed.

### Why this stops at geocoding

Migration 282 fills facts (`city`, `state`, `address`) and flips those rows to
`geocode_status = 'pending'`. It deliberately does **not** set
`pricing_territory_office_id`: territory is a human decision
(`vendor_branches.territory_decided_by`), and geocoding has to run first regardless.

Next action: `node scripts/geocode-vendor-branches.mjs` (needs `GOOGLE_MAPS_SERVER_KEY`),
then review whether 305 lands in Richardson's ring.

## A note on branch-number collisions

Both 176 and 305 exist **twice** in `vendor_branches` — 176 is Webster TX *and* Ogden UT;
305 is Sherman TX *and* Harrisburg PA. This is precisely the collision that text-based branch
matching resolved wrongly before migration 244. The FK path handles it correctly: the
invoices attach to the right row, and enriching one row cannot corrupt the other.

## Command Center

`price-agreement-coverage.ts` now carries `invoiceCount` / `spend` per vendor and
`gapsWithSpend` / `unauditedSpend` / `unresolvedSpend` in totals. The gap pill reads
*"No agreement — $17,437 un-audited (4 inv)"* where there is spend, and the muted
*"No agreement — no spend yet"* where there is not.

`gapExposure()` is exported as a pure function and unit-tested (5 cases, including the credit
memo that nets rather than adds).

---

## Addendum — reconciling with migration 245, and what it uncovered

Migration 245 (`office_closure_and_agreement_status`) landed from a parallel session two
minutes before this work, and answers the other half of the question. Parallel sessions then
also claimed **246** (`settle-received-credit-memo-lines`), so this work was renumbered to
**250–253**; main is canonical and a feature branch yields. The applied labels in the DB still
read `245_…`/`246_…`/`248_…`/`249_…`, which is cosmetic — Supabase keys migrations by
**timestamp**, and 250–253 were all applied (10:57–11:11 UTC) *before* the file numbered 246
existed. Applied order is unchanged.

- **245 says WHY** a pair has no agreement — `no_book | pending | not_pursued | unrecorded`
- **268 says HOW MUCH** it costs — `invoice_count`, `spend`

Neither alone supports a decision. Chris ruled **QXO `no_book` at all five offices** on
2026-08-20: QXO lines price as no-price *by design*. Ranked on dollars alone, Wichita × QXO
($5,697.47) reads as work to chase — it is not. **Migration 270** joins the two so the
surface can never make that mistake.

### Migration 284 — the gate was asking the wrong question

283's `needs_ruling` keyed off `live_agreements = 0` — *does the paperwork exist*. That is
wrong, and it hid the largest un-triaged pair in the system:

> **Denver × SRS has a live, in-territory, 22-item agreement that the office ring cannot
> reach, so the coverage surface reports `priced_items = 0` for the pair.**

284 re-gates on `priced_items` — *can this pair actually be audited* — which is the question
that matters. The queue is now two rows: Denver × SRS ($17,437.63 of spend, `unrecorded`) and
Atlanta × ABC ($5,226.90, `pending`).

#### Correction — what "prices nothing" does and does not mean

An earlier version of this doc said the pair "prices nothing — $17,437.63 audits as
no-price". **That overstated it**, and migration 248 from a parallel session (SRS re-audit
provenance) is what surfaced the error. `priced_items = 0` is a fact about the **office-ring**
path only. A separate **line-level** path still prices some lines. Measured on the four
Denver × SRS invoices:

| | Lines | Line value |
|---|---:|---:|
| Total | 34 | $15,760.85 |
| Carry a negotiated price | 11 | $2,296.05 |
| **Carry none** | **23** | **$13,464.80** |
| Carry an agreement citation | **0** | — |

So the honest figure is **$13,464.80 of line value un-priced**, not $17,437.63. (The gap
between $15,760.85 of line value and $17,437.63 of invoice total is tax, freight and similar.)

Two things remain true and are worth more than the headline was: the ring genuinely cannot
reach the agreement, and **the two pricing paths disagree with each other** — one reports the
pair as entirely unpriced while the other prices 11 of its lines. That disagreement, not the
dollar figure, is the defect. The zero agreement citations are the SRS-only gap migration 248
repairs.

### Root cause: the last text-based branch match

`v_office_vendor_branch` still resolves agreements by branch-number **text**:

```sql
JOIN vendor_branches vb ON vb.geom IS NOT NULL AND st_contains(o.boundary, vb.geom)
LEFT JOIN v_vendor_agreement_current ag
       ON ag.vendor_id  = vb.vendor_id
      AND ag.branch_key = NULLIF(regexp_replace(vb.branch_number,'^0+',''),'')
```

This is the last survivor of the text matching migration 244 removed from the pricing and
display paths, and it needs **both** halves to line up: the branch must be geocoded to appear
in the ring at all, *and* the agreement's `branch_key` must equal that geocoded row's
`branch_number`.

SRS South Denver exists as **two rows for one physical branch**:

| Row | Address | Geocoded | Holds agreement |
|---|---|---|---|
| `AMSDE` | none | ✗ (pending) | ✓ the 22-item book |
| `SBP-SOUTHDENVER` | 4393 S. Santa Fe Drive | ✓ 6.1 mi | ✗ |

Different numbers, so the join never meets.

### The latent risk is bigger than the one office

> ⚠️ **SUPERSEDED — figures below are the 2026-08-20 measurement.** As of 2026-08-24 this is
> **4 agreements / 247 items**, and `AMSDE` alone holds **128** of them, not 22. The archived
> duplicate rows described further down have since been tidied away. Do not size the Denver
> repair from this table — see *Addendum, 2026-08-24* at the end of this document.

`v_agreement_unreachable` (migration 284) showed, on 2026-08-20, **all three live numbered SRS
agreements — 136 items — unreachable**, each held by an ungeocoded row with an obvious twin:

| Agreement | Items | Held by | Likely canonical |
|---|---:|---|---|
| SRS-MELISSA-L4 | 97 | `SSMEL` | `SBP-MELISSA` |
| 0049345641 | 22 | `AMSDE` | `SBP-SOUTHDENVER` |
| 0049828559 | 17 | `DJWIC` | `SBP-WICHITA` |

Richardson and Wichita still price **only because archived duplicate agreement rows**
(`[ARCHIVED 2026-08-05: duplicate of the numbered agreement row]`) happen to reach the ring.
Denver is not a special case — it is the one where that accidental crutch is missing. **If
those archived rows were ever tidied up, Richardson and Wichita SRS would silently stop
pricing too: 114 further items.**

**Trap for whoever fixes this:** `v_office_vendor_branch.agreement_id` is a mixed-type text
column — ABC agreements appear as legacy **integer** ids (`'105'`, `'8'`), SRS as uuids.
Casting either direction throws `invalid input syntax for type uuid: "105"`. Compare as text
against both `price_agreements.id` and `price_agreements.legacy_id`.

### Deliberately not fixed here

Repointing the agreement join to `vendor_branch_id` is pricing-affecting and earns the same
equivalence proof migration 244 ran before switching (FK == text on every row, 0
disagreements, fingerprint unchanged). Merging the duplicate branch rows is a branch-identity
decision for a human — `vendor_branch_alias` (migration 240) already encodes that boundary:
a guess cannot become a fact. 284 only makes the failure visible.

---

## Addendum — 2026-08-21: the fresh Colorado book landed, and still does not price

Migration 251 (a parallel session) stored the **SRS Colorado price list, effective 2026-08-14,
101 items** — the book that handoff blocker 1 had been waiting on. It is now the recorded
governing book for the Denver office. **Denver × SRS still reports `priced_items = 0`.**

It attached to **`AMSDE`** — the same branch row this document identified as unreachable by
the office ring. `v_agreement_unreachable` picked it up on the first run after the merge:

| Agreement | Items | Held by | Likely canonical |
|---|---:|---|---|
| SRS Colorado price list 2026-08-14 | **101** | `AMSDE` | `SBP-SOUTHDENVER` |
| SRS-MELISSA-L4 | 97 | `SSMEL` | `SBP-MELISSA` |
| 0049345641 (Englewood quote) | 22 | `AMSDE` | `SBP-SOUTHDENVER` |
| 0049828559 | 17 | `DJWIC` | `SBP-WICHITA` |

Ring-unreachable SRS items: **136 → 237**.

### There are TWO independent reasons it does not price

The migration's own note records the first: *"Description-only — carries no SRS item numbers,
so it does not yet resolve invoice lines."* True, and it concerns the **line-level** path.

The second is the one this document is about: the **office-ring** path cannot reach `AMSDE` at
all, so the pair reads `priced_items = 0` regardless of what the book contains.

**Fixing either one alone leaves the book inert.** Add item numbers and the ring still cannot
see it; repoint the branch and it still has no item numbers to match. Anyone scheduling this
work should plan both, or the fresh sheet keeps looking like it did nothing.

This is the detector doing its job: a correct business action (load the price list Chris
asked for) ran straight into an unfixed identity defect, and the failure was visible
immediately instead of being discovered later as "why is Colorado still no-price".

### Note — migration 253's SRS branch aliases do NOT fix this

Migration 253 (a parallel session) seeded `vendor_branch_alias` with SRS branch codes for the
first time. It is easy to read that as "branch identity is handled now". It is not, for two
reasons, both verified after merging:

1. **`AMSDE` is not in the seed.** It covers `DJWIC`, `SSMEL`, `SSCOP`, `AMDEN`, `SHCOL`.
2. **It is a different mechanism.** `vendor_branch_alias` resolves an *invoice's* branch code
   to a canonical branch row at ingest (mig 243's fail-closed path). The defect in this
   document is in the *agreement* → branch join inside `v_office_vendor_branch`, which reads
   `vendor_branches.branch_number` as text and never consults the alias table at all.

Re-measured after the merge (2026-08-21): Denver × SRS still `priced_items = 0`,
`needs_ruling` and `agreement_not_reaching` both true; `v_agreement_unreachable` returned
**6 agreements / 237 items** at that point. *(Superseded: 4 agreements / 247 items as of
2026-08-24 — see the final addendum. The `priced_items = 0` result has held throughout.)*

### Correction to a stated invariant — territory alone is not enough

The 2026-08-21 handoff records this architecture rule:

> `pricing_territory_office_id` decides. Anchor a new agreement to any branch in the right
> territory and it covers all of them.

**That is not sufficient, and PEC-226 is planned on it.** `v_office_vendor_branch` requires
the branch to be **geocoded** before territory is even consulted:

```sql
JOIN vendor_branches vb ON vb.geom IS NOT NULL AND st_contains(o.boundary, vb.geom)
```

and *then* matches the agreement by branch-number text. Verified against prod on 2026-08-21:

| Branch | Territory set | Geocoded | In ring |
|---|---|---|---|
| `AMSDE` (holds both Denver books) | Denver ✓ | ✗ | **false** |
| `SSMEL` (holds SRS-MELISSA-L4) | Richardson ✓ | ✗ | **false** |
| `SBP-SOUTHDENVER` | Denver ✓ | ✓ | true |
| `SBP-MELISSA` | Richardson ✓ | ✓ | true |

Both agreement-holding rows carry the right territory and are still invisible to the ring.

**Consequence for PEC-226:** that task backfills `raw_item_number` on the Melissa and Colorado
sheets — the *line-level* half. Melissa should start pricing afterwards, because an archived
duplicate agreement already reaches the ring through the geocoded twin `SBP-MELISSA`.
**Colorado has no such twin, so it will stay at `priced_items = 0`** until the branch identity
is resolved. Anyone running PEC-226 should expect that split result rather than treating it as
a failed backfill.

### Outcome — PEC-226 ran on 2026-08-21, and the prediction held

Migration 256 executed the exact-token backfill. Measured against prod immediately after:

**Denver × SRS is still `priced_items = 0`**, with `needs_ruling` and `agreement_not_reaching`
both still true. That is what this document predicted: PEC-226 addresses the line-level half,
and the Colorado book's other blocker — hanging on the ring-invisible `AMSDE` — was untouched.

The backfill also matched far less than hoped, which is a separate finding worth recording:

| Sheet | Items | Got a `raw_item_number` |
|---|---:|---:|
| SRS Colorado price list 2026-08-14 | 101 | **4** |
| SRS Melissa TX Level 4 | 97 | **4** |

Exact-token matching found **8 items across both sheets**. PEC-226's own headline metric moved
accordingly: SRS unpriced lines **216 → 211**. (Unpriced *value* reads $63,642.53 → $64,013.53,
but that is more SRS invoices being ingested in the same window, not the backfill making
anything worse.)

**So the $63k gap is still open, and neither half alone will close it.** The options that
remain are the trigram arm PEC-226 listed as its alternative, resolving the branch identity,
or — most likely — both. Worth noting before anyone re-runs the backfill expecting a
different result: exact-token on description-only sheets is close to a no-op, and the
Colorado sheet cannot price from the ring regardless of how many item numbers it gains.


## Addendum — 2026-08-21: a defect migration 282 introduced, and 4 rows a human should look at

Migration 282's `geocode_status` assignment was keyed on the wrong condition. It read:

```sql
WHEN vb.city IS NULL AND rb.b->>'addressLine1' IS NOT NULL THEN 'pending'
```

Two problems, both from testing `vb.city IS NULL` rather than "did this row gain location
data and does it still lack a geom":

1. **It demoted already-geocoded rows.** A branch that had a `geom` but a NULL `city` was
   flipped from `ok` to `pending` — re-queueing a perfectly good geocode. The applied run
   did this to **branches 21 (Raleigh NC) and 684 (Norman OK)**, both stamped
   `2026-08-20 10:59:17+00`, which is migration 282's run.
2. **It missed address-only recovery.** A branch whose `city` was already set but whose
   `address` was NULL would gain an address and keep its old status — so a row that had
   become geocodable stayed marked `no_address` and was never picked up. This matches
   **0 rows in prod today**, so it is latent, not active.

The file is corrected to gate on `vb.geom IS NULL` plus the **same per-field replacement
condition the `WHERE` clause uses** — city, state or address individually. An earlier pass at
this fix used a looser `(city IS NULL OR address IS NULL)`, which still missed **state-only**
recovery: a branch with city and address but a NULL state would gain a state and never be
queued. Keeping the CASE textually identical to the WHERE, plus the geom guard, is what makes
that class of gap impossible — anything that qualifies a row for update is exactly what should
queue the geocode.
**The corrected statement matches 0 rows against current prod data** — verified before
committing — so it is a proven no-op and was not re-applied. It changes behaviour only for
future reruns, which is the point: the migration is meant to be rerunnable.

### Not repaired: 4 geocoded rows marked `pending`

The invariant everywhere else is `geom IS NOT NULL` ⇒ `geocode_status = 'ok'` (1,752 rows).
Four rows violate it:

| Branch | City | `updated_at` | Attributable to |
|---|---|---|---|
| 21 | Raleigh NC | 2026-08-20 10:59:17 | migration 282 |
| 684 | Norman OK | 2026-08-20 10:59:17 | migration 282 |
| 39 | Austin TX | 2026-08-21 13:04:57 | a different process |
| 465 | Austin TX | 2026-08-21 13:04:57 | a different process |

**Deliberately left alone.** `pending` on a geocoded row is ambiguous: it can mean "demoted
by the bug above", or it can mean "a process deliberately queued this for re-geocoding
because its address changed". For 39 and 465 — touched at 13:04 by something this session
does not own — flipping them back to `ok` could silently cancel a queued re-geocode. Per
migration 240's boundary, *a guess cannot become a fact*. Resolving these is a human call:
confirm whether the 13:04 run intended a re-geocode, then set all four to `ok` if not.

## Addendum — 2026-08-22: the backdate removed a THIRD gate, and Colorado still does not price

Migration **267** (`srs-colorado-price-list-backdate`, from a parallel session) moved the
Colorado list's `effective_date` to 2026-06-01. The audit gates on
`pa.effective_date <= vi.invoice_date`, and the list had been stamped 2026-08-14 while every
Colorado SRS invoice runs 2026-06-18..2026-07-16 — so the book reached nothing on dates alone.

That is a **third** independent blocker, on top of the two this document already recorded:

| # | Blocker | Fixed by | Status |
|---|---|---|---|
| 1 | line-level: missing `raw_item_number` | mig 256 backfill, then PEC-226 (mig 266) | addressed |
| 2 | office-ring: book hangs on `AMSDE`, which the ring cannot see | **nothing yet — needs a human** | **open** |
| 3 | effective-date gate: list dated after every invoice | mig 267 backdate | addressed |

**Re-verified against prod after merging main (2026-08-22):**

- **Denver × SRS is still `priced_items = 0`.** The prediction in the 2026-08-21 addendum
  holds: clearing the line-level and date gates does not make the Colorado book price,
  because blocker 2 is untouched and independent.
- `v_agreement_unreachable` is still **6 agreements**, but items rose **237 → 247**. PEC-226
  approving candidates *added* items to books the ring still cannot reach, so the latent
  exposure grew rather than shrank. Fixing the item data without fixing reachability moves
  the number the wrong way.
- Chase queue unchanged at 2 rows / $22,664.53; unresolved spend unchanged at $27,566.56.

**The one open decision is unchanged and now carries more weight:** confirm `AMSDE` ==
`SBP-SOUTHDENVER`, or approve repointing the agreement join to `vendor_branch_id` with mig
244's equivalence proof. Two of the three gates are now closed; this is the only one left.

---

## Addendum, 2026-08-22 (2) — access posture and two standing assumptions

### Migration 285: the coverage views were world-readable

The Cursor security review flagged that the four views added by 281–284 carry no
`GRANT`/`REVOKE`, and prod confirmed it. As role `anon`:

```sql
BEGIN;
  SET LOCAL ROLE anon;
  SELECT current_user;                                            -- anon  <- prove the role took
  SELECT count(*), sum(spend) FROM public.v_office_vendor_spend;  -- 10 rows, $2,269,526.34
ROLLBACK;
```

`SET LOCAL` only lives inside a transaction. Send it as a bare statement in an autocommit
session and it is discarded before the `SELECT` runs, so the query silently executes as
your *own* role and a privileged connection reports rows the target role could never see —
a false negative that reads exactly like a clean result. **Always select `current_user` in
the same transaction**; assert the role rather than assuming it. The independent check that
needs no role switch at all is `has_table_privilege('anon', 'public.<view>', 'SELECT')`.

A view runs as its **owner** unless `security_invoker` is set, so RLS on the underlying
invoice tables never applied. Aggregated office × vendor spend and agreement-ruling
metadata were readable through PostgREST with the publishable key — outside the
WorkOS gate.

**Migration 285** revokes `anon`/`authenticated` and grants `service_role` on all four,
copying the `v_price_list_global` shape. Verified in both directions; `service_role` still
returns all 10 rows. The Command Center is unaffected because every reader goes through
`createServerSupabaseClient` (`SUPABASE_SERVICE_ROLE_KEY`); no browser code touches these
views.

**Still open, deliberately out of scope:** `v_office_vendor_branch` and
`v_office_vendor_inheritance` are anon-readable on the same default grants. They predate
this work and expose territory mapping rather than dollars, so they were flagged rather
than changed. **Needs a human decision.**

> **Rule worth generalising:** a new view in `public` inherits default grants. Deciding its
> audience is part of writing it, not a follow-up. Check `has_table_privilege('anon', …)`
> before calling a view done.

### Standing assumption: ABC branch payloads are bimodal

Migration 282 picks the branch payload with the longest `addressLine1`. A review asked what
happens if that payload lacks a `city`/`state` some other payload carries. Measured across
all 1,093 branch-linked invoices:

| Payload shape | Invoices |
|---|---:|
| full address block | 680 |
| name-only stub | 413 |
| **partial (mixed)** | **0** |

There is no partial payload, so the longest-address ordering always selects a full block and
city/state travel with it. The migration is correct **for this vendor's data shape**, not in
general. **If a vendor ever emits partial branch payloads, the correct shape becomes a
per-field `max()`** rather than one winning payload. 282 is already applied to prod, so it
was left alone rather than superseded by a migration that provably changes no row.

---

## Addendum, 2026-08-24 — re-verified after main landed migrations 268-280

Main shipped 13 migrations (ABC colour arm, the materialised audit line, item-aware version
supersession, credit memos). Re-measured against prod after merging:

| Metric | 2026-08-22 | 2026-08-24 | |
|---|---:|---:|---|
| `v_agreement_unreachable` agreements | 6 | **4** | consolidated |
| …items | 247 | **247** | unchanged |
| Chase queue rows / spend | 2 / $22,664.53 | 2 / $22,664.53 | unchanged |
| Denver × SRS `priced_items` | 0 | **0** | unchanged |
| Unresolved branch spend | $27,566.56 | $27,566.56 | unchanged |

**The count fell but the exposure did not.** The agreement count dropped 6 → 4 because the
archived duplicate rows were tidied away, exactly as this document warned they would be. The
item total did not move, and the composition shifted decisively toward Denver:

| Agreement | Held by | Items | Reason |
|---|---|---:|---|
| *(unnumbered)* | `AMSDE` | **106** | `branch_not_geocoded` |
| SRS-MELISSA-L4 | `SSMEL` | 102 | `branch_not_geocoded` |
| 0049345641 | `AMSDE` | 22 | `branch_not_geocoded` |
| 0049828559 | `DJWIC` | 17 | `branch_not_geocoded` |

`AMSDE` — the Denver branch at the centre of the open decision — now holds **128 unreachable
items**, up from 22. Every remaining row is SRS and every one fails for the same reason: the
branch is not geocoded, so the office ring cannot see it. `reason` is now uniformly
`branch_not_geocoded`; the archived-duplicate crutch this document flagged is gone.

**The prediction has now held across three independent rounds of other people's work** —
PEC-226's item backfill, main's mig 267 effective-date backdate, and this 13-migration set.
Denver × SRS is still `priced_items = 0`, because none of them touch the branch-identity
gate. That gate is decision 1 below, and it has grown from a 22-item question to a 128-item
one while waiting.
