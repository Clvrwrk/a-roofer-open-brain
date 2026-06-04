# A3-Lite: Maintenance Playbook Evolution Proposal

> This is the lightweight A3 format for proposing changes to the Maintenance agent's PLAYBOOK.md. It is intentionally shorter than the full A3 because playbook changes do not require build cost or ROI math — they are adjustments to the Maintenance agent's own operating procedures. The governance gate is still applied (Chris + AM review), but the bar is evidence of observed behavior, not financial projection.

Proposed by: Maintenance agent
Month: YYYY-MM
Playbook version targeted: [e.g. v1.2 → v1.3]
Status: pending | accepted | deferred | killed

---

## 1. Observation

*What did Maintenance observe this month that suggests the playbook needs to change?*

- **Rule / phase affected:** [e.g. "Daily Sort — fingerprint-dedup", "Weekly Shine — external URL HEAD check"]
- **Observation type:** [false_positive | false_negative | high_frequency | near_miss | new_pattern]
- **Frequency this month:** [N occurrences]
- **Description:**
  [Two to four sentences describing what happened. Cite the specific observation log entry or Auditor reject atom if applicable. Be concrete: "The fingerprint-dedup rule fired 47 times this month on atoms that were NOT true duplicates because the debrief transcript contains repeated phrases from the blameless framing script. All 47 were flagged for QC unnecessarily."]

---

## 2. Impact of current behavior

- **Cost of false positive:** [e.g. QC distracted; near-miss: legitimate duplicates could be overlooked in the noise]
- **Cost of false negative (if applicable):** [e.g. stale atoms not flagged; rot not caught]
- **Observed downstream effect (if any):** [Did any Auditor reject or QC flag trace back to this Maintenance behavior?]

---

## 3. Proposed playbook change

*State the change in specific, implementable terms. If a rule is being modified, write both the current rule and the proposed replacement.*

**Current rule (exact text from PLAYBOOK.md):**
```
[paste current rule verbatim]
```

**Proposed replacement:**
```
[write proposed new rule text]
```

**Or, if adding a new rule:**
```
[write new rule text; specify which phase it belongs to (Sort / Set in Order / Shine / Standardize / Sustain) and where in the sequence it should run]
```

**Or, if retiring a rule:**
```
[state which rule is retired and why it is no longer needed]
```

---

## 4. Expected outcome

- **What changes in Maintenance's behavior:** [one sentence]
- **What the false positive / false negative rate becomes:** [if estimable]
- **Risk of the proposed change:** [What could go wrong if this change is applied; what would we watch for in the next month]

---

## 5. Rollback

If the change makes things worse in the next month, what does Maintenance do?

- [One sentence describing how to revert: "Restore the prior rule text from PLAYBOOK-v1.N-1.md in the archive folder; no data changes required."]

---

## 6. Decision

- [ ] **Accept** — apply change; increment minor version to v[X.Y+1]; effective on next cron boundary
- [ ] **Defer** — Maintenance keeps observing; revisit next month
- [ ] **Kill** — archived with reasoning; Maintenance flags only if the pattern recurs 3+ times

Chris / AM comment: [optional]
Decided on: YYYY-MM-DD

---

## Playbook version log

*Append one line per accepted proposal. Maintained in the playbook itself, not here.*

| Version | Date | Change summary | A3-lite ref |
|---|---|---|---|
| v1.0 | 2026-05-29 | Initial playbook. | N/A (seed) |
