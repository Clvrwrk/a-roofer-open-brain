# ZoomInfo DevPortal Manual (Operational Playbook)

This manual is the implementation reference for building and operating ZoomInfo-powered applications through DevPortal for:

- Faster speed-to-lead execution
- Better B2B commercial property `->` sold-job matching
- Reliable, credit-aware, production-safe API operations

It is written to be used by product, engineering, RevOps, and AI-agent builders.

## 1) What DevPortal Is (And Why It Matters)

ZoomInfo DevPortal is the control plane for creating OAuth apps, assigning scopes, and managing credentials for ZoomInfo APIs. It sits on ZoomInfo's Okta-based OAuth infrastructure and is the mandatory setup surface before you can safely run production API integrations.

Core outcomes:

- Register internal or partner applications
- Assign least-privilege OAuth scopes
- Generate/rotate client credentials
- Test quickly with DevPortal-generated bearer tokens

## 2) Source-of-Truth Endpoints and Foundations

- Base API URL: `https://api.zoominfo.com/gtm`
- OAuth authorize endpoint: `https://api.zoominfo.com/gtm/oauth/v1/authorize`
- OAuth token endpoint: `https://api.zoominfo.com/gtm/oauth/v1/token`
- Auth header format: `Authorization: Bearer <access_token>`

## 3) Prerequisites Checklist

Before creating an app, confirm all of the following:

1. Your org has Enterprise API or Copilot entitlement (or both).
2. User has DevPortal subscription assigned in ZoomInfo Admin Portal.
3. You know if app is:
   - Internal-only (auto-approved), or
   - Partner + internal (requires ZoomInfo review and prior partner approval).
4. You have approved redirect URIs for every environment:
   - local dev
   - staging
   - production

## 4) App Creation in DevPortal (Step-by-Step)

1. Open DevPortal from the ZoomInfo app launcher/waffle menu.
2. Click **Create App**.
3. Enter app name and optional logo.
4. Choose **Application Type**:
   - `For internal use only` (default, fastest path), or
   - `For partner and internal use only` (review workflow).
5. Add **Sign-in Redirect URIs** (must exactly match runtime callback URIs).
6. Select required scopes only (least privilege).
7. Click **Create**.
8. Copy and securely store:
   - `Client ID`
   - `Client Secret`

Operational rule: never commit client credentials to git, docs, or memory artifacts.

## 5) Choosing the Right OAuth Flow

### Authorization Code + PKCE (user-context flows)

Use when actions must be attributable to individual users, personalization matters, or partner app distribution is needed.

Typical uses:

- Multi-user SaaS integrations
- User-personalized recommendations/research
- Partner-distributed apps

### Client Credentials (server-to-server)

Use for backend jobs where user sign-in is unnecessary and an integration user is acceptable.

Typical uses:

- Scheduled syncs
- Back-office enrichment pipelines
- Batch ETL/activation jobs

### Refresh Token Flow

Use only with Authorization Code + PKCE apps to keep sessions alive without forcing repeated user logins. Refresh tokens are rotated: each token is single-use and replaced by a new one.

## 6) OAuth Implementation Blueprint

### 6.1 Authorization Code + PKCE

1. Build `code_verifier` (high-entropy random).
2. Derive `code_challenge` (SHA256 + base64url).
3. Redirect user to authorize URL with:
   - `client_id`
   - `redirect_uri`
   - `response_type=code`
   - `code_challenge`
   - `state`
   - optional `scope`
4. Receive callback with `code` (+ `state`).
5. Exchange code at token endpoint with:
   - `grant_type=authorization_code`
   - `code`
   - `redirect_uri`
   - `code_verifier`
   - client auth via HTTP Basic (recommended)
6. Store access + refresh token securely.
7. Refresh with `grant_type=refresh_token` before/at expiry.

### 6.2 Client Credentials

Single token exchange call:

- POST token endpoint with `grant_type=client_credentials`
- Send credentials with HTTP Basic (recommended)
- Receive `access_token`, `expires_in`, `scope`, `token_type`

## 7) Scopes: Minimum-Viable Permission Design

Start from feature requirements and map to scopes:

- Company/contact search + enrich:
  - `api:data:company`
  - `api:data:contact`
- Intent/news/scoops:
  - `api:data:intent`
  - `api:data:news`
  - `api:data:scoops`
- Insights:
  - `api:insights:read`
- Recommendations/lookalikes:
  - `api:recommendations:read`
- GTM config read/manage:
  - `api:gtm-config:read`
  - `api:gtm-config:manage`
- Audiences:
  - `api:audience:read`
  - `api:audience:manage`
  - `api:audience-member:read`
  - `api:audience-member:manage`

Rules:

- Request only what each app needs.
- Scopes requested in OAuth must be a subset of scopes assigned in DevPortal.
- Missing scopes will produce `403` errors.

## 8) Search -> Enrich Contract (Cost and Quality Control)

ZoomInfo's canonical pattern is:

1. **Lookup** valid filter values
2. **Search** to find and rank candidate records (free for many operations)
3. **Enrich** only selected records requiring full detail (may consume credits)

Why this matters:

- Lower cost (credits)
- Better precision
- Better latency and throughput

## 9) Credits and Spend Controls

Key economics:

- Search/lookup/discovery are generally free.
- Enriching a new record typically consumes one bulk data credit.
- Record stays "Under Management" for 12 months from first enrich; re-enriching that record in that window does not consume an additional data credit.

Operational guardrails:

- Always estimate worst-case credit exposure before bulk enrich:
  - `worst_case_credits = candidate_records_to_enrich`
- Introduce confirm gates (human or policy) before large paid enrichments.
- Rank then enrich top N first.

## 10) Rate Limits and Throughput Design

ZoomInfo enforces per-second, per-hour, and per-day limits at once.

Common tiers:

- Builder: 5 req/s
- Standard: 25 req/s
- Scaling: 35 req/s

Implementation requirements:

- Read and log `X-RateLimit-*` headers on every response.
- On `429`, honor:
  - `Retry-After`
  - `X-RateLimit-Rejected-Bucket`
  - `X-RateLimit-Reset`
- Use adaptive throttling; do not use fixed 1s retry loops.

## 11) Pagination, Batch, and Bulk Workload Patterns

Pagination:

- Use `page[number]` + `page[size]` on search endpoints.
- Max page size: 100.

Batch enrich:

- Up to 25 records per enrich call for core company/contact enrich patterns.

Production pattern:

1. Run narrow search.
2. Page only what you need.
3. Rank candidates.
4. Enrich selected subset.
5. Cache enriched IDs for under-management horizon.
6. Track credits + records + request volumes.

## 12) Error Handling and Recovery Matrix

### 400 (validation/input)

- Fix request shape or values; run lookup to resolve controlled vocabulary.

### 401 (invalid/missing/expired token)

- Refresh/re-authenticate; ensure auth header is present.

### 403 (scope/entitlement)

- Do not blind retry.
- Fix scope assignment or entitlement package.

### 429 (rate limit)

- Back off using returned headers.
- Re-queue work by rejected bucket (second/hour/day).

### 5xx/504

- Retry with exponential backoff and jitter.
- Reduce payload complexity if repeated.

## 13) DevPortal Token Generator for Fast Testing

DevPortal provides a **Generate Bearer Token** utility for quick API testing before full OAuth implementation.

Important:

- Tokens generated this way are production tokens.
- Calls consume real credits.
- Calls are fully rate-limited.

Use this only for controlled testing and proof-of-concept, not as your long-term auth mechanism.

## 14) Webhooks and Event-Driven Design

Prefer event-driven orchestration over polling for long-running jobs and signal updates.

Use events to:

- Trigger downstream workflows when jobs complete
- Notify teams when thresholds are crossed
- React to new intent/scoops/signals

Operational note: configure retry behavior and throttling at subscription/event layer where available.

## 15) MCP Surfaces (AI Agent Enablement)

ZoomInfo exposes MCP-related surfaces documented for:

- Data/tool access via `https://mcp.zoominfo.com/mcp` (ZoomInfo MCP overview)
- Documentation MCP server at `https://docs.zoominfo.com/mcp`

Use MCP for agent workflows where tool discovery, schema awareness, and conversation-native retrieval are preferred over hand-written API clients.

## 16) Speed-to-Lead Blueprint (Applied to Your Framework)

Recommended pipeline:

1. Intake trigger: inbound lead/account candidate.
2. Resolve filters via lookup.
3. Search companies with ICP filters.
4. Search contacts inside top company set.
5. Pull intent/scoops/news for urgency ranking.
6. Score + prioritize (fit + intent + freshness + role seniority).
7. Enrich only top-tier accounts/contacts needed for activation.
8. Route to owner/channel and open follow-up tasks.

Key KPI impact targets:

- Time-to-first-qualified-contact
- Enrich credits per converted opportunity
- Response SLA adherence
- Meeting-set rate by signal quality tier

## 17) B2B Commercial Property <-> Sold Job Layer-Cake Blueprint

Use ZoomInfo to strengthen joins between property opportunities and sold-job outcomes.

Suggested layer model:

1. **Property Layer**: site/building identity, geography, type, ownership clues.
2. **Account Layer**: matched company entities tied to property portfolio/ownership/operator roles.
3. **Contact Layer**: DMU at each account (ops, facilities, finance, procurement).
4. **Signal Layer**: intent/scoops/news/insights/web activity.
5. **Execution Layer**: outreach, meetings, bids, won/lost, cycle time.
6. **Learning Layer**: feedback loops for scoring and enrichment thresholds.

