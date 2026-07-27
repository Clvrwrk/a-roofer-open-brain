## Executive Finding

The named-agent architecture is **substantially designed, partly configured in source, but not evidenced as currently healthy**. The repository defines seven business personas—Maya Chen, Alex Rivers, Casey Morgan, Jordan Price, Sam Torres, Rowan Vale, and Lena Brooks—plus an eighth Slack/runtime identity, Ops Conductor. It contains profiles, Slack app IDs and token-variable mappings, Hermes invocation code, cron generators, Google Workspace identities, AgentMail mappings, and Command Center service-role mappings. A dated status note says eight VPS listeners were started on 2026-06-29, but that same note says a human Slack validation remained outstanding. The supplied evidence packet says the documented VPS could not be reached with the available SSH identity on 2026-07-26. Therefore current listener, scheduler, token, inbox, and end-to-end health are **unknown**, not healthy.

This audit uses three state labels:

- **Designed**: prose, profile intent, plans, or cadence definitions.
- **Configured**: executable code or checked-in non-secret registry/configuration exists locally; this does not prove deployment.
- **Observed-live**: a direct dated observation or receipt demonstrates a remote resource or transaction. Historical observations are not current health.

The only 2026-07-26 runtime observation in the supplied local evidence is Orgo: the packet records one running `Maya Chen` computer in one `PE-open-brain` workspace and a successful read-only authentication test. That observation was not repeated in this audit and does not prove Hermes, Slack, Gmail, Command Center, or schedules were running inside the computer. The absent checked-in Orgo registry and the older five-desktop plan also prevent treating the seven-agent Orgo target as configured.

## Current Architecture

The repository describes two planes. DevTeam uses Open Engine and Linear; Roofing-Ops uses Hermes, Slack, schedules, and Command Center. Roofing personas are expressly barred from using Linear as their work queue, though Ops Conductor may escalate undefined Roofing-Ops requests into DevTeam Linear issues (`docs/58-dev-vs-ops-agent-delineation.md`, especially §§2–4; `docs/roofing-ops-slack-agent-routing.md:29-38`). This exception is architecturally reasonable only if Linear is an escalation boundary, not the Roofing-Ops system of record.

The intended Roofing-Ops event path is:

`Slack event -> one of eight Socket Mode listeners -> hard-coded classifier -> persona-specific HERMES_HOME -> Hermes CLI -> persona Slack token -> threaded reply`.

That path is implemented in `app/command-center/runtime/slack-socket-runtime.mjs` and `app/command-center/runtime/roofing-ops-agent-router.mjs:245-275,321-374`. The router isolates homes at `/opt/openbrain/hermes-homes/<agent>`, invokes Hermes, and can create a Linear escalation. It does **not** create a `dashboard_work_items` row for ordinary Slack messages. Attachments can be persisted separately, so Slack intake and Gmail/Command Center intake do not yet share one durable queue (`docs/70-agent-coordination-stabilization-and-migration-plan.md:0,1.3,5.1`).

There are at least four configuration authorities for behavior: persona YAML profiles, `agents/cadences/roofing-agent-master-cadence.yaml`, `scripts/write-cron-jobs.py`, and `scripts/deploy-crons.py`. The plan itself calls out cadence and identity drift (`docs/70-agent-coordination-stabilization-and-migration-plan.md:0,4.1-4.2`). The cron-writing script defines 26 enabled jobs across seven personas and initializes every job with `last_run_at: null` and `last_status: null`; those generated defaults are configuration, not execution evidence (`scripts/write-cron-jobs.py:24-57,74-171`). Ops Conductor has no entry in that seven-person job map.

Command Center/Supabase is the intended operational system of record: `dashboard_work_items` for work and `dashboard_action_log` for decisions. In practice, Gmail intake writes the work queue, while Slack messages and files follow separate paths and agents do not autonomously close queue items. The dashboard's `agentRuntimeStatuses` is explicitly mock data pending a real heartbeat (`docs/70-agent-coordination-stabilization-and-migration-plan.md:5.1-5.4`; `docs/71-phase2-cadence-identity-token-reconciliation.md:127`; `app/command-center/src/lib/cadence.ts:365`). `/healthz` counting tracked agents is therefore not persona-runtime health.

