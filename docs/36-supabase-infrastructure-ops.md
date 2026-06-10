# Supabase Infrastructure Operations

Status: draft v0.1  
Last verified: 2026-06-10  
Related: [29-connection-and-access-checklist.md](29-connection-and-access-checklist.md), [24-supabase-product-surface-integration.md](24-supabase-product-surface-integration.md), [26-open-brain-memory-system.md](26-open-brain-memory-system.md), [integrations/bridges/supabase-infrastructure](../integrations/bridges/supabase-infrastructure/README.md)

This is the operating model for giving agents durable Supabase access without turning production into a lab.

## North Star

Supabase remains the single source of truth for the live Open Brain.

The agent may have full read access and migration tooling access across approved projects, but any production action that can destroy, overwrite, expose, or materially reshape data requires:

1. A named target project and environment.
2. A preflight backup or clone proof.
3. A migration or SQL plan.
4. A rollback path.
5. Explicit approval for that exact destructive production action.

No secrets, service-role keys, raw connection strings, or raw PII should be copied into chat, docs, commits, memory, screenshots, or pull-request descriptions.

## Current Access State

Observed locally on 2026-06-10:

| Area | State |
| --- | --- |
| Supabase CLI | Installed and authenticated at the org/project-list level. |
| Pro Exteriors project | Project ref `rnhmvcpsvtqjlffpsayu`, project name `Pro Exteriors LLC - Agent Workforce`. |
| Supabase MCP | User-level Codex MCP entry exists for the Pro Exteriors project. |
| Repo link | The checkout is not durably linked because linking needs the database password entered through a safe path. |
| Secret managers | 1Password CLI and Dashlane CLI were not present in this shell at verification time. |

Action: install/authenticate the 1Password and Dashlane CLIs, mirror the same named Supabase items in both vaults, then run the Supabase link step through the vault rather than by pasting credentials into chat.

## Permission Model

| Capability | Default Permission | Gate |
| --- | --- | --- |
| List projects, inspect config, read schema, run read-only SQL | Allowed | Use CLI/MCP/API; do not print sensitive row data. |
| Create local migrations, run local tests, inspect advisors | Allowed | Keep migrations in git; no direct production change. |
| Create Supabase preview branches or Ghost lab DBs | Allowed when non-production | Name purpose and retention date. |
| Apply additive migration to production | Allowed after preflight | Backup proof, advisor pass/review, explicit target confirmation. |
| Drop, truncate, delete, overwrite, disable RLS, rotate live credentials, restore over production | Blocked by default | Preflight backup/clone proof plus explicit human approval for that exact action. |

Approval phrase to require for destructive production actions:

```text
Approved for production destructive action: <exact action> on <project-ref> after backup <backup-id-or-proof>.
```

## Secret Manager Contract

Use the same item names in 1Password and Dashlane so either vault can recover the operating state.

| Vault Item | Fields |
| --- | --- |
| `Supabase - Pro Exteriors - Agent Workforce` | project ref, dashboard URL, Supabase URL, anon key, service-role key, database password, direct connection string, pooler connection string, management access token if issued. |
| `Supabase - Codex MCP` | MCP URL, OAuth/client setup notes, project ref, last login date. |
| `Supabase - Backup Storage` | bucket/provider, access key id, secret access key, endpoint, encryption key reference, retention policy. |
| `Ghost - Agent DB Lab` | API key, default space, billing/limits note, approved data classes. |
| `Dolt - Data Version Lab` | DoltHub/DoltLab credentials or remote URL, allowed datasets, blocked datasets. |

Vault rules:

- Store real secrets only in vaults, repo-root `.env`, or production runtime env.
- Commit only variable names and placeholders in `config/.env.example`.
- Rotate any secret that was pasted into chat before using it as durable production access.

## Backup And Clone Strategy

The first recommendation is: **enable Supabase PITR for production, then add daily encrypted logical dumps to offsite storage and a weekly restore drill.**

Why this is the default:

- Supabase daily backups are automatic on paid projects, but retention depends on plan and project deletion also deletes project backups.
- Supabase backup docs note that database backups do not include Storage API objects, so Storage needs its own backup path.
- Supabase branching is excellent for isolated preview environments, but branches are data-less by default and should not be treated as a full daily production clone.
- Logical dumps give us a second recovery path outside the Supabase backup UI and create artifacts we can restore into staging, Ghost, or another Postgres target for drills.

Daily baseline:

1. Verify Supabase project health and backup/PITR status.
2. Run a logical schema/data dump for approved schemas.
3. Export Storage objects through a separate object backup when Storage holds business artifacts.
4. Encrypt and upload the dump manifest and artifacts to offsite storage.
5. Export curated memory sources and critical brain tables.
6. Run a smoke query against the live database and the latest dump manifest.
7. Post a short Conductor digest: pass/fail, dump id, size, row-count samples, restore-drill age.

Weekly baseline:

1. Restore the latest backup into a non-production target.
2. Run `supabase db advisors` or equivalent schema/security checks against the target.
3. Run Command Center smoke tests against the restored target.
4. Record restore duration and any drift.
5. Prune old branches/lab databases according to retention rules.

Retention starting point:

| Artifact | Suggested Retention |
| --- | --- |
| Supabase PITR | Highest paid tier that is financially sensible for production. |
| Daily encrypted logical dump | 30 daily, 12 weekly, 12 monthly. |
| Ghost lab DBs | Delete after experiment unless retained by named approval. |
| Supabase preview branches | Delete after merge or after 7 days of inactivity. |
| Memory markdown backups | Keep with repo plus offsite daily dump. |

## Supabase Branching

Use Supabase branching for schema and edge-function preview work.

Rules:

- Branches are not the production backup strategy.
- New branches are data-less by default; seed only masked/minimal data unless a human approves a dataful restore target.
- Every branch gets a purpose, owner, and delete date.
- Merge only migration files that have been tested and reviewed.
- Never disable RLS, grant broad public access, or change production secrets in a preview branch and assume it is harmless.

## Ghost Evaluation

Ghost is useful as a disposable Postgres lab for agents.

Good uses:

- Create/fork/discard databases for schema experiments.
- Run restore drills from sanitized dumps.
- Test PostGIS, pgvector, TimescaleDB, or indexing ideas away from production.
- Give agents MCP-accessible SQL tooling without granting production write access.

Do not use Ghost as:

- The system of record for the Open Brain.
- A place for raw production PII unless legal/security review approves the data class.
- A backup substitute for Supabase PITR plus encrypted offsite dumps.

Decision: adopt Ghost for experiments and restore drills after CLI/API access is installed, with a default "delete after test" posture.

## Dolt Evaluation

Dolt is a version-controlled SQL database with Git-like branching, commits, diffs, push, and pull, using a MySQL-compatible interface.

Good uses:

- Version curated, non-sensitive reference datasets.
- Review catalog or taxonomy changes through data diffs.
- Prototype "data pull request" workflows for product mappings, vendor catalogs, or jurisdiction reference tables.

Do not use Dolt as:

- A replacement for Supabase/Postgres.
- The production Open Brain datastore.
- A mirror of raw customer, pricing, or invoice data without a separate security review.

Decision: keep Dolt as an optional data-diff lab for selected reference datasets. Supabase remains the live database.

## Preflight Before Any Supabase Change

Run:

```bash
node scripts/supabase-preflight.mjs --target branch
```

For production:

```bash
node scripts/supabase-preflight.mjs --target prod --backup-proof <backup-id-or-manifest>
```

Minimum preflight checklist:

1. Confirm project ref and environment.
2. Confirm branch/worktree path and git status.
3. Scan tracked files for secret-shaped strings.
4. Confirm Supabase CLI and MCP access.
5. Confirm backup/clone proof for production.
6. Inspect changed migrations and SQL for destructive operations.
7. Run migration on a branch, local DB, Ghost lab DB, or restored staging target first.
8. Run advisors/security checks.
9. Run app smoke tests.
10. Ask for explicit approval if the production action is destructive.

## Daily Memory Safety

To make sure memory is never lost:

- Keep curated memory in `context/USER.md`, `context/MEMORY.md`, and `context/memory/YYYY-MM-DD.md`.
- Keep transcript summaries in `.memsearch/memory/` and rebuild vector indexes from markdown when needed.
- Include curated memory and critical Supabase memory tables in the daily offsite dump manifest.
- Run a weekly restore/readback check that proves the latest memory backup can be searched or inspected.
- Never store secrets in curated memory or MemSearch.

## Source Links

- Supabase backups: https://supabase.com/docs/guides/platform/backups
- Supabase branching: https://supabase.com/docs/guides/deployment/branching
- Dolt introduction: https://www.dolthub.com/docs/introduction/what-is-dolt/
- Ghost documentation: https://ghost.build/docs/#introduction
