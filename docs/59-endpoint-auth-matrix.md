# 59 — Endpoint auth matrix (Command Center)

**Date:** 2026-06-28  
**Owner:** Security Guardian / Code Reviewer  
**Related:** [`app/command-center/src/middleware.ts`](../app/command-center/src/middleware.ts), [`docs/58-dev-vs-ops-agent-delineation.md`](58-dev-vs-ops-agent-delineation.md)

## Legend

| Auth | Meaning |
| --- | --- |
| **Public** | No WorkOS session; may use token/signature instead |
| **WorkOS** | Human browser session |
| **Bearer** | `Authorization: Bearer` service agent token |
| **Magic** | Single-use or scoped magic link token |
| **Dev** | DevTeam service token (`dev-conductor`) only |

## API routes

| Route | Methods | Auth | Write | Notes |
| --- | --- | --- | --- | --- |
| `/api/agent/session` | GET | Bearer, WorkOS, local | no | Discovery |
| `/api/agent/work-queue` | GET | Bearer, WorkOS | no | Department-scoped |
| `/api/agent/work-queue/[id]/decision` | POST | Bearer, WorkOS | yes | Human approval gates |
| `/api/agent/intake` | POST | Bearer, named, local | yes | Roofing ops; not dev plane |
| `/api/agentmail/webhook` | POST | Public (Svix sig) | yes | Verified signature required |
| `/api/price-agreement/submit/[token]` | POST | Magic | yes | Vendor submission |
| `/api/invoice-audit/*` | GET/POST | WorkOS, Bearer | mixed | Financial paths — RBAC |
| `/api/price-agreement/*` | GET/POST | WorkOS | mixed | Human purchasing flows |
| `/api/operations/estimate-audit/save` | POST | WorkOS | yes | Ops human |
| `/api/performance/warm` | GET/POST | WorkOS, Bearer | no | Cache warm |
| `/api/performance/cadence` | GET | WorkOS, Bearer | no | Activity cadence |
| `/api/dev/activity-summary` | GET | Dev | no | DevTeam plane only |
| `/api/dev/webhooks/github` | POST | Public (HMAC) | yes | Files Linear issues |
| `/api/dev/webhooks/sentry` | POST | Public (secret) | yes | Files Linear issues |
| `/api/vendor-territories` | GET | WorkOS | no | |
| `/api/vendor-territories/assign` | POST | WorkOS | yes | Admin |
| `/api/data-quality/*` | GET/POST | WorkOS | mixed | |
| `/api/credit-memos/disposition` | POST | WorkOS | yes | |
| `/api/order-audit/lines` | GET | WorkOS | no | |
| `/api/product-surface.json` | GET | WorkOS | no | |

## DevTeam plane rules

- Dev agents (`dev-conductor` token) may read `/api/dev/*` only.
- Dev agents must **not** receive `SUPABASE_SERVICE_TOKEN` or write `dashboard_action_log`.
- Roofing service tokens must not call `/api/dev/*`.

## Review cadence

- **On every PR** touching `src/pages/api/` — Code Reviewer checks this matrix.
- **Weekly** — Security Guardian diff vs live middleware public prefixes.
- **Red Team Cycle 2** — attempt RBAC bypass on changed routes.
