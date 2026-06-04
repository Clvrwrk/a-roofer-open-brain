# Maintenance Kaizen Observations Log

> **Purpose:** Running log of playbook observations accumulated throughout each operating month. This is the raw material for the monthly A3-lite that Maintenance routes to Chris + AM via Conductor. See `docs/00-architecture-brief.md` §4.4 for the full Kaizen Review mechanics.
>
> **Format:** One entry per observation. Each entry goes in the relevant month's section. Do not edit prior months' entries after they are written — observations are append-only. If a prior observation was wrong, write a correction observation in the current month.
>
> **Outcome tracking:** After Chris/AM decision (Accept / Defer / Kill), record the decision in the "Decision" column of each applicable observation and add a "Playbook change ref" link to the merged version when accepted.

---

## Observation Entry Format

```
### OBS-[YYYY-MM]-[NNN]
**Date observed:** YYYY-MM-DD
**Phase triggered:** Sort | Set in Order | Shine | Standardize | Sustain
**Category:** high-frequency-rule | false-positive | false-negative | near-miss | new-pattern
**Description:**
[Concrete description of what happened. What rule fired? What did it catch or miss? What was the actual underlying situation?]
**Signal strength:** high | medium | low
[Why this signal strength? How many occurrences? What was the downstream impact?]
**Proposed playbook change:**
[Specific, actionable change to the PLAYBOOK.md. Quote the section and proposed new wording if possible.]
**Decision:** pending | accepted (v[N]) | deferred (revisit [YYYY-MM-DD]) | killed ([reason])
**Playbook change ref:** [link to version or n/a]
```

---

## [Month of first operation — fill in YYYY-MM when live]

*No observations yet. Entries will be added throughout the first operating month.*

---

## Worked Example (illustrative — not a real observation from live operation)

### OBS-2026-07-001
**Date observed:** 2026-07-14
**Phase triggered:** Shine (SH1 — trust-tier confidence refresh)
**Category:** false-positive
**Description:**
SH1 flagged 8 atoms from a post-op debrief conducted 2026-01-08 (6 months prior) as candidates for revalidation. All 8 atoms describe standard GAF Timberline installation procedure. The atoms are retrieved frequently (average 6x each in the last 90 days) because @ob-ops uses them as the default installation-reference atom set for all active jobs. The SH1 flag generated revalidation notes suggesting "human review if regulatory or technical content" — but these atoms describe a widely-accepted, product-specific manufacturer installation sequence that does not change with code updates. The revalidation notes created noise for @ob-ops without adding real signal.

**Signal strength:** medium
The false-positive pattern will repeat monthly unless addressed. Each false-positive adds ~3 minutes of @ob-ops attention cost (reviewing and dismissing the revalidation note). At current volume (8 atoms/month), that is 24 minutes/month of wasted attention. Not catastrophic, but compounding.

**Proposed playbook change:**
In PLAYBOOK.md §WEEKLY — Shine, SH1, add a filter condition before the revalidation flag:

*Before flagging, check: is the atom's `eeat_signal.type` = "Expertise" AND `source_type` = "granola" AND the content includes a manufacturer product name (GAF, CertainTeed, Owens Corning)? If yes, defer the revalidation flag to Standardize ST3 (monthly), not Shine SH1 (weekly). High-frequency retrieval of stable manufacturer installation atoms is expected behavior, not a staleness signal.*

**Decision:** accepted (v1.1)
**Playbook change ref:** agents/horizontal/maintenance/archive/PLAYBOOK-v1.0.md (see v1.1 for accepted change)

---

## A3-Lite Template (monthly)

> Copy this section to `proposals/maintenance/[YYYY-MM]-kaizen-a3-lite.md` at month end. Fill in from the observations above.

```
# Maintenance Kaizen A3-Lite — [YYYY-MM]

**Prepared by:** Maintenance agent
**Reviewed by (target):** Chris Hussey + AM
**Review deadline:** [first Monday of next month]

## 1. Rules that fired most this month
[Top 3 by occurrence count, from the observation log. What does high frequency tell us?]

## 2. Rules that fired but didn't catch the actual problem (false positives)
[List false-positive observations with a one-line description of what actually happened.]

## 3. Cases that should have been caught but weren't (false negatives)
[Atoms that Auditor or QC found to be problematic that Maintenance's rules did not flag. Root cause?]

## 4. Near-misses
[Atoms that almost became a problem. What barely saved them? Should the rule have fired sooner?]

## 5. New patterns of drift observed for the first time
[Any new conceptual territory, new failure modes, or new structural issues not seen in prior months.]

## 6. Proposed playbook changes
[One row per proposal. Reference the OBS-ID. Include: section affected, proposed change, estimated benefit.]

| OBS-ID | Section | Proposed change | Estimated benefit | Recommendation |
|---|---|---|---|---|
|  |  |  |  | Accept / Defer / Kill |

## 7. Observations with no proposed change (logged for pattern tracking only)
[Observations that don't yet warrant a playbook change but should be watched.]
```
