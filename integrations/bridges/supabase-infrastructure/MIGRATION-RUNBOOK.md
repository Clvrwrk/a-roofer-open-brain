# Supabase Migration Runbook

Status: active KB v1

This runbook is mandatory for schema, RLS, policy, function, extension, trigger, view, table, and source-of-truth data-shape changes.

## Change Classes

| Class | Examples | Default target | Production gate |
| --- | --- | --- | --- |
| Read-only audit | Advisors, row counts, schema inventory | Production read-only | No write approval. |
| Additive schema | New table, index, view, nullable column | Branch/Ghost/local first | Backup proof and smoke test. |
| Access change | Grants, RLS, policies, security definer/invoker | Branch/Ghost/local first | Auditor review required. |
| Data correction | Backfill, dedupe, mapping update | Restored staging or branch with approved data | Backup proof and rollback query. |
| Destructive | Drop, truncate, broad delete, restore over prod, disable RLS | Never first on prod | Exact approval phrase required. |

## Required Preflight

```bash
node scripts/supabase-preflight.mjs --target branch
```

For production:

```bash
node scripts/supabase-preflight.mjs \
  --target prod \
  --project-ref rnhmvcpsvtqjlffpsayu \
  --backup-proof <backup-id-or-manifest>
```

## Migration Authoring

1. Create the migration:

   ```bash
   supabase migration new <descriptive_name>
   ```

2. Write SQL in the generated migration file.
3. Keep each migration focused on one logical change.
4. Include rollback notes in comments when rollback is not obvious.
5. Avoid `SECURITY DEFINER` unless there is no safer path.
6. For any exposed table, include explicit grants, RLS enablement, and policies together.

## Public Schema Data API Rule

Supabase is moving toward explicit grants for new `public` schema tables before the Data API can access them. Treat grants, RLS, and policies as one unit:

```sql
grant select on public.example_table to anon;
grant select, insert, update, delete on public.example_table to authenticated;
grant select, insert, update, delete on public.example_table to service_role;

alter table public.example_table enable row level security;

create policy "authenticated users can read their own rows"
on public.example_table
for select
to authenticated
using ((select auth.uid()) = user_id);
```

Rules:

- Do not grant `anon` write privileges without a written reason.
- Do not rely on `TO authenticated` without row ownership or role predicates.
- Do not use `auth.role()` in new policies.
- Add `WITH CHECK` on update/insert policies where users can write.
- Use `security_invoker = true` for views that should honor RLS on supported Postgres versions.

## Test Matrix

Run at least one path from each row:

| Layer | Required check |
| --- | --- |
| Syntax | `supabase db reset` locally or apply to a Ghost lab DB. |
| Advisors | `supabase db advisors` or MCP advisor equivalent. |
| App | Command Center route/API smoke test that depends on the changed object. |
| Permissions | Direct SQL as service role plus Data API/auth path if object is exposed. |
| Rollback | Document restore, reverse migration, or compensating migration. |

## Production Apply

Allowed only after:

1. Backup proof exists.
2. Non-production apply passed.
3. Advisors were run or a reason is recorded.
4. Relevant app smoke tests passed.
5. Destructive changes have exact approval.

Approval phrase:

```text
Approved for production destructive action: <exact action> on <project-ref> after backup <backup-id-or-proof>.
```

## Post-Apply

1. Record migration id and commit hash.
2. Run read-only health queries.
3. Run Command Center smoke tests.
4. Record any advisor warnings.
5. Write an infrastructure atom with target, backup proof, migration artifact, test result, and approver.
