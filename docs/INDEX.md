# Docs index

Index of every file and subfolder directly inside `docs/`. Each line links to the item and describes it from that file's title and opening, or from the subfolder's contents.

## Foundations and operator guides

- [00-architecture-brief.md](00-architecture-brief.md): Draft architecture brief for the Cleverwork Open Brain, the spec between brainstorm and scaffold.
- [01-onboard-a-roofer.md](01-onboard-a-roofer.md): Step-by-step guide for provisioning an isolated brain for a new roofing client.
- [02-debrief-script.md](02-debrief-script.md): Standard post-op debrief script for a closed roofing job so captured atoms stay comparable.
- [03-philosophy.md](03-philosophy.md): Why this brain keeps a maintained wiki so synthesis persists between questions.
- [04-going-local.md](04-going-local.md): Data-residency profile for a local deployment when remote hosting cannot meet a sovereignty requirement.
- [05-model-matrix.md](05-model-matrix.md): Matrix mapping each agent role to a model tier, a fallback path, and the config tier keys.
- [06-security-checklist.md](06-security-checklist.md): Pre-go-live security gate that must be confirmed before the first real job data enters a brain.
- [07-faq.md](07-faq.md): Plain answers to questions roofers and operators ask during discovery and onboarding.
- [08-stack-and-topology.md](08-stack-and-topology.md): Decision record of the recommended Cleverwork tech stack and how the deployment pieces fit.
- [09-validation-and-audit.md](09-validation-and-audit.md): How agent, skill, and client validation ties governance roles to concrete metrics and a live dashboard.
- [10-client-support.md](10-client-support.md): How client support covers the brain and surrounding tools, with Conductor as the front door.
- [CUSTOMIZATION.md](CUSTOMIZATION.md): Guide for operator customization that goes beyond the company name and integration toggles in the config file.
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md): Symptom, likely cause, and fix notes, starting with the deployment verification script for common failures.
- [onboarding/](onboarding): Pre-onboarding explainer and guided worksheet that collect business context before a brain is provisioned.

## Pro Exteriors workforce and admin

- [11-pro-exteriors-agent-workforce-plan.md](11-pro-exteriors-agent-workforce-plan.md): Working plan to turn the roofing scaffold into a safe, inspectable agent workforce for Pro Exteriors.
- [12-pro-exteriors-agent-app-and-slack.md](12-pro-exteriors-agent-app-and-slack.md): Plan for the agent app, Slack channel structure, approval surfaces, and the first workflow manifest.
- [13-pro-exteriors-admin-interface.md](13-pro-exteriors-admin-interface.md): Plan to build the browser admin viewport so agent work can be reviewed before Slack automation.

## Platform architecture and product specs