Email has two overlapping identity layers. Every persona has a designed Google Workspace identity in its YAML profile. AgentMail instead exposes ten department/service-role inboxes. Maya, Alex, Casey, and Jordan share `ob-accounting`; Lena uses `ob-marketing`; Rowan uses `ob-researcher`; Sam intentionally routes through `ob-conductor`. This is a service inbox architecture, not one inbox per named persona (`app/command-center/src/lib/agentmail.ts`; `deployment/remote/agentmail/pro-exteriors-agentmail-roster.json`).

## Persona Matrix

Status abbreviations: **D** designed, **C** locally configured, **O** observed-live. “No O” means no current direct health evidence was found.

| Persona | Slack | Email | Runtime | Schedule | System of record |
|---|---|---|---|---|---|
| Maya Chen | C: app `A0BD0PAEU2E`, `MAYA_CHEN_BOT_TOKEN`, three operational channels; No O | D/C: `maya.chen@cc...`, seven Gmail aliases; AgentMail `ob-accounting@...`; no message receipt | D/C: isolated Hermes `maya`; packet records O only for a running Orgo computer, not Hermes | D/C: always-on Gmail poll plus six generated jobs; profile says 60s, generator says 2m; no run receipt | D/C: `ob-accounting`, `dashboard_work_items`; no service role in profile |
| Alex Rivers | C: app `A0BD4C9SUPP`, own token key, same channels; No O | D/C: `alex.rivers@cc...`; shared `ob-accounting@...`; no receipt | C: isolated Hermes `alex`; legacy Kasm desktop design; no current host/Orgo proof | D/C: weekday 07:00 profile; four generated jobs; no run receipt | D/C: `ob-accounting`; Command Center/Supabase plus ABC/catalog evidence |
| Casey Morgan | C: app `A0BD85UG23C`, own token key; No O | D/C: `casey.morgan@cc...`; shared `ob-accounting@...`; Gmail draft-only; no receipt | C: isolated Hermes `casey`; no current host/Orgo proof | D profile says event-triggered/null, but generator configures two cron jobs; no run receipt | D/C: `ob-accounting`; Command Center discrepancy packets; human controls external send |
| Jordan Price | C: app `A0BE2EMAA8Y`, own token key; No O | D/C: `jordan.price@cc...`; shared `ob-accounting@...`; no receipt | C: isolated Hermes `jordan`; old Orgo plan says workspace-only; target says dedicated desktop; neither observed here | D/C: profile monthly `0 3 1 * *`, generator weekly/Wednesday/month-end jobs; no run receipt | D/C: `ob-accounting`; Command Center financial records and approved source integrations |
| Sam Torres | C: app `A0BD86ATVHQ`, own token key; No O | D/C: `sam.torres@cc...`; AgentMail deliberately through `ob-conductor@...`; no receipt | C: isolated Hermes `sam`; old Orgo plan says workspace-only; target says dedicated desktop; neither observed | D/C: profile Friday 16:00; generator adds Wednesday QA plus Friday digest; no run receipt | D/C: `ob-conductor`, not `ob-auditor`; review queue/action log; cannot set QC `trust_tier` |
| Rowan Vale | C: app `A0BD1RMHFBM`, own token key; research approval gate; No O | D/C: `rowan.vale@cc...`; `ob-researcher@...`; no receipt | C: isolated Hermes `rowan`; external-only boundary; no current host/Orgo proof | Contradiction: profile says event-triggered/null, generator enables five autonomous external-monitoring jobs; no run receipt | D/C: external evidence with provenance; `ob-researcher`; expressly no internal brain/Supabase credentials |
| Lena Brooks | C: app `A0BD1RH3FPD`, own token key; No O | D/C: `lena.brooks@cc...`; `ob-marketing@...`; no receipt | C: isolated Hermes `lena`; no current host/Orgo proof | D/C: profile Tuesday 09:00; generator configures four jobs; no run receipt | D/C: `ob-marketing`; Command Center/approved marketing sources; publication human-gated |
| Ops Conductor | C: app `A0BDG2CCCAJ`, `OPS_CONDUCTOR_BOT_TOKEN`, internal/conductor routing; No O | C: `ob-conductor@agentmail...`; admin notification is logged as “requested,” not shown sent | C: isolated Hermes `ops` in router/status doc; no standalone persona profile and no current host proof | D only: digest/routing responsibility; absent from the seven-person cron generators examined | D/C: Conductor service role, Slack escalation, DevTeam Linear boundary; Command Center should remain Roofing-Ops record |

