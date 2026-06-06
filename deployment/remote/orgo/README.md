# Pro Exteriors Orgo Desktops

This folder records the Orgo desktop plan for the named Google Workspace agent identities.

## Access Model

Google Workspace identity and Orgo desktop are separate capabilities:

- Workspace identity: all seven named agents have `@cc.proexteriorsus.net` accounts.
- Persistent Orgo desktop: only the five roles that need browser state, downloads/uploads, portal sessions, or GUI-only workflows.
- Service-agent API access: every Open Brain service agent can use Command Center machine routes with a bearer token, so desktop login is never the only way to resume work.

## Persistent Desktops

| Desktop | Workspace account | Why it exists |
| --- | --- | --- |
| `pe-maya-chen` | `maya.chen@cc.proexteriorsus.net` | Invoice/order/PDF intake, Drive, and approved vendor portal downloads |
| `pe-alex-rivers` | `alex.rivers@cc.proexteriorsus.net` | Price agreements, SKU/UOM evidence, and product catalog checks |
| `pe-casey-morgan` | `casey.morgan@cc.proexteriorsus.net` | Vendor challenge drafts and human-approved send packets |
| `pe-rowan-vale` | `rowan.vale@cc.proexteriorsus.net` | External-only newsletters, source monitoring, and public research signups |
| `pe-lena-brooks` | `lena.brooks@cc.proexteriorsus.net` | Reviews, Google Business Profile, YouTube/Drive media, and content workflows |

Workspace-only identities:

- `jordan.price@cc.proexteriorsus.net`: finance/reporting packets first; add desktop only if browser state becomes necessary.
- `sam.torres@cc.proexteriorsus.net`: QA/compliance review queues first; add desktop only if sampling workflows require it.

## Guardrails

- No agent uses Chris's admin account.
- No desktop gets broad admin, billing, DNS, or payment permissions.
- Rowan remains external-only and does not receive Supabase service-role, internal brain, or repo secrets.
- Agents draft and prepare evidence; humans approve external sends, publication, payment, destructive writes, and permission changes.
- Use `auto_stop_minutes: 30` by default so inactive desktops suspend while preserving state.

## Provisioning

Set `ORGO_API_KEY` in the local environment or Coolify secret store. If the workspace already exists, also set `ORGO_WORKSPACE_ID` so the provisioner creates desktops in that workspace instead of creating a new one. Then run:

```bash
node deployment/remote/orgo/provision-orgo-desktops.mjs
```

The script is idempotent by desktop name. It writes the non-secret registry to `deployment/remote/orgo/pro-exteriors-orgo-desktops.json`.

Do not commit VNC passwords or transient connection secrets. Orgo rotates those tokens on restart, so the registry stores only stable IDs, names, status, sizing, and dashboard/connection URLs.
