# Phase 6: AccuLynx Agent + OKF Knowledge Base - Research

**Researched:** 2026-07-01
**Domain:** Internal agent-roster provisioning (OB1 hybrid substrate) + OKF documentation completion, in a Supabase/Astro/Coolify/Slack/WorkOS stack
**Confidence:** HIGH (codebase-grounded — every substrate claim below is a direct read of the live source this session, not training-data recall)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Agent substrate (D-01):** The AccuLynx Agent is a **hybrid**: (a) a new OB **roster identity
`ob-acculynx`** in `SERVICE_AGENT_IDENTITIES` (`app/command-center/src/lib/access-control.ts`) for the
live cc.proexteriorsus.net runtime, AND (b) a **Claude Code subagent** (`.claude/agents/acculynx.md` or
the repo's agent-definition convention) for dev/repo sessions. Both are routed through the
**`acculynx-api` skill** (`skills/cleverwork-roofer/acculynx-api`) and the **OKF bundle** as their
shared knowledge source — one brain, two entry points.

**Roster identity presence (D-02):** `ob-acculynx` gets a **service token** (per workos-agent-auth)
**AND its own Slack bot identity** (per the slack-agents skill), with **`departmentAccess: "all"`** —
AccuLynx spans accounting (payments) and operations (jobs/messages), so it must enqueue writes for any
lane and post to Slack. Follow the existing OB roster + slack-agents provisioning pattern exactly
(per-agent bot token env var, app id, channel).

**Agent authority (D-03):** Broadest authority — **read/answer** across the full AccuLynx data +
capability surface; **enqueue proven-safe writes** through the Phase 5 action layer
(`POST /api/agent/acculynx-write-action/enqueue`) — **never approves** (approval stays human-only,
D-07/D-09 from Phase 5); and **ingestion ownership** = monitor cron health/staleness (Phase 3),
surface/alert on failures, AND trigger a manual backfill/force-sync via existing tooling (the
`accountFilter` force-backfill lever) — it does **not** rewrite the cron itself.

**A3 + OKF + agent sequencing (D-04):** **A3 first (hard gate).** Write the A3 (10x ROI + mission
boundary) in `proposals/` for the user's approval BEFORE building the agent. On approval:
finish/complete the OKF bundle (not rule-9 gated), THEN build the agent (roster identity + subagent +
skill wiring). No agent code ships live before the A3 is approved.

### Claude's Discretion
- The exact A3 ROI numbers/framing (researcher/planner draft it against the `_a3-template.md`
  structure; user approves the final).
- Which OKF sections need net-new authoring vs. index-linking (see code_context — most exist; the
  index under-links them).
- Subagent tool-binding specifics and the precise `ob-acculynx` department/permission wiring, within
  the D-02/D-03 envelope.

### Deferred Ideas (OUT OF SCOPE)
- **First live prod payment** — Phase 5 Task 5, deferred by user until a real payment need; not part
  of Phase 6.
- **Executive Sales Pipeline dashboard** — Phase 7.
- **Slack notify bot channel membership** (Phase 5 finding #4, `not_in_channel`) — a config fix; fold
  into `ob-acculynx` Slack provisioning if the same channel is used, else its own small task.

None of the above expand Phase 6 scope — noted so they aren't lost.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| REQ-01 | Full who/what/how/why/where/when documentation published as an in-repo OKF (Open Knowledge Format) "AccuLynx" knowledge bundle (`docs/knowledge-base/acculynx`) that repo skills, memories, and references point AI agents to. | See "OKF Bundle Completeness" findings throughout (Summary, Recommended Project Structure, Pattern 3, Pitfall 3) — the bundle is ~80% complete; concrete gap list is the root `index.md` PLUS the three stale sub-bundle indexes (`api/`, `ingestion/`, `data/`) PLUS `log.md` PLUS `overview.md`'s "How" section. `acculynx-api/reference/knowledge-folder.md` has the identical link-completeness gap. |
| REQ-09 | A dedicated AccuLynx Agent (preceded by an approved A3 per CLAUDE.md rule 9) responsible for all AccuLynx work. | See "Standard Stack," "Architecture Patterns" (Patterns 1–2), "A3 gate" findings in Summary, and Security Domain's untrusted-content-boundary note (the agent-side enforcement REQ-09 is explicitly named to own, per `security/posture.md` §4). Open Questions 1–2 flag the two genuinely unresolved implementation details (subagent file format; backfill-trigger invocation path). |
</phase_requirements>

## Summary

Phase 6 is not a "build new infrastructure" phase — it is a **provisioning + documentation-completion**
phase that assembles patterns already proven in this repo. Every piece the AccuLynx Agent needs already
exists once for a comparable agent: `SERVICE_AGENT_IDENTITIES` has 15 entries including `ob-conductor`
(`departmentAccess: "all"`, the exact D-02 precedent); the Slack per-agent bot pattern is documented and
has 8 live examples; the WorkOS service-token path is live and working (`agentServiceTokenCount: 13` in
prod healthz); the write-enqueue route (`/api/agent/acculynx-write-action/enqueue`) already accepts any
department-scoped agent actor department-by-department. The OKF bundle is genuinely ~80% complete — but
research surfaced a **broader gap than CONTEXT.md's one-line summary**: it is not just the root
`index.md` that under-links write-sweep/write-action/runbook/security — the **three sub-bundle
`index.md` files** (`api/index.md`, `ingestion/index.md`, `data/index.md`) and **`log.md`** are all
stale from Phase 1 (2026-06-30) and have never been updated by Phases 2–5. `overview.md`'s "How"
section still only describes ingestion, not the write-action layer.

The single biggest structural finding: **there is no `.claude/agents/` directory anywhere in this
repo**, and no repo-local Claude Code subagent-definition convention exists to copy. CONTEXT.md's
suggested path (`.claude/agents/acculynx.md`) is a reasonable **guess at the standard Claude Code
project-subagent convention**, but it is unprecedented in this codebase — the closest analog
(`agents/dev-engine/pe-cc-claude/SKILL.md`) is a different pattern entirely (a Linear-issue-polling
engine profile with `frontmatter` fields for team/project IDs, not a Claude Code `Task`-tool-invokable
subagent). The planner must treat "create `.claude/agents/`" as new-pattern work, not copy-paste, and
should verify Claude Code's actual subagent file format (YAML frontmatter: `name`, `description`,
`tools`, `model`) against current Anthropic documentation before authoring the file, since this repo
has zero working examples to pattern-match against.

The A3 gate is procedurally simple: the template is a fixed 9-section form, and the direct
precedent (`proposals/2026-06-09-acculynx-api.md`, the AccuLynx API skill A3) was **exempted from the
10x ROI math entirely** as "mission-grade integration infrastructure," approved same-day. The AccuLynx
Agent A3 has an even stronger case for exemption (it operationalizes ~$0 marginal-cost read/write
capability that already exists, rather than proposing new capability) — but per D-04, exemption
framing is still Claude's-discretion territory the planner should draft and the user must approve.

**Primary recommendation:** Sequence strictly per D-04 (A3 → OKF completion → agent build). Draft the
A3 using the exemption precedent. While the A3 is pending, do NOT touch `access-control.ts` or create
any live-agent code — but DO complete the OKF bundle in parallel (it is not rule-9-gated, per D-04).
Only after A3 approval: add `ob-acculynx` to `SERVICE_AGENT_IDENTITIES` with `departmentAccess: "all"`,
provision a service token per workos-agent-auth, provision (or explicitly defer) a Slack bot per
slack-agents, and author the `.claude/agents/` subagent file as new-pattern work verified against
current Claude Code docs.

## Project Constraints (from CLAUDE.md)

Directives the planner must verify every plan/task complies with:

- **Hard rule 1 (no destructive SQL):** N/A for most of Phase 6 (no schema changes expected), but if
  any migration is touched (e.g., adding an `ob-acculynx` reference somewhere DB-side), it must be
  additive/idempotent.
- **Hard rule 2 (no secrets in code):** The new service token and Slack bot token must never be
  committed as literals — env var *names* only in docs/config; values only in Coolify env / root
  `.env` (gitignored).
- **Hard rule 5 (security boundary):** The AccuLynx agent is internal-only by nature (it touches the
  client brain's AccuLynx data) — it must never be conflated with the Researcher's external-only role.
  No conflict found; just confirm the subagent's instructions don't grant it external-only Researcher
  behaviors.
- **Hard rule 9 (10x ROI gate):** THE headline constraint for this phase — A3 required and must be
  approved before any agent code ships (D-04). Exemption-from-ROI-math framing is available (precedent:
  `proposals/2026-06-09-acculynx-api.md`) but still requires the user's explicit approval, not an
  agent's self-declaration.
- **Hard rule 12 (third-party agent tool gate):** N/A — `ob-acculynx` and the Claude Code subagent are
  both first-party (built in this repo), not an external skill/plugin/MCP/installer. No third-party
  gate applies.
- **Hard rule 10 (no profanity, clean content):** Applies to all authored OKF/A3/subagent content as
  always.
- **Live ⇄ Dev alignment:** Any `access-control.ts`/`slack-agents.ts` edit is a Command Center code
  change — must follow the branch-from-live-branch, converge-and-push discipline (rule 11), and go
  through the standard Coolify deploy verification (`buildCommit` check) once the A3 unblocks it.
- **Memory/daily-log conventions:** Durable decisions from this phase (A3 outcome, `ob-acculynx`
  provisioning facts) should route through `meta-memory-write` / the daily log per the standard
  convention — not spontaneously.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Live-runtime AccuLynx read/answer + write-enqueue | API/Backend (`ob-acculynx` service_agent actor) | — | `resolveServiceActorFromBearer` resolves service tokens to a `CommandCenterActor` server-side; all data access is server-mediated, never client-side |
| Dev-session AccuLynx work (repo edits, ad hoc queries, docs) | Local dev tooling (Claude Code subagent) | — | Runs in the developer's local Claude Code session, not the deployed app; has filesystem + Bash + MCP access the live roster identity does not |
| Gated write execution | API/Backend (`acculynx-write-action` Edge Function) | — | Sole prod-write path (D-02 from Phase 5); `ob-acculynx` never calls AccuLynx directly, only enqueues |
| Approval decision | API/Backend (Command Center work-queue) + Human (WorkOS session) | — | `approval.decide` / `approval.decide_prod_write` are human-only permissions; `ob-acculynx` (service_agent) never receives them (D-03: "never approves") |
| Slack notification | API/Backend (`postSlackMessage`) | — | Notify-only; no approval authority lives in Slack (D-08 precedent, Phase 5) |
| Ingestion monitoring/backfill trigger | API/Backend (`ob-acculynx` invoking `acculynx-sync` with `accountFilter`) + Database (watermark/cron tables) | — | Monitor reads `v_acculynx_cron_outcomes` / `check_acculynx_alerts()`; backfill trigger POSTs to the existing `acculynx-sync` function — no new cron machinery (D-03: "does not rewrite the cron") |
| Knowledge routing (OKF bundle) | Static/Docs (`docs/knowledge-base/acculynx/`) | Skill layer (`acculynx-api` SKILL.md) | Plain markdown, read directly by both the roster identity's context and the Claude Code subagent's context — no server involved |

## Standard Stack

This phase installs no new runtime dependencies — it is 100% configuration, markdown documentation,
and one new subagent-definition file. No `## Package Legitimacy Audit` section applies (nothing added
to `package.json`, `requirements.txt`, or any manifest).

### Core (existing, reused)
| Component | Location | Purpose | Why Standard (this repo) |
|---|---|---|---|
| `SERVICE_AGENT_IDENTITIES` | `app/command-center/src/lib/access-control.ts` | Roster identity array — the only place a new service agent is registered | 15 existing entries follow one shape; `ob-acculynx` is entry #16 |
| `AGENT_SERVICE_TOKENS` / `AGENT_SERVICE_TOKEN_SHA256_<ID>` | Coolify env (prod), root `.env` (local) | Bearer-token → actor resolution | `resolveServiceActorFromToken` already supports both a CSV form and a per-agent hashed form; prefer the hashed form for a new agent (workos-agent-auth skill's documented "prefer the hashed form" guidance) |
| `slack-agents.ts` registry + `<AGENT>_BOT_TOKEN` env var | `app/command-center/src/lib/slack-agents.ts` | Per-agent Slack bot identity | 8 live agent bot identities already follow this exact shape |
| `/api/agent/acculynx-write-action/enqueue` | `app/command-center/src/pages/api/agent/acculynx-write-action/enqueue.ts` | Gated-write authority entry point | Already accepts any `service_agent`/`named_agent`/`local_operator` actor with `evidence.attach` permission and department-scoped `departmentAccess` — **no code change needed** for `ob-acculynx` to use it once the roster entry exists |
| OKF bundle | `docs/knowledge-base/acculynx/` | Shared knowledge source for both entry points | Conforms to OKF v0.1 (`docs/knowledge-base/OKF/SPEC.md`) — plain markdown + YAML frontmatter |

### Supporting (net-new for this phase)
| Component | Location (to create) | Purpose | When to Use |
|---|---|---|---|
| `.claude/agents/acculynx.md` (or repo-confirmed equivalent path) | New file | Claude Code dev-session subagent definition | See "Open Questions" — verify format against current Claude Code docs before authoring; **this repo has zero precedent files to copy** |
| A3 proposal | `proposals/2026-07-01-acculynx-agent.md` (dated to today per convention) | Rule-9 gate artifact | Required before any agent code/config change (D-04 hard gate) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| A dedicated `.claude/agents/acculynx.md` subagent | Reuse a generic Claude Code session with the `acculynx-api` skill invoked manually | Rejected by CONTEXT.md D-01 — user explicitly wants a named, discoverable subagent, not ad hoc skill invocation |
| `departmentAccess: "all"` for `ob-acculynx` | Scope to `["accounting", "operations"]` only (CONTEXT.md's original D-02 rationale) | **Research finding: this would be wrong.** `LANE_DEPARTMENT` in `acculynx-pending-write.ts` maps write lanes across **three** departments — `sales` (`postContact`, `postJob`, `putJobLeadSource`, `deleteJobSalesOwner`), `accounting` (`postJobPaymentReceived/Expense`, `deleteJobArOwner`, `postWorksheetItem`), and `operations` (the rest). `"all"` is required, not `["accounting","operations"]` — confirms D-02's *outcome* but corrects its *stated rationale* for the planner |
| Hashed service-token env var (`AGENT_SERVICE_TOKEN_SHA256_OB_ACCULYNX`) | Plaintext CSV entry in `AGENT_SERVICE_TOKENS` | workos-agent-auth skill explicitly recommends the hashed form for new agents ("no plaintext sits at rest") — use it for `ob-acculynx` |

**Installation:** N/A — no package manager changes.

## Package Legitimacy Audit

**N/A for this phase.** No external packages are introduced. The only "new dependency" is a markdown
subagent-definition file consumed by the Claude Code runtime itself, not a registry package.

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────────────┐
                         │   docs/knowledge-base/acculynx/      │
                         │   (OKF bundle — the shared brain)    │
                         │   overview / accounts / api/ /       │
                         │   ingestion/ / data/ / security/      │
                         └───────────────┬───────────────────────┘
                                         │  read by both entry points
                    ┌────────────────────┴────────────────────┐
                    │                                          │
        ┌───────────▼────────────┐              ┌──────────────▼─────────────┐
        │  DEV ENTRY POINT        │              │  LIVE ENTRY POINT           │
        │  Claude Code subagent   │              │  ob-acculynx roster identity│
        │  (.claude/agents/*.md)  │              │  (SERVICE_AGENT_IDENTITIES) │
        │  routes through the     │              │  resolved via bearer token  │
        │  acculynx-api SKILL.md  │              │  (resolveServiceActorFromToken)│
        └───────────┬─────────────┘              └──────────────┬───────────────┘
                    │ Bash/Read/MCP                              │ Authorization: Bearer <token>
                    │ (repo, local DB, direct API)                │
                    │                                             ▼
                    │                              ┌──────────────────────────────┐
                    │                              │ cc.proexteriorsus.net /api/*  │
                    │                              │ middleware.ts gate → actor    │
                    │                              └──────────────┬────────────────┘
                    │                                              │
                    │                         ┌────────────────────┼────────────────────┐
                    │                         ▼                    ▼                    ▼
                    │              read/answer routes   POST .../enqueue      trigger backfill
                    │              (existing /api/*)     (write-action)        (acculynx-sync
                    │                                          │                accountFilter)
                    │                                          ▼
                    │                          acculynx_pending_write (status=pending_review)
                    │                                          │
                    │                          Slack notify (D-08, non-authoritative)
                    │                                          │
                    │                          HUMAN approves/rejects in Command Center
                    │                          dashboard (approval.decide[_prod_write])
                    │                                          │
                    │                                 approve only
                    │                                          ▼
                    │                          acculynx-write-action Edge Function
                    │                          (sole AccuLynx write path, D-02 Phase 5)
                    │                                          │
                    │                                          ▼
                    │                              AccuLynx API (prod/sandbox)
                    │                                          │
                    │                                          ▼
                    │                          acculynx_write_action_log (audit row)
                    └──────────────────────────────────────────┘
                       (subagent never has service-role DB access per
                        pe-cc-claude's no_supabase_service_role pattern —
                        precedent for keeping dev/live boundaries clean)
```

### Recommended Project Structure
```
proposals/
└── 2026-07-01-acculynx-agent.md        # A3 — write and get approved FIRST (D-04 gate)

docs/knowledge-base/acculynx/
├── index.md                             # UPDATE: link write-sweep, write-action, runbook, security, log
├── log.md                               # UPDATE: add Phase 2-5 entries (currently frozen at Phase 1)
├── overview.md                          # UPDATE: "How" section — add write-action layer, not just ingestion
├── api/index.md                         # UPDATE: currently only lists 3 files; write-capability.md exists but check completeness
├── ingestion/index.md                   # UPDATE: missing write-sweep.md, write-action.md, runbook.md (all exist, unlinked)
├── data/index.md                        # AUDIT: verify no gaps (appears complete for jobs/tables)
├── security/index.md                    # CREATE: security/ has only posture.md, no index.md — add one for consistency
└── dashboard-spec.md or executive/      # DEFER: SC3 mentions "dashboard spec" — Phase 7 owns the dashboard;
                                          # a Phase-6-scoped pointer stub (not full spec) satisfies "cited source of truth"

app/command-center/src/lib/
└── access-control.ts                    # EDIT (post-A3-approval only): add ob-acculynx to SERVICE_AGENT_IDENTITIES

app/command-center/src/lib/
└── slack-agents.ts                      # EDIT (post-A3-approval only): add ob-acculynx bot identity entry

skills/cleverwork-roofer/acculynx-api/
├── SKILL.md                             # EDIT: bound_agents list should add ob-acculynx / acculynx dev subagent
└── reference/knowledge-folder.md        # EDIT: same gap as OKF index — add write-sweep/write-action/runbook/security links

.claude/agents/
└── acculynx.md                          # CREATE (new pattern — no repo precedent; verify format against current docs)

context/                                  # Optional: a memory pointer per meta-memory-write convention
```

### Pattern 1: OB Roster Identity Registration
**What:** A `ServiceAgentIdentity` object added to `SERVICE_AGENT_IDENTITIES`, immediately usable by
`resolveServiceActorFromToken`/`resolveServiceActorFromBearer` once a matching token env var exists —
zero additional code required beyond the array entry and the token.

**When to use:** Any new live-runtime agent that needs to call `/api/*` with bearer auth.

**Example (the exact shape `ob-acculynx` needs, modeled on `ob-conductor`):**
```typescript
// Source: app/command-center/src/lib/access-control.ts (read live, 2026-07-01)
{
  id: "ob-acculynx",
  displayName: "AccuLynx",
  handle: "@ob-acculynx",
  departmentAccess: "all",   // spans sales, accounting, operations — see Alternatives Considered
  roles: ["vertical", "acculynx"],  // or ["horizontal", "acculynx"] — planner's call; it's cross-department like ob-conductor, so "horizontal" framing may fit better despite AccuLynx being data-domain-specific rather than infra-routing
},
```
No changes are needed to `serviceAgentToActor`, `SERVICE_AGENT_PERMISSIONS`, or the enqueue route —
they are already generic over any `ServiceAgentIdentity`. `[VERIFIED: codebase]`

### Pattern 2: Per-Agent Slack Bot Provisioning
**What:** Each vertical/service agent gets its own Slack app + bot user so messages post under a
distinct identity; `postSlackMessage({ agent, channel, text })` transparently falls back to the shared
`@openbrain` bot if the per-agent token is unset.

**When to use:** `ob-acculynx` posting write-pending notifications (reusing D-08's existing notify
call in `enqueue.ts`) or ingestion-health alerts under its own name rather than `@openbrain`.

**Example:**
```typescript
// Source: .claude/skills/slack-agents/SKILL.md (read live, 2026-07-01) — the registry shape to extend
{ agent: "acculynx", tokenEnvKey: "OB_ACCULYNX_BOT_TOKEN", /* canonicalAppId, botUserId — filled in after human installs the app */ }
```
**Hard landmine:** the human step (api.slack.com → app → *Install to Workspace* → copy Bot User OAuth
Token) is **unavoidable and NOT scriptable** — no config token can mint a `xoxb` bot token. Budget this
as an explicit human checkpoint, not an agent task. `[VERIFIED: codebase — slack-agents SKILL.md]`

### Pattern 3: OKF Bundle Concept Document
**What:** A markdown file with required YAML frontmatter (`type` is the only required field) plus a
free-form body; index files aggregate concepts for progressive disclosure.

**When to use:** Filling OKF gaps (updating `index.md`/`log.md`/sub-indexes) and, if a genuinely new
concept is needed (e.g., a short "AccuLynx Agent" concept describing the agent's own authority), a new
concept file under the bundle.

**Example — index entry pattern to replicate for the missing links:**
```markdown
<!-- Source: docs/knowledge-base/acculynx/index.md pattern, OKF SPEC.md §6 -->
# Write action layer (the HOW, write side)

* [Write-Sweep](ingestion/write-sweep.md) - the sandbox write red-team harness (Phase 4)
* [Write-Action](ingestion/write-action.md) - the human-gated enqueue → approve → execute → audit loop (Phase 5)
* [Runbook](ingestion/runbook.md) - ingestion recovery procedures

# Security

* [Security Posture](security/posture.md) - secrets, RLS, STRIDE attestation (Phase 3)
```
`[VERIFIED: codebase — read docs/knowledge-base/acculynx/index.md and OKF/SPEC.md §6 live]`

### Anti-Patterns to Avoid
- **Building `ob-acculynx` before A3 approval:** D-04 is a hard sequencing gate. Even though the
  code change is trivial (one array entry), CLAUDE.md hard rule 9 requires the A3 first — "no agent
  code ships live before the A3 is approved" (CONTEXT.md, explicit).
- **Scoping `departmentAccess` to `["accounting","operations"]`:** would silently 403 any
  `postContact`/`postJob`/`putJobLeadSource`/`deleteJobSalesOwner` enqueue (all `sales`-department
  lanes) — a correctness bug the planner should explicitly avoid, not just follow CONTEXT.md's
  original two-department framing.
- **Copying `pe-cc-claude`'s SKILL.md as the subagent template:** it is a different animal (a
  Linear-issue polling engine with `no_supabase_service_role: true` and DevTeam-plane boundary rules)
  — useful precedent for the *concept* of a dev-plane/roofing-plane boundary, but not a valid template
  for a Claude Code `Task`-tool subagent's frontmatter shape.
- **Treating the Google-Drive "knowledge-folder.md" pointer as still needing correction:** it was
  already fixed (points to the in-repo OKF bundle, explicitly says "Not a Google Drive folder") — do
  not re-litigate this; only its **link completeness** (same write-sweep/write-action/runbook/security
  gap as the root index) needs work.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Bearer-token → actor resolution | A new auth path for `ob-acculynx` | `resolveServiceActorFromToken` / `resolveServiceActorFromBearer` (already generic) | Zero new code; adding the roster entry + token env var is sufficient |
| Write-enqueue endpoint | A new `/api/agent/acculynx-agent/enqueue` route | The existing `/api/agent/acculynx-write-action/enqueue` | Already department-scoped, already validates the 17 lanes, already posts Slack — reuse as-is |
| Ingestion health check | A new monitoring query | `v_acculynx_cron_outcomes`, `check_acculynx_alerts()`, `scripts/verify-acculynx-cron.sql` (all exist, Phase 3) | `ob-acculynx`'s "monitor/report" authority is read-only against these existing surfaces |
| Manual backfill trigger | New backfill machinery | `acculynx-sync` Edge Function's existing `accountFilter` body parameter | Already tested (`index.test.ts`), already deployed; `ob-acculynx` just needs to know how to invoke it (a documentation/runbook task, not a code task) |
| Slack posting | A raw `fetch()` to Slack API | `postSlackMessage()` in `slack.server.ts` | Handles fallback-to-@openbrain, redaction, and the documented per-agent registry |

**Key insight:** Phase 6 has almost no "don't hand-roll" surface because nearly everything the agent
needs is a documentation/wiring task against code that Phases 1–5 already built and proved live. The
main net-new artifact is the Claude Code subagent file itself, which by definition has no
in-repo library to reuse.

## Common Pitfalls

### Pitfall 1: Treating CONTEXT.md's D-02 rationale as complete
**What goes wrong:** Planning `ob-acculynx` with `departmentAccess: ["accounting", "operations"]`
because that's what CONTEXT.md's prose says ("AccuLynx spans accounting and operations").
**Why it happens:** CONTEXT.md's rationale summarized the two most obvious departments (payments,
jobs) but the actual `LANE_DEPARTMENT` map also includes three `sales`-department lanes.
**How to avoid:** Use `departmentAccess: "all"` (which CONTEXT.md's *decision line* already specifies
correctly) — this research confirms the decision was right even though its stated rationale undercounted.
**Warning signs:** A future `postContact` or `putJobLeadSource` enqueue returning 403 for `ob-acculynx`.

### Pitfall 2: Assuming a `.claude/agents/` convention exists to copy
**What goes wrong:** Writing `.claude/agents/acculynx.md` by pattern-matching against
`agents/dev-engine/pe-cc-claude/SKILL.md` or the vertical/horizontal `ROLE.md` files, producing a file
that is not actually a valid Claude Code subagent (wrong frontmatter keys, wrong tool-binding syntax).
**Why it happens:** The repo has *many* agent-shaped documents (ROLE.md, SKILL.md, SOUL.md) that look
similar but serve entirely different runtimes/purposes; none of them is the Claude Code `Task`-tool
subagent format.
**How to avoid:** Before authoring the file, fetch current Claude Code subagent documentation
(frontmatter: `name`, `description`, `tools`, `model` — verify exact field names/format via
`WebFetch`/`WebSearch` against `docs.claude.com` or the Claude Code changelog, since this repo has zero
working examples). Treat this as greenfield, not "follow the pattern."
**Warning signs:** The subagent doesn't show up when invoked via the `Task` tool, or Claude Code
silently ignores the file.

### Pitfall 3: Missing the sub-bundle index gaps
**What goes wrong:** "Completing the OKF bundle" is read as "update `docs/knowledge-base/acculynx/index.md`"
only, missing that `api/index.md`, `ingestion/index.md`, `data/index.md`, and `log.md` are all also
stale (frozen at Phase 1, 2026-06-30) and don't reflect Phases 2–5's work (write-sweep, write-action,
runbook, security/posture).
**Why it happens:** CONTEXT.md's canonical_refs section only calls out the root `index.md` as "currently
under-links write-sweep/write-action/runbook/security" — true, but incomplete; the same gap exists one
level down.
**How to avoid:** Audit every `index.md` in the bundle tree (root + 3 subdirectories) against the
files that actually exist on disk (`ls docs/knowledge-base/acculynx/**/`), not just the root.
**Warning signs:** SC3 ("bundle is complete... and is the cited source of truth") fails a spot-check
where an agent navigating via `api/index.md` never discovers `write-capability.md`'s sibling doc gaps,
or navigating via `ingestion/index.md` never discovers `runbook.md`/`write-action.md`/`write-sweep.md`.

### Pitfall 4: Building agent code before A3 approval
**What goes wrong:** Starting the `access-control.ts` edit or Slack bot provisioning in the same
session as A3 drafting, "to save time," before the user has actually approved the A3.
**Why it happens:** The A3 template's "Decision" checkbox section (§8) can look like a formality when
the outcome seems obvious (exemption precedent already exists).
**How to avoid:** D-04 is explicit: "No agent code ships live before the A3 is approved." Treat A3
approval as a literal blocking checkpoint (`checkpoint:human-verify` or `checkpoint:human-approve` in
plan terms), not a formality to draft-and-continue past.
**Warning signs:** Any commit touching `access-control.ts`/`slack-agents.ts` timestamped before the A3's
`Status: approved` line is set.

### Pitfall 5: Slack config-token confusion (inherited landmine from slack-agents skill)
**What goes wrong:** Assuming the existing Slack config token can create the `ob-acculynx` bot app and
mint its `xoxb` token programmatically.
**Why it happens:** The config token *can* create/manage apps and read manifests, which looks
sufficient at a glance.
**How to avoid:** Per the slack-agents skill (documented, hard-won): config tokens **cannot** read or
mint bot tokens. "Installing an app to the workspace is the one unavoidable human step." Plan this as
an explicit human checkpoint.
**Warning signs:** Trying `apps.manifest.export` or similar and getting only the manifest back, never a
bot token.

## Code Examples

### Verifying an agent's service token (adapt for ob-acculynx once provisioned)
```bash
# Source: .claude/skills/workos-agent-auth/SKILL.md, cookbook section (read live, 2026-07-01)
CSV="$(grep -E '^AGENT_SERVICE_TOKENS=' .env | sed -E 's/^[^=]+=//' | tr -d '"')"
TOK="$(printf '%s' "$CSV" | tr ',' '\n' | grep '^ob-acculynx:' | head -1 | cut -d: -f2-)"
curl -s -H "Authorization: Bearer $TOK" \
  "https://cc.proexteriorsus.net/api/agent/work-queue" | jq .
```

### Enqueuing a proven-safe AccuLynx write as ob-acculynx (once provisioned + A3-approved)
```bash
# Source: app/command-center/src/pages/api/agent/acculynx-write-action/enqueue.ts (read live, 2026-07-01)
curl -s -X POST -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  -d '{
    "lane": "postJobMessage",
    "accountKey": "kansas_city",
    "targetEnv": "sandbox",
    "payload": { "message": "..." }
  }' \
  "https://cc.proexteriorsus.net/api/agent/acculynx-write-action/enqueue"
# Response: { status: "accepted", pendingWrite: {...}, next: "...human approver must approve..." }
```

### Triggering a scoped backfill (the ingestion "monitor + trigger" authority, D-03)
```bash
# Source: supabase/functions/acculynx-sync/index.test.ts (accountFilter contract, read live, 2026-07-01)
# ob-acculynx does NOT call this directly today (no documented agent-facing wrapper exists yet) —
# it is invoked via the Supabase Edge Function URL with a service-role/anon key + the same
# accountFilter body shape the hourly cron uses. Confirm exact prod invocation path
# (edge fn URL + auth) during planning — this is a genuine open question (see below).
curl -s -X POST "$SUPABASE_URL/functions/v1/acculynx-sync" \
  -H "Authorization: Bearer $SUPABASE_ANON_OR_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"multiAccount": true, "accountFilter": ["kansas_city"]}'
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `acculynx-api` SKILL.md pointed to a Google Drive "AccuLynx" folder | Points to the in-repo OKF bundle (`docs/knowledge-base/acculynx/`) | Phase 1 (2026-06-30) | Already resolved — do not re-litigate; only link *completeness* within the pointer remains a gap |
| Ad hoc AccuLynx endpoint discovery per task | `acculynx-api` skill + generated OpenAPI index/reference | 2026-06-09 (A3-approved) | The skill exists and is the routing layer Phase 6 must point agents THROUGH, not replace |
| No agent-facing write path | Human-gated enqueue → approve → execute → audit loop | Phase 5 (2026-07-01, deployed) | This is the authority `ob-acculynx` plugs into — no new write mechanism needed |

**Deprecated/outdated:** None specific to this phase — all referenced infrastructure (Phases 1–5) is
current and live as of this research date.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `.claude/agents/acculynx.md` is the correct path/frontmatter format for a Claude Code project subagent in the currently-running Claude Code version | Architecture Patterns / Pitfall 2 | If wrong, the authored file is inert — the subagent never becomes invokable via the `Task` tool. Planner should insert a `checkpoint:human-verify` or a doc-fetch task to confirm current format before treating this as done. |
| A2 | The subagent should bind Bash, Read, a Supabase MCP (if configured), and reference the `acculynx-api` skill + `workos-agent-auth` skill as its tool/knowledge set (CONTEXT.md's suggestion) | Architecture Patterns | If the actual project has no Supabase MCP configured, that binding is a no-op; verify `.mcp.json` / Claude Code MCP config before listing it as a bound tool. |
| A3 | `roles: ["vertical", "acculynx"]` vs `["horizontal", "acculynx"]` for the `ob-acculynx` roster entry | Pattern 1 | Low risk — `roles` is descriptive metadata only (used nowhere in code for access decisions, per `serviceAgentToActor`); either choice is functionally safe, purely cosmetic/documentation. |
| A4 | A `security/index.md` should be created for bundle consistency (only `posture.md` exists in that directory today) | Recommended Project Structure | Low risk — OKF spec says index files are optional (§6, "MAY appear"); omitting one is spec-conformant. This is a "nice to have for navigability," not a gap that fails SC3. |

**If this table is empty:** N/A — see entries above. All core substrate claims (roster shape, enqueue
contract, Slack pattern, A3 template/precedent, OKF gaps) are `[VERIFIED: codebase]` — read directly
from live source files this session, not recalled from training data.

## Open Questions

1. **What is the exact, current Claude Code subagent file format?**
   - What we know: Claude Code supports project-scoped subagents; this repo has zero examples to
     copy; CONTEXT.md guesses `.claude/agents/acculynx.md` with "frontmatter: name, description,
     tools, model."
   - What's unclear: Exact required/optional frontmatter fields, whether subagents are auto-discovered
     from `.claude/agents/*.md` or need registration elsewhere, and whether `tools:` accepts skill names
     (e.g., `acculynx-api`) or only built-in tool names (Bash, Read, etc.).
   - Recommendation: The planner should insert an early task to fetch current Claude Code
     documentation (WebFetch against `docs.claude.com` or equivalent) and confirm the format BEFORE
     authoring the file, rather than guessing from CONTEXT.md's description alone.

2. **How does `ob-acculynx` actually invoke a manual backfill in the live runtime?**
   - What we know: The `acculynx-sync` Edge Function accepts `{"multiAccount":true,"accountFilter":[...]}`
     and this is unit-tested; the runbook's Scenario F shows a SQL-level trigger
     (`select public.trigger_acculynx_sync(...)`), not an HTTP-level one accessible to an agent without
     DB access.
   - What's unclear: Whether `ob-acculynx` (a service_agent actor with NO documented Supabase
     service-role access, per the `pe-cc-claude` no-service-role precedent) is expected to invoke the
     Edge Function directly via HTTP with a service/anon key, or whether a new thin `/api/agent/...`
     wrapper route is needed so the agent never needs a raw Supabase key.
   - Recommendation: Given D-03 says "trigger a manual backfill/force-sync via existing tooling" and
     the existing tooling is DB-adjacent (SQL functions, direct Edge Function HTTP calls with a
     Supabase key), the planner should decide: (a) grant `ob-acculynx` a scoped way to call the
     `acculynx-sync` Edge Function's HTTP endpoint directly (needs a Supabase anon/service key — a new
     secret-handling surface), or (b) add a lightweight `/api/agent/acculynx-ingestion/trigger-backfill`
     Command-Center route that internally proxies to the Edge Function (keeps the Supabase key
     server-side, consistent with the "agent never holds a raw Supabase key" pattern seen elsewhere).
     Option (b) is more consistent with this repo's existing security posture (no service_agent
     identity is documented as holding a Supabase key directly) — flag this as a planning decision, not
     a research-resolved fact.

3. **Does the "dashboard spec" in SC3 require Phase-6-authored content, or is a pointer to Phase 7 sufficient?**
   - What we know: ROADMAP.md's Phase 6 SC3 explicitly lists "dashboard spec" as part of bundle
     completeness; Phase 7 (Executive Sales Pipeline Dashboard) is the phase that actually researches
     and builds the dashboard.
   - What's unclear: Whether SC3 wants a stub/pointer doc in the OKF bundle now (satisfying "cited
     source of truth" without pre-empting Phase 7's research) or whether it's asking Phase 6 to write
     real dashboard requirements.
   - Recommendation: CONTEXT.md's Claude's Discretion section implies index-linking over net-new
     authoring is the default posture. A one-paragraph `docs/knowledge-base/acculynx/dashboard.md` stub
     ("Executive dashboard requirements are researched and built in Phase 7 — see ROADMAP.md Phase 7")
     satisfies "cited source of truth" for SC3 without duplicating Phase 7's work. Confirm with the
     user during plan-phase discussion if ambiguity remains.

4. **Should `ob-acculynx`'s Slack bot reuse an existing channel or need a new one?**
   - What we know: `enqueue.ts` already posts to `SLACK_OB_AGENT_AUDIT_LOG_CHANNEL_ID` (fallback
     `SLACK_OB_CONDUCTOR_DIGEST_CHANNEL_ID`) for write-pending notifications — this works today with
     the `@openbrain` fallback bot even without `ob-acculynx` having its own token. Ingestion alerts
     post to `#ob-ops-conductor` via `check_acculynx_alerts()`'s Vault-stored token (separate from the
     per-agent bot registry entirely).
   - What's unclear: Whether "its own Slack bot identity" (D-02) is meant to change the *posted-as*
     identity on these existing notifications (cosmetic — `postedAs: agent` vs `fallback`) or whether a
     new dedicated channel is also wanted.
   - Recommendation: Per CONTEXT.md's Deferred section, "fold into `ob-acculynx` Slack provisioning if
     the same channel is used, else its own small task" — treat channel reuse as the default; only
     create a new channel if the user asks for one during plan-phase discussion.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI (`supabase`) | Any edge-function-adjacent verification (not expected to be needed — Phase 6 doesn't touch edge functions) | Assumed present per prior phases' documented use | — | N/A — Phase 6 has no edge-function deploy step |
| Coolify API access | Setting `AGENT_SERVICE_TOKEN_SHA256_OB_ACCULYNX` / bot token env vars in prod | Documented + working per `.claude/skills/coolify/SKILL.md` (used successfully in Phases 3–5) | — | None needed — this is the established path |
| Slack API access (config token) | Reading/verifying app manifests during bot provisioning | Documented + working; **cannot mint bot tokens** (hard boundary) | — | Human must perform "Install to Workspace" manually — no fallback, this is an accepted human step |
| Claude Code current documentation (for subagent format) | Authoring `.claude/agents/acculynx.md` correctly | Not verified this session — recommend fetching before authoring | — | If unavailable, fall back to the documented frontmatter shape from CONTEXT.md's description (`name`, `description`, `tools`, `model`) as best-effort, flagged `[ASSUMED]` |

**Missing dependencies with no fallback:**
- None that block planning. The Slack "Install to Workspace" step has no fallback but is a known,
  accepted human checkpoint (not a blocker to plan around, just to sequence around).

**Missing dependencies with fallback:**
- Current Claude Code subagent-format documentation — fallback is CONTEXT.md's best-guess shape,
  flagged as Assumption A1.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Deno test (edge functions), no framework detected for Astro/Command Center TS beyond ad hoc `.test.ts` files (e.g., `enqueue` has no dedicated test file found; `acculynx-pending-write.ts` logic is exercised indirectly via `decision.test.ts` per the Phase 5 daily log) |
| Config file | `supabase/functions/*/deno.json` (per-function, established in Phases 1–5) |
| Quick run command | `deno test supabase/functions/<fn>/` (for any edge-function-adjacent change — unlikely in Phase 6) |
| Full suite command | No repo-wide single command found; tests run per-function/per-module |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-01 | OKF bundle is complete and internally link-consistent | manual-only (doc review) — no automated link-checker found in repo | N/A — visual/manual audit of each `index.md` against `ls` of its directory | N/A |
| REQ-09 | `ob-acculynx` roster entry resolves correctly (bearer token → actor with `departmentAccess: "all"`) | unit (if a test is added) or manual `curl` smoke test | `curl -H "Authorization: Bearer $TOK" https://cc.proexteriorsus.net/healthz` then a real `/api/agent/work-queue` call | ❌ — no existing test for a specific roster entry; smoke-test via curl is the established pattern in this repo (see workos-agent-auth skill cookbook) rather than a unit test |
| REQ-09 | `ob-acculynx` can enqueue a write across all three departments (sales/accounting/operations) | manual/smoke (sandbox) | Adapt the "Enqueuing a proven-safe write" curl example above for one lane per department | ❌ — no automated test; this repo's established verification pattern for this exact route is a **live sandbox smoke test** (see Phase 5's `write-action.md` "Sandbox proof" section), not a unit test suite |
| REQ-09 | A3 exists and is approved before any agent code ships | manual (human review gate) | N/A — checklist item, not code | N/A |

