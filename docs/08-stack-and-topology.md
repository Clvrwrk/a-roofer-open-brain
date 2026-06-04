# 08 — Tech stack & deployment topology (decision record)

> Decisions captured 2026-05-29 with Chris. This is the recommended Cleverwork stack and how the pieces fit. Open items are listed at the end.

## Integration hierarchy (the binding rule)

For every external system, bind at the **highest-fidelity rung it supports**, in this order:

1. **CLI** — scriptable, deterministic, cleanest logs.
2. **MCP** — model-native tool calls, still structured + auditable.
3. **API** — REST/GraphQL/webhooks.
4. **Agent-computer (Orgo.ai)** — drive a real desktop/browser. **Fallback of last resort**, only when 1–3 don't exist, because computer-use is the hardest to audit.

This ranking is why CLI/MCP/API integrations are preferred for anything that touches the brain: they leave a clean trail the Auditor and `atom_access_log` can verify.

## The stack, by layer

| Layer | Tools | Notes |
| --- | --- | --- |
| **Compute** | Hetzner CPX41 (Oregon) · Hostinger KVM V4 + Coolify | CPX41 runs all agents + MCP servers. KVM/Coolify hosts the Astro sites + the dashboard. |
| **Orchestration / models** | OpenClaw (agent loops) · NemoClaw · Hermes · Claude CoWork (operator console) · Orgo.ai (agent-computer) · OpenRouter → Gemini / OpenAI / Claude | All run on Hetzner. OpenRouter is the model router; per-role tiers in `docs/05-model-matrix.md`. |
| **Brain / memory** | Supabase (Postgres + pgvector) | Managed, one project per client, total isolation. The schema in `schemas/`. |
| **CRM + production** | Go High Level (front-of-funnel) · AccuLynx / roofing production SW (during-job) | Two layers. GHL = leadgen + pre/post-contract nurture. AccuLynx = production, **mirrored into Supabase** with back-links. |
| **Comms / human interface** | Slack (agent+human) · Obsidian (SOPs + knowledge graph) · agentmail.to (agent inboxes) · Google Workspace / MS 365 per client · social (FB/IG/LI/YT/X) | Obsidian is the human read surface over the brain. |
| **Media / voice / scrape** | Higgsfield · FAL.ai · ElevenLabs (voice + voicemail drops) · Apify · Firecrawl | Bound via API; Orgo only where no API exists. |
| **Auth** | **WorkOS** (recommended) | See "Auth" below. |

## Deployment topology (decided)

- **Brain = managed Supabase** (per client). The repo schema is unchanged.
- **All agents + MCP servers run on the Hetzner CPX41, containerized via Coolify.** The `server/` code is plain Deno and runs as a Coolify container. The Historian/Researcher **security boundary holds**: separate containers, separate access keys, Researcher has no DB creds.
- **Dashboard = self-hosted on the Hostinger KVM via Coolify (Astro build).** Cleverwork owns it; no Vercel. Dashboard env (`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`) lives in Coolify, never the repo.
- **GHL ↔ brain ↔ AccuLynx:** GHL drives the funnel; AccuLynx drives production and is mirrored into Supabase (`job.external_ref` + `job.source_system` carry the AccuLynx links). The brain is the reconciliation layer.

```
GHL (funnel)            Hetzner CPX41 · Coolify                 Hostinger KVM · Coolify
 leads/nurture   ──▶   OpenClaw agent loops ─▶ OpenRouter        Astro dashboard
      │                brain-mcp (service_role) ┐                 (anon read path)
      │                researcher (no db creds) │ security        Astro client sites
      ▼                                          ▼ boundary              ▲
 AccuLynx (job) ──── mirror + back-links ──▶ Supabase (pgvector brain) ──┘
```

## Runtime roles (Hermes / NemoClaw / OpenClaw)

Three runtime tiers, all on the Hetzner box, chosen per agent by what the work demands:

- **Hermes — the chief agents (the brains).** Long-horizon reasoning that *learns over time* with extensive brain recall. The agents that set direction and standards, not the ones that execute tasks.
- **NemoClaw — the protected tier.** Business-sensitive work where security matters: anything touching the client's private brain, financials, consent, or PII runs here, in a hardened context kept isolated from external surfaces.
- **OpenClaw — the worker bees.** Task agents that *do*: Claude (Excel / computer), Orgo.ai computer-use, and the high-volume execution loops. The integration hierarchy's rung-4 (Orgo) lives here.

**Proposed agent → runtime placement (confirm or adjust):**

| Runtime | Agents | Why |
| --- | --- | --- |
| **Hermes** (brains) | Conductor · Quality Control · Innovator · `@ob-exec` | Orchestration, standard-setting, strategy — they reason over the whole brain and improve with it. |
| **NemoClaw** (protected) | Historian · Auditor · `@ob-accounting` · the consent-gated property reads | They touch the most sensitive data (the internal brain, every work product, financials, cross-client consent). Hardened + isolated. |
| **OpenClaw** (workers) | Capture · Researcher · `@ob-ops` · `@ob-sales` · `@ob-marketing` · all Orgo computer-use | Execution, external retrieval, content — high volume, task-scoped. |

Two deliberate splits worth your eye: **Historian runs on NemoClaw (protected), not Hermes** — even though it does recall, its defining job is guarding sensitive client memory. **Researcher runs on OpenClaw and never gets brain credentials** — the security boundary is enforced at the runtime tier, not just the process. Tell me if you'd place any agent differently.

## Auth — WorkOS (recommended)

Best fit for Cleverwork's B2B, multi-tenant, 2-person reality: every roofer is an **organization**; SSO/SCIM are ready for when a larger client wants Google/MS sign-in; the free tier covers core auth until enterprise connections appear. **Clerk** is the alternative if fastest dashboard build outweighs B2B org features (it has an Astro SDK). **Auth0** is overkill for a 2-person team.

Sovereignty note: all three are hosted SaaS. If auth should be as owned-internally as the dashboard, **Supabase Auth** (already in the stack) or self-hosted **Authentik** on Hetzner is the true-ownership path. Either way, this auth layer is for **human/client dashboard login + client orgs/SSO** — it is *separate* from agent↔brain machine auth, which stays on the per-container access keys + Supabase `service_role` already built into `server/`.

## Status / open items

**Resolved 2026-05-29:** first client = **Pro Exteriors** · hosting = **Hetzner/Coolify + managed Supabase** · dashboard = **self-hosted (Coolify, Astro), no Vercel** · GHL binding = **API/webhooks; GHL authoritative pre-contract, brain+AccuLynx authoritative post-contract** · runtime tiers = **Hermes / NemoClaw / OpenClaw** (above).

**Still open:**
1. **Agent → runtime placement** — confirm the proposed table above (especially Historian on NemoClaw).
2. **Auth final call** — WorkOS vs. self-hosted (Supabase Auth / Authentik); say the word and I'll pull live pricing.
3. **Pro Exteriors specifics** — service area, jurisdictions/codes, manufacturer certs, and whether they're already live on GHL + AccuLynx (these fill the working `config/roofer.config.yaml`).
