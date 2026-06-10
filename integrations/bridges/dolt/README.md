# Dolt Resource - Version-Controlled SQL Data Lab

Status: research/planned  
Tier: infrastructure/data-versioning lab  
Primary agents: Innovator, Quality Control, Auditor, Maintenance

Dolt is a SQL database with Git-like data versioning: clone, fork, branch, merge, push, pull, commit,
and diff workflows applied to tables. It presents a MySQL-compatible interface, so it is useful for
versioned datasets, but it is not a native replacement for Supabase/Postgres.

Source docs:

- What is Dolt: https://www.dolthub.com/docs/introduction/what-is-dolt/
- CLI reference: https://www.dolthub.com/docs/cli-reference/cli
- SQL version-control reference: https://www.dolthub.com/docs/sql-reference/version-control
- DoltHub: https://www.dolthub.com/
- DoltLab: https://www.doltlab.com/

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

## Operating Rules

1. Export only reviewed datasets from Supabase.
2. Commit Dolt changes with source and purpose.
3. Use Dolt diffs to review proposed data changes.
4. Promote back to Supabase only through a Supabase migration or approved import script.
5. Delete or archive experiment remotes when the review is complete.

## Decision

Adopt Dolt only for selected reference-data workflows after a pilot. Do not put it in the critical path
for live Open Brain operations.
