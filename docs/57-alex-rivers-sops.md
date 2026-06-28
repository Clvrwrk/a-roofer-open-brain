# 57 — Alex Rivers SOPs (Pricing Variance Analyst)

**Date:** 2026-06-28
**Status:** Daily SOPs **validated against prod 2026-06-28** (one-step walkthrough; corrections folded in below). Weekly Monday final deliverable `weekly_payment_package` designed (§3c, 2026-06-28); rest of weekly / monthly / quarterly / annual = TODO.
**Owner:** Chris (Cleverwork) + Lucinda (Accounting, human-in-the-loop approver)
**Agent:** `alex-rivers` (named agent; maps to @ob-accounting / @ob-ops / Auditor). Runtime: headless Hermes, see [`docs/56`](56-headless-agent-scheduler-design.md).
**Related contracts:** UOM pricing [`docs/46`](46-uom-pricing-normalization.md); invoice "To Be Paid" payment loop (Track C, schema 153); `nepq-agent-communication` skill; `abc-supply-api` skill.

> This doc is the authoritative SOP spec. Each SOP becomes a Hermes cron job (prompt in the
> profile's `cron/jobs.json`) once validated. Deployed crons today: 4 of the designed set, all
> paused (see §0). The thresholds/handoffs below SUPERSEDE the draft actions in
> `agents/cadences/roofing-agent-master-cadence.yaml`.

---

## 0. Cadence inventory (as of 2026-06-28)

| Cadence | Task | Schedule (CT) | Deployed? | SOP status |
| --- | --- | --- | --- | --- |
| Daily | `agreement_ingestion_sweep` **(new)** | ~6:30a Mon–Fri | ❌ | ✅ designed (§2) |
| Daily | `morning_abc_sync` | 7:00a Mon–Fri | ✅ paused | ✅ designed (§1) |
| Daily | `variance_daily_summary` | 5:00p Mon–Fri | ❌ | ✅ designed (§3) |
| Event + Monthly | `agreement_coverage_verification` **(new)** | on new agreement + monthly full scan | ❌ | ✅ designed (§3a) |
| Daily | `gap_followup_cadence` **(new)** | daily (7-day gap SLA) | ❌ | ✅ designed (§3b) |
| Weekly | `weekly_payment_package` **(new)** | Mon | ❌ | ✅ designed (§3c) |
| Weekly | `abc_catalog_sync` | Mon 6:00a | ✅ paused | TODO |
| Weekly | `price_agreement_expiration_check` | Mon 8:00a | ✅ paused | TODO |
| Weekly | `variance_weekly_digest` | Fri 9:00a | ❌ | TODO |
| Monthly | `vendor_performance_scorecard` | 2nd 9:00a | ✅ paused | TODO |
| Monthly | `price_list_validation` | 2nd 10:00a | ❌ | TODO |
| Quarterly | `contract_renewal_prep` | 1st of Q 9:00a | ❌ | TODO |
| Annual | `vendor_audit_deep_dive` | Jan 15 9:00a | ❌ | TODO |

**Global rules for every Alex SOP**
- **Variance is measured in the ABC pricing UOM** — `price_per_uom` (`extendedPriceAmount ÷ priceQty.value`); align orders via `v_item_uom_map`. Never compare on raw `quantity`/`unit_price` (docs/46).
- **Zero external sends (v1).** Alex drafts/flags/holds; humans send. Slack-internal posts + dashboard writes are internal.
- **Record everything.** Every run writes attributed `dashboard_action_log` rows (actor = `alex-rivers`) so the work appears on the Command Center "as if done at a desktop."
- **Silent when all-clear** (`nepq-agent-communication`): no "nothing to report" posts.
- **Vendor-agnostic.** The model below is written for ABC but generalizes to any vendor PE buys from; "branch agreement" = the vendor's branch-level negotiated pricing.
- **Engine views (validated 2026-06-28).** Variance audit = `v_invoice_audit_line` (UOM-aligned; chain = `abc_invoice_lines` → `abc_price_agreement_branch_matches` → `abc_price_agreements` → `abc_price_list_items`, gated by ship-to branch + `effective_date` + non-`API-%` + UOM). Coverage baseline = `v_price_list_global`; GPA benchmark = `v_office_ground_price`. Recording seam = `dashboard_action_log` (actor `alex-rivers`); work queue = `dashboard_work_items`.
- **Audit scope = OPEN, unpaid invoices ≥60 days past invoice date** (rolling `run_date − 60d`; not credit memos). Catches overcharges before payment. Because aged invoices rarely match a *current* branch-matched agreement, the audit falls back through a **benchmark cascade** — agreement → ABC API/list price → newest prior same-item/same-branch invoice (see §1).

### Agreement Priority — branch coverage model (the scope contract)

The cadence tiers govern **how fresh each branch's agreement is kept** — NOT which invoices get
audited. `morning_abc_sync` audits **all** of yesterday's invoices every day, against whatever
agreement applies in the canonical DB at its tier's freshness. Scope is **per PE Office, per vendor**:

| Tier | Branch scope | Refresh cadence | Freshness guarantee at audit |
| --- | --- | --- | --- |
| 1 | **Main branch** (the branch the office actually buys from) | **Daily** | same-day |
| 2 | **All branches within 2-hour drive time** of the office | **Weekly** | ≤ 1 week old |
| 3 | **All 150 branches available for pricing** | **Monthly** | ≤ 1 month old |
| — | Anything beyond the 150 | **never** | out of scope — do not verify |

- **Main branch is derived from data**, not hardcoded: per office, the branch with the highest
  invoice spend = its main branch. Self-maintaining; recompute on a slow cadence (≥ weekly).
- **"Within 2-hour drive time"** is a real drive-time computation from each PE office to each ABC
  branch — use the Google Maps keys in the agent `.env` (`GOOGLE_MAPS_SERVER_KEY`). Compute once,
  cache, refresh occasionally (branches/offices change rarely).
- **Multi-office:** daily scope = N main-branch agreements (one per office). Today: derive N from
  the data; design for multi-office from the start.

---

## 1. `morning_abc_sync` — daily variance audit  ✅ LOCKED

**Trigger:** daily, 7:00a CT (`0 7 * * *`). Runs the **full in-scope set every run** (idempotent — paid invoices drop out automatically).
**Goal:** audit **open, unpaid invoices that are ≥60 days past invoice date** against the best available price benchmark and route overcharges by severity — catching them before payment.

**Scope filter (all three AND'd) — validated 2026-06-28:**
- **Open / non-paid only** — `abc_invoices.date_paid IS NULL` (ABC AR `ar_status='open'`). Paid invoices are out of scope (no recovery after payment).
- **Aged ≥60 days** — `invoice_date ≤ run_date − 60 days` (rolling; run 6/29 → `≤2026-04-30`, run 7/6 → `≤2026-05-07`).
- **Not a credit memo** (`is_credit_memo = false`).
- *(Tomorrow's first run = 17 invoices.)* Branch resolved from the invoice `ship_to_number`.

**Process — per line, take the FIRST benchmark that applies:**
1. **Check 1 — Vendor/Branch agreement matched?** (existing `v_invoice_audit_line` logic: branch + `effective_date ≤ invoice_date` + UOM). Matched → variance vs **agreement price**. Done.
2. **No matched agreement →** flag a coverage gap to **Jordan** ("full price agreement needed" — **all** unmatched go to Jordan; §3a), **and** run **Check 2 — API price** (`v_branch_item_api_price` for the invoice's branch+item, UOM-aligned):
   - invoice price **> API** → variance vs **API price**.
   - invoice price **≤ API** → **Check 3 — newest prior invoice**, same item **at the same branch**: variance vs that **last-paid price**. No prior at that branch → no variance flag (the Jordan coverage flag still stands).
3. **Variance % = (invoice_price_per_uom − benchmark_price) ÷ benchmark_price**; dollar impact = × qty. Only **positive** variances (overcharges) flag.
4. Apply the decision model below. Write an attributed `dashboard_action_log` row per line (decision = bucket + **benchmark used** + % and $).

**Decision model — per-INVOICE gross-overcharge floor** (validated 2026-06-28 against `v_invoice_audit_line`; supersedes the old per-line 0–3 / 3–6 / ≥6 tiers and the flat $50/$200)

Decision unit = the **invoice**, not the line. Per invoice, compute **gross overcharge = Σ `variance_ext` over auditable lines where `variance_pct > 0`** (undercharges are NOT netted against overcharges) — regardless of which benchmark (agreement / API / last-paid) each line used.

| Per-invoice gross overcharge | Action |
| --- | --- |
| **< $25** | **Approve the whole invoice**, flag for the **weekly review session**. No hold, no Slack — even if it contains an isolated ≥6% line (those are tiny-dollar; absorbed deliberately). |
| **≥ $25** | **ACTION invoice.** Within it: every line **≥6%** → `not-to-be-paid` (Track C hold) + Casey credit-memo candidate; lines **3–6%** → weekly digest (no real-time Slack). One real-time Slack hold notice per invoice. |

- **3–6% real-time approval tier is removed** (was §4, routed to Lucinda). At observed volume it was ~$3/line — negative ROI. 3–6% now reports in the weekly digest only.
- **Recurring same-item overcharges** (same SKU overcharged across multiple invoices) are grouped and escalated as **systematic** (nepq "call it out explicitly"), not as independent lines.
- **No-agreement lines do NOT go to weekly review individually.** Emit **one coverage signal** (count + top items by spend) to `agreement_coverage_verification` (§3a). At ~60% of recent lines, per-line routing is pure noise.

**Outputs**
- `dashboard_action_log` rows (attributed to `alex-rivers`) for every audited invoice — decision = bucket + gross overcharge $.
- ACTION invoices (≥$25 gross): payment-state flip to `not-to-be-paid` for ≥6% lines + `credit_memo_candidate` work item for Casey + **one** Slack hold notice. (During tests: Slack → Chris, never Lucinda.)
- One coverage signal to §3a for no-agreement lines. 3–6% lines and <$25 invoices accumulate to the weekly digest.

**Escalation:** any single line ≥6% over a high dollar threshold, or a vendor with repeat ≥6% hits, is called out explicitly (not buried) per the nepq skill.

**Edge cases**
- No agreement matched → flag Jordan (§3a) **and** fall through to API price, then newest same-item/same-branch invoice (do NOT treat as 0%). Only if all three benchmarks are unavailable is the line un-auditable (Jordan flag only).
- SKU not in catalog → flag (Casey needs a different approach) — don't silently drop.
- Expired agreement still being applied → flag as dispute risk.

---

## 2. `agreement_ingestion_sweep` — daily agreement refresh  ✅ DESIGNED (NEW — needs build)

**Trigger:** ~6:30a CT, Mon–Fri — **before** `morning_abc_sync`.
**Goal:** consolidate negotiated agreements from all sources into the DB canonical layer so the 7a audit reads one fresh, normalized source.

> **RE-SCOPE (validated 2026-06-28).** The canonical target **already exists** — `abc_price_agreements` (+ `abc_price_list_items`, `abc_price_agreement_branch_matches`), well-shaped with effective/expiry dates, `staleness_status`, provenance (`source_file`/PDF) and a `ceo_verified` trust flag. The "does a canonical table exist?" open item is **resolved — no new schema needed.** The **source extractors** (Drive/Slack/Dropbox) are NOT built, so a daily *ingestion* sweep is a no-op today. **Daily run is therefore re-scoped to an agreement FRESHNESS AUDIT** (expired / expiring ≤30d / stale-version → flag to Chris). Auto-ingestion from Drive/Slack/Dropbox is split into a separate build effort, NOT a daily cron. Also reconcile `staleness_status` vs calendar lifecycle — compute lifecycle from `effective_date`/`expiry_date`, don't trust the stored flag (an agreement expiring in 2 days was labeled `ok`; 5 expired agreements are still on file).
**Scope (per Agreement Priority, §0):** the **daily** sweep refreshes **Tier 1 — main-branch agreements only** (one per PE office, branch derived by spend volume). Tier 2 (2hr-radius) is refreshed by the weekly task; Tier 3 (all 150) by the monthly task. The audit always reads the canonical DB, so far-branch invoices are still audited daily — just against an agreement at its tier's freshness.

**Sources → canonical DB**
- Supabase price layer (already canonical — the merge target).
- Google Drive (agreement PDFs/sheets).
- Slack (agreement files **and** conversations where a price was agreed, e.g. a rep posts "we settled $X/sq with vendor Y").
- Dropbox repository.

**Process (design intent — implementation TBD)**
1. Pull new/changed agreement artifacts from each source since last sweep.
2. Extract: vendor, item/SKU, agreed price, UOM, effective dates, branch/region scope. Normalize to **ABC pricing UOM**.
3. Upsert into the canonical agreement table (additive; never destroy prior versions — keep history + provenance: source, source_url, retrieved_at).
4. On conflict between sources, record both and flag for human reconciliation (DB is authoritative but the conflict is surfaced, not silently dropped).
5. Write a `dashboard_action_log` summary (counts ingested per source, conflicts flagged).

**Open items (decide before build)**
- Canonical agreement table shape (does one exist, or is this new schema? — additive migration if new).
- Slack-conversation extraction is unstructured (OCR/LLM parse) — accuracy bar + human confirm before an extracted verbal price becomes `instruction`-grade. Default `evidence` tier.
- Dropbox access/credentials in the agent profile (not currently provisioned — audit `.env`).

---

## 3. `variance_daily_summary` — end-of-day rollup  ✅ LOCKED

**Trigger:** 5:00p CT, Mon–Fri (`0 17 * * 1-5`).
**Goal:** a daily tier rollup + the day's still-open loops. **Silent if nothing happened.**

**Content (NEPQ format, to `#accounting-product-catalog-review`)**
```
🔍 Alex EOD | {date} — {invoices} invoices, {lines} lines audited (vs current agreements)
💰 Held (≥6% on ≥$25 invoices): {action_invoices} invoices · {held_lines} lines · ${held} → pulled from To-Be-Paid
📋 Weekly review: {lines_3to6} lines (3–6%) + {sub25_invoices} sub-$25 invoices auto-approved
🔍 Coverage: {coverage_gap_lines} lines no agreement → {jordan_items} to Jordan, {datafix_items} data-fix
→ Needs you: approve credit-memo candidates on the {action_invoices} held invoices; {≥6% holds open >24h}
```
- Real-time flags during `morning_abc_sync` handle the urgent path; this is the digest + open-loop reminder.
- Pulls counts from the day's `dashboard_action_log` rows (single source).
- Silent if zero variances and zero open loops.

---

## 3a. `agreement_coverage_verification` — catalog coverage + gap → Jordan  ✅ DESIGNED

**Trigger:** **(a) event** — whenever a new agreement is ingested (§2); **(b) periodic** — a full
catalog-coverage scan **monthly** (runs with the Tier-3 / all-150 refresh to catch drift).
**Goal:** confirm agreements cover the **entire global price catalog**; route gaps to Jordan so he
can request the missing/out-of-tolerance coverage from the vendor.

> **Current decision (2026-06-28): ALL unmatched lines → Jordan** (no triage split), to keep the live audit simple. The 3-bucket triage below is **retained as a future refinement** — turn it on if Jordan gets too much already-priced noise (~16 items/window are "exists but unlinked").

**Triage gate (future refinement — NOT every gap need go to Jordan).** Split each gap into three buckets:
1. **True gap → Jordan** — item is in **no** negotiated price list at all (in scope per §0). Jordan generates the vendor request. *(Current window: ~115 distinct items.)*
2. **Data-fix → NOT Jordan** — item **is** in a price list but the line missed on branch / agreement-version / UOM. A linkage problem, not a negotiation gap; route to the data-fix bucket (Roberto/ops), never to Jordan. *(Current window: ~16 items.)*
3. **Priced-but-out-of-range → Jordan** — coverage exists but the agreed price is out of tolerance vs the GPA benchmark (`v_office_ground_price`: `neg_mean` / `lowest_open_invoice_price`; see [docs/51](51-global-price-agreement-best-vendor-and-ocr-ingest.md)).

> Sending Jordan after bucket-2 items would mean re-negotiating pricing PE already holds — the triage gate prevents that. Baseline = `v_price_list_global` (379 priced items) or the purchased-item set; benchmark = `v_office_ground_price`. Note `v_top20_negotiation_dashboard` is currently empty.

**Process**
- **On new agreement:** diff what the agreement covers (vendor/branch × items, in ABC pricing UOM)
  against the global price catalog → list the items it leaves uncovered or prices out of range.
- **Monthly full scan:** for every in-scope branch (Tier 3 = the 150), check each catalog item for
  coverage + tolerance vs the GPA benchmark → consolidated gap list.
- Compile gaps grouped by **vendor/branch** (Jordan generates one request per out-of-tolerance
  vendor/branch).
- Write attributed `dashboard_action_log` rows (decision = `coverage_gap`, payload = the gap set).

**Handoff — Alex → Jordan**
- Alex delivers the gap list (the analysis). **Jordan generates the price-agreement request** for each
  out-of-tolerance vendor/branch (the outbound ask). Alex never sends — stays in the analyze lane.

**Outputs:** gap report to Jordan (Slack/work item) + `dashboard_action_log`. **Silent if no gaps.**

**Dependencies (added to backlog):** a defined **global price catalog** (the authoritative item set
that *should* have coverage); the **GPA best-vendor/branch benchmark** + tolerance % (docs/51);
**Jordan's request-generation SOP** (Jordan's own SOP, future walkthrough).

---

## 3b. `gap_followup_cadence` — 7-day gap SLA → Jordan  ✅ DESIGNED

**Trigger:** daily.
**Goal:** **no open coverage gap (§3a) goes more than 7 days without another price-agreement request.**

> **Owner confirmed = Jordan (2026-06-28).** The deployed `dashboard_work_items` `price-agreement-gap` model currently routes to Lucinda/@ob-accounting (Roberto on product/UOM/branch, Chris on escalation) — overridden: gaps go to **Jordan**. Reassign existing gap items and point the generator at Jordan. Wire the SLA fields the cadence needs: when §3a creates a gap, stamp `due_at = created_at + 7d` and `cycle_count` in `source_data` (today `due_at` is NULL, so nothing ages — a live gap has sat 20 days with zero follow-up, which is exactly this cadence's reason to exist).

**Process**
1. Pull open gaps (tracked as work items with `gap_found_at`, `last_request_at`, `status`).
2. For each open gap where `now − last_request_at ≥ 7 days`: **nudge Jordan** to send another
   request. Jordan sends → `last_request_at` resets → the 7-day clock restarts. Rolling weekly
   re-request until the gap closes. (Alex flags; Jordan sends — analyze lane preserved.)
3. Write a `dashboard_action_log` row per nudge (decision = `gap_followup`, with cycle count + age).

**Close condition (auto):** the gap closes when the next `agreement_ingestion_sweep` sees the item
is now **covered and in-tolerance** vs the GPA benchmark. Self-resolving from the data — no manual
close required.

**Escalation:** after **N re-request cycles** with no resolution (default **3 cycles ≈ 21 days**,
tunable), Alex escalates to **Chris** — the vendor isn't responding — rather than nagging Jordan
indefinitely.

**Output:** per-gap nudge to Jordan; escalation to Chris at the threshold. Silent if no gap is due.

---

## 3c. `weekly_payment_package` — Monday deliverable  ✅ DESIGNED 2026-06-28 (NEW — needs build)

**Trigger:** Monday (weekly), after the week's dailies. **Final deliverable of Alex's weekly task.**
**Goal:** roll the week's per-invoice daily decisions into the two end-files accounting needs, both delivered as **Slack URL download links**.

**Daily vs weekly comms (the cadence contract):**
- **Daily** — `morning_abc_sync` communicates **per-invoice**: one Slack message per actioned invoice (the ≥6% hold notice + that invoice's decisions). No bulk file daily. (Tests → Chris, not Lucinda.)
- **Monday** — generate + post the two CSVs below as **Slack download URLs** (link, not inline attachment) to the accounting channel (tests → Chris).

**Deliverable 1 — Invoices-to-be-paid QuickBooks CSV** (existing Track C export)
- The week's approved `to-be-paid` set as the **locked-column QuickBooks import CSV, one file per vendor** (reuse `process-batch` / `buildVendorFileName`, schema 153). This is the pay file.

**Deliverable 2 — Detailed decision work CSV (NEW file creation)**
- **Full invoice line-item detail** for every line Alex reviewed that week, carrying the **notes, pricing, and logic behind every decision**. One row per line:
  - invoice #, vendor, branch/office, item #, description, qty, UOM
  - invoice price, **benchmark price + `benchmark_source`** (negotiated / API / recent / org_inv / none), variance % and $
  - **decision/disposition** (hold+credit-memo / weekly / approved / coverage-gap→Jordan), **note/logic** (why the call), agent (Alex), decided-at timestamp
- Source: `v_invoice_audit_line_cascade` + the week's `dashboard_action_log` decisions (actor `alex-rivers`). This is the explainability / audit-trail file — every call Alex made, defensible per line.

**Outputs:** both CSVs written to storage; one Slack message with the two download URLs; an attributed `dashboard_action_log` row for the weekly package.

## 4. Slack approval handler — 3–6% tier  ⛔ SUPERSEDED 2026-06-28

> The real-time 3–6% approval tier was **removed** (§1): 3–6% now reports in the weekly digest only, so there is no real-time Slack approval to handle. The only real-time Slack from `morning_abc_sync` is the ≥6% hold notice (no interaction needed). Kept for history; do not build. The ≥6% credit-memo candidate is created directly by `morning_abc_sync`, not by an approval handler.

*(Original design, no longer in scope:)* When Lucinda approves a 3–6% flag in Slack (button/interaction), a handler **immediately**:
1. Creates the Casey `credit_memo_candidate` work item.
2. Writes a `dashboard_action_log` row (actor = Lucinda, decision = `approve`, links the originating Alex finding).
3. Optionally marks the invoice `not-to-be-paid` if approval is configured to also hold payment (default: candidate only; hold reserved for ≥6%).

**Needs:** Slack interactive endpoint wiring (the app already has `slack_mirror_events` + a Slack runtime; this adds an inbound interaction handler). Tracks the same `dashboard_action_log` seam.

---

## 5. Dependencies & build backlog surfaced by the daily SOPs

1. **`agreement_ingestion_sweep`** — new daily job + (likely) new canonical agreement schema + Drive/Slack/Dropbox extractors + Dropbox creds in Alex's `.env`.
1a. **Main-branch derivation** — per-office spend aggregation to pick each office's main branch (Tier 1), recomputed ≥ weekly.
1b. **Drive-time tiering** — Google Maps drive-time from each PE office to ABC branches to build the Tier 2 (≤2hr) set; cached, refreshed occasionally. Uses `GOOGLE_MAPS_SERVER_KEY`.
1c. **150-branch pricing list** — the canonical set of branches PE has pricing access to (Tier 3 boundary; "stop" beyond it).
2. **Slack approval handler** — inbound Slack interaction endpoint → Casey candidate + action-log.
3. **Track C integration** — `morning_abc_sync` ≥6% must call the invoice payment-state flip to `not-to-be-paid` (reuse the Track C `derivePaymentState` / payment-targets seam).
4. **Maya → Alex handoff** — confirm the work-item contract Alex consumes (what Maya writes that Alex reads each morning).
5. **Dashboard recording helper** — `logDashboardAction()` + Alex's write path (direct Supabase via the now-provisioned service token, or `/api/agent/activity`).
6. **ABC token endpoint** — Alex/abc-supply-api skill must use `<ABC_SUPPLY_AUTH_BASE_URL>/v1/token` (Okta), confirmed working 2026-06-28.
7. **Global price catalog** — the authoritative item set that should have agreement coverage (the §3a baseline).
8. **GPA best-vendor/branch benchmark + tolerance %** — the reference for "priced-but-out-of-range" gaps (docs/51).
9. **Jordan request-generation SOP** — Jordan turns Alex's gap list into per-vendor/branch price-agreement requests (Jordan's own SOP, future).
10. **Gap tracking** — gaps stored as work items with `gap_found_at`, `last_request_at`, `cycle_count`, `status` so §3b can age them, auto-close on coverage, and escalate at N cycles.
11. **`weekly_payment_package` (§3c)** — Monday generator producing (a) the per-vendor QuickBooks invoices-to-be-paid CSV (reuse Track C) and (b) the **NEW detailed decision work CSV** (per-line: pricing, benchmark + source, variance, decision, note/logic, agent — from `v_invoice_audit_line_cascade` + week's `dashboard_action_log`). Writes both to storage, posts Slack message with two download URLs.

---

## 6. TODO — remaining cadences (next walkthroughs)
- **Weekly:** final deliverable = **`weekly_payment_package`** (Monday) — the two CSVs via Slack URL (§3c, designed). Also owns **Tier 2 agreement freshness** (refresh all branches within 2hr drive time of each office) + tasks `abc_catalog_sync`, `price_agreement_expiration_check`, `variance_weekly_digest` (consumes the 0–3% weekly-review bucket).
- **Monthly:** owns **Tier 3 agreement freshness** (refresh all 150 branches; stop beyond). Tasks: `vendor_performance_scorecard`, `price_list_validation`.
- **Quarterly:** `contract_renewal_prep`.
- **Annual:** `vendor_audit_deep_dive`.
