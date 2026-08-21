# Project Handoff — Pro Exteriors Open Brain / Command Center
**Project:** a-roofers-open-brain (Pro Exteriors Command Center + agent fleet)
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain
**Production URL:** https://cc.proexteriorsus.net
**Date:** 2026-08-21 07:00 (CT)
**Agent:** Lead Orchestrator (Claude Code)
**Reason:** User-requested /project-handoff /wrapup

---

## Accomplished This Session

### Invoice Audit redesign — 10 toolbar controls → 4, 7 pills → 4 cards (`e590b77`)

- `pages/accounting/invoice-audit.astro`: toolbar is now search · office · a segmented
  **To audit / Due now / All** switch · **More filters ▾** (date range + tolerance). The
  three old checkboxes still exist **hidden** and remain the source of truth for
  `applyFilter()`, so tree logic and deep links are untouched — the switch only drives them.
- `pages/accounting/invoice-audit.astro`: seven pills regrouped into four cards by the
  question being answered — **Claim it · Chase it · Pay it · Fix it**. Pay it renders the
  loop as a pipeline (`56 → 32 → 5`), Fix it is labelled data coverage, not a work queue.
- `scripts/invoice-audit-tree.ts`: scope-switch wiring. The Due-Now card button **clicks the
  switch** rather than setting `.checked`, because assigning `.checked` in code does not
  fire `change` and the toolbar would silently disagree with the tree.
- `scripts/invoice-audit-tree.ts` + the page: **tree empty state added** — there was none, so
  a filter matching nothing rendered a blank page. That is the *default* view today, because
  every open invoice has been audited and "To audit" is legitimately 0.

### Sent CM workspace — the chase surface (`e590b77`)

- `pages/accounting/credit-memos/sent.astro`: **new.** Exact replica of Weekly CM scoped to
  `status='sent'`, Request → Sent language. Adds sent/follow-up dates with overdue in red,
  and **Mark received** replaces Approve. No drafts section.
- `pages/api/credit-memos/weekly-csv.ts`: optional `?status=sent`; default stays `approved`
  so Weekly's downloads are byte-for-byte unchanged.
- The page states on its face that **the email is rebuilt from today's audit lines** — no
  copy of the outbound message is stored (`packet` holds provenance keys only), so it cannot
  replay what was emailed on 2026-08-09.

### Territory drops (`e590b77`, migration 249)

- `schemas/249-drop-wichita-falls-austin-out-of-boundary.sql`: Wichita Falls (ABC + QXO 249)
  and Austin (ABC 39, 465) → `out_of_boundary`. Both Austin invoices are already no-price
  shop supplies (`S.S.TOOLS`, `TRUCK 102`) so **no dollar figure moved**.
- Result: **no covered branch sits outside an active 2-hour isochrone** —
  `office_for_point()` and `pricing_status` agree everywhere (0 exceptions).

### CM workspace headers (`efcd6c9`, migration 250)

- `lib/cm-request-header.ts`: **new.** One shared loader for both Weekly and Sent so their
  headers cannot drift. PE office · vendor · vendor branch (name + id) · job · invoice date.
- Both workspaces: subject line now carries the vendor — `[SRS Distribution] Credit memo
  request - …`. Job renders as a live AccuLynx link when an id exists, text when only a
  number does. Missing pieces are **named** ("office not resolved"), never blanked.
- `schemas/250-vendor-invoice-acculynx-match.sql`: `v_invoice_acculynx_match` is built
  `FROM abc_invoices` and never covered the vendor side, so every SRS claim printed **"no job
  on the PO"** against POs plainly reading `KS-189`. New vendor-side view applies migration
  237's canonical PO job token — **32 of 33** vendor invoices resolve.

### SRS agreement PDF link path (`dbe0e1f`)

- `pages/api/price-agreement/pdf/[agreementId].ts`: `upload-agreement-pdf.mjs` binds
  `source_pdf_url` to a **bucket-relative path**, but the endpoint returned it verbatim as a
  `Location` — a relative Location resolves against the app host and 404s. It now splits
  bucket from key and returns a **signed URL**; absolute URLs still pass through.
