# Deployment Runbook — Pro Exteriors Open Brain (Hetzner CPX41)

Status: draft v0.1
Host: `PE-open-brain` · CPX41 (8 vCPU / 16 GB / 240 GB) · Ubuntu · us-west (Hillsboro, OR) · `5.78.124.10`
Public Command Center: `https://cc.proexteriorsus.net`
Related: [16-platform-architecture-and-topology.md](../../docs/16-platform-architecture-and-topology.md), [19-security-and-access.md](../../docs/19-security-and-access.md), [20-observability-and-incident-response.md](../../docs/20-observability-and-incident-response.md), [27-hetzner-coolify-agent-host.md](../../docs/27-hetzner-coolify-agent-host.md)

> This is the repeatable procedure to provision and operate the 24/7 production host. Run top-to-bottom for a fresh box; individual sections double as routine-ops references. **No private keys or secret values live in this file** — only names/placeholders mirrored in `config/.env.example`.

---

## 0. Prerequisites

- Hetzner CPX41 reachable at `5.78.124.10`, Ubuntu LTS.
- DNS access for `proexteriorsus.net`, with `cc.proexteriorsus.net` pointed at the host.
- Accounts/keys ready (values go in Coolify env, never here): Supabase, WorkOS, AgentMail, Orgo, Sentry, GoHighLevel, Google Workspace, Serper, SerpAPI, Firecrawl, Tavily, Exa, Google Maps.
- Each operator has their **own** SSH keypair; only **public** keys are placed on the server.

## 1. Access hardening (do this first)

1. Add each operator's **public** key to `/home/deploy/.ssh/authorized_keys` (create a non-root `deploy` user). The temporary bootstrap key is replaced here and **rotated out** (see §11).
2. `sshd_config`: `PermitRootLogin no`, `PasswordAuthentication no`, `PubkeyAuthentication yes`; restart `ssh`.
3. Firewall: `ufw default deny incoming`; allow `22` (ideally from known admin IPs), `80`, `443`; `ufw enable`.
4. `fail2ban` for SSH; `unattended-upgrades` for security patches.
5. Confirm you can log in as `deploy` with a per-operator key **before** closing the bootstrap session.

## 2. Base system

```
apt update && apt -y upgrade
timedatectl set-timezone America/Chicago        # PE's operating TZ
# Docker engine + compose plugin (official convenience script or apt repo)
# 2 GB swap if not present (16 GB RAM is adequate but swap adds safety)
```

## 3. Coolify (the deploy control plane)

1. Install Coolify (official installer). It manages Docker builds/deploys, Let's Encrypt TLS, env/secrets, health checks, and auto-restart.
2. Put the Coolify dashboard behind TLS + auth; restrict its port to admin IPs.
3. Create a project **`pe-open-brain`** and one **destination** (this host's Docker).

## 4. Container set (Coolify resources)

| Resource | What | Egress | Health | Restart |
| --- | --- | --- | --- | --- |
| `command-center` | Astro SSR app (WorkOS, Sentry) | public web (TLS in) | `/healthz` | always |
| `brain-mcp` | **Historian** — internal brain access | **brain only, no public internet** | tools/list | always |
| `researcher-mcp` | **Researcher** — external web/enrichment | external APIs only, **never the brain** | tools/list | always |
| `bridges` | GHL · AccuLynx · AgentMail · Google | respective APIs | per-bridge | always |
| `agent-runtime` | Hermes + agent loops + cron | brain + AgentMail + Slack + Sentry | heartbeat | always |
| `openclaw` | external agent shell/browser workflow runtime | external only by default | heartbeat | always |
| `memsearch-indexer` | curated memory indexing into Milvus/Zilliz | Milvus/Zilliz only | `memsearch stats` | on demand / scheduled |

Each resource: pin the image/repo + commit, set env (per §6), CPU/mem limits, health check, and `restart: always`. The two-process boundary in §3 of the architecture doc is enforced at the network layer — `brain-mcp` gets no route to the public internet.

## 5. TLS, domains, reverse proxy

Coolify provisions Let's Encrypt certs per resource. Map: `cc.proexteriorsus.net` → command-center; internal MCPs stay on the private Docker network (not publicly routable). Auto-renew handled by Coolify.

## 6. Secrets & env

Set per-resource env in Coolify (names from `config/.env.example`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server/MCP only), `WORKOS_*`, `AGENTMAIL_API_KEY`, `ORGO_API_KEY`, `SENTRY_DSN`, `GHL_*`, Google OAuth, `SERPER_API_KEY`, `SERPAPI_API_KEY`, `FIRECRAWL_API_KEY`, `TAVILY_API_KEY`, `EXA_API_KEY`, `GOOGLE_MAPS_*`. **Distinct access keys per runtime boundary** (Historian ≠ Researcher). Never commit values.

## 7. Supabase

Managed project `rnhmvcpsvtqjlffpsayu`. Enable **PITR**. App + MCP connect with the service role **server-side only**; RLS stays service-role-only; the browser never holds the key.

## 8. Backups & disaster recovery

- **Supabase PITR** — primary RPO for brain data.
- **Nightly logical dump** of the brain → **off-box encrypted object storage** (separate provider/region from Hetzner).
- **Nightly config/repo snapshot** (Coolify config export + this repo) off-box.
- **Restore test quarterly** — Hermes verifies restorability and flags failures.
- **Rebuild path (single-host SPOF):** new CPX41 → run §1–§7 → restore latest dump + redeploy Coolify resources from saved config. Target **RTO ≤ 4 h, RPO ≤ 24 h** (PITR tightens RPO for Supabase). Keep this sequence current; it is the insurance policy for the single box.

## 9. Monitoring

`SENTRY_DSN` on every resource; container health checks (§4); an **external uptime pinger** independent of the host hits `/healthz`. Hermes consumes Sentry + health and posts status to Slack; genuine incidents escalate to a human (see `20-observability-and-incident-response.md`).

## 10. Go-live / cutover

1. Provision §1–§9 in a staging context; deploy `command-center` from the Astro build.
2. Verify: WorkOS login + roles, gate enforcement (a blocked invoice cannot be paid), audit logging, all `/api/*` endpoints live, the two-process boundary (brain-mcp has no public egress).
3. Deploy `agent-runtime`; run Hermes one week **propose-only** (per `HERMES.md`).
4. Point DNS; keep the prototype `dist/` static app as the offline fallback admin during cutover.

## 11. Routine ops

- **Deploy:** git push → Coolify deploy webhook (build → health check → swap). **Rollback:** redeploy the prior commit in Coolify.
- **Restart / logs:** via Coolify per resource.
- **Patching:** `unattended-upgrades` for security; planned reboots in a low-traffic window with Hermes notified.
- **Key rotation (do at go-live):** replace/rotate the temporary bootstrap SSH key; rotate any credential shared in chat during development — the **Google Maps key** and the **Supabase service-role key** — and re-issue per-boundary MCP keys. Update Coolify env; never commit.
