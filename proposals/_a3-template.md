# A3: [Proposed Skill or Integration Name]

Proposed by: [Innovator | Chris | Account Manager]
Date: YYYY-MM-DD
Status: pending | approved | killed | deferred (revisit_at: YYYY-MM-DD)
Affected clients: [list client slugs, or "template-wide" for all future clients]
A3 file: proposals/YYYY-MM-DD-[skill-name].md

---

## 1. The problem (measured)

- **Task being performed today:** [verb + specific object — e.g. "manually reconciling Xactimate supplement line items against insurer response"]
- **Frequency:** [N times per week per client — cite the atom or Conductor log that gives this number]
- **Time per occurrence:** [minutes of human time — cite source]
- **Error rate:** [N% of occurrences produce a defect requiring rework — cite source]
- **Cost of error:** [$avg per defect including rework + downstream client impact — show the math]
- **Total monthly human cost:**
  - Hours per month = (frequency per week × time per occurrence / 60) × 4.3 weeks = [N hours]
  - Loaded hourly rate = $[X] (from `config.accounting.loaded_hourly_rate` or AM's estimate)
  - Error cost per month = (frequency per week × 4.3 × error rate) × cost per error = $[Y]
  - **Total: [N hours × $X] + $Y = $[TOTAL monthly human cost]**

---

## 2. Root cause (5 Whys — brief)

1. Why does this task consume human time?
   — [Answer]
2. Why is it not already automated?
   — [Answer]
3. Why are the existing tools (AccuLynx / QuickBooks / CompanyCam / etc.) inadequate for this?
   — [Answer]
4. Why has this not been a Cleverwork priority until now?
   — [Answer]
5. Why now?
   — [Answer — what changed: volume, error frequency, new tool surface, model capability, client pain point]

---

## 3. Proposed solution

- **Which agent receives this skill:** [vertical: accounting | ops | sales | marketing | exec] or [horizontal: auditor | capture | conductor | etc.]
- **What the skill does:** [One clear paragraph describing input → process → output. No jargon without definition.]
- **OB1 / InfraNodus / Dynamous primitive it builds on (if any):** [Cite by name and path — e.g. "OB1 `meeting-synthesis` skill as the transcript-parsing primitive"]
- **Integration required (if any):** [Cite by bridge path — e.g. "AccuLynx bridge Tier 1 already deployed; this skill adds a new endpoint to the existing adapter"]
- **Trust tier of output:** [instruction | evidence | inference] — justify

---

## 4. The new state (projected)

- **Time per occurrence post-skill:** [minutes — human review only, if any]
- **Error rate post-skill:** [% — projected; conservative estimate]
- **Cost of agent operation per occurrence:** $[X] — [break down: token cost estimate + API costs + infra amortization]
- **Required human review:** [Yes/No — if Yes: what specifically, estimated minutes, and why human review is needed]

---

## 5. The math

| Item | Value |
|---|---|
| Total monthly cost, current state (X) | $[N hours × rate + error cost] |
| Total monthly agent operating cost, new state (Y) | $[occurrences/mo × cost/occurrence + human review hours × rate] |
| One-time build cost (Z) | $[engineering hours × rate + tooling] |
| Build cost amortized over 12 months (Z/12) | $[Z/12] |
| **ROI multiplier: X / (Y + Z/12)** | **[RESULT — must be ≥ 10 to proceed]** |
| Payback period | [X_monthly_savings / Z × 12 = N months] |

**Exempt from 10x gate?** [Yes / No]
If Yes: [Mission-grade infrastructure / High-error-cost task — explain]

---

## 6. Risks

- **What breaks if this skill misbehaves?**
  — [Specific failure modes and their consequences]
- **Rollback path:**
  — [How to disable the skill without data loss; what happens to in-flight atoms]
- **Trust tier of output:**
  — [Repeat from §3; explain why this tier is appropriate]
- **New consent flags required?**
  — [Yes/No — if Yes: which flags, and how are they surfaced to the client]
- **New standards checks required?**
  — [Yes/No — if Yes: which domain standard needs a new DMAIC-triggered revision after pilot]

---

## 7. Alternative considered

- **Leave it human:**
  — [One sentence: why not, or under what conditions the human-stays decision would be revisited]
- **Defer until condition X:**
  — [What condition (volume threshold, error rate threshold, model price drop) would make this proposal stronger; when to revisit]

---

## 8. Decision

- [ ] **Approve** — build by [YYYY-MM-DD]; pilot client: [client slug]
- [ ] **Kill** — reason: [text]
- [ ] **Defer** — revisit at: [YYYY-MM-DD], condition: [specific measurable condition]

Approver: [Chris | Account Manager | both]
Approved / decided on: YYYY-MM-DD

---

## 9. Post-build tracking (completed after pilot)

*Fill in after 2-week pilot period.*

- Actual time per occurrence post-skill: [minutes]
- Actual error rate post-skill: [%]
- Actual ROI multiplier: [X_actual / (Y_actual + Z/12)]
- Promoted to template-default: [Yes / No / Pending]
- QC observation: [Pass | Revise | Kill]
