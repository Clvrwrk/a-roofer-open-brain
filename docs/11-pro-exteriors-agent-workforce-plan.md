# 11 — Pro Exteriors Agent Workforce Plan

> **Status:** Working plan, created 2026-05-30.
> **Purpose:** Turn the roofing Open Brain scaffold into a safe, inspectable AI agent workforce for Pro Exteriors without treating the production Supabase project as a practice ground.

## Current Read

Pro Exteriors is a multi-state roofing operator. The public website shows branch/contact pages for Dallas/Richardson, Fort Worth/Euless, Denver/Greenwood Village, Colorado Springs, Wichita, and Kansas City, and positions the company around trust, honor, integrity, inspections, insurance-claim help, and residential, commercial, and multi-family roofing work.

Pro Exteriors already has a real Supabase project with a substantial operational schema: AccuLynx mirrors, CRM/lead tables, property enrichment, hail/weather/permit data, vendor pricing, supplements, warranties, and dashboards. It does **not** yet have the Open Brain memory spine (`thoughts`, `agent_memories`, consent logs, trust-tiered atoms, or property-first reasoning edges).

That means the first build is not "create a database." It is a careful overlay and mapping project:

1. Preserve the existing operational source of truth.
2. Add the Open Brain memory layer beside it.
3. Map existing tables into agent-readable tools/views.
4. Keep all practice agents in a local or disposable playground until review.
5. Promote schema changes to production only after human review and a rollback plan.

## Safety Posture

- Production is read-only for reconnaissance until we explicitly approve a reviewed migration.
- `service_role` is server/container-only. It is acceptable for controlled development inspection, but not for dashboards, clients, browser code, or agent playgrounds.
- The Historian/Researcher split remains a hard security boundary: Historian can read internal memory; Researcher can read the outside world; neither gets both powers.
- All new public Open Brain tables must have RLS enabled and no direct `anon`/`authenticated` grants.
- Public views and security-definer functions need a dedicated production hardening pass before any agent can rely on them.
- Agents never delete records. They may propose archive actions or write archive-intent tasks for human approval.
- Agents do not send external communications. They draft internally and route through Slack for human review.
- No agent audits its own work. Every external-facing artifact draft passes through at least one independent approval gate before a human sends it.

## Playground Strategy

### Tier 1: Local Supabase

Use Docker Desktop + local Supabase as the first practice ground because it matches Supabase behavior and can run the repo schema exactly.

Current local result:

- Local Supabase stack is running.
- Studio is available at `http://127.0.0.1:54323`.
- The Open Brain schema chain now applies cleanly to a blank local Supabase project.
- Verification after hardening: 20 public Open Brain tables, 20 with RLS enabled, no `anon`/`authenticated` table grants on the Open Brain tables, and no `anon`/`authenticated` execute grants on the Open Brain-owned functions.

### Tier 2: Disposable Remote Branch/Fork

Use a Supabase branch, second Supabase project, or Ghost database when we need a remote, shareable, disposable place for agents to practice against a realistic Postgres database.

Ghost is a candidate for disposable Postgres playgrounds because it supports creating, forking, connecting to, querying, and deleting databases through a CLI. It is not a Supabase replacement, so anything involving RLS/PostgREST/Auth behavior still needs Supabase validation.

Supabase branch operations need a Supabase personal access token in the `sbp_...` format. Project API keys, publishable keys, and secret-style keys are not accepted by the CLI for branch management.

Codex MCP status:

- Supabase MCP server has been added as `supabase`.
- OAuth login has succeeded.
- `codex mcp list` shows `supabase` enabled with OAuth against the project-scoped MCP URL.

### Tier 3: Production

Production receives only reviewed migrations and reviewed read paths. No unreviewed practice agent gets production write access.

## What We Found Locally

The playground caught three schema issues before production:

1. `typed-reasoning-edges.sql` assumed an optional `public.edges` table from an entity-extraction schema not present in this repo.
2. The same migration had a SQL syntax error in a multi-part `COMMENT ON FUNCTION`.
3. Supabase default grants left `anon` and `authenticated` with broad table/function privileges on new public objects, even though RLS blocked rows.

