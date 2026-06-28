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

---

## 1. `morning_abc_sync` — daily variance audit  ✅ LOCKED

**Trigger:** 7:00a CT, Mon–Fri (`0 7 * * 1-5`).
**Goal:** audit the prior day's invoice lines against negotiated agreements and route by severity.

**Inputs**
- Invoice lines Maya flagged since yesterday 5:00p (the Maya → Alex handoff; intake work items).
- **Agreements from the DB canonical layer** (fed by `agreement_ingestion_sweep`, §2). One source of truth at run time.
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

## 4. Slack approval handler — 3–6% tier  ⚙️ SYSTEM COMPONENT (not a cron) — needs build

When Lucinda approves a 3–6% flag in Slack (button/interaction), a handler **immediately**:
1. Creates the Casey `credit_memo_candidate` work item.
2. Writes a `dashboard_action_log` row (actor = Lucinda, decision = `approve`, links the originating Alex finding).
3. Optionally marks the invoice `not-to-be-paid` if approval is configured to also hold payment (default: candidate only; hold reserved for ≥6%).

**Needs:** Slack interactive endpoint wiring (the app already has `slack_mirror_events` + a Slack runtime; this adds an inbound interaction handler). Tracks the same `dashboard_action_log` seam.

---

## 5. Dependencies & build backlog surfaced by the daily SOPs

1. **`agreement_ingestion_sweep`** — new daily job + (likely) new canonical agreement schema + Drive/Slack/Dropbox extractors + Dropbox creds in Alex's `.env`.
2. **Slack approval handler** — inbound Slack interaction endpoint → Casey candidate + action-log.
3. **Track C integration** — `morning_abc_sync` ≥6% must call the invoice payment-state flip to `not-to-be-paid` (reuse the Track C `derivePaymentState` / payment-targets seam).
4. **Maya → Alex handoff** — confirm the work-item contract Alex consumes (what Maya writes that Alex reads each morning).
5. **Dashboard recording helper** — `logDashboardAction()` + Alex's write path (direct Supabase via the now-provisioned service token, or `/api/agent/activity`).
6. **ABC token endpoint** — Alex/abc-supply-api skill must use `<ABC_SUPPLY_AUTH_BASE_URL>/v1/token` (Okta), confirmed working 2026-06-28.

---

## 6. TODO — remaining cadences (next walkthroughs)
- **Weekly:** `abc_catalog_sync`, `price_agreement_expiration_check`, `variance_weekly_digest` (consumes the 0–3% weekly-review bucket).
- **Monthly:** `vendor_performance_scorecard`, `price_list_validation`.
- **Quarterly:** `contract_renewal_prep`.
- **Annual:** `vendor_audit_deep_dive`.
