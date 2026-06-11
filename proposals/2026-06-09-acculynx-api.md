# A3: AccuLynx API Skill and Reference

Proposed by: Chris
Date: 2026-06-09
Status: approved
Affected clients: template-wide for roofing clients using AccuLynx
A3 file: proposals/2026-06-09-acculynx-api.md

---

## 1. The problem (measured)

- Task being performed today: agents inspect AccuLynx endpoints ad hoc while maintaining the primary PM bridge.
- Frequency: every AccuLynx bridge build, backfill, webhook task, or troubleshooting session.
- Time per occurrence: 20-60 minutes of repeated endpoint discovery and schema checking.
- Error rate: high enough to already leave stale/missing references; the bridge cited an `acculynx-api` skill that did not exist.
- Cost of error: wrong endpoint selection can miss jobs/leads, financials, insurance data, or webhook triggers.
- Total monthly human cost: not yet instrumented; this is mission-grade integration infrastructure for the Tier 1 PM adapter.

---

## 2. Root cause (5 Whys - brief)

1. Why does this task consume human time?
   - AccuLynx docs are spread across ReadMe guide pages, endpoint pages, changelog pages, and embedded OpenAPI snippets.
2. Why is it not already automated?
   - The bridge had source notes but no generated endpoint index or executable agent skill.
3. Why are the existing tools inadequate?
   - Plain web browsing does not preserve a durable, repo-local endpoint catalog for future agents.
4. Why has this not been a Cleverwork priority until now?
   - The bridge was scaffolded before live AccuLynx work demanded repeatable endpoint planning.
5. Why now?
   - Chris requested a full API document and skill, and the docs expose `llms.txt` plus OpenAPI blocks suitable for generation.

---

## 3. Proposed solution

- Which agents receive this skill: Capture, Conductor, Auditor, Sales, Ops, and Accounting.
- What the skill does: loads the generated AccuLynx API index/reference, selects safe endpoints, applies bridge-specific mapping rules, and gates production writes/webhook changes.
- Primitive it builds on: Web Intel source extraction plus local OpenAPI generation.
- Integration required: existing `integrations/bridges/acculynx` Tier 1 bridge.
- Trust tier of output: evidence, because endpoint details are sourced from AccuLynx public docs and generated into durable local files.

---

## 4. The new state (projected)

- Time per occurrence post-skill: 3-10 minutes for endpoint selection and request planning.
- Error rate post-skill: materially reduced through generated OpenAPI index, safety rules, and bridge gotchas.
- Cost of agent operation per occurrence: negligible local lookup; optional Web Intel refresh only when docs need updating.
- Required human review: yes for production writes, deletes, webhook subscription changes, and any customer-specific milestone/topic mapping.

---

## 5. The math

| Item | Value |
|---|---:|
| Total monthly cost, current state (X) | Not instrumented |
| Total monthly agent operating cost, new state (Y) | Near-zero for local lookup |
| One-time build cost (Z) | One agent build session |
| Build cost amortized over 12 months (Z/12) | Minimal |
| ROI multiplier: X / (Y + Z/12) | Exempt |
| Payback period | First serious AccuLynx bridge/debug task |

Exempt from 10x gate? Yes. This is mission-grade infrastructure for the primary PM adapter; avoided-error cost is the ROI driver.

---

## 6. Risks

- What breaks if this skill misbehaves?
  - Agents may choose stale endpoints or execute unsafe write operations.
- Rollback path:
  - Remove or ignore `skills/cleverwork-roofer/acculynx-api`; bridge docs still cite direct public source URLs.
- Trust tier of output:
  - Evidence; production actions still need human approval when they mutate AccuLynx.
- New consent flags required?
  - No.
- New standards checks required?
  - No; existing security and bridge review rules apply.

---

## 7. Alternative considered

- Leave it human:
  - Rejected because AccuLynx is the primary PM adapter and ad hoc lookup already produced a missing-skill gap.
- Defer until production credentials:
  - Rejected because endpoint planning and safety gates should exist before production credentials are used.

---

## 8. Decision

- [x] Approve - build by 2026-06-09; pilot client: Pro Exteriors / AccuLynx bridge work.
- [ ] Kill
- [ ] Defer

Approver: Chris
Approved / decided on: 2026-06-09

---

## 9. Post-build tracking

- Actual time per occurrence post-skill: pending pilot.
- Actual error rate post-skill: pending pilot.
- Actual ROI multiplier: pending pilot.
- Promoted to template-default: pending.
- QC observation: pending.
