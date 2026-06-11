# Supabase Infrastructure Troubleshooting

Status: active KB v1

## CLI Cannot Write Telemetry Or Config

Symptom:

```text
operation not permitted
```

Cause:

- Sandbox blocked writes under `~/.supabase`.

Fix:

- Rerun read-only CLI verification with approved escalation.
- Do not work around by writing secrets into the repo.

## Checkout Is Not Linked

Symptom:

```text
Cannot find project ref. Have you run supabase link?
```

Fix:

1. Confirm project ref.
2. Retrieve DB password from vault.
3. Run `supabase link --project-ref <ref>` and enter password interactively, or use vault-backed env injection.

## New Table Works In SQL But Not REST/API

Likely cause:

- Missing explicit `GRANT` for `anon`, `authenticated`, or `service_role`.

Fix:

1. Confirm table is supposed to be exposed.
2. Add explicit grants in a migration.
3. Enable RLS.
4. Add policies.
5. Test via Data API and direct SQL.

## UPDATE Returns Zero Rows

Likely cause:

- RLS update policy lacks a matching select policy, or `USING`/`WITH CHECK` is incomplete.

Fix:

- Add/select policy for row visibility.
- Add `WITH CHECK` for writes.
- Test as the real role.

## View Bypasses RLS

Likely cause:

- View runs with definer privileges by default.

Fix:

- Prefer `CREATE VIEW ... WITH (security_invoker = true)` on supported Postgres.
- Otherwise put sensitive views in an unexposed schema or revoke access from browser-facing roles.

## Advisors Fail Or Are Unavailable

Fix path:

1. Check `supabase --version`.
2. Use `supabase db advisors --help`.
3. If CLI cannot run, use Supabase MCP advisor tooling when available.
4. If neither path works, record the blocker and run manual RLS/grant/function/view checks.

## Production Restore Needed

Stop. Do not improvise.

Required:

- Backup id or PITR timestamp.
- Downtime window.
- Storage object restore plan.
- Replication/subscription plan.
- Exact user approval phrase.

## Secret Was Pasted Into Chat

Treat it as exposed.

1. Rotate it in Supabase.
2. Update vault entries.
3. Update runtime env.
4. Verify old credential no longer works.
5. Do not record the secret in memory or docs.