- [15-prd-agent-platform.md](15-prd-agent-platform.md): Product requirements for turning the Command Center prototype into a deployed, always-on agent platform.
- [16-platform-architecture-and-topology.md](16-platform-architecture-and-topology.md): Production topology for the deployed agent platform, extending the earlier stack decision record.
- [17-frontend-command-center-spec.md](17-frontend-command-center-spec.md): Frontend spec for the production Command Center as an Astro server-rendered application.
- [18-platform-integrations.md](18-platform-integrations.md): Integration spec with one row per external service, covering purpose, owner, boundary, and connection.
- [19-security-and-access.md](19-security-and-access.md): Production security posture for the deployed platform, including WorkOS, platform secrets, and key handling.
- [20-observability-and-incident-response.md](20-observability-and-incident-response.md): How the platform is watched and how a two-person team responds when something breaks.
- [21-roofing-api-source-intelligence.md](21-roofing-api-source-intelligence.md): Planning reference for the public API surface of roofing supplier and operating-system integrations.
- [22-gsd-app-transition-roadmap.md](22-gsd-app-transition-roadmap.md): Roadmap for using the open-gsd core as the development operating loop for this app.
- [23-agent-task-cadence-and-cron.md](23-agent-task-cadence-and-cron.md): Operating model for human-in-the-loop work ordered by department, cadence, and agent run.
- [24-supabase-product-surface-integration.md](24-supabase-product-surface-integration.md): How the Command Center loader is wired to the current Pro Exteriors Supabase instance as its first data surface.
- [25-workos-agent-auth-md-integration.md](25-workos-agent-auth-md-integration.md): Discovery skeleton for WorkOS auth.md agent registration while WorkOS remains the human access gate.
- [26-open-brain-memory-system.md](26-open-brain-memory-system.md): Memory layer that combines a small curated startup snapshot with semantic recall.
- [27-hetzner-coolify-agent-host.md](27-hetzner-coolify-agent-host.md): Draft for running the first production Open Brain host on a single Hetzner Coolify machine.
- [28-sentry-mcp-and-observability.md](28-sentry-mcp-and-observability.md): Draft notes on Sentry MCP and the Sentry CLI as the platform observability path.
- [29-connection-and-access-checklist.md](29-connection-and-access-checklist.md): Checklist for connections and access, with real local secrets kept out of chat, docs, and commits.
- [30-workos-slack-agent-setup-sop.md](30-workos-slack-agent-setup-sop.md): Setup procedure for WorkOS as the human login gate and Slack as the agent communication surface.
- [32-command-center-agent-access.md](32-command-center-agent-access.md): The three Command Center access paths, so agent workflows are not blocked by a desktop session.
- [33-roofing-estimate-to-proposal-system-spec.md](33-roofing-estimate-to-proposal-system-spec.md): Draft spec for a residential reroof path from measurement upload through a human-approved proposal package.
- [34-workos-human-auth-spec.md](34-workos-human-auth-spec.md): Spec and build plan for WorkOS AuthKit human authentication on the Command Center.
- [37-acculynx-write-capability-matrix.md](37-acculynx-write-capability-matrix.md): Sandbox write-capability matrix for AccuLynx endpoints, with each verdict backed by a live probe.
- [65-acculynx-read-capability-matrix.md](65-acculynx-read-capability-matrix.md): Sandbox read-capability matrix for documented AccuLynx GET endpoints, paired with the write matrix.

## Decisions and infrastructure operations

- [35-decision-graphify-skipped.md](35-decision-graphify-skipped.md): Decision that Graphify was evaluated and skipped unless a listed revisit trigger fires.
- [35-vendor-territory-google-map-plan.md](35-vendor-territory-google-map-plan.md): Plan to restore vendor territories as an interactive map inside the live Command Center.
- [36-decision-live-db-binding.md](36-decision-live-db-binding.md): Decision that estimate and knowledge-base schemas bind to the live database, not the template core.
- [36-supabase-infrastructure-ops.md](36-supabase-infrastructure-ops.md): Operating model for durable agent access to Supabase without treating production as a lab.

## Pricing, catalogs, and agreements

