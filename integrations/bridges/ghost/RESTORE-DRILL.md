# Ghost Restore Drill

Status: active KB v1

Ghost is a good target for sanitized logical dump restore drills.

## Allowed Inputs

- Schema-only dumps.
- Synthetic seed data.
- Masked customer/property samples approved for testing.
- Public reference data.

Blocked by default:

- Raw customer PII.
- Raw invoices.
- Raw negotiated price agreements.
- Production credentials.

## Drill Steps

1. Choose backup manifest.
2. Create a named Ghost restore target:

   ```bash
   ghost create pe-restore-drill-YYYY-MM-DD --wait --json
   ```

3. Load schema/data using `psql` or `ghost sql`, with connection string retrieved locally and not printed.
4. Run schema inventory:

   ```bash
   ghost schema pe-restore-drill-YYYY-MM-DD
   ```

5. Run representative read queries.
6. Compare table counts to manifest samples.
7. Record restore duration and mismatches.
8. Pause or delete the lab DB.

## Pass Criteria

- Schema restore succeeds.
- Required tables/views/functions are present.
- Row-count samples match expected sanitized dump counts.
- No raw secrets appear in logs.
- Findings are captured in the Supabase infrastructure atom/runbook.

## Failure Handling

| Failure | Action |
| --- | --- |
| Connection fails | Check `ghost list`, status, and password/connection retrieval. |
| Import fails | Verify dump was generated for compatible Postgres features/extensions. |
| Extension missing | Document extension gap and use Supabase staging/local Postgres for that drill. |
| Sensitive data found | Stop, delete lab DB, rotate exposed secrets if needed, and record incident. |
