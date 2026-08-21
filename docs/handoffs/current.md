# Project Handoff — Pro Exteriors Open Brain / Command Center
**Project:** a-roofers-open-brain (Pro Exteriors Command Center + agent fleet)
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain
**Production URL:** https://cc.proexteriorsus.net
**Date:** 2026-08-21 09:00 (CT)
**Agent:** Lead Orchestrator (Claude Code)
**Reason:** User-requested /project-handoff /wrapup

---

## Accomplished This Session

Three rounds, all initiated by Chris handing over files: 4 agreement PDFs → a policy change
→ 5 invoice PDFs.

### Round 1 — the SRS agreement PDFs are stored and bound (`a6b900c`, migration 251)

- `agreements` bucket: **4 SRS documents uploaded** and bound to their agreement records.
  Verified end to end — `/api/price-agreement/pdf/<id>` returns 302 to a signed URL and the
  bytes are **sha256-identical to the source file** for all four, on the live site.
  `/accounting/credit-memos/0050033202-002` now shows **Open agreement PDF →**.
- `schemas/…/251-srs-colorado-price-list-2026-08-14.sql`: the 4th PDF had **no agreement
  record**. Provenance established without letterhead — PDF author is **Blake Wells**, the
  same `B WELLS` on both SRS quotes, and the catalog is TOP SHIELD (SRS's house brand).
  Anchored to `AMSDE` because agreements resolve at the **office** level (proved it:
  `0049707508-001` on `SBP-DENVER` prices off the `AMSDE`-bound quote). 112 printed rows →
  **101 items** (9 `$0.00`/`CALL` placeholders dropped, 2 duplicates collapsed).

### Round 2 — `ceo_verified` retired as a gate (`a6b900c`, migration 252)

Chris: *"once a price agreement is added it is approved and active."* Finished what docs/82
§6 decision 3 started on 2026-08-05. Four surfaces still gated:

- `lib/credit-memo.ts`: the `warn` "has not been accepted as a price agreement" branch
  removed. **docs/93 intact** — it still says the document is a quote.
- `lib/abc-price-gaps.ts`: `unverified_agreement` reason code removed entirely (it carried
  severity **blocked**), with its severity/action/summary entries.
- `pages/api/price-agreement/review/promote.ts`: `ceo_verified: false` → `true`.
- `pages/accounting/price-agreement/builder.astro`: "CEO verified" pill removed.
- 10 rows flipped to approved. **Columns kept** — rule 1 is additive-only and the timestamps
  are real provenance.

### Round 3 — 5 SRS invoice PDFs ingested (`fbb32d1`, migrations 253–255)

- `integrations/bridges/ingest-vendor-invoice-csv.mjs`: new **`--pdf` arm on the same
  script**, reusing `upsertInvoice`/`replaceLines`/`upsertUomEvidence` so PDFs and the portal
  CSV share one contract (docs/80).
- **Reconciliation gate**: a PDF is written only if parsed lines sum to the printed
  `SUB-TOTAL` and `SUB-TOTAL + delivery + freight + restock + tax` equals `BALANCE`.
- `schemas/…/253-srs-branch-code-aliases.sql`: migration 243 made branch resolution fail
  **closed** and there were **zero SRS alias rows** — the next invoice would have landed with
  no branch, no office, no price, silently. Seeded `DJWIC/SSMEL/SSCOP/AMDEN/SHCOL`.
- `schemas/…/254-po-number-canonical-acculynx-job.sql`: `po_number` → the AccuLynx job
  number, 9 rows. Printed PO preserved at `raw.po_number_as_printed`.
- `schemas/…/255-vendor-invoice-po-canonicalize-trigger.sql`: keeps it canonical on write.
  **Fails open** — an unrecognised PO stays exactly as printed.
- `docs/101-…md` + 2 addenda.

## Git State
- **Branch:** `main` — `main == origin/main`
- **Last commit:** `fbb32d1` + this wrap-up commit
- **Live `buildCommit`:** `fbb32d1` (verify with `/healthz` after the wrap-up push)
- **Uncommitted changes:** none

### Open branch not on main — PR #9 (ready for review)
`claude/project-handoff-5ua2fw` carries the PEC-221 price-agreement coverage work: migrations
**263-266** (already applied to prod, all additive) plus `docs/104`. It is 0 behind main and
kept merged with it. Marked **ready for review** on 2026-08-21; head is now `f291a90` after
a round of review fixes (CodeRabbit + Greptile + Cursor Security, all green on the reviewed
head). **It is not merged and not deployed.**

Two items on that branch need a human, both recorded in `docs/104`:
1. Confirm `AMSDE` == `SBP-SOUTHDENVER` so the two Denver books can be repointed, **or**
   approve repointing the agreement join to `vendor_branch_id` with mig 244's proof.
2. **One-minute cleanup in an external tool:** CodeRabbit stored a learning during PR #9's
   review saying to use `abc_invoices.id` as a tiebreak. That column does not exist. It has
   since stored a corrected learning that contradicts it, so the risk is mostly neutralised,
   but the stale entry can only be deleted from the CodeRabbit learnings UI
   (app.coderabbit.ai/learnings) — not from a PR thread. Worth removing next time someone is
   in there.
3. Four branches (21, 39, 465, 684) are geocoded but marked `geocode_status = 'pending'`,
   against a `geom IS NOT NULL` ⇒ `'ok'` invariant that holds for 1,752 rows. Mig 264
   demoted two of them; 39 and 465 were touched at 13:04 on 2026-08-21 by another process,
   where `pending` may be a deliberate re-geocode request. Left alone rather than guessed at.

Numbering note: parallel sessions
claimed 245-262 and both `docs/99` and `docs/100` while it was in flight, so it yielded seven
times — its applied
Supabase labels still read `245_`/`246_`/`248_`/`249_`, which is cosmetic (Supabase keys on
timestamp; all four applied before the files numbered 246-248 existed).

## Task Cut Off
None — session ended at a clean boundary. Everything committed, deployed and verified in a
browser or through the live API.

## Next Task — Start Here

**Task: PEC-226 follow-up — the exact-token backfill ran and barely moved the number.**

Migration 256 executed the backfill on 2026-08-21. Measured immediately after (PR #9):
Colorado matched **4 of 101** items, Melissa **4 of 97** — 8 in total. SRS unpriced lines went
**216 → 211**. Exact-token matching on description-only sheets is close to a no-op, so the
decision PEC-226 framed is still live; it just now has evidence that option 1 alone is not
enough.

**What to check / do:**
1. Confirm the post-backfill state rather than the pre-backfill one:
   `select pa.version_label, count(pai.id) items, count(pai.raw_item_number) matched from price_agreements pa left join price_agreement_items pai on pai.agreement_id=pa.id where pa.version_label like '%Melissa%' or pa.version_label like '%Colorado%' group by 1;` → expect **4 / 97** and **4 / 101**.
2. Read `docs/101-…md` §2 and PEC-226 for the two options.
3. If Chris picks **backfill** (recommended): map sheet descriptions → SRS item numbers from
   `vendor_invoice_lines` history, write to `price_agreement_items.raw_item_number`, and hold
   anything below an exact-token match for human review. Colour variants share a description.
4. If Chris picks **trigram**: mirror the ABC arm (`similarity >= 0.45`) on the vendor path —
   but the `Item match` evidence check must then say the match was fuzzy.

**If the backfill produces ambiguous matches:** do not guess. This feeds credit-memo claims
sent to a vendor; a wrong price is worse than no price.

**Prompt to use:** "Read docs/101-srs-agreement-pdfs-and-ceo-verified-retirement.md §2 and
Linear PEC-226. Backfill raw_item_number on the SRS Melissa and Colorado price sheets from
invoice history, holding anything below an exact-token match for my review."

## Decisions Made This Session

- **The Colorado sheet got its own agreement record**, not a bind to the Englewood quote —
  different effective date and a different (office-wide) scope.
- **Englewood NOT archived.** Date windows decide which book applies; 11 re-audit lines cite it.
- **9 `$0.00`/`CALL` Colorado items deliberately not loaded** — they would fabricate
  discrepancies against a price the vendor never quoted.
- **`ceo_verified` columns kept, not dropped**, and docs/93 untouched: the gate is gone, the
  disclosure that a document is a quote is not.
- **`po_number` rewritten, printed value preserved.** The 255 trigger **fails open** because
  "not tied to a job yet" is real information; blanking it destroys the only clue.
- **`0050471744-001` → KS-208 on exact address evidence** (216 South Madison St, Hillsboro KS
  = the invoice's SHIP TO). **`0050708886-001` → TX-455 on Chris's instruction**, recorded in
  the migration as a human decision so it is never mistaken for machine inference.

## Blockers Requiring Human Action

1. **PEC-226 — the decision above.** $63,642.53 of SRS spend is unauditable until it lands.
   - ⚠️ **The backfill alone will NOT make the Colorado sheet price** (PR #9, verified
     2026-08-21). PEC-226 fixes the *line-level* half — missing `raw_item_number`. The
     Colorado book also fails the *office-ring* half, independently: it hangs on `AMSDE`,
     which `v_office_vendor_branch` cannot see. Expect Melissa to start pricing after the
     backfill and **Colorado to stay at `priced_items = 0`** until blocker 2 is also done.
2. **Denver × SRS branch identity — needs Chris** (PR #9). Confirm `AMSDE` and
   `SBP-SOUTHDENVER` are the same physical branch so the two Denver books (101 + 22 items)
   can be repointed, **or** approve repointing the agreement join to `vendor_branch_id` with
   mig 244's equivalence proof. Not decided by an agent — mig 240's rule is that a guess
   cannot become a fact. `v_agreement_unreachable` currently lists **6 agreements / 237
   items**.
   - **Correction to the architecture note below**: *"anchor a new agreement to any branch in
     the right territory and it covers all of them"* is **not** sufficient. The branch must
     also be **geocoded** — `v_office_vendor_branch` joins on
     `vb.geom IS NOT NULL AND st_contains(o.boundary, vb.geom)`, then matches the agreement by
     branch-number **text**. Verified: `AMSDE` and `SSMEL` both carry the correct
     `pricing_territory_office_id` and both return `in_ring = false`. Melissa prices only
     because an archived duplicate agreement sits on the geocoded twin `SBP-MELISSA`;
     Colorado has no such twin.
3. **9 Colorado `$0.00`/`CALL` items** need real prices from **Blake Wells**.
4. **Atlanta × ABC agreement** — still `pending` (migration 245); 19 covered branches,
   $5,226.90 already invoiced and un-auditable.
5. **Atlanta × SRS (11 branches) and Kansas City × SRS (3)** — unruled, no book.
6. **QXO** — 59 covered branches, `no_book` at every office.
7. **Prefer the SRS portal CSV over PDFs** when you can pull it: the PDF truncates PO NUMBER
   to 16 characters, and that field is the AccuLynx job key.
8. **A3 owed** — the nightly QA loop is a new agent capability (hard rule 9).
9. Carried over: PEC-213 Wichita · PEC-111 · PEC-177 · PEC-172 · PEC-203.

## Verification Commands
1. `curl -s https://cc.proexteriorsus.net/healthz` — `buildCommit` should be this session's HEAD
2. `git status --short` — empty
3. `cd app/command-center && npm run build && npm test` — Complete, **315 passed**
4. SQL: `select count(*) from price_agreements where ceo_verified is distinct from true;` → **0**
5. SQL: `select count(*) from price_agreement_items where agreement_id='9f2c4d10-7a3b-4c6e-9d51-0b8e2f5a6c34';` → **101**
6. SQL: `select count(*) from v_vendor_invoice_acculynx_match where matched and purchase_order_number is distinct from pe_job_number;` → **0**

## Full Context

### What was built across ALL sessions
Carried forward from `archive/2026-08-21-0700-srs-pdfs-mark-sent.md`. Added this session:

- 4 SRS agreement PDFs stored, bound and byte-verified through the live endpoint
- SRS Colorado price list as a real agreement (migration 251, 101 items)
- `ceo_verified` retired as a gate across 4 surfaces (migration 252)
- SRS invoice **PDF ingest** with a reconciliation gate, on the existing CSV loader
- SRS branch-code aliases (migration 253) — closed a silent fail-closed hole
- `po_number` = AccuLynx job number, at rest and on write (migrations 254–255)

### Architecture decisions
- **Agreements resolve at the OFFICE level**, never the branch: a branch's
  `pricing_territory_office_id` decides. Anchor a new agreement to any branch in the right
  territory and it covers all of them.
  **⚠️ CORRECTED 2026-08-21 (PR #9): this is not sufficient.** Reachability also requires the
  branch to be **geocoded** — `v_office_vendor_branch` joins on
  `vb.geom IS NOT NULL AND st_contains(o.boundary, vb.geom)` and *then* matches the agreement
  by branch-number **text**. `AMSDE` and `SSMEL` both carry the correct territory and are both
  invisible to the ring. Do not plan work on the original wording.
- **The vendor price path is EXACT-match only** — `raw_item_number = item_number OR
  raw_description_normalized = lower(item_description)`. No trigram arm; ABC has one. This is
  the root of PEC-226.
- **Two ingest fail modes, opposite by design.** Branch resolution fails **closed** (unknown
  label → no office → no price, visibly). PO canonicalization fails **open** (unknown PO →
  left as printed). Losing a branch silently corrupts pricing; losing a PO silently destroys
  the only job clue.
- **`vendor_invoices` has two BEFORE triggers** now — branch resolution (243) and PO
  canonicalization (264). Anything writing to that table gets both.

### Key invariants (never violate)
- **Never resolve a branch from a vendor's text label** — always `vendor_branch_id` /
  `vendor_branch_alias`, vendor-scoped. ABC and QXO share 33 branch numbers.
- **A quote on file is the governing book, and the panel must still say it is a quote.**
- **Nothing external without a human.** Mark sent/received records, never transmits.
- **Additive migrations only.** Archive, never delete; preserve originals (`raw.*_as_printed`).
- **A green build is not verification.** Two wrong-but-plausible outputs shipped past
  `npm run build` + 309 passing tests this session and were caught only by rendering the page
  and by reconciling against the vendor's own printed totals.

### Service / deployment map
| Service | Detail |
|---------|--------|
| Live app | https://cc.proexteriorsus.net (Coolify, builds `app/command-center/Dockerfile` from `origin/main`) |
| Prod DB | Supabase `rnhmvcpsvtqjlffpsayu` — schemas through **266** (263-266 applied from PR #9's branch) |
| Storage | `agreements` (11 objects: 7 ABC + 4 SRS), `invoices`, `wip-packs`, `slack-attachments`, `product-images`, `impact-reports` |
| Local dev | `.claude/launch.json` → `command-center` on port 4399 |
| Linear | PE-CC-DevTeam — **PEC-224/225** (Done), **PEC-226** (Urgent, Todo) |

### Current SRS money state (verified at handoff)
| figure | value |
|---|---:|
| SRS priced lines / value | 73 / $16,990.55 |
| SRS **unpriced** lines / value | **216 / $63,642.53** |
| Richardson, TX priced lines | **0 of 28** |
| Documents ingested this session | 4 invoices + 1 credit, 47 lines |
