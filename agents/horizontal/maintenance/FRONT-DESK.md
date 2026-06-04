# Maintenance Front Desk

Hermes is the front receptionist for the repo: every agent should be able to ask "where does this live?" without reading the whole building directory. This file defines the intake, naming, sorting, and move protocol for the messy app-transition period.

## Principles

- **The canonical checkout is not a dumping ground.** Raw copied projects land in a holding lane, get inventoried, then move only from a reviewed manifest.
- **No silent deletes.** Duplicates, obsolete files, and generated artifacts are archived, ignored, or proposed for removal. Maintenance does not hard-delete.
- **Provenance follows the file.** Any moved artifact keeps its original path, source project, import date, and reason in the move manifest or folder README.
- **Orient before searching.** Agents read `WORKSPACE-MAP.md`, `README.md`, `CONVENTIONS.md`, and the relevant folder README before broad search.
- **GSD phases own implementation work.** Workspace organization prepares the building; app/product work moves through the GSD Discuss -> Plan -> Execute -> Verify -> Ship loop.

## Target Topology

| Path | Status | Purpose |
| --- | --- | --- |
| `app/command-center/` | planned | Future production Astro SSR front end and UI islands. The current prototype remains in `deployment/remote/dashboard/` until migrated. |
| `agents/` | active | Agent charters, IO contracts, and operating docs. |
| `config/` | active | Client-editable configuration and brand tokens. No secrets. |
| `data/` | planned | Sanitized seed/reference data only. Raw client spreadsheets, invoices, and exports stay out of git. |
| `deployment/` | active | Local and remote runtime/deploy wiring. |
| `docs/` | active | Product, architecture, operating model, onboarding, and transition docs. |
| `integrations/bridges/` | active | Integration adapters and mapping contracts. |
| `imports/` | local ignored | Raw copied project/file intake. Gitignored. Curated outputs move elsewhere after review. |
| `private/` | local ignored | Client-private or sensitive working files. Gitignored. |
| `proposals/` | active | A3s, go-live cases, and governance proposals. |
| `recipes/` | active | Repeatable business workflows. |
| `schemas/` | active | SQL migrations and schema documentation. |
| `scripts/` | active | Repo automation and hygiene tooling. |
| `server/` | active | MCP/server runtime code. |
| `skills/` | active | Agent skills and skill metadata. |
| `standards/` | active | QC-owned standards and design contract. |

## Classification Lanes

| Lane | Examples | Default action |
| --- | --- | --- |
| Product app code | command center UI, dashboard endpoints, auth, agent monitoring | Route to `app/command-center/` when the Astro migration phase begins. |
| Runtime/deploy code | Coolify, Docker, health checks, Slack manifests | Route to `deployment/`. |
| Brain/schema work | Supabase migrations, SQL, RPCs, data contracts | Route to `schemas/` or `integrations/bridges/`. |
| Agent work | charters, IO contracts, prompts, task rules | Route to `agents/`, `skills/`, or `recipes/`. |
| Product docs | PRDs, topology, UX specs, decisions | Route to `docs/` with numbered, kebab-case names. |
| Raw client files | invoices, spreadsheets, exports, screenshots, private docs | Keep in `private/` or off-repo storage; commit only sanitized extracts. |
| Third-party references | cloned repos, external specs, vendor docs | Keep in `imports/` until licensing/provenance is reviewed; vendor only when allowed. |
| Generated artifacts | build output, caches, logs, zips | Ignore, archive, or regenerate. Do not treat as source of truth. |

## Naming Rules

- Folders and source files use `kebab-case`, one concept per folder.
- Docs use numbered kebab-case when they are part of the core reading path, e.g. `22-gsd-app-transition-roadmap.md`.
- Dates use ISO format: `YYYY-MM-DD-topic.md`.
- Raw imported folders may keep their original names inside `imports/`, but curated destinations must follow repo naming.
- Every moved folder gets or keeps a `README.md` explaining purpose, owner, source, and update cadence.

## Move Manifest

Maintenance proposes moves in a tab-separated manifest before changing paths:

```text
from	to	lane	reason	owner	status
Pro Exteriors Website	deployment/remote/dashboard-source-import	product app code	contains dashboard/source material for later Astro migration	Maintenance	proposed
```

Allowed statuses: `proposed`, `approved`, `moved`, `blocked`, `archived`.

## Move Protocol

1. Run inventory: `node scripts/maintenance-frontdesk.mjs --root /path/to/repo --format markdown`.
2. Label each candidate with a classification lane.
3. Create or update a move manifest with source, destination, owner, and reason.
4. Human or QC reviews the manifest.
5. Validate approved rows: `node scripts/maintenance-frontdesk.mjs --root /path/to/repo --manifest move-manifest.tsv`.
6. Execute approved moves in a task worktree only when ready: `node scripts/maintenance-frontdesk.mjs --root /path/to/repo --manifest move-manifest.tsv --apply --ack-reviewed`.
7. Use `--allow-nested-git` only when the reviewer explicitly approves moving a nested Git repo.
8. Prefer `git mv` for already-tracked curated source when preserving Git rename detection matters.
9. Update `WORKSPACE-MAP.md` and affected folder READMEs.
10. Run `git status --short` and stage only files belonging to the task.

## Current Import Snapshot

As of 2026-06-04, the canonical checkout has raw/untracked import folders at the repo root:

| Folder | Initial classification | Notes |
| --- | --- | --- |
| `Global Skills | Plug-ins/` | third-party/plugin intake | Non-kebab name; review licensing and decide whether plugin artifacts belong under `skills/` or `integrations/`. |
| `Google Design MD/` | third-party/reference intake | Nested Git repo; do not flatten without attribution and license review. |
| `Pro Exteriors Website/` | product app/source intake | Nested Git repo and large app assets; source for later Command Center migration, not a direct move today. |
| `ProExteriors - Pricing/` | raw client/data intake | Likely contains sensitive pricing/invoice artifacts; keep out of git unless sanitized. |
| `Property Enrichment/` | product/data/research intake | Mixed app prototypes, property strategy docs, spreadsheets, and generated files; split by manifest only. |

## Cron Cadence

Workspace front desk jobs run alongside the existing 5S cadence:

| Job | Schedule | Mode | Output |
| --- | --- | --- | --- |
| Import inventory | Daily 00:30 local | dry-run | Markdown/JSON inventory for Conductor digest. |
| README coverage check | Weekly Sunday 02:30 local | dry-run | Missing README list. |
| Naming conformance check | Weekly Sunday 02:45 local | dry-run | Non-kebab and nested-repo flags. |
| Workspace map refresh | After approved moves or GSD ship | write after approval | Updated `WORKSPACE-MAP.md`. |
| Move manifest review | Weekly or on demand | human/QC gate | Approved/blocked manifest rows. |

No cron job moves files without an approved manifest.