The matrix covers every identity called a two-way Roofing-Ops Slack agent in `docs/roofing-ops-slack-agent-routing.md:1-5`. The broader 13-agent workforce in `AGENTS.md` is a role taxonomy, not eight separately deployed named Slack personas; collapsing those two identity models is one source of drift.

## Linear Findings

- **PEC-1** supports the plane boundary: Roofing-Ops does not claim or execute Linear work. Local code nevertheless creates DevTeam escalation issues for unsupported Slack requests. That is consistent only as a handoff, and should produce a Command Center linkage/receipt.
- **PEC-2** is a DevTeam status ledger, not Roofing-Ops health. The packet says all DevTeam runtimes were manual-required and most heartbeats dated 2026-06-28 (Cursor 2026-07-11). Those issue summaries are leads; no local Linear export/comment transcript was supplied, so timestamps could not be independently verified.
- **PEC-8** is described as urgent/incomplete. A deployed Slack attachment repair does not demonstrate ordinary mention/DM intake, queue creation, Linear escalation, persona reply identity, or an end-to-end Slack round trip.
- **PEC-12** is high priority/unstarted and asks for receipts, checks, VPS scheduling, and database review. That matches the repository gap: implementation artifacts exist without current scheduler/runtime receipts.
- **PEC-14** is the clearest current architecture finding: Slack intake does not reliably create `dashboard_work_items`; `[roofing ops intake]` titles are not claimable by the DevEngine convention; durable runner status is missing. The obsolete title is present at `app/command-center/runtime/roofing-ops-agent-router.mjs:162-165`, while issue creation is conditional on `LINEAR_API_KEY` at lines 188-203.
- **PEC-9** reports cw-cowork blocked by an unconnected repository and cw-claude missing installed context. This is DevTeam/runtime readiness evidence, not proof about the eight Roofing-Ops listeners.

No issue bodies, comments, state transitions, or API receipts for PEC-1/2/8/9/12/14 exist in the task inputs beyond the summarized packet. Accordingly, this report cites identifiers but does not upgrade their summaries to independently verified Linear state.

## Contradictions

