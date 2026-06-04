# Going Local — The Data-Residency Profile

> **Default deployment is remote.** Supabase + MCP containers + Coolify is the right profile for most roofers. Read this document only if a client has a specific data-residency, air-gap, or sovereignty requirement that remote deployment cannot satisfy.
>
> **Credit:** The local deployment pattern described here is re-expressed from concepts developed by Cole Medin in the Dynamous workshops series (proprietary-community license; not reproduced here — cited and re-expressed in Cleverwork's own words). See `deployment/local/` for the Cleverwork-adapted docker-compose stack.

---

## When Local Deployment Is the Right Choice

Three conditions justify switching from `profile: remote` to `profile: local` in `config/roofer.config.yaml`:

1. **Data-residency requirement.** A client's insurance policy, government contract, or attorney has explicitly prohibited their operational data from residing on third-party cloud infrastructure. This is rare for residential roofers; it is more common for government-contract contractors and some commercial GCs.
2. **Air-gap requirement.** The client operates in an environment where outbound internet from the brain host is not permitted — a military facility, a classified site, a corporate network with strict egress controls.
3. **Cost at volume.** At very high atom volumes (tens of millions of atoms, hundreds of concurrent users), Supabase Pro pricing may exceed the cost of owning and operating a server. This is a Phase 3+ concern and should be validated with actual cost projections before switching.

For all other cases: stay remote. The local profile adds operational complexity (hardware maintenance, OS updates, database administration, backup discipline) that is genuinely difficult for a 2-person Cleverwork team to absorb across many client engagements.

---

## What Changes in Local Mode

| Component | Remote profile | Local profile |
| --- | --- | --- |
| Database | Supabase (managed Postgres + pgvector) | Postgres + pgvector in Docker |
| MCP containers (MCPs) | MCP containers on Hetzner (Deno) | Deno server in Docker (`server/`) |
| Dashboard | Coolify-hosted Astro app | Local Astro container or static serve |
| Embeddings | Managed cloud embeddings API | Ollama running locally (see below) |
| Secrets | Coolify app env / vault | Docker secrets or HashiCorp Vault |
| Backups | Supabase automated + `brain-backup` recipe | `scripts/` backup to local or air-gapped storage |

**What does not change:** the MCP contract, the schema, the agent behavior, the atom model. The MCP container signatures are identical whether they run on Supabase's infrastructure or in a local Deno container. This means a client can migrate from remote to local — or back — without losing any atoms or rebuilding any integrations. The brain is portable.

---

## Prerequisites for Local Deployment

**Hardware:**

| Component | Minimum | Recommended |
| --- | --- | --- |
| CPU | 4 cores | 8+ cores |
| RAM | 16 GB | 32 GB |
| Storage | 100 GB SSD | 500 GB NVMe |
| GPU (for embeddings) | Not required if CPU-OK with Ollama latency | NVIDIA RTX 3090/4090 (24 GB VRAM) for fast embeddings |

Without a GPU, Ollama runs embeddings on CPU. For a roofer-scale brain (thousands of atoms per month), CPU-based Ollama embeddings are acceptable — embedding writes happen asynchronously, and retrieval latency on pgvector depends on the vector index, not on embedding generation speed. A GPU matters at ingestion burst volume (e.g. bulk historical import of thousands of documents at once).

**Software:**
- Docker Desktop (macOS/Windows) or Docker Engine + Compose plugin (Linux)
- Ollama v0.14+ (for the Anthropic Messages API compatibility that lets the agent SDK route embedding calls correctly)
- Node 20+ (for dashboard)

---

## Setup Steps

### 1. Switch the deployment profile

In `config/roofer.config.yaml`:

```yaml
deployment:
  profile: "local"
  local:
    compose_file: "deployment/local/docker-compose.yml"
    ollama_embeddings: true
```

In `.env`, switch the embeddings provider:

```
EMBEDDINGS_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
```

Clear `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` if the local database is replacing Supabase entirely, or keep them if you are running a hybrid (local database, Supabase for dashboard hosting — a valid intermediate option).

### 2. Pull the Ollama embedding model

```bash
# Install Ollama if not present
curl -fsSL https://ollama.com/install.sh | sh   # macOS/Linux

# Pull the embedding model
ollama pull nomic-embed-text   # the default; swap in roofer.config.yaml if you prefer another

# Verify
curl http://localhost:11434/api/version
```

The embedding model name must match the value you set in `config/roofer.config.yaml` under `model_tiers.embeddings`. The default is `nomic-embed-text`; this is a good general-purpose embedding model that runs on CPU without a GPU.

### 3. Start the local stack

```bash
cd deployment/local
docker compose up -d
```

The compose file brings up:

- `postgres` — Postgres 16 with pgvector extension enabled
- `deno-mcp` — the Deno MCP server (same code as the MCP containers on Hetzner, run locally)
- `dashboard` — the Astro dashboard served locally
- `ollama` — Ollama embedding service (if not running natively on the host)

Check that all containers are healthy:

```bash
docker compose ps
```

All containers should show `healthy` status within 60 seconds of startup.

### 4. Apply schema

The schema is identical to the remote profile. Apply migrations against the local Postgres:

```bash
# Set the local database URL
export DATABASE_URL=postgresql://postgres:<DB_PASSWORD>@localhost:5432/brain

# Apply OB1 spine
psql $DATABASE_URL -f schemas/ob1-base/00-core-thoughts.sql
psql $DATABASE_URL -f schemas/ob1-base/enhanced-thoughts.sql
psql $DATABASE_URL -f schemas/ob1-base/provenance-chains.sql
psql $DATABASE_URL -f schemas/ob1-base/typed-reasoning-edges.sql
psql $DATABASE_URL -f schemas/ob1-base/agent-memory.sql

# Apply roofer extensions
psql $DATABASE_URL -f schemas/cleverwork-roofer/10-property-jurisdiction.sql
psql $DATABASE_URL -f schemas/cleverwork-roofer/20-client-job-crew.sql
psql $DATABASE_URL -f schemas/cleverwork-roofer/30-insurance-warranty.sql
psql $DATABASE_URL -f schemas/cleverwork-roofer/40-atom-extensions.sql
psql $DATABASE_URL -f schemas/cleverwork-roofer/50-consent-access-log.sql
```

RLS applies identically in local Postgres. Verify with:

```bash
psql $DATABASE_URL -c "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"
```

### 5. Run verify-deployment.sh

```bash
./scripts/verify-deployment.sh
```

The verify script detects `profile: local` from the config and adjusts its checks accordingly — it validates against `localhost` endpoints rather than Supabase/Coolify URLs. All the same checks apply.

---

## Migrating Remote to Local (Preserving the Brain)

The MCP contract is identical between deployment profiles. To migrate a running remote brain to local without losing atoms:

1. Export all atoms from Supabase:
   ```bash
   supabase db dump --data-only --table public.thoughts > atoms-export.sql
   # Repeat for property, job, client, jurisdiction, regulatory_snapshot tables
   ```
2. Start the local stack and apply schema (as above).
3. Import the atoms:
   ```bash
   psql $DATABASE_URL -f atoms-export.sql
   ```
4. Re-generate embeddings for the local Ollama model (embeddings from a cloud provider are not compatible with local Ollama vectors, because the embedding models are different):
   ```bash
   ./scripts/reembed-all.sh   # re-runs Ollama embeddings against all atoms; may take hours at scale
   ```
5. Switch `deployment.profile` in the config to `local` and update `.env`.
6. Run `verify-deployment.sh` against the local stack.
7. Once verified, decommission the Supabase project.

The reverse migration (local to remote) follows the same steps in reverse order.

---

## Local Model Recommendations

The local deployment is intended for air-gapped or data-residency scenarios. In those scenarios, the LLM itself may also need to run locally. Cole Medin's Dynamous workshops (cited; not reproduced) cover the provider-switching mechanism in detail; the short version for this brain:

The Deno MCP server and agent code honor the `ANTHROPIC_BASE_URL` environment variable. Set it to your local Ollama endpoint:

```
ANTHROPIC_BASE_URL=http://localhost:11434
ANTHROPIC_AUTH_TOKEN=ollama
ANTHROPIC_MODEL=<your-chosen-model>
```

For the agent roles in this brain, model requirements matter:

- **Reasoning agents** (Auditor, QC, Innovator): need strong instruction-following and structured output. On Ollama, `Qwen3-Coder` or `Gemma 4 31B` are the current practical choices on 24 GB VRAM.
- **Workhorse agents** (vertical agents — daily ops): `Qwen 3.5 27B` at Q4 quantization is a good balance.
- **Capture / classification**: `Qwen3 4B` handles fast atomization tasks well and runs on CPU without a GPU.

Latency will be higher than cloud. On a 24 GB VRAM GPU, expect 15–50 tokens/second for a 27B model vs. 60–80 tokens/second for cloud Sonnet. A debrief atomization run that takes 30 seconds on remote may take 3–5 minutes locally. This is acceptable for background processing; it is noticeable for real-time Slack interactions.

See `docs/05-model-matrix.md` for the full mapping of agent roles to model tiers, with local fallback paths.

---

## Security Considerations in Local Mode

The threat model shifts when the brain runs locally. The primary concern in remote mode is credential exposure (secrets on laptops, RLS bypass). In local mode, physical and network security become co-equal concerns:

- The machine running the local stack must be in a physically secure location if it contains real client data.
- Network access to the local Postgres and Deno MCP ports must be restricted to the same host or a secured LAN segment. Do not expose port 5432 or the MCP port to the open internet.
- The docker compose file binds sensitive ports to `127.0.0.1` by default. Do not change this without understanding the implication.
- Local backups require the same encryption discipline as remote backups. `BACKUP_ENCRYPTION_KEY` in `.env` is used by `scripts/brain-backup.sh`; do not store unencrypted backups on the same machine as the live data.

For the full pre-go-live security gate (applies to both remote and local), see [`docs/06-security-checklist.md`](06-security-checklist.md).
