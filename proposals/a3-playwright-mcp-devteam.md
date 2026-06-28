# A3 — Playwright MCP (DevTeam conditional pilot)

**Status:** conditional_pilot — pending human approval before Hetzner container deploy  
**Owner:** Red Team / Tool Manager  
**ROI:** Browser QA for Red Team Cycle 3 and Session Analyst UX flows without vision-model cost.

## Scope

Containerized Playwright MCP on agent host `5.78.146.161` for dev plane only. Used by red-team and session-analyst profiles.

## Gate checklist

- [ ] License: Apache-2.0 (Playwright) — verify container image
- [ ] Egress: target URLs only (cc.proexteriorsus.net, proexteriorsus.com staging)
- [ ] No local stdio MCP on Kasm desktops
- [ ] SkillSpector scan if installer script added
- [ ] Rollback: remove container + env vars from dev profiles
- [ ] Human approval: Chris

## Verdict target

`conditional_pilot` until 3 successful Red Team Cycle 3 runs, then `allow` for dev plane.
