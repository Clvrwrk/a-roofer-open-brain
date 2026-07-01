# Phase 6: AccuLynx Agent + OKF Knowledge Base - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a **dedicated AccuLynx Agent** — A3-approved per CLAUDE.md rule 9 — that owns all AccuLynx
work, backed by a **completed, navigable in-repo OKF knowledge bundle** (`docs/knowledge-base/acculynx`)
that repo skills, memories, and references route agents to.

In scope (REQ-01, REQ-09):
- An approved A3 (`proposals/`) justifying the AccuLynx Agent (the rule-9 hard gate, SC1).
- The AccuLynx Agent as a **hybrid**: an OB roster identity (`ob-acculynx`) for the live runtime **and**
  a Claude Code subagent for dev sessions, both routed through the `acculynx-api` skill + OKF bundle.
- Agent authority = read/answer across the full data + capability surface + enqueue proven-safe writes
  through the Phase 5 approval gate (never approves) + ingestion ownership (monitor/report + trigger
  backfills).
- Completing the OKF bundle (who/what/how/why/where/when, read+write matrices, runbooks, account
  registry, dashboard spec) and wiring skills/memories/references to it.

Out of scope (own phases): the Executive Sales Pipeline dashboard (Phase 7); any NEW ingestion/write
capability (Phases 2–5 already built these — Phase 6 documents and operationalizes them, it does not
extend them); the first live prod payment (Phase 5, deferred by user).
</domain>

<decisions>
## Implementation Decisions

### Agent substrate (D-01)
- **D-01:** The AccuLynx Agent is a **hybrid**: (a) a new OB **roster identity `ob-acculynx`** in
  `SERVICE_AGENT_IDENTITIES` (`app/command-center/src/lib/access-control.ts`) for the live
  cc.proexteriorsus.net runtime, AND (b) a **Claude Code subagent** (`.claude/agents/acculynx.md` or the
  repo's agent-definition convention) for dev/repo sessions. Both are routed through the **`acculynx-api`
  skill** (`skills/cleverwork-roofer/acculynx-api`) and the **OKF bundle** as their shared knowledge
  source — one brain, two entry points.

### Roster identity presence (D-02)
- **D-02:** `ob-acculynx` gets a **service token** (per workos-agent-auth) **AND its own Slack bot
  identity** (per the slack-agents skill), with **`departmentAccess: "all"`** — AccuLynx spans accounting
  (payments) and operations (jobs/messages), so it must enqueue writes for any lane and post to Slack.
  Follow the existing OB roster + slack-agents provisioning pattern exactly (per-agent bot token env var,
  app id, channel).

### Agent authority (D-03)
- **D-03:** Broadest authority — **read/answer** across the full AccuLynx data + capability surface;
  **enqueue proven-safe writes** through the Phase 5 action layer
  (`POST /api/agent/acculynx-write-action/enqueue`) — **never approves** (approval stays human-only,
  D-07/D-09 from Phase 5); and **ingestion ownership** = monitor cron health/staleness (Phase 3),
  surface/alert on failures, AND trigger a manual backfill/force-sync via existing tooling (the
  `accountFilter` force-backfill lever) — it does **not** rewrite the cron itself.

### A3 + OKF + agent sequencing (D-04)
- **D-04:** **A3 first (hard gate).** Write the A3 (10x ROI + mission boundary) in `proposals/` for the
  user's approval BEFORE building the agent. On approval: finish/complete the OKF bundle (not rule-9
  gated), THEN build the agent (roster identity + subagent + skill wiring). No agent code ships live
  before the A3 is approved.

### Claude's Discretion
- The exact A3 ROI numbers/framing (researcher/planner draft it against the `_a3-template.md` structure;
  user approves the final).
- Which OKF sections need net-new authoring vs. index-linking (see code_context — most exist; the index
  under-links them).
- Subagent tool-binding specifics and the precise `ob-acculynx` department/permission wiring, within the
  D-02/D-03 envelope.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Rule-9 A3 gate (SC1)
- `proposals/_a3-template.md` — the A3 structure the AccuLynx Agent proposal MUST follow.
- `proposals/2026-06-09-acculynx-api.md` — prior AccuLynx-related A3 (the acculynx-api skill); precedent + scope reference.
- `CLAUDE.md` (Hard rule 9, 10x ROI gate) and (Hard rule 12, third-party agent tool gate) — the approval bars.

