## Decision

Adopt a **single-control-plane hybrid**:

- **Hermes inside each agent's dedicated Orgo computer is the only Roofing-Ops production control plane.** It exclusively owns named-agent Slack ingress and schedules. Begin with Maya's existing authenticated Orgo desktop.
- **Evaluate eve only as an isolated Phase B challenger** using synthetic data and separate test identities. It receives no production trigger, schedule, mailbox subscription, or consequential credential. It can replace Hermes only after a later go/no-go proves a material advantage and an atomic ownership transfer; it never runs as a production co-owner.
- **Cursor is the preferred DevTeam runtime**, confined to repositories, Linear/Open Engine, tests, and pull-request workflows. It does not embody or speak as a Roofing-Ops persona.
- **Devin is an optional browser-only adjunct** for narrow tasks Orgo cannot satisfy, after a separate tool gate. A named Hermes agent delegates the bounded task and remains accountable. Devin receives no production-wide mailbox, schedule, Slack persona, or operational authority.

This is a decision to pilot, not authorization to install, connect production credentials, read real mail, send messages, provision resources, or change production. Supabase and Command Center remain the operational system of record. The Mac mini is out of scope.

The production invariant is:

```text
one source event -> one fenced owner (Hermes) -> one Command Center work item
                 -> one approval/effect ledger -> one attributable receipt
```

Orgo is the persistent computer and identity-bearing browser, not the database or control plane. Cursor and Devin are bounded workers in other planes. Eve is an experiment until explicitly promoted.

## Why

Hermes-on-Orgo is the smallest reliable change. Maya already has one running Orgo computer with an authenticated Google Workspace session, and Orgo officially documents Hermes as a supported 24/7 runtime. Reusing that computer avoids a new desktop, mailbox migration, DNS change, or competing scheduler. It also provides the canonical isolated package required for the remaining agents.

The current gaps are not primarily a missing orchestration product. They are missing runtime-neutral controls: ordinary Slack intake does not reliably create `dashboard_work_items`; status is mock or historical; multiple cadence authorities disagree; shared Slack fallback can produce the wrong speaker; historical VPS/Kasm owners may still exist; and current listener, scheduler, OAuth, and receipt health are unknown. A new framework cannot safely paper over those gaps.

Eve is promising because it documents durable checkpoints, approval parking, Slack and schedule channels, and useful traces. It remains beta, Gmail parity is unverified, default sandbox egress requires hardening, and no measured Maya result demonstrates less glue or operator toil. It should therefore compete against a measured baseline, not become a second live control plane.

Cursor and Devin have strong development/browser features but the reviewed official materials do not establish the seven independent Slack/Google principals or business-action approval semantics required for named Roofing-Ops agents. Cursor's repo-centered workflow fits DevTeam. Devin's persistent Linux desktop and browser tools make it a possible last-resort browser adjunct. Neither is the Open Brain's source of truth or persona host.

## Scorecard

Scores are 1 (poor) to 5 (strong). Weighted total is out of 100. A score does not override a no-go condition.

| Criterion | Weight | Hermes inside Orgo | eve + Orgo tool | Cursor core | Devin core | Selected hybrid |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Named Slack/Google identity isolation | 15 | 4 | 3 | 1 | 1 | 4 |
| Exclusive schedule/ingress ownership | 12 | 4 | 3 | 2 | 2 | 5 |
| Existing Maya desktop/session reuse | 10 | 5 | 4 | 1 | 1 | 5 |
| Durable recovery and idempotency fit | 12 | 3 | 5 | 3 | 3 | 4 |
| Command Center/Supabase boundary | 12 | 4 | 4 | 2 | 2 | 5 |
| Approval and least-privilege enforceability | 12 | 4 | 3 | 2 | 2 | 4 |
| Observability and cost attribution | 8 | 3 | 5 | 4 | 4 | 4 |
| Production maturity/change risk | 8 | 4 | 2 | 3 | 3 | 4 |
| DevTeam/code workflow fit | 5 | 2 | 2 | 5 | 4 | 5 |
| Browser adjunct fit | 3 | 4 | 4 | 4 | 5 | 5 |
| Exit/rollback simplicity | 3 | 5 | 3 | 3 | 2 | 5 |
| **Weighted total** | **100** | **76.6** | **70.4** | **47.0** | **46.0** | **89.0** |

