# Dolt Mapping

| Dolt object | Brain target | Trust tier |
| --- | --- | --- |
| Dolt repository | Reference-data lab atom with dataset scope and allowed fields. | evidence |
| Branch | Proposed data-change review packet. | inference |
| Commit | Evidence atom with changed table names, source export, and reviewer. | evidence |
| Diff | Auditor review input for row-level changes. | evidence |
| Merge/pull request | Human-approved data-change decision. | instruction after approval |
| Export back to Supabase | Supabase migration/import artifact. | instruction after production apply |

## Promotion Rule

Dolt output never writes directly to production. Promotion must go through the Supabase preflight skill,
a migration or reviewed import script, and the normal production approval gate.