- [14-vendor-pricing-catalog-and-line-approval.md](14-vendor-pricing-catalog-and-line-approval.md): Design for the product catalog as the pricing source of truth and for line-by-line price approval.
- [38-price-foundation-review-dashboard.md](38-price-foundation-review-dashboard.md): Command Center surface that makes price-foundation migration records reviewable before they become reusable pricing.
- [39-price-list-audit-go-live-plan.md](39-price-list-audit-go-live-plan.md): Go-live plan for the price list audit, invoice audit, and negotiated item catalog surfaces.
- [40-price-agreement-builder-plan.md](40-price-agreement-builder-plan.md): Build plan for a vendor-agnostic builder that produces a negotiated price-agreement package per branch.
- [43-price-list-lock-and-api-pricing-rules.md](43-price-list-lock-and-api-pricing-rules.md): Design notes for locking an invoice to the price agreement in force when it was first matched.
- [44-abc-classification-methodology.md](44-abc-classification-methodology.md): Plain-language explanation of the Pareto review classes shown on the agreement builder and catalog.
- [46-uom-pricing-normalization.md](46-uom-pricing-normalization.md): Canonical contract for comparing an invoice price to an agreement price in one unit of measure.
- [51-global-price-agreement-best-vendor-and-ocr-ingest.md](51-global-price-agreement-best-vendor-and-ocr-ingest.md): Build record for best-vendor price selection and the OCR ingest loop on the existing catalog layer.
- [83-price-agreement-management.md](83-price-agreement-management.md): Consolidation plan and line-review contract so repeated purchases get a negotiated price.
- [87-vendor-silo-eval.md](87-vendor-silo-eval.md): End-to-end evaluation of the rule that an invoice line is priced only by a matching vendor and office agreement.
- [90-agreement-surfaces-multi-vendor.md](90-agreement-surfaces-multi-vendor.md): Map of which agreement surfaces are vendor-aware and which paths are still hardcoded to one vendor.
- [97-price-agreement-resolution-and-silo-audit.md](97-price-agreement-resolution-and-silo-audit.md): Walkthrough of how an invoice reaches a price agreement and which office and vendor boundaries must hold.
- [98-branch-office-agreement-coverage-audit.md](98-branch-office-agreement-coverage-audit.md): Follow-on audit of branch, office, and agreement coverage against production data.
- [101-srs-agreement-pdfs-and-ceo-verified-retirement.md](101-srs-agreement-pdfs-and-ceo-verified-retirement.md): Records that SRS price-agreement PDFs are stored and that the ceo_verified approval gate was retired.
- [104-pec226-office-scoped-evidence-and-oem-reference.md](104-pec226-office-scoped-evidence-and-oem-reference.md): What the held review queue was worth, and the manufacturer reference that settled the ranking.
- [105-price-agreement-silo-rules.md](105-price-agreement-silo-rules.md): Contract for which negotiated price is allowed to be compared with which invoice line.
- [106-abc-matcher-parity-and-expiry-visibility.md](106-abc-matcher-parity-and-expiry-visibility.md): Rulings on matcher parity, expiry as an explicit choice, and an audit page that was rendering empty.
- [107-coverage-gap-dollar-exposure.md](107-coverage-gap-dollar-exposure.md): Ranks office and vendor coverage gaps by dollar exposure, using priced-item emptiness as the gap signal.

## Invoice audit and vendor files

- [42-invoice-audit-data-integrity.md](42-invoice-audit-data-integrity.md): Invoice audit accuracy fixes and the two recurring failure patterns to recognize on the next pass.
- [45-communications-dashboard-design-note.md](45-communications-dashboard-design-note.md): Design note for one dashboard of pending outbound communications. The surface is not built.
- [47-external-abc-api-open-conversations.md](47-external-abc-api-open-conversations.md): Running log of confirmed ABC Supply invoice and order API limitations to raise with the vendor API team.
- [48-abc-invoice-ar-and-api-validation-audit.md](48-abc-invoice-ar-and-api-validation-audit.md): Audit that backfills accounts-receivable status and checks API invoice numbers against the downloaded report.
- [49-go-live-csv-source-of-truth-alignment.md](49-go-live-csv-source-of-truth-alignment.md): Assumptions ledger that treats the ABC open and closed invoice report as the go-live source of truth.
- [50-invoice-audit-communications-preview-validation.md](50-invoice-audit-communications-preview-validation.md): Runbook that validates the invoice audit communications preview for the first vertical slice.
- [50-monday-invoice-filter-and-price-list-phases.md](50-monday-invoice-filter-and-price-list-phases.md): Prepared phases for a Monday invoice filter and ABC price-list ingest, with the data staged and not yet live.
- [61-service-warranty-audit-transfer.md](61-service-warranty-audit-transfer.md): How commercial ship-to invoices leave the pricing audit and move to a parallel service and warranty audit.
- [63-daily-invoice-processing.md](63-daily-invoice-processing.md): Implementation plan for daily invoice processing and the on-demand register and payment CSV exports.
- [67-invoice-pipeline-outage-and-restoration-2026-07-06.md](67-invoice-pipeline-outage-and-restoration-2026-07-06.md): Record of the invoice pipeline outage from late June and the restoration verified on 6 July 2026.
- [79-qxo-srs-vendor-invoice-onboarding-plan.md](79-qxo-srs-vendor-invoice-onboarding-plan.md): Proposed plan for QXO and SRS invoices to enter the same validation and payment pipeline as ABC Supply.
- [80-qxo-srs-file-formats-and-ingestion-spec.md](80-qxo-srs-file-formats-and-ingestion-spec.md): Parsing spec from the first delivered QXO and SRS files, including which files are actually ABC agreements.
- [81-invoice-audit-v2-process-and-build-plan.md](81-invoice-audit-v2-process-and-build-plan.md): Approved process contract and build plan for the second version of the invoice audit.
- [82-invoice-audit-button-remediation.md](82-invoice-audit-button-remediation.md): Click-trace audit and remediation plan for every control on the deployed invoice audit dashboard.
- [86-vendor-payment-memos.md](86-vendor-payment-memos.md): How a vendor payment memo becomes the paid-verified terminal status in the invoice audit pipeline.
- [89-srs-vendor-state-of-the-world.md](89-srs-vendor-state-of-the-world.md): Single current-state note for SRS work, meant to be updated whenever that vendor state changes.
- [100-invoice-audit-four-cards-and-sent-workspace.md](100-invoice-audit-four-cards-and-sent-workspace.md): Invoice audit redesign with four controls, four cards, and the sent credit-memo workspace.
- [59-invoice-audit-sop-presentation-rebuild-plan.md](59-invoice-audit-sop-presentation-rebuild-plan.md): Approved plan to rebuild the invoice audit interface and present the pricing analyst operating procedure.

