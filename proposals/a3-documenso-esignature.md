# A3 — Documenso (self-hosted e-signature for hr documents)

**Status:** conditional_pilot proposed, pending Chris's approval. Nothing is installed.  
**Owner:** Chris (HR platform). Reviewed 2026-11-14.  
**Linear:** PEC-952 (hr document management workflow).  
**ROI:** hr needs to send W-9s, contractor agreements, COI requests and onboarding packets for signature. Hosted providers charge per envelope or a platform fee for embedded and API signing (BoldSign API about $30 a month plus $0.75 per envelope after 40; Dropbox Sign API from $250 a month; DocuSign several thousand a year). Documenso self-hosted has no per-signature cost and keeps signed files on our own server. Mission-grade infrastructure for the hr document flow, so the 10x gate exemption applies; this A3 covers the tool gate (hard rule 12).

## Why this one

Chris asked (2026-11-14) for an open source project with good stars and an active group, with DocuSeal as the fallback. Compared on 2026-11-14:

| Project | Stars | License | Last push | API in the free edition |
| --- | --- | --- | --- | --- |
| Documenso | about 15,800 | AGPL-3.0 | 2026-11-14 | Yes. Community Edition covers a product that calls the Documenso API. |
| DocuSeal | about 19,000 | AGPL-3.0 | 2026-11-09 | No. API and embedding are Pro even on-premises ($20 per user a month plus $0.20 per completed document). |
| OpenSign | about 7,300 | AGPL-3.0 | active | Yes, smaller group. |
| LibreSign | about 850 | AGPL-3.0 | active | Needs Nextcloud. |

DocuSeal has more stars, but hr drives signing through the API, which DocuSeal sells. Documenso is the better fit.

## Scope

- One self-hosted Documenso instance, unmodified upstream Docker image, on the Hetzner Coolify host, on its own subdomain.
- hr calls it server to server through its REST API with an API token: create a document from an approved hr packet, add the signer, read status, download the signed PDF. Documenso webhooks call back into hr.
- hr stays the system of record for templates, packets, sign-off and status. Documenso only runs the signing ceremony and seals the PDF.
- Not an agent tool. No MCP server, no skill, no agent wrapper. Agents never hold the Documenso token; it lives in the hr server environment only.
- Out of scope for the pilot: embedded signing inside hr pages, Documenso's AI features, SSO, billing.

## Gate checklist

- [x] **A3 and intended use:** this file.
- [x] **License and provenance:** AGPL-3.0, Documenso Inc., public repo `documenso/documenso` (about 15.8k stars, 3.5k forks, releases every few weeks). Enterprise-licensed code is separate and needs a key (`NEXT_PRIVATE_DOCUMENSO_LICENSE_KEY`); we leave it unset. AGPL duties apply only if we modify Documenso and offer it over a network. We run it unmodified and call its API from hr, so hr code is not affected. If we ever patch it, the patch is published.
- [x] **Release integrity:** pin `v2.21.1` (2026-10-22). `v2.22.0` came out 2026-11-13 and is too new to adopt. Pin the image by digest at install, record the digest in this file, and never use `latest`.
- [x] **Egress (reviewed from `.env.example` at v2.21.1):**
  - Anonymous telemetry (app version, installation id, node id) is on by default. Set `DOCUMENSO_DISABLE_TELEMETRY=true`.
  - PostHog is off when `NEXT_PUBLIC_POSTHOG_KEY` is blank. Leave blank.
  - Vertex AI, Stripe, Plain, Turnstile, Inngest, S3: off when their keys are blank. Leave blank.
  - Email: SMTP to our own mail provider only (signing invitations and completion notices).
  - Webhooks: only to hr's own endpoint.
  - Optional timestamp authority (`NEXT_PRIVATE_SIGNING_TIMESTAMP_AUTHORITY`) would send document hashes, not contents, to a third party. Off for the pilot.
- [x] **Installer and updates:** Docker image through Coolify. No `curl | bash`, no `npx`, no auto-update. An upgrade is a new pinned digest in a reviewed change.
- [x] **Permissions:** the container gets its own Postgres database and role. It has no credentials for Supabase, GitHub, Coolify or any other app. Public signup is off (`NEXT_PUBLIC_DISABLE_SIGNUP=true`). One admin account (Chris) and one service account whose API token hr uses. Background jobs use the built-in local provider.
- [x] **Secrets:** `NEXTAUTH_SECRET`, the two encryption keys, the database password, the SMTP password and the signing certificate passphrase are generated at install and stored in 1Password and Coolify only. None in any repo.
- [x] **Signing certificate:** self-generated `.p12` (local transport). Signed PDFs are tamper-evident and carry the audit trail, but PDF readers will show the certificate as not publicly trusted. That is acceptable under ESIGN and UETA for W-9s and agreements. A publicly trusted certificate can be added later without changing hr.
- [x] **SkillSpector:** not applicable. This is a web application, not a skill, plugin or agent package.
- [x] **Local-MCP ban:** not affected. No MCP server is involved.
- [x] **Rollback:** switch hr's delivery setting back to "not sent" (packets already default to it), stop the Coolify app, export signed PDFs, drop the Documenso database and remove the DNS record. hr data is untouched because hr keeps its own packet records.
- [ ] **Human approval:** Chris, pending.

## Pilot controls

1. Staging first: Documenso staging instance wired to staging-hr with invented data only.
2. Nothing is sent to a signer without a person pressing Send in hr. Documenso is never given a list to send on its own.
3. Sensitive fields (TIN, bank details) are typed by the signer on the signing page and are never prefilled by hr.
4. hr stores only the envelope id, status, timestamps, a hash of the signed PDF and, for a W-9, TIN type and last four. The signed PDF stays in Documenso's own database (default `database` transport).
5. Production use starts only after Chris approves this A3 and decides item 1 below.

## Open decisions for Chris

1. **Where signed W-9 and ACH forms live.** hr must not store a full TIN or bank number, and the standing rule says app data lives in the source-of-truth Supabase. A signed W-9 has the full TIN on it. Recommended: the signed PDF stays in Documenso's own Postgres on our server, treated as the signing vault, and hr keeps only the reference, hash and last four. The alternative is a private Supabase Storage bucket with no app read path.
2. **Subdomain.** Suggested `sign.proexteriorsus.net` (staging: `staging-sign.proexteriorsus.net`).
3. **Sender address** for signing emails, for example `documents@proexteriorsus.net`.

## Not verified yet

- Whether signing can be embedded inside an hr page on the Community Edition. The pilot does not depend on it: the signer opens the Documenso signing link on our subdomain.
- The exact image digest for `v2.21.1` (recorded at install).
- Field prefill and template coverage of the v2 API against the hr packet shape. To be proven on staging before any production use.

## Re-review triggers

A major version, a license change, any new default-on outbound call, or a move to embedded signing or the enterprise edition.
