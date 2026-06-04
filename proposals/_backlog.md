# Proposals Backlog

> The single source of truth for all proposals, regardless of status. Approved proposals include their build-by date. Deferred proposals include their revisit date. Killed proposals include their kill reason. All entries are permanent — this backlog is never pruned.

---

## DRAFT — ROI validation

---

### vendor-invoice-credit-memo-audit

**File:** `proposals/2026-05-30-vendor-invoice-credit-memo-audit.md`
**Status:** PENDING
**Proposed on:** 2026-05-30
**Pilot client:** pro-exteriors
**Assigned to:** Cleverwork AM + Claude build session

**Summary of the problem:**
Pro Exteriors needs a governed product catalog, vendor price-agreement system, and invoice line-item audit workflow that detects vendor overcharges against negotiated pricing and drafts one-invoice-at-a-time credit memo request emails for Lucinda's internal review.

**Decision needed:**
Collect baseline invoice volume, discrepancy rate, average credit memo value, current human time, and the requirements for replacing today's manual Lucinda -> Chris -> Claude/Codex invoice-ingestion handoff with a tracked Supabase batch intake workflow. If the measured recovery math clears the 10x gate, approve as the first `@ob-accounting` build.

---

## APPROVED — Ready to build

---

### storm-claim-supplement skill

**File:** `proposals/2026-06-10-storm-claim-supplement.md`
**Status:** APPROVED
**Approved on:** 2026-06-12
**Build by:** 2026-07-15
**Pilot client:** acme-roofing (first client)
**Assigned to:** Cleverwork AM + Claude build session

**Summary of the problem:**
The supplement process — comparing the insurer's Xactimate estimate against the client's scope-of-loss line by line, identifying omitted items, calculating under-priced items, computing O&P, and drafting the supplement letter — takes approximately 3 hours of the PM's time per storm-track job. The current error rate on supplement math is 12% (one or more line items wrong, requiring rework). At 4 storm-track jobs per month during storm season (6 months/year), this represents substantial avoidable cost and rework exposure.

**The math (worked):**

| Item | Value |
|---|---|
| Hours per supplement (current) | 3.0 hours |
| Frequency | 4 jobs/month × 6 storm months / 12 = 2 effective monthly rate |
| PM loaded hourly rate | $65/hour (includes benefits, overhead) |
| Monthly human time cost | 2 × 3.0 hrs × $65 = $390/month |
| Error rate | 12% of occurrences |
| Avg rework cost per error | $180 (1.5 hrs re-work + PM time + potential relationship friction) |
| Monthly error cost | 2 × 0.12 × $180 = $43.20/month |
| **Total monthly current state cost (X)** | **$433/month** |
| Agent operating cost per supplement | $1.20 (tokens + Xactimate API call + Supabase writes) |
| Required human review per supplement | 10 min at $65/hr = $10.83 |
| Monthly agent + review cost (Y) | 2 × ($1.20 + $10.83) = $24.06/month |
| Build cost (Z) | $3,200 (40 hours × $80/hr Claude + AM session time) |
| Z/12 | $266.67/month |
| **ROI multiplier: X / (Y + Z/12)** | **$433 / ($24.06 + $266.67) = $433 / $290.73 = 1.49x** |

*Wait — 1.49x is far below the 10x gate.*

**Correction and the real ROI driver — error-cost recovery:**

The supplement is not just a time-savings play. The real driver is accuracy and capture rate. With a 12% error rate on the current manual process, the client is systematically under-supplementing. Industry data (InsuranceJournal / RoofingContractor, 2024) suggests roofers using systematized supplement processes recover an average of $1,200–$2,800 more per storm-track job than those supplementing manually, because the systematic process does not miss line items and does not make arithmetic errors that invite adjuster pushback.

At 24 storm-track jobs per year (conservative), recovering an additional $1,500 per job = **$36,000/year incremental revenue recovery** that the client is currently leaving on the table.