## Credit memos

- [88-multi-vendor-credit-memo-pill.md](88-multi-vendor-credit-memo-pill.md): Makes the credit-memo requested card reflect every vendor, with one action path per vendor.
- [93-credit-memo-reaudit-2026-08-19.md](93-credit-memo-reaudit-2026-08-19.md): Re-audit of every open credit-memo request, derived independently three times and then reconciled.
- [95-credit-memo-evidence-panel.md](95-credit-memo-evidence-panel.md): Credit-memo evidence panel plus three invoice-audit corrections found in a page review.
- [96-credit-memo-work-surface.md](96-credit-memo-work-surface.md): Rebuilds the credit-memo page onto the office, vendor branch, and invoice nesting used elsewhere.
- [99-credit-memo-money-truth-2026-08-20.md](99-credit-memo-money-truth-2026-08-20.md): Three migrations that make the invoice-audit money columns match credit-memo settlement and write-back.

## Stormwatch and ZoomInfo

- [47-zoominfo-devportal-manual.md](47-zoominfo-devportal-manual.md): Operational playbook for building and operating ZoomInfo-powered applications through the developer portal.
- [48-zoominfo-implementation-checklist.md](48-zoominfo-implementation-checklist.md): Execution checklist and ticket pack that accompanies the ZoomInfo developer portal manual.
- [49-stormwatch-zoominfo-create-app-guide.md](49-stormwatch-zoominfo-create-app-guide.md): Step-by-step path for creating the first Stormwatch ZoomInfo app in the developer portal.
- [50-stormwatch-zoominfo-supabase-ghl-field-contract.md](50-stormwatch-zoominfo-supabase-ghl-field-contract.md): Canonical field contract so an accepted Stormwatch contact can round-trip identity across Supabase and GHL.
- [51-stormwatch-full-field-validation-2026-06-24.md](51-stormwatch-full-field-validation-2026-06-24.md): Validation record for the Stormwatch full-field contract hardening pass on 24 June 2026.
- [52-stormwatch-lead-packaging-validation-2026-06-24.md](52-stormwatch-lead-packaging-validation-2026-06-24.md): Validation that Stormwatch lead packages replayed complete for the accepted contact set.
- [53-storm-alert-sla-validation-2026-06-24.md](53-storm-alert-sla-validation-2026-06-24.md): Validation of the storm-triggered orchestration path and the schema migrations that support it.
- [54-stormwatch-forensic-review-2026-06-25.md](54-stormwatch-forensic-review-2026-06-25.md): Forensic review of lessons, repeatable workflows, and automation targets from the Stormwatch implementation thread.

## Agents, access, and governance