### Sampling Rate
- **Per task commit:** No automated test suite exists for this surface area; verify via direct `curl`
  smoke tests against the live/sandbox API per the established workos-agent-auth and write-action.md
  patterns (this repo's precedent leans on live-verified evidence over unit tests for Command Center
  integration surfaces — see `security/posture.md`'s explicit note: "documentation/intent was NOT
  accepted as evidence").
- **Per wave merge:** Full manual OKF link audit (walk every `index.md`, confirm every file in the
  directory tree is reachable) + a live `curl` round-trip proving `ob-acculynx` resolves and can enqueue.
- **Phase gate:** A3 approved (human) + OKF completeness confirmed (manual review) + live smoke test of
  `ob-acculynx` resolving + subagent invokable via the `Task` tool, before `/gsd-verify-work`.

### Wave 0 Gaps
- No automated link-checker for the OKF bundle exists — if the planner wants one, it would be a small
  net-new script (e.g., a Node/Python script that walks `.md` files, extracts links, checks target
  existence). This is optional scope, not a blocker — this repo's established pattern (per Phase 1/OKF
  SPEC.md §5: "Consumers MUST tolerate broken links") treats link-checking as a manual quality step, not
  an automated gate.
- No existing test file for the `ob-acculynx` roster entry specifically (expected — it doesn't exist
  yet). If the planner wants unit coverage, `access-control.test.ts` (if one exists — not confirmed
  found this session) would be the place; otherwise follow the repo's live-smoke-test precedent.

