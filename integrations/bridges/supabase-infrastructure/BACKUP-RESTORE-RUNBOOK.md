# Supabase Backup And Restore Runbook

Status: active KB v1

This runbook defines the recovery posture for the Open Brain.

## Recommendation

Use Supabase PITR for production plus daily encrypted logical dumps to offsite storage and weekly restore drills.

Supabase platform backups are necessary but not sufficient by themselves because:

- Plan retention varies.
- Project deletion removes associated platform backups.
- Database backups do not restore Storage API objects.
- Restore operations can create downtime.
- Logical dumps are portable and can be tested outside the production project.

## Daily Backup Manifest

Every daily backup job should produce a manifest with:

```json
{
  "backup_id": "YYYY-MM-DD-project-ref",
  "project_ref": "rnhmvcpsvtqjlffpsayu",
  "created_at": "ISO-8601",
  "artifact_type": "logical_dump",
  "schemas": ["public"],
  "storage_backup": "separate-object-backup-id-or-none",
  "encrypted": true,
  "offsite_location": "provider/bucket/path-without-secret-url",
  "row_count_samples": {},
  "checksum": "sha256",
  "restore_drill_due": "YYYY-MM-DD",
  "created_by": "agent-or-human"
}
```

Do not put presigned URLs, access keys, or passwords in the manifest.

## Daily Procedure

1. Confirm production project is reachable.
2. Confirm PITR or platform backup status in dashboard/API.
3. Dump approved schemas.
4. Back up Storage objects separately when Storage contains business files.
5. Encrypt artifacts before upload.
6. Upload to offsite storage.
7. Record checksum and row-count samples.
8. Send Conductor digest with pass/fail and latest restore-drill age.

## Weekly Restore Drill

Target options in preferred order:

1. Supabase staging project or branch with approved seed/sample data.
2. Ghost lab database with sanitized logical dump.
3. Local Postgres container for schema-only validation.

Drill steps:

1. Select latest daily manifest.
2. Restore into non-production.
3. Run schema inventory and row-count checks.
4. Run advisors/security checks where available.
5. Run Command Center smoke tests with non-production env.
6. Record restore duration and failures.
7. Delete or pause lab target according to retention policy.

## Production Restore

Production restore is destructive and causes downtime. It requires:

- Exact target project ref.
- Restore point or backup id.
- Impact statement.
- Downtime window.
- Subscription/replication-slot plan.
- Storage-object recovery plan.
- Explicit approval phrase.

Do not restore over production from an agent-only decision.

## Retention

| Artifact | Default retention |
| --- | --- |
| PITR | 7, 14, or 28 days depending on approved budget and project plan. |
| Daily logical dump | 30 daily copies. |
| Weekly logical dump | 12 weekly copies. |
| Monthly logical dump | 12 monthly copies. |
| Restore-drill report | Permanent operations evidence. |
| Supabase preview branch | Delete after merge or 7 inactive days. |
| Ghost lab DB | Delete after experiment unless named retention is approved. |

## Storage Objects

Supabase database backups include Storage metadata, not the stored objects themselves. Any bucket used for invoices, PDFs, photos, maps, or memory artifacts needs its own object backup process.
