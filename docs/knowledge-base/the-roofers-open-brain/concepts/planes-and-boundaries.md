---
type: Policy
title: Planes and boundaries
description: Defines the separation between Roofing-Ops agents, Dev agents, Command Center, Supabase, and human approval boundaries.
resource: /docs/58-dev-vs-ops-agent-delineation.md
tags: [boundaries, roofing-ops, dev-agents, security]
timestamp: "2026-06-29T00:00:00Z"
---

# Planes

The Open Brain has two operational planes:

1. **Roofing-Ops plane** — named business agents that operate against Pro Exteriors business workflows.
2. **DevTeam plane** — Open Engine/Linear-based agents that build and maintain the system.

# Boundary rules

- Roofing-Ops agents do not claim DevTeam Linear work.
- Dev agents do not post to roofing Slack channels or write roofing action logs.
- Bugs, features, unsupported files, and undefined SOPs go through Ops Conductor to DevTeam review.
- Human approval gates remain mandatory for external sends, approvals, publishing, destructive changes, credentials, billing, and research approval.

# Citations

[1] [docs/58-dev-vs-ops-agent-delineation.md](/docs/58-dev-vs-ops-agent-delineation.md)  
[2] [agents/dev-engine/AGENTS.md](/agents/dev-engine/AGENTS.md)

