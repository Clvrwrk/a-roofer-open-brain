# Roofing Estimate To Proposal System Spec

Status: Draft v1 for review  
Date: 2026-06-09  
Owner: Pro Exteriors Open Brain  
Primary surface: `https://cc.proexteriorsus.net/operations`

## 1. Purpose

Build an end-to-end residential reroof pre-sale system that starts with a measurement upload and produces a verified, human-approved scope, proposal PDF, invoice draft, AccuLynx handoff, material order draft, and labor scheduling recommendation.

The system must reduce manual estimating work while preserving human control over every client-facing or external action. No AI agent may directly email, text, submit, order, schedule with a crew, or otherwise communicate outside the company without human approval.

The system must also improve itself job by job. Every estimate, approval, exception, proposal, order, schedule, supplement risk, and completed job must create verification evidence and learning records. Learned skills, SOP changes, template improvements, and agent behavior changes must be captured, reviewed, approved, and accounted for through the operations dashboard before becoming standard.

In parallel, the system must grow the Pro Exteriors knowledge base daily through an autonomous industry research loop (Section 6.7) covering building code, products, R&D, compliance, and safety for residential, commercial, and industrial work — with the same human-approval discipline before any finding changes standard behavior.

## 2. Product Scope

### 2.1 First Release

The first production lane is:

- Retail residential reroof.
- Measurement document upload to proposal PDF.
- Good, Better, Best package options side by side.
- Human approval before anything is sent to the client.
- Verified vendor pricing before proposal approval.
- Gross margin validation before proposal approval.
- AccuLynx write automation where the API allows it.
- Slack or operations-dashboard handoff where AccuLynx write access is limited.

### 2.2 Insurance Lane

Insurance reroof support is in scope for pricing and margin rules, but the first release should prioritize the retail flow. Insurance estimates must account for RCV and ACV scope items, deductible, depreciation owed, supplement risk, and margin variance.

Insurance jobs must not be treated as simple retail proposals. The system must preserve the distinction between:

- Standard retail deposit request.
- Insurance deductible and depreciation amount owed by the client.
- Carrier RCV/ACV amounts.
- Supplement opportunity or supplement risk.
- Margin impacts from insurance-approved scope.

### 2.3 Permit Process

Permits are jurisdiction-dependent and should not be fully automated in v1.

The system must support a permit discovery workflow when Pro Exteriors opens or activates a new office, market, municipality, or jurisdiction. That workflow determines:

- Whether permit rules are knowable and stable enough for AI-assisted drafting.
- Whether permit submission can be automated.
- What human approval is required.
- What permit cost assumptions should be included in job cost and gross margin.

Until a jurisdiction has been reviewed and approved, permit uncertainty must route to the operations dashboard.

## 3. Human Control Policy

The system may draft, calculate, recommend, prefill, and prepare work. It may not submit external commitments without approval.

### 3.1 Human Approval Required

Human approval is required before:

- Sending a proposal to a client.
- Sending an invoice to a client.
- Submitting or placing a material order.
- Assigning or confirming a crew.
- Sending any external email, SMS, portal message, or client communication.
- Making any legally binding contract or price commitment.
- Submitting permit applications unless the jurisdiction-specific permit workflow explicitly permits automation.
- Accepting a below-threshold gross margin job.
- Promoting learned behavior into an agent SOP, skill, pricing rule, or standard template.

### 3.2 Fully Automated Internal Actions

The system may fully automate:

- Measurement extraction attempts.
- Product mapping attempts.
- ABC pricing requests.
- Branch proximity evaluation.
- Estimate calculations.
- Draft proposal generation.
- Draft invoice generation.
- Internal AccuLynx stage and status updates where API write access allows.
- Internal dashboard task creation.
- Internal Slack notification drafts or messages to internal channels.
- Verification check execution.
- Learning-event capture.
- SOP proposal drafting.

## 4. Core Workflow

### 4.1 Intake

The user uploads or selects:

- Measurement PDF or CSV.
- Property address.
- Client/job metadata.
- Retail or insurance job type.
- Optional photos or CompanyCam project reference.
- Optional existing AccuLynx job reference.
- Optional preferred product or manufacturer constraints.

The system creates an estimate run and records all source files with provenance.

### 4.2 Measurement Extraction

The system extracts all required measurement fields from the measurement source.

Required fields:

- Total roof area.
- Squares.
- Waste-adjusted squares.
- Pitch and pitch buckets.
- Eaves.
- Rakes.
- Hips.
- Ridges.
- Valleys.
- Wall flashing.
- Step flashing.
- Facets.
- Penetrations and vents.
- Stories.
- Existing layers.
- Low-slope area.
- Measurement source reference.

If any required field cannot be extracted, the system must attempt approved fallback review:

- Parse alternate PDF pages or CSV tables.
- Review linked CompanyCam photos where available.
- Infer only when the source evidence is strong enough and the confidence threshold is met.
- Otherwise create an operations-dashboard task for human completion.

Missing required measurements block proposal approval.

### 4.3 Template And Package Selection

The system creates Good, Better, and Best options.

Package differentiators:

- Shingle line.
- Manufacturer warranty tier.
- Labor warranty.
- Additional manufacturer warranties.

Accessories are standardized unless package rules, local code, manufacturer requirements, or project conditions require variation.

Zone-level brand priority lists must support:

- Malarkey.
- GAF.
- Owens Corning.
- Additional brands as configured.

The package engine must support multiple templates and future skill-based estimate building. Screenshot-derived templates should be converted into structured template lines and stored in Supabase.

### 4.4 Branch Selection

The system must select the closest appropriate ABC branch using Google Maps API or an approved distance/time evaluator.

Branch selection must consider:

- Property address.
- ABC Ship-To account access.
- Branch eligibility.
- Product availability or branch-line compatibility where known.
- Delivery feasibility.
- Market/zone rules.

The selected branch and alternatives must be recorded with distance, drive time when available, source, and evaluation timestamp.

### 4.5 Live ABC Pricing

The system must pull live ABC branch and account pricing before proposal approval.

Pricing must be requested using:

- Account or Ship-To context.
- Selected branch.
- ABC item identifiers.
- Quantity.
- UOM.

The system must not rely on static spreadsheet pricing for final approval. Static sheets and screenshot templates may be used for mapping, template creation, scenario modeling, and fallback analysis, but the final approved proposal requires verified vendor pricing unless a human explicitly approves an exception.

### 4.6 Quantity And UOM Rounding

The system must round every line up to the purchasing unit of measure.

Examples:

- Shingles round to full bundles or squares according to item UOM.
- Starter rounds to full bundles.
- Hip and ridge rounds to full bundles.
- Underlayment rounds to full rolls.
- Ice and water rounds to full rolls.
- Drip edge rounds to full sticks.
- Nails round to full boxes or coils.
- Vents round to whole each.
- OSB/decking allowance rounds to whole sheets.

The estimate must store:

- Raw measured quantity.
- Waste factor.
- Calculated required quantity.
- UOM conversion.
- Rounded purchase quantity.
- Vendor price UOM.
- Sell UOM.
- Rounding delta.

### 4.7 Pricing And Margin

Gross margin must include all job costs:

- Materials.
- Labor.
- Permit.
- Dump, trailer, and disposal.
- Delivery.
- Financing and payment fees.
- Sales commission.
- Supplement/admin allowance.
- Contingency.
- Any other configured job cost.

Retail pricing target:

- Target v1 gross margin: 40%.
- Human may adjust target through the approval dashboard.
- Retail below 40% but at or above 28% requires Ops Manager approval.
- Retail below 28% requires CEO escalation.

Insurance pricing target:

- Pull ACV and RCV for all scoped items where insurance data exists.
- Minimum gross margin: 42%.
- Below 42% but at or above 28% requires full analysis and Ops Manager approval.
- Below 28% requires CEO escalation.

The system must show both:

- Scope.
- Total.

### 4.8 Proposal Draft

The system generates a proposal draft that includes:

- Good, Better, Best side-by-side options.
- Scope details.
- Total price for each option.
- Payment terms.
- Deposit terms for standard retail.
- Deductible and depreciation terms for insurance.
- Warranty terms.
- Manufacturer warranty options.
- Labor warranty terms.
- Product selections.
- Color/material selection placeholders.
- Decking allowance and per-sheet change-order price.
- Cancellation notices.
- Required terms and conditions.
- Clear page boundaries.
- Signature and initials requirements.

Proposal approval requirements:

- Selected package initials.
- Total price initials.
- Color/material selection initials.
- Payment/deposit terms initials.
- Decking allowance/change-order price initials.
- Cancellation notices initials.
- Full terms initials where required.
- Full document signature.
- All proposal pages included and legible.

The system should research and validate whether AccuLynx contract functionality can support the proposal acceptance, signature, and initials flow. Until confirmed, the system must support a fallback proposal PDF packet and internal handoff.

