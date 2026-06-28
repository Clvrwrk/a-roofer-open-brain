---
type: tooling-matrix
title: Agent Tooling Matrix — DevTeam and Roofing-Ops
description: Gated inventory of MCPs, APIs, skills, and connectors per agent plane. Owner Tool Manager; skills registration Skills Manager + PEC-3.
resource: /docs/knowledge-base/
tags: [tooling, mcp, skills, dev-team, security, doc-54]
timestamp: "2026-06-28"
okf_version: "0.1"
---

# Agent Tooling Matrix

Canonical catalog for provisioning Hetzner agents and IDE runtimes. Every third-party item passes [`docs/54-third-party-agent-tool-gate-2026-06-25.md`](../54-third-party-agent-tool-gate-2026-06-25.md).

Machine-readable mirror: [`config/dev-team-tool-catalog.json`](../../config/dev-team-tool-catalog.json).  
Skill pins: [`agents/dev-engine/PEC-3-skills-registry.yaml`](../../agents/dev-engine/PEC-3-skills-registry.yaml).

## MCP servers

| ID | Plane | Owner agent | Verdict | Env / transport | Egress notes |
| --- | --- | --- | --- | --- | --- |
| linear | DevTeam | All `pe-cc-*` | allow | Remote OAuth / Cursor plugin | Issue titles, comments, receipts only |
| github | DevTeam | code-reviewer, repo-janitor | allow | Remote OAuth; toolsets `context`, `issues`, `pull_requests`, `actions` | Repo metadata, diffs; no secrets in issues |
| sentry | DevTeam | bug-triager, sentry-analyst, session-analyst | allow | Remote OAuth | Stack traces; PII scrubbed client-side |
| supabase | DevTeam | integration-specialist | conditional_pilot | Read-only MCP mode only | Schema/query; **never** service-role on dev plane |
| screaming-frog | DevTeam | seo-engineer | allow | Cursor MCP / SF CLI on host | Crawl URLs for proexteriorsus.com |
| slack | Both | dev-conductor / ops-conductor | allow | Bot tokens per workspace | Dev `T0B8QEGPVQW`; roofing channels separate |
| coolify | DevTeam | security-guardian, integration-specialist | allow | API token in `.env` | Deploy status, rollback |
| playwright | DevTeam | red-team, session-analyst | conditional_pilot | Containerized MCP on Hetzner | Browser QA only; A3 required |
| context7 | DevTeam | implementation runtimes | conditional_pilot | Containerized | Library docs fetch |
| firecrawl | DevTeam | seo-engineer, feature-planner | conditional_pilot | `FIRECRAWL_API_KEY_DEV` | Scrape/markdown; dev keys only |
| tavily | DevTeam | seo-engineer, red-team | conditional_pilot | `TAVILY_API_KEY_DEV` | Search results |
| exa | DevTeam | seo-engineer, feature-planner | conditional_pilot | `EXA_API_KEY_DEV` | Semantic search |
| dataforseo | DevTeam | seo-engineer | conditional_pilot | `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | Lighthouse fallback + SERP; A3 required |
| google-search-console | DevTeam | seo-engineer | allow | `GSC_SITE_URL`, `GSC_SERVICE_ACCOUNT_JSON` | URL Inspection read-only; SA must be GSC property user |
| historian-capture | Roofing-Ops | historian, capture | allow | Deno MCP containers | Internal-only; never on dev plane |
| figma | DevTeam | feature-planner | defer | — | Enable when design-system work justifies cost |
| render | DevTeam | — | defer | — | Coolify is primary deploy path |

**Hard rule:** no local stdio MCP on agent desktops. Hetzner uses containerized endpoints; IDE runtimes may use remote OAuth MCPs during interactive work.

## API connectors

| Connector | DevTeam | Roofing-Ops | Notes |
| --- | --- | --- | --- |
| GitHub `Clvrwrk/a-roofer-open-brain` | PR, CI, branches | — | Webhook → `/api/dev/webhooks/github` |
| Linear `PE-CC-DevTeam` | Queue, milestones | Forbidden | Receipts on every task |
| Coolify `5.78.124.10` | Deploy → Security Guardian | — | `cc.proexteriorsus.net` from `main` |
| WorkOS | RBAC audit | Human CC login | Agents use service tokens |
| Supabase `rnhmvcpsvtqjlffpsayu` | Read-only MCP | `/api/agent/*` | Dev: no service role |
| Sentry | Errors, replays | — | `sendDefaultPii: false` |
| PageSpeed Insights | SEO gate (primary) | — | `PAGESPEED_API_KEY` |
| DataForSEO | SEO gate (fallback), SERP | — | `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD`; runner `scripts/seo-dataforseo-lighthouse.mjs` |
| Google Search Console | Index confirmation | Lena (content EEAT signals) | `GSC_SITE_URL` + service account; runner `scripts/seo-gsc-url-inspect.mjs`; DevTeam owns technical index audit |
| OpenRouter | All Hermes | All Hermes | Tool Manager monitors spend |
| MemSearch | memory-clerk | maintenance | Rebuildable index |

## Skills by agent (PEC-3 registered)

See [`agents/dev-engine/PEC-3-skills-registry.yaml`](../../agents/dev-engine/PEC-3-skills-registry.yaml) for version pins.

| Agent | Skills |
| --- | --- |
| dev-conductor | nepq-agent-communication, repo-parity-release-audit |
| code-reviewer | nepq-agent-communication, gsd-code-review, ssr-page-audit |
| security-guardian | nepq-agent-communication, gsd-secure-phase, coolify, third-party-agent-tool-gate |
| bug-triager | nepq-agent-communication, sentry |
| sentry-analyst | nepq-agent-communication, sentry |
| red-team | nepq-agent-communication, gsd-verify-work, deploy-agent, workos-agent-auth |
| seo-engineer | nepq-agent-communication, pagespeed-95-gate, schema-technical-seo-aeo, indexing-sitemap-health |
| session-analyst | nepq-agent-communication, sentry, ssr-page-audit |
| feature-planner | nepq-agent-communication, gsd-plan-phase, gsd-spec-phase |
| integration-specialist | nepq-agent-communication, supabase-change-preflight, abc-supply-api, coolify |
| repo-janitor | nepq-agent-communication, wrapup |
| tool-manager | nepq-agent-communication, third-party-agent-tool-gate, credential-handling-patterns |
| skills-manager | nepq-agent-communication, third-party-agent-tool-gate |
| memory-clerk | nepq-agent-communication, meta-memory-write |

## Conditional pilot A3 stubs

| Tool | A3 stub |
| --- | --- |
| Playwright MCP | [`proposals/a3-playwright-mcp-devteam.md`](../../proposals/a3-playwright-mcp-devteam.md) |
| Context7 MCP | [`proposals/a3-context7-mcp-devteam.md`](../../proposals/a3-context7-mcp-devteam.md) |
| Firecrawl API | [`proposals/a3-firecrawl-devteam.md`](../../proposals/a3-firecrawl-devteam.md) |
| DataForSEO API | [`proposals/a3-dataforseo-devteam.md`](../../proposals/a3-dataforseo-devteam.md) |
| Google Search Console API | [`proposals/a3-gsc-devteam.md`](../../proposals/a3-gsc-devteam.md) |

## Rejected / deferred (doc 54)

| Source | Verdict |
| --- | --- |
| Caveman | reject |
| Headroom | defer |
| Local stdio MCPs | reject |
| Anthropic Cybersecurity Skills (wholesale) | reference_only per skill |

## Citations

- [Third-party agent tool gate](../54-third-party-agent-tool-gate-2026-06-25.md)
- [Dev vs Ops delineation](../58-dev-vs-ops-agent-delineation.md)
- [Open Skills taxonomy](open-skills/taxonomy.md)
