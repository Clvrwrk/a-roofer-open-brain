# Supabase Infrastructure Commands

Status: active KB v1
Last verified: 2026-06-10 with Supabase CLI `2.105.0`

Use this cookbook for safe inspection and repeatable operations. Do not paste secrets into commands in chat or committed docs.

## Identity And Project Discovery

```bash
supabase --version
supabase projects list --output json
supabase orgs list --output json
codex mcp get supabase
codex mcp list
```

Expected local state:

- CLI is authenticated enough to list projects.
- Codex has a `supabase` MCP entry pointing at the Pro Exteriors project ref.
- The repo may still be unlinked until the DB password is supplied through a vault-backed path.

## Link A Checkout Safely

Preferred pattern after 1Password/Dashlane CLI is available:

```bash
# Example shape only. Do not paste real passwords into shell history.
op run --env-file .env -- supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"
```

Manual fallback:

```bash
supabase link --project-ref rnhmvcpsvtqjlffpsayu
```

Enter the DB password interactively from the vault. Do not put the password in chat or in a tracked file.

## Read-Only Checks

```bash
node scripts/supabase-preflight.mjs --target branch
supabase db advisors
supabase db query "select now();"
supabase migration list --linked
```

If `supabase db query` is unavailable or blocked, use Supabase MCP SQL tooling or `psql` with a vault-injected connection string.

## Branch Management

```bash
supabase branches list --project-ref rnhmvcpsvtqjlffpsayu
supabase branches create <branch-name> --project-ref rnhmvcpsvtqjlffpsayu
supabase branches get <branch-id> --project-ref rnhmvcpsvtqjlffpsayu
supabase branches pause <branch-id> --project-ref rnhmvcpsvtqjlffpsayu
supabase branches unpause <branch-id> --project-ref rnhmvcpsvtqjlffpsayu
supabase branches delete <branch-id> --project-ref rnhmvcpsvtqjlffpsayu
```

Branch rules:

- Preview branches are test environments, not durable backups.
- New branches start without production data unless seed/data restore is explicitly configured.
- Every branch gets purpose, owner, and delete date.

## Migration Workflow Commands

```bash
supabase migration new <descriptive_name>
supabase db reset
supabase db diff --local
supabase db lint
supabase db advisors
supabase migration list --local
supabase db push
```

Production push is allowed only after `MIGRATION-RUNBOOK.md` gates pass.

## Logical Dump Commands

Use logical dumps as an offsite recovery artifact, not as the only backup layer.

```bash
supabase db dump --linked --file /secure/offsite/staging/schema.sql
supabase db dump --linked --data-only --file /secure/offsite/staging/data.sql
```

When PITR is enabled, Supabase may use physical backups for restore. Logical dumps remain valuable because they are portable, reviewable recovery artifacts outside the platform restore UI.

## Management API Backup Shape

Use only with vault-backed `SUPABASE_ACCESS_TOKEN`.

```bash
curl -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/backups"
```

PITR restore is destructive to the target project. Do not run restore commands without exact approval.

## Secret Rotation Inventory

Record names only:

```bash
SUPABASE_URL
SUPABASE_PROJECT_REF
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY
SUPABASE_DB_PASSWORD
SUPABASE_DB_URL
SUPABASE_ACCESS_TOKEN
SUPABASE_MCP_URL
BACKUP_ENCRYPTION_KEY
BACKUP_STORAGE_BUCKET
```

Never print values in logs or final answers.
