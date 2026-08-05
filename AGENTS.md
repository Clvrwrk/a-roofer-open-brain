# AGENTS.md — the workforce + parallel-agent discipline

Two kinds of agents run per client brain: **vertical** (client-facing in Slack) and **horizontal** (infrastructure). Full charters live under [`agents/`](agents/). This file is the roster + the worktree discipline for AI agents building/maintaining the repo.

> **Pricing/UOM invariant (Accounting + Ops agents):** every invoice/order vs price-agreement comparison happens in ABC's pricing UOM (`priceQty.uom`, e.g. SQ). Use `abc_invoice_lines.price_per_uom` and `v_item_uom_map`; never compare on the raw `quantity`/`uom`/`unit_price`/`pricePerUnitAmount` fields. See [`docs/46-uom-pricing-normalization.md`](docs/46-uom-pricing-normalization.md).

> **Reaching the live site:** the Command Center (`cc.proexteriorsus.net`) is WorkOS-gated; agents read live data via `/api/*` with an `Authorization: Bearer <service-token>` (HTML pages are human-only). Canonical how-to: the **`/workos-agent-auth`** skill.

> **Third-party agent tool invariant:** no external skill, plugin, MCP server, agent wrapper, memory tool, or installer repo becomes part of the brain or global workflow until it passes the `third-party-agent-tool-gate`: A3 traceability, license/provenance review, egress review, installer/permission review, SkillSpector static scan where applicable, local-MCP compliance, rollback path, and human approval. The local-MCP ban still applies; see [`docs/54-third-party-agent-tool-gate-2026-06-25.md`](docs/54-third-party-agent-tool-gate-2026-06-25.md).

> **QuickBooks production invariant:** live QBO is **read-only / mirror-only** — extract into the brain, never mutate the company file. See [`docs/74-quickbooks-production-read-only-guardrails.md`](docs/74-quickbooks-production-read-only-guardrails.md) (PEC-98).

## The 13-agent workforce

### Vertical (5) — client-facing, mentioned in Slack

| Agent | Handle | Owns | Charter |
| --- | --- | --- | --- |
| Accounting | `@ob-accounting` | invoicing, AR/AP, job costing, change orders, draws, **insurance supplements**, close | [`agents/vertical/accounting/ROLE.md`](agents/vertical/accounting/ROLE.md) |
| Operations | `@ob-ops` | scheduling, crews, subs, daily logs, materials, **tear-off/install sequencing**, safety, permits | [`agents/vertical/ops/ROLE.md`](agents/vertical/ops/ROLE.md) |
| Sales | `@ob-sales` | leads, **storm canvassing**, estimates, **insurance claims**, proposals, follow-up, win/loss | [`agents/vertical/sales/ROLE.md`](agents/vertical/sales/ROLE.md) |
| Marketing | `@ob-marketing` | content, reviews, photos, **EEAT flywheel**, schema.org, manufacturer-cert badges | [`agents/vertical/marketing/ROLE.md`](agents/vertical/marketing/ROLE.md) |
| Executive | `@ob-exec` | dashboards, KPIs, strategy, hiring, capacity | [`agents/vertical/exec/ROLE.md`](agents/vertical/exec/ROLE.md) |

### Horizontal (8) — infrastructure, mostly invisible

| Agent | Visibility | Owns | Charter |
| --- | --- | --- | --- |
| Capture | dashboard only | always-on atomization; dual-track debrief atomizer | [`agents/horizontal/capture/ROLE.md`](agents/horizontal/capture/ROLE.md) |
| Historian | via Conductor | **internal-only** retrieval w/ provenance | [`agents/horizontal/historian/ROLE.md`](agents/horizontal/historian/ROLE.md) |
| Researcher | dashboard only | **external-only** retrieval | [`agents/horizontal/researcher/ROLE.md`](agents/horizontal/researcher/ROLE.md) |
| Conductor | digests + routing | routing, escalation, daily/weekly digests, PM-tool sync | [`agents/horizontal/conductor/ROLE.md`](agents/horizontal/conductor/ROLE.md) |
| Auditor | gates work | per-work-product QA vs. current standard | [`agents/horizontal/auditor/ROLE.md`](agents/horizontal/auditor/ROLE.md) |
| Quality Control | convenes reviews | cross-job standard-setting (DMAIC); only role that edits `trust_tier` | [`agents/horizontal/quality-control/ROLE.md`](agents/horizontal/quality-control/ROLE.md) |
| Innovator | A3 proposals | scouts tech + internal patterns; proposes, never builds | [`agents/horizontal/innovator/ROLE.md`](agents/horizontal/innovator/ROLE.md) |
| Maintenance | weekly hygiene + workspace front desk | 5S of the brain, repo navigation, import triage; never deletes/publishes | [`agents/horizontal/maintenance/ROLE.md`](agents/horizontal/maintenance/ROLE.md) |

