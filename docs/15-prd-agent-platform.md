# PRD — Command Center → Production Agent Platform

Status: draft v0.1 (for review)
Owner: Chris / Cleverwork
Related: [16-platform-architecture-and-topology.md](16-platform-architecture-and-topology.md), [17-frontend-command-center-spec.md](17-frontend-command-center-spec.md), [22-gsd-app-transition-roadmap.md](22-gsd-app-transition-roadmap.md), [23-agent-task-cadence-and-cron.md](23-agent-task-cadence-and-cron.md), [`agents/horizontal/maintenance/HERMES.md`](../agents/horizontal/maintenance/HERMES.md)

---

## 1. Vision

Turn the internal Command Center prototype into a **deployed, always-on platform** where a small human team supervises a team of AI agents that run a roofing business's back office. The platform is **human-in-the-loop first**: agents do the heavy lifting; humans approve, override, and audit. The **One Brain (Supabase) is the system of record** — every decision an agent or human makes is recorded so context is never lost.

The first agent hired is **Hermes** — the Brain Librarian (the deployed `Maintenance` agent) — because before more agents can work the brain productively, the brain must stay clean, well-named, navigable, and cheap to traverse.

## 2. Why now

The prototype already proves the workflows end-to-end against live Supabase data: vendor pricing territories, the invoice pricing-gate (payment blocked until an approved price agreement exists), the price-agreement line-by-line audit, and the fleet dashboard. The pieces work; they now need to be **deployed, secured, and staffed** so they run 24/7/365 without a person babysitting them — and so additional agents can be added on the same rails.

## 3. Users & roles (gated by WorkOS)

| Role | Who | Primary jobs |
| --- | --- | --- |
| **Admin / CEO** | Chris | CEO-approve price agreements, settings, override gates, see everything |
| **Purchasing / Ops** | Roberto Huerta | Verify & send vendor emails, approve agreement lines, assign territories |
| **Accounting** | Lucinda Dunn | Invoice payment actions (mark paid/unpaid), credit-memo workflow |
| **Viewer** | Field / leadership | Read-only dashboards (fleet, territories, pricing) |
| **Agents** | Hermes (+ future) | Operate the brain; surface work to humans; never act past their trust tier |

## 4. Goals & non-goals

**Goals (v1):**
- A production web **Command Center** (Astro SSR) behind WorkOS, the **primary** human-in-the-loop surface; **Slack secondary** for alerts/quick approvals.
- **Hermes deployed** and running its 5S cadence on the brain, reporting hygiene to the team.
- 24/7 hosting on the Hetzner CPX41 via Coolify, with monitoring (Sentry), backups, and a documented rebuild.
- Every privileged action recorded (audit log now; mirrored to the One Brain as agents mature).

**Non-goals (v1):**
- Full multi-agent autonomy (agents still propose; humans approve).
- Public/customer-facing UI (internal team only).
- Replacing AccuLynx/QuickBooks/GHL — the platform orchestrates around them.

## 5. Scope — v1 surfaces

Carried over from the prototype, productionized: **Command Center** (work queues), **Invoice Audits** (paid/unpaid, gate override w/ recorded actor, per-invoice agreement or one-time price), **Price Agreements** + **Price Agreement Audit** (line-by-line approval, CEO approval, add/scope), **Vendor Territories** (drive-time map), **Fleet** (vehicles, maintenance, compliance, fuel, drivers), **Settings** (single-select, double-confirmed), and an **Agent Monitoring** view (new: agent status, last run, Hermes hygiene digest, Sentry health).

## 6. Success metrics

- **Uptime** ≥ 99.5% of the platform + MCP containers (Sentry + external pinger).
- **Tokens-to-orient** (Hermes north-star): a fresh agent can locate "where X lives + what's current" from the brain index without reading the full tree — measured by index coverage and avg context tokens per orientation task.
- **Gate integrity:** 0 invoices paid without an approved price (or recorded override) — enforced in DB, verified by audit log.
- **Human time saved:** purchasing/audit hours/week vs. pre-platform baseline.
- **Brain hygiene:** dedup rate, missing-metadata flags trending to zero, archive currency.

## 7. Phasing

- **Phase 0 — Harden (now):** Astro SSR migration of the existing views; WorkOS auth; server-only data access; CSP; Sentry; Coolify deploy on CPX41; backups + rebuild runbook.
- **Phase 1 — Hermes live:** deploy Maintenance-as-Hermes (cadence, AgentMail inbox, Slack handle, Supabase service scope); brain index/schema map published; hygiene digest to Slack + the Agent Monitoring view.
- **Phase 2 — Expand the team:** add the next agents (Conductor/Capture/Researcher) on the same rails; Orgo agent computers for browser/desktop tasks; per-agent AgentMail inboxes.
- **Phase 3 — Tighten the loop:** more actions move from human-do to human-approve as Auditor/QC confidence rises; everything continues to record to the One Brain.

## 8. Constraints & guardrails

- All of `CONVENTIONS.md` applies: additive/idempotent SQL, no secrets in code, MCP-container-only, **trust-tier discipline**, the **Historian (internal) / Researcher (external) boundary**, property-first, era-aware, the **10× ROI A3 gate** for new agent skills (mission-grade infra like Hermes is exempt), and no destructive deletes (archive only).
- Service-role credentials never reach the browser; agents never exceed their trust tier; humans hold the final approve on anything external or irreversible.

## 9. Open questions

- Agent count at launch beyond Hermes, and the AgentMail-inbox / Orgo-computer mapping (proposed: dedicated inbox per agent, shared pool of 5 Orgo computers allocated on demand).
- Accounting role owner and the QuickBooks touch-points for invoice payment.
- Backup/DR target (RPO/RTO) on the single CPX41 and whether a warm standby is justified.
