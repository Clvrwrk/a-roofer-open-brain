# deployment/remote/ — default profile (managed Supabase brain + Hetzner/Coolify runtime)

The v1 default for Cleverwork. The **brain database** is a dedicated managed Supabase project per client (Postgres + pgvector, total isolation). **Everything else Cleverwork owns and runs itself**: the agent loops and MCP servers run on the **Hetzner CPX41 via Coolify**, and the dashboard is **self-hosted on the Hostinger KVM (Coolify, Astro build)** — no Vercel, no Supabase Edge Functions. `scripts/new-client.sh` drives provisioning; this folder holds the runtime/dashboard assets.

> Why not Edge Functions / Vercel? Cleverwork runs all agents on its own Hetzner box and wants to own the dashboard internally. The MCP server in `server/` is a plain Deno HTTP service intended to run as a Coolify container.

## What lives here

- `deploy-dashboard.sh` — trigger a Coolify deploy of the Astro SSR Command Center in `app/command-center`.
- `dashboard/` — archived/local-first admin viewport for Pro Exteriors workflow review; production lives in `app/command-center`.
- `slack/` — per-client Slack app manifests and channel plans.
- Per-client Command Center env is set **in Coolify**, not in the repo. The Astro server uses `SUPABASE_URL`/`PUBLIC_SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY` server-side only; browser code never receives the service-role key.

## Topology

```
Slack workspace ──▶ Open Brain Slack app (@ob-conductor v1)
        ▲                         │
        │                         ▼
   GHL (leadgen + nurture)   Hetzner CPX41  (Coolify)
        │                     • OpenClaw / agent loops  → OpenRouter (Gemini/OpenAI/Claude)
        │                     • brain-mcp   (internal: Historian + Capture)  ← service_role
        │                     • researcher  (external retrieval)  ← NO db creds ← security boundary
        ▼                         │
   AccuLynx (during-job) ──mirror──▶ Supabase Postgres + pgvector  (the brain; RLS service_role only)
                                        ▲
   Hostinger KVM · Coolify · Astro SSR Command Center (server-side brain reads)
```

GHL owns lead → appointment → nurture (pre/post-contract). AccuLynx owns the job during production and is **mirrored into Supabase** with back-links (`job.external_ref` + `job.source_system`). The v1 Slack app uses `@ob-conductor` as the installed bot and routes to logical agent roles inside review packets. Computer-use (Orgo.ai) is the fallback rung only where a tool has no CLI/MCP/API.

## Provision

```bash
cp config/roofer.config.example.yaml config/roofer.config.yaml   # edit
cp config/.env.example .env                                      # fill secrets
./scripts/new-client.sh            # idempotent; --dry-run to preview
./scripts/verify-deployment.sh     # go-live gate
```

A new client should be live in roughly an hour. Full stack rationale: `docs/08-stack-and-topology.md`. Walkthrough: `docs/01-onboard-a-roofer.md`. Go-live gate: `docs/06-security-checklist.md`.
