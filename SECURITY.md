# SECURITY.md

Security posture for a roofing client's brain. The full pre-go-live gate is [`docs/06-security-checklist.md`](docs/06-security-checklist.md) (adapted from Cole Medin's Dynamous security walkthrough — referenced, not redistributed).

## Principles

1. **One brain per client, total isolation.** Each client gets a dedicated Supabase project (or, in the local profile, a dedicated stack). No shared multi-tenant database. The *template* compounds across clients; the *data* never does — except through the consent-gated property read path.
2. **The Historian/Researcher boundary is a security control.** Internal retrieval (Historian) and external retrieval (Researcher) run as separate MCP containers with separate credentials. An external web page cannot instruct an agent to exfiltrate brain contents because the agent reading the page has no brain access. Do not collapse these.
3. **Least privilege via RLS.** All Cleverwork tables enable Row Level Security; only `service_role` (used by MCP containers) has full access. The dashboard reads through the MCP container, not directly.
4. **MCPs are MCP containers only.** No local stdio servers. The MCP container authenticates callers with an access key and reaches PostgREST as `service_role`.
5. **Secrets never touch the repo.** They live in `.env` (git-ignored) and, in production, in the Supabase project's secret store. `config/.env.example` documents the names only.
6. **Consent is enforced in code, not policy.** Cross-client reads filter on `consent_flags`, anonymize the source, and write an `atom_access_log` row. Maintenance audits the log monthly for scraping-shaped patterns.

## Reporting

Security issues in this template: email security@cleverwork.io. Do not open a public issue for a vulnerability.

## Pre-go-live gate (summary)

Before a client brain goes live, confirm: RLS enabled on every table · service-role key rotated and stored only in the `brain-mcp` Coolify app env / vault · Historian and Researcher deployed as separate containers · access keys unique per container boundary · backups configured + a restore test passed · consent defaults reviewed with the client · no secrets in git history (`git log -p | grep`-style scan in `verify-deployment.sh`). Full checklist: [`docs/06-security-checklist.md`](docs/06-security-checklist.md).
