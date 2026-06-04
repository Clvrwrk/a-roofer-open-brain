# Project Handoff - A Roofer's Open Brain
**Project:** A Roofer's Open Brain / Pro Exteriors Open Brain Command Center
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain.git
**Production URL:** not yet deployed; planned Command Center origin is `https://cc.proexteriorsus.net`
**Date:** 2026-06-04 14:51 PDT
**Agent:** Codex Lead Orchestrator / Maintenance + App Transition
**Reason:** User-requested

---

## Accomplished This Session

### Maintenance Layer, GSD, And Workspace Discipline

- `.codex/gsd-core/`: Installed local GSD Core from `open-gsd/gsd-core` as the development operating loop for this repo and future projects.
- `.codex/agents/` and `.codex/skills/`: Installed GSD agent and workflow materials for Codex-local execution.
- `AGENTS.md`: Recorded the 13-agent workforce roster plus parallel-agent worktree discipline.
- `agents/horizontal/maintenance/`: Added/retained Maintenance front-desk docs for workspace map, hygiene, Hermes-style routing, and archive handling.
- `archive/local-uncommitted-2026-06-04/MANIFEST.md`: Recorded raw imported project material location and provenance boundary.
- `.gitignore`: Ignored raw archive/import/runtime memory paths so sensitive or huge copied project material stays out of commits.

### Command Center Walking Skeleton

- `app/command-center/`: Created the Astro SSR Command Center app shell.
- `app/command-center/src/layouts/AppShell.astro`: Added shared app layout for the operational UI.
- `app/command-center/src/styles/global.css`: Added Pro Exteriors-flavored command surface styling.
- `app/command-center/src/lib/cadence.ts`: Seeded department-by-cadence work queues for daily, weekly, monthly, quarterly, and annual task grouping.
- `app/command-center/src/lib/auth.ts`: Added placeholder auth-state helpers.
- `app/command-center/src/pages/index.astro`: Built the first-screen working command surface, not a marketing landing page.
- `app/command-center/src/pages/agents.astro`: Added agent runtime/status surface placeholders.
- `app/command-center/src/pages/healthz.ts`: Added server-side health route.
- `app/command-center/README.md`: Documented local run routes and runtime notes.

### Supabase Product Surface And WorkOS/Auth.md Discovery

- `app/command-center/src/lib/supabase.server.ts`: Added server-only Supabase client loading from repo-root env.
- `app/command-center/src/lib/product-data.ts`: Added sanitized product/pricing loader for the first real Command Center data surface.
- `app/command-center/src/pages/api/product-surface.json.ts`: Added JSON product surface route.
- `app/command-center/src/pages/index.astro`: Wired the dashboard to the Supabase-backed product/pricing surface.
- `app/command-center/src/lib/agent-auth.ts`: Added WorkOS/auth.md agent-auth discovery helpers.
- `app/command-center/src/pages/auth.md.ts`: Added LLM-readable auth instructions for agents.
- `app/command-center/src/pages/.well-known/oauth-protected-resource.ts`: Added protected-resource metadata.
- `app/command-center/src/pages/.well-known/oauth-authorization-server.ts`: Added authorization-server metadata.
- `app/command-center/src/pages/agent/identity*.ts`, `app/command-center/src/pages/oauth2/*.ts`, `app/command-center/src/pages/agent/event/notify.ts`: Added reserved POST endpoints returning `not_implemented`.
- `docs/24-supabase-product-surface-integration.md`: Documented the product surface contract, read RPCs, and safety notes.
- `docs/25-workos-agent-auth-md-integration.md`: Documented the WorkOS/auth.md discovery plan.

### Memory, MemSearch, And Import Boundary

- `.memsearch.toml`: Added project-level MemSearch defaults.
- `context/MEMORY.md`: Added curated working memory snapshot under size cap.
- `context/USER.md`: Added durable user preference snapshot under size cap.
- `context/memory/2026-06-04.md`: Added dated session log.
- `context/transcripts/.gitkeep`: Reserved transcript-summary path without committing transcripts.
- `scripts/memsearch-index-open-brain.sh`: Added manual index command for curated context.
- `docs/26-open-brain-memory-system.md`: Documented MemSearch source-of-truth, indexing, hook install, and archive boundary.
- Local runtime: MemSearch Codex plugin installed user-level `memory-recall` and `memory-config` skills, enabled hooks, warmed ONNX, and indexed `open_brain_memory`.