The Historian/Researcher split is a **security boundary** (see `CONVENTIONS.md` §4). The Auditor/Quality-Control split is the **surgical M&M pattern** — the role that checks each operation is not the role that sets the standard.

## Parallel-agent worktree discipline (for building this repo)

When multiple AI agents work on this repo, do not share a checkout. **Stay aligned with the branch deployed to `cc.proexteriorsus.net` — see CLAUDE.md → "Live ⇄ Dev alignment (the deploy contract)". Dev and live must converge into one lineage, never fork into parallel trees.**

- **Sync first, then branch.** `git fetch origin`, confirm the branch Coolify actually deploys (do **not** assume `main` — it has been stale behind `origin/main`), and create your worktree branch **from the live branch**, not a stale local `main`. Never start substantial work on a stale or uncommitted tree.
- One git worktree per active agent/task. Descriptive folder + matching branch (`contrib/cleverwork/<task>`).
- **Start every agent task by naming the exact absolute path it owns. The assigned path is the boundary — not the chat.**
- Don't switch branches in the canonical repo while another agent may be working.
- Before staging: `git status --short`; stage only files belonging to the current task. **Commit early — never let substantial work sit untracked/uncommitted** (that is how the tracks diverged on 2026-06-17).
- **Close the loop:** merge the task branch **back into the live branch and push** so dev and live converge — then `git worktree remove <path>`. Never leave a production feature (vendor map, WorkOS auth, a new surface) stranded on a side branch the rest of dev doesn't build on.
- **The agent deploys; the gate is explain-then-ship.** Full GitHub/Coolify/Hetzner access (corrected 2026-06-29, supersedes the prior human-only rule). Do all prep first — converge the branch into `main`, apply migrations, build + tests green — then state what's changing + impact + rollback, push `origin main`, and poll `/healthz` until `buildCommit` matches (≈30–90s, up to ~300s cold). Self-granting the permission via `settings.json` is still blocked and not needed. See `/coolify`.

## Session wrap-up / handoff

**Canonical procedure: `CONVENTIONS.md` §13** (shared across all harnesses). End every session here.

Trigger: the user says *"handoff"*, *"wrapup"*, *"wrap up"*, *"end of session"*, *"tie off"*, or runs `/wrapup` — or context hits ~50%. Run in order, don't stop until the tree is clean and converged:

1. **Finish the block**, then commit completed work.
2. **Clean the tree** — `git status --short` must end **empty**: gitignore scratch/logs/byproducts, `git rm --cached` tracked-but-ignorable files, delete junk, commit real content. Never commit secrets/PII (§4) — ignore those buckets.
3. **Update memory** — today's daily-log block; `MEMORY.md`/`USER.md` only if something durable changed (via `meta-memory-write`).
4. **Converge** — `git fetch origin`, confirm the live branch (not assumed `main`), merge the `contrib/*` branch in and **push**.
5. **Agent alignment** — if any rule or this procedure changed, propagate it to **all** harness files (`CLAUDE.md`, `AGENTS.md`, `CONVENTIONS.md` §13, `.cursor/rules/*.mdc`, plus any new ones) and commit the alignment. They may differ in framing but must never contradict CONVENTIONS §13.
6. **Report and stop** — branch, last commit, `tree clean ✓`, next task, blockers. Do not start the next task.

## Memory discipline

