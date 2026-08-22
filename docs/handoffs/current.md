# Project Handoff — Pro Exteriors Open Brain / Command Center
**Project:** a-roofers-open-brain (Pro Exteriors Command Center + agent fleet)
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain
**Production URL:** https://cc.proexteriorsus.net
**Date:** 2026-08-22 08:10 (CT)
**Agent:** Lead Orchestrator (Claude Code)
**Reason:** User-requested `/project-handoff /wrapup` — full Linear update

---

## Accomplished This Session

Seven rounds, each started by Chris. Migrations **256–263**, all additive. Everything
below is deployed and verified live.

### Round 1 — PEC-226: the SRS description-only sheets finally price (mig 256)

- `schemas/…/256-srs-description-item-number-backfill.sql`: token helpers
  (`vendor_desc_tokens` / `_token_key` / `_head`), the
  `price_agreement_item_candidates` review queue, and
  `refresh_price_agreement_item_candidates()`.
- **8 bindings auto-applied** — same token set, agreeing price UOM, exactly one target.
  SRS priced lines **73 → 78**.
- **500 candidates queued.** The brand gate was essential: without it the pool proposed
  `IKO HIP & RIDGE` → `TAMHRARRBK`, a **TAMKO** item. It cut the queue 1,115 → 500.

### Round 2 — the Expenses Realized discrepancy (migs 257–258)

- **Every feed was green.** AccuLynx hourly 192/192, ABC mirror on Hetzner 8/8, QBO
  mirror 8/8 (runs **daily** despite the `mode: thursday` run key), wip-ar nightly 8/8.
- `schemas/…/257-qbo-job-cost-bare-customer-ref.sql`: **the actual bug.**
  `v_qbo_job_cost_lines` derived the job number with
  `substring(customer_ref_name, ':([^:]+)$')` — which **requires a colon**. Most
  job-tagged expense lines carry the bare job number, so **14,068 of 17,489 lines /
  $16,349,881** returned NULL and were dropped. 998 of 998 bare job-shaped names matched
  a real `crm_pipeline.client_job_number`; 0 of 135 others did. Attributed cost
  **$8.03M → $24.22M**. Added `v_qbo_job_cost_unattributed` as the guard.
- `schemas/…/258-wip-ar-signed-contract-population.sql`: gate became AR balance **OR**
  signed contract. **122 → 347 jobs**, `population_reason` records which arm.
- Board Expense Realized **$875,957 → $8,900,089**.

### Round 3 — KPI pills became filters

- `app/command-center/src/lib/friday-wip.ts`: each job is **tagged with its KPI keys in
  the same pass that sums them**, so a pill's filter and its number cannot drift.
- `…/pages/accounting/friday-wip.astro`: 12 filters (6 original pills + signed-contract +
  4 cash weeks + undated).

### Round 4 — YTD accrual and GM% budgeting (migs 259–260)

- `…/259-accrual-snapshot-ytd.sql`: the CPA snapshot summed **lifetime** and labelled it
  with the cutoff. Now YTD: **$12.69M/$8.90M → $5.70M/$3.49M**.
- `…/260-wip-office-gross-margin.sql`: `est_total_costs` was populated on **0 of 347**
  rows. Now `contract × (1 − office GM%)`; `expense_outstanding` = that − expense
  realized, floored at 0. **$2,382,336** outstanding.
- Three guards, each earned from the data: change orders already in `contract_amount`;
  an office rate needs **5+ jobs AND $250k+ billed** (Georgia read 56.6% off ONE job,
  insurance program −18.4% off five); clamped 0–75.
- `wip_office_margin` + `/api/accounting/friday-wip/margin`, persisted for everyone.

### Round 5 — colour variants + categorization (migs 261–262)

- `…/261-colour-variants-all-vendors.sql`: ABC's 0.45 trigram rule, measured on SRS,
  priced `STEEL FLASHING SHINGLES` off `STEEL A ROOF EDGE` for **+1,630.8%**. Installed
  colour-key equality instead, vocabulary read from `product_color_variants`.
  SRS priced **78 → 93**, unpriced **$87,394 → $56,701**.
