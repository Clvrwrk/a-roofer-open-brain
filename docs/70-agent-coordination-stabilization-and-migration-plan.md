# 70 — Agent Coordination Stabilization & Migration Plan

**Status:** Plan / proposed. Draft 2026-07-07. Owner: Chris (Cleverwork). Awaiting approval before execution.
**Scope:** Pro Exteriors "Open Brain" (PE-CC). Stabilize the current agent product and daily workflows first; stage the Open Engine / OKF / DevTeam CI-CD migration only after stabilization gates pass.

> Governing principle: **stabilize, then migrate.** Every migration item in Phase 5 is blocked until Phases 1–4 exit criteria are green. Nothing in this plan authorizes an external agent send, a destructive migration, or a global third-party hook — those stay behind CLAUDE.md hard rules 1, 6, 9, and 12.

---

## 0. Why this plan exists

The pieces of a coordinated agent operation exist but are wired as separate islands, so the system *feels* disjointed across the six stages you named: daily data intake → data processing → work task assignment → work processing → reporting on completed work → agent↔human communication. Concretely, the reconnaissance found:

- **A single shared queue exists** (`dashboard_work_items`) but only Gmail intake writes to it. The Slack file/DM path writes to Supabase Storage instead and never creates a work item.
- **Agents never close their own work.** Status changes on `dashboard_work_items` happen only when a human clicks a decision in the Command Center. Completed work is invisible to the queue.
- **Four competing definitions of "what agents do"** drift against each other (`config/agent-cadence.example.yaml`, `app/command-center/src/lib/cadence.ts`, `scripts/write-cron-jobs.py`, `scripts/deploy-crons.py`), and **two agent-identity systems** (anonymous `@ob-*` departments in the dashboard vs. named personas Maya/Alex/Casey… actually deployed).
- **Docs contradict running code** on the biggest capability: the Slack skill says two-way chat is "not built / gated," but the socket runtime + ops router fully implement inbound routing and Hermes-generated replies.
- **The autonomous layer is specced but not live:** Alex's scheduler, Casey's credit-memo drafting, and Jordan's coverage-gap cadence are designed in `docs/57` but not deployed.
- **Agent-email gaps:** persona Sam Torres maps to `ob-auditor`, which has no AgentMail inbox; AgentMail is capped at 10 inboxes (all consumed).

The workflows themselves (credit memo, price agreement) are **built end-to-end for the human-in-the-loop path** — the missing part is the autonomous agent layer and the coordination glue, not the domain logic.

Priorities confirmed for this plan (all four, in execution order): finish the autonomous layer, agent-email + Slack correctness, reconcile the conflicts, close the coordination loop.

---

## 1. Current-state map (verified references)

### 1.1 Named agents & AgentMail

Provider AgentMail on domain `agentmail.proexteriorsus.net`. Roster of record: `app/command-center/src/lib/agentmail.ts` (`AGENTMAIL_AGENT_ROSTER` = 10 live inboxes; `AGENTMAIL_OMITTED_AGENT_ROSTER` = 3 deliberate no-inbox). Provisioned artifact: `deployment/remote/agentmail/pro-exteriors-agentmail-roster.json`. Inbound webhook: `POST /api/agentmail/webhook` → `app/command-center/src/pages/api/agentmail/webhook.ts` (Svix-verified). Cap = 10 inboxes (`deployment/remote/agentmail/README.md`).

| Agent | Inbox | Notes |
|---|---|---|
| Accounting | `ob-accounting@…` | Maya/Alex/Casey/Jordan personas share it |
| Operations | `ob-ops@…` | |
| Sales | `ob-sales@…` | |
| Marketing | `ob-marketing@…` | Lena persona shares it |
| Executive | `ob-exec@…` | |
| Capture | `ob-capture@…` | |
| Researcher | `ob-researcher@…` | Rowan persona shares it |
| Conductor | `ob-conductor@…` | Ops Conductor persona shares it |
| Innovator | `ob-innovator@…` | |
| Hermes / Maintenance | `hermes@…` | |
| **Historian** | *(none, intentional)* | internal-only retrieval boundary (rule 5) |
| **Auditor** | *(none, intentional)* | routes via dashboard/Slack |
| **Quality Control** | *(none, intentional)* | routes through Conductor |

