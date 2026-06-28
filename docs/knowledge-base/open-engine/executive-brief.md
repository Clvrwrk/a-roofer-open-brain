---
type: Executive Brief
title: Open Engine Review And Executive Brief
description: Executive review of the Open Engine framework and current dev-engine implementation.
resource: https://unlock-ai.natebjones.com/open-engine
tags: [deliverable, open-engine, executive-brief, dev-engine]
timestamp: 2026-06-28T00:00:00Z
---

# Executive Summary

Open Engine is the right operating model for this repo's DevTeam plane. It gives AI runtimes a shared queue, explicit claim locks, durable standing context, receipt vocabulary, clean pause/resume semantics, and a single status ledger. That is exactly the coordination layer missing between ad hoc Codex/Claude/Hermes sessions and the real engineering work needed to maintain `cc.proexteriorsus.net`.

Our implementation is promising but incomplete. The Linear surface is correctly built, Codex/Cursor/Hermes/Warp have begun onboarding, and the DevTeam-vs-Roofing boundary is well documented. The main weakness is drift: local runtime context files, Linear receipts, and ledger state are not yet uniformly synchronized. The system is currently a disciplined manual queue, not a fully automated engine.

# Current Readiness

| Capability | Status | Executive Read |
| --- | --- | --- |
| Linear queue | Green | Team, project, label, and six statuses are live. |
| Standing setup | Green | PEC-1/2/3 exist and match the framework pattern. |
| Codex runtime | Green | Local context at v1.0.1 and ledger updated. |
| Multi-runtime consistency | Yellow | Several local contexts still contain v1.0.0 or mixed body/frontmatter. |
| Automation | Red | No durable runner/cron exists yet. |
| Dev/Ops isolation | Yellow-green | Strong written contract; needs provisioning guard/tests. |
| Optional skills | Yellow | Directory exists but no skills are registered. |

# Strategic Value

Open Engine should become the repo's "work operating system" for dev-agent execution. It is especially valuable for:

- keeping AI work auditable across multiple runtimes;
- preventing two sessions from doing the same task;
- forcing tasks to carry acceptance criteria and boundaries;
- preserving status and blockers outside chat;
- scaling Chris from one interactive session to multiple supervised lanes.

# Principal Risks

1. **False confidence from receipts**: an `AGENT APPLIED` comment can say v1.0.1 while the local file body still says v1.0.0.
2. **Manual-run fragility**: without a runner script, every runtime depends on the operator or model remembering the loop perfectly.
3. **Boundary regression**: DevTeam and Roofing-Ops are separated by docs, but not yet by automated environment checks.
4. **Unclear role routing**: the repo has named dev agents and runtime agents; they need a map before delegation scales.

# Decision

Keep Open Engine. Treat it as the canonical DevTeam coordination surface, but do not rely on it for unattended production-affecting work until the version-drift, runner, and plane-boundary guardrails are implemented.

# 30-Day Implementation Priorities

1. Normalize all runtime contexts to v1.0.1.
2. Commit `agents/dev-engine/AGENTS.md` after review so `/open-engine` is durable.
3. Add a preflight script that checks local context version consistency and absence of forbidden credentials.
4. Build a minimal queue-runner adapter for one runtime, then generalize.
5. Register Open Skills primitives in PEC-3, starting with `goal-prompt-generator`, `agentic-harness-designer`, `browser-automation-qa`, and `session-operating-map`.
6. Add smoke-test issues for claim/done, blocked-resume, human-hold, and optional-directory behavior.

# Bottom Line

Open Engine is worth operationalizing. It turns agent work from "helpful chat sessions" into a governed work queue. The next maturity jump is not more docs; it is executable preflight, environment enforcement, and a real runner.

