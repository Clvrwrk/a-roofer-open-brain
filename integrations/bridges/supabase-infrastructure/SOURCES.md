# Supabase Infrastructure Sources

Status: active KB v1
Last verified: 2026-06-10

## Official Sources

| Topic | URL | Notes |
| --- | --- | --- |
| Database backups | https://supabase.com/docs/guides/platform/backups | Daily backups, PITR, restore, Management API shape, Storage object caveat. |
| Branching | https://supabase.com/docs/guides/deployment/branching | Preview branches, persistent branches, data-less behavior, deployment workflow. |
| CLI reference | https://supabase.com/docs/reference/cli/introduction | Command inventory for db, migrations, branches, projects, and secrets. |
| Changelog | https://supabase.com/changelog | 2026 Data API explicit-grant change and RLS tester note. |
| Management API | https://supabase.com/docs/reference/api/introduction | Programmatic project and backup management. |

## Local Verification

| Tool | Observed |
| --- | --- |
| Supabase CLI | `2.105.0` |
| `supabase db --help` | Includes `diff`, `dump`, `push`, `pull`, `reset`, `lint`, `start`, `query`, `advisors`, `schema`. |
| `supabase branches --help` | Includes `list`, `create`, `get`, `update`, `pause`, `unpause`, `delete`. |
| Codex MCP | `supabase` entry configured for project ref `rnhmvcpsvtqjlffpsayu`. |

## KB Decisions

- Supabase remains the production source of truth.
- PITR plus offsite encrypted logical dumps is the recommended recovery stack.
- Branching is for preview/test, not the daily clone/backup strategy.
- Every production destructive action requires backup proof and exact approval.
- New exposed public tables must include explicit grants, RLS, and policies in the same migration.