- `lib/credit-memo.ts`: the evidence panel had the same flaw (raw column as an `href`); it
  now routes through the endpoint as the ABC path always did.
- `lib/credit-memo.ts`: **the recorded-citation branch only enriched ABC integer ids.** Once
  another session backfilled the SRS writer, uuid citations lost `version_label`,
  `source_file` and `ceo_verified`, so `isQuote` defaulted false and Document-type reported
  a flat "Priced from an agreement" for an **accepted quote**. docs/93 forbids hiding a
  quote. uuids are now enriched from `price_agreements` the same way.

### Mark sent — Claim it → Chase it (`52c67fa`)

- `pages/accounting/credit-memos/weekly.astro`: **per-vendor** button in the vendor summary
  (one email per vendor = the natural unit) **and per-invoice** beside `detail →`.
  `stopPropagation` so the `<summary>` does not collapse.
- `pages/accounting/invoice-audit.astro` + `scripts/invoice-audit-tree.ts`: Card 1 gets one
  `Mark sent →`. Reads `/api/credit-memos/pending`, takes the `approved` set, and **names
  every vendor in the confirm** because the set can span vendors and you may only have
  emailed one. Explicit `[data-kpi-btn="marksent"]` hook for the 60s poll.
- Nothing is emailed (SOUL). Each write is vendor-scoped by the existing endpoint.

### Housekeeping

- `docs/100-invoice-audit-four-cards-and-sent-workspace.md`: renamed from `99-…` — the
  previous session had already taken 99 (`99-credit-memo-money-truth-2026-08-20.md`).

## Git State
- **Branch:** `main`
- **Last commit:** `52c67fa` — "feat(credit-memos): Mark sent moves an approved request from Claim it to Chase it"
- **Live `buildCommit`:** `52c67fa` — matches `origin/main`
- **Uncommitted changes:** the doc renumber + this handoff (committed as the wrap-up commit)

### Open branch not on main — PR #9 (draft)
`claude/project-handoff-5ua2fw` carries the PEC-221 price-agreement coverage work: migrations
**254-257** (already applied to prod, all additive) plus `docs/102`. It is 0 behind main and
kept merged with it. **It is not merged and not deployed.** Numbering note: parallel sessions
claimed 245-253 and both `docs/99` and `docs/100` while it was in flight, so it yielded four
times — its applied
Supabase labels still read `245_`/`246_`/`248_`/`249_`, which is cosmetic (Supabase keys on
timestamp; all four applied before the files numbered 246-248 existed).

## Task Cut Off
None — session ended at a clean boundary. Every change is committed, deployed and verified
in a browser.

## Next Task — Start Here

**Task:** Upload the three SRS agreement PDFs so the evidence-panel link goes live.

**What to check / do:**
1. Confirm the link path still 404s honestly:
   `curl -s https://cc.proexteriorsus.net/api/price-agreement/pdf/3e7b261b-533d-4df5-aa3f-94bef11f9868`
   → should name the missing file and the upload command.
2. Get the files. They are **not** in the repo, the `agreements` bucket, or on this machine:
   - `Wichita_Quote0049828559.pdf` → agreement `3e7b261b-533d-4df5-aa3f-94bef11f9868`
   - `Englewood_co_Revised Pro Exteriors Quote 06.01.26 mo (1).pdf` → `7246ed93-a1cc-44e5-b338-1a05f204c3e4`
   - `Richardson_MELESSA_PRICE_SHEET- LEVEL 4 (1).pdf` → `df0bb65a-4e01-4f43-9d85-422eb46bfcd9`
3. Upload each (dry-run first):
   `node scripts/upload-agreement-pdf.mjs <file.pdf> --as wichita-srs-quote-0049828559.pdf --agreement 3e7b261b-533d-4df5-aa3f-94bef11f9868 --dry-run`
4. Reload `/accounting/credit-memos/0050033202-002` — "No agreement PDF stored" should
   become an **Open agreement PDF →** link.