- Read the frozen startup memory in `context/SOUL.md`, `context/USER.md`, `context/MEMORY.md`, and today's `context/memory/YYYY-MM-DD.md` before broad repo exploration. In Claude Code the `.claude/hooks/load-memory-snapshot.js` SessionStart hook injects this automatically; in Codex/Cowork read the files manually.
- Use MemSearch for historical recall: `memsearch search "<query>" --top-k 5 --collection open_brain_memory`, then `memsearch expand <chunk_hash> --collection open_brain_memory` when more context is needed.
- Treat `.memsearch/` and Milvus/Zilliz state as generated cache, with one exception: `.memsearch/memory/*.md` are the plugin's auto-captured per-turn summaries (the transcript layer) — durable, indexed, do not hand-edit. Curated markdown under `context/` is the durable source-of-truth.
- Curated memory writes (`remember this` / `note that`) go through the `meta-memory-write` skill: dedup check, section targeting, hard caps (`MEMORY.md` 2,500 / `USER.md` 1,375 chars).
- Never index `archive/local-uncommitted-*` directly. Maintenance must sanitize/extract archived imports before promotion into memory, Supabase, or active source paths.
- Do not store secrets, service-role keys, raw PII, or raw customer exports in curated memory.

### Assignment template

```text
Repository worktree: /ABSOLUTE/PATH/TO/<task>-worktree
Branch:              contrib/cleverwork/<short-task-name>
Task:                <describe the exact work, naming the owned subtree>
```

## Imported Claude Cowork project instructions

## Cursor Cloud specific instructions

Scope of this section: durable, non-obvious notes for running the repo in a Cursor Cloud VM. The environment update script already runs `npm --prefix app/command-center install` on startup, so dependencies are installed for you — do not re-add install steps here. Standard commands are documented in [`app/command-center/README.md`](app/command-center/README.md); this section only captures the gotchas.

**Primary runnable product = the Command Center** (`app/command-center`, Astro SSR, Node 22). Everything else in the repo (Deno brain MCP in `server/`, Supabase edge functions, integration bridge scripts, Stormwatch, etc.) is infrastructure/batch and is optional for local dev.

- Standard commands (run in `app/command-center/`): `npm run dev` (dev server, `http://127.0.0.1:4321`), `npm run test` (Vitest — 300+ tests, no DB needed), `npm run build`, `npm run check` (this is just an alias for `astro build`, so it doubles as the type/build gate). There is no ESLint config.
- Env resolution walks **up to the repo-root `.env`** (see `src/lib/runtime-env.ts`), then process env overrides. Local dev keeps `COMMAND_CENTER_AUTH_MODE=disabled` (the default when unset), so WorkOS is not required and every request resolves to the **Local Operator** actor with full permissions. `.env` is gitignored — never commit it.
- **Live data requires `SUPABASE_SERVICE_ROLE_KEY` (plus `SUPABASE_URL`).** All core tables have RLS enabled with **0 policies**, so the anon/publishable keys return zero rows — only the `service_role` key (which bypasses RLS) reads data. The Supabase MCP exposes only anon/publishable keys, so the service-role key must come from the vault/Coolify app env. The Pro Exteriors brain is Supabase project `rnhmvcpsvtqjlffpsayu` (`https://rnhmvcpsvtqjlffpsayu.supabase.co`); it is the shared prod DB — do not run destructive SQL (hard rule 1).
- **Without the service-role key:** most surfaces (`/`, `/agents`, `/operations`, `/sales`, `/marketing`, `/system`, `/abc-price-agreement-gaps`) render clean HTTP 200 pages with graceful empty/"unavailable" states. A few data-dependent detail pages **SSR-crash** on missing data (e.g. `/accounting/invoice-audit`, and `/accounting` + `/executive` which redirect into such pages) with `TypeError: Cannot read properties of undefined (reading 'toLocaleString')`. That is a missing-key symptom, **not a code bug** — it renders fine once the key + live data are present.
- **Vite dev-overlay gotcha:** under `npm run dev`, once any crashing route is rendered — including when Astro's link **prefetch** fetches it in the background from another page — Vite broadcasts its red error overlay to **every** open browser tab, making healthy pages look crashed even though their SSR still returns clean 200s (verify with `curl`). To get a clean browser demo **without** the service-role key, run the production build instead: `npm run build`, then `HOST=127.0.0.1 PORT=4325 node dist/server/entry.mjs` (the `start:web` entrypoint) — the production server has no Vite overlay, so a bad route just 500s silently in the background. With the service-role key set, none of this applies.
