# Ghost Mapping

| Ghost object/event | Brain target | Trust tier |
| --- | --- | --- |
| Lab database | Experiment atom with purpose, owner, source dump, and retention date. | evidence |
| Fork | Test-run lineage atom linking source and fork. | evidence |
| Schema output | Auditor review input. | evidence |
| SQL experiment | Innovator or Maintenance finding with query and result summary. | inference |
| Restore drill | Quality Control recoverability evidence. | instruction after pass |
| Delete/pause | Maintenance cleanup atom. | evidence |

## Promotion Rule

Ghost SQL experiments never become production state directly. Any useful change must be converted to a
Supabase migration or import script and run through `supabase-change-preflight`.
