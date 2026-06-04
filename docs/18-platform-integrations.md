# Platform Integration Specs

Status: draft v0.1
Related: [16-platform-architecture-and-topology.md](16-platform-architecture-and-topology.md), [19-security-and-access.md](19-security-and-access.md)

One row of truth per external service: what it's for, which agent/role owns it, the secret name, the security boundary, and how it connects. **Boundary** is the hard rule — Researcher-side services never touch the brain; Historian-side never touch the public internet (CONVENTIONS §4).

---

## Identity & email

### WorkOS — human auth + RBAC
- **Purpose:** login for the Command Center + role-based access (admin/ceo, purchasing, accounting, viewer).
- **Owner:** platform (front end). **Secrets:** `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_REDIRECT_URI`, `WORKOS_COOKIE_PASSWORD`.
- **Connect:** AuthKit hosted login → sealed session cookie; server middleware + data-layer role checks. See `deployment/remote/dashboard/AUTH.md`.

### AgentMail — per-agent inboxes
- **Purpose:** each agent gets a real, addressable inbox (e.g. `hermes@…`); inbound mail is an event stream into **Capture**; outbound is agent-originated correspondence.
- **Owner:** agent-runtime (per-agent). **Secret:** `AGENTMAIL_API_KEY`. **Boundary:** external comms; inbound routed to the brain via Capture, not directly.
- **Connect:** bridge in the `bridges` container; webhook → Capture. Docs: https://docs.agentmail.to/quickstart

### Google Workspace — org email/docs/calendar
- **Purpose:** human-facing email, document storage, calendar; some agent document reads.
- **Owner:** humans + select agents. **Secret:** Google OAuth client/refresh. **Connect:** bridge with least-scope OAuth.

## CRM & comms

### GoHighLevel — CRM + customer comms
- **Purpose:** contacts, opportunities, messaging; vendor/customer outreach; price-refresh send (alt channel).
- **Owner:** vertical agents (sales/marketing) + purchasing flows. **Secrets:** `GHL_API_KEY`, `GHL_LOCATION_ID`, `GHL_WEBHOOK_SECRET`. **Connect:** `gohighlevel` MCP/bridge.

### Slack — agent team workspace (secondary HITL)
- **Purpose:** alerts, quick approvals, agent digests (Conductor/Hermes). Secondary to the web app.
- **Secrets:** `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_APP_TOKEN`. **Handles:** `@ob-hermes`, `@ob-sales`, etc.

## Agent compute

### Orgo — agent computers (up to 5)
- **Purpose:** virtual desktops/browsers for agents that need an OS (e.g. Researcher driving a vendor portal).
- **Owner:** Researcher-side / orchestrator. **Secret:** `ORGO_API_KEY`. **Boundary:** external — **shared pool of 5 allocated on demand**, not 1:1; Hermes needs none.
- **Connect:** Orgo API from the agent-runtime. Docs: https://docs.orgo.ai/api-reference/introduction · https://docs.orgo.ai/llms-full.txt

## Research stack (Researcher-only — external boundary)

All five are **Researcher-side**; none may read the brain. Pick by job:

| Service | Use it for | Secret |
| --- | --- | --- |
| **Serper.dev** | Fast Google SERP results (cheap, high volume) | `SERPER_API_KEY` |
| **SerpAPI** | Rich/structured SERP (maps, shopping, multi-engine) | `SERPAPI_API_KEY` |
| **Firecrawl** | Crawl/scrape a site → clean markdown for ingestion | `FIRECRAWL_API_KEY` |
| **Tavily** | Research-grade question answering over the web | `TAVILY_API_KEY` |
| **Exa** | Semantic/neural search; find conceptually similar pages | `EXA_API_KEY` |

Guidance: SERP lookups → Serper (default) / SerpAPI (when structured engines needed); read a known page → Firecrawl; open research question → Tavily or Exa. All live in `researcher-mcp`.

## Observability

### Sentry — errors + health
- **Purpose:** error/performance capture for app + agent-runtime; feeds the incident flow.
- **Owner:** all server resources emit; **Hermes** consumes + reports. **Secret:** `SENTRY_DSN`. See `20-observability-and-incident-response.md`.

## Data plane (existing)

**Supabase** (the One Brain) and **AccuLynx / CompanyCam / QuickBooks / EagleView** bridges are covered in `08-stack-and-topology.md` and `integrations/bridges/`; they remain the roofer-domain data sources.

## Roofing supplier APIs

Planning-grade supplier API documentation is captured in
[`21-roofing-api-source-intelligence.md`](21-roofing-api-source-intelligence.md).

| Supplier | Public API surface | Local docs |
| --- | --- | --- |
| ABC Supply | Account, branch, product/catalog, availability, pricing, order, webhook notification, invoice. | [`integrations/bridges/abc-supply/README.md`](../integrations/bridges/abc-supply/README.md) |
| SRS / RoofHub SIPS | Authentication, customer validation, branches, catalog, pricing, orders, deliveries/POD, invoices, webhooks. | [`integrations/bridges/srs-roofhub/README.md`](../integrations/bridges/srs-roofhub/README.md) |
| QXO | Public capability pages list order, pricing, account, product, delivery tracking, and invoice APIs; endpoint docs are gated. | [`integrations/bridges/qxo/README.md`](../integrations/bridges/qxo/README.md) |

These sources are supplier-operational data. They should feed customer-internal workflows only and
must not be used for cross-supplier price comparison, product-data resale, market intelligence, or any
other use barred by supplier API terms.
