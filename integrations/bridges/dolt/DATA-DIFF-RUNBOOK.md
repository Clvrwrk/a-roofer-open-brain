# Dolt Data-Diff Runbook

Status: active KB v1
Last verified: 2026-06-10

Use this runbook when a non-sensitive dataset needs Git-style review before it becomes part of the live Open Brain.

## Approved Inputs

Allowed by default:

- Public manufacturer taxonomy.
- Jurisdiction, code, and permit reference data with approved licensing.
- Internal product/category mappings after PII and pricing review.
- Sanitized vendor branch metadata when the owner explicitly approves the data class.

Blocked by default:

- Credentials, tokens, direct connection strings, service-role keys.
- Raw customer, property, lead, job, or invoice rows.
- Negotiated price agreements and pricing history.
- Account numbers, contact exports, or vendor portal data that is not approved for lab use.

## Step 1: Define The Change

Record:

- Dataset name.
- Supabase source table or external source URL.
- Data classification.
- Owner.
- Intended review outcome.
- Retention date for the lab repo.

Run:

```bash
node scripts/dolt-lab-preflight.mjs --offline
```

## Step 2: Export And Sanitize

Export through a read-only script or query. Save the export into a temporary lab folder, not the app source tree.

Sanitize before Dolt import:

- Remove secrets and direct credentials.
- Remove customer/job/property identifiers.
- Remove negotiated pricing unless explicitly approved.
- Normalize addresses only if the dataset has been approved for location work.
- Create deterministic primary keys for imported records.

## Step 3: Create Baseline

```bash
dolt init
dolt table import -c --pk id <table_name> sanitized-baseline.csv
dolt diff
dolt add <table_name>
dolt commit -m "Baseline <dataset> from <source> on YYYY-MM-DD"
```

Store the source and classification in a local `README.md` inside the lab repo. Do not store raw export credentials.

## Step 4: Apply Proposed Changes

```bash
dolt checkout -b proposed-<change-name>
dolt table import -u <table_name> proposed-update.csv
dolt diff main..HEAD
```

Review the diff for:

- Added rows.
- Removed rows.
- Modified fields.
- Unexpected nulls.
- Duplicate primary keys.
- Sensitive fields that slipped through.

## Step 5: Review Gate

The reviewer must confirm:

- Data class is still allowed.
- Diffs match the intended business change.
- No secrets, raw PII, raw pricing, or account data are present.
- Promotion path is a Supabase migration/import PR.
- Lab retention date is documented.

If any gate fails, stop and either sanitize again or discard the lab repo.

## Step 6: Promote Accepted Data

Accepted changes do not go directly from Dolt into production. Use one of:

- A Supabase migration containing static reference data.
- A reviewed import script with dry-run and row-count checks.
- A Supabase branch or restored staging target before production.

Then run:

```bash
node scripts/supabase-preflight.mjs --target branch
```

For production:

```bash
node scripts/supabase-preflight.mjs --target prod --backup-proof <backup-id-or-manifest>
```

## Step 7: Close The Lab

At closeout:

- Export the final reviewed diff summary.
- Record the commit hash and branch name.
- Delete temporary raw exports.
- Archive or delete the Dolt repo according to the retention note.
- If a remote exists, confirm it contains only approved non-sensitive data.