1. **One Slack app/read-only versus eight two-way apps.** `deployment/remote/slack/README.md:7-18,54-56` says one app, logical role handles, and a deliberately read-only first pass. `docs/roofing-ops-slack-agent-routing.md:1-5` and the router implement eight two-way identities. The slash-command reply still says write-side actions are disabled (`app/command-center/runtime/slack-socket-runtime.mjs`, `buildCommandReply`), even while other event paths invoke Hermes, persist reports, update mirror rows, and create Linear issues.
2. **Slack identity fallback versus strict identity.** `app/command-center/src/lib/slack-agents.ts:52-69` silently falls back to shared `@openbrain`; the ops router expects persona-specific tokens. A missing token can make a named-agent response appear under the wrong bot, defeating identity/audit claims.
3. **Queue-of-record versus split intake.** The architecture says Command Center is the Roofing-Ops record, but Slack does not consistently create `dashboard_work_items`; attachment persistence and Linear escalation form side channels (PEC-14; `docs/70...` §5.1).
4. **Profiles deny Supabase service role while plane doc says Roofing-Ops has one.** All seven profiles set `no_supabase_service_role: true`; `docs/58...` says Roofing-Ops has a Supabase service token except Rowan. Least-privilege Command Center bearer access could reconcile this, but the checked-in statements currently disagree.
5. **Cadence drift.** Maya's profile says 60-second persistent polling while generator uses 2 minutes. Casey and Rowan profiles say event-triggered with no cron, while generators enable recurring jobs. Jordan's profile advertises one monthly schedule while the generator defines three different schedules. The master cadence contains still more tasks.
6. **Rowan approval boundary versus autonomous schedules.** Slack routing requires Chris approval before research execution, yet five enabled generated jobs independently browse public sources. The architecture does not define whether pre-approved schedules satisfy that gate.
7. **Kasm/VPS present-state versus Orgo target.** Persona profiles still point to Kasm and the agent VPS. The older Orgo plan gives desktops to five personas and leaves Jordan/Sam workspace-only (`deployment/remote/orgo/README.md:13-26`), while the packet records a newer operator decision for a dedicated Orgo computer per persona. The local Orgo registry is absent.
8. **Runtime status versus validation.** `docs/roofing-ops-runtime-status.md:3-35` says eight listeners started and systemd enabled, but lines 47-57 require the first human-originated test. It is a historical deployment note, not a completed acceptance test or current health proof.
9. **AgentMail wording/count drift.** The README says ten inboxes but later refers to “thirteen inboxes” split across webhooks (`deployment/remote/agentmail/README.md:16-25,38`). The JSON artifact actually lists ten inboxes and three omitted roles.
10. **Persona versus service-role identity.** Seven human-style Slack/Google personas map onto a 13-role `@ob-*` model. Four personas share Accounting email/system identity, and Sam maps to Conductor. Without a canonical correlation ID and identity map, attribution is lossy.

## Failure Modes

- **Silent dead fleet:** systemd/listener or cron processes can stop while the UI remains apparently healthy because agent status is mock and `/healthz` measures the web app, not each listener.
- **Duplicate or missed work:** Socket listeners, DM polling, file events, Gmail polling, and generated crons lack a demonstrated shared idempotency/queue contract. Slack work can be answered without becoming a durable work item.
- **Wrong-speaker replies:** shared Slack-token fallback can post persona work as `@openbrain`; multiple listeners can also see the same ambient event unless runtime gating and identity configuration are correct.
- **Unclaimable escalation:** the router emits `[roofing ops intake][enhancement] ...`, while PEC-14 says DevEngine claimable titles require another convention. The Slack thread can claim a ticket was created yet no worker can claim it.
- **False notification assurance:** the router logs that an admin email notification was requested but contains no email-send call in that path (`roofing-ops-agent-router.mjs:366-371`).
- **Schedule divergence or duplication:** two deploy mechanisms and the master cadence can install different job sets. Moving to Orgo/eve without exclusive ownership would double-trigger schedules and Slack events.
- **Boundary breach:** Rowan's generated task says to cross-reference price agreements despite the external-only/no-brain boundary. If tooling provides internal credentials, prompt text alone is not enforcement.
- **Stale credentials/session:** Slack tokens, Google OAuth/browser sessions, AgentMail webhooks, Orgo keys, and Command Center bearer tokens have no consolidated expiry/last-success evidence.
- **Unsafe email attribution:** shared AgentMail department inboxes make persona attribution dependent on application metadata; Casey's draft-only rule and outbound approval need receipts at the send boundary, not just profile flags.
- **Recovery ambiguity:** VPS, Orgo, and historical Kasm shapes coexist. There is no checked-in current inventory saying which host exclusively owns each persona, how to restart it, or how to prevent old owners from resuming.

## Evidence

Local evidence checked:

- Plane and system-of-record contract: `docs/58-dev-vs-ops-agent-delineation.md`.
- Gap analysis and proposed stabilization: `docs/70-agent-coordination-stabilization-and-migration-plan.md`; `docs/71-phase2-cadence-identity-token-reconciliation.md`.
- Historical VPS deployment claim and incomplete acceptance test: `docs/roofing-ops-runtime-status.md`.
- Eight-person Slack routing contract: `docs/roofing-ops-slack-agent-routing.md`.
- Older single-app/read-only contract: `deployment/remote/slack/README.md`.
- Runtime implementation: `app/command-center/runtime/slack-socket-runtime.mjs`; `app/command-center/runtime/roofing-ops-agent-router.mjs`; `app/command-center/runtime/slack-attachment-processor.mjs`.
- Slack identity registry: `app/command-center/src/lib/slack-agents.ts`.
- Named profiles: `agents/profiles/{maya-chen,alex-rivers,casey-morgan,jordan-price,sam-torres,rowan-vale,lena-brooks}.yaml`.
- Schedule authorities: `agents/cadences/roofing-agent-master-cadence.yaml`; `scripts/write-cron-jobs.py`; `scripts/deploy-crons.py`.
- Email registry/configuration: `app/command-center/src/lib/agentmail.ts`; `deployment/remote/agentmail/README.md`; `deployment/remote/agentmail/pro-exteriors-agentmail-roster.json` (generated 2026-06-06, therefore historical).
- Orgo design/configuration: `deployment/remote/orgo/README.md`; `deployment/remote/orgo/pro-exteriors-orgo-desktop-plan.json`; `deployment/remote/orgo/provision-orgo-desktops.mjs`. `deployment/remote/orgo/pro-exteriors-orgo-desktops.json` is absent.
- Lead packet and Linear summaries: `plans/ringer/named-agents-runtime-evaluation/inputs/linear-and-runtime-evidence.md`, covering PEC-1, PEC-2, PEC-8, PEC-9, PEC-12, and PEC-14.

Evidence not present: fresh host process output, systemd status, listener logs, Hermes version/runtime output, deployed `jobs.json` or state database, job last-run statuses, Slack event IDs and replies, AgentMail delivery receipts, Google OAuth/session checks, Command Center work-item correlation, current Linear issue exports, per-persona heartbeat rows, or a current seven-person Orgo inventory. No remote system was queried or modified by this audit.

## Unknowns

- Whether any of the eight VPS Slack listeners is currently running, restartable, or using the repository revision audited here.
- Whether any cron job is installed, enabled, non-overlapping, and successfully completing; the checked-in generator's null run fields are not telemetry.
- Whether persona Slack apps are installed, tokens valid, bots joined to all required channels, and replies posted under the intended identity.
- Whether a human-originated Maya test from `docs/roofing-ops-human-validation-request.md` ever passed and produced a correlated Hermes/Slack receipt.
- Whether the ten AgentMail inboxes/webhooks in the 2026-06-06 artifact still exist and deliver, and how a message is attributed to a named persona sharing a role inbox.
- Whether the seven Google Workspace accounts and aliases are active, OAuth grants remain valid, and draft/send enforcement is implemented at the API boundary.
- Whether Maya's observed Orgo computer contains Hermes, the intended isolated home, correct Google session, Slack ownership, scheduler ownership, or Command Center bearer identity.
- Whether the key described in the packet has been rotated and replaced with a verified workspace-scoped provisioning key; the packet's account-wide inference is historical evidence, not a current control.
- Whether Jordan and Sam have dedicated Orgo computers under the newer target, and whether old Kasm/VPS owners have been disabled to prevent dual execution.
- Which of the master cadence, `write-cron-jobs.py`, or `deploy-crons.py` exactly matches deployed schedules and timezone interpretation.
- Whether Rowan's recurring research schedules are pre-approved or violate the explicit approval requirement, and how the external-only boundary is technically enforced.
- Whether Slack intake creates exactly one `dashboard_work_items` row, whether agents transition it, and whether Slack/Linear/Command Center records share a durable correlation ID.
- Current status and exact acceptance evidence for PEC-1, PEC-2, PEC-8, PEC-9, PEC-12, and PEC-14; only summarized local leads were available.