Fixes made:

- `schemas/ob1-base/typed-reasoning-edges.sql` now installs thought-to-thought reasoning edges even when `public.edges` is absent.
- `schemas/ob1-base/ATTRIBUTION.md` now records that adaptation.
- `schemas/cleverwork-roofer/60-tighten-grants.sql` now revokes direct `anon`/`authenticated` grants from the Open Brain tables and functions while preserving service-role access.

## Production Readiness Worklist

1. Snapshot and document the production schema.
2. Decide whether Open Brain tables live in `public` or a private schema with explicit API exposure.
3. Build a mapping layer from existing Pro Exteriors tables to agent concepts:
   - `properties` / `acculynx_jobs` / `crm_pipeline` -> property, job, lead, customer context.
   - `job_supplements` / `job_insurance_detail` -> claim and supplement context.
   - `manufacturer_vendor_ranking` / `product_vendor_pricing` -> estimating and procurement context.
   - `vendors` / `vendor_branches` / `products` / `price_agreements` / `price_agreement_items` / `product_vendor_price_observations` / `invoice_documents` -> vendor pricing and credit memo recovery context.
   - permit, hail, HOA, and CAD tables -> Researcher/Operations context.
4. Fix security advisor items in a sandbox first:
   - security-definer views,
   - public materialized view exposure,
   - security-definer function execute grants,
   - mutable function search paths,
   - `spatial_ref_sys` RLS/advisor exception or relocation strategy.
5. Define agent read APIs as narrow RPCs/views, not raw table access.
6. Add the Open Brain memory spine with reviewed migration SQL.
7. Run local and remote sandbox verification before production migration.
8. Rotate development keys before go-live.

## Phase Plan

### Phase 0 — Trust the Ground

- Finish local schema validation.
- Create a production schema map and risk register.
- Confirm company config values.
- Decide Supabase branch/second project/Ghost playground.

### Phase 1 — Human Viewport Before Agent Autonomy

- Build a human-facing viewport that shows what agents can see, what they did, and why.
- Start with the admin interface before Slack communication. The first local MVP lives in `deployment/remote/dashboard/`; the plan is in `docs/13-pro-exteriors-admin-interface.md`.
- Keep Slack agent actions draft-only.
- Use Obsidian as the company-docs surface for SOPs, mission, org chart, standards, and decision records.
- Treat Obsidian documents as instruction-grade SOPs only when they have an owner, version history, and monthly owner review.
- No generated SOP becomes instruction-grade without an assigned document owner.

### Phase 2 — First Useful Agents

- Start with `@ob-ops`, `@ob-accounting`, and the horizontal Auditor/Conductor gates for the vendor-pricing workflow.
- Keep `@ob-sales` in scope for GHL lead capture and post-install nurture, but the first ASAP build is vendor pricing and credit memo recovery.
- Give them read-only access to mapped context and draft-output permissions only.
- Auditor gates every artifact.
- Conductor posts daily/weekly packets for human review.

### Phase 3 — Controlled Writes

- Allow writes only to Open Brain memory/audit tables first.
- Operational system writes remain human-approved.
- Track override rate, Auditor reject rate, and hours saved.

### Phase 4 — Expansion

- Add Accounting, Marketing, and Executive only after Ops/Sales prove useful.
- Promote new skills through A3/10x gate.
- Enable broader dashboards and scorecards.

## Interview Agenda

### Company Truth

- Legal name, DBA, license numbers, phone, website, and preferred service-area language.
- Primary counties/cities served and which AHJs matter most.
- Manufacturer certifications and warranty programs currently active.

### Operating Model

- Website leads currently enter GHL.
- GHL is authoritative through contract signing.
- GHL does not currently bring customers back for post-installation work; this needs to be fixed.
- GHL does not currently capture call-center leads; this needs to be fixed.
- Where exactly AccuLynx becomes authoritative after contract signing.
- Job stages that matter most to Pro Exteriors.
- Current handoff pain between sales, production, supplements, and closeout.

