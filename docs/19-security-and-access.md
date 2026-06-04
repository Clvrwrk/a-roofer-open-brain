# Security & Access

Status: draft v0.1
Related: [06-security-checklist.md](06-security-checklist.md), [16-platform-architecture-and-topology.md](16-platform-architecture-and-topology.md), [`deployment/remote/dashboard/AUTH.md`](../deployment/remote/dashboard/AUTH.md), [`deployment/remote/DEPLOYMENT-RUNBOOK.md`](../deployment/remote/DEPLOYMENT-RUNBOOK.md)

The production security posture for the deployed platform. Extends the original `06-security-checklist.md` with WorkOS, the platform secrets, and key handling.

---

## 1. Human access (WorkOS RBAC)

Login is WorkOS only; no local passwords. Roles and the people behind them:

| Role | Person | Can do |
| --- | --- | --- |
| admin / ceo | Chris | everything; CEO-approve agreements; settings; gate override |
| purchasing | Roberto Huerta | agreements (add/scope/line-approve), price-list refresh, territories |
| accounting | Lucinda Dunn | invoice payment (paid/unpaid), gate override, credit memos |
| viewer | field / leadership | read-only dashboards |

Enforcement is **at the data layer**: every `/api/*` write re-checks the WorkOS session + role server-side (not middleware-only). Read routes require any authenticated session. Matrix lives in `AUTH.md`; roles are abstract — never hard-code a person as a role.

## 2. Service & agent credentials

- **Service-role Supabase key is server-side only** — in MCP/app containers, never the browser. The browser uses nothing privileged (the Maps key is referrer-restricted and public-by-design).
- **Per-runtime-boundary keys are distinct:** Historian (`brain-mcp`) and Researcher (`researcher-mcp`) hold separate credentials so a compromise of one can't reach the other's surface.
- **Agents act within their trust tier:** inferred/generated content is `evidence`; promotion to `instruction` needs human confirmation; only QC changes `trust_tier`. Hermes never deletes atoms, edits provenance, or publishes.

## 3. The internal/external boundary (recap, because it's the crown jewel)

`brain-mcp`/Historian: brain only, **no public internet**. `researcher-mcp`/Researcher: external web/enrichment only, **never the brain**. Enforced at the network layer on the host (§4 of the runbook). This is the primary defense against prompt-injection exfiltration.

## 4. Secrets management

- All secrets in **Coolify env** (prod) / `.env` (dev), names mirrored in `config/.env.example`, **never committed** (`.gitignore` covers `.env`).
- `verify-deployment.sh` greps tracked files for secret-shaped strings as a guardrail.
- **Rotation policy:** rotate on personnel change, on suspected exposure, and on a routine cadence. **Immediate rotation owed at go-live** for anything shared in chat during development — the **Google Maps key** and the **Supabase service-role key** — plus the temporary bootstrap SSH key.

## 5. SSH & host access

- Per-operator SSH **keypairs**; only **public** keys on the server (`authorized_keys`). Private keys never leave the operator's machine and are **never pasted into chat or committed**.
- Root login disabled; password auth disabled; `ufw` + `fail2ban`; security auto-updates. (Runbook §1.)
- The temporary bootstrap key is replaced by per-operator keys and rotated out at go-live.

## 6. App-layer hardening

Strict CSP; security headers (HSTS, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy); rate-limited write endpoints; minimal client JS / dependency surface (the reason for Astro SSR); Sentry scrubbing for PII/secrets.

## 7. Audit & accountability

Every privileged action is recorded with **who/when/what** — today in `invoice_action_log`, agreement `ceo_verified_by/at`, `price_refresh_request` status trail, and territory decisions. The actor is the WorkOS user id once auth is live (replacing the manual operator field). As agents mature, the same actions are mirrored into the One Brain (`public.thoughts`, `trust_tier='instruction'`) so the human-fallback record and the agent record converge.

## 8. Consent & data handling

Cross-client property sharing only through the consent-gated read path with anonymization + `atom_access_log` (CONVENTIONS §7). PII handling per the marketing standard; website form data stays service-role-only. No customer-facing surface in v1.