**Gap:** persona `agents/profiles/sam-torres.yaml` sets `service_agent_id: ob-auditor` → references a non-existent mailbox.

### 1.2 Credit-memo & price-agreement workflows

Both sit on the UOM normalization contract (`docs/46`, migrations 119–122): compare only in ABC's pricing UOM; canonical effective price = `abc_invoice_lines.price_per_uom` (`extendedPriceAmount ÷ priceQty.value`); align orders via `v_item_uom_map`; emit `uom_mismatch` and leave variance NULL when units don't align. **Never** compare on `quantity`/`uom`/`unit_price`/`effective_unit_price`/`raw.pricePerUnitAmount`.

Credit memo — two flows on `credit_memo_requests.request_kind` (schema 116): `received` (vendor-issued, audited vs. original invoice via `v_credit_memo_audit`, schema 115) and `requested` (we request a credit after an overcharge). Detection is **built**: `lib/invoice-audit-disposition.ts` + `api/invoice-audit/run-disposition.ts` create `requested` rows (`status='draft'`, `assigned_to='Alex'`) on non-negotiated overcharges ≥6% / ≥$25 gross; negotiated-agreement variances are human-gated (`gate-negotiated`). Disposition UI + API built (`api/credit-memos/disposition.ts`, `accounting/audit/credit-memos.astro`). Draft **email** is specified (`skills/cleverwork-roofer/vendor-invoice-credit-memo-audit/SKILL.md`, comms plumbing `lib/invoice-audit-communications.ts`) but Casey's drafting agent is not live. A3 `proposals/2026-05-30-vendor-invoice-credit-memo-audit.md` still **pending**.

Price agreement — renewal request **built** (`api/price-agreement/request-renewal.ts`, schema 105); new-agreement package builder + handoff **built, internal-draft-only** (`lib/agreement-package.ts`, `api/price-agreement/package/*`, schemas 109/110/111/136); coverage-gap → auto-request cadence (Jordan, `docs/57` §3a/§3b, 7-day SLA) **designed, not built**. External recipient is ABC's Justin Garza; **all external sends are a human action** from Hermes/Google Workspace (`agents.proexteriorsus.net`), enforced by `lib/outbound-guard.ts` (internal-domain allowlist → external → draft).

### 1.3 Slack portal & coordination

Workspace `pe-command-center` (`T0B8QEGPVQW`). Per-agent bot registry: `app/command-center/src/lib/slack-agents.ts` (Alex/Casey/Jordan/Maya/Lena/Rowan/Sam/Ops-Conductor each with app ID + `*_BOT_TOKEN`; shared `@openbrain` fallback). Outbound poster `lib/slack.server.ts::postSlackMessage`. Live services: `runtime/slack-socket-runtime.mjs` (slash commands, DM poller every 10s, `slack_mirror_events` drain every 15s), `runtime/roofing-ops-agent-router.mjs` (inbound classify → Hermes reply → post-as-agent; Linear escalation), `runtime/slack-attachment-processor.mjs` (file → OCR/vision → Storage). Config-token vs bot-token boundary and channel IDs documented in `.claude/skills/slack-agents/SKILL.md`.

Coordination today = four independent mechanisms with no orchestrator: Maya Gmail cron → `/api/agent/intake` → `dashboard_work_items`; per-agent Hermes crons (`write-cron-jobs.py`/`deploy-crons.py` → `~/.hermes/cron/jobs.json`, delivered to Slack); the socket runtime two-way path; and human decisions via `api/agent/work-queue/[workId]/decision.ts` → `dashboard_action_log` + `slack_mirror_events`.

### 1.4 Migration stack — already-present vs. net-new

Already in the tree (finish/stabilize, do **not** re-adopt): **OKF** (vendored spec `docs/knowledge-base/OKF/`, validator `scripts/validate-okf.mjs`, Phase 06 bundle shipped), **Open Engine** (`docs/knowledge-base/open-engine/`, `scripts/open-engine-queue-runner.mjs`; automation status **Red** — no durable runner), **Sentry**, **Linear**, **CodeRabbit** (`.coderabbit.yaml`), **Coolify/Hetzner/Supabase**. "llm-wiki" is a cited *pattern* (Karpathy), not a target.

