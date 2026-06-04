# 10 — Client support for the full stack

> How Cleverwork supports a client across the whole stack — the brain *and* every tool around it (GHL, AccuLynx, Supabase, Coolify/Hetzner, the dashboard, voice, scraping, social, Google/MS). The model is built for a 2-person team: **Conductor is the front door, agents do the legwork, humans backstop, and every interaction becomes memory** so support gets cheaper over time.

## Principle: support is the team Cleverwork doesn't have

A client doesn't file a ticket into a void — they `@`-mention in Slack and Conductor responds. Conductor triages, pulls context from the brain (Historian) and the live systems (bridges), resolves what it can, and escalates only what genuinely needs Chris or the AM. Every issue is atomized; the third time the same issue appears, it stops being support and becomes a fix (QC DMAIC) or a published answer (KB → Obsidian).

## Channels (and what each is for)

| Channel | Use | Who answers |
| --- | --- | --- |
| **Slack** (client workspace) | primary support — questions, incidents, requests | Conductor first, humans on escalation |
| **agentmail.to / email** | async, paper-trail items, vendor threads | Conductor / AM |
| **Obsidian** | client self-serve: SOPs, KB articles, the knowledge graph | self-service |
| **Dashboard** | status, KPIs, validation scorecard | self-service |
| **Status page** | incident comms during a Sev-1/2 | Conductor posts |

## Severity & SLA (defaults — tune per contract)

| Sev | Definition | Examples | Response | Resolution target |
| --- | --- | --- | --- | --- |
| **Sev-1** | brain down, data at risk, security event, or an agent producing harmful/wrong client-facing output | brain unreachable, secret exposure, agent sent a bad quote to a homeowner | **page Chris immediately**, ack < 15 min | mitigate same day |
| **Sev-2** | a stack integration is broken; agents impaired but no data risk | GHL↔brain sync down, AccuLynx mirror stale, Slack bot silent | ack < 1 hr (business hrs) | same business day |
| **Sev-3** | question, config change, minor bug, feature request | "how do I…", add a jurisdiction, tweak a pipeline stage | ack < 1 business day | per backlog |

A 2-person team can hold these because Conductor absorbs the Sev-3 volume and most Sev-2 triage; humans only get the genuinely hard or risky items. Coverage is business-hours human + always-on agent; after-hours, agents mitigate and queue, paging a human only on Sev-1.

## Who owns what — the stack support matrix

| Component | Owner | Our support scope | If it's down |
| --- | --- | --- | --- |
| Brain (Supabase) | Cleverwork | full — schema, RLS, backups, restore | failover to last backup; `docs/06` gate |
| Agents + MCP (Hetzner/Coolify) | Cleverwork | full — deploy, logs, restart, scale | Coolify redeploy/rollback; restart container |
| Dashboard (Coolify/KVM) | Cleverwork | full | Coolify rollback |
| **GHL** | client license, Cleverwork configures | funnel config, automations, our bridge | vendor support for outages; bridge retries |
| **AccuLynx** (or other prod SW) | client license | bridge + mirror health, webhook wiring | vendor support; mirror keeps last-known state |
| QuickBooks / CompanyCam / EagleView | client license | bridge + mapping | vendor support; queue + backfill |
| Slack / Google / MS 365 | client license | bot + workspace config | vendor support |
| ElevenLabs / Higgsfield / FAL.ai | Cleverwork | API integration, voice/script QA | degrade gracefully (skip media step) |
| Apify / Firecrawl | Cleverwork | scraping jobs, rate limits | retry/backoff; fall to Orgo only if no API |
| OpenRouter / model providers | Cleverwork | routing, fallbacks | model-matrix fallback path (`docs/05`) |
| Orgo.ai | Cleverwork | computer-use sessions | last-resort tier; manual fallback |

Rule of thumb: **Cleverwork owns everything it runs; the client owns the licenses to their business systems; Cleverwork owns the *integration* either way.** When a client's licensed tool has an outage, we manage the incident and the vendor escalation, but the fix is the vendor's.

## Escalation ladder

```
Client @-mention (Slack)
   └─▶ Conductor: triage + Historian context + bridge check
         ├─ resolves (Sev-3 most of the time) ─▶ logs atom, done
         ├─ routes to the right vertical agent ─▶ Auditor-gated reply
         └─ escalates ─▶ Account Manager ─▶ Chris ─▶ vendor support
```

Conductor never silently sits on something it can't resolve — borderline items escalate. This is the same blameless, surface-it-early discipline as the post-op debrief.

## Per-tool runbooks

Each stack component gets a short runbook (symptom → diagnose → fix → rollback → who to call). The brain-specific ones already live in `docs/TROUBLESHOOTING.md` (schema errors, Slack bot silent, AccuLynx webhook not firing, embeddings failing, RLS denials, consent returning nothing, dashboard blank, debrief not triggering, duplicate atoms). This doc adds the **vendor-facing** runbooks:

- **GHL down / sync stalled** — check LeadConnector status, verify webhook secret + subscription, replay missed events from GHL, confirm handoff-on-won still fires.
- **AccuLynx mirror stale** — check webhook health + scheduled pull, reconcile `job.external_ref` links, backfill the gap, confirm `job_phase` mapping.
- **Coolify/Hetzner** — container health, redeploy, rollback to last image, check disk/CPU on the CPX41, restart the agent loops, verify Historian/Researcher are still *separate* containers with separate keys.
- **Model/provider outage** — switch OpenRouter route per the model matrix; never silently downgrade Auditor/QC to a weaker model (fail closed instead).
- **Voice/media/scraping** — degrade gracefully: skip the optional step, queue, and notify; never block a job on a media generation.

Each runbook ends with: *capture an atom; if this is the 3rd occurrence, open a DMAIC and an Innovator A3 to fix the root cause or publish a KB article.*

## Support-as-memory (the compounding part)

Every support interaction is atomized like any other work: `{issue, system, resolution, time-to-resolve, root_cause}`. This pays off three ways:

1. **Pattern detection** — QC sees the same failure 3+ times and opens a DMAIC; the fix removes the ticket class entirely.
2. **Self-service** — recurring questions become KB articles published to Obsidian (and optionally a client-facing help surface), so the next person self-serves.
3. **Onboarding the next client** — common issues for a roofer brain are already known, so client #2's support load starts lower than client #1's did.

## Onboarding support (first 30 days = white-glove)

The `recipes/client-onboarding-wizard` gets them live; the first month is high-touch: train the client team on Slack mentions, the dashboard, and Obsidian; run the first post-op debrief together; watch the Auditor reject feed daily; hold a 30-day review tied to the Phase-1 exit criteria in `docs/09`.

## Incident comms + post-incident review

Sev-1/2 get live status updates (Slack + status page) until resolved, then a **blameless post-incident review** — same structure as the debrief: what happened, what we got right, what diverged, what we change. The review becomes atoms and, where warranted, an A3.

See also `docs/09-validation-and-audit.md` (the metrics this support model is judged by), `docs/TROUBLESHOOTING.md` (brain runbooks), and `agents/horizontal/conductor/ROLE.md` (the front door).