The hybrid wins because specialization is outside the production control-plane boundary: Hermes alone owns operational triggers, Cursor owns DevTeam work, Devin is invoked only for bounded browser evidence, and eve remains synthetic until a transfer decision.

## Evidence

Evidence is labeled to avoid promoting design into assurance.

| Evidence | State | Decision impact |
| --- | --- | --- |
| A 2026-07-26 read-only check found one running `Maya Chen` computer in one `PE-open-brain` Orgo workspace. | Observed-live on that date | Establishes a reuse candidate, not Hermes/Slack/Gmail health. |
| Maya's Orgo Chrome desktop is already authenticated to her Google Workspace identity. | Operator-confirmed | Makes Hermes-on-Orgo the lowest-change Gmail/browser baseline. |
| The temporary Orgo key listed the environment and returned `404` for a nonexistent workspace rather than the documented scope-mismatch `403`. | Observed/inferred | Treat the key as account-wide, provisioning-only; rotate and replace it with a verified workspace-scoped key. |
| Orgo officially documents Bearer authentication, workspace-scoped keys, stable computers, and Hermes installation for a persistent 24/7 runtime. | Vendor-documented | Supports the adapter and baseline shape. |
| Repository runtime code has isolated Hermes homes and named Slack routing, but Slack does not consistently create a canonical work item. | Configured, not live-proven | Requires a Command Center envelope/work/receipt contract before pilot activation. |
| The repository contains conflicting Slack, inbox, cadence, Kasm/VPS, and Orgo descriptions; remote VPS health could not be verified. | Locally verified contradiction; live unknown | Requires inventory, fencing, and fail-closed ownership rather than assumptions. |
| Eve documents durable workflows, HITL, Slack, schedules, tracing, and isolated sandboxes, but is beta; Gmail parity and exactly-once effects are unproven. | Vendor-documented capability/unknown | Justifies isolated Phase B only. |
| Cursor documents service accounts, repo automations, development environments, hooks, and self-hosted workers, but one `@Cursor` app rather than a persona fleet. | Vendor-documented | Selects Cursor for DevTeam, not Roofing-Ops. |
| Devin documents browser/computer use, persistent browser state, sessions, secrets, and audit APIs, but one `@Devin` app and no native mailbox operation in reviewed sources. | Vendor-documented | Limits Devin to a separately gated browser adjunct. |
| No accepted artifact contains completed third-party-tool gates, installed-version BOMs, adversarial results, or Maya comparison measurements. | Verified absence | Production remains no-go; the plan must generate this evidence. |

