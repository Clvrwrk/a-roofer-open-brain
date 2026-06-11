# Dolt Command Cookbook

Status: active KB v1
Last verified: 2026-06-10

These commands are for lab and review workflows only. They must not export, import, publish, or commit raw production secrets, raw PII, direct connection strings, negotiated pricing, or customer/job data.

## Health Checks

```bash
dolt version
dolt config --global --get user.name
dolt config --global --get user.email
dolt creds ls -v
dolt creds check
node scripts/dolt-lab-preflight.mjs
```

Use `--offline` when internet access is unavailable:

```bash
node scripts/dolt-lab-preflight.mjs --offline
```

## Create A Local Lab Repo

```bash
mkdir -p /private/tmp/open-brain-dolt-labs/<dataset-name>
cd /private/tmp/open-brain-dolt-labs/<dataset-name>
dolt init
dolt status
```

Always initialize lab repos outside the production app tree unless the dataset is intentionally part of a reviewed fixture.

## Import A Sanitized Dataset

CSV import requires a stable primary key. Prefer source IDs only when they are non-sensitive. Otherwise use a generated deterministic key.

```bash
dolt table import -c --pk id <table_name> sanitized-export.csv
dolt status
dolt diff
dolt add <table_name>
dolt commit -m "Import sanitized <dataset> baseline from <source>"
```

If the schema needs to be explicit:

```bash
dolt table import -c --schema schema.sql <table_name> sanitized-export.csv
```

## Review Proposed Data Changes

```bash
dolt checkout -b proposed-<change-name>
dolt table import -u <table_name> proposed-update.csv
dolt diff
dolt diff main..HEAD
dolt status
```

Commit only after the diff has been reviewed:

```bash
dolt add <table_name>
dolt commit -m "Propose <dataset> updates from <source>"
```

## Query Data

```bash
dolt sql -q "select count(*) as rows from <table_name>;"
dolt sql -q "select * from <table_name> limit 20;"
```

Never print customer rows, account pricing, secrets, or sensitive addresses in a terminal transcript.

## Branch, Merge, And Compare

```bash
dolt branch
dolt checkout main
dolt merge proposed-<change-name>
dolt log
dolt diff HEAD~1..HEAD
```

If a merge conflicts, stop and document the conflicting table and columns. Do not hand-resolve production-impacting data without an owner review.

## Remote Commands

Only use remotes for approved non-sensitive datasets.

```bash
dolt remote add origin <approved-remote-url>
dolt push origin main
dolt pull origin main
```

Do not put access tokens in commands, commit messages, README files, or remote URLs. Use Dolt credential management or vault-backed environment injection.

## Export Back To A Review Artifact

```bash
dolt table export <table_name> reviewed-output.csv
dolt table export --file-type jsonl <table_name> reviewed-output.jsonl
```

Promotion back to Supabase must happen through a tracked migration or approved import script, not through an ad hoc direct write.