Net-new (each needs its own A3 + doc-54 gate): **Greptile** (zero references), **Convex** (would compete with Supabase), **GitHub Actions CI** (no `.github/workflows/`). Special case: **Vercel** is an *explicit standing rejection* in three files (`docs/08`, `config/roofer.config.yaml`) — adopting it reverses an architecture decision and must be justified as such or dropped.

---

## 2. Objectives & exit criteria

The system is "stabilized" (and migration may begin) when all of these hold:

1. **One queue, closed loop.** Every intake path (Gmail, Slack DM/mention, Slack file) creates a `dashboard_work_items` row; agents transition their own items to a terminal status; the dashboard shows real agent status, not mock data.
2. **One source of truth per concern.** A single canonical agent roster/identity, a single cadence definition that drives the deployed crons, and a single documented token-resolution policy. Docs match running code.
3. **Autonomous layer live and safe.** Alex's scheduler, Casey's credit-memo drafting, and Jordan's coverage-gap cadence run headless — still draft-only, zero external sends, human release gate intact.
4. **Email + Slack correctness proven.** Every named agent's inbox and bot is verified by the checklists in §7; Sam Torres inbox gap resolved; reporting traffic separated from human-request traffic.
5. **Migration gated, not started.** A migration A3 exists but no net-new tool is enabled globally until §2.1–2.4 are green.

---

## 3. Phase 1 — Agent-email + Slack correctness (lowest-risk, do first)

Config/verification only; no schema or app-logic risk.

3.1 **Resolve the Sam Torres inbox gap — route Sam/QA through Conductor.** Point `agents/profiles/sam-torres.yaml` `service_agent_id` at `ob-conductor` (already provisioned) and note it in the `agentmail.ts` omitted-roster comment. This keeps AgentMail at 10/10 and preserves the internal-only Auditor boundary (rule 5). Do **not** raise the cap now; give Auditor/QA a dedicated inbox only when recurring QA email traffic appears that Conductor routing can't cleanly absorb — a data-driven trigger. (Decision 11.1.)

3.2 **Separate reporting from requests in Slack.** Cron report output currently lands in the same human channels the two-way router listens on (`C0BCUF29G1H`, `C0BCYNW98RL`). Route raw cron/agent reports to `#ob-agents-internal` (`C0BD8U44HL3`) per `docs/roofing-ops-slack-agent-routing.md`; keep human-operational channels for human↔agent exchange only. Change is in `write-cron-jobs.py`/`deploy-crons.py` `deliver:` targets.

3.3 **Run the verification checklists** in §7.1 (AgentMail roster ↔ live inboxes) and §7.3 (every bot installed, joined to its channels, routing correct). Record results in the daily log.

**Exit:** every named agent maps to a real inbox (or an intentional none with a documented route); every bot posts under its own identity to the right channel; reports and requests no longer share a channel.

---

## 4. Phase 2 — Reconcile the conflicts (single source of truth)

No behavior change intended — collapse duplicates so the rest of the work has a stable base.

4.1 **One cadence definition — config-as-data.** Make a single machine-readable cadence file under `config/` the source of truth (evolve `agent-cadence.example.yaml` into the real one), consistent with the repo's `roofer.config.yaml` pattern. Merge `write-cron-jobs.py` + `deploy-crons.py` into one generator that builds `jobs.json` *from* that file, and replace `cadence.ts::workDefinitions` mock data with a read of the same file so the dashboard reflects deployed reality. This ends the four-way drift permanently. (Decision 11.2.)

4.2 **One agent-identity model.** Map the dashboard's `@ob-*` department model to the deployed named personas (Maya→ob-accounting, etc.) in one table consumed by both the UI and the runtime, so "agents" in the dashboard are the running bots.

4.3 **One token policy — strict for identity posts, fallback for system posts.** Identity-bearing posts (a message that appears *as* Alex/Casey/etc.) refuse the `@openbrain` fallback and fail loudly on a missing bot token; the fallback is reserved strictly for non-identity system/status/deploy notifications. Align `slack.server.ts::resolveAgentToken` to the router's existing strict stance (`roofing-ops-agent-router.mjs::getAgentToken`). Silent fallback is a primary cause of the "incoherent" feel — messages land under the wrong bot; loud failure surfaces the missing-token config instead. (Decision 11.3.)

