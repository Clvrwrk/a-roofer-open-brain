# Ghost Lab Runbook

Status: active KB v1

Use Ghost for disposable Postgres experiments before Supabase production changes.

## Lab Classes

| Class | Data allowed | Retention |
| --- | --- | --- |
| Empty schema lab | No data | Delete after experiment or pause within 24 hours. |
| Synthetic data lab | Generated fake rows | Delete/pause after experiment. |
| Sanitized restore lab | Masked and approved dump | Delete after restore drill unless retained by approval. |
| Long-lived staging | Only by explicit approval | Named owner and monthly review. |

## Create A Lab

```bash
ghost create <lab-name> --wait --json
```

Record:

- DB name.
- DB id.
- Purpose.
- Owner.
- Data class.
- Delete/pause date.

Do not record the connection string.

## Run An Experiment

1. Name the hypothesis.
2. Run schema/SQL against Ghost.
3. Capture query text and result summary, not sensitive row data.
4. Convert useful changes into a Supabase migration file.
5. Run Supabase preflight before production.

## Fork A Lab

```bash
ghost fork <source-name-or-id> --name <fork-name> --wait --json
```

Fork only approved lab DBs. A fork inherits data from the source; do not fork a DB that contains sensitive data into a broader-access context.

## Cleanup

Pause when you may need the lab again soon:

```bash
ghost pause <name-or-id>
```

Delete when the experiment is done and no unique evidence remains:

```bash
ghost delete <name-or-id>
```

Before delete, ensure:

- Findings are captured in docs or migration files.
- No backup/restore drill depends on that DB as the only proof.
- Human approval exists for non-routine deletion.

## Promotion To Supabase

Ghost SQL is never production state. Promotion path:

1. Convert change to a Supabase migration.
2. Run `node scripts/supabase-preflight.mjs --target branch`.
3. Test on branch/local/restored staging.
4. Run advisors.
5. Apply through the Supabase production gate.
