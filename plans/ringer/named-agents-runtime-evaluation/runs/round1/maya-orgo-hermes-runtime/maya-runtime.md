# Maya Orgo + Hermes Baseline and Eve Comparison

## Executive Finding

Use **Hermes inside Maya Chen's existing authenticated Orgo computer** as Phase A's sole baseline runtime. Do not use the Mac mini, create a second Maya computer, move production triggers, or change production. After the baseline passes, run Phase B as an isolated eve experiment against the same synthetic fixture and scorecard. At every instant one—and only one—runtime owns a test Slack event source and test schedules.

The provisional winner is Hermes-on-Orgo because it preserves Maya's already-authenticated Google session and introduces the fewest new control planes. Eve should replace it only if the isolated benchmark demonstrates materially better durable recovery and lower operator toil without weakening identity, approval, cost, or audit controls. Vercel describes eve as providing checkpointed durable sessions, approvals, evals, and Slack/cron channels; those are promising claims to test, not evidence that production migration is already justified ([eve overview](https://vercel.com/eve), [Vercel announcement](https://vercel.com/blog/introducing-eve), [source repository](https://github.com/vercel/eve)).

This document is design-only. It authorizes no installation, credential read, inbox access, Slack registration, schedule activation, provisioning, key rotation, or production write. Any implementation must first pass the repository's third-party-agent-tool gate and human approval. The Roofing-Ops plane remains separate from Open Engine/Linear as required by `docs/58-dev-vs-ops-agent-delineation.md`; Command Center, not either runtime, remains the operational system of record.

**Assumptions:** (A1) the 2026-07-26 read-only inventory in `plans/ringer/named-agents-runtime-evaluation/inputs/linear-and-runtime-evidence.md` is current enough for planning but must be repeated immediately before implementation; (A2) a synthetic Slack app/channel, synthetic Gmail messages, and non-production Command Center tenant or namespace can be provided; (A3) “all seven” means Maya, Alex, Casey, Jordan, Sam, Rowan, and Lena, while Ops Conductor remains a routing service rather than an eighth cloned persona; (A4) exact installed Hermes/eve versions and their configuration schemas will be pinned and validated at pilot time.

## Runtime Ownership

The ownership invariant is `one event source -> one ingress owner -> one idempotency ledger -> one work item`. A runtime may invoke the other only as an explicitly named worker; it may not leave the other runtime's gateway, Socket Mode listener, poller, or cron active.

| State | Slack event owner | Schedule owner | Worker/computer use | Production impact |
| --- | --- | --- | --- | --- |
| Phase A baseline | Maya Hermes gateway | Maya Hermes cron | Hermes runs in existing Maya Orgo computer | None; synthetic endpoints only |
| Phase B comparison | eve test deployment | eve test scheduler | eve may invoke the same dedicated Maya Orgo computer only through a test-scoped adapter and never concurrently with Phase A | None; separate test app/channel, schedule namespace, queue, and credentials |
| Rollback/default | Maya Hermes gateway | Maya Hermes cron | Existing Maya Orgo computer | Disable eve first, verify lease expiry, then enable Hermes |

Use a durable ownership lease keyed by `{agent_id, trigger_class}` with `owner_runtime`, `epoch`, `expires_at`, and fencing token. Activation is compare-and-swap; handlers reject stale epochs. The operator transition is **quiesce old owner -> drain/receipt in-flight work -> revoke its test connection -> acquire new fenced lease -> inject one canary**. Never “briefly overlap.” Scheduled jobs use the same canonical job IDs in both implementations but separate disabled manifests; Slack uses a unique `team_id:event_id` idempotency key (or `channel_id:ts:event_type` only when Slack supplies no event ID). Command Center work creation has a unique source key and returns the existing record on replay.

## Orgo Integration