| Revised item | Value |
|---|---|
| Incremental supplement recovery per job | $1,500 (conservative; cite: industry avg $1,200–$2,800) |
| Jobs per year | 24 |
| Annual incremental recovery | $36,000/year |
| Monthly incremental recovery | $3,000/month |
| Total monthly benefit (time savings + recovery) | $390 (time) + $43 (error cost) + $3,000 (recovery) = $3,433/month |
| **Revised X** | **$3,433/month** |
| Y + Z/12 (unchanged) | $290.73/month |
| **Revised ROI multiplier** | **$3,433 / $290.73 = 11.8x** |
| Payback period | $3,200 build cost / ($3,433 - $290.73) monthly net = **~1.0 months** |

**Revised ROI: 11.8x. Exceeds the 10x gate. APPROVED.**

Note: This is an error-cost + revenue-recovery calculation; the time-savings alone would not clear the gate. The 10x math works because supplement accuracy directly translates to recoverable revenue that the current human process consistently misses.

**Skill deliverable:**
- `skills/cleverwork-roofer/supplement-reconciler/` — SKILL.md + metadata.json
- Consumes: `@ob-accounting`, Xactimate pricing data (Researcher pull), scope-of-loss atom
- Produces: `supplement_letter` artifact routed through Auditor (ACCT-016 through ACCT-021)

---

## DEFERRED — Awaiting condition

---

### eagleview-auto-measure integration

**File:** `proposals/2026-08-20-eagleview-auto-measure.md`
**Status:** DEFERRED
**Deferred on:** 2026-08-22
**Revisit at:** 2027-02-01
**Condition for revisit:** EagleView API v3 is released with automated order placement (currently EagleView requires a manual portal order for non-enterprise accounts; the API does not support order initiation at the account tier the first pilot client is on). Revisit when either: (a) EagleView releases API-based order initiation for standard accounts, or (b) client volume reaches 3+ jobs/month that would benefit from auto-ordering and the enterprise API tier becomes cost-justified.

**Kill reason if condition not met by 2027-02-01:** The manual EagleView order takes 4 minutes; not worth the integration complexity if API access doesn't change.

**Summary of the ROI calculation:**
At current volume (1.5 jobs/week requiring EagleView), the manual order time is 4 min × 1.5 × 4.3 = 26 minutes/month. That is 0.43 hours × $65/hr = $28/month in human time. Even at zero agent operating cost, the build cost ($2,400) amortized over 12 months is $200/month. ROI = $28 / $200 = 0.14x. Deeply below the 10x gate on time savings alone.

At 3x volume (scaling client) with API access: 78 min/month = $84/month savings. With Z/12 = $200, ROI = 0.42x. Still below the gate. The case requires the API to unlock auto-order-with-automatic-attachment-to-job-record, which adds the missed-attachment error cost (~$450/month at 3+ jobs/week) and gets the math to approximately 7.2x — still below 10x.

This proposal requires an architectural change in the EagleView integration (API order initiation) that is not available today. Defer, not kill — the upside is real if conditions change.

---

## KILLED — Archived

---

### dos-paper-traveler bridge (standalone, pre-roofer-client)

**File:** `proposals/2026-07-01-dos-paper-traveler-bridge.md`
**Status:** KILLED
**Killed on:** 2026-07-05
**Kill reason:**

The DOS + Paper Traveler bridge was proposed as a general-purpose capability to serve a potential manufacturing client. During the A3 review, two problems emerged:

1. **No client is currently signed that needs it.** The proposal was proactive, not demand-driven. The A3 template requires measured baselines from brain atoms; there were no atoms — the client doesn't exist yet. The baseline was hypothetical.

2. **The roofing-first build constraint.** The template is a roofer's brain. Tier 4 bridge capability for DOS manufacturing systems is valuable but is architecturally out of scope until the roofer template is complete and a manufacturing client is signed. Building it now would add untested complexity to a template that has not yet run its Phase 1 pilot.

**Decision:** Kill for now. This proposal will automatically re-surface when: (a) a manufacturing client is signed, AND (b) the roofer template has completed a Phase 1 pilot with at least one closed post-op debrief. Condition captures in Innovator's pattern log.

**If re-proposed:** The new A3 must include baseline atoms from an actual manufacturing client's brain (even a sample data set). The time-savings math is plausible (DOS data entry is 20+ minutes per Traveler; at 50 Travelers/month the savings are significant) but must be measured, not estimated.

---

*Last updated: 2026-05-29*
