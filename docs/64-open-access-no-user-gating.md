# 64 — Open access: no per-user view gating (2026-06-29)

**Decision (Chris):** As of now, **no user-gated views**. Every person who can authenticate to `cc.proexteriorsus.net` must be able to **see and work** every surface of the Command Center. This may change later.

## Why

During a review, Lucinda authenticated successfully but the Invoice Payments → **Export Batches** panel showed *"No export batches yet"* while Chris saw the full list with Confirm-Paid / Return / download actions. Root cause: the access-control layer resolved Lucinda as a **read-only viewer** (her email wasn't on the `COMMAND_CENTER_ROLE_ACCOUNTING_EMAILS` allowlist), so the `approval.decide`-gated endpoints returned 403 and the UI degraded to empty. The same role/permission gating blocked **17 API/page surfaces** (the whole invoice-payment workflow, work-queue decisions, price-foundation review, vendor-territory assign, etc.).

## What changed

`resolveActorFromSessionUser` (`app/command-center/src/lib/access-control.ts`) now short-circuits, after the named-agent roster check, to grant **every authenticated human full access** (`HUMAN_PERMISSIONS`, `departmentAccess: "all"`) — gated by a flag:

- **`COMMAND_CENTER_OPEN_ACCESS`** — default **ON** (unset ⇒ open). Set to `false` / `0` / `off` / `no` to re-enable the admin/purchasing/accounting/viewer allowlists.

This satisfies all 17 `hasPermission` / `actorCanAccessDepartment` call sites at once and removes the `/auth/denied` path for authenticated users.

## What did NOT change (boundaries preserved)

- **WorkOS sign-in is still the gate.** Open access is only as wide as who WorkOS admits — confirmed **org-only** (no public self-signup), so "open" = "all our staff." If WorkOS sign-in is ever opened to the public, set `COMMAND_CENTER_OPEN_ACCESS=false` first.
- **Named-agent identities** (`maya.chen@…`, `alex.rivers@…`, etc.) still resolve to their scoped agent actors — they intentionally **cannot** `approval.decide` (hard rule 5 / agent-confinement, docs/60).
- **Service-token / bearer agent** auth is untouched.
- Identity headers are still never trusted; the sealed WorkOS session remains the only human identity source.

## Re-gating later

Set `COMMAND_CENTER_OPEN_ACCESS=false` in Coolify env, then populate `COMMAND_CENTER_ROLE_ACCOUNTING_EMAILS` / `COMMAND_CENTER_ROLE_PURCHASING_EMAILS` / `COMMAND_CENTER_HUMAN_ADMIN_EMAILS` / `COMMAND_CENTER_VIEWER_DOMAINS`. No code change required.

## Verification

`access-control.unit.test.ts` covers: default-open grants `approval.decide` + all departments; explicit-on; off → allowlist gating (null when not listed, accounting actor when listed); named agents keep scoped perms. Full suite 32/32, `astro build` green. **Live verification is post-deploy** (requires a WorkOS session on the running site).