### 4.9 Invoice Draft

The system drafts the initial invoice.

Retail:

- Invoice amount should be the job total with request for the configured deposit amount.

Insurance:

- Invoice amount should reflect the client requirement for deductible and depreciation owed.

No invoice may be sent without human approval.

### 4.10 AccuLynx Handoff

If AccuLynx API write access supports the needed action, the system should create or update:

- Job fields.
- Scope.
- Estimate or worksheet items.
- Proposal document.
- Invoice draft or payment-related record where permitted.
- Measurement documents.
- Material order draft where permitted.
- Schedule recommendation where permitted.
- Stage/status updates.

If AccuLynx API write access is limited, the MVP fallback is an internal Slack message and/or operations-dashboard task containing every field a human needs to populate AccuLynx manually.

The fallback must be structured enough to copy into AccuLynx without rethinking the job.

### 4.11 Material Order Draft

Once the client selects an option and the human approves the scope, the system prepares a material order draft.

The draft must include:

- Selected package.
- Branch.
- ABC account/Ship-To context.
- Item identifiers.
- Item names.
- Quantities rounded to UOM.
- UOM.
- Verified live price.
- Delivery address.
- Delivery notes.
- Unavailable or human-selection flags.
- Substitution notes.
- Waste assumptions.

The order must be submitted to the operations dashboard for Ops Manager approval. No AI agent may directly place the order externally without explicit approved workflow changes.

### 4.12 Labor Schedule Draft

The system proposes a labor schedule after client selection.

The schedule recommendation must consider:

- Job size.
- Pitch.
- Stories.
- Layers.
- Low-slope area.
- Crew availability if available.
- Weather if integrated.
- Material delivery timing.
- Permit uncertainty.
- Production capacity.

If AccuLynx permits schedule writeback, the system may load a proposed schedule internally. Scheduling must still review and confirm with the crew.

### 4.13 Job Stage And Status Updates

Internal job stage and status updates should be fully automated where AccuLynx API access and Pro Exteriors policy permit.

Automated status updates must be auditable and reversible by humans.

## 5. Verification Gates

Every work product must pass verification before it can be approved, submitted, or used as a basis for external action.

The system must maintain verification records for each estimate run, proposal, invoice, material order, schedule, AccuLynx write, Slack handoff, and learned improvement.

### 5.1 Verification Evidence

Each verification record must store:

- Work product type.
- Work product version.
- Source files used.
- Source extraction references.
- Agent or service that generated the artifact.
- Checks executed.
- Check result.
- Confidence level where applicable.
- Human approver where applicable.
- Approval timestamp.
- Exception notes.
- Remediation task references.
- Final decision.

### 5.2 Measurement Verification

Measurement verification must confirm:

- Required fields are present.
- Source references exist.
- Units are normalized.
- Low-slope areas are identified.
- Stories and layers are present or flagged.
- Penetrations and vents are counted or flagged.
- Waste-adjusted squares are calculated and explainable.
- CompanyCam photo review was attempted when measurement data was missing and photos were available.
- Missing fields route to the operations dashboard.

### 5.3 Product Mapping Verification

Product mapping verification must confirm:

- Each template line maps to an ABC catalog item or is flagged for human selection.
- Item UOM is known.
- Purchase UOM and sell UOM are compatible.
- Manufacturer and product line match the selected package.
- Color/profile/size ambiguity is flagged.
- Unavailable screenshot items are not silently used.
- Substitutions are explicit.

### 5.4 Pricing Verification

Pricing verification must confirm:

- Live ABC branch/account pricing was pulled.
- Branch and Ship-To context are recorded.
- Price timestamp is current enough for approval policy.
- Quantities are rounded up to purchase UOM.
- Material totals reconcile to line totals.
- Labor and all other job costs are included.
- Gross margin calculations are correct.
- Retail and insurance thresholds are applied.
- Any margin exception routes to the correct approver.

### 5.5 Proposal Verification

Proposal verification must confirm:

- Good, Better, Best options are present.
- Scope matches measurements and selected package rules.
- Totals match verified estimate totals.
- Warranty terms match package configuration.
- Payment terms match job type.
- Required initials fields are present.
- Required signature field is present.
- All pages are included and legible.
- No direct client send action has occurred.
- Human approval is recorded before sending.

### 5.6 Invoice Verification

Invoice verification must confirm:

- Retail invoice deposit request follows the configured deposit policy.
- Insurance invoice request follows deductible/depreciation policy.
- Invoice amount traces to proposal total or insurance obligation.
- Human approval is recorded before sending.