*Gaps are non-blocking: this repo's established pattern for Command-Center-integration correctness is
live-verified evidence (curl smoke tests against sandbox/prod), consistent with the security posture
doc's explicit stance that "documentation/intent was NOT accepted as evidence" — apply the same bar to
Phase 6's roster-identity and OKF-completeness verification.*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | Yes | Bearer service-token auth via `resolveServiceActorFromBearer` (existing, reused — no new auth code) |
| V3 Session Management | No | Service agents are stateless bearer-token calls, not sessions |
| V4 Access Control | Yes | `departmentAccess` scoping in `access-control.ts` (existing pattern); `ob-acculynx`'s `"all"` grant must be deliberate (see Alternatives Considered) — this IS a broad grant and should be named as such in the A3's risk section |
| V5 Input Validation | Yes (indirect) | Already enforced by `enqueue.ts` (lane allowlist, targetEnv allowlist, JSON-object payload check) — Phase 6 adds no new input surface |
| V6 Cryptography | Yes | `createHash("sha256")` + `timingSafeEqual` for token comparison — existing, reused, never hand-roll a new comparison |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Overly broad `departmentAccess: "all"` grant becomes a privilege-escalation surface if the token leaks | Elevation of Privilege | Prefer the hashed token env var form (`AGENT_SERVICE_TOKEN_SHA256_OB_ACCULYNX`) over plaintext CSV, per workos-agent-auth's explicit recommendation; rotate on suspected leak (documented rotation procedure exists) |
| A subagent instruction file with overly permissive tool bindings (e.g., unscoped Bash) could let a compromised/confused subagent perform destructive repo actions | Elevation of Privilege / Tampering | Scope the `.claude/agents/acculynx.md` `tools:` list to only what's needed (Bash, Read, the acculynx-api skill reference, workos-agent-auth) — do not grant Write/Edit broadly without justification, consistent with hard rule 1 (no destructive SQL) and the repo's general "explain-then-ship" discipline |
| AccuLynx API responses (external, untrusted input) reaching the agent's context and being misinterpreted as instructions | Tampering (prompt injection via ingested data) | Already labeled at the data layer (`trust_tier` default `evidence`, "data never instructions" boundary per `security/posture.md` §4) — REQ-09 is explicitly named there as the phase that must add **agent-side enforcement** of this boundary; the planner should treat this as a real Phase-6 task (documenting/reinforcing in the OKF and/or the subagent's own instructions that ingested AccuLynx free-text is data, not instructions), not just inherited for free |
| Slack bot token leak via chat transcript | Info Disclosure | Never echo token values (established pattern across coolify/slack-agents/workos-agent-auth skills) — apply identically to `ob-acculynx`'s new token |

