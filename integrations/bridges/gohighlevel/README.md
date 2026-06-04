# Go High Level (GHL) bridge — front-of-funnel CRM

**Primary CRM.** GHL owns the customer relationship **before and around** the contract: lead capture, pipelines/opportunities, appointments, SMS/email/call conversations, nurture campaigns, reviews, and (optionally) invoices. AccuLynx owns the job **during production**. The brain is where the two reconcile.

- **Tier:** 1 (modern SaaS w/ API). **Binding rung:** API + webhooks (LeadConnector v2). No official CLI/MCP, so API is the highest rung available.
- **Auth:** OAuth 2.0 or a Location API key + a webhook signing secret. Secrets in `.env` (`GHL_API_KEY` / `GHL_LOCATION_ID` / `GHL_WEBHOOK_SECRET`), never the repo.
- **Direction of truth:** **GHL is authoritative pre-contract** (lead → appointment → won). At contract/win, the job is handed to AccuLynx and the **brain + AccuLynx become authoritative post-contract**. The GHL bridge keeps writing nurture/conversation atoms post-contract but stops being the source of job state.

## What we ingest

| GHL object | Webhook events | → brain |
| --- | --- | --- |
| Contact | `ContactCreate/Update` | resolve/create `property` from address; create/update a pre-contract `job` (source_system `gohighlevel`) |
| Opportunity | `OpportunityCreate/Update/StageUpdate` | drives `job.job_phase` (lead → estimate → won); on **won**, fire handoff to AccuLynx |
| Appointment | `AppointmentCreate/Update` | atom on the job (inspection/estimate visit); feeds `@ob-sales` |
| Conversation (SMS/email/call) | `InboundMessage` / `OutboundMessage` / `Call` | soft/hard atoms linked to the job; nurture history |
| Campaign / workflow | `CampaignStatusUpdate` | atom (nurture touchpoint), pre + post contract |
| Form / survey submission | `FormSubmit` | lead-source + qualification atoms |
| Invoice / payment (if used) | `InvoicePaid` | accounting atom (note: production invoicing usually lives in QuickBooks/AccuLynx) |

## The handoff (GHL → AccuLynx)

When an opportunity hits **won**, Conductor: (1) confirms the `property` + `job` exist in the brain, (2) marks `job.job_phase = won`, (3) triggers AccuLynx job creation (or links an existing one) and stores `job.external_ref` for both systems, (4) from here AccuLynx milestones drive `job_phase` and GHL reverts to nurture-only. This is the one place the two CRMs touch, and it's logged.

See `mapping.md` for the field tables and `_template/contract.md` for the adapter contract every bridge follows.
