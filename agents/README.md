# agents/

Orientation to the `agents/` folder. Six subfolders hold the workforce charters, named-persona files, schedules, the DevTeam Open Engine, and the named-agent principal registry. Wording below is taken from those files. The [SOUL.md roster](#soulmd-roster) lists every `SOUL.md` under this tree.

## [cadences/](cadences/)

Schedule and cadence plans. Three files.

### [roofing-agent-master-cadence.yaml](cadences/roofing-agent-master-cadence.yaml)

Header: Pro Exteriors Open Brain agent cadence and task master plan, `schema_version` 1.1.0, `last_updated` 2026-08-06, `applies_to` `pro-exteriors`. The opening comment sets a NEPQ communication standard for every agent in the file (situation, problem, consequence, options; daily summaries as what happened, what it means, what needs attention).

Top-level blocks and the role line in each header:

| Block | Header role line |
| --- | --- |
| `maya_chen` | Document intake and extraction; front door for supplier documents. `always_on` Gmail poll, weekday morning inbox audit, weekday end-of-day summary. |
| `alex_rivers` | Pricing variance analyst. Weekday `morning_abc_sync` and `variance_daily_summary`, plus longer-cycle variance review. |
| `casey_morgan` | Vendor communications and challenge draft. Event-triggered when a dispute packet is ready. |
| `jordan_price` | Finance, job P&L, and commission engine. Scheduled weekly finance packet. |
| `sam_torres` | QA, accuracy monitor, and vendor grading. Weekly agent-output sampling. |
| `rowan_vale` | External research and source intelligence; external-only, no brain access. Event-triggered research requests, plus a quarterly technology-landscape scan. |
| `lena_brooks` | EEAT, reputation, and local content. Event-triggered on job close. |
| `handoff_flows` | Cross-agent coordination. The comment says this is how the seven agents hand off to each other. Entries name `from`, `to`, `trigger`, and `payload`. |

### [dev-team-architecture.yaml](cadences/dev-team-architecture.yaml)

Header: Dev Agent Team architecture and cadence plan, version 1.0.0, June 2026. `team_name` is `Open Brain Dev Team`. The comment says these agents maintain Pro Exteriors apps in the short term and the Cleverwork platform in the long term, and that Dev Conductor relays commands and reports.

- `slack_channels` names four private channels: `ob-dev-command`, `ob-dev-team`, `ob-dev-incidents`, `ob-dev-weekly`, each with a purpose line.
- `compute_decisions` records a compute model and reason for `dev_conductor`, `code_reviewer`, `security_guardian`, `bug_triager`, `feature_planner`, `sentry_analyst`, `uptime_monitor`, `integration_specialist`, `red_team`, `repo_janitor`, `tool_manager`, `skills_manager`, and `memory_clerk`.
- Dedicated cadence blocks follow for `dev_conductor`, `code_reviewer`, `security_guardian`, `sentry_analyst`, `bug_triager`, `uptime_monitor`, `red_team`, `repo_janitor`, `skills_manager`, `tool_manager`, and `memory_clerk`. Each block's comment states that role's job.
- `nepq_communication_standard` holds principles plus escalation, daily-summary, and handoff templates for dev-agent communication.

`feature_planner` and `integration_specialist` appear in `compute_decisions`. This file has no matching cadence block for either name. `seo_engineer` and `session_analyst` are absent here; they appear in [profiles/dev-team-profiles.yaml](profiles/dev-team-profiles.yaml) and in the cron file below.

### [dev-team-cron-jobs.json](cadences/dev-team-cron-jobs.json)

A JSON array of eight scheduled jobs. Each object has `name`, `schedule`, `agent`, `toolsets`, `skills`, `prompt`, and `channel`. One job sets `no_agent` to true. The `agent` value is an address; it is omitted here.

| Name | Schedule | Prompt (from the file) | Channel |
| --- | --- | --- | --- |
| `dev-uptime-heartbeat` | `*/15 * * * *` | Run `scripts/uptime-check.sh` on the host. Post to `#ob-dev-incidents` only if output is non-empty. `no_agent` is true. | `ob-dev-incidents` |
| `dev-sentry-digest` | `0 7 * * *` | Sentry Analyst daily error digest. File Linear issues for P1/P2 patterns. Post a summary to `#ob-dev-team`. Silent if nothing is actionable. | `ob-dev-team` |
| `dev-security-weekly` | `0 5 * * 1` | Security Guardian weekly scan: `npm audit` in `app/command-center`, review drift in `docs/59-endpoint-auth-matrix.md`, file Linear tasks for HIGH/CRITICAL. | `ob-dev-team` |
| `dev-red-team-watchlist` | `0 10 * * 3` | Red Team picks one watchlist item from `docs/59-red-team-milestone-protocol.md` and runs one adversarial cycle. | `ob-dev-team` |
| `dev-memory-clerk` | `0 22 * * *` | Memory Clerk checks `context/MEMORY.md` and `USER.md` caps and contradictions. File Linear memory-drift issues. The prompt says never auto-write curated memory. | `ob-dev-team` |
| `dev-repo-janitor` | `0 8 * * 1` | Repo Janitor: stale branches, old TODOs, memsearch index reminder. File Linear cleanup tasks. The prompt says never delete without Dev Conductor approval. | `ob-dev-team` |
| `dev-seo-weekly` | `0 6 * * 1` | SEO Engineer weekly audit, pointing at `docs/knowledge-base/runbooks/seo-weekly-audit.md`: PageSpeed gate, Lighthouse fallback, URL inspection, and sitemap health. | `ob-dev-team` |
| `dev-session-analyst` | `0 8 * * *` | Session Analyst reads the dev activity summary and cross-checks Sentry replay friction. File ux-friction Linear issues when thresholds are exceeded. | `ob-dev-team` |

## [dev-engine/](dev-engine/)

Open Engine, the DevTeam plane. [README.md](dev-engine/README.md) calls it the on-demand orchestration layer for the AI runtimes that build and maintain the brain, and separates it from the roofing operational agents (Alex, Maya, Casey, Jordan, Sam, Rowan, Lena), which it says run on the scheduled Hermes cron cadence. It points at [docs/58-dev-vs-ops-agent-delineation.md](../docs/58-dev-vs-ops-agent-delineation.md) for the full contract.

[README.md](dev-engine/README.md) states these boundaries:

- DevTeam runtimes do not hold the roofing Supabase service token (`no_supabase_service_role: true`).
- Dev work is tracked in Linear and receipts, and the README says it is kept off `dashboard_action_log`.
- The `pe-cc-hermes` seam: the dev Hermes profile here is Linear-driven and has no brain token. The roofing Maintenance/Hermes profile under [horizontal/maintenance/](horizontal/maintenance/) is a separate profile. The README says the same binary has two isolated homes and must not share one `.env`.

The same README lists repo automation that reads or writes this plane:

| Script | Purpose in the README |
| --- | --- |
| [scripts/open-engine-preflight.mjs](../scripts/open-engine-preflight.mjs) | Version and plane boundary checks |
| [scripts/open-engine-queue-runner.mjs](../scripts/open-engine-queue-runner.mjs) | One-task Linear heartbeat for `pe-cc-agents` |
| [scripts/provision-dev-agent-env.sh](../scripts/provision-dev-agent-env.sh) | Dev Hermes env with no brain token |
| [scripts/deploy-dev-crons.py](../scripts/deploy-dev-crons.py) | Writes [cadences/dev-team-cron-jobs.json](cadences/dev-team-cron-jobs.json) |
| [scripts/agent-tick.sh](../scripts/agent-tick.sh) | Headless Hermes cron tick on the host |

It also points at [deployment/remote/DEVTEAM-HOST-SETUP.md](../deployment/remote/DEVTEAM-HOST-SETUP.md), [docs/knowledge-base/open-engine/runtime-agent-routing-map.md](../docs/knowledge-base/open-engine/runtime-agent-routing-map.md), and [docs/59-red-team-milestone-protocol.md](../docs/59-red-team-milestone-protocol.md).

### [AGENTS.md](dev-engine/AGENTS.md)

The file calls itself the `/open-engine` trigger (Open Engine v1.0.1). It says a runtime that opens this directory loads this file as session context, builds and maintains the Pro Exteriors Open Brain, and does not touch the roofing business. It maps each runtime to a private context file:

| Runtime | Agent code | Private context |
| --- | --- | --- |
| Hermes | `pe-cc-hermes` | [pe-cc-hermes/SKILL.md](dev-engine/pe-cc-hermes/SKILL.md) |
| Claude Code | `pe-cc-claude` | [pe-cc-claude/SKILL.md](dev-engine/pe-cc-claude/SKILL.md) |
| Codex | `pe-cc-codex` | [pe-cc-codex/SKILL.md](dev-engine/pe-cc-codex/SKILL.md) |
| Cursor | `pe-cc-cursor` | [pe-cc-cursor/SKILL.md](dev-engine/pe-cc-cursor/SKILL.md) |
| Warp | `pe-cc-warp` | [pe-cc-warp/SKILL.md](dev-engine/pe-cc-warp/SKILL.md) |
| Hetzner autonomous | `pe-cc-agents` | [pe-cc-agents/SKILL.md](dev-engine/pe-cc-agents/SKILL.md) |

The rest of the file is the shared queue runner: one task issue per heartbeat, standing preflight against Linear issue `PEC-1`, optional-skill preflight against `PEC-3`, status ledger `PEC-2`, team `PE-CC-DevTeam`, project `PE-CC-DevEngine`, label `agent-instructions`. It lists workflow statuses (Standing, Agent Todo, Agent Working, Agent Needs Input, Agent Review, Agent Done) and receipt tokens (`AGENT CLAIMED`, `AGENT DONE`, `AGENT BLOCKED`, `AGENT UNBLOCKED`, `AGENT HUMAN HOLD`, `AGENT HUMAN ANSWERED`, `AGENT RESUMED`, `AGENT FAILED`, `AGENT APPLIED`, skill receipts, `AGENT FOLLOW-UP`, `AGENT STATUS`). Plane and safety boundaries match the README.

### Private context files

Each `pe-cc-*/SKILL.md` repeats that contract for one runtime. Frontmatter on all six is `engine_version: 1.0.1`, `no_supabase_service_role: true`, operator Chris, and the Linear team, project, and ledger keys above. The identity block is the only material difference:

| File | `agent_code` | Runtime line |
| --- | --- | --- |
| [pe-cc-agents/SKILL.md](dev-engine/pe-cc-agents/SKILL.md) | `pe-cc-agents` | Autonomous (Hetzner pe-ob-agents) |
| [pe-cc-claude/SKILL.md](dev-engine/pe-cc-claude/SKILL.md) | `pe-cc-claude` | Claude Code |
| [pe-cc-codex/SKILL.md](dev-engine/pe-cc-codex/SKILL.md) | `pe-cc-codex` | Codex |
| [pe-cc-cursor/SKILL.md](dev-engine/pe-cc-cursor/SKILL.md) | `pe-cc-cursor` | Cursor |
| [pe-cc-hermes/SKILL.md](dev-engine/pe-cc-hermes/SKILL.md) | `pe-cc-hermes` | Hermes |
| [pe-cc-warp/SKILL.md](dev-engine/pe-cc-warp/SKILL.md) | `pe-cc-warp` | Warp |

Each file's claim filter is Linear issues titled `[agent instructions][<agent-code>][task]`. Optional skills and notes are `none` in every file read here.

### [PEC-3-skills-registry.yaml](dev-engine/PEC-3-skills-registry.yaml)

Header: optional skills registry, a mirror for Linear standing issue `PEC-3`. Version 1.0.1, updated 2026-06-28. The comment says Skills Manager maintains the file and Tool Manager audits it against `agent-tooling-matrix.md`. Each entry has `id`, `path`, `version`, `scope`, and `risk`. Some entries also name runner scripts and env key names; those key names are left in the source file.

Skill ids present: `standing-preflight`, `nepq-agent-communication`, `status-ledger-update`, `endpoint-auth-matrix-review`, `prompt-injection-review`, `supabase-performance-triage`, `release-day-smoke`, `pagespeed-95-gate`, `schema-technical-seo-aeo`, `indexing-sitemap-health`, `gsd-code-review`, `gsd-secure-phase`, `gsd-verify-work`, `red-team-milestone-protocol`, `third-party-agent-tool-gate`.

## [horizontal/](horizontal/)

Infrastructure workforce. [README.md](horizontal/README.md) calls these eight agents the infrastructure workforce of the Cleverwork Open Brain, invisible to the client. It says full charters live in each agent's `ROLE.md` and MCP contracts live in `io-contract.md`. The same README describes a day flow (Capture overnight, Maintenance daily sort, Conductor digests, vertical work passing through Historian, Researcher, and Auditor) and two separations: Historian reads only inside the client brain and Researcher reads only outside it; Auditor enforces the current standard per work product and Quality Control sets and versions that standard.

The README's own one-line charters:

| Agent | Visibility in the README | One-line charter |
| --- | --- | --- |
| [Capture](horizontal/capture/ROLE.md) | Dashboard only | Listens to all event streams and atomizes. The mission says it writes shaped atoms to `public.thoughts` and does not interpret, opine, or route. |
| [Historian](horizontal/historian/ROLE.md) | Routed via Conductor | Internal-only retrieval over the client's brain. The mission says it returns cited, era-attributed atoms and does not touch the public internet. |
| [Researcher](horizontal/researcher/ROLE.md) | Dashboard only | External-only retrieval from the public web and enrichment APIs. The mission says it never touches the client's brain and does not write atoms directly. |
| [Conductor](horizontal/conductor/ROLE.md) | Slack digests and routing | Routes, digests, escalates, and keeps the calendar. The mission calls it the operating nerve of the workforce. |
| [Auditor](horizontal/auditor/ROLE.md) | Gates work products | Per-work-product QA against the current QC-issued standard. The mission says it passes, fails, or escalates, and does not set the standard. |
| [Quality Control](horizontal/quality-control/ROLE.md) | Internal review meetings | Cross-job pattern analysis and DMAIC. The mission says it sets and versions the standards Auditor enforces, and is the only role authorized to change `trust_tier` on an existing atom. |
| [Innovator](horizontal/innovator/ROLE.md) | Proposals only | Scouts patterns and technology and produces Six Sigma A3 proposals. The mission says it never builds; Chris and the account manager decide. The A3 template path in the role file is `proposals/_a3-template.md`. |
| [Maintenance](horizontal/maintenance/ROLE.md) | Weekly hygiene digest | 5S of the brain: Sort, Set in Order, Shine, Standardize, Sustain. The mission says it never deletes, never modifies provenance, never changes `trust_tier`, and never publishes. |

Seven roles have an `io-contract.md` beside `ROLE.md`: [auditor](horizontal/auditor/io-contract.md), [capture](horizontal/capture/io-contract.md), [conductor](horizontal/conductor/io-contract.md), [historian](horizontal/historian/io-contract.md), [innovator](horizontal/innovator/io-contract.md), [quality-control](horizontal/quality-control/io-contract.md), [researcher](horizontal/researcher/io-contract.md). Each opens by saying it records MCP endpoints called, `public.thoughts` fields read or written, an example input and output, and failure handling. Maintenance has no `io-contract.md` in this tree.

### [maintenance/](horizontal/maintenance/)

[maintenance/README.md](horizontal/maintenance/README.md) says Maintenance is the repo and brain hygiene agent, and that in production it runs as Hermes, the Brain Librarian.

| File | What the file says it is |
| --- | --- |
| [ROLE.md](horizontal/maintenance/ROLE.md) | Charter: daily Sort through quarterly Sustain, Kaizen logging, workspace front desk, import triage, and GSD loop support. |
| [PLAYBOOK.md](horizontal/maintenance/PLAYBOOK.md) | Living operational manual, version 1.0, effective 2026-05-29, status Active. Maps 5S onto the atom corpus. Daily Sort is triggered at 01:00 local cron after Capture's overnight batch. |
| [HERMES.md](horizontal/maintenance/HERMES.md) | Go-live spec for the deployed name of the Maintenance agent. Calls Hermes the Brain Librarian. North-star metric in the file: tokens-to-orient. |
| [FRONT-DESK.md](horizontal/maintenance/FRONT-DESK.md) | Intake, naming, sorting, and move protocol for the app-transition period. Says Maintenance does not hard-delete, and that moves keep provenance. |
| [WORKSPACE-MAP.md](horizontal/maintenance/WORKSPACE-MAP.md) | Short orientation map. Tells agents to read it before a broad search, and points at repo `AGENTS.md`, `CONVENTIONS.md`, and selected docs. |
| [kaizen_observations.md](horizontal/maintenance/kaizen_observations.md) | Append-only log of playbook observations for the monthly A3-lite. Entry format is `OBS-[YYYY-MM]-[NNN]`. |
| [archive/README.md](horizontal/maintenance/archive/README.md) | Says this directory holds prior `PLAYBOOK.md` versions named `PLAYBOOK-v[X.Y].md`, copied here before a new version takes effect. The directory currently contains this README. |

## [profiles/](profiles/)

Deploy profiles and persona files for the named Roofing-Ops agents, plus dev-team profiles and Maya's Fast.io operating notes.

### [_schema.yaml](profiles/_schema.yaml)

Header: Open Brain Agent Profile Schema, version 1.0.0. The comment says every field marked `required: true` must be present before `deploy-agent` will run, and that the agent-profile-builder skill blocks deployment on a missing field. It also says secrets are never stored in profile YAMLs, and that the credentials section stores env key names only. `platform_defaults` holds shared client, host, desktop, model, and Slack routing defaults; those values include addresses and ids and are left in the source. Documented field groups are identity, platform, Google Workspace, Kasm desktop, Slack, Command Center, Hermes, integrations, guardrails, and credentials.

### Named persona YAMLs

One YAML per persona, paired with a `SOUL.md` in a directory of the same name. Identity fields (wording is the file's `persona_description`):

| Profile | `identity.role` | `persona_description` |
| --- | --- | --- |
| [alex-rivers.yaml](profiles/alex-rivers.yaml) | `pricing-catalog` | Pricing detective: invoice lines against agreement terms, branch and region context, UOM conversions, SKU aliases, and historical price observations. |
| [casey-morgan.yaml](profiles/casey-morgan.yaml) | `vendor-draft` | Turns audited discrepancy packets into vendor communication drafts; draft-only pending human send approval. |
| [jordan-price.yaml](profiles/jordan-price.yaml) | `finance-reporting` | Turns invoices, credits, orders, job budgets, and commissions into financial packets; interpreter, and the description says not the approver. |
| [lena-brooks.yaml](profiles/lena-brooks.yaml) | `marketing-proof` | Public-trust builder: reviews, before/after photos, manufacturer badges, location pages, and local project evidence. |
| [maya-chen.yaml](profiles/maya-chen.yaml) | `document-intake` | Accounting Assistant and front door for finance work: triage, CODEX AGENT TEAM source issues, and structured evidence for invoices, credit memos, price lists, WIP/AR questions, and orders. |
| [ops-conductor.yaml](profiles/ops-conductor.yaml) | `ops-team-coordinator` | Single interface between Chris and the seven roofing ops agents: receives outputs, filters errors, rewrites in NEPQ form. |
| [rowan-vale.yaml](profiles/rowan-vale.yaml) | `external-research` | Outside-world scout in public sources. The description says the value is that the role is external-only and never touches the client brain. |
| [sam-torres.yaml](profiles/sam-torres.yaml) | `qa-compliance` | Samples agent outputs, measures variance-detection accuracy, tracks vendor correction behavior, and prepares weekly compliance digests. |

[alex-rivers.yaml](profiles/alex-rivers.yaml) sections, which the sibling persona YAMLs follow, are `identity`, `platform`, `google_workspace`, `kasm`, `slack`, `command_center`, `hermes`, `integrations`, `guardrails`, and `credentials`. Addresses, channel ids, and credential key names stay in those files.

Each persona directory's `SOUL.md` is listed in the [roster](#soulmd-roster). The opening line of each file is the identity sentence used there.

### [dev-team-profiles.yaml](profiles/dev-team-profiles.yaml)

Header: Dev Team Agent Profiles. The title line says "All 12 agents" and says the file follows `_schema.yaml` with dev-specific fields, with Slack and API only and no Google Workspace email. The `dev_team_profiles` map defines these keys: `dev_conductor`, `code_reviewer`, `security_guardian`, `bug_triager`, `sentry_analyst`, `uptime_monitor`, `integration_specialist`, `red_team`, `repo_janitor`, `tool_manager`, `skills_manager`, `memory_clerk`, `feature_planner`, `seo_engineer`, `session_analyst`. `dev_conductor`'s `persona_description` says it is Chris's single point of contact for dev team work: route requests, translate results into plain business language, and own the weekly dev digest.

### [pe-cc-hermes-dev.yaml](profiles/pe-cc-hermes-dev.yaml)

Header: dev Hermes profile, brain-less and Linear-driven, separate from roofing Maintenance Hermes. `identity.id` is `pe-cc-hermes-dev`, display name `Dev Hermes (Open Engine)`, role `dev-linear-cron-runner`. The persona description says it is the brain-less Hermes runtime for DevTeam scheduled crons and Open Engine queue ticks, with no Supabase service token. Guardrails in the file set `no_supabase_service_role`, `no_dashboard_action_log`, and `no_roofing_slack`. `hermes.open_engine_runtime` is `pe-cc-hermes` and `local_context` points at [dev-engine/pe-cc-hermes/SKILL.md](dev-engine/pe-cc-hermes/SKILL.md). `kasm.desktop_enabled` is false.

### [maya-chen/fastio/](profiles/maya-chen/fastio/)

Maya's Fast.io operating notes, beside [maya-chen/SOUL.md](profiles/maya-chen/SOUL.md).

| File | What the file says it is |
| --- | --- |
| [index.md](profiles/maya-chen/fastio/index.md) | Primary sanitized operating memory for Pro Exteriors accounting work. The file says it is not a second system of record. Agent code `maya`, runtime persona `maya-chen`, client `pe-finance`, memory zone `ob1-pe-finance`. Linear source team `CODEX AGENT TEAM`, program root `CAT-20`, downstream team `PE-CC-DevTeam`. Systems of record named in the file: Linear for source and history, Supabase and Command Center for operational accounting state, Fast.io for sanitized working context, Dropbox as a selective additive mirror, QuickBooks production as read-only. |
| [AGENTS.md](profiles/maya-chen/fastio/AGENTS.md) | Twelve accounting operating rules: CAT source issues, `[MAYA]` claim flow, action receipts, pricing-UOM comparisons, versioned price-list proposals, credit-memo drafts that stay internal until human approval, WIP/AR freshness, read-only QuickBooks, Gmail and Slack intake, Signal left disabled, Fast.io as working memory, and a ban on storing secrets or raw customer exports in that workspace. |
| [ops/ONBOARDING-CHECKLIST.md](profiles/maya-chen/fastio/ops/ONBOARDING-CHECKLIST.md) | Maya production checklist: identity and lineage, data controls, runtime health, and storage. |

## [registry/](registry/)

Named-agent principal registry and the checks that read it. Four files. Identifiers, addresses, app ids, token env key names, and desktop ids in the JSON are left in the source.

### [named-agent-principals.json](registry/named-agent-principals.json)

`schema_version` 1, `registry_id` `pe-cc-named-agent-principals`. Top-level policy in the file: `shared_token_fallback_allowed` false, `unknown_principal_policy` `deny`, effect-authorization adapter `pec78-runtime-authorization-v1` with status `not-installed` and `default_policy` `deny`. `authorization_states` are `planned`, `inventory-only`, `verified`, `authorized`, `suspended`, `revoked`.

`activation_order` is `maya-chen`, `alex-rivers`, `casey-morgan`, `jordan-price`, `sam-torres`, `rowan-vale`, `lena-brooks`. Eight `principals` follow. Fields on each principal include `persona_id`, `display_name`, `role`, `activation_scope`, `lifecycle`, `allowed_capabilities`, and `google`, `slack`, `command_center`, `orgo`, and `runtime` binding groups.

| `persona_id` | `role` | `activation_scope` | `lifecycle.state` |
| --- | --- | --- | --- |
| `maya-chen` | `document-intake` | `named-agent` | `inventory-only` |
| `alex-rivers` | `pricing-catalog` | `named-agent` | `planned` |
| `casey-morgan` | `vendor-draft` | `named-agent` | `planned` |
| `jordan-price` | `finance-reporting` | `named-agent` | `planned` |
| `sam-torres` | `qa-compliance` | `named-agent` | `planned` |
| `rowan-vale` | `external-research` | `named-agent` | `planned` |
| `lena-brooks` | `marketing-proof` | `named-agent` | `planned` |
| `ops-conductor` | `ops-team-coordinator` | `control-plane-only` | `revoked` |

The seven named agents list the same base capabilities (`mailbox.read`, `mailbox.classify`, `command_center.record_decision`, `slack.send.christopher`, `email.send.admin`). `rowan-vale` also lists `external.research.propose`. `lena-brooks` also lists `marketing.draft`. `ops-conductor` lists an empty capability array. `command_center.service_role` in the file is `ob-accounting` for Maya, Alex, Casey, and Jordan; `ob-conductor` for Sam and Ops Conductor; `ob-researcher` for Rowan; `ob-marketing` for Lena.

### Validators

| File | What the file does |
| --- | --- |
| [validate-named-agent-principals.mjs](registry/validate-named-agent-principals.mjs) | Exports `validateRegistry`, `resolveIdentity`, `claimForPrincipal`, `authorizeOperation`, and lifecycle helpers. Checks schema version, the deny-by-default principal policy, the frozen authorization-state list, activation order, the eight-principal roster, unique bindings, activation scope, service role, and capability allowlists. Rejects capability prefixes `admin.`, `approval.`, `billing.`, `dns.`, `payment.`, `publish.`, and `external.send.`. `authorizeOperation` denies while the effect-authorization adapter status is `not-installed`. |
| [validate-named-agent-principals.test.mjs](registry/validate-named-agent-principals.test.mjs) | `node:test` suite over that module: canonical registry length 8, frozen resolved identity, unknown-principal denial, claim-schema mismatches, cross-persona binding mismatches, duplicate binding keys, shared-token fallback, and the uninstalled-adapter fence. |
| [validate-profile-registry-drift.mjs](registry/validate-profile-registry-drift.mjs) | Loads the JSON, keeps principals whose `activation_scope` is `named-agent`, and compares each one to `agents/profiles/<persona_id>.yaml` on identity id, display name, and role, plus Google email, Slack app and team ids, Command Center service agent id, and Kasm desktop name. Extra checks: Rowan stays `external-only` with `no_internal_brain_access`, and Sam's profile must not grant `trust_tier` write or `approval_decide`. Prints a one-line valid count. |

## [vertical/](vertical/)

Client-facing workforce. [README.md](vertical/README.md) calls these five agents the human interface to the brain: Slack-mentionable, domain-specific, and roofer-authentic. It says horizontal agents live in [horizontal/](horizontal/) and are not Slack-mentionable by clients.

| Handle | Directory | Mission, from `ROLE.md` |
| --- | --- | --- |
| `@ob-accounting` | [accounting/](vertical/accounting/) | Keep the money side of every job clean, current, and collected, from signed contract to final check, including insurance-job accounting. |
| `@ob-ops` | [ops/](vertical/ops/) | Keep every job moving: crews, materials, sequencing, and paperwork. |
| `@ob-sales` | [sales/](vertical/sales/) | Own the pipeline from first contact through the insurance claim and the final supplement check. |
| `@ob-marketing` | [marketing/](vertical/marketing/) | Turn completed work into search authority and earned trust from consented, audited, schema-marked atoms. The mission says the EEAT flywheel is the core motion. |
| `@ob-exec` | [exec/](vertical/exec/) | Turn accumulated atoms into financial dashboards, KPI trees, capacity decisions, and strategy grounded in this company's jobs. |

The vertical README's modularity rule: the default skill pack is the small set that covers the widest range of roofing clients; other skills ship dormant until an approved A3 with a measured at least 10x ROI. It says skills are toggled in `config/roofer.config.yaml` under `agents.vertical.[role].skills`. The checked-in example beside that path is [config/roofer.config.example.yaml](../config/roofer.config.example.yaml). The README also describes a Slack mention path: Conductor routes, Historian retrieves internal context, Researcher is optional and external, the vertical agent drafts, Auditor gates, delivery writes an atom and updates the PM tool, and Capture atomizes the thread overnight.

Each directory has `ROLE.md` (mission, Slack handle, responsibilities) and `skills.md` (default pack and a dormant table). Default skill ids as listed:

| Pack | Default skill ids |
| --- | --- |
| [accounting/skills.md](vertical/accounting/skills.md) | `invoicing`, `ar-aging`, `job-costing`, `change-orders`, `insurance-supplement-accounting`, `depreciation-recovery-tracking`, `financial-close`, `vendor-invoice-credit-memo-audit` |
| [ops/skills.md](vertical/ops/skills.md) | `scheduling`, `crews-subs`, `daily-logs`, `materials`, `product-catalog-manager`, `tearoff-sequencing`, `safety`, `permits` |
| [sales/skills.md](vertical/sales/skills.md) | `leads`, `storm-canvassing`, `estimating`, `insurance-claims`, `proposals`, `follow-up` |
| [marketing/skills.md](vertical/marketing/skills.md) | `content`, `reviews`, `photo-handling`, `eeat-publishing`, `schema-markup` |
| [exec/skills.md](vertical/exec/skills.md) | `dashboards`, `kpi-trees`, `capacity-planning`, `hiring` |

Each `skills.md` maps those ids to directories under `skills/cleverwork-roofer/`. Dormant rows in the same files are marked "Not yet filed" and carry an activation condition. The accounting skills file says a dormant skill needs an approved A3 with at least 10x ROI before activation.

## SOUL.md roster

Every `SOUL.md` under `agents/`, in path order. Role is the bold role title in the file's opening sentence. The summary is that sentence plus the file's voice line.

| Persona | Role | Summary |
| --- | --- | --- |
| [profiles/alex-rivers/SOUL.md](profiles/alex-rivers/SOUL.md) | Pricing Catalog | Roofing-Ops Pricing Catalog agent for Pro Exteriors Open Brain. Voice: curious pricing detective; calm, forensic, practical, never smug about variance findings. |
| [profiles/casey-morgan/SOUL.md](profiles/casey-morgan/SOUL.md) | Vendor Draft | Roofing-Ops Vendor Draft agent for Pro Exteriors Open Brain. Voice: polished vendor-communications specialist; diplomatic, concise, lightly witty, draft-only until approval. |
| [profiles/jordan-price/SOUL.md](profiles/jordan-price/SOUL.md) | Finance Reporting | Roofing-Ops Finance Reporting agent for Pro Exteriors Open Brain. Voice: steady financial interpreter; plain-English numbers, margin-aware, low-drama and confidence-building. |
| [profiles/lena-brooks/SOUL.md](profiles/lena-brooks/SOUL.md) | Marketing Proof | Roofing-Ops Marketing Proof agent for Pro Exteriors Open Brain. Voice: upbeat reputation/storytelling partner; specific, brand-safe, warm without fluff. |
| [profiles/maya-chen/SOUL.md](profiles/maya-chen/SOUL.md) | Accounting Assistant | Roofing-Ops Accounting Assistant and document-intake front door for Pro Exteriors Open Brain. Voice: warm, quick, organized front-door energy; lightly playful but precise about evidence and human decisions. |
| [profiles/ops-conductor/SOUL.md](profiles/ops-conductor/SOUL.md) | Ops Team Coordinator | Roofing-Ops Ops Team Coordinator agent for Pro Exteriors Open Brain. Voice: friendly air-traffic controller; crisp routing, NEPQ framing, protects Chris from noise while keeping work moving. |
| [profiles/rowan-vale/SOUL.md](profiles/rowan-vale/SOUL.md) | External Research | Roofing-Ops External Research agent for Pro Exteriors Open Brain. Voice: curious external scout; source-first, restrained, asks Chris for approval before research execution. |
| [profiles/sam-torres/SOUL.md](profiles/sam-torres/SOUL.md) | QA Compliance | Roofing-Ops QA Compliance agent for Pro Exteriors Open Brain. Voice: friendly quality coach; direct about standards without blame, uses levity to lower defensiveness. |

Later sections in those files (communication standard, scope boundary, collaboration rules) are shared across the roster. Maya, Ops Conductor, Rowan, and Alex add lane-specific sections after that shared block: Maya's Google Workspace inbox protocol and accounting context, Ops Conductor's DevTeam escalation gate, Rowan's research gate, and Alex's note that open vendor-invoice audit work sits in the Pricing Catalog lane. Those sections name addresses and operator contacts; read the source file for them.
