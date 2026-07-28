# Hermes Named-Agent Configuration Template

Status: planning contract; exact model promotion requires the Maya benchmark and
human approval before production activation.

## Objective

Give every named agent an isolated, reproducible Hermes runtime that uses the least
expensive model proven adequate for each task. Model choice is task-scoped rather
than a single expensive default for the entire persona.

## Runtime invariant

Each named agent owns a dedicated Orgo workspace/computer, Google Workspace
identity, workspace-scoped Orgo key, `~/.hermes`, Slack identity, Command Center
service identity, model usage ledger, and kill switch. No Hermes home, OAuth session,
Slack token, Orgo key, cron store, or conversation cache is shared across personas.

The account-wide `ORGO_API_KEY_MASTER` is a provisioning credential only. It may
create and inventory agent workspaces and computers, but is never copied into a
Hermes home. Each runtime receives only its own workspace-scoped Orgo key.

Hermes is initially the sole owner of schedules and Slack events. If eve wins the
comparison, those triggers move to eve and the Hermes gateway/scheduler is disabled
or Hermes becomes an explicitly invoked worker. Dual ownership is prohibited.

## Model ladder

| Tier | Initial candidate | Current list price | Use |
| --- | --- | --- | --- |
| T0 structured | `google/gemini-3.1-flash-lite` | $0.25 input / $1.50 output per 1M tokens | Routing, classification, extraction, titles, compression, simple summaries |
| T1 tool workhorse | `anthropic/claude-haiku-4.5` | $1 input / $5 output per 1M tokens | Multi-tool workflows, correspondence drafts, evidence synthesis, browser decisions |
| T2 judgment | Selected by the Ringer benchmark from current strong models | Budgeted per accepted run | Financial exceptions, QA adjudication, high-risk ambiguity, complex dispute strategy |

Prices and model availability are checked again at deployment. Free/random routers
are excluded from customer and internal data because provider identity, retention,
availability, and quality are not sufficiently deterministic. T2 never silently
downgrades. A failed T2 route queues the work and alerts the operator.

## Hermes configuration contract

The generated `~/.hermes/config.yaml` for each agent must include:

```yaml
model:
  provider: openrouter
  default: google/gemini-3.1-flash-lite
  base_url: ""
  api_mode: chat_completions

agent:
  reasoning_effort: minimal

provider_routing:
  sort: price
  require_parameters: true
  data_collection: deny

auxiliary:
  compression:
    provider: openrouter
    model: google/gemini-3.1-flash-lite
    reasoning_effort: none
  title_generation:
    provider: openrouter
    model: google/gemini-3.1-flash-lite
    reasoning_effort: none
  web_extract:
    provider: openrouter
    model: google/gemini-3.1-flash-lite
    reasoning_effort: minimal
  vision:
    provider: openrouter
    model: google/gemini-3.1-flash-lite
    reasoning_effort: minimal
  approval:
    provider: openrouter
    model: google/gemini-3.1-flash-lite
    reasoning_effort: none

fallback_providers:
  - provider: openrouter
    model: anthropic/claude-haiku-4.5
```

This is a baseline shape, not a blind copy operation. The installed Hermes version
must validate the file, `hermes config get model --json` must show the intended main
model, and the auxiliary-model API/status must show every override. Existing sessions
must be closed or the gateway restarted because model changes apply to new sessions.

The model-provider credential is unique to one agent and is injected by secret
reference into `~/.hermes/.env` with owner-only permissions. A shared provider
credential is prohibited. If a provider cannot issue per-agent credentials, use only
a separately gated broker that enforces per-agent authentication, budgets,
attribution, audit, and revocation; otherwise that provider is ineligible. The file
contains only that agent's least-privilege credentials and never an account-wide Orgo
key, shared provider key, or Supabase service-role key. Backups contain references,
never credential values.

## Per-agent default and escalation policy

| Agent | Default | Escalate to T1 | Escalate to T2 |
| --- | --- | --- | --- |
| Maya | T0 | Ambiguous PDFs, multi-document reconciliation, browser recovery | Conflicting financial evidence with material impact |
| Alex | T0 for deterministic comparisons | Unmatched SKU/UOM evidence and tool-driven investigation | Material price exception or policy ambiguity |
| Casey | T1 | Default already covers vendor draft preparation | Complex dispute strategy or legally sensitive wording |
| Jordan | T0 for scheduled rollups | Financial narrative and multi-source reconciliation | Strategic finance judgment or material anomaly |
| Sam | T1 for routine checks | Default already covers evidence review | Final QA adjudication, systemic failure, standard conflict |
| Rowan | T0 retrieval/classification | Multi-source external synthesis | High-impact recommendation with conflicting sources |
| Lena | T0 classification/metadata | Human-facing content draft and brand synthesis | Reputationally sensitive campaign or policy decision |
| Ops Conductor | T0 deterministic routing | Digest synthesis and ambiguous ownership | Incident command or cross-agent policy conflict |