- [53-agent-onboarding-automation-assessment.md](53-agent-onboarding-automation-assessment.md): Assessment of which agent-onboarding platform steps can run from an API after a one-time setup.
- [54-third-party-agent-tool-gate-2026-06-25.md](54-third-party-agent-tool-gate-2026-06-25.md): Active standard for reviewing external skills, plugins, MCP servers, and other third-party agent tools before use.
- [55-command-center-performance-workflow-2026-06-25.md](55-command-center-performance-workflow-2026-06-25.md): Measurement note and smoke workflow for authenticated Command Center render time and payload size.
- [56-headless-agent-scheduler-design.md](56-headless-agent-scheduler-design.md): Design for a host-driven headless Hermes scheduler, with Alex Rivers as the first end-to-end proof.
- [57-alex-rivers-sops.md](57-alex-rivers-sops.md): Daily operating procedures for the pricing variance analyst, validated against production in June 2026.
- [58-dev-vs-ops-agent-delineation.md](58-dev-vs-ops-agent-delineation.md): Contract that separates the development-team agent plane from the roofing operations agent plane.
- [59-endpoint-auth-matrix.md](59-endpoint-auth-matrix.md): Matrix of which Command Center API prefixes each agent token class is allowed to call.
- [59-red-team-milestone-protocol.md](59-red-team-milestone-protocol.md): Protocol for a red-team pass when a milestone, epic, phase ship, or release is tagged.
- [60-agent-sop-confinement-and-data-exfiltration-defense.md](60-agent-sop-confinement-and-data-exfiltration-defense.md): Parked threat-model note on keeping agent conversations inside their procedures and blocking confidential data leakage.
- [64-open-access-no-user-gating.md](64-open-access-no-user-gating.md): Decision that every authenticated Command Center user can see and work every surface of the app.
- [66-slack-attachment-ingestion-validation.md](66-slack-attachment-ingestion-validation.md): Validation that Slack attachment bytes for common document, image, and media types are preserved in Supabase.
- [70-agent-coordination-stabilization-and-migration-plan.md](70-agent-coordination-stabilization-and-migration-plan.md): Plan to stabilize current agent workflows before migrating the development-team operating loop.
- [71-phase2-cadence-identity-token-reconciliation.md](71-phase2-cadence-identity-token-reconciliation.md): Phase 2 scope for one source of truth on cadence, identity, and token policy, with no behavior change intended.
- [73-agents-under-management/](73-agents-under-management): Discovery interview that locks ambiguous inputs before the eight-agent spec states testable acceptance criteria.
- [74-named-agent-runtime-ringer-governance.md](74-named-agent-runtime-ringer-governance.md): Governance standard for the named-agent runtime, starting with the Maya pilot and a serial rollout.
- [75-pec76-orgo-hermes-eve-third-party-gates.md](75-pec76-orgo-hermes-eve-third-party-gates.md): Planning gates for isolated agent computers, the Hermes baseline, and a separate eve shadow comparison.
- [86-maya-accounting-linear-runtime.md](86-maya-accounting-linear-runtime.md): Maya accounting runtime where channel intake, recurring loops, and assigned work share one upstream source.
- [94-orgo-qa-desktop.md](94-orgo-qa-desktop.md): Daily real-browser walker that records speed, hangs, and broken click-throughs on Command Center pages.
- [95-qa-agent-workos-auth.md](95-qa-agent-workos-auth.md): WorkOS identity for the site walker so one-time sign-in codes arrive in an API-readable mailbox.
- [108-repo-wide-pii-remediation.md](108-repo-wide-pii-remediation.md): Closed record of named records found in committed files, raised during review and then ruled.
- [linear/](linear): PEC team receipt for the Maya accounting operations run and the downstream issues that run opened.

## Executive pipeline, cashflow, and mirrors

