# A3: AccuLynx Agent

Proposed by: Chris
Date: 2026-07-01
Status: pending
Affected clients: template-wide
A3 file: proposals/2026-07-01-acculynx-agent.md

---

## 1. The problem (measured)

- Task being performed today: AccuLynx read/answer work, gated-write enqueueing, and ingestion
  monitoring are each done ad hoc by whichever agent picks up the task — no single owner is routed
  through the OKF knowledge bundle or the acculynx-api skill consistently.
- Frequency: every AccuLynx question, backfill check, or write-enqueue request across both the live
  Command Center runtime and dev/repo sessions.
- Time per occurrence: not separately instrumented; the cost is discoverability and consistency, not
  raw minutes — a caller has to know which skill/doc bundle to load rather than addressing one named
  owner.
- Error rate: not separately instrumented; the risk is a caller missing the OKF bundle or the
  human-approval write gate because no single agent identity is accountable for AccuLynx.
- Cost of error: a missed knowledge-bundle reference or a mis-scoped write path costs rework and, at
  worst, an unreviewed AccuLynx mutation.
- Total monthly human cost: not instrumented — this proposal is mission-grade integration
  infrastructure operationalizing capability Phases 1-5 already built and proved live, per the
  2026-06-09 acculynx-api A3 precedent (same domain, same exemption rationale, stronger case here).

---

## 2. Root cause (5 Whys — brief)

1. Why does this consume human/agent coordination overhead today?
   — No dedicated agent identity owns the AccuLynx surface; read, write, and ingestion-monitoring
   work is routed through whichever agent happens to pick it up.
2. Why is it not already automated/owned?
   — Phases 1-5 built the ingestion pipeline, the read/write capability matrices, the OKF bundle, and
   the human-gated write-action layer, but never assigned a single agent identity as the accountable
   owner of that surface.
3. Why are the existing tools (acculynx-api skill, OKF bundle) inadequate for this on their own?
   — They are knowledge/routing layers, not an accountable actor; without a named agent, discovery
   depends on whichever agent thinks to load them.
4. Why has this not been a Cleverwork priority until now?
   — The read/write capability surface and the human-approval gate (Phase 5) had to exist first;
   there was nothing yet to operate discoverably.
5. Why now?
   — Phase 5's action layer (enqueue → approve → execute → audit) just went live, and the OKF bundle
   is ~80% complete — the capability this agent operationalizes now exists and is proven.

---

## 3. Proposed solution

- Which agent receives this skill: a new hybrid AccuLynx Agent — (a) an OB roster identity
  `ob-acculynx` (`SERVICE_AGENT_IDENTITIES`, `app/command-center/src/lib/access-control.ts`) for the
  live cc.proexteriorsus.net runtime, and (b) a Claude Code subagent for dev/repo sessions. Both are
  routed through the `acculynx-api` skill (`skills/cleverwork-roofer/acculynx-api`) and the OKF bundle
  (`docs/knowledge-base/acculynx/`) as one shared knowledge source — one brain, two entry points.
- What the skill does: input → an AccuLynx question, a proven-safe write request, or an
  ingestion-health check; process → the agent reads/answers from the full AccuLynx data and
  capability surface, enqueues proven-safe writes through the Phase 5 action layer
  (`POST /api/agent/acculynx-write-action/enqueue`) but never approves them (approval stays
  human-only, per Phase 5 D-07/D-09), and monitors ingestion cron health/staleness, surfacing alerts
  and triggering manual backfills via existing tooling (the `accountFilter` force-backfill lever) —
  it does not rewrite the cron itself; output → an answer, an enqueued pending-write row awaiting
  human approval, or an ingestion-health report/triggered backfill.
