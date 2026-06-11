# Supabase Infrastructure Test Plan

Status: active KB v1

## Smoke Test

Run:

```bash
node scripts/supabase-preflight.mjs --target branch
```

Expected:

- Repo root detected.
- `supabase/config.toml` present.
- Env contract present.
- No obvious Supabase secrets in tracked files.
- Non-production target clears without backup proof.

## Production Gate Test

Run:

```bash
node scripts/supabase-preflight.mjs --target prod
```

Expected:

- Fails because backup proof is missing.

Then run:

```bash
node scripts/supabase-preflight.mjs --target prod --backup-proof smoke-test
```

Expected:

- Clears if no other failures exist.
- Warnings are acceptable for dirty worktree or unlinked checkout during development.

## CLI/MCP Verification

Run:

```bash
supabase --version
supabase projects list --output json
codex mcp get supabase
```

Expected:

- CLI version prints.
- Projects list returns authenticated project inventory.
- Codex MCP entry is configured.

## Migration Drill

1. Create a no-op or temp-table migration on a branch/local target.
2. Include explicit grants only if the table is meant for Data API access.
3. Enable RLS and policy if exposed.
4. Run advisors.
5. Revert or drop the temp object in a second migration.

Do not run migration drills on production unless the object is intentionally part of a release.

## Backup Drill

1. Produce a logical schema-only dump.
2. Restore to Ghost or local Postgres.
3. Compare table inventory to source.
4. Record restore duration.
5. Delete/pause lab target.

## Pass Criteria

- No secrets in tracked files.
- Production actions fail without backup proof.
- CLI and MCP auth are visible.
- Migration artifacts exist for schema changes.
- Restore drill completed in the last 7 days.
- Advisor warnings are either fixed or explicitly waived.
