# Pro Exteriors US app folders

Each surface has a dedicated navigation home. Keep executable source at its owning repository/build root; the folder index and local source links make that work discoverable without duplicating histories or changing production build contexts.

| App home | Source and work |
| --- | --- |
| [CC_PWA](CC_PWA/APP-INDEX.md) | Command Center source at [command-center](command-center/); local `source` link opens it. |
| [CRM_PWA](CRM_PWA/APP-INDEX.md) | CRM companion repository, PRDs and prototypes. |
| [CRM_PWA_SITE_INSPECTION](CRM_PWA_SITE_INSPECTION/APP-INDEX.md) | CRM inspection research/design; retained intake paths preserve mockup assets. |
| [HR_PWA](HR_PWA/APP-INDEX.md) | HR app in CRM_PWA, with the full shared repository available through local links. |
| [PM_PWA](PM_PWA/APP-INDEX.md) | PM research and the independently versioned scheduler repository. |
| [ADMIN_PWA](ADMIN_PWA/APP-INDEX.md) | Administrative modules in their host applications. |
| [APP_PWA](APP_PWA/APP-INDEX.md) | Platform navigation/planning; no standalone implementation is established. |

Machine-specific links, imported documents/media, nested checkouts and agent worktrees remain local and ignored. Only the curated indexes are tracked in these intake homes. Shared `schemas/`, `supabase/`, `integrations/`, `deployment/` and root `scripts/` retain existing consumers and paths.
