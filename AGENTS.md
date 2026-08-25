# AGENTS.md — the workforce + parallel-agent discipline

Two kinds of agents run per client brain: **vertical** (client-facing in Slack) and **horizontal** (infrastructure). Full charters live under [`agents/`](agents/). This file is the roster + the worktree discipline for AI agents building/maintaining the repo.

> **Pricing/UOM invariant (Accounting + Ops agents):** every invoice/order vs price-agreement comparison happens in ABC's pricing UOM (`priceQty.uom`, e.g. SQ). Use `abc_invoice_lines.price_per_uom` and `v_item_uom_map`; never compare on the raw `quantity`/`uom`/`unit_price`/`pricePerUnitAmount` fields. See [`docs/46-uom-pricing-normalization.md`](docs/46-uom-pricing-normalization.md) and [`CONVENTIONS.md`](CONVENTIONS.md) §10c.

> **Price-agreement silo invariant (Accounting + Ops agents):** a negotiated price reaches an invoice line only through all four gates — vendor (mig 208), office resolved from the invoice's own branch (mig 217), time (`effective_date` + **item-aware** version supersession — a newer version supersedes an older one only for the items it prices, so an item a shorter new list omits keeps its last known price; agreements remain in effect until the vendor issues a new one, mig 277), and UOM (refuse, never convert). Fuzzy matching is always a fallback; the tie-break picks the lowest price, so simulate before adding or backdating a book into an office that already has one. A price list stays in effect until a **new list supersedes it** — `expiry_date` is documentary, recorded per agreement in `renewal_mode` (`evergreen` default | `expires`, mig 270). Read the audit through **`mv_invoice_audit_line`**, never `v_invoice_audit_line`: the view costs ~8.8s, over the 8s `statement_timeout`, so every PostgREST read of it fails and the surfaces render empty (migs 272–273). **Vendor parity of the audit.** One eval per vendor; they differ **only** where the vendor's process differs. Legitimate differences (docs/81 d13 + open item 1): QXO has no agreements ever ⇒ every line valid as billed; SRS prices off the Level 4 sheet mapped to Richardson TX; PDF/OCR line-sum verification is ABC-only because no PDF source exists for SRS/QXO. Everything else — the four gates, UOM refusal, lowest-price tie-break, fuzzy fallback order, the No-Price `purchases_ytd >= 2` threshold, the credit-memo claim bar — is vendor-agnostic. Never special-case a vendor to make a number look right. Two open defects, do not copy: version supersession is ABC-only (SRS's lateral has no `effective_date` term, so a cheaper *older* sheet would win), and evergreen has two opposite NULL defaults across the arms (latent only — both tables default `'evergreen'`). 
>
> See [`docs/105-price-agreement-silo-rules.md`](docs/105-price-agreement-silo-rules.md) and [`CONVENTIONS.md`](CONVENTIONS.md) §10b.

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

## Long-list disclosure (app-wide UI rule)

Any work surface that can render an unbounded list opens showing **10 rows**, with the rest behind a `Show all N …` control; revealing them keeps the pane **exactly 10 rows tall** so the list scrolls internally and the page does not grow. The pane is the same height collapsed and expanded, so the mouse wheel only ever changes owner as the direct result of a click. Height is measured, never hardcoded; reveal state persists in `localStorage`; filters apply before paging. Full contract — including the sticky-header rules a bounded pane forces — in [`standards/design/v1.md`](standards/design/v1.md) § Long-list disclosure and [`CONVENTIONS.md`](CONVENTIONS.md) §11a.

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

The runnable product in this repo is the **Command Center** — an Astro SSR web app at [`app/command-center`](app/command-center) (Node 22 + npm; there is no root/monorepo `package.json`, so run all commands from inside that directory). Standard commands are already documented in [`app/command-center/README.md`](app/command-center/README.md) and `app/command-center/package.json` scripts — the canonical ones are `npm run dev` (dev server on `http://127.0.0.1:4321`), `npm test` (Vitest), and `npm run build` (also the `check` script). The other Node packages (`deployment/remote/dashboard`, `deployment/remote/orgo/maya-slack-listener`) are legacy/ancillary and are not part of the core dev loop. The `server/` MCP and Supabase Edge Functions are Deno, and most `integrations/bridges/*` are on-demand scripts — none are needed just to run/test the web app.

Non-obvious caveats for running here:
- **The app boots with zero secrets in a degraded/unconfigured mode.** SSR routes still render, but data-backed areas show empty states / a yellow "Live data issue: SUPABASE_URL … SUPABASE_SERVICE_ROLE_KEY" banner. To see real data, provide a repo-root `.env` (copy `config/.env.example`) with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; env is resolved from `process.env` first, then by walking up from the app dir to find `.env`/`.env.local`. The only configured Supabase is **shared production** — respect the repo's read-only / no-destructive-write discipline; do not write dashboard decisions against it from a dev session.
- **Degraded-mode dev gotcha:** without Supabase, `/accounting` (which 302-redirects to `/accounting/invoice-audit`) throws during SSR, and `AppShell` background-prefetches that route, so Vite's dev error overlay can pop over *any* page under `npm run dev`. This is a code-level degraded-path issue, not an environment problem — it disappears once Supabase env is set, and it does not occur in the production build. For a clean, DB-less visual check, run the built app: `npm run build` then `npm run preview` (e.g. `-- --port 4325`), which has no Vite HMR overlay.
- Git hooks are **opt-in**: `bash scripts/setup-githooks.sh` points `core.hooksPath` at `.githooks/` (a pre-commit app-version bump). They are not active until you run that; skip a bump with `SKIP_VERSION_BUMP=1` or `[skip version]` in the message.
- **Getting the service-role key in a Cursor Cloud run:** `SUPABASE_SERVICE_ROLE_KEY` is provided two ways — (1) as an injected Cursor secret (drop it into the repo-root `.env` and dashboards populate), or (2) fetch it from 1Password using the injected `sa_cw_grok_orchestrator` service-account token, e.g. `OP_SERVICE_ACCOUNT_TOKEN=$sa_cw_grok_orchestrator op ...` (install the `op` CLI first — it is not preinstalled). Note the Supabase MCP only exposes anon/publishable keys, and every core table has RLS enabled with **0 policies**, so anon/publishable keys return zero rows — only the `service_role` key populates the dashboards.