4.4 **Fix the stale docs.** Update `.claude/skills/slack-agents/SKILL.md` (and `docs/12`) to state that two-way chat **is** implemented via the socket runtime + ops router, with the actual guardrails (team/user allowlist, operational-channel-only listening), superseding the "not built / gated" language. Cross-check against `docs/60` defenses.

**Exit:** one cadence, one identity map, one token policy, docs match code. `git grep` for the retired duplicates returns nothing live.

---

## 5. Phase 3 — Close the coordination loop

The core "disjointed" fix: make the shared queue the spine that every stage reads and writes.

5.1 **All intake writes the queue.** Extend the Slack inbound paths to create `dashboard_work_items` rows: `roofing-ops-agent-router.mjs` (DM/mention) and `slack-attachment-processor.mjs` (files) call the same intake path as Gmail (`/api/agent/intake` / `lib/agent-intake.ts`) in addition to their current Storage write. One work item per inbound unit of work, tagged with source and assigned agent.

5.2 **Agents close their own work.** Add an agent-callable transition on `dashboard_work_items` (draft-complete / needs-human / blocked) so a completed agent action moves its item to a terminal or human-gated status instead of waiting for a human click. Keep human decisions authoritative for anything that releases externally. Surface the transition through the existing work-queue API rather than a new side channel.

5.3 **Real agent status.** Replace `cadence.ts::agentRuntimeStatuses` mock data with a live heartbeat: each cron tick and socket handler writes `last_run`/`health`/`queue_depth` to a small status table; the dashboard reads it. This is the readout that tells you at a glance whether the system is actually coordinated.

5.4 **Reporting loop.** Define "completed work" reporting off the queue: a daily/weekly digest (Conductor) summarizing items opened, closed, and pending-human, posted to a reporting channel and optionally emailed via internal AgentMail. Ties the sixth stage (reporting) back to the queue rather than to free-text Slack chatter.

**Exit:** an item entering by any channel is visible in one queue, an agent can move it to done, and the dashboard shows real per-agent status and a completed-work digest.

*Schema note:* any new tables/columns (status table, work-item transitions) are **additive/idempotent** (`ADD COLUMN IF NOT EXISTS`, `CREATE … IF NOT EXISTS`) per hard rule 1, applied to the shared prod Supabase.

---

## 6. Phase 4 — Finish the autonomous layer (workflows go headless)

Deploy the designed-but-not-live agent layer for the two workflows. **Draft-only; zero external agent sends stays a hard rule.**

6.1 **Alex's scheduler.** Promote the daily invoice-audit disposition (`run-disposition.ts`) from manual/API-triggered to a durable scheduled run (`docs/56` headless scheduler design), writing `requested` credit-memo drafts and coverage-gap signals into the queue (§5.1).

6.2 **Casey's credit-memo drafting.** Make Casey event-triggered on "credit-memo packet ready": generate the one-invoice-per-request draft per `skills/…/vendor-invoice-credit-memo-audit/SKILL.md`, UOM-verified, math within $0.01, into `communication_threads`/`communication_messages` at `awaiting_internal_approval`. Post to `#accounting-credit-memos` for Lucinda; escalate >$5,000. No send.

6.3 **Jordan's coverage-gap cadence.** Build `docs/57` §3a/§3b: for each out-of-tolerance vendor/branch, Jordan generates the price-agreement request draft with the 7-day follow-up SLA, routed to the human queue. Alex flags, Jordan drafts, human sends.

6.4 **Flip the credit-memo A3 to a decision.** Fill baselines and check the decision boxes in `proposals/2026-05-30-vendor-invoice-credit-memo-audit.md` so the autonomous layer has an approved A3 behind it (rule 9).

**Exit:** the two workflows run daily without a human trigger, produce drafts into the queue and Slack, and every external step is still a gated human action. Verified by the §7.2 test-email checklist.

---

## 7. Verification & test checklists (to run in the execution session)