**Note on the untrusted-content boundary (important for planning):** `security/posture.md` §4
explicitly states: *"agent-side enforcement of the boundary is REQ-09 (its own phase, preceded by an
A3). This phase guarantees the label and boundary exists now so REQ-09 can consume them; it does not
build the read-time agent defense."* This means Phase 6 has an implicit, easy-to-miss deliverable: the
`ob-acculynx` agent (both entry points) should have explicit instructions/documentation treating
AccuLynx-sourced free text (job notes, contact names, messages) as data, never as instructions to
follow. This should be reflected in the subagent's own instruction file and/or a short OKF concept
note, not left purely implicit.

## Sources

### Primary (HIGH confidence — direct codebase reads this session)
- `app/command-center/src/lib/access-control.ts` — full file read; `SERVICE_AGENT_IDENTITIES`, `ServiceAgentIdentity` shape, permission model, token resolution
- `app/command-center/src/lib/acculynx-pending-write.ts` — `LANE_DEPARTMENT` map, `departmentForLane`, pending-write row shape
- `app/command-center/src/pages/api/agent/acculynx-write-action/enqueue.ts` — full enqueue contract
- `docs/knowledge-base/OKF/SPEC.md` — full OKF v0.1 spec
- `docs/knowledge-base/acculynx/{index,log,overview}.md`, `api/index.md`, `ingestion/index.md`, `data/index.md`, `ingestion/{write-action,runbook}.md`, `security/posture.md` — bundle completeness audit
- `.claude/skills/{slack-agents,workos-agent-auth,coolify,meta-memory-write}/SKILL.md` — full reads
- `skills/cleverwork-roofer/acculynx-api/SKILL.md` and `reference/knowledge-folder.md` — full reads
- `proposals/_a3-template.md` and `proposals/2026-06-09-acculynx-api.md` — full reads (A3 structure + precedent)
- `AGENTS.md`, `agents/dev-engine/pe-cc-claude/SKILL.md` — full reads (agent-definition landscape audit)
- `.planning/phases/05-read-write-action-layer/05-CONTEXT.md` — full read (Phase 5 authority envelope)
- `.planning/phases/06-acculynx-agent-okf-knowledge-base/06-CONTEXT.md` — full read (locked decisions)
- Filesystem search confirming **no** `.claude/agents/*.md` exists in-repo (only `~/.claude/agents/gsd-*` globally, unrelated GSD tooling agents)

### Secondary (MEDIUM confidence)
- None used — all findings this session were confirmed via direct primary-source reads, not web search or secondary citation. Web search / Context7 lookup was not required because the entire research surface is this repo's own code and docs, not a third-party library.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack (existing substrate): HIGH — every claim verified by direct file read this session
- Architecture: HIGH — the enqueue contract, roster pattern, and OKF gaps are all directly observed, not inferred
- Pitfalls: HIGH for repo-specific pitfalls (roster/department, A3 sequencing, Slack boundary); MEDIUM for the Claude Code subagent format pitfall specifically, since that claim rests on the *absence* of a repo precedent rather than positive verification of the correct format (flagged as Open Question 1 / Assumption A1)

**Research date:** 2026-07-01
**Valid until:** 30 days (2026-07-31) for the repo-internal substrate (stable, slow-moving); recommend
re-verifying the Claude Code subagent format claim (Open Question 1) at plan time regardless of date,
since that is genuinely unresolved rather than time-decayed.
