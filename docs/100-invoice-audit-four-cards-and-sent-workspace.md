# 100 — Invoice Audit: 4 controls + 4 cards, and the Sent CM workspace (2026-08-21)

Executes the redesign proposed in the Invoice Audit teardown (docs/95 addendum), plus the
territory drops Chris ruled on.

## Toolbar: 10 controls → 4

| was | now |
|---|---|
| Search | **Search** (kept) |
| All PE offices | **All PE offices** (kept) |
| `☐ Show all` + `☑ To-audit only` + `☐ Due now` | **one segmented switch: To audit · Due now · All** |
| Invoice date range + All tolerance | **More filters ▾** (disclosure) |
| ● Supabase live · timestamp · theme trio | unchanged, moved to the right-hand chrome cluster |

The three checkboxes were three ways of answering one question — *which slice of invoices
am I looking at* — and you had to read all three states and know how they composed. The
switch makes the current answer readable at a glance.

**The checkboxes still exist, hidden.** They remain the single source of truth for
`applyFilter()`, so the tree logic, the Due-Now card button and any deep link work
unchanged; the switch only drives them. The Due-Now button clicks the switch rather than
setting `.checked` directly, because assigning `.checked` in code does not fire `change`
and the toolbar would silently disagree with the tree.

## Pills: 7 → 4 cards, grouped by the question

1. **Claim it** — owed but not yet asked for (CM drafts/approved + claim lines to review,
   vendor buttons, Process)
2. **Chase it** — asked for, not yet credited → **Chase in Sent CM**
3. **Pay it** — the three-step loop as a pipeline: `due now → verify → export`
4. **Fix it** — agreement gaps, labelled as data coverage rather than a work queue

Each card carries a coloured left edge so the four groups read apart at a glance.

### Two regressions I introduced and caught in the browser

Both came from the KPI refresh contract, which the 60s poll and every post-action refresh
rely on:

1. **The QB Export button was swallowing the Due-Now Filter button.** The refresh did
   `qbSub.closest(".iv-kpi").querySelector(".iv-process-btn")` — *the first button in the
   card*. That was Export in the old 7-pill layout; after merging the pay steps into one
   card it was **Filter ↓**, so the poll replaced Filter with an Export link. Fixed by
   targeting `[data-kpi-btn="qb"]` explicitly.
2. **The awaiting count was being wiped on first poll.** The refresh replaces the whole
   `innerHTML` of `[data-kpi-sub="awaiting"]`; I had nested `[data-kpi-val="awaiting"]`
   inside it. Fixed by separating them, matching the original contract.

Neither would have shown up in a build or a unit test — both needed the page open.

## Tree empty state