### Hetzner, Coolify, Sentry, And Access Planning

- `docs/27-hetzner-coolify-agent-host.md`: Added CPX41 single-host deployment plan for Coolify, Command Center, Hermes, OpenClaw, internal MCPs, and MemSearch indexing.
- `docs/28-sentry-mcp-and-observability.md`: Added Sentry CLI/MCP setup plan, env names, auth modes, and Hermes responsibilities.
- `deployment/remote/DEPLOYMENT-RUNBOOK.md`: Updated deployment runbook references for host and observability setup.
- `docs/20-observability-and-incident-response.md`: Added Sentry observability notes.
- `config/.env.example`: Added names-only placeholders for Hetzner, Sentry, Milvus/Zilliz, Command Center URL, and related runtime secrets.

### Env Contract And ABC Supply Sandbox

- `docs/29-connection-and-access-checklist.md`: Added the step-by-step connection guide for `.env`, Codex auth modes, Hetzner, DNS/Coolify, Supabase, WorkOS, Sentry, ABC Supply, Zilliz/MemSearch, and provider APIs.
- `config/.env.example`: Clarified that real `.env` values must never be copied back into the template.
- `config/.env.example`: Added ABC Supply namespaced env names and sandbox URLs.
- `integrations/bridges/abc-supply/metadata.json`: Added optional ABC sandbox env names for base URLs and scopes.
- `integrations/bridges/abc-supply/README.md`: Documented that sandbox access exists and generic provider labels must be mirrored into namespaced vars.
- `integrations/bridges/abc-supply/SANDBOX-TEST-PLAN.md`: Added read-only ABC sandbox test plan with explicit no-write guardrails.

### Handoff

- `docs/handoffs/current.md`: Created this source-of-truth project handoff.
- `docs/handoffs/archive/2026-06-04-1451.md`: Archived a timestamped copy of this handoff.

## Git State

- **Branch:** main
- **Last substantive commit before handoff:** `aafb47d` - "Document access checklist and ABC sandbox setup"
- **Uncommitted changes:** expected local-only log noise remains outside the handoff commit.

| File | Status | Note |
|------|--------|------|
| `excalidraw.log` | Modified | Pre-existing/generated local MCP log append. Not part of the handoff work and should not be staged unless the user explicitly wants to track it. |

## Task Cut Off

None - session ended at a clean boundary after recording the project handoff and learnings.

## Next Task - Start Here

**Task:** Normalize ABC Supply env aliases and implement the first read-only sandbox smoke.

**What to check / do:**
1. Confirm repo-root `.env` contains `ABC_SUPPLY_ENV=sandbox`, `ABC_SUPPLY_CLIENT_ID`, and `ABC_SUPPLY_CLIENT_SECRET`. The current local `.env` was observed to contain generic `ClientID` and `Client_Secret`; mirror those values into the namespaced vars without printing them.
2. Confirm ABC sandbox integration track and allowed scopes. The current docs assume client credentials may be available, but pricing support depends on ABC's assigned track.
3. Add a small server-only ABC auth helper or smoke script under `integrations/bridges/abc-supply/` that redacts token responses and never logs secrets.
4. Run token exchange first, then only harmless read endpoints such as branch/catalog/account lookup using sandbox-safe identifiers.
5. Record results in `integrations/bridges/abc-supply/SANDBOX-TEST-PLAN.md` and update `context/memory/YYYY-MM-DD.md`.

**If token exchange fails:** classify it as invalid client, invalid scope, rate limit, or network failure; then ask Chris for the ABC integration track/scopes or corrected namespaced env aliases. Do not guess scopes and do not try write endpoints.

**Prompt to use:** "Read docs/handoffs/current.md. Then normalize the ABC_SUPPLY env aliases and implement the Phase 1 ABC sandbox token/read-only smoke test without printing secrets."

## Decisions Made This Session

