---
type: runbook
title: Linear Dev-Engine Task Execution
description: Delegate and Verify pattern for pe-cc-* runtimes claiming one task per heartbeat.
tags: [open-engine, linear, dev-team]
timestamp: "2026-06-28"
---

# Linear Dev-Engine Task Execution

1. Load `agents/dev-engine/AGENTS.md` (`/open-engine` trigger)
2. Run `node scripts/open-engine-preflight.mjs`
3. Update PEC-2 `AGENT STATUS` — heartbeat now
4. Claim one `Agent Todo` issue scoped to your runtime code
5. Execute scoped work; leave receipts (`AGENT CLAIMED`, `AGENT DONE`)
6. Stop after exactly one task

Host automation: `node scripts/open-engine-queue-runner.mjs` every 5 min via systemd.