The tree had **no empty state at all**, so a filter matching nothing rendered a blank page.
That is the *default* view today: every open invoice has had its lines audited, so
"To audit" is legitimately 0. It now says so, and names the way out ("Switch to Due now or
All"), instead of showing nothing.

## The Sent CM workspace — `/accounting/credit-memos/sent`

An exact replica of the Weekly CM workspace, scoped to `status = 'sent'` instead of
`draft`/`approved`, with the language moved from *Request* to *Sent*. Same vendor grouping,
same email body, same line tables and reasoning, same received-credit triage panel, same
downloads (`?status=sent` added to `weekly-csv`; the default stays `approved` so Weekly's
downloads are byte-for-byte unchanged).

Differences, all forced by what "sent" means:

- **Per invoice it shows `sent` date and `follow-up` date**, with overdue in red and an
  overdue count on the vendor header.
- **Action is "Mark received"**, not Approve — it closes the request, so the invoice leaves
  the chase queue. Weekly's Approve moves a draft *into* the email; there is no equivalent
  once something is already out.
- **No drafts section** — nothing on this page is awaiting approval.

### One thing the page states on its face

**The email is rebuilt from today's audit lines.** No copy of the outbound message is
stored: `packet` on all 44 sent rows carries provenance keys only (`source`,
`line_added_at`, `line_added_by`), no HTML body. So this cannot be a replay of what was
emailed on 2026-08-09 — and docs/93's three-model re-audit revised some of those figures,
so a line here **can** differ from what the vendor received. The page says that in a banner
rather than implying it is a copy.

If an exact replay is ever needed, the fix is upstream: store the rendered email on the
request at send time.

## Territory drops (migration 249)

Chris's ruling. Wichita Falls (ABC + QXO 249) and Austin (ABC 39, 465) are **out of
boundary**.

- Wichita Falls had been auto-assigned to Richardson *through the closed Euless isochrone*
  (migration 245) with no human decision. 0 invoices, 0 agreements — nothing detached.
- Austin were Chris's own overrides from 2026-06-10, now reversed. One invoice each, both
  already no-price shop supplies (`S.S.TOOLS` $645.16, `TRUCK 102` $73.07) — **no dollar
  figure moves.**

After this, **no covered branch sits outside an active 2-hour isochrone** —
`office_for_point()` and `pricing_status` agree everywhere.

## Deviation from the proposal, stated

The teardown proposed retiring the page-local theme trio to the app shell. The trio lives
on **six** surfaces (invoice-audit, friday-wip, price-agreement/builder, order-audit,
estimate-audit, AuditQueue) and `AppShell` has no theme control at all, so removing it here
alone would strand this page. It stays, moved into the right-hand chrome cluster. Promoting
theme to the shell is a six-surface change and belongs in its own pass.


## Header enhancements to both CM workspaces (2026-08-21, same day)

Chris marked up the Weekly CM page asking for two things, applied to **both** Weekly and
Sent so the surfaces cannot drift.

### 1. Vendor in the subject line

`Subject: Credit memo request - Pro Exteriors LLC - 5 invoices, $2,024.75`
→ `Subject: **[SRS Distribution]** Credit memo request - Pro Exteriors LLC - 5 invoices, $2,024.75`

### 2. Context on every claim header

Was just `Invoice 0050033202-002 — credit requested: $92.25 · detail →`. Now carries a
second line with the five fields asked for:

> Wichita, KS · SRS Distribution · SRS BUILDING PRODUCTS - WICHITA (DJWIC) ·
> **Job KS-189 ↗** (Tony Wynn) · Invoiced 2026-07-15

PE office · vendor · vendor branch (name + id) · job · invoice date. The job is a live
AccuLynx deep link when an id exists, plain text when only a number does, and the client
name rides along. Both pages load it through one shared helper
(`lib/cm-request-header.ts`), so they cannot diverge. Missing pieces are **named** —
"office not resolved", "branch not resolved" — never blanked, so a gap is visible.

Perf: `v_invoice_audit_invoice` is the heavy pricing view, but a filtered
`invoice_number IN (...)` pushes down to an index scan — **55ms** for a page's worth.

### The bug this surfaced — migration 250

The first render showed **"no job on the PO"** against every SRS claim. Those POs plainly
read `KS-189`, `KS-188`, `KS-184`, `KS-194`, `KS-198`. The label was not missing data, it
was **wrong**: `v_invoice_acculynx_match` is built `FROM abc_invoices` and has never covered
the `vendor_invoices` side at all.

Migration 250 adds `v_vendor_invoice_acculynx_match`, applying migration 237's canonical
job token to `vendor_invoices.po_number`. **32 of 33 vendor invoices resolve a job.** The
header loader now reads both matchers, ABC winning on a collision because its matcher has
three tiers to the vendor one's single PO-token tier.

Result on the Sent page: 44 of 44 headers enriched, **zero** false "no job" labels, 43 live
job links.

This one was only findable by rendering the page — the build was green and the label was a
plausible-looking sentence.


## SRS agreement PDFs — the link path, and what is actually missing

Ask: make the agreement PDF link active on `/accounting/credit-memos/<invoice>` for SRS.

**The PDFs are not in the system.** The `agreements` bucket holds 7 objects, all ABC
(Dallas, Denver, Kansas City, three Wichita ABC sheets). All three active SRS agreements
name a file and have no copy stored, and none is on this machine either:

| agreement | names | stored? |
|---|---|---|
| `0049828559` SRS Wichita KS quote | `Wichita_Quote0049828559.pdf` | **no** |
| `0049345641` SRS Englewood CO quote | `Englewood_co_Revised Pro Exteriors Quote 06.01.26 mo (1).pdf` | **no** |
| `SRS-MELISSA-L4` SRS Melissa TX Level 4 | `Richardson_MELESSA_PRICE_SHEET- LEVEL 4 (1).pdf` | **no** |

No code change can conjure them. What I did instead was **fix the path so the link goes
live the moment a file is uploaded** — because it would not have, even then. Two bugs sat
between an uploaded PDF and a working link:

1. **`scripts/upload-agreement-pdf.mjs` binds `source_pdf_url` to a bucket-relative path**
   (`agreements/x.pdf`), but the endpoint redirected to that value verbatim as a
   `Location`. A relative Location resolves against the app host and 404s. The endpoint now
   detects a bucket path, splits bucket from key, and returns a **signed URL** — absolute
   URLs still pass straight through.
2. **The evidence panel rendered `source_pdf_url` directly as an `href`**, with the same
   result. It now routes through `/api/price-agreement/pdf/<id>`, as the ABC path always did.

The 404 also now names the fix: *"No copy of this agreement is stored — the record names it
as 'Wichita_Quote0049828559.pdf'. Upload it with scripts/upload-agreement-pdf.mjs
--agreement <id>"*.

### A truthfulness regression caught in the same pass

Another session backfilled the SRS re-audit writer (docs/95 follow-up 2), so
`invoice_line_reaudit` discrepancy rows now carry a uuid `agreement_id`. That flipped the
evidence panel from its *derived* path to its *recorded* path — and the recorded path only
enriched **ABC integer ids**. For a uuid it left `version_label`, `source_file` and
`ceo_verified` null, so `isQuote` defaulted to false and the Document-type check reported
a flat **"Priced from an agreement"** for what is actually an accepted *quote*.

docs/93 is explicit that a quote must never be hidden. The recorded branch now enriches
uuids from `price_agreements` exactly as it does ABC, restoring:

> **Quote 0049828559 is accepted as the governing price agreement for Wichita, KS —
> confirmed on the agreement record, not assumed.**

### To finish this, upload the three files

```
node scripts/upload-agreement-pdf.mjs <file.pdf> \
  --as wichita-srs-quote-0049828559.pdf \
  --agreement 3e7b261b-533d-4df5-aa3f-94bef11f9868
```

(`--dry-run` first; the script refuses to overwrite an existing object.) Bucket naming
convention is `<city>-<vendor|agreement>-<period>.pdf`.

Note from commit `ed792ce`: the two SRS **Colorado** sheets were delivered to the Pro
Exteriors accounting mailbox and are **not reachable from `chussey@cleverwork.io`** —
someone with that mailbox has to export them first.


## "Mark sent" — moving a request from Claim it to Chase it

### First, the SRS re-audit writer needed no work

Asked to fix it so the panel shows recorded citations. **It is already fixed.** Another
session backfilled it (docs/95 follow-up 2) and the current state is clean:

| vendor | classification | rows | with agreement | missing |
|---|---|---:|---:|---:|
| abc-supply | discrepancy | 128 | 128 | 0 |
| **srs** | **discrepancy** | **11** | **11** | **0** |
| srs | valid / engine_resolved / uom_review | 76 | 76 | 0 |
| both | no_price | 1,342 | 0 | *correct — no price matched, so no agreement to cite* |

What was actually missing was the panel **displaying** it: the recorded branch only enriched
ABC integer ids, so a uuid citation lost `version_label`, `source_file` and `ceo_verified`.
Fixed in the previous commit (`dbe0e1f`). Verified across all five approved SRS claims —
every one now reports `source: recorded`, `isQuote: true`, `ceoVerified: true`, with both
the Document-type and Citation-provenance checks passing.

### The button

`mark-sent` already existed in `/api/credit-memos/disposition` (sets `status='sent'`,
`sent_by`, `sent_at`, `follow_up_due_at` = +14 days, and auto-fires the per-invoice Process
stamp). It had no entry point outside the single-invoice detail page. Now:

**Weekly CM (the request worksurface)** — two granularities:
- **Per vendor**, in the vendor summary: marks every approved invoice for that vendor.
  This is the natural unit, because you send one email per vendor.
- **Per invoice**, beside `detail →`, for a one-off.

**Invoice Audit, Card 1** — one `Mark sent →` button beside Review and Process. It reads
`/api/credit-memos/pending`, takes the `approved` set, and **names every vendor in the
confirm** because the set can span vendors and you may only have emailed one:

> Mark these approved requests as SENT?
>   • SRS Distribution: 5 request(s), $2,025
> This does not email anything. It records that you sent the email, moves them to Chase it,
> and starts the 14-day follow-up clock.

Disabled with an honest tooltip when nothing is approved, and its state is kept in sync by
the 60-second poll through an **explicit `[data-kpi-btn="marksent"]` hook** — not a
positional selector, per the lesson earlier in this doc.

Nothing is emailed. Per SOUL, no message leaves the building without a human; the button
only records that a human sent it. Each write is individually vendor-scoped by the existing
endpoint, so a colliding invoice number cannot advance another vendor's request.

Verified by stubbing `window.confirm` to decline: the confirm text is correct on both
surfaces, the vendor `<summary>` does not collapse when its button is clicked, and
declining leaves every row untouched.
