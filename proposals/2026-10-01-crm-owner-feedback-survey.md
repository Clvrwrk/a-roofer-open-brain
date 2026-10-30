# A3: Homeowner feedback on the CRM Job profile

Proposed by: Chris (Phase 4 of the CRM profile pages, CRM `docs/delivery/PROFILE-PAGES.md`)
Date: 2026-10-01
Status: pending
Affected clients: pro-exteriors
A3 file: proposals/2026-10-01-crm-owner-feedback-survey.md

---

## 1. The problem (measured)

- **Task being performed today:** asking a homeowner how the job went after completion, and recording the answer where the team can see it. Today **nothing is recorded anywhere**: there is no review, survey, NPS or reputation table in the shared project, the CRM models no owner feedback (Job profile shows "Owner feedback: Not connected"), and the marketing `reviews` skill named in `agents/vertical/marketing/skills.md` does not exist on disk.
- **Frequency:** ~**30 jobs/month** reach "Completed" for the first time (AccuLynx milestone history, 2026: Jan 56, Feb 9, Mar 21, Apr 27, May 23, Jun 35, Jul 27, Aug 40, Sep 25; 2025 ranged 9–48). "Closed" is batch-lumpy (Mar 116, Sep 4), so Completed is the trigger.
- **Time per occurrence:** **not measured.** No log in `context/`, `.memsearch/` or handoffs shows anyone doing this. *Estimate for the math only:* 10 minutes per job if a PM asks by phone or text and notes the answer.
- **Error rate / cost of error:** not measured. The cost is opportunity (unseen complaints, uncollected reviews), not rework.
- **Total monthly human cost (estimate):** (30 × 10 / 60) = 5 h × $65 = **$325/month** — and only if someone actually does it today, which nothing shows.

## 2. Root cause (5 Whys)

1. Why is feedback not captured? — No owner of the task and no place to put it.
2. Why not automated? — Every send to a homeowner is gated: "Zero external sends (v1)" (`context/MEMORY.md`); "Nothing external without approval" (`context/SOUL.md`); CRM AGENTS.md: "Customer messages/invitations require an explicit human Send action… Consent is recipient/channel/purpose specific and rechecked at dispatch."
3. Why are existing tools inadequate? — The CRM has no message dispatcher yet (DECISIONS: "The GHL outbox has no dispatcher yet… until the A06 activation"), texting waits on A2P 10DLC approval, and `crm.consent_events` has **0 rows**. AccuLynx and GHL hold no survey results we mirror.
4. Why not a priority until now? — The profile pages (live 2026-10-01) are the first surface that would show it.
5. Why now? — The Job profile has a visible "Owner feedback" panel; Phase 4 asks whether to fill it.

## 3. Proposed solution

- **Receiving agent:** none at first; a CRM surface for PMs and Quality Control. Marketing (Lena) consumes it later as evidence atoms.
- **What it does (Phase A, allowed under today's rules):** on a job that reached Completed, a PM presses **Copy survey link**. The CRM creates a single-use, expiring link (no login, no PII in the URL) to a five-question page (overall rating, communication, cleanliness, would-recommend, free text). The PM sends it from their own phone or email; the CRM sends nothing. Answers land in a CRM table and on the Job profile, and are written as `evidence`-tier atoms with `property_id`.
- **Not proposed now:** any automated or in-app send (blocked until the A06 dispatcher, consent evidence and A2P approval exist), and a Google Business Profile / GHL review import (a third-party connector: needs its own rule-12 gate review).
- **Integration required:** none external. CRM migration (one table, one public token-gated route), Job profile panel.
- **Trust tier:** `evidence` — a homeowner's self-report, unverified.

## 4. The new state (projected)

- **Time per occurrence:** ~1 minute (copy link, paste into an existing conversation).
- **Error rate:** n/a.
- **Agent cost per occurrence:** ~$0 (no model call; storage only).
- **Required human review:** yes — the PM chooses to send; a low score should be read by a manager (2 minutes).

## 5. The math

| Item | Value |
|---|---|
| X, current monthly cost | $325 *(estimate; nothing shows the task is done today)* |
| Y, new monthly cost | 30 × (1 + 2) min / 60 × $65 ≈ **$98** |
| Z, one-time build | ~24 engineering hours × $65 ≈ **$1,560** (table, token route, survey page, panel, tests, consent copy review) |
| Z/12 | $130 |
| **ROI = X / (Y + Z/12)** | **325 / 228 ≈ 1.4** |
| Payback | (325 − 98) / 1,560 → ~7 months |

**Exempt from 10x gate?** No. It is not mission-grade infrastructure, and a missed survey is not a safety, legal or financial-close error.

## 6. Risks

- **Misbehaviour:** a link reaching the wrong person (mitigated: single-use, expiring, no PII shown); a survey sent to a TCPA-flagged or do-not-contact owner (mitigated: the human sends; the CRM shows the callable-phone rule and blocks the button for `do_not_call` owners).
- **Rollback:** hide the button; the table and answers stay (archive, never delete).
- **Consent flags:** none for a human-sent link in an existing conversation; any automated send later needs recipient/channel/purpose consent per CRM `docs/architecture/INTEGRATIONS.md`.
- **Standards:** Quality Control would own a "low score → manager follow-up within 2 business days" standard.

## 7. Alternatives considered

- **Leave it human:** recommended for now. The ROI is ~1.4, well below 10, because no current effort is measured.
- **Defer until:** Pro Exteriors confirms (a) whether reviews or surveys are requested today, by whom and how long it takes, and (b) whether review volume matters to marketing (Google rating, EEAT). If a review program exists, a **read-only GBP review import** (no sends) is the stronger first step: it fills the panel with real reviews and needs only a rule-12 connector review.

## 8. Decision

- [ ] **Approve** — build by [YYYY-MM-DD]; pilot client: pro-exteriors
- [ ] **Kill** — reason:
- [ ] **Defer** — revisit at: 2026-11-01, condition: measured current review-request effort, or a marketing decision that review volume is a goal

**Recommendation: Defer.** The Job profile keeps its honest "Not connected" panel.

Approver: Chris
Approved / decided on:

---

## 9. Post-build tracking

*Fill in after a 2-week pilot if approved.*

Sources: CRM `docs/delivery/PROFILE-PAGES.md`, `docs/DECISIONS.md` (D3, Q20, Q34, Q42), `docs/architecture/INTEGRATIONS.md`, `docs/design/GHL-CALLING-TEXTING.md`, `AGENTS.md`; this repo `context/MEMORY.md`, `context/SOUL.md`, `agents/vertical/marketing/{ROLE,skills}.md`, `agents/cadences/roofing-agent-master-cadence.yaml`; live aggregates from `acculynx_job_milestone_history` and `crm.consent_events` (2026-10-01, no PII).
