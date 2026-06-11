# Dolt Troubleshooting

Status: active KB v1
Last verified: 2026-06-10

## `dolt` Command Not Found

Install the CLI, then rerun:

```bash
dolt version
```

If multiple shells disagree, check the shell PATH and the package manager installation path.

## No Dolt Identity

Set an author identity before commits:

```bash
dolt config --global --add user.name "<name>"
dolt config --global --add user.email "<email>"
```

Use the operator identity, not a shared secret or token.

## DoltHub Auth Fails

Check local credentials:

```bash
dolt creds ls -v
dolt creds check
```

If credentials are absent, run the approved login/keypair setup and authenticate in the browser. Do not paste access tokens into docs, commit messages, or chat.

## Import Fails Because There Is No Primary Key

Dolt tables need a primary key for reliable versioned diffs. Choose a non-sensitive deterministic ID:

```bash
dolt table import -c --pk id <table_name> sanitized.csv
```

If the source does not have a safe key, generate one during sanitization.

## Import Fails Because Schema Inference Is Wrong

Create a schema file and import with it:

```bash
dolt table import -c --schema schema.sql <table_name> sanitized.csv
```

Prefer explicit schemas for recurring pipelines.

## Diff Is Too Noisy

Check for:

- Unstable generated IDs.
- Reordered or reformatted text fields.
- Timestamps that change on every export.
- Floating-point formatting differences.
- Colorway or SKU fields that need normalization.

Normalize the export before import instead of reviewing noisy diffs.

## Merge Conflicts

Do not force the merge. Capture:

- Branch names.
- Table names.
- Conflicting primary keys.
- Intended source of truth.

Resolve in a fresh branch after owner review.

## Remote Push Should Be Blocked

If a dataset contains any blocked class, do not push it. Delete the remote if needed and sanitize locally.

Blocked classes include:

- Secrets and tokens.
- Raw customer/job/property data.
- Raw invoice history.
- Negotiated pricing.
- Unapproved vendor account data.

## Performance Is Poor

For large tables:

- Start with a small sample.
- Add only columns needed for review.
- Normalize text and timestamps before import.
- Avoid using Dolt for high-churn operational data.
- Keep live operational queries in Supabase.

## Accidental Secret Exposure

1. Stop using the lab repo.
2. Remove the secret from working files.
3. If committed, treat it as exposed and rotate it.
4. If pushed, delete the remote or purge history only after approval.
5. Record what happened without repeating the secret value.