**If the Colorado sheets cannot be found:** commit `ed792ce` records that the two SRS
Colorado sheets were delivered to the **Pro Exteriors accounting mailbox** and are not
reachable from `chussey@cleverwork.io`. Someone with that mailbox must export them first —
do not spend time searching Drive.

**Prompt to use:** "Read docs/handoffs/current.md. The three SRS agreement PDFs are at
<paths>. Upload and bind them, then verify the link on
/accounting/credit-memos/0050033202-002."

## Decisions Made This Session

- **The three scope checkboxes stay in the DOM, hidden.** They remain the source of truth for
  `applyFilter()`. Removing them would have meant rewriting the tree filter, the Due-Now
  button and deep-link handling for no user-visible gain.
- **The theme trio stays on the Invoice Audit toolbar.** The teardown proposed retiring it to
  the app shell, but it lives on **six** surfaces and `AppShell` has no theme control — pulling
  it from one page would strand that page. Promoting it is a six-surface change of its own.
- **The Sent workspace rebuilds the email rather than replaying it.** No outbound body is
  stored, so a replay is impossible; the page says so in a banner instead of implying it is a
  copy. An exact replay needs the rendered HTML stored at send time.
- **Mark sent never emails.** Per SOUL, nothing leaves the building without a human — the
  button records that a human sent it and starts the 14-day clock.
- **Card 1's Mark sent names every vendor in its confirm.** The approved set can span vendors
  and you may only have emailed one.
- **Wichita Falls and Austin dropped rather than kept as overrides.** Wichita Falls arrived
  via the closed Euless isochrone with no human decision; Austin were reversed deliberately.

## Blockers Requiring Human Action

