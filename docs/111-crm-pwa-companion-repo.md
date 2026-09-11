# 111 — CRM_PWA: the sister repo, and where its side of the contract lives

**Date:** 2026-09-11 · **Pairs with:** [docs/110](110-cc-crm-boundary-and-live-branch.md) (boundary + live branch), [deployment/proxy/README.md](../deployment/proxy/README.md) (host composition)

The CRM is a separate system in a separate repository. Its code, its own docs and its half of the CC ⇄ CRM contract are here:

| Need | In `Clvrwrk/CRM_PWA` (branch `main`) |
|---|---|
| Orientation, repo map, how to run, env names, deploy | [README.md](https://github.com/Clvrwrk/CRM_PWA/blob/main/README.md) |
| **How the two work surfaces function together** (Sales mirror, shared identity, planned read contract, rules) | [docs/integration/COMMAND-CENTER.md](https://github.com/Clvrwrk/CRM_PWA/blob/main/docs/integration/COMMAND-CENTER.md) |
| Full code review of the CRM (2026-09-11) | [docs/review/2026-09-11-code-review.md](https://github.com/Clvrwrk/CRM_PWA/blob/main/docs/review/2026-09-11-code-review.md) |
| **UI/UX comparison, CC as source of truth, mobile simplicity plan (2026-09-11)** — includes the CC's own drift from `Design.md` (15 px body, Inter not loaded, purple segmented accent) to fix here | [docs/design/CC-PARITY-UX-REVIEW.md](https://github.com/Clvrwrk/CRM_PWA/blob/main/docs/design/CC-PARITY-UX-REVIEW.md) |
| Data model, RPC contract, integrations, signing, AI | [docs/architecture/](https://github.com/Clvrwrk/CRM_PWA/tree/main/docs/architecture) · [docs/api/](https://github.com/Clvrwrk/CRM_PWA/tree/main/docs/api) |
| Release runbook and activation evidence A01–A11 | [docs/delivery/RELEASE-RUNBOOK.md](https://github.com/Clvrwrk/CRM_PWA/blob/main/docs/delivery/RELEASE-RUNBOOK.md) |
| Sales mirror build/isolation evidence | [docs/delivery/CC-SALES-MIRROR.md](https://github.com/Clvrwrk/CRM_PWA/blob/main/docs/delivery/CC-SALES-MIRROR.md) · [CC-SALES-ISOLATION-REVIEW.md](https://github.com/Clvrwrk/CRM_PWA/blob/main/docs/delivery/CC-SALES-ISOLATION-REVIEW.md) |
| Live status the CRM team maintains | [docs/delivery/STATUS.md](https://github.com/Clvrwrk/CRM_PWA/blob/main/docs/delivery/STATUS.md) |

## What the Command Center depends on from that repo

- **Packages** (vendored into the archived companion build, never into `main` here): `@proexteriors/contracts`, `@proexteriors/crm-server`, `@proexteriors/sales-workspace`, `@proexteriors/design-system`. Deployed companion pins 0.1.19 / 0.1.19 / 0.1.32 / 0.1.0; the repo is at 0.1.22 / 0.1.22 / 0.1.42 / 0.1.0.
- **Database objects** in the shared project: schemas `crm`, `crm_private`, `crm_gateway`; roles `member`, `crm_property_reader`.
- **CRM changes to surfaces WE own or depend on** (found by the 2026-09-11 CRM code review, verified live the same day — this supersedes the earlier "property_card is the only touch" wording):
  - `ALTER ROLE authenticator SET pgrst.db_pre_request = 'crm_gateway.api_pre_request'` and `GRANT member TO authenticator` — **every Command Center PostgREST request runs this CRM function first.** A fault there is a total `/rest/v1` outage for us. Watch for it: the runtime board should grow a probe of `/rest/v1/rpc` (playbook item).
  - `REVOKE EXECUTE … FROM PUBLIC` on every SECURITY DEFINER function in `public`, `storage`, `graphql_public` with per-role re-grants, and `REVOKE USAGE ON SCHEMA public FROM PUBLIC` (`has_schema_privilege('public','public','USAGE') = false` live).
  - On `public.properties`: policy `crm_property_reader_projection`, column grant `SELECT (id, address_full, city, state, state_abbrev, zip, country)` to `crm_property_reader`, two FKs from `crm.*`, and `crm.create_effort` **inserts rows** (0 so far — the CRM's canonical data is still empty). CRM-created rows will carry null street/geo columns and no `acculynx_job_id`: add them to the silent-NULL-FK watch ([[silent-null-fk-derivation]] playbook) and never assume `properties` rows all come from AccuLynx.
  - `REVOKE … FROM service_role` on `crm_private.*` groups — our service-role client cannot read CRM private tables (fine, but now written down).
  These are not in `schemas/` here, so a `db reset` from our migrations alone would not reproduce prod. Open follow-up (docs/110 §5 A3): CC-owned `public.create_property_from_crm(jsonb)` RPC and `public.v_property_card` view so the CRM stops writing to and policing our table directly.
- **Host objects**: the path-scoped Traefik route `crm-cc-sales-mirror.yml` and the `cc-sales-<sha>` container it targets.
- **Env parity**: `WORKOS_COOKIE_PASSWORD`, `WORKOS_CLIENT_ID` identical on both sides.

## What that repo depends on from here

- `public.properties.id` as the physical property identity (never renamed, never re-keyed).
- The WorkOS tenant and the sealed-session cookie format produced by `app/command-center/src/lib/session.server.ts`.
- The Coolify host, Traefik, and the rule in docs/110 §3 that no dynamic file may match the CC host without a path restriction.
- The runtime board (`/agents`) as the shared "is it up" surface.

Local working copy on Chris's machine: `/Users/chussey/Documents/ChatGPT/crm.proexteriorsus.net` (tracks `origin/codex/prd-grill`, merged to `main` 2026-09-11).
