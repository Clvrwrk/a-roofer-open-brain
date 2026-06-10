# Supabase Infrastructure Mapping

This mapping converts infrastructure events into brain facts and audit evidence.

| Source object/event | Brain target | Trust tier |
| --- | --- | --- |
| Project inventory | Executive/Maintenance configuration atom with project ref, region, and role. | evidence |
| CLI/MCP auth verification | Maintenance access-state atom. | evidence |
| Migration plan | Auditor review packet and git artifact. | inference until reviewed |
| Applied migration | Infrastructure change atom with migration id, approver, and target project. | instruction after human-approved production apply |
| Supabase branch | Temporary test-environment atom with owner, purpose, and delete date. | evidence |
| Backup manifest | Recovery evidence atom with backup id, target, retention class, and encrypted storage location. | evidence |
| Restore drill result | Quality Control recoverability atom with restore duration and smoke-test status. | instruction after pass |
| Advisor/security result | Auditor input atom; failures block production changes until resolved or waived. | evidence |
| Secret rotation | Security atom containing key name and rotation timestamp only, never secret value. | instruction after completion |

## Required Metadata

Every infrastructure atom should include:

- `source_system: "supabase-infrastructure"`
- `project_ref`
- `environment: "production" | "branch" | "staging" | "lab"`
- `operation_type`
- `performed_by`
- `reviewed_by` when production was affected
- `backup_proof` when production was affected
- `rollback_path`
- `source_artifact` such as migration path, backup manifest path, or advisor output path

## Blocked Metadata

Never include:

- Service-role key values.
- Database passwords.
- Direct connection strings with embedded credentials.
- Raw customer rows or raw PII.
- Full backup URLs when the URL grants access.
