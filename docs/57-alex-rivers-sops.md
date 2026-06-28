# 57 — Alex Rivers SOPs (Pricing Variance Analyst)

**Date:** 2026-06-28
**Status:** Daily SOPs designed (this session). Weekly / monthly / quarterly / annual = TODO (subsequent walkthroughs).
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

**Trigger:** 7:00a CT, Mon–Fri (`0 7 * * 1-5`).
**Goal:** audit the prior day's invoice lines against negotiated agreements and route by severity.

**Inputs**
- Invoice lines Maya flagged since yesterday 5:00p (the Maya → Alex handoff; intake work items). **All** invoices are audited daily regardless of which branch they came from (the tier only sets agreement freshness, §0).
- **Agreements from the DB canonical layer** (fed by `agreement_ingestion_sweep`, §2). One source of truth at run time; freshness per branch tier.
- ABC catalog (for SKU resolution) + `v_item_uom_map` (for UOM alignment).

**Process**
1. Pull the flagged invoice lines.
2. Resolve each SKU against the ABC catalog; align UOM via `v_item_uom_map`.
3. Look up the active agreement price for that item in the **ABC pricing UOM** (date-range check: `agreement_start ≤ invoice_date ≤ agreement_end`; apply branch/region tier).
4. Compute **variance % = (invoiced_price_per_uom − agreement_price_per_uom) ÷ agreement_price_per_uom**, AND the **dollar impact** (× qty).
5. Route by tier (below).
6. Write an attributed `dashboard_action_log` row per line (decision = tier + the % and $).

**Tiered decision model** (supersedes the old flat $50/$200)

| Variance % | Action |
| --- | --- |
| **0–3%** | Accept (within tolerance). Add the line to the **weekly-review bucket** (feeds `variance_weekly_digest`). No dispute, no Slack. |
| **3–6%** | **Flag to Lucinda in Slack for approval.** On her approval (event-driven, §4) → create a Casey credit-memo candidate. No payment hold unless she says so. |
| **≥6%** | **Mark the invoice `not-to-be-paid`** (Track C hold — pull it from the To-Be-Paid queue) → create a **Casey credit-memo candidate** → Slack notification. |

**Outputs**
- `dashboard_action_log` rows (all tiers).
- 3–6%: a Slack approval request to Lucinda (`#accounting-product-catalog-review`, `C0BD8U44HL3`).
- ≥6%: invoice payment-state flip to `not-to-be-paid` + `credit_memo_candidate` work item for Casey + Slack notice.

**Escalation:** any single line ≥6% over a high dollar threshold, or a vendor with repeat ≥6% hits, is called out explicitly (not buried) per the nepq skill.

**Edge cases**
- No agreement found for an item → cannot compute % → route to weekly review as "no-agreement" (do NOT treat as 0%); flag for the ingestion sweep / human.
- SKU not in catalog → flag (Casey needs a different approach) — don't silently drop.
- Expired agreement still being applied → flag as dispute risk.

---

## 2. `agreement_ingestion_sweep` — daily agreement refresh  ✅ DESIGNED (NEW — needs build)

**Trigger:** ~6:30a CT, Mon–Fri — **before** `morning_abc_sync`.
**Goal:** consolidate negotiated agreements from all sources into the DB canonical layer so the 7a audit reads one fresh, normalized source.
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
🔍 Alex EOD | {date} — {invoices} invoices, {lines} lines
Accepted (0–3%): {n}  ·  Pending your approval (3–6%): {n}  ·  Held ≥6%: {n} = ${held}
Top recurring: {vendor} ({overcharge type})
→ Needs you: {3–6% still awaiting Lucinda}; {≥6% holds open >24h}
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

**What is a gap (both kinds go to Jordan):**
1. **Missing coverage** — a catalog item × vendor/branch (in scope per §0) that has **no agreement price** at all.
2. **Priced-but-out-of-range** — coverage exists, but the agreed price is **out of tolerance vs the
   GPA "best vendor/branch" benchmark** (see [docs/51](51-global-price-agreement-best-vendor-and-ocr-ingest.md)).

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

## 4. Slack approval handler — 3–6% tier  ⚙️ SYSTEM COMPONENT (not a cron) — needs build

When Lucinda approves a 3–6% flag in Slack (button/interaction), a handler **immediately**:
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

---

## 6. TODO — remaining cadences (next walkthroughs)
- **Weekly:** owns **Tier 2 agreement freshness** (refresh all branches within 2hr drive time of each office). Tasks: `abc_catalog_sync`, `price_agreement_expiration_check`, `variance_weekly_digest` (consumes the 0–3% weekly-review bucket).
- **Monthly:** owns **Tier 3 agreement freshness** (refresh all 150 branches; stop beyond). Tasks: `vendor_performance_scorecard`, `price_list_validation`.
- **Quarterly:** `contract_renewal_prep`.
- **Annual:** `vendor_audit_deep_dive`.
