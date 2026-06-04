# Hetzner Coolify Agent Host

Status: draft v0.1
Related: [`deployment/remote/DEPLOYMENT-RUNBOOK.md`](../deployment/remote/DEPLOYMENT-RUNBOOK.md), [`16-platform-architecture-and-topology.md`](16-platform-architecture-and-topology.md), [`26-open-brain-memory-system.md`](26-open-brain-memory-system.md)

## Goal

Run the first production Open Brain host on a single Hetzner CPX41 while preserving the security boundaries that matter:

- Command Center is public behind TLS.
- Brain/Historian containers can reach Supabase and internal services only.
- Research/OpenClaw/browser-style agents can reach external sites but not the brain directly.
- Hermes observes, routes, and reports; it does not silently self-heal production.
- MemSearch markdown remains source-of-truth; Milvus/Zilliz is a rebuildable index.

## CPX41 Fit

CPX41 is enough for the first production pass if heavy browser/computer-use workloads stay bursty or externalized.

| Resource | Starting allocation | Notes |
| --- | ---: | --- |
| Coolify + Docker + reverse proxy | 1-2 GB RAM | Control plane overhead. |
| `command-center` | 0.5-1 GB RAM | Astro SSR Node app; `/healthz`. |
| `brain-mcp` | 0.5-1 GB RAM | Internal-only Historian/Capture. |
| `researcher-mcp` | 0.5-1 GB RAM | External-only retrieval. |
| `agent-runtime` / Hermes | 2-4 GB RAM | Schedules, digests, Slack/Sentry health. |
| OpenClaw / agent shell runtime | 2-4 GB RAM | Keep concurrency low at first. |
| MemSearch local Milvus Lite | local file | Good bootstrap, not a concurrent shared service. |
| Milvus Server on-box | 4-8 GB RAM | Only if not using Zilliz Cloud; may make CPX41 tight. |

Recommendation: start with local Milvus Lite for one operator, or Zilliz Cloud for shared memory. Do not run full Milvus Server on-box until memory traffic justifies it.

## Host Bootstrap

1. Ubuntu 24.04 LTS.
2. Create `deploy` user with sudo.
3. Disable root SSH and password auth after key login works.
4. UFW: allow `22`, `80`, `443`; restrict SSH by admin IP if practical.
5. Install Docker Engine and Compose plugin.
6. Add 4-8 GB swap.
7. Install Coolify and create project `pe-open-brain`.
8. Configure off-box backups before go-live.

## Coolify Resource Map

| Coolify resource | Public? | Network | Required env |
| --- | --- | --- | --- |
| `command-center` | Yes | `open-brain-public`, `open-brain-internal` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WORKOS_*`, `SENTRY_DSN`, `COMMAND_CENTER_PUBLIC_URL` |
| `agent-runtime` | No | `open-brain-internal`, outbound APIs | `SUPABASE_*`, `SLACK_*`, `SENTRY_*`, bridge API keys |
| `hermes` | No | internal + Sentry/Slack outbound | `SENTRY_AUTH_TOKEN`, `SLACK_*`, `SUPABASE_*` |
| `brain-mcp` | No | brain-only egress | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OB_ACCESS_KEY_HISTORIAN` |
| `researcher-mcp` | No | external-only egress | `SERPER_API_KEY`, `SERPAPI_API_KEY`, `FIRECRAWL_API_KEY`, `TAVILY_API_KEY`, `EXA_API_KEY` |
| `openclaw` | No by default | external agent network | OpenClaw config, model/provider keys, no Supabase service role |
| `memsearch-indexer` | No | internal + Milvus/Zilliz | `ZILLIZ_URI`, `ZILLIZ_TOKEN` or local Milvus config |

In Coolify, keep each boundary as its own resource/container even if the repo is monolithic. This makes logs, health, env, restarts, and future scaling much easier.

## Domains

Initial DNS map:

- `cc.proexteriorsus.net` → Command Center
- `coolify.proexteriorsus.net` or private/admin hostname → Coolify dashboard
- Internal MCPs: no public DNS
- Optional later: `hooks.proexteriorsus.net` for inbound webhooks if separate from Command Center

## Memory Backend Choice

Use one of these modes:

1. **Local bootstrap**: MemSearch plugin writes `.memsearch/memory`, `scripts/memsearch-index-open-brain.sh` indexes curated `context/` into local Milvus Lite. Best for one operator.
2. **Shared memory**: set `ZILLIZ_URI` and `ZILLIZ_TOKEN`; run indexing from `memsearch-indexer` or Hermes. Best for multiple agents.
3. **On-box Milvus Server**: only if Zilliz Cloud is not acceptable. Add a dedicated Docker volume and memory limits; CPX41 may need an upgrade when agent concurrency rises.

## What I Need From Chris

- Server access path: IP/hostname, SSH user, SSH port, and confirmation my public key is allowed.
- DNS control: ability to create/update `cc.proexteriorsus.net` and the Coolify admin hostname.
- Coolify decision: install fresh, or give me admin access to an existing Coolify.
- Sentry org slug, project slug, DSN, and token key names in `.env`.
- WorkOS app credentials when human auth should become real.
- Backup target: provider/bucket/region for off-box encrypted host and config backups.
- Memory decision: local bootstrap now, Zilliz Cloud shared memory now, or on-box Milvus Server later.

## Upgrade Trigger

Move beyond CPX41 when any two are true:

- OpenClaw/browser agents run concurrently for long sessions.
- On-box Milvus Server is required with more than light traffic.
- Container memory pressure exceeds 75 percent for a week.
- Builds/deploys interrupt runtime responsiveness.
