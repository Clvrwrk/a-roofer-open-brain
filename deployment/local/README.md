# deployment/local/ — local-capable profile (held in reserve)

Most roofers never need this. Stand it up only when a client requires **data residency** or an **air-gap** (e.g. a government contractor, or a manufacturer with strict IT). The MCP contract is identical to the remote profile, so a brain can migrate remote↔local without losing its memory.

> Pattern credit: Cole Medin's Dynamous "second brain" local stack. This compose file is Cleverwork-original and re-expressed; we do not redistribute Dynamous files. Full walkthrough: `docs/04-going-local.md`.

## What changes vs. remote

| Concern | Remote (default) | Local |
| --- | --- | --- |
| Database | Supabase Postgres + pgvector | `pgvector/pgvector` container |
| Embeddings | managed cloud | **Ollama** (`nomic-embed-text`) |
| MCP server | MCP container on Hetzner | the same `server/` running in a Deno container |
| Secrets | Coolify app env / vault | `.env` on the host / a vault |
| Dashboard | Coolify | self-hosted or skipped |

## Bring it up

```bash
cp ../../config/.env.example ../../.env      # fill POSTGRES + keys
docker compose up -d
docker exec roofbrain-ollama ollama pull nomic-embed-text
# then apply schema + seed via the same wizard:
cd ../.. && ./scripts/new-client.sh          # with deployment.profile: local in config
```

We do **not** polish this profile until a client demands it (Phase 3 in the architecture brief). It ships as a documented capability, not a turnkey one.
