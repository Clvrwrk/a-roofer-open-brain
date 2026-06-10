# Supabase Infrastructure Resource - Source Of Truth, Migrations, Backups, And Branching

Status: active/draft  
Tier: infrastructure source of truth  
Primary agents: Executive, Maintenance, Auditor, Quality Control, Conductor

This resource captures the operating contract for the Pro Exteriors Supabase environment. It is not a
business-data bridge like ABC Supply or AccuLynx. It is the infrastructure resource that governs how
agents read, test, migrate, back up, branch, restore, and audit the live Open Brain database.

Source docs:

- Backups: https://supabase.com/docs/guides/platform/backups
- Branching: https://supabase.com/docs/guides/deployment/branching
- CLI reference: https://supabase.com/docs/reference/cli
- Management API: https://supabase.com/docs/reference/api/introduction
- Local operating model: [docs/36-supabase-infrastructure-ops.md](../../../docs/36-supabase-infrastructure-ops.md)

## Current Production Project

| Field | Value |
| --- | --- |
| Supabase org | `vgkhqxkqkmpbpiwwxtec` |
| Project ref | `rnhmvcpsvtqjlffpsayu` |
| Project name | `Pro Exteriors LLC - Agent Workforce` |
| Region | `us-west-1` |
| Production role | Live Open Brain source of truth |

Do not store credentials in this folder. Only project identifiers, documentation, env var names, and
operating rules belong in git.

## Access Channels

| Channel | Use | Secret Handling |
| --- | --- | --- |
| Supabase CLI | Project listing, branch management, migration workflow, advisors, dumps. | Auth token and DB password live in 1Password/Dashlane and local `.env` only. |
| Supabase MCP | Agent-readable project inspection and SQL tooling when available. | Project-scoped OAuth/MCP config lives in Codex user config. |
| REST API / server client | Application reads/writes through Command Center and server runtimes. | Service-role key is server-side only; anon key may be browser-facing only when intended. |
| Direct Postgres connection | Migrations, dumps, restore drills, advanced audit queries. | Use vault-backed env injection; do not pass raw passwords in chat or committed commands. |

## Production Change Gate

Agents may inspect and plan freely. Production writes are gated:

1. Run `node scripts/supabase-preflight.mjs --target prod --backup-proof <id-or-manifest>`.
2. Apply the migration against a non-production target first.
3. Run Supabase advisors/security checks.
4. Run Command Center smoke tests.
5. Ask for explicit approval if the change is destructive.

Destructive means any operation that can remove data, reduce access protection, overwrite production,
rotate live credentials, or materially change source-of-truth semantics.

## Backup Posture

The recommended stack is:

1. Supabase PITR for the production project.
2. Daily encrypted logical dumps to offsite storage.
3. Separate backup path for Supabase Storage objects.
4. Weekly restore drill into a non-production target.
5. Preview branches for schema testing, not for long-term backup.

## Branching Posture

Supabase preview branches are for isolated schema and runtime testing. New branches are data-less by
default, so seed only masked/minimal data unless a human approves a dataful test target. Every branch
should have a purpose, owner, and delete date.

## Objects Governed

| Object | Brain governance note |
| --- | --- |
| Supabase project | Production/source-of-truth boundary. |
| Migration file | Reviewed change artifact; must live in git. |
| Branch | Temporary preview/test environment. |
| Backup | Recovery artifact with manifest and retention. |
| Restore drill | Evidence atom proving recoverability. |
| Advisor result | Auditor input before production change. |
| Secret | Vault item only; never committed or memory-stored. |

## Known Setup Gaps

- Rotate any secret that was pasted into chat before relying on it for durable production access.
- Install and authenticate 1Password and Dashlane CLIs if vault-backed automation is desired.
- Link this checkout to the Supabase project through the vault-backed DB password path.
- Confirm production plan/PITR status in the Supabase dashboard before declaring backup coverage complete.
