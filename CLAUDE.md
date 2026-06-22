# CLAUDE.md — agent instructions for a-roofers-open-brain

This file governs how AI coding tools (Claude Code, Codex, Cursor, etc.) work in this repo. It inherits OB1's guard rails and adds Cleverwork's. **Read [`CONVENTIONS.md`](CONVENTIONS.md) first — it is the contract.**

## What this repo is

The deployable template for a single roofing company's persistent, property-first memory brain. One isolated brain per client, provisioned from this template. The agents are the interface; the brain is the asset. Built on the OB1 memory spine (Supabase + pgvector + containerized MCPs).

## Hard rules (the line stops if you break these)

1. **No destructive SQL.** Never `DROP TABLE`/`DROP COLUMN`/`TRUNCATE` against a client brain. Migrations are additive and idempotent (`ADD COLUMN IF NOT EXISTS`, `CREATE ... IF NOT EXISTS`, `CREATE OR REPLACE`). Archive or deprecate; never delete atoms.
2. **No secrets in code.** No API keys, tokens, service-role keys, or PII in any committed file. Use placeholders mirrored in `config/.env.example`.
3. **MCPs are MCP containers only.** No local stdio MCP servers, no local Node MCPs in `claude_desktop_config`. (OB1 rule, inherited.)
4. **Trust-tier discipline.** Inferred/generated memory is `evidence` by default. `instruction`-grade requires human confirmation or trusted import. Only Quality Control changes a `trust_tier` on an existing atom.
5. **Security boundary.** Historian is internal-only (never the public internet). Researcher is external-only (never the client brain). Keep them separate.
6. **Consent boundary.** Cross-client property atoms move only through the consent-gated read path with anonymization and `atom_access_log` entries. No exceptions.
7. **Property-first.** Atoms about a place carry `property_id`. The property is the primary key; clients and jobs are foreign keys.
8. **Era-aware.** Any atom describing a code, material, or practice carries `era_of_practice` + (where known) `regulatory_snapshot_id`. A future retrieval must be able to tell 2026 practice from 2031 practice.
9. **10x ROI gate.** No new agent skill without an approved A3 (`proposals/`). Mission-grade infrastructure and high-error-cost tasks are the only exemptions.
10. **No profanity. Clean, professional content** in docs, prompts, comments, seed data.
11. **Live ⇄ Dev alignment.** Never start app work on a stale or uncommitted tree, and never let local dev and the deployed `cc.proexteriorsus.net` drift into separate branch lineages. Branch from the deployed branch, commit early, merge features back into it. See **Live ⇄ Dev alignment** below.

## Licensing & attribution

