# Platform Architecture & Topology

Status: draft v0.1 (for review)
Related: [15-prd-agent-platform.md](15-prd-agent-platform.md), [08-stack-and-topology.md](08-stack-and-topology.md), [06-security-checklist.md](06-security-checklist.md)

This is the production topology for the deployed agent platform. It extends the original `08-stack-and-topology.md` with the chosen vendors and the human-in-the-loop front end.

---

## 1. Layers

```
People & interfaces (HITL)        Web Command Center (Astro SSR) ── primary
                                  Slack workspace ─────────────── secondary
            │  (WorkOS login + role-based access at the edge)
            ▼
Application (Hetzner CPX41 · Ubuntu · Coolify, 24/7)
   - command-center        Astro SSR app; server-only data access
   - brain-mcp             Historian — INTERNAL retrieval/write to the brain
   - researcher-mcp        Researcher — EXTERNAL web/enrichment only
   - bridges               GoHighLevel, AccuLynx, AgentMail, Google Workspace
   - agent-runtime         agent loop(s); schedules; Slack/AgentMail I/O
            │
            ▼
The One Brain                     Supabase (managed): Postgres + pgvector +
                                  control tables; PITR; RLS service-role-only
            │
            ▼
Agent compute                     Orgo — up to 5 agent computers (shared pool,
                                  for browser/desktop tasks); allocated on demand
            │
            ▼
External services                 GHL · Google Workspace · AgentMail ·
                                  Serper · SerpAPI · Firecrawl · Tavily · Exa
Observability                     Sentry (errors + health) → Hermes → Slack
```

## 2. Host: Hetzner CPX41

`PE-open-brain` — CPX41 (8 vCPU / 16 GB / 240 GB), Ubuntu, region us-west (Hillsboro, OR), `5.78.124.10`. Public Command Center origin: `https://cc.proexteriorsus.net`. Runs **Coolify**, which manages all containers (build, deploy, Let's Encrypt TLS, env/secrets, health checks, auto-restart). Per `CONVENTIONS.md`, MCPs run only as **containers on this host** — no local stdio MCPs.

**24/7 reliability:** Coolify restart policies + per-container health checks; an **external uptime pinger** (independent of the host) alerts on total outage; **off-box encrypted backups** (Supabase PITR + nightly brain dump to object storage). The single CPX41 is a single point of failure — the deployment runbook (Phase: deployment doc) must include a **one-command rebuild** with documented RPO/RTO.

## 3. The two-process security boundary (non-negotiable)

`brain-mcp` (**Historian**) reaches only the client's Supabase brain and **never the public internet**. `researcher-mcp` (**Researcher**) reaches only the external web + enrichment APIs (Serper/SerpAPI/Firecrawl/Tavily/Exa) and **never the brain**. They run as separate containers with separate credentials. This split closes the prompt-injection exfiltration path (CONVENTIONS §4). The front end never talks to either directly — it calls the app server, which holds the service role.

## 4. Identity, email, and agent compute

- **WorkOS** — human authentication + role-based access at the app edge; sealed session cookies; roles map to the permission matrix in `deployment/remote/dashboard/AUTH.md`. Service-role secrets stay server-side.
- **AgentMail** — each agent gets its own real inbox (e.g. `hermes@…`) for auditable, addressable agent email; replaces ad-hoc shared mailboxes. Inbound mail is an event stream into the brain.
- **Orgo** — up to 5 agent computers (virtual desktops) for agents that need a browser/OS (e.g. a Researcher driving a vendor portal). Treated as a **shared pool allocated on demand**, not 1:1 per agent — Hermes (DB + filesystem work) typically needs none.
- **Google Workspace** — org email/docs/calendar; human-facing comms and document storage.

## 5. Data flow (happy path)

1. Event (Slack message, GHL/AccuLynx webhook, AgentMail inbound, invoice upload) → **Capture** atomizes into the brain.
2. **Hermes** keeps the corpus clean and indexed overnight so retrieval stays cheap.
3. A vertical/horizontal agent does work, proposing actions; **Auditor** checks against the **QC** standard.
4. Human-in-the-loop: the **Command Center** (or Slack) surfaces the proposal; a role-authorized human approves/overrides — recorded with actor + timestamp.
5. Approved external actions (vendor email, GHL update) go out via the bridges; results return as events → back to step 1.

## 6. Secrets & config

All secrets live in Coolify app env (or `.env` in dev), names mirrored in `config/.env.example`; **never committed**. New names for this platform: `WORKOS_*`, `AGENTMAIL_API_KEY`, `ORGO_API_KEY`, `SENTRY_DSN`, `SERPER_API_KEY`, `SERPAPI_API_KEY`, `FIRECRAWL_API_KEY`, `TAVILY_API_KEY`, `EXA_API_KEY`, plus existing Supabase/Google/GHL/Maps keys. Per-runtime-boundary access keys for the MCP containers stay distinct (Historian ≠ Researcher).

## 7. Observability

**Sentry** captures errors + performance for the app and agent runtime. Health checks per container. **Hermes** consumes Sentry + health signals and posts a daily status to Slack + the Agent Monitoring view; genuine incidents escalate to a human. (Hermes monitors and reports; it does not silently self-heal production.)

## 8. What's already live (prototype → migrate)

Supabase brain with the vendor-pricing, territory, invoice-gate, fleet, and settings schema + RPCs; `serve.mjs` (to be replaced by the Astro SSR server) already proxies Supabase with the service role and is the reference for the server-side data layer.
