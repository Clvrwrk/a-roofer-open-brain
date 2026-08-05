## Repair SQL

The live payload values contained an AccuLynx GUID suffix plus a prefix. The
authorized repair extracted each terminal GUID, removed its hyphens, and stored
the resulting unique 32-character hexadecimal value. The transaction was
limited to document rows in `failed` or `staged` status whose existing
`externalId` exceeded 32 characters.

```sql
BEGIN;

UPDATE jt_mirror.pending_write
SET payload = jsonb_set(
      payload,
      '{externalId}',
      to_jsonb(
        replace(
          substring(
            payload->>'externalId'
            FROM '([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})$'
          ),
          '-',
          ''
        )
      ),
      false
    ),
    status = CASE WHEN status = 'failed' THEN 'staged' ELSE status END,
    error = CASE WHEN status = 'failed' THEN NULL ELSE error END,
    attempt = CASE WHEN status = 'failed' THEN 0 ELSE attempt END
WHERE domain = 'documents'
  AND status IN ('failed', 'staged')
  AND length(payload->>'externalId') > 32;

COMMIT;
```

Before the update, a transaction guard confirmed exactly 26 scoped rows, a
terminal GUID on every row, 32 characters after normalization, and 26 distinct
normalized values. A post-update guard required all verification conditions
below before allowing the transaction to commit.

## Verification (live counts)

| Check | Count |
| --- | ---: |
| Staged documents | 26 |
| External IDs over 32 characters | 0 |
| Duplicate external IDs | 0 |
| Failed documents | 0 |

The original GUID linkage remains preserved in `source_ref`; that field was not
modified. No API calls to JobTread were made.

## Verdict

**PASS — repair completed and verified against live SQL.**