- **Real secrets live in `.env`, not `.env.example`:** `config/.env.example` is a names-only contract with placeholders so agents and deployments know required variables without leaking values.
- **Do not copy `.env` to `.env.example`:** If a new secret appears in `.env`, mirror only its variable name and placeholder into the template.
- **Use namespaced env vars in committed code:** ABC's portal labels may be `ClientID` and `Client_Secret`, but repo code should use `ABC_SUPPLY_CLIENT_ID` and `ABC_SUPPLY_CLIENT_SECRET`.
- **Command Center is the app home:** The current production path is Astro SSR under `app/command-center`, not the older static prototype under `deployment/remote/dashboard`.
- **Supabase product surface is server-only:** The service-role key must never be exposed through `PUBLIC_` vars or browser code.
- **WorkOS remains disabled until the callback/session path is real:** `COMMAND_CENTER_AUTH_MODE=disabled` is appropriate until `cc.proexteriorsus.net` and WorkOS callback routing are verified.
- **Auth.md/agent-auth endpoints are discovery placeholders:** They establish the contract now, but token, replay, issuer, audience, and event verification must be implemented before trusting agent writes.
- **MemSearch markdown is source-of-truth:** Milvus Lite, Zilliz, and `.memsearch/` are rebuildable indexes; curated `context/` files are what future agents should read first.
- **Raw imports stay quarantined:** The archive contains large client website, accounting/pricing, and property/data-collection material. Do not index or commit extracted material until a sanitizer/extractor exists.
- **CPX41 is acceptable for first host:** It is enough if OpenClaw/browser workloads stay limited and shared memory uses local Milvus Lite or Zilliz Cloud instead of heavy on-box Milvus Server.
- **Sentry automation should use tokens:** Browser login is fine locally; agents and server workflows should use `SENTRY_AUTH_TOKEN` and later a project-constrained Sentry MCP URL.
- **ABC Supply starts read-only:** No order placement, webhook registration, favorites, templates, or other write endpoints until a human review gate approves sandbox write behavior.
- **GSD Core gives build rhythm, not org replacement:** It complements the 13-agent workforce with Discuss, Plan, Execute, Verify, Ship flow.

## Blockers Requiring Human Action

1. **ABC Supply sandbox details** - Add or confirm `ABC_SUPPLY_*` aliases in `.env`, confirm integration track/scopes, and provide safe sandbox identifiers if account or pricing tests need them.
2. **Hetzner access** - Provide server IP/hostname, SSH user, SSH port, and install/confirm Codex's public key for the CPX41.
3. **DNS/Coolify access** - Confirm DNS control for `cc.proexteriorsus.net` and whether Coolify is already installed or should be installed fresh.
4. **WorkOS credentials** - Add `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_REDIRECT_URI`, and `WORKOS_COOKIE_PASSWORD` before real human auth is enabled.
5. **Sentry naming confirmation** - Add/confirm `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` in `.env` using these exact names.
6. **Memory backend decision** - Choose local Milvus Lite for bootstrap, Zilliz Cloud for shared memory, or self-hosted Milvus later.
7. **Archive sanitizer scope** - Approve a sanitize/extract manifest before the raw website, accounting/pricing, and property data imports are promoted into app code or memory.
8. **Backup target** - Provide provider, bucket, region, and credentials path for off-box encrypted backups before production deployment.

## Verification Commands

1. `git status --short` - should show only known local noise such as ` M excalidraw.log` after the handoff commit.
2. `git log -1 --oneline` - should show the latest handoff commit after this document is committed.
3. `cd app/command-center && npm run check` - should complete an Astro build.
4. `cd app/command-center && npm run dev -- --port 4326` - should start the local Command Center on `http://127.0.0.1:4326/`.
5. `curl -s http://127.0.0.1:4326/api/product-surface.json` - with repo-root `.env` present, should return a sanitized product surface with Supabase configured and product status live.
6. `bash scripts/memsearch-index-open-brain.sh` - should index curated context into collection `open_brain_memory`.
7. `git diff --check` - should return no whitespace errors for new edits.

## Full Context

### What was built across ALL sessions (complete feature list)

- Maintenance layer: agent roster, Maintenance role docs, front-desk workspace map, and archive discipline for messy multi-project imports.
- GSD Core: local `.codex/` GSD install with workflows, agents, skills, hooks, and config for repeatable build phases.
- Command Center Phase 1: Astro SSR app with operational first screen, agents surface, cadence queue seed data, health route, and brand-aligned styling.
- Product surface: server-side Supabase loader and `/api/product-surface.json` route over existing read RPCs for price list, invoice gate, agreement audit, and catalog snapshots.
- WorkOS/auth.md skeleton: discovery routes, OAuth metadata placeholders, identity/token/event endpoints reserved for future agent auth.
- Memory system: curated `context/` snapshots, MemSearch config, manual index script, installed MemSearch Codex plugin, ONNX warmup, and local Milvus Lite baseline.
- Archive: raw copied project imports moved into ignored `archive/local-uncommitted-2026-06-04/` with a tracked manifest, not indexed.
- Deployment planning: Hetzner CPX41/Coolify topology, Command Center public URL plan, internal service boundaries, Hermes/OpenClaw placement, and upgrade triggers.
- Observability planning: Sentry CLI/MCP docs, env contract, token-vs-browser login distinction, and Hermes incident/digest responsibilities.
- Access checklist: step-by-step instructions for `.env`, Codex account/API modes, Supabase, WorkOS, Sentry, Hetzner, DNS/Coolify, ABC Supply, Zilliz, and provider APIs.
- ABC Supply: bridge docs, metadata, sandbox env contract, and read-only sandbox test plan.

