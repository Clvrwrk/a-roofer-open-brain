---
type: routing-map
title: Runtime ↔ Named Dev Agent Routing Map
description: Canonical mapping from Open Engine runtimes to named dev-team agents and Linear title prefixes.
resource: agents/dev-engine/AGENTS.md
tags: [open-engine, dev-team, linear, pec-1]
timestamp: "2026-06-28"
---

# Runtime ↔ Named Agent Routing Map

Standing context for PEC-1. Dev Conductor and `pe-cc-agents` use this map when filing or claiming work.

| Named agent | Agent ID | Primary runtime | Linear title contains | Trigger |
| --- | --- | --- | --- | --- |
| Dev Conductor | dev-conductor | Human + pe-cc-agents relay | N/A | `#ob-dev-command` |
| Code Reviewer | code-reviewer | pe-cc-codex, pe-cc-cursor | `[pe-cc-codex]` or `[pe-cc-cursor]` | GitHub PR webhook |
| Security Guardian | security-guardian | pe-cc-agents | `[pe-cc-agents]` | Deploy webhook, Mon 5am cron |
| Bug Triager | bug-triager | pe-cc-codex | `[pe-cc-codex]` | Sentry webhook |
| Sentry Analyst | sentry-analyst | pe-cc-agents | `[pe-cc-agents]` | Daily 7am cron |
| Uptime Monitor | uptime-monitor | script (no_agent) | `[pe-cc-agents]` | 2 consecutive check failures |
| Integration Specialist | integration-specialist | pe-cc-cursor | `[pe-cc-cursor]` | Linear task |
| Red Team | red-team | pe-cc-agents | `[pe-cc-agents][red-team]` | Milestone 3-cycle gate + random watchlist |
| Repo Janitor | repo-janitor | pe-cc-codex | `[pe-cc-codex]` | Mon 8am cron |
| Tool Manager | tool-manager | pe-cc-agents | `[pe-cc-agents]` | Monthly cron |
| Skills Manager | skills-manager | pe-cc-agents | `[pe-cc-agents]` | Thu 9am + skill create |
| Memory Clerk | memory-clerk | pe-cc-agents | `[pe-cc-agents]` | Daily 10pm cron |
| SEO Engineer | seo-engineer | pe-cc-cursor | `[pe-cc-cursor]` | Weekly crawl + PageSpeed fail |
| Session Analyst | session-analyst | pe-cc-agents | `[pe-cc-agents]` | Daily UX digest |
| Feature Planner | feature-planner | pe-cc-claude | `[pe-cc-claude]` | Chris-requested epics |

## SEO domains (PEC-1)

- Command Center: `cc.proexteriorsus.net`
- Marketing: `proexteriorsus.com`

## Research tool env keys (dev plane only)

- `FIRECRAWL_API_KEY_DEV`
- `TAVILY_API_KEY_DEV`
- `EXA_API_KEY_DEV`
- `PAGESPEED_API_KEY`
- `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD`
- `GSC_SITE_URL` + `GSC_SERVICE_ACCOUNT_JSON` (read-only URL Inspection)
- `LINEAR_API_KEY` (queue runner + webhooks)

## Plane rules

DevTeam runtimes: `no_supabase_service_role: true`. Roofing personas never use Linear or Open Engine.