Deterministic calculations, UOM normalization, authorization, deduplication, routing
precedence, allowlists, and approval enforcement remain code—not LLM judgment.

## Escalation mechanism

Every job declares `task_class`, `model_tier`, maximum input/output tokens, timeout,
retry count, and acceptance check in the canonical cadence file. T0 is attempted only
for task classes that passed the benchmark. On a failed structural/semantic check,
the run may retry once at T1. T2 requires an explicit rule or human escalation; the
agent cannot promote an ordinary job merely because it prefers a stronger answer.

Avoid mid-session model switching for routine work because Hermes documents that a
switch resets prompt caching. Prefer short, task-bounded sessions and dedicated cron
jobs with a fixed model tier.

## Full per-agent Hermes package

Each generated package contains and validates:

- `SOUL.md`: identity, epistemic honesty, scope, prohibited actions, escalation.
- `config.yaml`: provider, model ladder, auxiliary models, routing, fallbacks,
  reasoning effort, toolsets, approvals, browser and gateway configuration.
- `.env`: agent-specific secret references/values only; mode 0600.
- `skills/`: allowlisted, version-pinned skills that passed the third-party tool gate.
- `cron/jobs.json`: generated from one canonical cadence source; initially paused.
- Slack configuration: one bot identity, channel allowlist, thread/mention rules.
- Owner-escalation contract: concise natural-language assignments are normal work.
  When blocked, materially ambiguous, missing access/authorization, or unclear on
  routing, the agent promptly asks Christopher in Slack. Prefer the originating
  operational thread; use an approved private owner destination only for sensitive
  context. The message identifies the agent, source/assignment, completed attempts,
  exact blocker, recommended route or bounded options, and the specific decision
  needed. The agent continues unblocked work and resumes after Christopher answers;
  it never silently stalls or repeats a generic refusal.
  A conversation-only listener asks in its current thread and never claims a separate
  DM was sent. A mailbox/task executor may initiate the escalation only through its
  pinned, approved Christopher destination with an effect receipt.
- Google/Orgo configuration: stable computer ID and workspace ID; never create by
  display name alone when a registry entry exists.
- Command Center auth: scoped bearer identity; no Supabase service role.
- Logs/receipts: agent, job, model, provider, tokens, estimated cost, trace ID,
  outcome, retry/escalation, approval state, and external side effects.
- Email policy: every authorized email, including an approved reply to an original
  sender, must contain `admin@cc.proexteriorsus.net` in the CC field. Enforce this in
  the executor and fail closed before provider I/O when the required CC is absent.
- Health: gateway, cron, Slack socket, Orgo computer, Google session, Command Center,
  last/next run, queue depth, daily spend, and budget circuit breaker.

## Benchmark and promotion gate

For every task class, assemble redacted/synthetic fixtures and score T0, T1, and T2
on schema validity, factual accuracy, tool selection, safety, latency, and cost. The
cheapest tier meeting the minimum score in repeated runs becomes the declared tier.
Financial and audit tasks require zero critical errors. The scorecard, model ID,
provider, prices, and date are retained so model drift triggers re-evaluation.

## Thirty-minute mailbox job

Each production package contains one paused-by-default mailbox job scheduled every
30 minutes by exactly one runtime owner. It uses the dedicated Google principal and
a durable cursor, deduplicates by stable message ID, and classifies each new message.
The Maya pilot records actionable work as a source-linked `[MAYA]` issue in the
pinned PE-CC-DevTeam Linear team; future personas must pin their own approved task
destination before activation. A blocked item may contact Christopher only through
that agent's pinned Slack persona/destination. It never replies to the original
sender or sends email during the initial operating phase. Every provider effect has
a private receipt; an uncertain remote success becomes terminally ambiguous and is
never retried automatically.

The initial executor is intentionally task intake and routing, not unrestricted
material execution. It does not parse attachment contents, pay, approve, publish,
change access, or correspond with a sender. Those task classes require their own
Composio action, deterministic acceptance checks, Ringer evidence, and production
promotion.

The mandatory CC rule applies independently of the destination allowlist: adding
`admin@cc.proexteriorsus.net` to CC never authorizes an otherwise unapproved recipient.

Sources:

- Hermes configuration: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/configuration.md
- Hermes model configuration: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/configuring-models.md
- Hermes provider routing: https://hermes-agent.nousresearch.com/docs/user-guide/features/provider-routing
- Hermes fallback providers: https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/fallback-providers.md
- Gemini 3.1 Flash Lite pricing: https://openrouter.ai/google/gemini-3.1-flash-lite/pricing
- Claude Haiku 4.5 pricing: https://openrouter.ai/anthropic/claude-haiku-4.5/pricing
