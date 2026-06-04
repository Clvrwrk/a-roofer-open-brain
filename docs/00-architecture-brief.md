# Cleverwork Open Brain — Architecture Brief

> **Status:** Draft v0.1 — for Chris's red-line review
> **Authors:** Chris Hussey (Cleverwork) + Claude (Cowork)
> **Date:** 2026-05-27
> **Lifecycle:** Brainstorm → **Spec (this doc)** → Scaffold → MVP → Client 1 → Iterate
> **License:** MIT (resolved 2026-05-29) — fork posture. Cleverwork-original work is MIT; the four vendored OB1 base schemas keep FSL-1.1-MIT (auto-convert to MIT on OB1's schedule); Dynamous/InfraNodus are cited concepts only, re-expressed, never redistributed. See `/LICENSE` and `/LICENSE.md`. (Supersedes Appendix A.1 open question #1.)

> **Roofer instantiation note:** This repo is the roofing-company specialization of the Cleverwork Open Brain template. The roofer deltas over the generic construction brief are: AccuLynx as the primary PM bridge (not StartInfinity or JobTread), insurance and storm-claim workflows treated as first-class citizens (claims, supplements, Xactimate line items, ACV/RCV, adjuster meetings), EagleView aerial measurement as the default takeoff source, and GAF/Owens Corning/CertainTeed manufacturer certifications and warranty registration as tracked brain entities. Everything else — the 5+8 agent workforce, the property-first data model, era-aware provenance, the Six Sigma governance gate — is shared with the broader template. See [`docs/01-onboard-a-roofer.md`](01-onboard-a-roofer.md) for the step-by-step deployment walkthrough.

---

## Table of Contents

- [Executive Summary](#executive-summary)
- [Part I — Mission, Workforce, Data Model](#part-i--mission-workforce-data-model)
  - [1.1 Mission](#11-mission)
  - [1.2 Scope and Non-Goals](#12-scope-and-non-goals)
  - [1.3 The Agent Workforce — 5 Vertical + 8 Horizontal](#13-the-agent-workforce--5-vertical--8-horizontal)
  - [1.4 Property-First Data Model](#14-property-first-data-model)
- [Part II — Core Workflows](#part-ii--core-workflows)
  - [2.1 Post-Op Debrief SOP](#21-post-op-debrief-sop)
  - [2.2 EEAT Flywheel Recipe](#22-eeat-flywheel-recipe)
  - [2.3 Cross-Client Property Consent Model](#23-cross-client-property-consent-model)
- [Part III — Infrastructure](#part-iii--infrastructure)
  - [3.1 Deployment: Remote-First, Local-Capable](#31-deployment-remote-first-local-capable)
  - [3.2 Bridge Layer for Legacy Systems](#32-bridge-layer-for-legacy-systems)
  - [3.3 Repo Synthesis](#33-repo-synthesis)
- [Part IV — Governance](#part-iv--governance)
  - [4.1 Six Sigma Skill-Gating SOP and 10x ROI Rule](#41-six-sigma-skill-gating-sop-and-10x-roi-rule)
  - [4.2 Auditor vs Quality Control](#42-auditor-vs-quality-control)
  - [4.3 Maintenance Playbook v1](#43-maintenance-playbook-v1)
  - [4.4 Maintenance Kaizen Review Loop](#44-maintenance-kaizen-review-loop)
- [Part V — Phased Build Plan](#part-v--phased-build-plan)
- [Appendix A — Open Questions](#appendix-a--open-questions)
- [Appendix B — Glossary](#appendix-b--glossary)

---

## Executive Summary

The Cleverwork Open Brain is not "AI agents for construction companies." It is a **persistent, property-first memory layer for an industry that has bled R&D capital twice in 30 years and is about to do it a third time** as boomer/Gen-X tradesmen retire over the next decade. The agents are the interface; the brain is the asset.

Every client receives an isolated brain instance scaffolded from a shared template. Inside that brain, a workforce of **5 vertical client-facing agents** (Accounting, Operations, Sales, Marketing, Executive/Strategy) and **8 horizontal infrastructure agents** (Capture, Historian, Researcher, Conductor, Auditor, Quality Control, Innovator, Maintenance) collaborates to capture, organize, retrieve, and operationalize the client's institutional knowledge — atomized with era-aware provenance and a property-first data model that allows non-trade-competitive knowledge to flow across clients working on the same property.

The brain is built on four merged foundations: **OB1** (the persistent-memory spine — Supabase + pgvector + remote containerized MCPs), **Dynamous workshops** (the security and sovereignty layer — local docker-compose stack held in reserve), **InfraNodus skills** (the cognition layer — Critical Perspective, Ontology Creator, Shifting Perspective for the thinking agents), and **Andrej Karpathy's LLM Wiki pattern** (the philosophical anchor — build the wiki once incrementally, don't re-derive on every query).

Governance is **Demming + Toyota + Six Sigma + Kaizen 5S** applied rigorously: every new agent skill passes a Toyota-style A3 with an explicit **10x ROI gate** before being built. *If the human is cheaper, the human remains.* Maintenance runs 5S literally on the brain itself (Sort daily, Set in order weekly, Shine weekly, Standardize monthly, Sustain quarterly) and improves its own playbook through a Kaizen Review loop. Quality Control runs the surgical M&M conference pattern over post-op debriefs and sets the standards that Auditor enforces.

The first client is a 2-person Cleverwork build target. Phase 0 scaffolds the template; Phase 1 ships infrastructure agents + Operations + Sales for the first client; Phase 2 fills out the full vertical workforce; Phase 3 graduates to a Cleverwork-internal meta-brain that promotes anonymized patterns from individual client brains.

---

## Part I — Mission, Workforce, Data Model

### 1.1 Mission

**Prevent the third generational knowledge loss in 30 years from the construction industry.**

Cleverwork's clients — roofers, remodelers, manufacturers — sit at the convergence of two structural forces. The first is **demographic**: the workforce that built and maintained the institutional knowledge of how to actually do this work, including means and methods, sequencing logic, code interpretation, materials know-how, and the relational equity with clients and inspectors that makes a job go smoothly, is retiring at a rate the industry cannot replace through traditional apprenticeship. The second is **technological**: each previous tech transition (the early-90s introduction of business computing, the mid-2000s introduction of mobile/SaaS) extracted a generational cost in lost R&D as knowledge stuck on yellow pads, in foremen's heads, and in pre-digital records was abandoned during platform migrations rather than carried forward.

We are entering the third such transition right now. Cleverwork's Open Brain is the deliberate intervention designed to **carry institutional knowledge forward through this transition rather than lose it**. It is built on the assumption that, in 2050, a young construction engineer should be able to retrieve, recontextualize, and rely upon knowledge captured today — with era-stamped provenance, jurisdictional awareness, and the soft relational atoms that turn transactional work into trusted relationships.

The agents are the interface to this brain. The brain is the asset. **The data is the product.**

### 1.2 Scope and Non-Goals

**In scope.**

- Per-client persistent brains built from a shared, versioned template.
- A workforce of 13 agents (5 vertical, 8 horizontal) operating per client.
- Capture of structured construction-domain data (jobs, properties, financials, ops, marketing, strategic) and unstructured knowledge (post-op debriefs, oral histories, photos, transcripts, legacy paper records).
- Property-first data model with cross-client, non-trade-competitive property history sharing under explicit transparent consent.
- An EEAT flywheel that turns consented post-op atoms into authoritative web content as the publication surface for trust signals.
- Bridge adapters for legacy systems including DOS, paper Travelers, and on-prem databases without APIs.
- Governance: Six Sigma A3 with 10x ROI gate for every new skill; Auditor + Quality Control + Maintenance + Innovator as the four-role continuous-improvement engine.

**Explicit non-goals.**

- **Not a generic AI agency platform.** Construction-domain assumptions are baked in. A SaaS company shouldn't try to use this.
- **Not a client-facing branded SaaS product** in v1. This is internal Cleverwork infrastructure that powers each client engagement. A public ClawHub-style listing is a Phase 3 question.
- **Not a shared multi-tenant database.** One brain per client, isolated by Supabase project or docker stack. Cross-client sharing happens only at the consented property-atom layer.
- **Not a replacement for the client's PM tool.** The brain integrates with StartInfinity / AccuLynx / JobTread / etc. — it does not replace them. Bridge layer ingests; the source of operational truth remains in the PM tool.
- **Not a generative-content firehose.** The EEAT flywheel publishes only consented, audited, human-reviewed atoms. Volume is irrelevant; authenticity is the moat.
- **Not local-only by default.** Remote-first deployment is the v1 default; local-capable is held in reserve until the first client demand triggers polishing that path.

### 1.3 The Agent Workforce — 5 Vertical + 8 Horizontal

#### Design principle

The agent workforce splits along two dimensions. **Vertical agents** are named for the functional domain a construction client recognizes (Accounting, Operations, Sales, Marketing, Executive); they appear in Slack as `@ob-*` bots that human team members mention directly. **Horizontal agents** are infrastructure; they capture, route, retrieve, audit, and maintain — mostly invisible to the client, doing the work of the team Cleverwork doesn't have.

A core observation that shapes this design: **modern model harnesses are capable enough that vertical agents can be flexible generalists within their domain, not narrow single-task agents.** `@ob-ops` can handle a daily-log atomization, a subcontractor scheduling question, and a materials lookup in one role. This is the upgrade from the "one agent per task" mental model.

A second observation: **the Historian / Researcher split is a security boundary, not just an organizational one.** The Historian retrieves only from the client's brain and never accesses the public internet. The Researcher retrieves only from outside (public web, enrichment APIs) and never accesses client memory. Separating them across two distinct processes with separate credentials closes a textbook prompt-injection pathway in which a malicious external page would instruct an agent to exfiltrate client data.

A third observation: **Auditor and Quality Control are two roles, not one.** This is the surgical morbidity-and-mortality conference pattern. The role that enforces the standard on each work product (Auditor) is not the role that sets the standard for all future work products (Quality Control). Mixing those functions corrupts both.

#### Vertical agents (5)

| Role | Slack handle | Primary responsibilities | Default skill pack |
| --- | --- | --- | --- |
| Accounting | `@ob-accounting` | Invoicing, AR/AP, job costing, change orders, draws, financial close, sales-tax handling | accounting:invoicing, accounting:ar-aging, accounting:job-costing, accounting:change-orders |
| Operations | `@ob-ops` | Scheduling, subcontractors, daily logs, inventory consumption, tool check-in/out, fleet, equipment maintenance, safety logs, permits | ops:scheduling, ops:subcontractor, ops:daily-logs, ops:inventory (modular — add ops:tools / ops:fleet / ops:equipment-maintenance / ops:safety-logs / ops:permits per client need) |
| Sales | `@ob-sales` | Leads, estimates, proposals, follow-ups, win/loss, referral tracking | sales:leads, sales:estimating, sales:proposals, sales:follow-up |
| Marketing | `@ob-marketing` | Content, reviews, photos, social, web, EEAT flywheel publication, schema.org markup, ranking tracking | marketing:content, marketing:reviews, marketing:photo-handling, marketing:eeat-publishing, marketing:schema-markup |
| Executive / Strategy | `@ob-exec` | Financial dashboards, KPIs, strategic planning, hiring intent, capacity planning, M&A readiness | exec:dashboards, exec:kpi-trees, exec:strategy, exec:hiring |

**Modularity rule.** A single-truck remodeler does not get `ops:fleet`. A roofer with five crews does. The Innovator agent proposes adding a skill to a client's brain when the pattern justifies it; the 10x ROI gate decides. See Section 4.1.

#### Horizontal agents (8)

| Role | Visibility | Primary responsibilities |
| --- | --- | --- |
| Capture | Invisible (dashboard only) | Always-on listening to Slack, Granola/Fireflies meeting transcripts, StartInfinity activity, AccuLynx and JobTread webhooks, photo uploads (CompanyCam), oral-history audio, scanned paper records. Runs the dual-track atomizer on post-op debriefs (hard atoms + soft atoms). Never thinks — only atomizes. |
| Historian | Invisible (dashboard only); responds in Slack when mentioned indirectly via Conductor routing | Internal-only retrieval over the client's brain. Cites atoms with provenance, era, jurisdiction, confidence. **Never touches the public internet** (security boundary). Surfaces "we did this on this property before" and "we promised this in a prior thread" with timestamps. |
| Researcher | Invisible (dashboard only) | External-only retrieval. Web search, Apollo / Clay / ZoomInfo / SimilarWeb / Ahrefs / HubSpot / Box / Granola, public filings, SEC, GitHub, manufacturer release notes, code-update bulletins, inspector culture notes. Returns atoms with `source_url` + `retrieved_at`. **Never reads the client's brain** (security boundary). |
| Conductor | Posts daily + weekly digests; appears in Slack for routing and escalation | The PM of the agent workforce. Routes inbound human mentions to the right vertical agent, posts the per-client daily digest, posts the per-client weekly digest, updates the client's PM tool (StartInfinity / AccuLynx / JobTread / etc.), escalates to Chris or the account manager when a human decision is needed. **This is the role most responsible for making the 2-person Cleverwork team math work.** |
| Auditor | Invisible (gates work products) | Per-work-product QA. Every artifact produced by a vertical agent (proposal, change order, post draft, financial close, daily log summary) passes through the Auditor against the current standard. Auditor passes or rejects with explanation; sends rejects back to Producer. **Auditor enforces; it does not change the standard.** |
| Quality Control | Invisible; convenes review meetings with humans | Cross-product, cross-job. Reads every post-op debrief, every Auditor reject, every rework atom. When the same failure mode appears 3+ times — DMAIC kicks in. QC convenes Chris + account manager (and optionally the client's QC lead) to decide whether the standard needs to change. If yes, QC updates the threshold that Auditor enforces. Toyota's *jidoka* pattern. |
| Innovator | Invisible; produces A3 proposals | Scouts adjacent technology (trade publications, GitHub, manufacturer releases, code updates, conference papers, regional inspector bulletins) AND internal patterns (repeated manual work flagged by Conductor, debrief atoms tagged "we did this manually again"). Produces a Six Sigma A3 proposal for each candidate new skill. **Innovator never builds — it only proposes.** Approval / kill / defer is a Chris + account-manager decision. |
| Maintenance | Invisible (weekly hygiene digest only) | 5S of the brain itself. Sort daily, Set in order weekly, Shine weekly, Standardize monthly, Sustain quarterly. Deduplicates, reconciles contradictions, archives cold atoms, verifies cross-references, refreshes embeddings on model upgrades, runs PDCA sampling. **Never deletes, never modifies provenance, never changes trust-tier, never publishes.** See Section 4.3 for the full playbook. |

#### Interaction patterns

A typical day in a single-client brain produces this flow:

1. **Capture** ingests overnight Slack activity, the morning's StartInfinity updates, last night's foreman log, and any new emails.
2. **Conductor** posts the per-client morning digest: yesterday's atoms summarized, today's calendar, blockers, escalations needing human attention.
3. Through the day, human team members mention vertical agents in Slack: *"`@ob-ops` what's the materials draw on 1247 Elm?"* or *"`@ob-sales` follow up with the lead from yesterday's call."*
4. The mentioned vertical agent calls **Historian** for context, optionally calls **Researcher** for fresh external facts, optionally calls **Analyst-mode-of-itself** (InfraNodus skills) for critique, and produces an output.
5. The output passes through **Auditor** before being delivered to the human or to the client's PM tool.
6. **Conductor** posts the end-of-day digest, queues tomorrow's work, escalates anything blocked.
7. **Capture** atomizes the day's interactions into the brain overnight.
8. **Maintenance** runs Sort daily, generating a one-line hygiene status that appears in tomorrow's digest.

The infrastructure agents that operate on longer cycles — **Quality Control**, **Innovator**, **Maintenance** at weekly/monthly/quarterly cadences — produce reports that Chris and the account manager review out-of-band.

### 1.4 Property-First Data Model

#### The decision

The primary key of the Cleverwork Open Brain is the **property**, not the client. This is the data-model decision that ties the whole brain together.

Construction is property-bound at a level no other industry is. Every job happens at a *place*. That place has a parcel ID, a street address, a lat/long, and a jurisdiction. The jurisdiction has its own building code with its own version history, its own permit process, its own inspector culture. The property has a soil profile, a seismic context, a climate exposure pattern, and a history of work performed on it by *every* contractor whose data the brain can reach. Clients, jobs, work-products — these are foreign keys to the property.

This decision unlocks **cross-client property history**, which is the most defensible single feature in the system. When Roofer A worked on 123 Main Street in 2020 and Remodeler B is adding a second story in 2026, B's `@ob-ops` agent can — with explicit consent from both clients — see: roof replaced 2020, manufacturer warranty terms, original load-bearing assumptions, the local inspector's known preferences, the soil report from 2015. That is gold for B and zero competitive risk to A; they are in different trades. Two roofers on the same property share nothing. The consent model is "share trade-orthogonal property information; never share competitive-trade information." See Section 2.3.

Nobody else is going to assemble property history that crosses contractor boundaries. That is the moat.

#### Top-level entities

```
property
  ├── jurisdiction
  │     └── regulatory_snapshot[]   (timeline of code in effect, with effective dates)
  ├── parcel_metadata               (parcel_id, lat/lng, year_built, structure_type, soil_profile, climate_zone)
  ├── property_history              (work_performed[] across all consenting contractors)
  └── inspector_notes               (per-jurisdiction known preferences, captured by Capture from debrief atoms)

client
  └── jobs[]
        └── job
              ├── property_id            (FK)
              ├── job_phase              (lead → estimate → won → in-progress → punch → closed → warranty)
              ├── work_performed[]
              ├── post_op_debrief        (1:1 once job_phase = closed)
              ├── financial_summary
              └── crews[]                (people involved, captured for relational equity)

atom
  ├── property_id        (FK, when applicable)
  ├── client_id          (FK)
  ├── job_id             (FK, when applicable)
  ├── trust_tier         (instruction | evidence | inference)
  ├── content            (text or structured)
  ├── embedding          (pgvector)
  ├── provenance_chain   (atom_ids[] that derived this)
  ├── eeat_signal        (optional: {type, value, publishable_with_consent})
  ├── soft_or_hard       (debrief atomization track)
  └── metadata           (see Section 1.4 schema additions below)
```

#### Schema additions to OB1's base

OB1's `enhanced-thoughts`, `provenance-chains`, `typed-reasoning-edges`, and `agent-memory` schemas are the spine. We add the following columns/JSON fields to every atom, codifying era-awareness, model-agnostic capture, and the construction-domain primary keys:

| Field | Type | Purpose |
| --- | --- | --- |
| `property_id` | UUID, nullable | FK to property when atom is about a place |
| `client_id` | UUID, not null | FK to client (one brain per client; this is `'self'` in single-tenant terms but allows future meta-brain ingest) |
| `job_id` | UUID, nullable | FK to job when atom is about a specific engagement |
| `model_card` | JSON | `{provider, model_name, model_version, capabilities_snapshot, captured_at}` — every atom knows which model wrote it |
| `tool_spec_hash` | TEXT, nullable | For atoms derived from tool calls; allows detection when the underlying tool surface has changed |
| `revalidation_timestamp` | TIMESTAMPTZ, nullable | When this atom was last re-checked for currency |
| `confidence_at_recall` | NUMERIC, nullable | Last known confidence; decays per trust-tier curve |
| `trust_tier` | ENUM | `instruction` (human-confirmed or trusted import), `evidence` (observed fact with source), `inference` (model-generated conclusion) |
| `era_of_practice` | TEXT, nullable | Era this atom describes (e.g. `"pre-IRC-2018"`, `"NEC-2020"`, `"OSHA-pre-2024-silica-rule"`) |
| `original_capture_date` | DATE, nullable | When the underlying fact was first known (may predate ingestion if from oral history) |
| `original_practitioner` | JSON, nullable | `{name, role, tenure_years, consent_to_attribute}` when atom comes from oral history or named expert |
| `regulatory_snapshot_id` | UUID, nullable | FK to the `regulatory_snapshot` in effect at `original_capture_date` |
| `recontextualization_notes` | TEXT, nullable | "this practice is pre-current-code; verify against latest jurisdiction snapshot" |
| `eeat_signal` | JSON, nullable | `{type: Experience\|Expertise\|Authoritativeness\|Trustworthiness, value: 0–1, publishable_with_consent: bool, consent_recorded_at: timestamp\|null}` |
| `soft_or_hard` | ENUM, nullable | `hard` (technical/financial/code) vs `soft` (relational/sentimental/values); applies to debrief atoms |
| `consent_flags` | JSON | `{cross_client_shareable: bool, trade_restriction: list[trade], publishable_external: bool, expires_at: timestamp\|null}` |
| `cold_archive_status` | ENUM | `live` (default), `archived` (cheap storage, still queryable), `deprecated` (kept for provenance, do not retrieve) |
| `source_link_broken` | BOOL | Maintenance sets this when a HEAD check 404s; the atom stays but is flagged |

#### Why these fields exist (the trust-decay argument)

Five years from now, the brain has to answer: *who said this, when, on what model, with what prompt, against what tool spec, and is it still true?* Most "persistent AI memory" implementations cannot. Without era-stamps and recontextualization notes, a 2031 retrieval of a 2026 atom about a roofing practice is indistinguishable from a contemporary statement — and that's how you build a brain that confidently misleads. With these fields, the same retrieval returns: *"Captured 2026-05-15 by Claude Opus 4.7 from a debrief with foreman Mike (32 years tenure), describing IRC-2018 practice on Property X in jurisdiction Y; current jurisdiction code is IRC-2024 with the following changes [link]; revalidation recommended."*

This is what makes 5-year persistence into actual 5-year *reliability*.

#### Property cross-client read path

When `@ob-ops` for Client B retrieves about Property X:

1. Historian queries the property graph for all atoms with `property_id = X`.
2. Filter by `consent_flags.cross_client_shareable = true`.
3. Filter by trade-restriction: drop atoms whose `consent_flags.trade_restriction` includes Client B's trade.
4. Annotate each atom with anonymized provenance: `"prior_contractor (different trade), 2020-04, jurisdiction Y, era IRC-2015"` — Client A's identity is never revealed unless A separately consented.
5. Return ranked by relevance + recency + trust-tier.

When `@ob-marketing` produces site content from Client A's property atoms:

1. Filter by `eeat_signal.publishable_with_consent = true` AND `eeat_signal.consent_recorded_at IS NOT NULL`.
2. Pass through Auditor for one more consent + PII + competitive-info check.
3. Generate draft; route to Client A for one-click approval in Slack before publication.

These two read paths are the only places cross-property or external-publish access happens. Everything else stays inside the single client's brain.

---

---

## Part II — Core Workflows

### 2.1 Post-Op Debrief SOP

The post-op debrief is the **continuous-capture event** that anchors the brain. It replaces the panic-mode "retirement interview" with a steady recurring rhythm tied to the natural cadence of construction work: every closed job triggers one.

#### Trigger

When the client's PM tool (AccuLynx, JobTread, StartInfinity, Buildertrend, Procore, etc.) marks a job as `closed` or moves it to the `warranty` phase, the Bridge adapter fires a `job.closed` webhook. **Conductor** receives the event and schedules the debrief.

#### Participants

**Required:** PM (or project coordinator), Foreman (or crew lead), Client (the owner / decision-maker on the client side, not the homeowner).

**Optional:** Estimator (if scope shifted significantly), QC Lead (if any QC events fired during the job), Subcontractor lead (only if a sub-relationship issue was raised).

The flowers anecdote is the canonical example of why the client must be in the room: the soft atoms that create lifetime customer loyalty cannot be reverse-engineered from the PM's notes. They require the client to say them out loud.

#### Format

20–30 minutes, sync (video preferred, audio acceptable). Hybrid is fine for the foreman who is on a job site.

The debrief is **recorded with consent** (this is captured in the client onboarding flow once, not per-debrief). Granola or Fireflies handles transcription. The recording is attached to the job's atom set; the transcript is what Capture atomizes.

#### Script (v1, six anchor questions)

The script is a **template artifact** so every Cleverwork debrief runs the same way. Conductor opens with the framing: *"This is a blameless review. We're capturing what happened so we can do this better, and so a future foreman briefed on you will know what mattered. Nothing in here is used against anyone. If you want anything redacted, we'll redact it before atomization."*

1. **What did we get right?** (Anchor positive; this is also where soft atoms emerge — what the crew did that mattered beyond the spec.)
2. **What did we get wrong, or where did the plan diverge?** (Hard atoms; this is the QC-input question.)
3. **What did current code or current materials force us to do differently than we'd have done five years ago?** (Era-aware anchor; explicitly elicits the recontextualization material.)
4. **Were there moments where institutional knowledge from a specific crew member made the difference?** (Practitioner-attribution anchor; surfaces the people whose oral history is worth deeper capture.)
5. **What would you tell a foreman starting on this same property next year?** (Property-bound forward-utility anchor; this is what makes cross-client property history valuable.)
6. **What mattered to you that we should remember if you ever call us again?** (The flowers question. This is the EEAT and relational-equity anchor and the question that often surfaces the most unexpectedly valuable atom of the entire debrief.)

#### Dual-track atomization

Capture runs both tracks in parallel on the transcript:

- **Hard atoms** (technical, financial, code, ops, safety): `soft_or_hard = "hard"`, default `trust_tier = "evidence"`, default `eeat_signal = null` (most hard atoms are not externally publishable), `consent_flags.cross_client_shareable = true` unless flagged competitive.
- **Soft atoms** (relational, sentimental, accessibility, family context, client values, things the crew did that mattered emotionally): `soft_or_hard = "soft"`, default `trust_tier = "evidence"`, default `eeat_signal = {type: inferred from atom, value: 0.7–0.95, publishable_with_consent: true, consent_recorded_at: null}` — consent is recorded later via the EEAT flywheel one-click approval.

Both tracks are tagged with `property_id`, `job_id`, `practitioner` references, `era_of_practice`, and `regulatory_snapshot_id`.

#### Post-debrief routing

1. Capture writes atoms; Maintenance Sort runs at the end of day to dedupe.
2. **Quality Control** is notified of every debrief and reads the hard-atoms summary. If failure modes already seen 2+ times appear again, QC adds the debrief to its DMAIC backlog.
3. **Marketing** (via the EEAT flywheel — Section 2.2) is notified of every debrief and reviews soft atoms with `eeat_signal.value > 0.7` for publication candidacy.
4. **Innovator** is notified of every debrief and scans for repeated-manual-work patterns ("we did this manually again") as candidate skill proposals.
5. The job's debrief atoms are linked back to the job record and the property record; the property's `property_history` is updated.

#### What this gives Cleverwork

A continuous stream of high-quality atoms tied to real work, real properties, real people, with consented attribution. Over five years, this becomes the most valuable property-bound construction-knowledge dataset in the regional market. Over twenty, it becomes a piece of industry infrastructure.

### 2.2 EEAT Flywheel Recipe

The EEAT flywheel is **the recipe that makes Cleverwork's marketing work different from generic AI agency marketing**. We build client websites not as deliverables but as the **publication surface for consented soft atoms** that compound into search authority, lead trust, and qualified referral pipeline. Competitors can fake everything except the atoms — and the atoms are unbuyable because they come from real work this contractor really did.

#### The flywheel

```
Post-op debrief
     │
     ▼  (Capture atomizes; soft atoms with eeat_signal)
Atom written to brain
     │
     ▼  (Auditor checks: PII clean? competitive info clean? client consent recorded?)
Atom passes audit
     │
     ▼  (Marketing pulls atoms with eeat_signal.value > 0.7 weekly)
Marketing produces draft case study / blog post / testimonial
     │
     ▼  (Client one-click approval in Slack — see flow below)
Client approves with optional edits
     │
     ▼  (Marketing publishes to client's site with schema.org markup)
Live content on client site
     │
     ▼  (Researcher tracks ranking; Conductor reports gains in weekly digest)
Search authority compounds; qualified leads arrive
     │
     ▼  (New jobs → new post-op debriefs → new atoms → flywheel)
```

#### Schema.org markup defaults

Every published EEAT atom gets structured markup. Marketing's `marketing:schema-markup` skill enforces:

- `LocalBusiness` schema on every page (NAP consistency, service-area definition).
- `Service` schema with `provider`, `areaServed`, `category`.
- `Review` schema with `author` (the client, with consent), `reviewBody`, `itemReviewed`, `datePublished`.
- `Article` schema for case studies with `author`, `dateModified`, `mainEntityOfPage`.
- `Person` schema for crew members named with consent (the practitioner-attribution piece).
- `BuildingAddress` / `Place` for the property when the client has consented to property-level identification.

The combination of structured markup and authentically-sourced content is what generative search engines (Perplexity, Google AI Overviews, etc.) increasingly reward over volume-pumped generic content.

#### Client one-click approval flow

The friction killer. When Marketing has a draft ready:

1. Conductor DMs the client's designated approver in Slack: *"Marketing prepared a draft post from your debrief on 1247 Elm. Two minutes. Approve / edit / skip?"* with three buttons and a preview link.
2. **Approve** → publishes immediately, posts confirmation with the live URL.
3. **Edit** → opens a Slack thread for inline edits; Marketing revises; re-presents.
4. **Skip** → atom stays in the brain but `consent_flags.publishable_external` is set to `false` and an expiration is recorded; the atom is still useful internally but never proposed for publication again.

The success metric for v1: **client approval rate above 60% on Marketing-proposed drafts.** If it's lower, Marketing's atom-selection or draft-writing is off and Innovator + QC should propose adjustments.

#### Cross-client EEAT propagation (deferred)

The interesting future feature: Client A's published atom about a successful project on Property X could be linked-to from Client B's site as a "prior work by [different trade] on this property" trust signal. This is consent-gated and depends on both clients opting into cross-client property sharing. Defer to Phase 3.

### 2.3 Cross-Client Property Consent Model

#### Principle

Transparent opt-in. Carrot, not stick. The client controls whether their property atoms flow to other Cleverwork clients working on the same property. They can opt out at any time. **Opting out costs them access to property history from other contractors. It does not cost them anything else.**

#### Onboarding checkbox (v1 wording)

> **Cross-Client Property History**
>
> Cleverwork can make non-trade-competitive information about properties you've worked on available to our other clients working on the same property at a different time.
>
> **Example:** If you're a roofer who replaced the roof on 123 Main Street in 2023, a remodeler we work with who adds a second story to that same house in 2027 would be able to see your work — the manufacturer warranty, the original load-bearing assumptions, the local inspector's preferences. Their client benefits; you face no competitive risk because you're in different trades.
>
> **What gets shared:** Non-trade-competitive property facts. Materials used. Code interpretations. Inspector notes. Soil and structural observations. Year of work. Warranty terms.
>
> **What never gets shared:** Your pricing. Your client lists. Anything tagged as competitive trade information. Anything from a contractor in your own trade.
>
> **What happens if you opt out:** You keep your full brain. You lose the ability to see property history from other Cleverwork contractors when you're bidding or working on a property they touched first.
>
> **You can change this anytime in your settings.**
>
> [ ] Yes, share my non-trade-competitive property atoms with other Cleverwork clients in different trades.
> [ ] No, keep my brain isolated. I understand I won't see other contractors' property history.

#### Atom-level granular consent

Beyond the global onboarding choice, individual atoms can be re-classified:

- **Per-debrief override:** During the post-op debrief, the client can flag specific information as "competitive — do not share." Capture marks `consent_flags.cross_client_shareable = false` on those atoms.
- **Per-trade-restriction:** A client can configure default restrictions: *"share with HVAC and remodelers; do not share with roofers"* (when the client is a roofer themselves). Captured in `consent_flags.trade_restriction`.
- **Time-bounded consent:** A client can grant sharing only for a window (e.g. "share for 5 years, then expire"). Captured in `consent_flags.expires_at`. Maintenance Sustain quarterly checks for expirations.

#### Anonymization layer

When a Cleverwork client retrieves a shared property atom from another client, the source client's identity is **anonymized by default**:

> *"Prior contractor (different trade), 2023-04. Property 123 Main Street. Era: IRC-2018. Atom: 'Replaced roof; manufacturer GAF, lifetime warranty transferred to current owner.'"*

The contractor's name is shown only if the source client has separately consented to attribution (`consent_flags.publishable_external = true` is the same flag — but attribution requires explicit per-atom consent at the EEAT publication step).

#### Audit trail

Every cross-client read is logged in an `atom_access_log` table: which atom, which agent, which client retrieved it, what query, what time. Maintenance Standardize monthly audits this log; any access pattern that looks like data scraping triggers an alert to Chris.

#### Why this works

It works because **most clients will opt in once they see the demo value**. Marketing shows them in the first month: *"Look — your foreman, working on the Henderson job, just got a 2018 soil report from another contractor's brain. That saved a $400 boring test and a week of delay."* After that, opt-out becomes the rare case, not the default. The consent UX is designed so the carrot is loud and the stick is silent — opting out doesn't punish; it just doesn't reward.

---

---

## Part III — Infrastructure

### 3.1 Deployment: Remote-First, Local-Capable

#### Default profile: remote (OB1 pattern)

Per client, the default deployment is:

- A **dedicated Supabase project** (one per client; total isolation).
- The OB1 schema set (`enhanced-thoughts`, `provenance-chains`, `typed-reasoning-edges`, `agent-memory`) extended with the property-first additions from Section 1.4.
- **MCPs only as MCP containers on Hetzner** (never local stdio, never `claude_desktop_config.json`-style local Node servers — this is OB1's hard rule and we inherit it).
- An **Astro dashboard** deployed to Coolify, with OB1's `open-brain-dashboard-pro` as the functional starting point.
- **Slack workspace bots** per role, registered against the client's Slack workspace via OAuth.
- **PM-tool adapter** (AccuLynx, JobTread, StartInfinity, etc.) deployed as an MCP container with webhook receiver.

This gets a new client live in roughly an hour with the right onboarding wizard. Given 0% of current Cleverwork clients need local-only deployment, this is the right default.

#### Local-capable profile (held in reserve)

For the eventual client (likely larger GC, gov contractor, or air-gapped manufacturing case) that requires local deployment:

- **Cole Medin's `docker-compose.yml`** from `dynamous-workshops/claude-code-second-brain/` becomes the local stack template.
- **`master.env.example`** is adapted to surface only the client-configurable values; secrets stay in a vault.
- **Postgres + pgvector** replaces Supabase locally; **Ollama** replaces the cloud LLM for embeddings (the OB1 `local-ollama-embeddings` recipe is the path).
- The **MCP contract is unchanged** — clients can migrate remote-to-local without losing their brain because the schemas and MCP signatures are identical.
- Cole's security curriculum remains the conceptual reference; the client go-live gate is the Cleverwork-authored checklist in `docs/06-security-checklist.md`.

We do **not** polish the local profile in v1. We ship it as a documented capability with the docker-compose stack inherited as-is. We polish when the first client demands it. This saves an estimated 30% of v1 build effort.

#### Model-agnostic posture

"Model-agnostic" means three concrete things:

1. **Every atom carries a `model_card`.** Provider, model name, model version, capability snapshot at time of write. Five years from now we know which atoms were written by which model and can re-evaluate them as models improve.
2. **Skills are portable prompt+context bundles**, not framework-locked code. The InfraNodus skill format and OB1's skill format both work this way; we standardize on a merged format documented in `/skills/_template/`.
3. **Tool calls go through MCP**, not provider-specific tool-use APIs. MCP is the model-agnostic interface — any model with tool-use capability can call the same MCP server. This is OB1's "remote MCPs only" rule operating as a model-agnostic insulation layer.

What we do NOT promise: that every agent runs identically across every model. Some models will have larger context windows; some will have stronger reasoning; some will have better tool-use accuracy. We ship a **model capability matrix** in `/docs/05-model-matrix.md` (to be authored in Phase 0) that documents which agent roles map to which model tiers, with fallback paths when a primary model is unavailable.

#### Backup and recovery

Inherited from OB1's `brain-backup` recipe, extended with:

- Daily encrypted snapshots to a separate cloud (or local) storage location.
- Weekly verification by Maintenance: restore the latest snapshot to a sandbox, run `brain-smoke-test`, discard. Confirms backups are actually restorable.
- Quarterly disaster-recovery drill: simulate complete loss of primary, restore in sandbox, validate brain integrity, document time-to-recovery.

### 3.2 Bridge Layer for Legacy Systems

The Bridge layer is the answer to: **"How do we capture knowledge from clients whose data lives in 1994?"** It's also the moat for the manufacturing-segment client base running DOS systems and paper Travelers folders.

#### Adapter taxonomy

| Tier | Description | Implementation pattern | Examples |
| --- | --- | --- | --- |
| Tier 1 — Modern SaaS with API | Webhook + REST/GraphQL | MCP container receiver + scheduled pull | AccuLynx, JobTread, StartInfinity, Buildertrend, Procore, QuickBooks Online, CompanyCam, HubSpot |
| Tier 2 — Modern SaaS without API (or with API gated behind enterprise tiers) | Chrome MCP automation via Claude in Chrome | Headless browser session; scheduled scrape with consent | Niche regional PM tools, older CRM tiers |
| Tier 3 — On-prem with API | REST or ODBC client running on client's network | Small on-prem agent ships changes to brain via MCP container | Older QuickBooks Desktop, Sage 100, Sage 300 |
| Tier 4 — On-prem without API | Flat-file CLI export + scheduled push | Tiny CLI that runs locally, exports to CSV/JSON/XML, pushes to brain via authenticated endpoint | DOS-based job tracking, custom Access databases, paper Travelers (with OCR pre-step) |

#### Tier 4 in detail (the DOS case)

For the manufacturing clients running DOS:

1. **CLI deployment.** We ship a small Windows-compatible binary that runs on the client's office machine. It reads from the DOS system's data directory (typically `.dbf`, fixed-width text, or flat files) on a schedule.
2. **Export to canonical JSON.** The CLI translates the DOS records into the Open Brain atom schema with `metadata.bridge_tier = "tier-4"` and `metadata.source_system = "dos:[system_name]"`.
3. **Authenticated push.** The CLI pushes to a per-client MCP container endpoint using a rotating API key stored in Windows Credential Manager (never in plaintext on disk).
4. **Paper Travelers parallel path.** The CLI is paired with an OCR pre-step. Scanned Travelers go through OCR (we use a hosted OCR service; falls back to local Tesseract if client is air-gapped), and the structured fields are extracted using a vision-LLM call against a Traveler-template definition.
5. **Oral context capture.** Because the Traveler often encodes tacit knowledge that the OCR cannot capture, we ship a complementary **voice-memo workflow**: the floor lead narrates the Traveler over their phone, the audio is transcribed by Granola, and the transcript becomes a soft atom linked to the Traveler atom.

#### Adapter contract

Every Bridge adapter must produce atoms that conform to the same schema (Section 1.4). The adapter is responsible for filling in:

- `model_card` (set to `{provider: "bridge", model_name: "[adapter_name]", model_version: "[adapter_version]"}`)
- `trust_tier` (default `evidence`; `instruction` only when the source system represents human-confirmed truth like an approved invoice or signed change order)
- `property_id` resolution (the adapter must look up or create the property record from address-or-parcel-id in the source system)
- `era_of_practice` (often `null` for current operational data; populated for historical imports)

Adapter source code lives in `/integrations/bridges/[tier-X-source-name]/`. Each ships with its own README, sample data, and integration test.

#### Adapter shortlist for v1

In priority order based on Chris's existing client base:

1. **StartInfinity** (default PM tool for most clients).
2. **AccuLynx** (roofers — we already have the `acculynx-api` skill in the existing plugin set).
3. **JobTread** (remodelers).
4. **CompanyCam** (photo management; high-value for EEAT atom capture).
5. **QuickBooks Online + Desktop** (accounting — both tiers).
6. **DOS + Paper Travelers** (manufacturing clients).
7. **HubSpot + Apollo + Clay + ZoomInfo + SimilarWeb + Ahrefs** (Researcher integrations).
8. **Slack + Granola + Gong + Fireflies + Box** (Capture integrations).

Each adapter is its own A3 candidate; the Innovator prioritizes based on cross-client reuse.

### 3.3 Repo Synthesis

#### What we take from each source

| Source | Role | Specifically what we take |
| --- | --- | --- |
| **OB1** (Nate B. Jones) | Spine — the persistent-memory infrastructure | Four base schemas (`enhanced-thoughts`, `provenance-chains`, `typed-reasoning-edges`, `agent-memory`) are vendored with upstream headers and FSL-1.1-MIT notices preserved; Cleverwork adds an MIT bootstrap schema, roofer extensions, docs, scripts, bridge specs, and deployment glue. See `/LICENSE.md` and `schemas/ob1-base/ATTRIBUTION.md`. |
| **Dynamous workshops** (Cole Medin) | Security + sovereignty layer | Conceptual reference only: local-sovereignty posture, threat-model framing, and security checklist ideas are re-expressed in Cleverwork-authored docs. No Dynamous files are redistributed. |
| **InfraNodus skills** | Cognition layer | The portable skill prompts for Critical Perspective, Shifting Perspective, Ontology Creator, Rhetorical Analyst, Cognitive Variability, Embodied Navigation, Actionize, and the InfraNodus CLI / Tool Use reference. These get installed as part of the Auditor, Quality Control, Innovator, and (selectively) the vertical-agent skill packs. The InfraNodus MCP server is the runtime for these skills when invoked. |
| **Karpathy gist** | Philosophical anchor | Cited explicitly in `/docs/03-philosophy.md` as the foundational pattern: **build the wiki once incrementally; don't re-derive on every query.** This is the rationale for atomized-wiki over raw-RAG-on-everything, and it's what makes the 5-year persistence math work economically. |

#### What we add that none of them have

- **Property-first data model.** OB1 is client-first (or user-first); Dynamous is user-first; InfraNodus is text-first. None of them have the property as primary key. This is Cleverwork-original and is the construction-domain insight.
- **Era-aware provenance schema additions.** Trust decay is acknowledged conceptually in OB1 but not codified as schema. We codify it.
- **Dual-track post-op debrief atomization.** Hard vs. soft tracks with explicit EEAT classification at capture time. New.
- **Auditor vs Quality Control separation.** OB1 has the concept of memory validation but doesn't split per-product vs. cross-product. We split.
- **Six Sigma A3 / 10x ROI skill-gating SOP.** OB1 has guard rails about what not to do; we add a governance layer about what is worth doing.
- **Bridge layer Tier 4** (DOS + paper). Nobody else builds this. It's the manufacturing-client moat.
- **EEAT flywheel as a first-class recipe.** OB1's site/dashboard work is for internal use; we make site-as-EEAT-moat a default client motion.

#### Template repo layout (proposed)

```
/cleverwork-open-brain-template
├── README.md                          (this is what a new client engagement starts from)
├── LICENSE                             (MIT for Cleverwork-original work)
├── LICENSE.md                          (third-party notices)
├── SECURITY.md                         (inherits Dynamous SECURITY-CHECKLIST)
├── CLAUDE.md                           (inherits OB1 CLAUDE.md guard rails + Cleverwork additions)
├── AGENTS.md                           (inherits OB1 AGENTS.md worktree discipline)
├── docs/
│   ├── 00-architecture-brief.md       (this document)
│   ├── 01-onboarding-a-new-client.md  (the 1-hour spin-up wizard)
│   ├── 02-debrief-script.md            (the 6-question template)
│   ├── 03-philosophy.md                (Karpathy + Demming + Toyota citations)
│   ├── 04-going-local.md               (Dynamous GOING-LOCAL inherited)
│   ├── 05-model-matrix.md              (which agent maps to which model tier)
│   ├── 06-security-checklist.md        (Dynamous SECURITY-CHECKLIST inherited)
│   └── 07-faq.md                       (OB1 docs/03-faq.md adapted)
├── schemas/
│   ├── ob1-base/                       (OB1's enhanced-thoughts, provenance-chains, etc. — vendored)
│   └── cleverwork-extensions/          (property, jurisdiction, regulatory_snapshot, schema additions)
├── server/                              (OB1 Deno + MCP containers on Hetzner baseline + Cleverwork extensions)
├── agents/
│   ├── vertical/
│   │   ├── accounting/
│   │   ├── ops/
│   │   ├── sales/
│   │   ├── marketing/
│   │   └── exec/
│   └── horizontal/
│       ├── capture/
│       ├── historian/
│       ├── researcher/
│       ├── conductor/
│       ├── auditor/
│       ├── quality-control/
│       ├── innovator/
│       └── maintenance/                 (includes PLAYBOOK.md)
├── skills/
│   ├── _template/                       (the merged OB1 + InfraNodus skill format)
│   ├── infranodus/                      (vendored InfraNodus cognition skills)
│   ├── ob1/                             (vendored OB1 skills)
│   └── cleverwork/                      (Cleverwork-original skills)
├── integrations/
│   └── bridges/
│       ├── _template/
│       ├── startinfinity/
│       ├── acculynx/
│       ├── jobtread/
│       ├── companycam/
│       ├── quickbooks-online/
│       ├── quickbooks-desktop/
│       └── dos-traveler/                (the Tier 4 CLI + OCR pre-step)
├── recipes/
│   ├── post-op-debrief/
│   ├── eeat-flywheel/
│   ├── knowledge-harvest/                (oral history capture)
│   ├── property-onboarding/
│   ├── client-onboarding-wizard/
│   └── ...
├── dashboards/                          (OB1 dashboard-pro extended)
├── deployment/
│   ├── remote/                          (Supabase + Coolify; default profile)
│   └── local/                           (Cole's docker-compose; held in reserve)
└── scripts/
    ├── new-client.sh                    (spins up a fresh client from the template)
    ├── verify-deployment.sh
    └── kaizen-review.sh                 (Maintenance monthly review trigger)
```

---

---

## Part IV — Governance

### 4.1 Six Sigma Skill-Gating SOP and 10x ROI Rule

#### Principle

> **If the human is cheaper, the human remains.**

No new agent skill ships without an A3 proposal that documents the baseline, the projected new state, the build and operating cost, and an explicit 10x ROI calculation. This is the discipline that prevents agent sprawl, prevents tooling-for-its-own-sake, and keeps a 2-person Cleverwork team capable of serving many clients.

#### The A3 template (one page)

Every Innovator proposal produces a structured one-page A3 stored at `/cleverwork-open-brain-template/proposals/[date]-[skill-name].md`. The template:

```
# A3: [Proposed Skill Name]
Proposed by: [Innovator | Chris | Account Manager]
Date: YYYY-MM-DD
Status: pending | approved | killed | deferred (revisit_at: YYYY-MM-DD)
Affected clients: [list, or "template-wide"]

## 1. The problem (measured)
- Task being performed today: [verb + object]
- Frequency: [N times per week per client]
- Time per occurrence: [minutes]
- Error rate: [N% of occurrences produce defect requiring rework]
- Cost of error: [$ avg per defect including rework + downstream impact]
- Total monthly human cost: [hours × loaded hourly rate + error cost]

## 2. Root cause (5 Whys, brief)
- Why does this task consume human time?
- Why is it not already automated?
- Why are the existing tools inadequate?
- Why hasn't this been a Cleverwork priority before?
- Why now?

## 3. Proposed solution
- Which agent gets the new skill: [vertical or horizontal role]
- What the skill does: [one paragraph]
- Which existing OB1 / InfraNodus / Dynamous primitive it builds on (if any)
- Which adapter / integration it requires (if any)

## 4. The new state (projected)
- Time per occurrence post-skill: [minutes]
- Error rate post-skill: [%]
- Cost of agent operation: [$ per occurrence — tokens, API costs, infra]
- Required human review: [Y/N; if Y, time per occurrence]

## 5. The math
- Total monthly cost (human, current state): $X
- Total monthly cost (agent + human review, new state): $Y
- Build cost (one-time): $Z
- Operating cost amortized over 12 months: $Z/12
- **ROI multiplier:** X / (Y + Z/12) = [must be ≥ 10 to proceed]
- Payback period: [months]

## 6. Risks
- What breaks if this skill misbehaves?
- What is the rollback path?
- Which trust tier does the output land at?
- Does this require new consent flags?

## 7. Alternative considered
- Leave it human: [brief justification of why or why not]
- Defer until [condition]: [brief justification]

## 8. Decision
- [ ] Approve — build by [date]
- [ ] Kill — reason: [text]
- [ ] Defer — revisit at: [date], condition: [text]
- Approver: [Chris | Account Manager | both]
- Approved on: YYYY-MM-DD
```

#### Workflow

1. **Innovator** drafts the A3, fills in all measured baselines from atoms in the brain (Conductor has been logging manual-work patterns; QC has been logging Auditor-rejects; debriefs flag "we did this manually again" atoms). The Innovator never invents numbers — it cites atoms.
2. **Conductor** notifies Chris (and the account manager if the proposal touches their client) that a new A3 is ready.
3. **Chris + Account Manager** review. Approve / kill / defer with comment.
4. Approved A3s are added to the **build backlog** in `/cleverwork-open-brain-template/proposals/_backlog.md`.
5. Killed A3s are archived with `status: killed`. **They are not deleted.** They re-surface if Innovator's quarterly review detects that conditions have changed (model price dropped, volume grew, error cost increased).
6. Deferred A3s have a `revisit_at` date. Conductor brings them back to Chris on that date.

#### Skill build pattern

When a skill is approved, it follows a standard build flow:

1. Branch in the template repo: `contrib/cleverwork/skill-[name]`.
2. Build under `/skills/cleverwork/[name]/` with: SKILL.md, sample inputs/outputs, integration tests, A3 reference.
3. Deploy to one pilot client first; observe for two weeks; Auditor reports actual vs. projected ROI.
4. If actual ROI ≥ projected, promote to template-default. If actual ROI < projected by 20%+, kill or revise.
5. Add to the model capability matrix in `/docs/05-model-matrix.md`.

#### Exempt from the 10x gate

Two categories of work bypass the 10x gate:

- **Mission-grade infrastructure.** The post-op debrief pipeline, era-stamped atoms, knowledge harvest, property data model, EEAT flywheel — these are foundational to the 5-year persistence promise, not optimizations. They are not optional; they are not subject to ROI calculation; they are how the brain works.
- **High-risk-of-error tasks with cost-of-error math.** Safety, legal, regulatory, financial-close tasks may pass with lower than 10x ROI on time savings IF avoided-error-cost pushes total ROI past 10x. The math has to include the cost of getting it wrong, not just the cost of doing it.

### 4.2 Auditor vs Quality Control

#### The separation principle

The surgical morbidity-and-mortality conference pattern: **the role that checks each individual operation is not the role that sets the standard for all future operations.** Mixing those functions corrupts both — the auditor becomes too cozy with the standard-setter, and the standard-setter loses contact with the realities of individual cases.

#### Auditor — per-work-product enforcement

**Scope:** Every artifact produced by a vertical agent passes through the Auditor before delivery. Artifacts include: proposals, change orders, financial close summaries, daily-log digests, marketing drafts, schema markup, EEAT publication candidates, post-op debrief transcripts.

**What Auditor checks against:** The current standard set by Quality Control, codified in `/cleverwork-open-brain-template/standards/`. Standards are versioned; Auditor always uses the active version.

**What Auditor outputs:**
- **Pass:** artifact ships to its destination (Slack, PM tool, client site, etc.). Auditor's atom is `audit_result: pass, audit_score: N, audited_against_standard_version: X`.
- **Fail:** artifact returns to the producing agent with a structured rejection: which standard rule failed, what the producer should change, link to standard. Auditor's atom is `audit_result: fail, failure_modes: [...], recommendation: [...]`.
- **Escalate:** when Auditor cannot decide (genuine ambiguity, new failure mode), escalates to Conductor → Chris/Account Manager. Auditor never silently passes a borderline case.

**What Auditor does NOT do:**
- Change the standard.
- Override Quality Control's decisions.
- Decide trust-tier (that's also QC's call when ambiguous).
- Publish anything externally.

**Auditor's failure-mode log feeds Quality Control.** Every Auditor rejection is an atom; Quality Control reads them in aggregate.

#### Quality Control — cross-job standard-setting

**Scope:** Cross-product, cross-job, cross-client (within a single client). QC reads every Auditor reject, every post-op debrief, every rework atom, every customer complaint.

**Trigger condition:** When the same failure mode appears 3+ times across recent jobs (configurable; v1 default is rolling 90-day window), QC initiates a DMAIC cycle:

1. **Define.** What is the failure mode? Whose work products are affected? What is the cost?
2. **Measure.** Pull all atoms tagged with this failure mode; quantify frequency, cost, client impact.
3. **Analyze.** Why does it happen? Is it the agent's prompt? The standard itself? The input data quality? The integration layer?
4. **Improve.** Propose a change — to the standard, to the agent's skill pack, to an integration, or to a workflow. The proposal goes through the same A3 process as a new skill.
5. **Control.** If approved, update the standard, re-version it, notify Auditor of the new version. Track post-change failure rate for 90 days; if reduction doesn't match projection, re-open.

**What QC outputs:**
- Updated standards documents (`/standards/[domain]/v[N].md`).
- DMAIC review summaries posted to internal Cleverwork channel.
- A3 proposals for skill or workflow changes (same pipeline as Innovator's proposals).
- Trust-tier adjustments on flagged atoms (the only role authorized to change `trust_tier`).

**What QC does NOT do:**
- Audit individual work products.
- Build skills.
- Communicate with clients directly (its output flows through Chris / Account Manager / Conductor).

#### The handoff cadence

- Auditor: real-time (every artifact).
- QC: weekly cross-rejection review; monthly DMAIC for any pattern at 3+; quarterly standards-revision cycle.
- Maintenance feeds both: Maintenance's monthly Standardize phase audits whether Auditor is enforcing all required fields; QC's quarterly review audits whether Maintenance's playbook is still serving the brain's quality goals.

### 4.3 Maintenance Playbook v1

The full Maintenance Agent playbook lives in `/cleverwork-open-brain-template/agents/horizontal/maintenance/PLAYBOOK.md`. Reproduced here in the architecture brief for reference. This is **v1** — the Maintenance Kaizen Review loop (Section 4.4) is how this playbook evolves.

```
═════════════════════════════════════════════════════════════
  MAINTENANCE AGENT v1 PLAYBOOK
  Built on 5S (Sort, Set in Order, Shine, Standardize, Sustain)
  and Demming PDCA. Operates per-client brain.
═════════════════════════════════════════════════════════════

DAILY — Sort
  • Run fingerprint-dedup on last 24h ingests (OB1 recipe).
    Merge true duplicates; flag near-duplicates to QC.
  • Validate required metadata on every new atom (property_id
    where applicable, practitioner, era, regulatory_snapshot,
    trust_tier, eeat_signal if soft).
    Missing fields → flag to Capture for re-atomization.
  • Validate provenance chains resolve. Broken chains → flag,
    do not delete.
  • Detect orphan atoms (no property_id, no client_id when
    expected) → quarantine for human review.
  • Produce one-line hygiene status for Conductor's morning
    digest.

WEEKLY — Set in Order
  • Reconcile contradictions: same property + same field +
    different values across atoms. Flag to QC; never auto-resolve.
  • Verify cross-references (derived_from, references,
    contradicts) all resolve. Mark broken ones; never delete.
  • Re-cluster atoms whose embeddings drifted past threshold
    (model updates can shift neighborhoods).
  • Run InfraNodus Ontology Creator on the week's new atoms;
    surface taxonomy drift to QC.
  • Brain-smoke-test (OB1 recipe) — verify retrieval, write,
    embed, MCP all healthy. Page Chris if red.

WEEKLY — Shine
  • Refresh trust_tier confidence on atoms 6+ months old that
    have been retrieved 3+ times (high-leverage atoms, worth
    a recheck).
  • Refresh tool_spec_hash on tool-call atoms; flag stale ones
    for QC.
  • HEAD-check every external source URL on atoms < 12 months
    old; mark source_link_broken: true on 404/410. Do not
    modify content.
  • Verify consent flags on every cross-client-shareable atom;
    quarantine any with missing or expired consent.

MONTHLY — Standardize
  • Schema usage audit: are agents filling required fields?
    Per-agent score. Sub-90% → flag to QC for re-training the
    offending agent's prompts.
  • EEAT classification consistency: sample 50 atoms; if
    classification disagrees with re-classification > 10%,
    flag the rubric to QC.
  • Era / regulatory_snapshot completeness: any atom
    referencing a code, standard, or practice without an era
    stamp gets flagged for re-atomization.
  • Provenance integrity: random sample 100 atoms, verify the
    full chain back to source; report.

QUARTERLY — Sustain
  • Cold archive: atoms not retrieved in 18+ months move to
    cheaper storage tier. Still queryable; flagged
    archived: true.
  • Schema migration: apply any new required columns to
    historical atoms. Backfill from source where possible;
    mark backfill_inferred where not.
  • Embedding refresh: if a model upgrade happened this
    quarter, batch-refresh. Old embeddings retained for
    90 days for rollback.
  • PDCA round-trip: pick 50 random atoms, present to Chris +
    account manager in a structured review ("is this still
    true? does it still matter? does it need a
    recontextualization note?"). Demming applied at memory
    scale.
  • Backup verification: restore brain-backup to a sandbox;
    smoke-test; discard. Confirms backups are actually
    restorable.

═════════════════════════════════════════════════════════════
  STRICT DON'T LIST
═════════════════════════════════════════════════════════════
  ✗ Delete an atom outright. Archive or deprecate only.
  ✗ Modify an existing atom's provenance.
  ✗ Change trust_tier on any atom (QC owns that).
  ✗ Cross consent boundaries.
  ✗ Publish to a client-facing surface.
  ✗ Run during a scheduled maintenance window without
    lock-and-pause.
  ✗ Evolve its own playbook outside the Kaizen Review cycle
    (Section 4.4).

═════════════════════════════════════════════════════════════
```

### 4.4 Maintenance Kaizen Review Loop

The Maintenance playbook is a **living document**. We will surface better processes as we operate; the playbook v1 above is a starting point, not a frozen spec. The Maintenance Kaizen Review is how it evolves — much lighter than the post-op debrief (no client, no recording, no sync meeting) but with the same Kaizen discipline.

#### Cadence

Monthly, async, ~30 minutes of Chris+AM time.

#### Mechanics

1. **Throughout the month**, Maintenance keeps a running log at `/cleverwork-open-brain-template/agents/horizontal/maintenance/kaizen_observations.md`:
   - Rules that triggered most frequently (signal: where the playbook is doing the most work)
   - Rules that fired but didn't catch the actual problem (false positive)
   - Cases that should have been caught but weren't (false negative; usually surfaced via Auditor or QC discovering rot later)
   - Near-misses (atoms that almost rotted; rules that almost didn't fire)
   - New patterns of drift or contradiction observed for the first time

2. **End of month**, Maintenance produces a one-page **A3-lite** summary (the standard A3 template at Section 4.1 has a stripped-down "playbook-evolution" variant; lives at `/cleverwork-open-brain-template/proposals/_playbook-evolution-template.md`).

3. Maintenance posts the A3-lite to a `#cleverwork-internal` Slack channel (or whatever internal comms surface Cleverwork settles on).

4. **Chris + Account Manager** review at the start of the next month. For each proposed playbook change:
   - **Accept:** commit to the playbook; version-tag the change; new playbook becomes effective on the next cron boundary.
   - **Defer:** Maintenance keeps watching; revisit next month.
   - **Kill:** archived with reasoning; doesn't re-surface unless Maintenance specifically flags it again.

5. **Quarterly**, Quality Control reviews the *aggregate* drift in the Maintenance playbook (this is QC's quarterly standards review applied to Maintenance itself). The question QC asks: *Is the playbook still serving the 5S spine? Is it getting bloated? Are we adding rules without retiring old ones? Are we losing the brain's quality goals?* QC has the authority to roll back playbook changes that have drifted the system away from its stated goals.

#### Versioning

Every accepted change updates the playbook to a new minor version (`v1.0 → v1.1 → v1.2`). Major versions are reserved for structural changes (adding a new 5S phase, changing the cadence pattern, etc.) and require explicit Chris approval.

Old versions are kept at `/cleverwork-open-brain-template/agents/horizontal/maintenance/archive/PLAYBOOK-v1.0.md`. Maintenance eats its own dog food — it never deletes its own history.

#### Why this matters

Without the Kaizen loop, the Maintenance playbook would ossify into exactly the kind of frozen-and-irrelevant SOP that 5S is designed to prevent. With it, the playbook **becomes better at recognizing rot than rot becomes at hiding from it.** That's the only path to a brain that's still trustworthy in 2050.

---

---

## Part V — Phased Build Plan

#### Principle

Every phase passes its own 10x ROI gate. Phase 0 is a sunk cost (template scaffolding makes every subsequent client cheaper); Phase 1 must prove the model on a single client before Phase 2 spends another dollar. Killing or reshaping a phase based on what Phase 1 reveals is not failure — it's PDCA.

#### Phase 0 — Template scaffold (foundation)

**Goal:** Stand up the template repo so a new client can be onboarded in under an hour by Phase 1.

**Scope:**
- Repo created at `/cleverwork-open-brain-template/` with the layout from Section 3.3.
- OB1 base schemas vendored under `/schemas/ob1-base/`.
- Cleverwork schema extensions written under `/schemas/cleverwork-extensions/`.
- Server skeleton (Deno + MCP containers on Hetzner) with one working endpoint and one working MCP.
- Onboarding wizard script (`/scripts/new-client.sh`) that provisions or links the Supabase project, applies schema, triggers configured Coolify deploy hooks, and prints the Slack/manual integration checklist.
- Inherit `CLAUDE.md`, `AGENTS.md`, `SECURITY.md` from OB1 + Dynamous with Cleverwork additions.
- This document (`00-architecture-brief.md`) committed as the spec.

**Out of scope for Phase 0:**
- Any agents beyond the most minimal Capture + Historian + Conductor stub for end-to-end testing.
- EEAT flywheel.
- Bridge layer Tier 4.
- Any vertical agents.

**Exit criteria:** A blank Supabase project + a deployed dashboard + a Slack bot that can receive a mention and write an atom to the brain. End-to-end smoke test green.

**Estimated effort:** 2–3 weeks of Chris + Claude time.

**10x justification:** This phase is foundational infrastructure; it's exempt from the 10x gate as mission-grade infrastructure (Section 4.1). However, the implicit math is: scaffolding done once amortizes across every future client engagement. If Cleverwork serves 20 clients over the next 3 years and each one would otherwise require ~40 hours of bespoke setup, the template saves ~800 hours. Even at conservative loaded rates, that's 10–20x the scaffolding effort.

#### Phase 1 — First-client MVP

**Goal:** Bring a single existing or pilot client onto the brain with the minimum agent set that proves the architecture works.

**Scope:**
- Run `new-client.sh` against the chosen pilot client.
- Deploy **infrastructure agents** in stub-to-functional order: Capture (functional), Conductor (functional with hard-coded routing), Historian (functional), Researcher (stub OK in Phase 1), Maintenance (Sort + Set in Order phases only; Shine and beyond in Phase 1.5), Auditor (functional with a v0 standard set), Quality Control (read-only, observing — sets first standards in Phase 1.5), Innovator (read-only, logging candidates).
- Deploy **two vertical agents** chosen based on the pilot client's biggest pain point. For most construction clients this is `@ob-ops` and `@ob-sales`.
- Wire the **PM-tool adapter** (StartInfinity / AccuLynx / JobTread depending on pilot).
- Wire **Slack capture** + **Granola/Fireflies meeting capture**.
- Run the **first post-op debrief** on a closed job; verify the dual-track atomization works end-to-end.
- Stand up the **client dashboard** read-only.

**Out of scope for Phase 1:**
- EEAT flywheel (Phase 2).
- Marketing agent (Phase 2).
- Accounting agent (Phase 2).
- Exec agent (Phase 2).
- Bridge layer Tier 4 (Phase 2.5+ unless pilot demands it).
- Cross-client property sharing (only meaningful with 2+ clients; Phase 2).
- Local-capable deployment (Phase 3+ unless first client demands it).

**Exit criteria:**
- One client has run their brain for 30 days.
- One post-op debrief has produced atoms across both tracks.
- Conductor has posted 30 daily digests; client confirms ≥2 of them were useful.
- Auditor has rejected at least one work product (the failure cases are the proof the system works).
- Innovator has logged at least 5 candidate skill proposals (even if none built yet).
- Maintenance has run Sort + Set in Order daily/weekly without breaking anything.

**Estimated effort:** 6–8 weeks of Chris + Claude + Account Manager time.

**10x justification:** This phase produces measurable client ROI. The pilot client's existing manual hours on ops + sales coordination tasks should drop ≥60% within 30 days, with no regression in quality (Auditor's rejection rate should not climb compared to human-only baseline). If it doesn't, Phase 2 doesn't start until we understand why.

#### Phase 1.5 — Standards solidification + Maintenance maturity (interleaved)

**Goal:** Use Phase 1's operating evidence to set initial Quality Control standards and bring Maintenance to full v1 playbook capability.

**Scope:**
- QC reads 30 days of Auditor data; sets first formal `/standards/` documents for ops and sales work products.
- Maintenance Shine + Standardize + Sustain phases activated.
- First Maintenance Kaizen Review runs at end of month 2.
- First QC DMAIC cycle if any failure pattern has hit 3+ occurrences.

**Estimated effort:** Interleaves with Phase 1; adds ~1 week elapsed time.

#### Phase 2 — Full vertical workforce + EEAT flywheel

**Goal:** Complete the per-client agent workforce and turn on the EEAT compounding loop.

**Scope:**
- Deploy remaining three vertical agents (`@ob-accounting`, `@ob-marketing`, `@ob-exec`).
- Stand up the **EEAT flywheel recipe** end-to-end including the client one-click approval flow in Slack.
- Wire **CompanyCam** (photo capture) and **QuickBooks** (Tier 1 + Tier 2 adapters).
- First publication of consented post-op atoms to the client's website with schema.org markup.
- Researcher promoted to fully functional (was stub in Phase 1).

**Out of scope for Phase 2:**
- Cross-client property sharing (Phase 2.5 when we have 2+ clients).
- Bridge layer Tier 4 (Phase 3 unless triggered by a new client onboarding).

**Exit criteria:**
- First EEAT atom published on the pilot client's site with structured markup.
- Marketing one-click approval rate ≥60% on Marketing-proposed drafts.
- All five vertical agents have responded to at least 10 client mentions each in the prior 30 days.
- Innovator A3 backlog has at least 3 approved-and-deferred proposals (proves the gate is operating).

**Estimated effort:** 8–10 weeks after Phase 1 exit.

**10x justification:** EEAT flywheel produces marginal-revenue lift from the published site (qualified leads, referrals); the four-vertical agent set replaces enough manual work that the pilot client's retainer math becomes 10x positive. If the actual published-content rate is below 1 piece per closed job per month, the flywheel isn't compounding and we pause for revision.

#### Phase 2.5 — Second client + cross-client property sharing

**Goal:** Prove the template's per-client repeatability and turn on the cross-client property history feature.

**Scope:**
- Run `new-client.sh` against a second client (ideally in a different trade than client #1 to immediately test cross-trade property sharing).
- Both clients onboarded with the cross-client consent checkbox; default opt-in.
- First cross-client property atom retrieval (Client B retrieving an atom about Property X originally captured by Client A).
- Bridge layer Tier 2 (Chrome MCP automation) implemented if any of client #2's systems require it.

**Exit criteria:** A measurable instance of Client B's `@ob-ops` retrieving useful property history from Client A's brain via the consent-gated read path, with proper anonymization and audit-log entry.

**Estimated effort:** 4–6 weeks. The second client onboarding should be markedly faster than Phase 1 — that's the entire point of the template.

#### Phase 3 — Bridge Tier 4, local-capable polish (if triggered), meta-brain graduation

**Goal:** Open the harder client segments and graduate to the two-tier architecture.

**Scope, triggered as opportunities present:**
- **Bridge Tier 4 (DOS + Paper Travelers).** Implement when the first manufacturing-segment client is signed. CLI + OCR + voice-memo workflow.
- **Local-capable profile polish.** Implement when the first client with data-residency or air-gap requirements is signed. Bring Cole's docker-compose stack to first-class status with documented onboarding, security walkthrough, and parity smoke tests.
- **Meta-brain.** When Cleverwork has 5+ clients running brains, stand up the Cleverwork-internal meta-brain. Pull anonymized non-trade-competitive patterns from individual brains into a shared playbook brain. Chris + Account Manager become the curators. Next client onboarding uses meta-brain to surface prior patterns automatically.
- **Cross-EEAT linking.** Allow consented Client A atoms about Property X to be linked-to from Client B's site as a "prior work by [different trade] on this property" trust signal.

**Exit criteria:** Each opportunity has its own A3 with its own 10x gate. There is no monolithic "Phase 3 done" criterion.

**Estimated effort:** Each opportunity 4–8 weeks; phased opportunistically.

#### Phase 4+ — Productization (optional, deferred)

If by month 18 the template has matured enough to be useful outside Cleverwork's own client work, evaluate:

- **OB1 upstream contribution.** Push general-purpose pieces (era-aware schema, the InfraNodus cognition pack integration, the bridge-tier-4 pattern) back to OB1 as community contributions.
- **Public Cleverwork plugin marketplace listing.** Package the construction-vertical template as a Cowork plugin marketplace offering. Pricing TBD.
- **Industry-vertical extensions.** The same architecture might extend to adjacent industries with property-bound work (HVAC, electrical, plumbing trades; small-shop manufacturing; field service). Evaluate via the standard A3 gate.

**This phase is explicitly deferred.** It exists in the brief only to signal that the architecture supports a productization path, not because we are committing to one in 2026.

#### Build-plan summary

| Phase | Calendar weeks (cumulative) | Cleverwork team weeks | Outcome |
| --- | --- | --- | --- |
| 0 — Scaffold | 0–3 | 2–3 | Template repo + minimal end-to-end |
| 1 — First client MVP | 3–11 | 6–8 | Pilot client live; infra + 2 vertical agents |
| 1.5 — Standards + Maintenance | 11–12 | 1 | First QC standards; full Maintenance playbook active |
| 2 — Full workforce + EEAT | 12–22 | 8–10 | All 5 vertical agents; EEAT flywheel live |
| 2.5 — Second client | 22–28 | 4–6 | Cross-client property sharing proven |
| 3 — Bridge T4 + local + meta-brain | 28+ | 4–8 per opportunity | Opportunity-driven |
| 4+ — Productization | TBD | TBD | Deferred decision |

---

---

## Appendix A — Open Questions

> _Items deferred during the brainstorm that still need decisions, in priority order:_
>
> 1. Specific debrief script — six questions including the "what mattered to you" anchor question
> 2. Naming convention for cross-client property atoms (anonymization scheme for shared atoms)
> 3. SLA for Conductor escalations (how fast does a human have to respond when paged?)
> 4. Cold-archive storage tier specifics (where atoms go after 18 months of no retrieval)
> 5. Safety-incident treatment (legal sensitivity, possibly separate trust tier with redaction defaults)
> 6. Permit/inspection workflow integration (per-jurisdiction adapters)
> 7. Warranty claim tracking (cross-job, cross-property, multi-year — needs its own schema)
> 8. Knowledge-harvest pricing (per-quarter retainer add-on? bundled?)

## Appendix B — Glossary

**A3.** Toyota's one-page problem-solving template, used here as the standard format for every skill proposal. Format defined in Section 4.1.

**Atom.** The unit of memory in Open Brain. A discrete fact, observation, decision, or relational note with structured metadata (provenance, era, trust tier, property reference, embeddings).

**Auditor.** Horizontal infrastructure agent that enforces the current quality standard on every work product produced by a vertical agent. Does not set the standard.

**Bridge layer.** The set of adapters that bring data from external systems (modern SaaS, on-prem databases, DOS systems, paper Travelers) into the brain as atoms. Tiers 1–4 documented in Section 3.2.

**Capture.** Horizontal infrastructure agent that listens to event streams (Slack, meetings, PM webhooks, photos, oral history, paper imports) and atomizes them. Never thinks — only atomizes.

**Cold archive.** Atoms not retrieved in 18+ months move to a cheaper storage tier. Still queryable, just flagged `archived: true`. Never deleted.

**Conductor.** Horizontal infrastructure agent that runs the per-client routing, escalation, and digest cadence. Does the work of the team Cleverwork doesn't have.

**Cross-client property sharing.** The consent-gated feature in which non-trade-competitive atoms about a property captured by one Cleverwork client are made available to other Cleverwork clients working on the same property at a different time. The moat.

**DMAIC.** Six Sigma's Define-Measure-Analyze-Improve-Control cycle. Used by Quality Control when a failure mode appears 3+ times.

**Dual-track atomization.** The post-op debrief atomization pattern that produces two parallel atom tracks from one transcript: **hard** (technical, financial, code, ops) and **soft** (relational, sentimental, values). Soft atoms power the EEAT flywheel; hard atoms power QC and Innovator.

**EEAT.** Experience, Expertise, Authoritativeness, Trustworthiness. The trust signals that search engines (and AI search engines) reward. Cleverwork builds client websites specifically as the publication surface for consented EEAT atoms harvested from post-op debriefs.

**Era of practice.** Schema field on every atom that records the regulatory and practice era the atom describes (e.g. `"pre-IRC-2018"`, `"OSHA-pre-2024-silica-rule"`). Required for 5-year reliability.

**Era-aware provenance.** The pattern of stamping every atom with both its capture date and the era it describes, so a future retrieval can correctly contextualize a historical practice against current code.

**Flowers atom.** The canonical example of a high-value soft atom: a Cleverwork crew protected flowers planted by a client's deceased mother. Used throughout the brief as the philosophical anchor for why soft atoms matter, why client participation in debriefs matters, and why authenticity beats volume in the EEAT flywheel.

**Historian.** Horizontal infrastructure agent that performs internal-only retrieval over the client's brain. **Never touches the public internet.** Security-boundary partner of Researcher.

**Innovator.** Horizontal infrastructure agent that scouts adjacent technology AND internal patterns, producing A3 proposals for new skills. **Never builds.** Chris + Account Manager approve / kill / defer.

**Jidoka.** Toyota's "intelligent automation" principle — the system stops when a quality issue is detected, and improvement is built into the workflow. Quality Control's DMAIC cycle is jidoka applied to the brain.

**Kaizen.** Continuous incremental improvement. Maintenance runs its own monthly Kaizen Review to evolve the playbook (Section 4.4); Innovator runs the broader Kaizen-style suggestion cycle for skill additions (Section 4.1).

**Knowledge harvest.** Originally proposed as a "retirement interview" workflow; superseded by the post-op debrief which captures continuously rather than in a panic. The term is retained for the specific case of standalone oral-history capture from a named veteran practitioner (which may still be done occasionally outside the debrief cadence).

**Maintenance.** Horizontal infrastructure agent that runs 5S on the brain. Sort daily, Set in order weekly, Shine weekly, Standardize monthly, Sustain quarterly. Full playbook in Section 4.3.

**Model card.** Schema field on every atom that records the model that wrote it (provider, model name, model version, capability snapshot). The foundation of model-agnostic memory.

**PDCA.** Demming's Plan-Do-Check-Act cycle. Used at multiple cadences: Maintenance Sustain (quarterly atom validation sampling); Quality Control's DMAIC cycle is a structured PDCA; the Maintenance Kaizen Review is a monthly PDCA on the playbook itself.

**Post-op debrief.** The structured 20–30 minute review held after every job closeout with PM + Foreman + Client. Recorded, transcribed, dual-track atomized. Replaces the panic-mode retirement interview with a continuous capture rhythm. SOP in Section 2.1.

**Property-first data model.** The decision to make the property (parcel + jurisdiction) the primary key in the brain, with clients and jobs as foreign keys. Enables cross-client property history; documented in Section 1.4.

**Quality Control.** Horizontal infrastructure agent that reads aggregate Auditor data, identifies patterns of failure, runs DMAIC cycles, and sets the standards Auditor enforces. The only role authorized to change `trust_tier` on existing atoms.

**Recontextualization note.** A field on historical atoms that explicitly carries forward the "but verify against current code" wisdom. Maintenance adds these during the Sustain quarterly PDCA round-trip.

**Researcher.** Horizontal infrastructure agent that performs external-only retrieval (public web, enrichment APIs, manufacturer notes, code bulletins). **Never reads the client's brain.** Security-boundary partner of Historian.

**Soft atom.** An atom from the dual-track debrief atomization that captures relational, sentimental, accessibility, or values-oriented content. Powers the EEAT flywheel. The flowers atom is the canonical example.

**Trust tier.** Three-level enum on every atom: `instruction` (human-confirmed or trusted import), `evidence` (observed fact with source), `inference` (model-generated conclusion). Inherited from OB1's AGENTS.md guidance and codified as a schema field.

**10x ROI gate.** The Cleverwork hard rule: no new agent skill ships without a measured baseline, a projected new-state, and a calculated ROI multiplier ≥10. Exemptions for mission-grade infrastructure and high-error-cost domains documented in Section 4.1.

---

_End of architecture brief v0.1. Total length: ~1060 lines. Awaiting Chris's red-line review._


---

_End of skeleton. Remaining sections drafted in Tasks #2–#6._