### Architecture decisions

- The repo's long-term shape is an "Open Brain" with vertical agents for Accounting, Operations, Sales, Marketing, and Executive, plus horizontal agents for Capture, Historian, Researcher, Conductor, Auditor, Quality Control, Innovator, and Maintenance.
- Historian and Researcher remain a security boundary: internal retrieval and external retrieval should not share the same runtime authority.
- Auditor and Quality Control remain separate: Auditor gates individual work products; Quality Control edits standards and trust tiers.
- Command Center should be a human-in-the-loop operational UI for agent work, approvals, cadence queues, product/accounting surfaces, and future property layer-cake views.
- Cron-backed work should be classified by department and cadence before autonomy is increased.
- App code must prefer server-only secrets, sanitized API responses, and explicit auth gates over quick browser exposure.
- Imported source projects are evidence, not source code, until sanitized and attributed.

### Design system (if applicable)

- Current app uses Pro Exteriors branding assets from `config/brand/` and `app/command-center/public/`.
- The UI should stay operational and dense enough for repeated command-center use.
- First viewport should be the actual working interface, not a marketing hero.
- Existing Command Center CSS lives in `app/command-center/src/styles/global.css`; brand source docs live in `config/brand/DESIGN.md`.

### Key invariants (never violate)

- **Never print or commit secrets:** `.env`, service-role keys, OAuth client secrets, Sentry tokens, ABC credentials, and WorkOS keys stay out of chat and git.
- **Never copy `.env` into `.env.example`:** the template is names only.
- **Never expose Supabase service-role credentials to the browser:** no `PUBLIC_SUPABASE_SERVICE_ROLE_KEY`, no raw service-role payloads.
- **Never index raw archive imports directly:** sanitize/extract first, then promote curated summaries or fixtures.
- **Never let Researcher read internal brain memory directly:** use Conductor/Historian-mediated internal retrieval.
- **Never let write endpoints go live before auth validation:** agent POST routes are placeholders until issuer/audience/replay/JWT checks exist.
- **Never let ABC write endpoints run during sandbox smoke:** read-only until human review.
- **Never change Quality Control standards from Auditor or Maintenance roles:** QC owns standard changes.
- **Never share one checkout across active agents:** use one worktree per active agent/task and stage only owned files.

### Service / deployment map (if applicable)

| Service | Detail |
|---------|--------|
| Repository | `https://github.com/Clvrwrk/a-roofer-open-brain.git` |
| Local workspace | `/Users/chussey/Documents/a-roofers-open-brain` |
| Command Center app | `app/command-center` |
| Planned Command Center URL | `https://cc.proexteriorsus.net` |
| Supabase project | `https://rnhmvcpsvtqjlffpsayu.supabase.co` |
| Supabase product surface | `/api/product-surface.json` in Command Center |
| Current local dev URL observed | `http://127.0.0.1:4326/` during prior verification |
| WorkOS | Planned human auth provider; disabled until env/callback/session are verified |
| Agent auth discovery | `/auth.md`, `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server` |
| MemSearch local CLI | `/Users/chussey/.local/bin/memsearch`, observed version `0.4.6` |
| MemSearch collection | `open_brain_memory`, initially indexed 7 curated chunks |
| Memory source | `context/MEMORY.md`, `context/USER.md`, `context/memory/YYYY-MM-DD.md` |
| Raw archive | `archive/local-uncommitted-2026-06-04/`, ignored except manifest |
| Sentry | CLI installed at `/Users/chussey/.local/bin/sentry`; MCP not yet registered |
| Hetzner target | CPX41, server access pending |
| Coolify | Planned host orchestrator, admin/setup access pending |
| ABC Supply | Sandbox credentials available locally under generic labels; namespaced aliases needed before tests |