### 5.7 Material Order Verification

Material order verification must confirm:

- Client selected package is known.
- Approved scope is locked.
- Item quantities are rounded to UOM.
- Branch/account pricing is verified.
- Delivery address is correct.
- Human-selection items are resolved.
- Substitutions are approved.
- Ops Manager approval is recorded before external order placement.

### 5.8 Schedule Verification

Schedule verification must confirm:

- Proposed schedule accounts for job complexity.
- Material delivery timing is considered.
- Permit uncertainty is considered.
- Crew confirmation is not assumed without scheduling review.
- Ops Manager or scheduling approval is recorded.

### 5.9 AccuLynx Write Verification

Before any AccuLynx write, the system must verify:

- API capability is confirmed.
- Target job is correct.
- Data mapping is correct.
- Write operation is idempotent or duplicate-safe.
- Rollback/remediation path is known.
- Human approval exists where policy requires it.

After any AccuLynx write, the system must verify:

- Write succeeded.
- Returned record IDs are stored.
- AccuLynx state matches intended state.
- Any failure creates an operations-dashboard remediation task.

## 6. Continuous Improvement And Learning Loop

The system must treat every job as a learning opportunity.

Continuous improvement runs as two interlocking loops:

- An inward-facing **job learning loop** (6.1–6.6) that captures what every estimate, exception, and completed job teaches us.
- An outward-facing **autonomous industry research loop** (6.7–6.10) that builds the Pro Exteriors knowledge base daily from approved external sources: building code, products, R&D, compliance, and safety across residential, commercial, and industrial work.

Neither loop may lose a learning, and neither loop may activate a change on its own. Both route through the same trust tiers, verification gates, and operations-dashboard approvals.

No learned skill, agent behavior change, SOP improvement, pricing rule change, template change, mapping correction, or workflow change may be lost or silently absorbed. Every learning must be recorded, reviewed, and either approved, rejected, deferred, or converted into a formal proposal.

### 6.1 Required Learning Events

The system must create learning records when:

- A human overrides an estimate.
- A human changes a product mapping.
- A human changes a quantity.
- A human changes a branch.
- A human changes labor assumptions.
- A human changes margin target or approval decision.
- A proposal is rejected or revised.
- A material order is corrected.
- A schedule recommendation is corrected.
- An unavailable item requires substitution.
- A supplement is caused or avoided.
- A supplement opportunity is discovered.
- A measurement extraction fails or needs human completion.
- CompanyCam photo review resolves missing data.
- An AccuLynx write fails or requires manual fallback.
- A permit issue changes job cost or timeline.
- A completed job has margin variance.
- A completed job has material overage or shortage.
- A completed job has labor variance.
- A client, PM, foreman, or office staff debrief identifies a process issue.

### 6.2 Learning Record Fields

Each learning record must include:

- Source job.
- Estimate run.
- Artifact affected.
- Original AI recommendation.
- Human change or observed outcome.
- Reason for change.
- Cost impact.
- Margin impact.
- Schedule impact.
- Supplement impact.
- Client impact if relevant.
- Source evidence.
- Responsible role.
- Proposed action.
- Status.

Statuses:

- Captured.
- Needs review.
- Accepted as one-off.
- SOP candidate.
- Template candidate.
- Pricing rule candidate.
- Agent skill candidate.
- A3 proposal required.
- Approved.
- Rejected.
- Deferred.
- Implemented.
- Verified after implementation.

### 6.3 SOP And Skill Proposal Flow

When repeated patterns or high-impact exceptions appear, the system must draft an SOP or AI Agent skill proposal.

Proposal types:

- Estimating SOP proposal.
- Product mapping SOP proposal.
- Pricing SOP proposal.
- Measurement extraction SOP proposal.
- CompanyCam review SOP proposal.
- AccuLynx handoff SOP proposal.
- Permit discovery SOP proposal.
- Agent skill proposal.
- Template update proposal.
- Approval policy proposal.

Each proposal must include:

- Problem statement.
- Source jobs.
- Frequency.
- Cost or margin impact.
- Time saved estimate.
- Risk if ignored.
- Proposed new behavior.
- Verification requirements.
- Rollback plan.
- Owner.
- Approver.

Agent SOP or skill proposals must not become active until approved through the operations dashboard.

### 6.4 Post-Job Debrief

Every closed job must trigger a debrief workflow.

The debrief should capture:

- What the estimate got right.
- What the estimate missed.
- Material shortages or overages.
- Labor variance.
- Schedule variance.
- Permit issues.
- Supplement issues.
- Client communication issues.
- Crew notes.
- PM notes.
- Accounting notes.
- Photos or field evidence.
- Recommended SOP changes.

The debrief must feed:

- Capture agent for atomization.
- Auditor for work-product QA.
- Quality Control for repeated failure modes and DMAIC review.
- Innovator for A3 proposals.
- Maintenance for workspace hygiene and standard updates.
- Conductor for routing, digesting, and operational follow-up.

### 6.5 Feedback Loop Roles

Capture:

- Records job learnings, exceptions, and debrief atoms.

Auditor:

- Checks every work product against current standards before approval.

Quality Control:

- Reviews clustered failures and repeated exceptions.
- Owns standard changes and trust-tier changes.

Innovator:

- Drafts A3 proposals for new skills, automation, or workflow changes.
- Proposes, but does not independently build or activate changes.

Maintenance:

- Keeps templates, specs, mappings, and docs organized after approved changes.

Conductor:

- Routes tasks, escalations, digests, and pending approvals to the right owner.

Ops Manager:

- Reviews operational exceptions, standard approvals, orders, schedules, and margin exceptions within authority.

CEO:

- Reviews jobs below 28% gross margin and other executive escalations.

### 6.6 Verification Before Improvement Activation

Every proposed improvement must pass verification before activation:

- Source examples are reviewed.
- Financial impact is calculated.
- Risk is documented.
- Approval owner is identified.
- Regression risk is checked.
- Test job or shadow run is completed where practical.
- Change is documented.
- Rollback path exists.
- Post-activation monitoring is scheduled.

No agent may update its own SOP, skill, template rule, or pricing logic based only on its own output. Human-approved governance is required.

### 6.7 Autonomous Industry Research Loop

The research loop adapts the bounded autonomous experiment pattern from `karpathy/autoresearch` (MIT; concept re-expressed here, not redistributed). The pattern: an agent iterates inside a fixed budget, scores each cycle against a single fixed harness, keeps or discards on that score, appends every cycle to a run ledger, advances an isolated working line, and the human steers by editing a charter document rather than the agent's internals.

Concept mapping:

| autoresearch | PE knowledge loop |
| --- | --- |
| `train.py` (the one file the agent edits) | Candidate findings in the knowledge staging area |
| `prepare.py` (fixed; agent may not modify) | Verification harness and scoring rules (fixed; changes require approval) |
| `program.md` (human-edited org code) | Research charter: domains, priorities, jurisdictions, source allowlist |
| Fixed 5-minute training budget | Fixed daily research run window and budget |
| `val_bpb` ground-truth metric | Finding quality score (6.10) |
| `results.tsv` append-only ledger | `kb_research_runs` ledger; every cycle logged, including discards and failures |
| Branch advance / git reset | Staging keep/discard; the approved knowledge base is never written directly |
| "NEVER STOP" loop discipline | Run executes unattended to budget exhaustion inside its scheduled window |

Daily run loop:

1. Load the active research charter.
2. Pull the highest-priority open research question from the queue (charter topics, recurring scans, and questions generated by the job learning loop).
3. Search approved external sources only.
4. Draft a finding: claim, evidence excerpts, full citations, jurisdiction, era tags.
5. Score the finding against the verification harness.
6. Keep (write to staging as `evidence`-tier atoms) or discard. Log either way.
7. Repeat until the run budget is exhausted.
8. Emit the daily digest and update the promotion queue.

Hard boundaries:

- The Researcher is external-only. It never reads or writes the client brain directly; staged findings enter the brain only through the gated ingest path.
- All loop output is `evidence` tier. Autonomous keep/discard operates only within staging. No score, however high, promotes a finding to `instruction` tier without human approval.
- Every code, product, or practice finding carries `era_of_practice` and, where applicable, `regulatory_snapshot_id`. The research loop is the system's primary producer of regulatory snapshots.
- The verification harness is the `prepare.py` of this system: no agent may modify its own scoring rules. Harness changes route through the approval matrix.
- The charter is the `program.md`: humans tune the research org by editing the charter, and charter changes are themselves approved and versioned.

### 6.8 Knowledge Domains

The charter must maintain coverage, for residential, commercial, and industrial lanes, of:

- **Building code**: IRC, IBC, IECC and energy code, state and local amendments, jurisdiction adoption status and effective dates, wind/uplift and fastening requirements, underlayment and ice-barrier rules, ventilation requirements, reroof vs tear-off rules.
- **Products**: manufacturer lines for Malarkey, GAF, Owens Corning, and configured brands — new product introductions, discontinuations, spec and installation-requirement changes, warranty program changes, regional availability.
- **R&D and industry direction**: materials research, cool-roof and solar-ready developments, industry association technical bulletins, relevant standards changes (ASTM, UL, FM where applicable to lane).
- **Compliance**: contractor licensing, permit regime changes, manufacturer certification requirements for warranty tiers, insurance and consumer-protection rules affecting proposals and contracts.
- **Safety**: OSHA requirements (fall protection, ladder, heat), manufacturer safety bulletins, recalls.

Each domain accumulates dated, era-tagged atoms so a future retrieval can distinguish 2026 practice from later practice. Recurring scans (e.g., quarterly code-adoption checks per active jurisdiction, monthly manufacturer bulletin sweeps) are charter entries, not ad-hoc agent decisions.

### 6.9 Two-Loop Integration

The job learning loop and the research loop must work as one system:

- **Learning events generate research questions.** Repeated substitutions of a discontinued shingle, a permit surprise in a jurisdiction, a failed product mapping, or a supplement pattern create entries in the research question queue with source-job references.
- **Research findings feed the proposal flow.** A finding that should change behavior (template update, pricing rule, SOP, estimating assumption, safety practice) becomes an SOP/template/pricing/skill proposal through 6.3 — never a direct activation.
- **Conflict detection.** When a kept finding contradicts an active SOP, template line, code assumption, or pricing rule, the system creates a knowledge conflict record and routes it to Quality Control. Conflicts affecting in-flight estimates flag those estimate runs on the dashboard.
- **Daily digest.** The Conductor publishes a daily research digest to the operations dashboard and internal Slack: new findings, conflicts, promotion queue, coverage gaps, and run health. The knowledge base must visibly grow every day the loop runs.
- **Shared governance.** Both loops use the same learning-record statuses (6.2), the same proposal flow (6.3), the same approval matrix (7), and the same dashboard queues.

### 6.10 Finding Quality Score

The harness scores every finding on:

- **Source authority tier**: code body or regulator > manufacturer technical document > trade association > trade press > community/forum (forum content may inform questions, never support a kept finding alone).
- **Corroboration**: independent source count for the same claim.
- **Recency and era fit**: publication date vs the era the claim is asserted for.
- **Citation integrity**: every claim traceable to a fetched, stored source excerpt — no uncited claims.
- **Jurisdiction specificity**: code/compliance claims must bind to explicit jurisdictions and effective dates.
- **Conflict flags**: contradictions with existing atoms or active standards lower the auto-keep score and force conflict records.

Scores gate autonomous keep/discard at evidence tier and order the human promotion queue. Promotion to instruction tier always requires a human approver per the approval matrix.

## 7. Approval Matrix

All approvals route through `cc.proexteriorsus.net/operations`.

| Decision | Approver |
| --- | --- |
| Standard retail proposal at or above 40% GM | Ops Manager Roberto |
| Retail proposal below 40% and at or above 28% GM | Ops Manager |
| Retail proposal below 28% GM | CEO |
| Insurance proposal at or above 42% GM | Ops Manager |
| Insurance proposal below 42% and at or above 28% GM | Ops Manager |
| Insurance proposal below 28% GM | CEO |
| Material order draft | Ops Manager |
| Labor schedule draft | Ops Manager |
| Permit unresolved or unknown | Ops Manager |
| Missing measurement after extraction and CompanyCam review | Ops Manager |
| SOP proposal | Ops Manager or role owner according to policy |
| AI Agent skill proposal | Ops Manager for operational behavior, CEO for high-risk or margin-impacting behavior |
| Research charter change (domains, sources, jurisdictions, cadence) | Ops Manager |
| Research finding promotion to instruction-grade knowledge | Ops Manager; CEO where pricing, margin, or contract language is impacted |
| Knowledge conflict resolution affecting an active SOP, template, or pricing rule | Quality Control recommendation, Ops Manager approval |
| Verification harness or finding-score rule change | Ops Manager; A3 proposal required for material changes |

## 8. Data Model Requirements

The system should use Supabase as the durable operational data layer.

### 8.1 Core Tables

Recommended tables:

- `estimate_runs`
- `estimate_source_documents`
- `estimate_measurements`
- `estimate_measurement_fields`
- `estimate_package_templates`
- `estimate_template_lines`
- `estimate_product_mappings`
- `estimate_branch_evaluations`
- `estimate_pricing_requests`
- `estimate_pricing_lines`
- `estimate_scenario_options`
- `estimate_scenario_lines`
- `estimate_cost_components`
- `estimate_margin_checks`
- `estimate_proposals`
- `estimate_invoice_drafts`
- `estimate_material_order_drafts`
- `estimate_schedule_recommendations`
- `estimate_acculynx_handoffs`
- `estimate_verification_checks`
- `estimate_approval_tasks`
- `estimate_learning_events`
- `estimate_sop_proposals`
- `estimate_a3_proposals`

Knowledge research tables:

- `kb_research_charters`
- `kb_research_questions`
- `kb_research_runs`
- `kb_research_findings`
- `kb_finding_sources`
- `kb_atoms_staging`
- `kb_knowledge_conflicts`
- `kb_regulatory_snapshots`
- `kb_research_digests`
- `kb_promotion_queue`

Research tables follow the same additive-migration, provenance, and trust-tier rules as estimate tables. `kb_atoms_staging` rows default to `evidence` trust tier; promotion writes occur only through the approved ingest path with the approver recorded.

### 8.2 Source Provenance

Every extracted or calculated value must preserve provenance:

- Source document.
- Source page or row where available.
- Extraction method.
- Confidence.
- Human override flag.
- Human override reason.
- Timestamp.

### 8.3 Security And Exposure

Supabase service-role credentials must remain server-side only.

Tables should be designed with row-level security in mind. Public or client-side exposure must be deliberate and reviewed. Internal operations data should default to server-side access through approved application endpoints.

## 9. Integrations

### 9.1 ABC Supply

Required:

- Live branch/account pricing.
- Product catalog mapping.
- Branch evaluation.
- UOM-aware pricing.
- Human selection flags for ambiguous or unavailable items.

Not required for v1:

- Direct external material order placement without human approval.

### 9.2 Google Maps

Required:

- Branch proximity evaluation from job address.
- Distance and drive-time metadata where available.

### 9.3 AccuLynx

Required:

- Capability discovery for estimate, worksheet, proposal, contract, document, invoice, payment, status, schedule, and material order workflows.
- Write automation where API permits.
- Manual Slack/dashboard fallback where API does not permit.

Open item:

- Confirm whether AccuLynx contract functionality supports Good/Better/Best approval, required initials, full document signature, and selected-option acceptance.

### 9.4 CompanyCam

Required when available:

- Photo review for missing measurements, penetrations, vents, layers, stories, and roof-condition context.
- Evidence links for human review.

### 9.5 Slack

Required:

- Internal notification and fallback handoff.
- No direct client communication.

### 9.6 Operations Dashboard

Required:

- Approval queue.
- Verification checklist.
- Exception review.
- Margin escalation.
- Missing data tasks.
- Material order review.
- Schedule review.
- SOP and skill proposal review.
- Learning-event review.
- Research digest, promotion queue, and knowledge conflict review.

### 9.7 External Research Sources

Required:

- Approved source allowlist maintained in the research charter: code bodies and jurisdiction portals (ICC publications, state/local amendments), OSHA, manufacturer technical libraries (Malarkey, GAF, Owens Corning, configured brands), NRCA and relevant trade associations.
- Source fetch, excerpt storage, and citation linkage for every kept finding.
- Researcher security boundary: external-only, no client brain access, no client PII in any outbound request.

Not permitted:

- Unallowlisted sources supporting a kept finding.
- Redistribution of licensed code content; store excerpts and citations within license terms.

## 10. MVP Acceptance Criteria

The MVP is acceptable when:

- A user can upload a measurement PDF or CSV.
- The system extracts all required measurement fields or routes missing fields to the dashboard.
- The system creates Good, Better, Best package options.
- The system maps package lines to ABC products or flags human-selection items.
- The system selects an appropriate ABC branch.
- The system pulls live ABC branch/account pricing.
- The system rounds all quantities up to UOM.
- The system calculates all job costs and gross margin.
- The system enforces retail and insurance margin thresholds.
- The system generates a proposal draft PDF.
- The proposal includes required initials and signature areas.
- The system drafts the appropriate initial invoice.
- The system creates AccuLynx writes where supported or a complete Slack/dashboard fallback where not supported.
- The system prepares a material order draft after client selection.
- The system proposes a labor schedule after client selection.
- Every artifact passes verification before approval.
- Human approval is required before all external actions.
- Every exception, override, and completed job creates learning records.
- SOP and AI Agent skill proposals are generated for repeated or high-impact learnings.
- No learned skill or process change can become active without review and approval.
- The research loop runs daily within its budget, stages cited evidence-tier findings, logs every cycle to the run ledger, and emits a daily digest.
- Knowledge conflicts with active standards create QC-routed conflict records.
- No research finding reaches instruction tier or changes agent behavior without human approval.

