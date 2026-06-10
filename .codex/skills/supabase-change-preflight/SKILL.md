---
name: "supabase-change-preflight"
description: "Use before any Supabase infrastructure, schema, migration, backup, branch, restore, RLS, policy, or production data operation. Enforces target clarity, backup proof, test target execution, advisors, and explicit approval for destructive production actions."
metadata:
  short-description: "Preflight gate before Supabase changes."
---

# Supabase Change Preflight

Use this skill before touching Supabase infrastructure or schema.

## Contract

- Supabase is the live Open Brain source of truth.
- Full read and migration-tooling access is allowed.
- Production-destructive actions are blocked unless a fresh backup/clone proof exists and the user approves the exact action.
- Never paste or print secrets, service-role keys, direct connection strings, raw customer rows, or raw PII.
- Use `docs/36-supabase-infrastructure-ops.md` and `integrations/bridges/supabase-infrastructure/README.md` as the local operating reference.

## Required Flow

1. Name the target:
   - project ref,
   - environment (`prod`, `branch`, `staging`, or `ghost`),
   - intended action,
   - expected blast radius.
2. Run the non-destructive preflight:

   ```bash
   node scripts/supabase-preflight.mjs --target branch
   ```

   For production:

   ```bash
   node scripts/supabase-preflight.mjs --target prod --backup-proof <backup-id-or-manifest>
   ```

3. For schema changes, create or update a migration file. Do not hand-apply mystery SQL without a tracked artifact.
4. Test first against one of:
   - Supabase preview branch,
   - local Supabase,
   - restored staging database,
   - Ghost lab database with sanitized data.
5. Run advisors/security checks when CLI/MCP access is available.
6. Run the relevant app smoke tests.
7. For production destructive actions, stop and request this approval phrase:

   ```text
   Approved for production destructive action: <exact action> on <project-ref> after backup <backup-id-or-proof>.
   ```

## Destructive Action Definition

Treat these as destructive:

- `DROP TABLE`, `DROP SCHEMA`, `DROP COLUMN`, `TRUNCATE`, broad `DELETE`.
- Disabling RLS or loosening policies on live tables/views.
- Overwriting production from a dump/restore.
- Rotating or revoking live credentials.
- Changing pricing, accounting, memory, or customer source-of-truth semantics.
- Deleting Supabase branches/backups/lab DBs that contain the only copy of an experiment.

## Daily Backup Posture

Prefer this stack:

1. Supabase PITR for production.
2. Daily encrypted logical dumps to offsite storage.
3. Separate Storage object backup.
4. Weekly restore drill into non-production.
5. Short-lived Supabase branches and Ghost lab DBs for experiments.

Ghost and Dolt are not production replacements. Ghost is a disposable Postgres lab. Dolt is a possible
data-diff lab for selected non-sensitive reference datasets.

## If Access Is Missing

Do not ask the user to paste secrets into chat. Ask them to:

- install/authenticate 1Password and Dashlane CLIs,
- store the named Supabase vault items from `docs/36-supabase-infrastructure-ops.md`,
- rotate any exposed keys,
- rerun CLI/MCP login using vault-backed env injection.