Orgo supplies a persistent Linux desktop, browser, terminal, and API; it is not the agent. Its official index explicitly lists installing Hermes inside a computer for a 24/7 runtime and documents stable computer identifiers ([Orgo API index](https://docs.orgo.ai/llms.txt)).

Before any mutation, the provisioning control plane performs read-only discovery with the account-wide master credential: list workspaces and computers; match the non-secret registry by stable workspace/computer ID; cross-check display name, Google identity, status, and ownership; fail closed on zero or multiple matches. The 2026-07-26 evidence found one `PE-open-brain` workspace and one running `Maya Chen` computer. That computer is the reuse candidate. Names alone are not identity. Do not run the current provisioner in create mode and do not clone the desktop. If the computer cannot be unambiguously identified, stop for operator reconciliation.

The credential mapping is an adapter boundary, not a copied secret:

```text
secret store: ORGO_PE_CC_MAYA_API_KEY
       | injected at process start, never printed or persisted
       v
client process environment: ORGO_API_KEY
       v
Authorization: Bearer <redacted>
```

The client expects `ORGO_API_KEY`; Orgo does not require that literal storage name. Configure the process supervisor's secret reference so the canonical secret is exposed to that process under the client name. Do not use `export ORGO_API_KEY=$ORGO_PE_CC_MAYA_API_KEY` in logs, shell history, generated files, or prompts.

The variable's Maya-shaped name proves nothing about isolation. Orgo documents only account-wide and workspace-scoped keys—no computer-scoped key—and says a workspace key returns `workspace_scope_mismatch` outside its workspace ([authentication and scopes](https://docs.orgo.ai/api-reference/authentication)). The supplied key's successful cross-workspace-style inventory and `404` for a nonexistent workspace, rather than the documented scope-mismatch `403`, support the evidence packet's inference that it is **account-wide**. Treat it as provisioning-only, rotate it, and never install it in Maya's computer. Because Orgo key creation/deletion is currently a dashboard operation, a human creates a new key scoped to Maya's dedicated workspace; verification must positively read Maya's workspace/computer and negatively receive scope mismatch against a sacrificial foreign workspace ID. Record only key fingerprint/version and scope test, never value.

Target registry entry: `{agent_id, workspace_id, computer_id, instance_id, google_identity, hermes_home, key_secret_ref, key_scope_verified_at}`. Each named agent gets one dedicated workspace and persistent computer. Existing desktops are discovered/reused; missing desktops are proposed for later human-approved provisioning. Jordan and Sam are dedicated-desktop targets, superseding the older workspace-only design in `deployment/remote/orgo/README.md`.

## Hermes Role

Phase A installs a pinned Hermes release **inside the existing Maya Orgo computer**, with `HERMES_HOME=/home/maya/.hermes` (resolve the actual OS user during preflight). It is the sole Slack/schedule owner, running as a least-privilege user service with restart limits. Its isolated package contains `SOUL.md`, validated `config.yaml`, owner-only `.env`, allowlisted/version-pinned skills, canonical disabled-then-enabled `cron/jobs.json`, sessions, logs, and receipts. Orgo's state list confirms `~/.hermes` contains these categories and recommends `hermes doctor` after service installation ([Orgo migration/runtime guidance](https://docs.orgo.ai/llms.txt)).

Hermes performs orchestration, task-bounded reasoning, tool invocation, approval parking, and receipts. It does not become the database, authorization service, pricing engine, or approval authority. Deterministic routing, authorization, UOM normalization, deduplication, approval enforcement, and outbound allowlists remain code. In particular, invoice comparisons use ABC's pricing UOM and the normalized fields required by `docs/46-uom-pricing-normalization.md`, never raw quantity/unit-price fields.

Validate the installed version's schema rather than blindly copying YAML: run its config/model diagnostics, inspect every auxiliary override, run `hermes doctor`, restart the gateway, and start fresh task sessions. Hermes documents that auxiliary work defaults to the main model unless explicitly overridden and that mid-session model changes invalidate prompt caching ([configuration](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/configuration.md), [model configuration](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/configuring-models.md)).

## Eve Role

Phase B is an experiment, not a sidecar. Deploy a pinned commit of eve in an isolated test project/account with synthetic data, a test Slack app/channel, test schedules initially disabled, separate secrets, separate receipt namespace, and no production Command Center write credential. Eve receives the same workflow contract, model policy, fixtures, tool mocks, timeouts, and acceptance checks as Hermes. The workflow is:

1. Accept one synthetic vendor-document email or Slack mention.
2. Deduplicate and create one synthetic work item.
3. Extract/classify evidence, using the Gmail API or fixture API first.
4. Prepare a thread reply and email draft, park both behind approval.
5. Resume after a synthetic approval, write receipts, and close the test item.
6. Survive injected process termination between every step and resume without duplicate effects.

Eve must not subscribe to Maya's production Slack app, production Gmail watch, or production schedules. During a bounded computer-use subtest, Phase A is fully quiesced and a lease grants eve access to Maya's existing Orgo computer; otherwise use a sanitized browser fixture. No desktop is cloned or provisioned for the comparison. Test claims include durable step recovery, approval parking, structured events, evals, Slack, and cron support, all described in official eve materials linked above.

Score both runtimes over repeated runs on critical correctness, exactly-once external effects, identity/scope, recovery, approval integrity, latency, tokens/cost, operator minutes, deploy complexity, and trace completeness. A critical authorization, cross-account, duplicate-send, or financial error is an automatic failure. Eve wins only if all safety gates equal Hermes and it reduces median operator recovery/toil by an agreed material threshold (assumption: at least 30%) without more infrastructure ownership. Otherwise retain Hermes.

## Named Agent Template

Every agent package is generated from one schema with these mandatory unique resources: dedicated Orgo workspace; workspace-scoped Orgo key; persistent computer; Google Workspace identity/session; isolated Hermes home; Slack app/bot identity and channel allowlist; least-privilege Command Center bearer identity; model/spend ledger; ownership lease; kill switch. No OAuth session, Slack token, Orgo key, Hermes state, cron store, cache, or Command Center credential is shared.

| Agent | Dedicated target | Default authority and immutable limits |
| --- | --- | --- |
| Maya Chen | workspace/computer + `maya.chen@cc.proexteriorsus.net` + Maya Slack + Maya Hermes home | Intake/classify/attach evidence; no external send, approval decision, or service-role token; HR/payroll escalates without extraction |
| Alex Rivers | reuse dedicated desktop if registry proves it; otherwise provision later | Analyze pricing/SKU/UOM using normalized pricing UOM; no vendor send, approval, or policy exception |
| Casey Morgan | reuse dedicated desktop if present | Draft vendor challenges only from reviewed packets; no external send; material/legal disputes escalate |
| Jordan Price | **new dedicated-desktop target**, despite legacy workspace-only plan | Read/reconcile finance and produce narratives; no payment, banking, journal-posting, close, or approval authority |
| Sam Torres | **new dedicated-desktop target**, despite legacy workspace-only plan | Sample/audit and recommend; no external send or approval; only Quality Control may edit `trust_tier`; email remains routed through Conductor unless separately approved |
| Rowan Vale | reuse dedicated external-research desktop | **External-only boundary:** public/external sources only, no internal brain, customer data, repo secret, Supabase/Command Center broad read, or service-role credential; research execution/results remain approval-gated |
| Lena Brooks | reuse dedicated marketing desktop | Draft content/review/schema/media work; no publish, review response, campaign launch, credential/admin, or reputation-sensitive decision without approval |

The template also carries each role's `SOUL.md`, tool and domain allowlists, Google scopes, email aliases, Slack channels, task classes, cadence, escalation triggers, data classification, approval policy, token ceilings, and health probes. Common infrastructure never expands role authority. The exact roster and routing evidence comes from `agents/profiles/*.yaml` and `docs/roofing-ops-slack-agent-routing.md`; older five-desktop assumptions are migration evidence, not target architecture.

Roll out serially: Maya baseline/comparison and human go/no-go, then Alex, Casey, Jordan, Sam, Rowan, and Lena. For each: discover/reuse, validate isolation, connect synthetic inputs, test restart/dedup/approval, connect one live inbound lane in shadow/draft-only mode, observe, then activate. Failure pauses the series; no bulk enablement.

## Model and Cost Policy

Use task-level Hermes-native tiers, not one expensive persona default:

| Tier | Initial benchmark candidate | Intended work | Initial per-run ceiling |
| --- | --- | --- | --- |
| T0 structured | `google/gemini-3.1-flash-lite` | routing, extraction, titles, compression, deterministic-format summaries | 24k input / 2k output tokens |
| T1 workhorse | `anthropic/claude-haiku-4.5` | tool use, correspondence drafts, evidence synthesis, browser decisions | 48k input / 4k output |
| T2 judgment | benchmark-selected current strong model | material finance ambiguity, final QA adjudication, high-risk disputes | 80k input / 8k output; rule or human escalation only |

The listed T0/T1 prices in `plans/ringer/named-agents-runtime-evaluation/HERMES-NAMED-AGENT-TEMPLATE.md` are planning inputs ($0.25/$1.50 and $1/$5 per million input/output tokens respectively), not locked procurement facts. Recheck model availability, context/tool support, provider, and price on deployment day. Configure cheap explicit auxiliary models for compression, title generation, web extraction, vision, approval summaries, and triage; otherwise Hermes uses the main model and obscures costs.

Each canonical job declares `task_class`, tier, input/output maximum, wall timeout, retry limit, acceptance test, escalation condition, and dollar cap. T0 may retry once at T1 only after a logged structural/semantic failure. T2 cannot silently downgrade or self-promote; unavailability parks the job and alerts an operator. Use short new sessions per tier to avoid cache-reset costs.

For OpenRouter routes set `sort: price`, `require_parameters: true`, and `data_collection: deny`, plus a reviewed provider allowlist; apply equivalent `extra_body` controls to every auxiliary task because Hermes configures auxiliary routing independently. Hermes documents these controls and the distinction between provider routing and model fallback ([provider routing](https://hermes-agent.nousresearch.com/docs/user-guide/features/provider-routing), [fallback providers](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/fallback-providers.md)). Provider account settings must also disable training/logging where available, enforce zero-data-retention-capable routes where required, and prevent free/random routers for internal or customer data. Configuration flags are verified by a provider-side control review, not assumed sufficient.

Every call emits a cost receipt: agent/job/run/trace, task class, requested and actual model/provider, input/output/cache tokens, published unit prices and date, estimated/settled cost, latency, retry/escalation, approval state, and effects. Per-agent daily and monthly soft alerts plus hard circuit breakers stop new noncritical work; T2 and auxiliary usage have separate budgets. Benchmark redacted/synthetic fixtures across T0/T1/T2 for schema, factual accuracy, tool choice, safety, latency, and cost. Promote the cheapest tier passing repeated gates; finance/audit tasks require zero critical errors. Model/version drift reopens the benchmark.

## Email Design

Gmail is API-first. Use one OAuth/service identity per named Google account with only required scopes, narrow label/query filters, stable Gmail message/thread IDs, incremental history/watch cursors, and attachment size/type scanning. Fetch metadata/body/attachments only after the routing rule authorizes that mailbox and label. Maya's synthetic intake must prove that unrelated messages are neither fetched nor logged. Marking, labeling, or drafting is a distinct, receipted operation; sending is unavailable to the runtime.

Browser fallback is allowed only when the Gmail API cannot complete an approved workflow (for example, interactive reauthentication or a portal-only download). It uses that agent's existing authenticated Orgo Chrome profile, never another agent's profile or Chris's admin identity. The job records why API use failed, requires an approval where credentials/MFA/permissions are involved, captures only redacted evidence, and returns to API operation afterward. Browser automation may draft but cannot click Send.

Outbound email defaults to draft/propose. A human approval record binds exact sender, recipients, subject/body/attachment hashes, expiry, and idempotency key; any edit invalidates approval. External sends, publication, payment, destructive writes, and permission changes remain human actions. AgentMail remains a separate service-role intake path described in `deployment/remote/agentmail/README.md`; Sam's no-mailbox route through Conductor is preserved, and no runtime silently conflates an AgentMail service inbox with the named Google identity.

## Slack Design

Each named agent keeps its dedicated Slack app/bot and strict channel allowlist. Identity-bearing replies fail closed if that bot token is unavailable—never fall back to a shared bot. Validate Slack team ID, human-user allowlist, channel, mention/thread policy, and bot-event exclusion before work creation. Reply in the originating thread and record `event_id`, `channel_id`, `thread_ts`, bot identity, approval, and Command Center work key.

Prevent duplicates at four layers: Slack event envelope deduplication; a database uniqueness constraint on source key; fenced runtime ownership; and an outbound effect ledger that atomically reserves `reply:{team}:{channel}:{thread}:{logical_action}` before posting. Retries read the existing Slack timestamp rather than repost. Ignore bot messages and agent-to-agent DMs. Reports go to internal reporting lanes, not channels consumed as human requests. `docs/roofing-ops-runtime-status.md` claims eight listeners on the agent VPS but still requires human-originated validation; because authorized SSH health was unavailable, that remote state is **unknown**, not a second runtime to assume safe.

## Security Controls

- Store secrets only in the approved secret manager/process supervisor; inject by reference at runtime. Owner-only Hermes `.env` is a fallback for agent-specific provider credentials, never for account-wide Orgo or Supabase service-role keys. Redact environment dumps, command lines, exceptions, screenshots, and receipts.
- Use unique per-agent provider keys/budgets where supported. Rotate the observed account-wide Orgo key; retain it only in provisioning control, and create manually verified workspace-scoped runtime keys.
- Command Center issues each agent a scoped bearer identity limited to its role and explicit routes/rows. No agent receives a Supabase service-role key. Rowan receives no internal-data credential at all.
- Google, Slack, Orgo, model-provider, and Command Center accounts are one-to-one with the persona. Deny cross-agent filesystem reads and browser-profile access; assert UNIX ownership/mode and workspace scope during every health check.
- Network egress is allowlisted by role. Provider prompts contain the minimum redacted evidence. Skills/integrations are pinned and must pass license/provenance, egress, installer/permission, static-scan, rollback, and human gates before use.
- All external side effects require policy evaluation and immutable receipts. Kill switches exist per agent, trigger type, outbound channel, provider, and global Roofing-Ops plane.

## Failure and Recovery

Health has separate probes for Orgo computer state, Hermes/eve process, ownership lease, scheduler last/next run, Slack socket/last event, Gmail cursor/token, Google session, Command Center auth, queue depth/oldest age, model/provider, daily spend, approval queue, and receipt sink. A green process with a stale lease or cursor is unhealthy. Status exposes version/config hash and synthetic canary result without secrets or message content.

On failure, the operator: (1) engage the affected trigger/outbound kill switch; (2) preserve lease, queue, logs, and effect ledger; (3) identify last committed checkpoint and external effect; (4) revoke/rotate only the implicated credential; (5) repair or restore the pinned config/home backup; (6) run read-only health and one synthetic canary; (7) explicitly reacquire ownership with a new fencing epoch; (8) resume quarantined work one item at a time. Never recover by creating a replacement desktop before inventorying the existing one.

If eve fails, disable its Slack connection and schedules, wait for leases/in-flight steps to quiesce, verify no reserved effect lacks a receipt, then restore Hermes ownership and inject a canary. No database migration, desktop replacement, or DNS change is allowed in the pilot, so rollback is configuration/lease restoration. If Hermes fails, stop its gateway before repair; do not start eve as an unreviewed emergency co-owner. Google auth expiry parks browser work for human reauthentication. Slack auth failure fails identity posts closed. Provider outage follows the declared fallback chain within budget; T2 failure parks. Spend breaker, scope mismatch, duplicate detection, or receipt-sink failure stops effects and pages the operator.

## Evidence

Local evidence used:

- `plans/ringer/named-agents-runtime-evaluation/inputs/linear-and-runtime-evidence.md`: confirmed Maya desktop/Google session, secret name, read-only account-wide-scope evidence, and unknown VPS state.
- `plans/ringer/named-agents-runtime-evaluation/HERMES-NAMED-AGENT-TEMPLATE.md`: isolated runtime package, tier policy, receipts, and benchmark contract.
- `docs/58-dev-vs-ops-agent-delineation.md`: Roofing-Ops/DevTeam boundary.
- `docs/70-agent-coordination-stabilization-and-migration-plan.md`: queue/cadence/identity drift, Sam email routing, and incomplete coordination.
- `docs/roofing-ops-runtime-status.md` and `docs/roofing-ops-slack-agent-routing.md`: claimed listener topology, required human validation, named scopes, channels, and Rowan approval boundary.
- `deployment/remote/orgo/README.md`: legacy five-desktop plan and idempotent-name provisioner, superseded here for Jordan/Sam and strengthened to stable-ID discovery.
- `deployment/remote/agentmail/README.md` and `app/command-center/src/lib/agentmail.ts`: service inboxes, webhook controls, and omitted roles.
- `app/command-center/runtime/slack-socket-runtime.mjs` and `app/command-center/runtime/roofing-ops-agent-router.mjs`: current Slack listeners/poller/router and duplicate-owner risk.

Official vendor evidence: [Orgo authentication](https://docs.orgo.ai/api-reference/authentication), [Orgo API/Hermes guidance](https://docs.orgo.ai/llms.txt), [Hermes configuration](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/configuration.md), [Hermes models](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/configuring-models.md), [Hermes routing](https://hermes-agent.nousresearch.com/docs/user-guide/features/provider-routing), [Hermes fallbacks](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/fallback-providers.md), [eve product/docs entry](https://vercel.com/eve), [eve announcement](https://vercel.com/blog/introducing-eve), and [eve source](https://github.com/vercel/eve).

Evidence limits: no production resource or secret was inspected during this design; no authorized VPS health check succeeded; vendor documentation can drift; and the Orgo key-scope conclusion is a documented inference from the supplied read-only test, not a decoded property of the variable name.

## Recommendation

Approve a **non-production Maya Phase A** only after the third-party tool gate, secret rotation/scope proof, stable-ID desktop discovery, synthetic tenant/channel/inbox availability, and explicit human change approval. Establish Hermes-on-Orgo as the measured baseline and sole owner. Then approve a time-boxed, isolated eve Phase B with identical fixtures and no production credentials. Keep Hermes unless eve clears every critical gate and demonstrates a material reduction in recovery/toil.

After the decision, freeze the winning control-plane implementation as the reusable schema above and roll it out serially—Maya, Alex, Casey, Jordan, Sam, Rowan, Lena—with an independent go/no-go after each agent. Preserve all role limits, especially Rowan external-only, Sam/Quality Control trust-tier separation, normalized-UOM accounting, and human control of outbound or consequential actions.
