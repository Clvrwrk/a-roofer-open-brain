# Dolt Test Plan

Status: active KB v1
Last verified: 2026-06-10

## Test Matrix

| Test | Command | Expected Result |
| --- | --- | --- |
| CLI installed | `dolt version` | Version prints. |
| Identity configured | `dolt config --global --get user.name` and `dolt config --global --get user.email` | Both return non-empty values. |
| Credentials visible | `dolt creds ls -v` | At least one credential is present when remote work is needed. |
| Remote auth works | `dolt creds check` | Authentication succeeds, or network/auth failure is documented. |
| Preflight script works | `node scripts/dolt-lab-preflight.mjs --offline` | No script errors. |
| Local repo initializes | `dolt init` | `.dolt` exists and `dolt status` runs. |
| Sanitized import works | `dolt table import -c --pk id <table> file.csv` | Table imported, no sensitive fields. |
| Diff is readable | `dolt diff` | Adds/edits/deletes are visible. |
| Branch review works | `dolt checkout -b proposed-test` | Branch created and diffs compare against main. |
| Export works | `dolt table export <table> output.csv` | Exported artifact matches accepted rows. |

## Security Checks

Before any commit or remote push, run the repo preflight and a reviewed secret scan:

```bash
node scripts/supabase-preflight.mjs --offline --target branch
```

If the scan finds a real secret or customer-sensitive value, stop and remove the data from the lab. Rotate exposed credentials if they were ever committed or pushed.

## Data Quality Checks

For every pilot table:

- Primary key is stable and unique.
- Required columns are non-null.
- Row count matches the sanitized source file.
- No blocked columns are present.
- Diffs are reviewed before commit.
- Exported accepted data matches the reviewed branch.

## Promotion Checks

Before promoting Dolt-reviewed data into Supabase:

```bash
node scripts/supabase-preflight.mjs --target branch
```

Then verify:

- Migration/import script is tracked in git.
- Dry-run row count is recorded.
- Rollback approach is documented.
- Production changes have backup proof and approval when required.

## Cleanup Checks

At the end of a test:

- Temporary raw exports deleted.
- Lab repo retained only if it contains approved non-sensitive data.
- Remote deleted or archived if not needed.
- Final result summarized in the project notes or PR.