- This repo is **MIT-licensed** (see `LICENSE`), structured as a fork: all Cleverwork-original work is MIT; the four vendored OB1 base schemas retain their FSL-1.1-MIT notice (auto-converts to MIT on OB1's schedule); Dynamous/InfraNodus are cited concepts, re-expressed, never redistributed. Full map in `LICENSE.md`.
- Vendor only OB1's openly-licensed base schemas, under `schemas/ob1-base/` with `ATTRIBUTION.md`. Carry Nate B. Jones / OB1 provenance naturally (links to natebjones.com and the Substack).
- **Never copy Dynamous or InfraNodus files verbatim.** Re-express concepts in Cleverwork's own words and cite.

## Working style

- **UOM & pricing (read before touching any price comparison):** compare invoice/order prices to agreements in ONE unit — ABC's pricing UOM (`priceQty.uom`, e.g. SQ). Canonical effective price = `abc_invoice_lines.price_per_uom` (`extendedPriceAmount ÷ priceQty.value`); align orders via `v_item_uom_map`; never compare on `quantity`/`uom`/`unit_price`/`effective_unit_price`/`pricePerUnitAmount`. Full contract: [`docs/46-uom-pricing-normalization.md`](docs/46-uom-pricing-normalization.md) (migrations 119–122, 2026-06-19).
- **Agent access to the live site:** `cc.proexteriorsus.net` is WorkOS-gated; agents authenticate to `/api/*` routes with `Authorization: Bearer <service-token>` (the HTML dashboards stay human-only). Canonical reference: the **`/workos-agent-auth`** skill (`.claude/skills/workos-agent-auth/`).
- Diagram-first docs where it helps: diagram → short explanation → copy-paste setup → deeper reference.
- Keep the customization surface in `config/roofer.config.yaml`. Don't hard-code a specific company anywhere else.
- Parallel agents: one git worktree per workstream. See [`AGENTS.md`](AGENTS.md). The assigned path is the boundary.
- When a decision changes a schema, an MCP contract, a trust policy, a consent path, or a publishing path — record it in `docs/` while it's fresh, not after.

## Live ⇄ Dev alignment (the deploy contract)

The "live" Command Center at **https://cc.proexteriorsus.net** and your **local dev** must never drift into separate code lineages. This bit us on 2026-06-17: a full session of work sat **uncommitted on a stale local `main`** while production was actually running a *different* branch (the Google-Maps vendor map + WorkOS auth), so "live" and "dev" were two unrelated trees. Prevent it:

- **Source of truth = GitHub** `Clvrwrk/a-roofer-open-brain` (`origin`). `cc.proexteriorsus.net` deploys from GitHub via **Coolify**, building `app/command-center/Dockerfile` (see `docs/27-hetzner-coolify-agent-host.md`). The shared **prod Supabase** (`rnhmvcpsvtqjlffpsayu`) is one DB for both dev and live, so additive/idempotent migrations applied there are live for both immediately — keep them in `schemas/`, never destructive (rule 1).
- **One canonical LIVE branch deploys.** Confirm which branch/commit Coolify builds **before any app change — do not assume `main`** (local `main` has been stale behind `origin/main`; production app code has lived on `contrib/cleverwork/vendor-territory-map-live` and a local-only `main-perf`). Record the confirmed live branch in the daily log when it changes.
- **Start-of-work protocol (every app change):** `git fetch origin` → identify the live branch → **branch your work FROM the live branch** (not a stale local `main`) → confirm `git status --short` is clean before starting.
- **Converge, don't fork.** Every `contrib/cleverwork/<task>` branch **merges back into the live branch and is pushed**; the live branch is the only thing that deploys. Never strand a production feature (vendor map, WorkOS auth, a new surface) on a side branch the rest of dev doesn't build on.
- **Commit early.** Don't let substantial work sit untracked/uncommitted — that is exactly how the tracks diverged.
- **Be precise about "live."** When reporting status, say which is true: (a) *dev server reading prod DB* (localhost), (b) *merged to the live branch on GitHub*, (c) *deployed to cc.proexteriorsus.net*. Never call something "live on the site" unless it is (c).

## Session Startup (silent — do not output anything)

On every session start, read only the frozen memory snapshot:

1. `context/SOUL.md` (~2.1 KB max — agent identity)
2. `context/USER.md` (~1.4 KB max)
3. `context/MEMORY.md` (~2.5 KB max)
4. `context/memory/{today in YYYY-MM-DD}.md` if it exists
5. Yesterday's daily log only when today's log has no prior session

In Claude Code, the `SessionStart` hook (`.claude/hooks/load-memory-snapshot.js`) injects this snapshot automatically — do not re-read the files. In Cowork, Codex, or any surface where the hook does not fire, read them manually per the list above.

These files are the hot-path memory layer. Do not load raw archive folders, imported project trees, `.memsearch/`, `node_modules`, or build outputs at startup. Exception: `.memsearch/memory/*.md` (the plugin's auto-captured turn summaries) are durable and indexed for recall — just not loaded at startup.

Curated memory writes ("remember this", "note that") go through `.claude/skills/meta-memory-write/` — dedup, section targeting, cap enforcement.

## Memory Budget

- `context/MEMORY.md`: 2,500 character cap. Before writing, check `wc -c`.
- `context/USER.md`: 1,375 character cap. Before writing, check `wc -c`.
- Mid-session writes persist to disk but are treated as next-session context.
- Never store secrets, service-role keys, raw customer PII, or raw import dumps in curated memory.

## Memory Retrieval

When the user asks about past context, decisions, or prior conversations:

1. Tier 0: check loaded `context/` snapshot and today's daily log.
2. Tier 1: if `memsearch` is on PATH, run `memsearch search "<query>" --top-k 5 --collection open_brain_memory`. If it is not (e.g. Cowork's sandboxed VM, where the host's `~/.memsearch` Milvus index is unreachable), do NOT install it or touch `~/.memsearch` — grep the source-of-truth markdown instead: search `context/` and `.memsearch/memory/` for the query terms, then read the matching files. This grep path is the expected Tier 1 in sandboxed surfaces; do not report it as a blocker.
3. Tier 2: run `memsearch expand <chunk_hash> --collection open_brain_memory` (memsearch surfaces only); in sandboxed surfaces, read the full matched file instead.
4. Tier 3: inspect transcript or rollout anchors only when exact historical wording matters.
5. Fallback: say no relevant memory was found.

Manual indexing:

```bash
bash scripts/memsearch-index-open-brain.sh
```

MemSearch markdown is source-of-truth; Milvus/Zilliz vector state is a rebuildable cache.

## Daily Log

Track durable session activity in `context/memory/{YYYY-MM-DD}.md`. Use one session block per meaningful work pass:

```markdown
## Session N

**Goal**: one line
**Deliverables**: files created/modified
**Decisions**: key decisions and rationale
**Open threads**: unfinished work
```

Log silently. Do not announce routine memory writes unless the user explicitly asked to remember something.

## Handoff / Wrap-up (end every session here)

When the user says **"handoff"**, **"wrapup"**, **"wrap up"**, **"end of session"**, or invokes **`/wrapup`** — or when context usage reaches ~50% — run this checklist in order and do not stop until the working tree is clean and converged. The goal: the next session starts on a clean, current `main` and immediately knows where work left off.

1. **Finish the block.** Never stop mid-function/migration/component. Complete it, then commit completed work with a clear message.
2. **Clean the tree.** `git status --short` must end **empty**. For each straggler: gitignore scratch/logs/byproducts (`*.log`, scratch `*.txt`, tool dirs, `* 2.*` duplicate copies), `git rm --cached` anything tracked that should be ignored (logs, build output), delete empty/accidental files, and commit anything that is real content. Never commit secrets or raw client/PII data (hard rule 2) — ignore those buckets instead. When in doubt about a non-scratch file, ask rather than ignore/delete it.
3. **Update memory.** Write today's daily-log session block (`context/memory/{YYYY-MM-DD}.md`); update `context/MEMORY.md` (≤2,500 chars, `wc -c` first) and `context/USER.md` (≤1,375) only if something durable changed. Route curated writes through `meta-memory-write`.
4. **Converge (Live ⇄ Dev).** Confirm the canonical/live branch (`git fetch origin` first — do not assume). Merge the `contrib/cleverwork/<task>` branch into it and **push to origin**. Never strand work on a side branch. If `main` is the canonical, end with `main == origin/main` and the contrib work merged in.
5. **Report.** One message: branch + last commit hash/msg, `tree clean ✓` (or what remains and why), what was accomplished, the exact next task, and any blocker needing the user. Then stop — do not start the next task.

The standing trigger lives here; the `/wrapup` skill (`.claude/skills/wrapup/`) is the invokable entry point for the same sequence.