- OB1 / InfraNodus / Dynamous primitive it builds on: the existing OB roster-identity pattern
  (`SERVICE_AGENT_IDENTITIES`, exact precedent `ob-conductor`'s `departmentAccess: "all"` entry) and
  the existing per-agent Slack bot pattern (`slack-agents` skill).
- Integration required: none new — reuses the live `acculynx-sync` Edge Function, the
  `/api/agent/acculynx-write-action/enqueue` route (already generic over any department-scoped
  service-agent actor), and the OKF bundle (already ~80% built).
- Trust tier of output: evidence — the agent's answers and enqueued writes are sourced from the
  AccuLynx API and the brain's ingested data; a write only becomes an authoritative action after
  explicit human approval (instruction-grade authority stays human-only per hard rule 4 and Phase 5
  D-07/D-09).

---

## 4. The new state (projected)

- Time per occurrence post-skill: not the primary driver — the win is a single discoverable owner and
  consistent OKF/skill routing rather than a raw time reduction on an already-fast lookup.
- Error rate post-skill: reduced risk of a caller skipping the OKF bundle or the write-approval gate,
  since one named agent is now accountable for both.
- Cost of agent operation per occurrence: near-zero — local knowledge-bundle reads plus existing API
  calls already budgeted by Phases 1-5; no new infrastructure or per-call cost is introduced.
- Required human review: yes, unconditionally, for every write — the agent enqueues only; a human
  approver in the Command Center dashboard (`approval.decide` / `approval.decide_prod_write`) must
  approve before any AccuLynx mutation executes. No change to this gate.

---

## 5. The math

| Item | Value |
|---|---:|
| Total monthly cost, current state (X) | Not instrumented |
| Total monthly agent operating cost, new state (Y) | Near-zero — reuses existing ingestion, API, and write-action infrastructure |
| One-time build cost (Z) | One agent-provisioning build session (roster entry, subagent file, skill/OKF wiring) |
| Build cost amortized over 12 months (Z/12) | Minimal |
| ROI multiplier: X / (Y + Z/12) | Exempt |
| Payback period | First AccuLynx read/write/ingestion task routed through the named agent |

Exempt from 10x gate? Yes. This is mission-grade infrastructure for the primary PM adapter — an even
stronger exemption case than the 2026-06-09 acculynx-api skill precedent, because this agent
operationalizes ~$0-marginal-cost read/write capability that Phases 1-5 already built and proved live,
rather than proposing new capability.

---

## 6. Risks

- What breaks if this skill misbehaves?
  - **Broad `departmentAccess: "all"` grant:** `ob-acculynx` needs `"all"` because AccuLynx write
    lanes span sales, accounting, and operations departments (`LANE_DEPARTMENT` in
    `acculynx-pending-write.ts`) — a narrower scope would silently 403 legitimate lanes. This is a
    genuinely broad grant: if the `ob-acculynx` service token leaks, the holder can enqueue writes
    across every department (though never approve/execute one, since approval stays human-only).
    Mitigation: provision the token via the hashed env var form
    (`AGENT_SERVICE_TOKEN_SHA256_OB_ACCULYNX`, per workos-agent-auth's explicit recommendation) rather
    than a plaintext CSV entry, and follow the documented rotation procedure if a leak is suspected.
  - **Untrusted-content boundary (data, never instructions):** AccuLynx-sourced free text (job notes,
    contact names, messages) reaching the agent's context must be treated as data, never as
    instructions to follow — a prompt-injection surface if unenforced. `security/posture.md` §4
    explicitly names REQ-09 (this agent) as the phase that must add agent-side enforcement of this
    boundary; it is not automatically inherited. Mitigation: the subagent's own instruction file and
    the relevant OKF concept note must state this boundary explicitly, and the roster identity's
    documented behavior must not treat ingested AccuLynx text as executable instructions.
- Rollback path: remove the `ob-acculynx` entry from `SERVICE_AGENT_IDENTITIES` and revoke/rotate its
  service token and Slack bot token; delete or disable the Claude Code subagent file. No data loss —
  the agent owns no exclusive data path; the OKF bundle, ingestion pipeline, and write-action layer
  all continue operating independently of this agent's existence.
- Trust tier of output: evidence (repeated from §3) — appropriate because every write remains
  human-approved before execution, and every read is sourced from already-ingested, labeled data.
- New consent flags required? No — no new cross-client or cross-property data access is introduced;
  this agent operates within the existing single-client AccuLynx brain boundary.
- New standards checks required? No — existing security posture (hard rules 1, 2, 5) and the Phase 5
  approval-gate STRIDE attestation already cover the write path this agent enqueues into.

---

## 7. Alternative considered

- Leave it human / ad hoc: rejected — this is the status quo (whichever agent picks up AccuLynx work
  loads the skill/bundle inconsistently); it does not scale discoverability as the OKF bundle and
  write-action surface grow.
- Reuse a generic Claude Code session with the `acculynx-api` skill invoked manually: rejected per
  CONTEXT.md D-01 — the user wants a named, discoverable agent (both a live roster identity and a dev
  subagent), not ad hoc skill invocation with no accountable owner.

---

## 8. Decision

- [ ] **Approve** — build by 2026-07-01; pilot client: Pro Exteriors (template-wide pattern).
- [ ] **Kill** — reason:
- [ ] **Defer** — revisit at:, condition:

Approver: Chris
Approved / decided on:

---

## 9. Post-build tracking (completed after pilot)

*Fill in after 2-week pilot period.*

- Actual time per occurrence post-skill: pending pilot.
- Actual error rate post-skill: pending pilot.
- Actual ROI multiplier: pending pilot (Exempt, per §5).
- Promoted to template-default: pending.
- QC observation: pending — tracked outcome is `ob-acculynx` live + subagent invokable + OKF bundle
  cited as the shared knowledge source.