- `…/262-price-line-product-categorization.sql`: `category_key` is a **GENERATED** column,
  so categorization = **binding to `products`** and inheriting taxonomy. **748 auto-bound**
  on exact manufacturer SKU; **956 candidates over 427 lines** queued.
- New surface `…/pages/accounting/price-agreement/categorize.astro` +
  `src/lib/product-categorize.ts` + `…/api/accounting/product-match/decide.ts`.

### Round 6 — why 230 jobs showed $0 balance (mig 263)

- `…/263-wip-attention-flags.sql`: three fixes. **Draft invoices excluded from AR**
  (MC-76's $36,000). **225 jobs** contracted/invoiced/**collected in full** but never
  closed in AccuLynx flagged `stale_closeout` — job 10 has sat at `invoiced` **1,576
  days**. **5 jobs** whose open invoices are absent from their own Balance Due flagged
  `balance_contradiction` (**$195,098.53**; job 5's invoice 5-4 is $136,892.90).
- `diagnose_wip_ar_attention()` writes an **"Our Best Guess"** note derived from each
  row's own numbers on every rebuild, popped out from the **client name**.

### Round 7 — navigation overhaul + a new app-wide rule

- Measured at 1920×900: page **4,465 → 1,021px**, chrome **711 → 578px**, rows visible
  **3 → 11**, row height **67 → 29px**, horizontal overflow **585 → 0**.
- **Money / Est. Cash Flow column groups** (Chris's hybrid design), offices collapsed by
  default at 10 jobs, `Balance to Pay` **derived** (`Balance Due − To Collect`, live —
  it previously rendered static `billed_ar` and showed **$0** on a $146,576 balance),
  live 3-week cash map, currency field, overdue red + navy tracer.
- **The header bleed was four faults stacked** — see Architecture decisions below.
- Codified **Long-list disclosure** in `standards/design/v1.md`, `CONVENTIONS.md` §11a,
  `CLAUDE.md`, `AGENTS.md`, `.cursor/rules/agent-conventions.mdc`.
- `docs/102`, `docs/103` written.

## Git State
- **Branch:** `main` — `main == origin/main`
- **Last commit:** `aa06ab1` — "docs(align): promote the UOM pricing contract into CONVENTIONS and .cursor"
- **Live `buildCommit`:** `f2dbed7`, status `ok`
- **Uncommitted changes:** none

### Open branch not on main — PR #9 (ready for review)
`claude/project-handoff-5ua2fw` carries the PEC-221 price-agreement coverage work: migrations
**268-271** (already applied to prod, all additive) plus `docs/106`. It is 0 behind main and
kept merged with it. Marked **ready for review** on 2026-08-21; head is now `95a8664` after
several rounds of review fixes and nine renumberings (CodeRabbit + Greptile + Cursor
Security all green on the reviewed heads). **It is not merged and not deployed.**

Two items on that branch need a human, both recorded in `docs/106`:
1. Confirm `AMSDE` == `SBP-SOUTHDENVER` so the two Denver books can be repointed, **or**
   approve repointing the agreement join to `vendor_branch_id` with mig 244's proof.
2. **One-minute cleanup in an external tool:** CodeRabbit stored a learning during PR #9's
   review saying to use `abc_invoices.id` as a tiebreak. That column does not exist. It has
   since stored a corrected learning that contradicts it, so the risk is mostly neutralised,
   but the stale entry can only be deleted from the CodeRabbit learnings UI
   (app.coderabbit.ai/learnings) — not from a PR thread. Worth removing next time someone is
   in there.
3. Four branches (21, 39, 465, 684) are geocoded but marked `geocode_status = 'pending'`,
   against a `geom IS NOT NULL` ⇒ `'ok'` invariant that holds for 1,752 rows. Mig 268
   demoted two of them; 39 and 465 were touched at 13:04 on 2026-08-21 by another process,
   where `pending` may be a deliberate re-geocode request. Left alone rather than guessed at.

Numbering note: parallel sessions
claimed 245-262 and both `docs/99` and `docs/100` while it was in flight, so it yielded seven
times — its applied
Supabase labels still read `245_`/`246_`/`248_`/`249_`, which is cosmetic (Supabase keys on
timestamp; all four applied before the files numbered 246-248 existed).

## Task Cut Off
None — session ended at a clean boundary. Every migration applied, every surface
verified in a browser against prod data, everything deployed.

## Next Task — Start Here

**Task: PEC-226 — rule on the 24 held candidates.**

**What to check / do:**
1. `select * from v_price_agreement_item_review where match_tier <> 'token_overlap' order by evidence_amount desc;` → expect **24 rows**.
2. Three need a human call, and none of them should be guessed:
   - `IKO CAMBRIDGE AR` → 6 colour variants, ~$38k. Sheet says **AR** (algae-resistant);
     invoices say **Class 3 impact resistant**. Same product or not?
   - `MALARKEY VISTA AR` → `MALVIARIRSBOK3`, $7,878. Sheet prices it **both /BD and /SQ**.
   - `TAMKO HIP AND RIDGE` → `TAMHRARRBK`. **4 sheet rows at 4 different prices**
     ($65.50 / $67 / $96.50 / $82) all pointing at one item.
3. Approve by setting `review_status='approved'` and promoting to
   `price_agreement_items.raw_item_number` — **one row per colour** where
   `sibling_candidates > 1`, because `raw_item_number` holds one value.
4. Re-run `select * from refresh_price_agreement_item_candidates(<agreement_id>);` and
   confirm SRS priced lines rise from 93.

> **Carried caution from PR #9 (measured 2026-08-21), still relevant:** the exact-token
> backfill in mig 256 matched Colorado **4 of 101** and Melissa **4 of 97** — SRS unpriced
> lines moved only **216 → 211**. Exact-token matching on description-only sheets is close
> to a no-op, so approving the 24 candidates fixes the *line-level* half only.

**If a candidate looks ambiguous:** reject it. This feeds credit-memo claims sent to a
vendor; a wrong price is worse than no price.

**Prompt to use:** "Read docs/103 §2 and Linear PEC-226. Walk me through the 24 held
candidates in v_price_agreement_item_review one at a time, strongest evidence first,
and apply only the ones I approve."

## Decisions Made This Session

- **PEC-226 auto-applies only exact token-set equality** with an agreeing UOM and a unique
  target. Colour families go to review because one sheet row maps to many item numbers and
  `raw_item_number` is a single column.
- **ABC's trigram rule was NOT copied verbatim** (PEC-231). Measured, it invents claims on
  description-only sheets. ABC keeps trigram pending Chris's go-ahead — 2,263 priced lines
  at stake.
- **Migration 257 leaves the colon branch byte-identical.** The bug was the missing
  bare-name branch; narrowing the colon branch would risk dropping cost that counts.
- **Stale close-outs are flagged, not deleted** — they are the AccuLynx cleanup list.
  Contradictions **stay in the money KPIs**; that AR is real.
- **Category is read through the product, never stored beside it.** Two copies of a
  classification drift, and the drift is silent.
- **`Balance to Pay` is derived, never stored.** A stored copy drifts from the two numbers
  it comes from.
- **View state is `localStorage`, not session** — this is weekly planning, so the way it
  was left on Friday is how it should look on return.
- ⚠ **The 3-week cash map's basis changed from billed AR to Balance Due**, to match the
  pool `To Collect` is typed against. A doctrine change, not a defect fix.

## Blockers Requiring Human Action

1. **PEC-226** — the 24 candidates above.
2. **Denver × SRS branch identity — needs a human** (PR #9). Confirm `AMSDE` and
   `SBP-SOUTHDENVER` are the same physical branch so the two Denver books (101 + 22 items)
   can be repointed, **or** approve repointing the agreement join to `vendor_branch_id`
   with mig 244's equivalence proof. Not an agent's call — mig 240's rule is that a guess
   cannot become a fact. `v_agreement_unreachable` lists **6 agreements / 237 items**.
   - ⚠️ **PEC-226 alone will NOT make the Colorado sheet price.** It fixes the *line-level*
     half (missing `raw_item_number`). The Colorado book also fails the *office-ring* half,
     independently: it hangs on `AMSDE`, which `v_office_vendor_branch` cannot see. Expect
     Melissa to price after the backfill and **Colorado to stay at `priced_items = 0`**
     until this blocker is also cleared. Mig 267's effective-date backdate removes a THIRD,
     separate gate — re-verify rather than assuming it closed either of these two.
3. **4 branches geocoded but `geocode_status = 'pending'`** (21, 39, 465, 684) against a
   `geom IS NOT NULL` ⇒ `'ok'` invariant holding for 1,752 rows. Mig 268 demoted two; 39
   and 465 were touched 2026-08-21 13:04 by another process and may be a deliberate
   re-geocode request. Left alone rather than guessed at — see `docs/106`.
4. **PEC-231** — decide whether ABC moves onto the colour rule. Moves live claim numbers.
5. **PEC-233** — AccuLynx cleanup: 225 finished jobs to close, 5 balance contradictions
   ($195,099) to re-save.
6. **PEC-236** — tell Lucinda and the CPA the accrual snapshot moved lifetime → YTD and
   that `est_total_costs` is now a GM%-derived estimate. **Outward-facing.**
7. **PEC-232** — 427 categorization lines, 224 of them unambiguous.
8. **9 Colorado `$0.00`/`CALL` items** still need real prices from the SRS rep.
9. **Atlanta × ABC agreement** — still `pending` (mig 245); 19 covered branches, $5,226.90
   invoiced and un-auditable. **Atlanta × SRS** (11 branches) and **Kansas City, MO × SRS**
   (3) are unruled with no book. **QXO** is `no_book` at every office — do not chase.
10. `product_taxonomy` stores mangled entities — `Steep Slope Roofing (<gt/>2:12 Pitch)`.
    An import artefact, now visible on the categorize surface. Untouched: it is a 172-row
    reference-table text change and other surfaces may match the exact string.
11. **Prefer the SRS portal CSV over PDFs** when you can pull it: the PDF truncates PO
    NUMBER to 16 characters, and that field is the AccuLynx job key.

## Verification Commands
1. `curl -s https://cc.proexteriorsus.net/healthz` — `buildCommit` = `f2dbed7`, status `ok`
2. `git status --short` — empty
3. `cd app/command-center && npm run build && npm test` — Complete, **315 passed**
4. SQL: `select count(*) from v_qbo_job_cost_unattributed where names_a_real_acculynx_job;` → **0**
5. SQL: `select coalesce(attention_flag,'(active)'), count(*) from wip_ar_master where in_ar_population group by 1;` → 115 active / 225 stale_closeout / 5 balance_contradiction
6. SQL: `select count(*) from wip_office_margin where gm_pct_override is not null;` → **0**
7. SQL: `select location, gm_basis, effective_gm_pct from v_wip_office_margin order by 1;` → 4 office rates, 4 company fallbacks
8. SQL: `select count(*) from price_agreements where ceo_verified is distinct from true;` → **0**
9. SQL: `select count(*) from v_vendor_invoice_acculynx_match where matched and purchase_order_number is distinct from pe_job_number;` → **0**
10. SQL: `select count(*) from v_agreement_unreachable;` → **6** (237 items) — PR #9

## Full Context

### What was built across ALL sessions
Carried forward from `archive/2026-08-21-0900-srs-pdfs-ceo-verified.md`. Added this session:

- PEC-226 exact-token backfill + brand-gated candidate queue (256)
- QBO job-cost bare-CustomerRef fix, $16.2M recovered, + unattributed guard view (257)
- WIP population widened to signed contracts, `population_reason` (258)
- CPA accrual snapshot windowed to YTD (259)
- Per-office GM% engine, override table + API, Est Exp Outstanding populated (260)
- Colour-variant rule for the vendor path, vocabulary from the PE product file (261)
- Price-line → product binding, categorize worksurface, 748 auto-bound (262)
- Draft-invoice exclusion, stale/contradiction flags, "Our Best Guess" notes (263)
- Friday WIP/AR navigation overhaul; **Long-list disclosure** design rule

### Architecture decisions

- **The header bleed was four independent faults**, each sufficient on its own:
  (1) `overflow-x: auto` with `overflow-y: visible` — per spec the `visible` axis computes
  to `auto`, so the pane became an *unbounded* scroll container and sticky anchored to
  nothing; (2) the second header row's sticky `top` was hardcoded 26px, the group row
  measures **31px**; (3) `th:nth-child(-n+2)` also matches the column-group row (spacer=1,
  MONEY=2), freezing MONEY left and demoting it to `z-index: 2`; (4) group header `colspan`
  fixed at 2, so an expanded group left columns uncovered — `colspan` cannot be set in CSS.
- **`vendor_desc_color_key` is STABLE, so the planner inlines it** back into join
  predicates and evaluates per pair (873 × 750) — it times out no matter how the CTEs are
  arranged. Only materialising helps: hence stored `color_key` columns + `refresh_color_keys()`.
- **Never retire rows by timestamp inside plpgsql.** The row default `now()` is transaction
  time and is EARLIER than a `clock_timestamp()` captured at function entry, so the run
  deletes its own inserts. Stamp a run id instead.
- **Two ingest fail modes, opposite by design.** Branch resolution fails **closed**; PO
  canonicalization fails **open**.
- **Agreements resolve at the OFFICE level**, never the branch.
  **⚠️ CORRECTED 2026-08-21 (PR #9): office-level resolution is not sufficient on its own.**
  Reachability also requires the branch to be **geocoded** — `v_office_vendor_branch` joins on
  `vb.geom IS NOT NULL AND st_contains(o.boundary, vb.geom)` and *then* matches the agreement
  by branch-number **text**. `AMSDE` and `SSMEL` both carry the correct territory and are both
  invisible to the ring. Do not plan work on the uncorrected wording.
- **The vendor price path is EXACT-match only** — `raw_item_number = item_number OR
  raw_description_normalized = lower(item_description)`. No trigram arm; ABC has one.
- **Branch resolution fails CLOSED, PO canonicalization fails OPEN** — deliberately. Losing a
  branch silently corrupts pricing; losing a PO silently destroys the only job clue.
- **`vendor_invoices` has two BEFORE triggers** — branch resolution (243) and PO
  canonicalization (255). Anything writing to that table gets both.

### Key invariants (never violate)
- **Never derive a foreign key with a pattern that can silently return NULL without a
  companion view counting the NULLs.** $16.2M hid behind one `substring()`.
- **A sync reporting success proves the bytes arrived, not that they were read correctly.**
- **A vendor's matching rule is not portable just because it is the same company's code.**
- **Category is read through the product, never stored beside it.**
- **A row needing a system fix is not the same as a row needing a phone call.**
- **The mouse wheel only ever changes owner as the direct result of a click.**
- **Nothing external without a human.** Mark sent/received; never transmit.
- **Additive migrations only.** Archive, never delete.
- **A green build is not verification.** Every surface this session was rendered and
  clicked against prod data before shipping.

### Service / deployment map
| Service | Detail |
|---------|--------|
| Live app | https://cc.proexteriorsus.net (Coolify, `app/command-center/Dockerfile` from `origin/main`) |
| Prod DB | Supabase `rnhmvcpsvtqjlffpsayu` — schemas through **271** (268-271 applied from PR #9's branch) |
| Storage | `agreements` (11 objects: 7 ABC + 4 SRS), `invoices`, `wip-packs`, `slack-attachments`, `product-images`, `impact-reports` |
| Hetzner | ABC mirror daily 07:30 UTC · QBO mirror daily 01:00 UTC |
| pg_cron | acculynx hourly · reconcile 10min · wip-ar-master 10:45 UTC · matviews 15min |
| Local dev | `.claude/launch.json` → `command-center` on port 4399 |
| Linear | PE-CC-DevTeam — **PEC-229/230/234** Done · **PEC-226** In Progress · **PEC-231/232/233/235/236** Todo |