### Agent Boundaries

- Which agents are allowed to draft, notify, recommend, or write.
- What must always require human approval.
- Who can approve agent actions.
- What Slack channels and people are in scope.

### Source of Truth

- Which current Supabase tables are authoritative vs. cached imports.
- Which fields are safe for agents to see.
- Which PII/financial/claim details require stricter access.
- What data should never enter prompts.

### Human Viewport

- Who uses the dashboard.
- What they need to inspect: actions, citations, memory atoms, audit rejects, daily digest, KPI cards, consent log.
- Whether Obsidian is local-only, shared sync, or published internally.
- How SOP changes become instruction-grade.

### First ROI Targets

- Fastest painful workflow to improve: vendor product catalog, negotiated pricing agreements, invoice line-item audit, and credit memo recovery.
- Baseline time/cost/error rate.
- Human review cost.
- What "agent was worth it" means after 30 days.

## First Workflow — Vendor Pricing And Credit Memo Recovery

This is the first ASAP product workflow.

### Goal

Create a viable product catalog and negotiated-pricing audit system that finds vendor invoice overcharges and routes one-invoice-at-a-time credit memo request drafts to the Accounting Director for internal approval.

### Why This First

The workflow is directly tied to cash recovery, pricing discipline, and multi-branch operating leverage. It also creates reusable infrastructure for purchasing, estimating, job costing, and vendor scorecards.

### Business Rules

- ABC is the first vendor but not the only vendor. The product catalog must support at least three additional vendors.
- Initial vendor universe: ABC Supply, SRS Distribution, QXO, Beacon Building Products, Gulfeagle Supply, RWC Building Products, Mid-Atlantic Roofing Supply, Home Depot, and Lowe's.
- Home Depot and Lowe's are retail benchmarks only; they are not negotiated-price vendors in this workflow.
- Product equivalency matters: PE needs to compare pricing across vendors for equivalent items within the same office/metro.
- Vendor SKUs differ, but names are close enough for candidate matching. The Product Catalog Manager proposes best matches and routes them to Slack for human approval before they become instruction-grade.
- Regional price zones follow a practical operating rule: a two-hour drive-time radius from a company branch is one regional price zone.
- All suppliers within a regional price zone are subject to a single negotiated price agreement per vendor.
- Negotiated pricing agreements run on a six-month cadence for each metro.
- Price agreements are ingested from PDFs into Supabase price agreement tables. Pricing is extracted into the product file.
- Vendor invoice data arrives from vendor portals as CSV and PDF, then is ingested into Supabase by script.
- Current ingestion is manual: Lucinda orders invoice exports from the ABC portal, receives an email with a CSV plus ZIP of PDFs, forwards it to Chris, and Chris asks Claude/Codex to add the batch to Supabase. The first build should turn this into a repeatable intake workflow with batch tracking.
- Invoice audit contributes observed product pricing back into the product file, including min, max, and median price tracking.
- Invoice audit output is one invoice per credit memo request.
- Each discrepancy must show invoice price, negotiated price, quantity/UOM, and expected credit memo.
- The agent drafts a "Credit Memo Request Email" and sends it internally via Slack to the Accounting Director for review.
- Lucinda is the Accounting Director reviewer.
- If approved, Lucinda sends the email externally.
- Follow-up tasking continues until the credit memo is received, with a one-week maximum follow-up interval.

### Agent Roles

- `@ob-accounting`: owns invoice line-item audit, credit memo draft, recovery tracking, and follow-up queue.
- `@ob-ops`: owns Product Catalog Manager workflow, product catalog completeness, branch/regional price zone context, and vendor/product equivalency support.
- Auditor: verifies the discrepancy math, agreement source, invoice reference, and one-invoice-per-email rule.
- Conductor: routes Slack review packets to the dedicated accounting review channel, tracks follow-up tasks, and escalates stale credit memo requests.
- Quality Control: updates the pricing-audit standard when repeated miss patterns appear.