Primary accepted inputs: Round 1 runtime forensics, Maya Hermes/Orgo baseline, eve fit, Cursor/Devin fit; Round 2 architecture, security, and operations red teams; and `HERMES-NAMED-AGENT-TEMPLATE.md`. Their local evidence includes `docs/58-dev-vs-ops-agent-delineation.md`, `docs/70-agent-coordination-stabilization-and-migration-plan.md`, `docs/roofing-ops-runtime-status.md`, `app/command-center/runtime/slack-socket-runtime.mjs`, and `deployment/remote/orgo/README.md`. Vendor claims were checked in the accepted artifacts against official sources including [Orgo authentication](https://docs.orgo.ai/api-reference/authentication), [Orgo's API/Hermes index](https://docs.orgo.ai/llms.txt), [Vercel eve](https://github.com/vercel/eve), [Cursor Cloud Agents](https://cursor.com/cloud), and [Devin computer use](https://docs.devin.ai/work-with-devin/computer-use).

## Risks and Unknowns

- **P0 prompt injection:** hostile Slack, email, attachment, or webpage content may reach an authenticated browser or tool. Deterministic authorization, content/data separation, egress controls, and adversarial tests are not yet proven.
- **P0 wrong principal:** a shared Slack fallback, shared service inbox, incorrect workspace, or stale browser profile could speak or act as the wrong agent. Every identity must fail closed on mismatch.
- **P0 duplicate effects:** historical listeners/schedulers, retry after uncertain remote success, or Hermes/eve overlap could create duplicate replies or writes. A fenced lease, source uniqueness, and effect reservation/reconciliation are mandatory.
- **Credential radius:** the known Orgo credential appears account-wide. Google scopes, Slack scopes, Command Center claims, provider controls, browser isolation, and vendor tenancy are unverified.
- **Approval integrity:** approval must bind the exact actor, effect, destination, content and attachment hashes, expiry, lease epoch, and idempotency key. Runtime UI or prompt instructions do not constitute enforcement.
- **Live-state uncertainty:** current VPS listeners, schedules, OAuth grants, named Slack apps, Google accounts, AgentMail webhooks, and Hermes versions are unknown.
- **Eve uncertainty:** beta drift, package/dependency risk, Vercel data paths, Gmail behavior, multi-bot isolation, retention, and operational advantage remain unproven.
- **Cost uncertainty:** planning unit rates and token ceilings exist, but workload volumes, retries, fixed vendor charges, operator minutes, and settled cost receipts do not.
- **Operational coverage:** a business owner, technical owner, primary/backup responder, maintenance budget, and error-budget process are not yet assigned by name.
- **Rowan boundary:** recurring research tasks and any internal cross-reference conflict with Rowan's external-only charter unless technically removed, not merely prohibited in a prompt.
- **Role invariants:** Sam cannot edit Quality Control `trust_tier`; Alex must compare invoices/orders in ABC pricing UOM using normalized fields; no agent gains send, payment, publication, admin, or approval authority from having a desktop.

## No-Go Conditions

Any one of the following blocks production activation or immediately pauses the affected pilot:

1. Any P0/P1 tool-gate finding remains open, or Hermes, Orgo integration, eve (for Phase B), a skill, model connector, Cursor, or Devin lacks its applicable recorded gate and human approval.
2. More than one runtime can consume the same Slack source or schedule, including a restartable historical VPS/Kasm owner; no enforced lease/fencing epoch exists.
3. A duplicate, unauthorized, wrong-speaker, cross-agent, cross-tenant, unreceipted, or stale-owner effect occurs in any test.
4. `ORGO_PE_CC_MAYA_API_KEY` is account-wide, its scope is inferred from its name, its value appears in a prompt/log/file/receipt, or its workspace scope lacks both positive and negative verification.
5. An agent receives a Supabase service-role key; Rowan receives any internal-data credential or route; Sam can mutate `trust_tier`; Gmail/Slack/browser identity can fall back to a shared principal.
6. Command Center cannot atomically deduplicate ingress, create the authoritative work item, enforce approval/effect policy, and produce a durable correlation chain and cost receipt.
7. External sending, payment, publication, destructive write, permission change, or approval authority is available to the runtime. Draft/propose is the maximum pilot authority.
8. A synthetic Gmail test fetches or records an unrelated message, or a prompt-injection fixture can expand tools, egress, mailbox, or browser scope.
9. Status can remain green with a stale lease/cursor, old queue, failed receipt sink, uncommitted effect, expired credential, or missed schedule.
10. A selected model ID/provider/data-control combination is not verified on deployment day, a task has no token/dollar ceiling, or spend breakers/cost receipts are absent.
11. Rollback cannot restore Hermes as sole owner with a new epoch, reconcile all in-flight work/effects, and pass a canary without database migration, desktop replacement, or DNS change.
12. The Mac mini becomes a runtime dependency, or Jordan/Sam lack dedicated desktops before their target-state activation.

## Reconsideration Triggers

Reopen the control-plane decision when one of these occurs:

- Phase B completes three clean full benchmark days and eve matches every safety/identity/receipt gate while reducing median operator recovery/toil by at least **30%**, with no increase in infrastructure ownership or per-accepted-work cost outside the approved budget.
- Eve reaches GA or materially changes Gmail, multi-identity Slack, self-hosting, sandbox-egress, retention, or operational controls; rerun the tool gate and contract benchmark rather than assuming improvement.
- Hermes fails the Maya SLO/error budget, cannot support the runtime-neutral API contract, or requires materially more recovery labor after a fair stabilization period.
- Orgo cannot provide verified workspace isolation, stable desktop operation, acceptable tenancy/data terms, or recoverable Google sessions.
- Cursor or Devin documents and contractually supports a materially different capability; any expansion still requires a separate A3/tool gate and cannot create dual production ownership.
- Provider availability, prices, retention/training controls, or model IDs change; rebenchmark the T0/T1/T2 ladder before continuing.
- Overwhelming measured evidence shows Supabase/Command Center cannot meet correctness, audit, or recovery needs. Until such evidence exists, they remain the system of record.
