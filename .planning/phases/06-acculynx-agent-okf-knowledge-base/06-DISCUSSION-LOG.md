# Phase 6: AccuLynx Agent + OKF Knowledge Base - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-01
**Phase:** 6-acculynx-agent-okf-knowledge-base
**Areas discussed:** Agent substrate, Agent authority, A3 + OKF sequencing, Roster identity presence, Ingestion role

---

## Agent substrate

| Option | Description | Selected |
|--------|-------------|----------|
| OB roster identity | New roster agent (service token + dept scope + optional Slack bot) via CC API + skill | |
| Claude Code subagent | `.claude/agents/acculynx.md` spawnable via Task tool; dev-only | |
| Skill-only (expand acculynx-api) | No new identity; expand the existing skill | |
| Hybrid: roster identity + subagent | Both, routed through acculynx-api skill + OKF bundle | ✓ |

**User's choice:** Hybrid — roster identity + subagent.
**Notes:** "One brain, two entry points" over a shared knowledge source (OKF + acculynx-api skill).

---

## Agent authority

| Option | Description | Selected |
|--------|-------------|----------|
| Read/answer + enqueue gated writes | Answer + enqueue via Phase 5 gate (never approves) | |
| Read/answer only | Q&A only, no writes | |
| Read + write + ingestion ownership | Also owns cron health/monitoring + backfills | ✓ |

**User's choice:** Read + write + ingestion ownership (broadest).
**Notes:** Enqueue-only on writes (never approves — Phase 5 D-07/D-09 holds). Ingestion = monitor/report + trigger backfills, not cron rewrites.

---

## A3 + OKF sequencing

| Option | Description | Selected |
|--------|-------------|----------|
| A3 first, then OKF, then agent | Rule-9 hard gate; agent built only after A3 approval | ✓ |
| OKF + A3 in parallel, agent after approval | Complete OKF while drafting A3 | |
| Draft everything, approve at end | Prepare all, approve A3 before going live | |

**User's choice:** A3 first (hard gate).
**Notes:** No agent code ships live before the A3 is approved.

---

## Roster identity presence

| Option | Description | Selected |
|--------|-------------|----------|
| Service token + Slack bot, dept: all | Full roster peer; posts to Slack; enqueues any lane | ✓ |
| Service token only, dept: accounting+operations | Quieter; API only | |
| Service token + Slack bot, dept: accounting+operations | Slack presence, narrower scope | |

**User's choice:** Service token + Slack bot, `departmentAccess: "all"`.
**Notes:** Follow existing OB roster + slack-agents provisioning; reuse ob-conductor's dept:"all" precedent.

---

## Ingestion role

| Option | Description | Selected |
|--------|-------------|----------|
| Monitor + report + trigger backfills | Watches health, alerts, can force-sync via accountFilter | ✓ |
| Monitor + report only | Observes + alerts, never triggers a sync | |

**User's choice:** Monitor + report + trigger backfills.
**Notes:** Does not rewrite the Phase 3 cron machinery.

---

## Claude's Discretion

- Exact A3 ROI framing/numbers (drafted against `_a3-template.md`; user approves final).
- Which OKF sections need net-new authoring vs. index-linking.
- Subagent tool-binding + precise `ob-acculynx` permission wiring, within the D-02/D-03 envelope.

## Deferred Ideas

- First live prod payment (Phase 5, deferred by user).
- Executive Sales Pipeline dashboard (Phase 7).
- Slack notify-bot channel membership fix (Phase 5 finding #4) — fold into ob-acculynx Slack provisioning or a small standalone task.
