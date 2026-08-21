# 99 — Invoice Audit: 4 controls + 4 cards, and the Sent CM workspace (2026-08-21)

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