### OKF bundle (REQ-01)
- `docs/knowledge-base/acculynx/index.md` — the bundle entry point (currently under-links write-sweep/write-action/runbook/security).
- `docs/knowledge-base/acculynx/OKF/SPEC.md` (referenced as `../OKF/SPEC.md`) — the Open Knowledge Format the bundle conforms to.
- `docs/knowledge-base/acculynx/overview.md`, `accounts.md`, `security/posture.md`, `log.md` — who/what/why/when/where.
- `docs/knowledge-base/acculynx/api/{index,auth-and-limits,read-capability,write-capability}.md` — API surface.
- `docs/knowledge-base/acculynx/data/{index,jobs,tables}.md` — where data lands in the brain.
- `docs/knowledge-base/acculynx/ingestion/{index,sync-pipeline,read-sweep,write-sweep,write-action,runbook}.md` — the HOW.

### Agent substrate + wiring (REQ-09)
- `app/command-center/src/lib/access-control.ts` — `SERVICE_AGENT_IDENTITIES` (roster identity pattern), permission sets, `departmentAccess`.
- `skills/cleverwork-roofer/acculynx-api/` — the skill the agent routes through (to be expanded/pointed at the OKF).
- `.claude/skills/slack-agents/` — per-agent Slack bot provisioning (token env var, app id, channel).
- `.claude/skills/workos-agent-auth/` — service-token registration + `/api/*` bearer access.
- `.claude/skills/coolify/` + `.claude/skills/sentry/` — env-var + deploy path for any new secrets (bot token, service token).

### Phase 5 action layer (authority envelope)
- `docs/knowledge-base/acculynx/ingestion/write-action.md` — the enqueue→approve→execute→audit gate the agent enqueues into.
- `.planning/phases/05-read-write-action-layer/05-CONTEXT.md` — D-07/D-09 (agents enqueue, humans approve).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **OKF bundle (~80% built)**: `docs/knowledge-base/acculynx/` already has overview, accounts, api/*, data/*, ingestion/* (incl. write-sweep, write-action, runbook), security/posture, log. Phase 6 completes + wires, not rebuilds.
- **`acculynx-api` skill** (`skills/cleverwork-roofer/acculynx-api`) — existing skill to expand and point at the OKF.
- **OB roster pattern** — `SERVICE_AGENT_IDENTITIES` in access-control.ts (13 agents incl. ob-conductor `departmentAccess:"all"`) is the exact template for `ob-acculynx`.
- **Phase 5 enqueue route** — `/api/agent/acculynx-write-action/enqueue` (agent enqueues, department-scoped) is the agent's write path.
- **Phase 3 ingestion health** — cron + `accountFilter` force-backfill lever (per daily logs / runbook) is the ingestion-ownership surface.

### Established Patterns
- Agents authenticate to live via service bearer token on `/api/*` (workos-agent-auth); HTML dashboards stay human-only.
- Slack posting is per-agent bot identity (slack-agents skill); a Slack config token cannot mint bot tokens.
- Skills/memories/references are the routing layer that points agents to knowledge (REQ-01's wiring target).

### Integration Points
- New `ob-acculynx` identity → access-control.ts + AGENT_SERVICE_TOKENS (Coolify env) + a new Slack bot (token env, channel).
- Subagent definition → the repo's Claude Code agent convention.
- OKF index → link the currently-unlinked sections; add pointers from acculynx-api skill + a memory + references.
</code_context>

<specifics>
## Specific Ideas

- The agent should be "one brain, two entry points" (live roster identity + dev subagent) over a single shared knowledge source (OKF + acculynx-api skill) — avoid two divergent AccuLynx brains.
- Ingestion ownership is "monitor + report + trigger backfills," explicitly NOT rewriting the cron (Phase 3 owns the cron machinery).
- Reuse `ob-conductor`'s `departmentAccess:"all"` precedent for `ob-acculynx`.
</specifics>

<deferred>
## Deferred Ideas

- **First live prod payment** — Phase 5 Task 5, deferred by user until a real payment need; not part of Phase 6.
- **Executive Sales Pipeline dashboard** — Phase 7.
- **Slack notify bot channel membership** (Phase 5 finding #4, `not_in_channel`) — a config fix; fold into `ob-acculynx` Slack provisioning if the same channel is used, else its own small task.

None of the above expand Phase 6 scope — noted so they aren't lost.
</deferred>

---

*Phase: 6-acculynx-agent-okf-knowledge-base*
*Context gathered: 2026-07-01*