Practical matching tactics:

- Start with company-domain/company-ID normalization before contact expansion.
- Use similar-company/recommendation endpoints for whitespace expansion around won accounts.
- Keep "paid enrich" separate from "free search/lookup" in pipeline stages for cost observability.

## 18) Security, Compliance, and Ops Controls

- Store tokens/secrets in secret manager only.
- Rotate client secrets on a schedule and after any suspected exposure.
- Enforce least-privilege scopes per app.
- Separate apps by environment (`dev`, `staging`, `prod`) and by major use case.
- Add request/response audit logging with redaction for sensitive payloads.

## 19) Build Checklist (Definition of Done)

An app is considered production-ready only when all are true:

- DevPortal app created with correct type and reviewed where needed.
- Redirect URIs are exact and environment-specific.
- OAuth flow implemented and tested end-to-end.
- Scope set is minimal and validated.
- Token refresh and rotation logic implemented.
- 429/5xx retry + backoff behavior verified.
- Credit guardrails and cost alerts enabled.
- Search->enrich workflow and batch caps enforced.
- Observability live (success, failures, latency, quota, credit burn).
- Security review complete (secret handling + logging hygiene).

## 20) High-Confidence Launch Sequence

1. Build with DevPortal token utility for fast endpoint exploration.
2. Implement full OAuth flow in app code.
3. Validate scopes and entitlements in staging.
4. Run pilot with strict enrich caps.
5. Measure speed-to-lead + conversion lift.
6. Expand rollout and tune scoring + enrichment policy.

## 21) Open Questions to Resolve Before Full Rollout

1. Which workflows need user-level attribution (PKCE) vs integration-user attribution (client credentials)?
2. What is your approved per-workflow monthly credit budget?
3. What is your enrichment confirmation threshold (auto vs human approval)?
4. Which properties/accounts define "Tier 1" for immediate enrichment/routing?

## References

- [How to Authenticate Apps (OAuth) in ZoomInfo DevPortal](https://help.zoominfo.com/s/article/How-to-Authenticate-Apps-OAuth-in-ZoomInfo-DevPortal)
- [Overview of ZoomInfo Enterprise API](https://help.zoominfo.com/s/article/Overview-of-ZoomInfo-Enterprise-API)
- [ZoomInfo APIs Home](https://docs.zoominfo.com/)
- [General Overview](https://docs.zoominfo.com/docs/general-overview)
- [API Reference Overview](https://docs.zoominfo.com/reference/overview)
- [App Creation - Developer Portal Guide](https://docs.zoominfo.com/docs/app-creation-developer-portal-guide.md)
- [Authorization](https://docs.zoominfo.com/docs/authorization.md)
- [Authorization Code Flow with PKCE](https://docs.zoominfo.com/docs/authorization-code-flow-with-pkce.md)
- [Client Credentials Flow](https://docs.zoominfo.com/docs/client-credentials-flow.md)
- [Refresh Token Flow](https://docs.zoominfo.com/docs/refresh-token-flow.md)
- [Generate Access Tokens in DevPortal](https://docs.zoominfo.com/docs/generate-bearer-token-in-devportal.md)
- [ZoomInfo OAuth 2.0 Scopes](https://docs.zoominfo.com/docs/zoominfo-oauth-20-scopes.md)
- [Credits](https://docs.zoominfo.com/docs/credit-usage-and-limits.md)
- [Rate Limits](https://docs.zoominfo.com/docs/rate-limits.md)
- [Pagination, Batching and Bulk](https://docs.zoominfo.com/docs/pagination-batching-and-bulk.md)
- [Error Handling](https://docs.zoominfo.com/docs/error-handling.md)
- [API Conventions](https://docs.zoominfo.com/docs/api-conventions.md)
- [Webhooks and Events](https://docs.zoominfo.com/docs/webhooks-and-events.md)
- [ZoomInfo Insights API](https://docs.zoominfo.com/docs/zoominfo-insights-api.md)
- [ZoomInfo MCP Overview](https://docs.zoominfo.com/docs/zi-api-mcp-overview.md)
- [ZoomInfo Docs MCP Overview](https://docs.zoominfo.com/docs/mcp.md)
- [Enterprise API Getting Started Guide (PDF)](https://tech-docs-library.zoominfo.com/enterprise-api-getting-started-guide.pdf)
- [DevPortal Admin Guide (PDF)](https://tech-docs-library.zoominfo.com/devportal-admin-guide.pdf)
- [ZoomInfo DaaS Certification](https://university.zoominfo.com/zoominfo-data-as-a-service-daas-certification)