### Data Needed

- Vendor list and branch/metro served.
- PE branch list and drive-time region logic.
- Vendor product catalogs, SKU/item numbers, descriptions, category, UOM, pack size, and manufacturer mapping.
- Product equivalency/crosswalk across vendors.
- Negotiated price agreements by vendor, branch/region, effective date, expiration date, SKU, UOM, and price.
- Vendor invoice header and line-item data.
- Credit memo request status, follow-up history, recovered amount, and final resolution.

### Human Approval Gates

1. Catalog equivalency mappings require human approval before becoming instruction-grade.
2. Negotiated price agreements require source-document proof and human approval before use.
3. Every invoice discrepancy packet is audited before Accounting Director review.
4. Every external vendor communication is sent by Lucinda or another approved human, not an agent.
5. Any archive action is proposed, not executed silently.

### Current Supabase Fit

Schema inspection shows that production already has most of the necessary primitives:

- `vendors` and `vendor_branches` for supplier records and branch-level contacts.
- `regions` for PE branch-level price zones.
- `abc_regions` for ABC/vendor-level regions. These should connect to PE `regions` through a matching region identifier/code.
- `products`, `product_taxonomy`, `product_color_variants`, and `product_uom_conversions` for the product file.
- `price_agreements` and `price_agreement_items` for PDF-derived negotiated pricing.
- `product_vendor_price_observations` for invoice-audit-driven min/max/median price intelligence.
- `invoice_documents` for vendor portal PDFs/CSVs and extraction status.
- `abc_line_items`, `abc_price_agreements`, and `abc_price_list_items` as the ABC-specific import layer.
- `acculynx_invoices` and `acculynx_invoice_lines` for job-facing invoice context.

Likely gaps to confirm before build:

- A durable product-equivalency approval table for candidate matches across vendor SKUs.
- A branch price-zone table or view that applies the two-hour drive-time rule.
- An explicit region-mapping table/view after testing real region values. This should connect PE branch price zones (`regions`) to each vendor's region mirror (`abc_regions` first, then equivalent vendor-region tables for SRS/QXO/Beacon/etc.) without relying on naming similarity alone.
- A credit memo request/workflow table that tracks draft, approved, sent-by-human, follow-up, received, rejected, and archived statuses.
- Slack review packet persistence for Lucinda's approvals in a dedicated accounting channel.
- Supabase-only workflow state. Credit memo state should not be mirrored to GHL or AccuLynx for this first workflow.
- Slack app/channel plan and manifest. See `docs/12-pro-exteriors-agent-app-and-slack.md` and `deployment/remote/slack/pro-exteriors-open-brain.manifest.yaml`.

## Roadmap Box

These ideas are intentionally parked until the foundation is safe:

- **Obsidian company brain:** SOPs, mission, org chart, standards, decision logs, and owner/operator doctrine as the human-readable knowledge graph.
- **Human VC/PE audit viewport:** a review room where an outside diligence team can inspect company operating maturity, KPI history, process adherence, and risk register without touching raw production systems.
- **Exit-readiness report agent:** an Executive/Conductor reporting mode that can generate diligence packets for a current owner, PE sponsor, or buyer conversation.
- **Audit-safe report requests:** a controlled agent interface for asking, "Show me where margin leaks," "What is undocumented owner dependency?" or "What would a buyer ask for next?"

## Immediate Next Decisions

1. Confirm Lucinda's Slack user ID and create the private Slack channels in the channel plan.
2. Test real `regions` and `abc_regions` values, then add an explicit vendor-region mapping table/view.
3. Design product-equivalency approval storage and Slack packet format.
4. Design the credit memo request workflow table and statuses.
5. Add the Slack review packet persistence table and audit-log event table.
6. Promote pilot workflow mode against the existing Supabase data: real reads, internal-only Slack outputs.
7. Choose the first playground beyond local Supabase only if we need disposable remote agent practice: Supabase branch, second Supabase project, or Ghost.
