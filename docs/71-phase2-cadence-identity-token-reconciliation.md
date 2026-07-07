# 71 — Phase 2 Scope: Cadence / Identity / Token Reconciliation

**Status:** Scoping / proposed. Draft 2026-07-07. Owner: Chris (Cleverwork). Follows [`docs/70`](70-agent-coordination-stabilization-and-migration-plan.md) §4; implements decisions 11.2 (config-as-data cadence) and 11.3 (token policy) plus §4.2 (identity map) and §4.4 (docs fix).

> Phase 2 goal: **one source of truth per concern.** No behavior change intended — collapse the duplicates so Phase 3 (close-the-loop) builds on a stable base. This is a scoping doc: it defines the target design, change points, and migration order. It is not itself the implementation.

---

## 1. The three conflicts (evidence)

### 1.1 Cadence — four drifting definitions

| # | Source | Model | Role today | Verdict |
|---|---|---|---|---|
| a | `config/agent-cadence.example.yaml` | `@ob-*` departments → cadences (cron, approval_required, auditor_required) | Explicitly "example… when the cadence engine is implemented" (header lines 1–3) | Retire as spec; harvest governance fields |
| b | `app/command-center/src/lib/cadence.ts` `workDefinitions` + `agentRuntimeStatuses` | `@ob-*` departments; hardcoded `nextRun` ("Tomorrow 6:15 AM") + mock statuses | Dashboard display data (static mock) | Replace with a read of the canonical file |
| c | `scripts/write-cron-jobs.py` `AGENTS` | Named personas (maya/alex/casey/jordan/sam/rowan/lena) → jobs.json | Deployed reality (SSH-push to host) | Merge into one generator |
| d | `scripts/deploy-crons.py` `CRON_JOBS` | Named personas; overlaps (c) with drift on the same Maya/Alex jobs | Deployed reality | Merge into one generator |

The deployed truth is (c)/(d); the dashboard shows (b); the "spec" is (a). None reference each other.

### 1.2 Identity — two systems, one latent bridge

- **Dashboard/cadence model:** 6 departments, each one `@ob-*` handle — `cadence.ts::departments` (`@ob-accounting/@ob-ops/@ob-sales/@ob-marketing/@ob-exec` + `system`/horizontal). Same model in `agent-cadence.example.yaml`.
- **Deployed runtime model:** 8 named personas with token/app identity — `slack-agents.ts::SLACK_AGENTS` (alex, casey, jordan, maya, lena, rowan, sam, conductor; each `tokenEnvKey` + `canonicalAppId`) and `roofing-ops-agent-router.mjs::AGENTS` (same 8 + keyword routing).
- **The bridge already exists but isn't formalized:** each persona's `service_agent_id` collapses personas onto a department inbox —
  - alex, casey, jordan, maya → `ob-accounting`
  - lena → `ob-marketing`; rowan → `ob-researcher`; ops → `ob-conductor`; sam → `ob-conductor` (Phase 1)
- So the two models are reconcilable: **many named personas → one department/inbox.** The dashboard's "agents" just aren't wired to the running bots.

### 1.3 Token policy — two opposite failure behaviors

- **Silent fallback:** `slack.server.ts::postSlackMessage` → `slack-agents.ts::resolveAgentToken` returns the agent's own token if set, else the shared `@openbrain` (`SLACK_BOT_TOKEN`), tagging `postedAs: "agent" | "fallback" | "none"`. A missing bot token silently posts as `@openbrain`.
- **Strict refusal:** `roofing-ops-agent-router.mjs::getAgentToken` (line 79) only uses `SLACK_BOT_TOKEN` when it *is* the runtime's own identity (line 87, not cross-agent), the poster authorizes (`runtime !== 'ops' && runtime !== agent → throw`, line 150), and a missing token throws `"Missing token for ${agent}; refusing fallback identity post"` (line 152).

Same "post as agent" concept, opposite behavior. Silent fallback is what makes messages land under the wrong bot (a root cause of the "incoherent" feel).

---

## 2. Target design

### 2.1 Canonical cadence file (decision 11.2)

