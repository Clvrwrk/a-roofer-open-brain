# Dolt Resource - Version-Controlled SQL Data Lab

Status: active KB v1, lab-only
Last verified: 2026-06-10
Tier: infrastructure/data-versioning lab
Primary agents: Innovator, Quality Control, Auditor, Maintenance

Dolt is a SQL database with Git-like data versioning: clone, fork, branch, merge, push, pull, commit,
and diff workflows applied to tables. It presents a MySQL-compatible interface, so it is useful for
versioned datasets, but it is not a native replacement for Supabase/Postgres.

## KB Map

| File | Purpose |
| --- | --- |
| [COMMANDS.md](COMMANDS.md) | Safe command cookbook for health checks, imports, diffs, branches, and remotes. |
| [DATA-DIFF-RUNBOOK.md](DATA-DIFF-RUNBOOK.md) | End-to-end workflow for turning sanitized reference data into reviewed Dolt diffs. |
| [PILOT-PLAN.md](PILOT-PLAN.md) | Pilot scope, datasets, success criteria, and go/no-go gates. |
| [TEST-PLAN.md](TEST-PLAN.md) | Verification matrix for auth, data import, diffs, merges, and cleanup. |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Common failure modes and recoveries. |
| [SOURCES.md](SOURCES.md) | Source links and verification notes. |
| [mapping.md](mapping.md) | Data model mapping notes for the Open Brain. |

## Current Local State

Observed locally on 2026-06-10:

| Area | State |
| --- | --- |
| Dolt CLI | Installed, `dolt version` reported `2.1.6`. |
| DoltHub auth | Credential keypair login verified for the operator account. |
| Author identity | Global `dolt config` name/email configured. |
| Production role | None. Dolt is not connected to live Supabase and is not a backup target. |
| User-provided upstream | `dolthub/dolt.git` is tracked as the implementation/reference repository, not as a place for Open Brain data. |

## Best Fit For The Brain

| Use case | Fit |
| --- | --- |
| Curated non-sensitive reference tables | Strong. Data diffs and pull requests are useful for review. |
| Product taxonomy experiments | Strong when exported/imported as reference data. |
| Vendor catalog mapping proposals | Possible after security review and only for allowed data classes. |
| Production Open Brain database | Poor. Supabase/Postgres remains source of truth. |
| Raw invoices, customer rows, pricing agreements | Blocked until legal/security review approves. |

## Recommended Posture

Use Dolt as an optional data-diff lab, not as a backup or production replica.

Candidate datasets:

- Public manufacturer product taxonomy.
- Internal product category hierarchy after PII/pricing review.
- Jurisdiction/code reference tables when source licensing allows.
- Approved non-sensitive mapping tables that benefit from data pull requests.

Blocked datasets by default:

- Service-role keys, credentials, or connection strings.
- Raw customer/property rows.
- Raw invoices and vendor-account details.
- Negotiated price agreements unless explicitly approved.
- Full vendor branch/pricing tables unless the export is sanitized and approved for the pilot.

## Operating Rules

1. Export only reviewed datasets from Supabase.
2. Commit Dolt changes with source and purpose.
3. Use Dolt diffs to review proposed data changes.
4. Promote back to Supabase only through a Supabase migration or approved import script.
5. Delete or archive experiment remotes when the review is complete.
6. Run `node scripts/dolt-lab-preflight.mjs` before creating or publishing a Dolt experiment.

## Default Workflow

1. Select an approved reference dataset.
2. Export it from Supabase through a read-only query or reviewed script.
3. Strip secrets, PII, account-specific pricing, and customer/job identifiers.
4. Import the sanitized data into a local Dolt repository.
5. Commit a baseline with source, timestamp, and data-class notes.
6. Create a branch for proposed changes.
7. Review `dolt diff` output with Quality Control or Auditor.
8. Promote accepted changes back to Supabase through a normal migration/import pull request.

## Non-Goals

- Do not use Dolt as the Open Brain system of record.
- Do not use DoltHub as a backup for Supabase.
- Do not place live credentials, raw customer data, negotiated prices, or raw invoice history in Dolt.
- Do not push experimental datasets to a remote without an explicit data-class approval.

## Decision

Adopt Dolt only for selected reference-data workflows after a pilot. Do not put it in the critical path
for live Open Brain operations.