- [68-executive-pipeline-sold-value-data-integrity-2026-07-06.md](68-executive-pipeline-sold-value-data-integrity-2026-07-06.md): Diagnosis of an inflated year-to-date sold value caused by duplicate legacy pipeline rows.
- [69-executive-pipeline-kpi-forensic-audit-2026-07-07.md](69-executive-pipeline-kpi-forensic-audit-2026-07-07.md): Forensic audit of every headline KPI on the executive pipeline year-to-date view.
- [72-executive-pipeline-ytd-sold-value-filter-2026-07-07.md](72-executive-pipeline-ytd-sold-value-filter-2026-07-07.md): Investigation of whether the year-to-date sold-value filter was actually limited to the current year.
- [74-quickbooks-production-read-only-guardrails.md](74-quickbooks-production-read-only-guardrails.md): Standing rule that live QuickBooks Online is extract and mirror only.
- [75-cashflow-wip-executive-initiative-2026-07-26.md](75-cashflow-wip-executive-initiative-2026-07-26.md): Locked decisions for the cashflow and work-in-progress executive Command Center surface.
- [76-qbo-supabase-mirror.md](76-qbo-supabase-mirror.md): Read-only historical QuickBooks Online extract mirrored into Supabase for Friday receivables and cashflow joins.
- [77-cashflow-wip-next-pec101-105-103.md](77-cashflow-wip-next-pec101-105-103.md): Next cashflow and work-in-progress wave after the QuickBooks mirror, before the interactive page is started.
- [78-centerpoint-supabase-mirror.md](78-centerpoint-supabase-mirror.md): Read-only historical CenterPoint Connect extract mirrored into Supabase for commercial and service work in progress.
- [80-jt-sync-sentinel.md](80-jt-sync-sentinel.md): Sentinel that compares JobTread with Supabase on a daily read-only sweep and stages outbound changes for approval.
- [85-friday-wip-ar-live-board.md](85-friday-wip-ar-live-board.md): Living Friday work-in-progress and receivables board rebuilt nightly from the job, supplier, and ledger mirrors.
- [102-wip-ar-expense-realized-and-population.md](102-wip-ar-expense-realized-and-population.md): Why expense realized on the Friday board was wrong, and what population the board now covers.
- [103-ytd-accrual-gm-budget-colour-variants-categorization.md](103-ytd-accrual-gm-budget-colour-variants-categorization.md): Year-to-date accrual, gross-margin expense outstanding, colour variants, and the categorization work surface.
- [analytics/](analytics): Dated analytics packs for the Friday receivables and work-in-progress meeting and for the CPA audience.

## Property spine, CRM, and job documents

- [110-cc-crm-boundary-and-live-branch.md](110-cc-crm-boundary-and-live-branch.md): Decision to put the Command Center and CRM boundary back on main while keeping the sales mirror.
- [111-crm-pwa-companion-repo.md](111-crm-pwa-companion-repo.md): Where the CRM sister repository keeps its code and its half of the Command Center contract.
- [113-property-spine.md](113-property-spine.md): Approved schema that ties one property identifier to parcel, storm, job, invoice, and owner layers.
- [114-dfw-commercial-property-list.md](114-dfw-commercial-property-list.md): Analysis, geographic-id fitness check, and production load of the Dallas-Fort Worth commercial property list.
- [115-properties-grant-lockdown.md](115-properties-grant-lockdown.md): Lockdown that removes anonymous and authenticated table privileges from the public properties table.
- [116-acculynx-enrichment-round-trip.md](116-acculynx-enrichment-round-trip.md): Round trip that loads enriched AccuLynx addresses, links them, geocodes the remainder, and opens a review queue.
- [117-matviews-service-role-only.md](117-matviews-service-role-only.md): Restricts materialised views in the public schema so only the service role can read them.
- [117-property-review-screen.md](117-property-review-screen.md): Screen for recording a human decision on the queue that links a job to a property.
- [118-crm-pecrm-job-numbers-never-join-acculynx.md](118-crm-pecrm-job-numbers-never-join-acculynx.md): Rule that CRM job numbers marked PECRM never join an AccuLynx job.
- [118-rollback-pre-316.sql](118-rollback-pre-316.sql): Rollback script that restores the pre-316 view and function definitions. Kept outside the schema runner so it is not applied as a migration.
- [119-order-po-dash-free-job-key.md](119-order-po-dash-free-job-key.md): Gives a dashed ABC order purchase order a dash-free key when matching an AccuLynx job.
- [120-companycam-integration.md](120-companycam-integration.md): CompanyCam photo mirror for Command Center, CRM, and Scheduler, storing metadata and private copies.
- [121-acculynx-job-documents.md](121-acculynx-job-documents.md): Stored copies of AccuLynx job documents, linked to the job and then to the property.
- [124-crm-job-journey-gates.md](124-crm-job-journey-gates.md): Version-one gate list for the CRM job journey, including where it lives and the pending lien-waiver wording.
- [126-pensacola-office-and-euless-final-archive.md](126-pensacola-office-and-euless-final-archive.md): Record of the Pensacola Florida office, the SRS SRPEN book, and the Euless final archive.