**One machine-readable file** — proposed `config/roofing-agent-cadence.yaml` (repo's config-as-data pattern, mirrors `roofer.config.yaml`). Superset schema carrying what BOTH the Python generator and the dashboard need:

```yaml
timezone: "America/Chicago"
jobs:
  - id: "maya-gmail-poll"
    agent: "maya"              # persona slug (see §2.2 identity map)
    department: "accounting"   # for dashboard grouping
    schedule: { kind: "interval", expr: "every 2m" }   # or { kind: "cron", expr: "0 7 * * 1-5" }
    cadence_type: "always_on"  # always_on|daily|weekly|monthly|quarterly
    deliver: "C0BD8U44HL3"     # #ob-agents-internal (Phase 1 §3.2); surfacing map decides human fan-out
    skills: ["google-workspace", "nepq-agent-communication"]
    toolsets: ["web", "file"]
    approval_required: "before_external_action"   # governance field harvested from (a)
    auditor_required: false
    prompt: |
      You are Maya Chen ...
```

Consumers:
- **Generator** — merge `write-cron-jobs.py` + `deploy-crons.py` into ONE script that reads this file and writes each agent's `jobs.json` (keep the SSH/Kasm-path deploy logic from `write-cron-jobs.py`; drop the duplicate job bodies). Single place to edit a job.
- **Dashboard** — `cadence.ts` reads the same file (build-time import or a small loader) to render real `workDefinitions`; `nextRun` becomes a computed value from `schedule`, not a hardcoded string. Retire the mock arrays.
- **Governance** — `approval_required` / `auditor_required` travel with the job (from the retired example.yaml) so the human-gate posture is visible in one place.

Deprecate `agent-cadence.example.yaml` (leave a one-line pointer to the canonical file) and delete `cadence.ts::workDefinitions` mock data.

### 2.2 Identity map (§4.2) — one table, two consumers

Promote `slack-agents.ts::SLACK_AGENTS` to the **single identity registry**, extended with the department/inbox bridge so the dashboard and runtime read the same object:

| persona (slug) | displayName | department | service inbox (`service_agent_id`) | tokenEnvKey | canonicalAppId |
|---|---|---|---|---|---|
| alex | Alex Rivers | accounting | ob-accounting | ALEX_RIVERS_BOT_TOKEN | A0BD4C9SUPP |
| casey | Casey Morgan | accounting | ob-accounting | CASEY_MORGAN_BOT_TOKEN | A0BD85UG23C |
| jordan | Jordan Price | accounting | ob-accounting | JORDAN_PRICE_BOT_TOKEN | A0BE2EMAA8Y |
| maya | Maya Chen | accounting | ob-accounting | MAYA_CHEN_BOT_TOKEN | A0BD0PAEU2E |
| lena | Lena Brooks | marketing | ob-marketing | LENA_BROOKS_BOT_TOKEN | A0BD1RH3FPD |
| rowan | Rowan Vale | research | ob-researcher | ROWAN_VALE_BOT_TOKEN | A0BD1RMHFBM |
| sam | Sam Torres | system/QA | ob-conductor | SAM_TORRES_BOT_TOKEN | A0BD86ATVHQ |
| conductor | Ops Conductor | system | ob-conductor | OPS_CONDUCTOR_BOT_TOKEN | A0BDG2CCCAJ |

- `cadence.ts::departments` becomes a **derived view** of this table (group personas by `department`), not a parallel `@ob-*` list. The `@ob-*` handle stays as the department label; personas are its members.
- `roofing-ops-agent-router.mjs::AGENTS` keeps its `keywords`/`approval` but imports identity (displayName/tokenEnvKey) from the shared registry instead of re-declaring it, so keywords are the only router-specific data.
- Persona YAML `service_agent_id` stays the authoritative persona→inbox link; the registry mirrors it for the app. One reconciliation check (script) asserts YAML and registry agree.

### 2.3 Token policy (decision 11.3) — strict for identity, fallback for system

Introduce an explicit post-kind at the `postSlackMessage` boundary:

- **Identity post** (appears *as* a named agent): if the agent's own `tokenEnvKey` is unset, return `postedAs: "none"` / error — **never** fall back to `@openbrain`. Aligns `slack.server.ts`/`resolveAgentToken` with the router's existing strict stance (`roofing-ops-agent-router.mjs` line 152).
- **System post** (status/deploy/heartbeat, no identity claim): may use the `@openbrain` fallback (`SLACK_BOT_TOKEN`).

Change points: add a `kind?: "identity" | "system"` (default `"identity"`) to `SlackPostInput`; branch in `resolveAgentToken`/`postSlackMessage` so `"identity"` drops the fallback. Audit existing `postSlackMessage` callers and tag the few genuine system posts `"system"`. Keep `postedAs` telemetry.

### 2.4 Docs fix (§4.4) — stop contradicting the running code

`.claude/skills/slack-agents/SKILL.md` (and `docs/12`) still say two-way chat is "not built / gated," but `slack-socket-runtime.mjs` + `roofing-ops-agent-router.mjs` implement it. Update to state two-way chat **is** live, with the real guardrails (team/user allowlist `SLACK_TEAM_ID`/`SLACK_ALLOWED_USER_IDS`; router listens only on the operational channel IDs; strict identity tokens), cross-checked against `docs/60`.

---

## 3. Migration order (additive, no behavior change)

1. **Author the canonical cadence file** from the merged, de-duplicated contents of `write-cron-jobs.py` + `deploy-crons.py` (they now agree on delivery after Phase 1). Diff generated `jobs.json` against what's currently deployed to prove byte-parity → *no behavior change*.
2. **Merge the two generators** into one script that reads the file; keep `write-cron-jobs.py`'s deploy path. Delete `deploy-crons.py` (or make it a thin alias).
3. **Extend the identity registry** (§2.2) + add the YAML↔registry reconciliation check. Point `cadence.ts::departments` and the router at it.
4. **Repoint `cadence.ts` display** to the canonical file; delete the mock `workDefinitions`. (`agentRuntimeStatuses` mock is replaced in Phase 3 by the real heartbeat — leave a TODO, don't fake it further.)
5. **Token policy** change + caller audit; align both modules; add a unit test that an identity post with a missing token does NOT post as `@openbrain`.
6. **Docs fix** (§2.4).
7. **Deprecate** `agent-cadence.example.yaml` to a pointer.

Steps 1–2 and 3 are independent (parallel worktrees per `AGENTS.md`); 4 depends on 1+3; 5 and 6 are independent.

## 4. Exit criteria

- One cadence file; `git grep` finds no live second definition; regenerated `jobs.json` is byte-identical to pre-change (proven no-op).
- `cadence.ts` renders from the canonical file; no hardcoded `nextRun`/mock `workDefinitions`.
- One identity registry; router and dashboard import it; YAML↔registry check passes in CI/local.
- Identity posts refuse the `@openbrain` fallback (unit-tested); system posts still use it.
- `slack-agents` SKILL.md and `docs/12` describe two-way chat as live with real guardrails.

## 5. Risks & guardrails

- **Regression risk is the whole point to avoid:** prove no-op by diffing generated `jobs.json` and by keeping the deploy path unchanged. Do not re-time or re-word jobs in this phase.
- **`agentRuntimeStatuses` is still mock** — do not wire it to anything fake; it's Phase 3's real heartbeat. Explicitly out of scope here.
- **Token-policy caller audit** must be exhaustive — a genuine system post accidentally left `"identity"` with no token will now fail loudly instead of falling back. That's desired, but audit first so nothing surprising goes silent.
- All edits are additive; no schema/migrations in Phase 2. Live⇄Dev: branch from confirmed live branch, converge back, explain-then-ship (`agentmail.ts` was the only app-code Phase 1 change; Phase 2 touches `cadence.ts`, `slack.server.ts`, `slack-agents.ts`, the runtime router, and scripts — all deploy via Coolify/host).

## 6. Effort (rough)

- Cadence file + generator merge: ~0.5–1 day (mechanical + parity diff).
- Identity registry extension + reconciliation check: ~0.5 day.
- `cadence.ts` repoint: ~0.5 day.
- Token policy + caller audit + test: ~0.5 day.
- Docs fix: ~1 hour.

Phase 2 unblocks Phase 3 (close-the-loop), which needs the stable identity map (to attribute queue items) and the real cadence (to drive the heartbeat).
