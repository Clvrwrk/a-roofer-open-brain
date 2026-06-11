# Ghost Resource - Disposable Postgres Lab For Agents

Status: active KB v1
Tier: infrastructure/Postgres lab
Primary agents: Innovator, Maintenance, Auditor, Quality Control

Ghost provides a CLI and MCP-accessible workflow for creating, forking, inspecting, querying, and
discarding Postgres databases. For the Open Brain, Ghost is best treated as an agent lab for schema
experiments and restore drills, not as the production database.

## Knowledge Base Map

| File | Purpose |
| --- | --- |
| [README.md](README.md) | Resource overview and current local state. |
| [COMMANDS.md](COMMANDS.md) | Safe Ghost CLI/MCP command cookbook. |
| [LAB-RUNBOOK.md](LAB-RUNBOOK.md) | Create/fork/query/pause/delete workflow for lab DBs. |
| [RESTORE-DRILL.md](RESTORE-DRILL.md) | How to use Ghost for sanitized backup restore drills. |
| [TEST-PLAN.md](TEST-PLAN.md) | Readiness checks before Ghost is considered usable. |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Login, MCP, DB status, and connection failure fixes. |
| [mapping.md](mapping.md) | How Ghost lab events become brain atoms. |
| [metadata.json](metadata.json) | Machine-readable resource metadata and env var inventory. |
| [SOURCES.md](SOURCES.md) | Source links, verification dates, and local tool versions. |

## Current Local State

Observed on 2026-06-10:

| Area | State |
| --- | --- |
| CLI | Ghost `v0.19.0` installed through Homebrew. |
| Auth | GitHub OAuth login active for `chussey@cleverwork.io`. |
| Space | `hz2rr0kc04`. |
| Codex MCP | Installed in user-level Codex config. |
| Lab DB | `pro-exteriors-open-brain-lab`, id `izdj443x7x`, status `running`. |

The lab database connection string includes a password and must stay out of docs, chat, commits, and memory.

## Best Fit For The Brain

| Use case | Fit |
| --- | --- |
| Disposable schema experiments | Strong. Create/fork/discard workflow is designed for agent iteration. |
| Restore drills from sanitized dumps | Strong. Good proving ground outside production. |
| Testing Postgres extensions/indexing | Strong when extension support matches target needs. |
| Long-lived staging with raw PII | Needs separate approval and retention policy. |
| Production Open Brain source of truth | Blocked. Supabase remains production. |

## Recommended Posture

Use Ghost as an experiment runner:

1. Create or fork a lab database.
2. Load sanitized schema/data or a reviewed backup sample.
3. Run migrations, advisors, query plans, or agent-generated SQL.
4. Export findings into docs, migrations, or review packets.
5. Delete the lab database unless a human names a retention reason.

## MCP Value

Ghost's MCP surface can expose database create/fork/list/schema/sql/log operations to agents. That is
useful for controlled experiments because the agent can inspect and mutate a lab database without being
given production Supabase write access.

## Data Rules

Allowed by default:

- Empty schema.
- Synthetic seed data.
- Masked/sampled rows approved for testing.
- Public reference data.

Blocked by default:

- Raw customer PII.
- Raw invoices.
- Live vendor account data.
- Production secrets.

## Decision

Adopt Ghost for experiments and restore drills, with short retention and no default production data.

## Explicit Non-Goals

- Ghost is not the Open Brain source of truth.
- Ghost is not a replacement for Supabase PITR/offsite backups.
- Ghost lab DBs do not hold raw production PII unless a human approves the data class and retention window.
- Ghost destructive operations, especially delete and password reset, require named-target confirmation.