## Runtime, sync, design, and site quality

- [40-dashboard-design-system.md](40-dashboard-design-system.md): Canonical look and feel for Command Center audit dashboards, first approved on the estimate audit page.
- [41-site-action-audit.md](41-site-action-audit.md): Findings report from an audit of every interactive trigger on every built Command Center page.
- [62-app-versioning.md](62-app-versioning.md): Human-facing Command Center release label shown under the runtime pill in the top bar.
- [84-gui-surface-audit.md](84-gui-surface-audit.md): Audit of every displayed pill, table, and link to see whether it is wired to live data.
- [90-site-audit-2026-08-18.md](90-site-audit-2026-08-18.md): Full work-surface audit of page routes, API routes, and client scripts on the Command Center.
- [91-removed-surfaces-2026-08-19.md](91-removed-surfaces-2026-08-19.md): Record of orphaned and dead pages removed on 19 August 2026, with how to revive each from git history.
- [92-daily-site-quality-sweep.md](92-daily-site-quality-sweep.md): Unattended morning sweep that reruns the site-audit checks so the next regression is caught by a machine.
- [109-runtime-uptime-dashboard-decision-log.md](109-runtime-uptime-dashboard-decision-log.md): Decision log for turning the agents page into a realtime uptime board with Better Stack telemetry.
- [112-design-system-site.md](112-design-system-site.md): The living design-system site inside the Command Center, with tokens parsed from the production stylesheet.
- [122-db-load-stale-containers-and-pollers.md](122-db-load-stale-containers-and-pollers.md): Diagnosis of production database load from stale Command Center containers and full-table pollers.
- [125-top-of-hour-db-load-2026-10-08.md](125-top-of-hour-db-load-2026-10-08.md): Diagnosis of the top-of-hour database load that starved the CRM, and the migration applied afterward.
- [127-self-healing-loop.md](127-self-healing-loop.md): Active standard for a self-healing loop on every surface and repo, shipping disabled until enabled per surface.
- [129-sync-verification-gaps.md](129-sync-verification-gaps.md): Notes on sync verification and delivery continuity from provider events through a human merge approval.
- [dashboard-plans/](dashboard-plans): Discussion draft that turns the weekly accounting snapshot into a dashboard aimed at a human decision.
- [delivery/](delivery): PEC-755 notes on which business providers feed the shared backend, plus verification and rollback files for that repair.

## Roofing-ops Slack

- [roofing-ops-channel-validation-results.md](roofing-ops-channel-validation-results.md): Live Slack validation that the named roofing operations agents are installed and joined to the approved channels.
- [roofing-ops-human-validation-request.md](roofing-ops-human-validation-request.md): Request for a human to run live Slack checks of two-way replies, procedure boundaries, and direct messages.
- [roofing-ops-runtime-status.md](roofing-ops-runtime-status.md): Status snapshot of the roofing operations agent runtime, homes, and Slack install on the agent host.
- [roofing-ops-slack-agent-routing.md](roofing-ops-slack-agent-routing.md): Routing rules for the named roofing operations Slack agents and for overlap handled by the conductor.

## Knowledge base, handoffs, and reference

- [knowledge-base/](knowledge-base): Markdown bundles for researched frameworks, runbooks, and the agent tooling matrix used as reusable context.
- [handoffs/](handoffs): Session close-out notes for agent desktops, Maya onboarding, and the current CRM and Command Center handoff.
- [reference/](reference): Persona guides, an AccuLynx API blocker draft, a memory-system diagram, and a DNS zone for the agent mail host.