These are the "verify inboxes / test emails / validate Slack" tasks, made concrete. They are **read/observe-first**; the only sends are internal test messages to controlled addresses.

### 7.1 AgentMail inbox roster check
- Compare `AGENTMAIL_AGENT_ROSTER` in `agentmail.ts` against `deployment/remote/agentmail/pro-exteriors-agentmail-roster.json` — 10 inboxes, names match.
- For each inbox, confirm it exists live via the AgentMail API (list inboxes) and that the count ≤ cap (10).
- Confirm the webhook endpoint `/api/agentmail/webhook` is reachable and Svix-verifying (send one AgentMail test event, watch it land).
- Confirm every persona's `service_agent_id` resolves to a real inbox (this catches the Sam Torres gap).

### 7.2 Credit-memo & price-agreement test emails
- **Internal only.** Send a synthetic "credit-memo packet ready" test through Casey's draft path and confirm it produces a draft in `communication_messages` at `awaiting_internal_approval` and a Slack post to `#accounting-credit-memos` — and that `outbound-guard.ts` blocks any external recipient to a draft.
- Send a synthetic price-agreement package handoff and confirm it lands as `price_refresh_request` (`reason='agreement_package'`, `channel='human_send_required'`) with recipient classified external → no send.
- Confirm the inbound "approved" reply path (AgentMail reply-to → shared accounting inbox) is received and correlated, without triggering an auto-send.
- Confirm UOM correctness on the test lines: variance only where `price_uom == abc_price_list_items.unit`, else `uom_mismatch` with NULL variance.

### 7.3 Slack portal validation
- Run `scripts/verify-roofing-agent-slack-routing.mjs` and `scripts/join-roofing-agents-to-slack-channels.mjs`; confirm each bot is installed and a member of its channels.
- Post one test message as each named bot via `postSlackMessage` and confirm it appears under that bot's identity (not `@openbrain`).
- Post a test human request in each operational channel and confirm the ops router classifies to the right single agent and replies as that agent; confirm an `ops_escalation` creates a Linear issue.
- Confirm `slack_mirror_events` drains a human dashboard decision back into Slack within one drain cycle.
- Confirm cron reports now land in `#ob-agents-internal`, not the human channels (Phase 1.2).

