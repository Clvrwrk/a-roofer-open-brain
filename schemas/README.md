# schemas/

Two layers. Apply in order; every file is idempotent (safe to re-run).

## Apply order

```
# 1. OB1 spine (vendored, attributed — see ob1-base/ATTRIBUTION.md)
ob1-base/00-core-thoughts.sql        # the thoughts table + pgvector + match_thoughts
ob1-base/enhanced-thoughts.sql       # structured columns + search RPCs
ob1-base/provenance-chains.sql       # derived_from / trace_provenance / find_derivatives
ob1-base/typed-reasoning-edges.sql   # typed edges between atoms
ob1-base/agent-memory.sql            # governed recall/write-back sidecar

# 2. Cleverwork roofer extensions (property-first, era-aware)
cleverwork-roofer/10-property-jurisdiction.sql
cleverwork-roofer/20-client-job-crew.sql
cleverwork-roofer/30-insurance-warranty.sql
cleverwork-roofer/40-atom-extensions.sql      # extends public.thoughts; FKs the tables above
cleverwork-roofer/50-consent-access-log.sql   # cross-client read path + audit log
cleverwork-roofer/60-tighten-grants.sql       # revoke anon/authenticated from inherited OB1 RPCs (least privilege)
```

`scripts/new-client.sh` applies these in order against a fresh Supabase project. `scripts/verify-deployment.sh` runs a smoke test afterward.

## Design notes

- **`public.thoughts` is the atom table** (OB1's). We never redefine it — we `ALTER ... ADD COLUMN IF NOT EXISTS`. See `CONVENTIONS.md` §2 for the full field list.
- **Property-first.** `property` is the primary entity; `client`, `job`, atoms are foreign keys. This is the Cleverwork-original delta over OB1's user-first model.
- **Era-aware.** `regulatory_snapshot` is a timeline of the code in effect per jurisdiction; atoms point at the snapshot active when the underlying fact was true.
- **RLS everywhere.** Every Cleverwork table enables Row Level Security with a `service_role`-only policy, matching OB1. The MCP container is the sole caller.
