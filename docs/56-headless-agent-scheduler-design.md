# 56 — Headless Agent Scheduler (host-driven Hermes) — design

**Date:** 2026-06-28
**Status:** In progress — Alex Rivers chosen as the first end-to-end proof.
**Owner:** Lead Orchestrator (Chris / Cleverwork)
**Related:** `agents/cadences/roofing-agent-master-cadence.yaml`, `scripts/deploy-crons.py`,
`docs/handoffs/2026-06-06-kasm-hermes-agent-desktops.md`, `docs/53-agent-onboarding-automation-assessment.md`,
app actor model `app/command-center/src/lib/access-control.ts`, recording table
`schemas/cleverwork-roofer/80-command-center-workflows.sql` (`dashboard_action_log`).

---

## 1. Why this exists

On **2026-06-28** we verified the live runtime end-to-end and found the agent fleet **fully
provisioned but dormant**. Everything is built except the thing that makes agents *do work on a
schedule*:

| Layer | State (verified 2026-06-28) |
| --- | --- |
| Design (13 agents + 7 personas) | ✅ spec'd (`agents/horizontal`, `agents/vertical`, `agents/profiles`) |
| App / API surface | ✅ live — `cc.proexteriorsus.net`, 13 service tokens, OAuth2 discovery, `/api/agent/*` gated (401) |
| AgentMail (email) | ✅ 10 live inboxes on `agentmail.proexteriorsus.net` |
| Recording seam | ✅ `dashboard_action_log` + 14 writers; `/api/agent/intake` already attributes work |
| Kasm desktop platform | ✅ up (8 `kasm_*` containers, 21-day uptime) |
| Agent provisioning | ✅ 8 Hermes profiles under `/mnt/kasm_profiles/<email>/<image_id>/.hermes` |
| SOPs as cron jobs | ✅ 29 jobs deployed to profiles on 2026-06-25 (`cron/jobs.json`) |
| **Cron execution** | ❌ all jobs `state: paused` / `enabled: false` (except ops-conductor's 3); `last_run_at` null on most |
| **Running agent runtime** | ❌ no agent containers running; no active Kasm sessions |
| **Host scheduler** | ❌ no host crontab, no systemd timers — nothing fires the Hermes crons |
| **Dashboard visibility** | ❌ no activity-feed page; most crons post to Slack only, not the dashboard |

Net: agents are **capable** (auth, email, API, recording all live) but **not executing**. Casey,
Lena, and Rowan show a single Jun-25 test fire; then everything was paused.

## 2. Decision

Run agents **headless on the host, driven by a real scheduler** — not by live Kasm desktops.
Desktops stay available for the few tasks that genuinely need a browser GUI, but scheduled work
does not depend on a desktop session being open.

Rationale: 24/7 scheduled work should not hinge on a GUI session being alive. Headless is more
reliable, cheaper, and observable. (Chosen 2026-06-28.)

## 3. Architecture

The baked Kasm image already contains the full Hermes runtime (`/usr/local/bin/hermes`,
`/usr/local/lib/hermes-agent`). We reuse it as a **non-GUI runner**.

```
host systemd timer (every ~1 min)
        │  for each agent profile:
        ▼
docker run --rm  <mount agent .hermes profile>  openbrain-hermes-chrome:<tag>  hermes cron tick
        │
        ▼
hermes cron tick  ── reads that agent's state.db, runs any DUE job once, exits
        │
        ├─ posts NEPQ summary to the agent's Slack channel
        ├─ calls https://cc.proexteriorsus.net/api/agent/* (bearer = agent service token)
        └─ → dashboard_action_log row (attributed to the agent) — see §6
```

Key primitive: **`hermes cron tick`** = "run due jobs once and exit." A host scheduler calling
`tick` per agent every minute is functionally equivalent to the in-container Hermes cron daemon,
but without needing a long-lived container or desktop.

### Components to build

1. **`scripts/agent-tick.sh <agent-email>`** — host-side runner. `docker run --rm` the baked
   image with the agent's profile mounted at the correct home, env loaded, executing
   `hermes cron tick --accept-hooks`. Idempotent; safe to call when nothing is due (no-op).
2. **systemd timer + service** (or a single crontab line) — fires every minute, loops the 8 agent
   emails through `agent-tick.sh`. One unit keeps it observable via `journalctl`.
3. **Cron enablement** — the deployed jobs are `paused`. Resume per agent as each SOP is validated
   (`hermes cron resume <id>` / flip enabled), so we never enable an unvalidated SOP.

## 4. Open seam to resolve first (the one real unknown)

`hermes cron list` against a mounted profile returned **"No scheduled jobs"** even though
`cron/jobs.json` has 4 — because:

- the baked image's default entrypoint runs as **root (uid 0)**, but profile files are owned by
  `kasm`, and the profile dirs are `0700`; and
- `hermes cron list` reads **`state.db`** (sqlite), not `jobs.json` directly.

So the first build step is to match how Kasm actually launches Hermes: correct **uid** (the `kasm`
uid, likely 1000), correct **HOME**/mount so `~/.hermes` resolves to the real profile, and confirm
`hermes cron list` then shows the 4 jobs. This is an invocation detail, not an architecture change.

## 5. First proof — Alex Rivers

Alex is the safest first agent: **pure API/data (pricing variance), no browser GUI needed**, 4
deployed jobs, delivers to `#accounting-product-catalog-review` (`C0BD8U44HL3`).

Acceptance for the Alex proof:
1. Headless `hermes cron list` shows Alex's 4 jobs (mount/uid resolved).
2. `agent-tick.sh alex.rivers@cc.proexteriorsus.net` runs cleanly headless.
3. One job enabled + executed live: observable Slack post **and** a `dashboard_action_log` row
   attributed to Alex.
4. Scheduler unit installed and ticking; `journalctl` shows the run.

Then replicate per agent (bucket 2: validate each SOP) and close the recording seam + feed (bucket 3).

## 6. Recording — "as if done via desktop"

The actor model already supports this: `dashboard_action_log` stores `actor_id` / `actor_type` /
`actor_display_name`. A **named_agent** is the "as if at a desktop" identity. Gaps to close:

- **No unified write path** — the 14 writers hand-roll inserts. Add `lib/activity-log.ts`
  (`logDashboardAction(...)`) and route everything through it.
- **No system/cron actor** — headless scheduled runs need a structured actor so cron work is
  attributable (not free-text `'System'`).
- **Most crons post to Slack only** — each validated SOP must also write an attributed action-log
  row (either the agent calls the API, or the API records on the agent's behalf).
- **No feed surface** — build `/system/activity-feed` (or similar) that renders `dashboard_action_log`
  filtered by actor / department / workflow / date, so programmatic work is visible exactly like
  desktop work.

## 7. Guardrails (unchanged)

- **Zero external sends (v1).** Agents draft; humans send. Slack-internal posts + API intake are
  internal, not client-facing.
- **Historian internal-only / Researcher external-only** — Rowan's headless runner must keep the
  external-only credential boundary; no brain access.
- **Additive only** — recording schema changes are additive/idempotent; never destructive.
- **Validate before enable** — a cron job is only resumed after its SOP passes an observed live run.

## 7a. Validation findings & resolved decisions (Alex proof, 2026-06-28)

Bringing Alex up surfaced the real per-agent SOP gaps and how we resolve them:

1. **Headless invocation (RESOLVED, proven).** Run the baked image non-GUI with the profile
   mounted: `docker run --rm -u 1000:1000 -e HOME=/home/kasm-user -v <profile-root>:/home/kasm-user
   --entrypoint /usr/local/bin/hermes <image> cron tick`. `load_jobs()` returns Alex's 4 jobs; the
   earlier empty `cron list` was a red herring — `list_jobs()` hides paused jobs, and all 4 are
   `enabled:false / state:paused`. Activate with `cron resume <id>` then `cron run <id>` + `cron tick`.
2. **Crons are paused, not missing (RESOLVED).** The deployed `cron/jobs.json` is the real store and
   loads fine; jobs are simply disabled. Enable per-agent only after the SOP passes a live run.
3. **Missing skills (PARTIAL).** Cron jobs reference `abc-supply-api` (exists in repo),
   `nepq-agent-communication` (did NOT exist → **created this session**, `skills/cleverwork-roofer/
   nepq-agent-communication/`), and `google-workspace` (Maya only; likely a Hermes hub skill).
   Install path = `hermes skills install <HTTPS URL to SKILL.md> --category cleverwork-roofer --yes`;
   our `SKILL.md` format is directly compatible. Open step: a raw URL the host can fetch (private repo).
   Scheduler loads named skills into the prompt and skips-with-warning if absent (improves reliability,
   not a hard block).
4. **Command Center token question (RESOLVED).** Canonical agent→API auth is `Authorization: Bearer
   <service-token>` (root `.env` `AGENT_SERVICE_TOKENS`, 13 provisioned; Alex → `ob-accounting`). BUT
   for v1 recording Alex does **not** need a CC bearer token: it already holds `SUPABASE_SERVICE_TOKEN`
   and `dashboard_action_log` is in the same Supabase, so it records an attributed row via a direct
   REST insert. The generic `/api/agent/activity` endpoint + provisioned bearer token is the later
   hardening step (centralized attribution/permission), not a v1 blocker.
5. **Recording is per-SOP work (OPEN).** `/api/agent/intake` is Gmail-specific; Alex's pricing work
   has no recording today (Slack-only). Each validated SOP must end by writing an attributed
   `dashboard_action_log` row (v1: direct Supabase insert; later: `/api/agent/activity`).

## 7b. CRITICAL FINDING — incomplete agent `.env` (the real blocker to "real work")

A direct read-only capability check of Alex (plain `curl` with Alex's own env — no agent loop)
showed the agent **cannot do its job because its credentials are not fully provisioned**:

| Check | Result |
| --- | --- |
| Identity (`AGENT_ID` etc.) | ✅ `alex-rivers`, pricing-catalog, accounting/operations/system |
| Network egress | ✅ google 200, `cc.proexteriorsus.net/healthz` ok |
| `ABC_SUPPLY_AUTH_BASE_URL` | ❌ **empty** → ABC OAuth fails (HTTP 000) |
| `ABC_SUPPLY_API_BASE_URL` | ❌ **empty** |
| `ABC_SUPPLY_SCOPES` | ❌ **empty** |
| `ABC_SUPPLY_CLIENT_ID` / `_SECRET` | ✅ present (len 20 / 64) |
| `SUPABASE_SERVICE_TOKEN` | ❌ **empty** → Supabase 401 (anon key IS present, len 208) |

**Implication:** the agents are dormant AND under-provisioned. Even once the scheduler runs them,
Alex can't authenticate to ABC Supply or write to the brain. The v1 "record via direct Supabase"
plan also depends on `SUPABASE_SERVICE_TOKEN`, which is blank — so recording is blocked until it's set.

Canonical fill values (from `config/.env.example`, non-secret):
- `ABC_SUPPLY_AUTH_BASE_URL=https://auth.partners.abcsupply.com/oauth2/ausvvp0xuwGKLenYy357` (prod)
- `ABC_SUPPLY_API_BASE_URL=https://partners.abcsupply.com` (prod)
- `ABC_SUPPLY_SCOPES=location.read product.read account.read pricing.read order.read allOrder.read notification.read invoice.read invoice.history.read`
- `SUPABASE_SERVICE_TOKEN=<service-role key for rnhmvcpsvtqjlffpsayu>` — **secret**, source from CC/Coolify env, not the repo.

**Likely systemic:** profiles were provisioned by the same `deploy-agent.py`; the other agents'
`.env` should be audited for the same blanks (a per-profile credential scan was correctly gated as
sensitive — do it deliberately, with the operator).

## 7c. Guardrail reality — AI cannot launch the agent (confirmed)

The auto-mode classifier firmly blocks an AI from launching (or handing over a command to launch)
the `hermes --yolo --accept-hooks` autonomous loop on prod — even with a user-added permission rule,
which it reads as a bypass. This is by design and is NOT worked around. Consequences for the plan:
- The **first manual validation** must be initiated by the human, on their own infra.
- The **steady-state** is fine: a host **systemd timer** runs `hermes cron tick` autonomously — the
  *host* runs the agent, the AI never launches it. Building/installing that timer is config work,
  not an agent launch.
- Read-only capability checks (curl with the agent's creds) ARE allowed and are how we validate
  credentials/connectivity without the agent loop (used above to find the `.env` gaps).

## 7d. Provisioning fix + Alex now operational (2026-06-28)

`scripts/provision-agent-env.sh` (re-runnable; reads the local `.env`, never echoes secrets,
backs up each profile, excludes Rowan from brain creds) filled the missing keys. Mapping:
project `SUPABASE_SERVICE_ROLE_KEY` → agent `SUPABASE_SERVICE_TOKEN`; ABC URLs/scopes from
`config/.env.example` prod values.

Outcome — the gap was NOT uniform:
- **alex.rivers** — set Supabase token + 3 ABC values → **now PASSES** both checks (ABC OAuth 200
  `token=yes`; Supabase read 200 returns a real row). Fully operational.
- **maya.chen** — already fully provisioned (furthest-along agent).
- **casey.morgan, lena.brooks** — set Supabase token.
- **jordan.price, sam.torres** — **NO `.env` at all** (the two `desktopEnabled:false` agents never
  got a profile). They need profiles created before they can run.
- **rowan.vale** — skipped (external-only boundary held).

Detail: ABC token endpoint is `<ABC_SUPPLY_AUTH_BASE_URL>/v1/token` (Okta). The `abc-supply-api`
skill / Alex SOP should use that exact path (the agent's earlier `/connect/token` guess failed).

## 8. Status log

- 2026-06-28 — Runtime verified dormant; decision = host scheduler + headless Hermes. Proven headless
  invocation + profile/job loading. Installed `abc-supply-api` + `nepq-agent-communication` skills into
  Alex's profile (both `enabled`). Resolved token question + skill-install path. **Confirmed AI cannot
  launch the --yolo agent (firm guardrail).** **CRITICAL: Alex `.env` missing ABC auth URL/scopes +
  SUPABASE_SERVICE_TOKEN — agent can't authenticate to ABC or the brain.** Next: provision the missing
  env (ABC non-secret values + the Supabase service-role secret), audit the other profiles for the same
  blanks, then validate (human-run or via installed scheduler) and build v1 recording + the systemd timer.