## 11. Non-Goals For V1

The following are not v1 goals unless separately approved:

- Direct client email or SMS by an AI agent.
- Direct ABC material order submission without human approval.
- Fully automated permit submission in unknown jurisdictions.
- Automatic legal-language selection without approved templates.
- Replacing AccuLynx as the system of record.
- Client-facing autonomous negotiation.
- Unapproved self-modification of agent SOPs or skills.

## 12. Open Questions

These items require discovery during implementation:

- Which AccuLynx write endpoints are available in the Pro Exteriors account.
- Whether AccuLynx contract workflows can support side-by-side options, selected-option initials, page initials, and full signature.
- Exact deposit policy for standard retail jobs.
- Exact depreciation collection policy for insurance jobs.
- Approved gross margin calculation formula for sales commission and financing fees.
- Market-specific brand priority lists.
- Market-specific labor rate tables.
- Market-specific permit discovery process.
- ABC account and Ship-To selection rules by branch and market.
- CompanyCam API access and photo-review confidence thresholds.
- Licensed access path for code content (ICC digital access or equivalent) and permissible excerpt storage.
- Initial active jurisdiction list for code and permit research coverage.
- Daily research run budget (time, search/fetch volume, model cost) and scheduled window.
- Initial source allowlist and its owner.

## 13. Implementation Phases

### Phase 1: Data Foundation

- Convert screenshot templates into structured template lines.
- Ingest ABC spreadsheet as mapping evidence.
- Create Supabase schema for estimate templates, mappings, runs, verification, approvals, and learning events.
- Add source provenance and audit fields.

### Phase 2: Measurement Extraction

- Parse measurement PDFs and CSVs.
- Normalize required fields.
- Add missing-field dashboard tasks.
- Add CompanyCam review hooks where available.

### Phase 3: Pricing Engine

- Select ABC branch using address and branch evaluator.
- Pull live ABC pricing.
- Apply UOM rounding.
- Calculate material, labor, fees, contingency, and gross margin.
- Produce Good, Better, Best scenarios.

### Phase 4: Proposal And Invoice Drafting

- Generate proposal PDF.
- Generate initial invoice draft.
- Add initials/signature requirements.
- Route to verification and human approval.

### Phase 5: AccuLynx And Slack Handoff

- Discover and implement safe AccuLynx writes.
- Add Slack/dashboard fallback for unsupported writes.
- Add post-write verification.

### Phase 6: Order And Schedule Drafting

- Generate material order draft after selected option.
- Generate labor schedule recommendation.
- Route both to Ops Manager review.

### Phase 7: Verification And Learning Loop

- Add verification gates to every artifact.
- Add learning-event capture.
- Add SOP and skill proposal generation.
- Add post-job debrief integration.
- Add QC, Innovator, Maintenance, and Conductor routing.

### Phase 8: Autonomous Industry Research Loop

- Create research charter v1 (domains, jurisdictions, source allowlist, cadence, run budget).
- Build the verification harness and finding quality score.
- Build the daily run loop: question queue, source fetch, finding drafting, scoring, staging keep/discard, run ledger.
- Add knowledge conflict detection against active SOPs, templates, and pricing rules.
- Add the promotion queue and instruction-tier approval path.
- Add daily digest via Conductor to dashboard and internal Slack.
- Wire learning events (Phase 7) into the research question queue.

## 14. Definition Of Done

The system is done for v1 when a retail residential reroof can move from measurement upload to verified proposal draft, invoice draft, AccuLynx/Slack handoff, material order draft, and schedule recommendation with:

- Complete source provenance.
- Live ABC pricing.
- UOM rounding.
- Gross margin enforcement.
- Human approval gates.
- Full verification evidence.
- No unauthorized external communication.
- Learning capture for every override, exception, variance, and completed job.
- SOP and AI Agent skill proposal workflow for continuous improvement.
- A daily autonomous research loop that grows the Pro Exteriors knowledge base with cited, era-tagged, evidence-tier findings, surfaces conflicts with active standards, and promotes nothing without human approval.

