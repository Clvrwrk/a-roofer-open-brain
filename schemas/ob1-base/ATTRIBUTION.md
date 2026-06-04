# OB1 base — attribution

The files in this directory are the **OB1 memory spine** by **Nate B. Jones**, vendored into this template so a client brain can be provisioned self-contained. OB1 is the persistent-memory foundation `a-roofers-open-brain` is built on.

- Project: OB1 (Open Brain)
- Author: Nate B. Jones — <https://natebjones.com> · <https://substack.com/@natesnewsletter>
- License: **FSL-1.1-MIT** (Functional Source License; converts to MIT two years after each release). Use is permitted; building a competing commercial product is not. See `LICENSE.md` at the repo root.

## What's here

| File | Source | Notes |
| --- | --- | --- |
| `00-core-thoughts.sql` | re-expressed from OB1 `docs/01-getting-started.md` | Minimal `public.thoughts` table + pgvector + `match_thoughts` so provisioning works on a blank Supabase. Re-expressed in Cleverwork's words; canonical setup lives in OB1's getting-started guide. |
| `enhanced-thoughts.sql` | OB1 `schemas/enhanced-thoughts` | Vendored as-is (header comments preserved). |
| `provenance-chains.sql` | OB1 `schemas/provenance-chains` | Vendored as-is. |
| `typed-reasoning-edges.sql` | OB1 `schemas/typed-reasoning-edges` | Adapted for this roofer template so thought-to-thought reasoning edges install even when the optional entity-extraction `public.edges` table is absent. |
| `agent-memory.sql` | OB1 `schemas/agent-memory` | Vendored as-is. |

If you fork or contribute pieces back upstream, preserve this attribution and the FSL obligations. Cleverwork's property-first extensions live one directory over in `../cleverwork-roofer/` and are Cleverwork-original.

## Compatibility notes

- `enhanced-thoughts.sql`'s `upsert_thought` expects `status` + `status_updated_at` on `public.thoughts`; `00-core-thoughts.sql` adds them so the chain applies on a blank project.
- The vendored RPCs `search_thoughts_text`, `brain_stats_aggregate`, `get_thought_connections` ship with `authenticated`/`anon` EXECUTE grants. `cleverwork-roofer/60-tighten-grants.sql` revokes those to keep the brain service_role-only (CONVENTIONS §4).

## Licensing

The repository root is **MIT** (see `/LICENSE`). The four vendored OB1 files in *this* directory are the exception: they remain under OB1's **FSL-1.1-MIT** and convert to MIT two years after their upstream release. Our re-expressed `00-core-thoughts.sql` and everything Cleverwork-authored elsewhere in the repo is MIT. For a 100%-MIT tree today, replace the four vendored files with the equivalent setup from OB1's public getting-started guide. Full map: `/LICENSE.md`.