*(During trials, keep all posts redirected to Chris's DM per current trial config — do not post to Lucinda.)*

---

## 8. Phase 5 — Staged migration (blocked until Phases 1–4 exit green)

Do **not** start until §2 exit criteria hold. Then, per CLAUDE.md rules 9 & 12 and `docs/54`:

8.1 **Finish, don't re-adopt, what's already here.** Bring Open Engine automation from **Red** to green (durable queue-runner/cron for `scripts/open-engine-queue-runner.mjs`); register the PE-CC team's Open Skills; keep OKF bundles current. This is stabilization-adjacent and can overlap late Phase 4.

8.2 **Write one migration A3** (`proposals/`, `_a3-template.md`) covering the net-new stack, each item with intended use, 10x-ROI/security justification, owner, rollback, and a doc-54 verdict. Verdicts are pre-decided (Decision 11.4):
   - **Greptile → `conditional_pilot`.** Net-new; pilot for code search/review on the DevTeam plane only, containerized on Hetzner per rule 3.
   - **GitHub Actions CI → `conditional_pilot`.** Scope minimal pipelines that don't fight Coolify's deploy path.
   - **Convex → `defer`.** Forks the single shared Supabase with no current need it can't meet; revisit only against a concrete requirement Supabase genuinely can't satisfy.
   - **Vercel → `reject`.** Reverses a standing "no Vercel" decision in three files (`docs/08`, `config/roofer.config.yaml`) with no benefit over self-hosted Coolify/Astro; stay on Coolify unless a future need forces an explicit, documented reversal.
8.3 **Pilot behind the gate.** Each approved item runs `conditional_pilot` on the DevTeam plane only, containerized on Hetzner where an MCP is involved (rule 3), with egress/installer/permission review and SkillSpector scan before any global enablement.

**Exit:** migration items either shipped as reviewed internal skills/services or explicitly deferred/rejected with a recorded verdict — never a live global third-party hook.

---

## 9. Sequencing & dependencies

```
Phase 1 (email+Slack correctness) ─┐
Phase 2 (reconcile conflicts) ─────┼─► Phase 3 (close the loop) ─► Phase 4 (autonomous layer) ─► §2 exit gate ─► Phase 5 (migration)
                                   │                                     ▲
                                   └── §7 checklists run continuously ───┘
```

Phases 1 and 2 are independent and can run in parallel (one git worktree each per `AGENTS.md`). Phase 3 depends on 2 (stable identity/cadence). Phase 4 depends on 3 (the queue it writes into). Phase 5 is hard-gated on the §2 exit criteria.

## 10. Guardrails this plan must not cross

- Additive/idempotent migrations only; never destructive against a client brain (rule 1).
- Zero external agent email/SMS; agents draft, humans send (rules in `docs/40`, `outbound-guard.ts`).
- Historian internal-only, Researcher external-only (rule 5); consent-gated cross-client path only (rule 6).
- New agent capability needs an approved A3 (rule 9); any third-party tool needs the full doc-54 gate (rule 12).
- Live⇄Dev alignment: branch from the confirmed live branch, converge back, explain-then-ship on deploy.
- Keep the customization surface in `config/roofer.config.yaml`; no company hard-coded elsewhere.

## 11. Decisions (recommended, 2026-07-07)

Recommendations baked in below. Each is reversible; the point is to unblock execution with a sensible default rather than leave four forks open.

**11.1 Sam Torres / QA email → route through Conductor now; do not raise the cap.**
Point `agents/profiles/sam-torres.yaml` `service_agent_id` at `ob-conductor` (already provisioned). This matches the omitted-roster rationale ("QA email can route through Conductor until volume proves a need"), costs nothing, and keeps AgentMail at 10/10. Only raise the cap for a dedicated Auditor/QA inbox once there is real, recurring QA email traffic that Conductor routing can't cleanly absorb — a data-driven trigger, not a guess. *Rationale: cheapest fix that closes the broken-mailbox reference; preserves the internal-only Auditor boundary (rule 5).*

**11.2 Cadence source of truth → lift cadence into `config/` data; scripts and dashboard both read it.**
Neither the mock `cadence.ts` nor the two drifting Python scripts should be canonical. Make a single machine-readable cadence file under `config/` (evolve `agent-cadence.example.yaml` into the real one) the source of truth; `write-cron-jobs.py`/`deploy-crons.py` generate `jobs.json` *from* it, and `cadence.ts` reads it for display. Merge the two Python scripts into one generator. *Rationale: config-as-data is the repo's stated pattern (`roofer.config.yaml`), kills the four-way drift permanently, and makes the dashboard reflect deployed reality instead of hardcoded strings.*

**11.3 Token policy → strict for identity posts, fallback only for system/status posts.**
An agent-identity post (a message that appears *as* Alex/Casey/etc.) must refuse the `@openbrain` fallback and fail loudly if its bot token is missing — align `slack.server.ts::resolveAgentToken` to the router's existing strict stance. Reserve the `@openbrain` fallback strictly for non-identity system/status/deploy notifications where "who said it" doesn't matter. *Rationale: silent fallback is exactly what makes the system feel incoherent (messages attributed to the wrong bot); a loud failure surfaces missing-token config instead of hiding it, while still letting infra chatter through.*

**11.4 Convex → defer. Vercel → reject (stay on Coolify).**
No current need beats the single shared Supabase, and Convex would fork the data layer — mark it `defer` in the migration A3 until a concrete requirement Supabase genuinely can't meet appears. Vercel reverses a standing "no Vercel" decision recorded in three files (`docs/08`, `config/roofer.config.yaml`) with no offsetting benefit over the self-hosted Coolify/Astro path — mark it `reject` unless a future need forces an explicit, documented reversal. Proceed in Phase 5 with **Greptile** (`conditional_pilot`, DevTeam plane) and a **minimal GitHub Actions CI** that doesn't fight Coolify's deploy path as the only genuinely net-new items worth piloting. *Rationale: honors "stabilize, don't sprawl"; keeps the data layer and deploy path singular; spends the migration budget only where there's a real gap.*