1. **The three SRS agreement PDFs** — not in the system; the two Colorado sheets need an
   export from the Pro Exteriors accounting mailbox.
   - **Related, and not fixed by fresh sheets** (PR #9, this branch): the office-ring path
     cannot reach quote `0049345641` *at all*, so `v_office_vendor_inheritance` reports
     `priced_items = 0` for Denver × SRS while the line-level path prices 11 of its 34 lines.
     **The two pricing paths disagree.** Cause: `v_office_vendor_branch` still joins
     agreements to branches by branch-number TEXT — the last survivor of what mig 244 removed
     — and SRS South Denver exists as two rows, `AMSDE` (no address, no geom, holds the book)
     and `SBP-SOUTHDENVER` (geocoded, 6.1 mi, holds nothing).
   - **The 2026-08-14 Colorado list (mig 251) landed on `AMSDE` too** and is likewise
     ring-unreachable, so Denver × SRS still reads `priced_items = 0` with **two** live books
     (101 + 22 items). Two independent blockers now sit on it: no SRS item numbers (mig 251's
     own note, line-level path) **and** the unreachable branch (ring path). Fixing either
     alone leaves the book inert — plan both.
2. **Denver × SRS branch identity — needs Chris** (PR #9). Confirm `AMSDE` and
   `SBP-SOUTHDENVER` are the same physical branch so the agreement can be repointed, **or**
   approve repointing the agreement join to `vendor_branch_id` with mig 244's equivalence
   proof. Deliberately not decided by an agent — mig 240's rule is that a guess cannot become
   a fact. `v_agreement_unreachable` lists every ring-unreachable agreement.
3. **Atlanta × ABC agreement** — recorded `pending` (migration 245). 19 covered branches and
   **$5,226.90** of ABC spend already invoiced and un-auditable until a book exists.
4. **Two unruled office×vendor pairs with no book** — Atlanta × SRS (11 branches) and
   Kansas City × SRS (3). Recorded as `unrecorded` in `office_vendor_agreement_status`.
5. **QXO** — 59 covered branches, `no_book` at every office. Either negotiate it or stop
   marking those branches covered.
6. **A3 owed** — the nightly QA loop is a new agent capability (hard rule 9).
7. **`~/.config/cleverwork/master.env` is malformed** on Chris's Mac, lines 1317/1320 execute
   as shell commands.
8. Carried over: PEC-213 Wichita · PEC-111 · PEC-177 · PEC-172 · PEC-203.

## Verification Commands
1. `curl -s https://cc.proexteriorsus.net/healthz` — `buildCommit` should be `52c67fa…`
2. `git status --short` — should return empty
3. `cd app/command-center && npm run build && npm test` — build Complete, **309 passed**
4. SQL: `select count(*) from vendor_branches where pricing_status='covered' and geom is not null and public.office_for_point(longitude,latitude) is null;` — should return **0**
5. SQL: `select count(*) filter (where agreement_id is null) from invoice_line_reaudit where vendor_slug='srs' and classification='discrepancy';` — should return **0**

## Full Context

### What was built across ALL sessions (complete feature list)
Carried forward from `archive/2026-08-21-0005-uiux-phases-money-truth.md` — read it for the
UI/UX Phase 1–2, money-truth (migrations 246–248), Layer 2 sweep and Maya QA history. Added
this session:

- Invoice Audit: 4 toolbar controls, 4 grouped cards, tree empty state
- Sent CM chase workspace (`/accounting/credit-memos/sent`)
- Shared CM header context loader (office/vendor/branch/job/date) on both CM workspaces
- Vendor-side AccuLynx job matcher (migration 250)
- Mark-sent entry points on Card 1 and the Weekly workspace
- Territory: Wichita Falls + Austin out of boundary (migration 249)

### Architecture decisions
- **The KPI refresh contract is positional-sensitive.** `refreshKpiPills()` rewrites card
  buttons; it used to grab *the first `.iv-process-btn` in the card*. After merging the pay
  steps that was the Due-Now Filter button, so the 60s poll replaced Filter with an Export
  link. **Never move a button between cards without re-reading `refreshKpiPills`.** All such
  targets are now explicit `[data-kpi-btn="…"]` hooks.
- **`v_invoice_audit_invoice` filtered by `invoice_number IN (...)` pushes down to an index
  scan — 55ms.** Safe to query directly for a page's worth of invoices. Do **not** join it
  wholesale (that cost 2.9s and discarded 292k rows).
- **Job matching is two views, not one.** `v_invoice_acculynx_match` (ABC, 3 tiers) and
  `v_vendor_invoice_acculynx_match` (SRS/QXO, PO-token). Readers must consult both; ABC wins
  a collision.

### Key invariants (never violate)
- **Never resolve a branch from a vendor's text label.** ABC and QXO share 33 branch numbers.
  Everything goes through `vendor_branch_id` / `vendor_branch_alias` (migrations 238–244).
- **A quote is not an agreement by default.** Acceptance lives on the agreement record
  (`ceo_verified`), never hard-coded per vendor, and the panel must keep *showing* that the
  document is a quote.
- **Nothing external without a human.** Mark sent/received records, never transmits.
- **Additive migrations only.** Views are `CREATE OR REPLACE`; `CREATE OR REPLACE VIEW` can
  only **append** columns (42P16 otherwise).
- **A green build is not verification.** Three separate wrong-but-plausible outputs shipped
  past `npm run build` + 309 passing tests this session and were caught only by rendering the
  page: the swallowed Filter button, "no job on the PO", and the vanished quote flag.

### Service / deployment map
| Service | Detail |
|---------|--------|
| Live app | https://cc.proexteriorsus.net (Coolify, builds `app/command-center/Dockerfile` from `origin/main`) |
| Prod DB | Supabase `rnhmvcpsvtqjlffpsayu` (shared by local dev and live) |
| Storage | buckets: `agreements` (7 objects, all ABC), `invoices`, `wip-packs`, `slack-attachments`, `product-images`, `impact-reports` |
| Local dev | `.claude/launch.json` → `command-center` on port 4399 |

### Current money state (verified at handoff)
| figure | value |
|---|---:|
| `at_risk` total | $3,679.58 |
| `at_risk` actionable | $2,692.08 |
| `credit_memo_amount` | $997.05 |
| CM requests approved (Claim it) | 5 |
| CM requests sent (Chase it) | 44 |
