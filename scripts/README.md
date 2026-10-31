# Scripts

Catalog of every file and folder directly inside `scripts/`. Purposes come from each file's header comment, usage text, or code. Nested files are not listed on their own; they are covered by the parent folder entry. Run lines appear only where the source states them.

## Shell

- [abc-nightly-sync.sh](abc-nightly-sync.sh) — ABC Supply sync runner for the nightly cycle-counting catalog refresh, or a full accounts, branches, and catalog sweep when `full` is passed. Run: `bash scripts/abc-nightly-sync.sh` or `bash scripts/abc-nightly-sync.sh full`.
- [agent-tick.sh](agent-tick.sh) — Headless Hermes cron tick for one agent profile on the agent host. Run: `bash scripts/agent-tick.sh <email-prefix>`.
- [betterstack-provision.sh](betterstack-provision.sh) — Idempotently provisions Better Stack uptime monitors and heartbeats for the Command Center runtime board and stores heartbeat rows. Run: `bash scripts/betterstack-provision.sh` or `bash scripts/betterstack-provision.sh --dry-run`.
- [check-harness-alignment.sh](check-harness-alignment.sh) — Verifies every harness instruction file carries the session wrap-up contract and blocks when a marker is missing. Run: `bash scripts/check-harness-alignment.sh`.
- [companycam-sync.sh](companycam-sync.sh) — Read-only CompanyCam mirror runner for a nightly incremental sync, a weekly full sweep, or the photo copy queue. Run: `bash scripts/companycam-sync.sh nightly`, `full`, or `copy`.
- [coolify-redeploy.sh](coolify-redeploy.sh) — Triggers a tightly scoped Coolify redeploy of the Command Center, or prints one deployment status and live health. Run with no arguments, or `status <uuid>`.
- [cp-thursday-sync.sh](cp-thursday-sync.sh) — Thursday read-only CenterPoint to Supabase mirror refresh. Run: `bash scripts/cp-thursday-sync.sh`.
- [install-sync-health-relay.sh](install-sync-health-relay.sh) — Installs the sync-health relay on the approved agent host after human merge approval, using an isolated Node runtime.
- [jt-sync-sentinel.sh](jt-sync-sentinel.sh) — Retired stub that prints JobTread is retired and exits without performing a sync or provider calls.
- [kaizen-review.sh](kaizen-review.sh) — Assembles the monthly Maintenance Kaizen Review packet from the observations log and the playbook evolution template.
- [lint-design.sh](lint-design.sh) — Validates a DESIGN.md file against the vendored DESIGN.md format spec and returns the linter exit code. Run: `scripts/lint-design.sh` or `scripts/lint-design.sh path/to/DESIGN.md`.
- [maya-gate.sh](maya-gate.sh) — Exits immediately with a retirement message and performs no work; later comments describe the former Maya gate runner.
- [maya-qa.sh](maya-qa.sh) — Exits immediately with a retirement message and performs no work; later comments describe the former nightly QA runner.
- [memsearch-index-open-brain.sh](memsearch-index-open-brain.sh) — Indexes the context tree and any local MemSearch memory summaries into the open_brain_memory collection when memsearch is installed.
- [memsearch-nightly-cron.sh](memsearch-nightly-cron.sh) — Nightly cron wrapper that rebuilds the MemSearch index from a fixed checkout and appends a timestamped log outside the repo.
- [new-client.sh](new-client.sh) — Provisions an isolated roofer brain from this template using the roofer config and env file, idempotent where possible. Pass `--dry-run` to print the plan only.
- [orgo-ship-maya-listener.sh](orgo-ship-maya-listener.sh) — Exits immediately with a retirement message and performs no work; later comments describe shipping the Maya Slack listener release.
- [provision-agent-env.sh](provision-agent-env.sh) — Fills empty agent Hermes env values on the agent host from the local project env and never prints those values. Run: `bash scripts/provision-agent-env.sh` (dry-run) or with `--apply`.
- [provision-dev-agent-env.sh](provision-dev-agent-env.sh) — Provisions DevTeam Hermes profiles on the agent host and writes no brain service credential. Run: `bash scripts/provision-dev-agent-env.sh` (dry-run) or with `--apply`.
- [qbo-thursday-sync.sh](qbo-thursday-sync.sh) — Thursday read-only QuickBooks Online to Supabase mirror refresh. Run: `bash scripts/qbo-thursday-sync.sh`.
- [runtime-job-report.sh](runtime-job-report.sh) — Reports a systemd oneshot result into the runtime board and always exits zero so reporting cannot fail the unit. Run: `scripts/runtime-job-report.sh <component_key>`.
- [setup-githooks.sh](setup-githooks.sh) — Points this repo at the tracked hooks in `.githooks` so the pre-commit hook can bump the app version.
- [site-sweep.sh](site-sweep.sh) — Sources repo env files and runs the daily site quality sweep, appending output to a log outside the repo.
- [uptime-check.sh](uptime-check.sh) — DevTeam uptime monitor that stays silent when healthy and prints a DOWN line when a checked URL fails or is slow.
- [verify-deployment.sh](verify-deployment.sh) — End-to-end deployment smoke test and go-live gate that exits non-zero when any critical check fails and is safe to repeat.
- [wip-pack-thursday.sh](wip-pack-thursday.sh) — Thursday AR/WIP pack build that refreshes the board, writes the Excel pack, and uploads it to private storage. Run: `bash scripts/wip-pack-thursday.sh` or with an as-of date.

## Node

- [alex-no-price-triage.mjs](alex-no-price-triage.mjs) — Nightly pass that refreshes the agreement gap queue for repeat-purchase no-price items and stamps other pending lines. Invoked from `scripts/abc-nightly-sync.sh` after invoice ingest.
- [build-acculynx-handoff.mjs](build-acculynx-handoff.mjs) — Builds the structured AccuLynx fallback packet and a Slack draft for one estimate run, with no network calls. Run: `node scripts/build-acculynx-handoff.mjs --input bundle.json`.
- [build-estimate-scenarios.mjs](build-estimate-scenarios.mjs) — Turns measurements, package templates, and mirrored prices into Good/Better/Best scenario options with quantity and margin checks. Run: `node scripts/build-estimate-scenarios.mjs --inputs /tmp/engine_inputs.json`.
- [build-inv-processed-weekly.mjs](build-inv-processed-weekly.mjs) — Writes one Tuesday QuickBooks CSV per vendor for approved-to-pay invoices, and stamps exports only when `--stamp` is passed. Run: `node scripts/build-inv-processed-weekly.mjs`.
- [build-order-schedule-drafts.mjs](build-order-schedule-drafts.mjs) — Builds a draft material order and a draft labor schedule recommendation for one selected estimate option. Run: `node scripts/build-order-schedule-drafts.mjs --input bundle.json`.
- [bump-app-version.mjs](bump-app-version.mjs) — Bumps the Command Center version constants in `app/command-center/src/lib/version.ts`. Run: `node scripts/bump-app-version.mjs auto` or `patch`, `minor`, `beta`, or `ga`.
- [chaos-forensic-assign.mjs](chaos-forensic-assign.mjs) — Picks one built Command Center route per day for a deep forensic pass, skipping routes already used in the current cycle. Run: `node scripts/chaos-forensic-assign.mjs`.
- [compute-office-drive-time-boundary.mjs](compute-office-drive-time-boundary.mjs) — Computes a driving-time isochrone for one office and stores the boundary on `public.office`. Run: `node scripts/compute-office-drive-time-boundary.mjs --office-id=<uuid>`.
- [design-system-swag.mjs](design-system-swag.mjs) — Renders design-system swag reference images from the official logo and writes them under the Command Center public swag directory. Run: `node scripts/design-system-swag.mjs`.
- [dolt-lab-preflight.mjs](dolt-lab-preflight.mjs) — Non-destructive check of local Dolt readiness that warns when the selected path is not a Dolt repo. Run: `node scripts/dolt-lab-preflight.mjs [options]`.
- [evaluate-abc-branches.mjs](evaluate-abc-branches.mjs) — Ranks ABC branches for a property address from exported branch JSON and writes an evaluations payload. Run: `node scripts/evaluate-abc-branches.mjs --address "<address>" --branches <file.json>`.
- [extract-roofr-measurements.mjs](extract-roofr-measurements.mjs) — Parses a Roofr measurement CSV and optional PDF into the normalized measurement field set and prints JSON. Run: `node scripts/extract-roofr-measurements.mjs <file.csv> [file.pdf]`.
- [gen-read-capability-matrix.mjs](gen-read-capability-matrix.mjs) — Regenerates the AccuLynx read capability matrix document from the latest sandbox sweep batch and writes no secrets into that doc.
- [geocode-vendor-branches.mjs](geocode-vendor-branches.mjs) — Geocodes vendor branches that have no coordinates and can rerun office territory containment for those branches. Run: `node scripts/geocode-vendor-branches.mjs`.
- [ghost-lab-preflight.mjs](ghost-lab-preflight.mjs) — Non-destructive Ghost lab preflight that checks the named database and never connects, deletes, or forks. Run: `node scripts/ghost-lab-preflight.mjs [options]`.
- [join-roofing-agents-to-slack-channels.mjs](join-roofing-agents-to-slack-channels.mjs) — Joins roofing-ops agent Slack apps to the human operational accounting channels, with a dry-run mode that only prints the plan.
- [maintenance-frontdesk.mjs](maintenance-frontdesk.mjs) — Inventories and classifies workspace contents and moves files only when `--apply` is used with a reviewed manifest. Run: `node scripts/maintenance-frontdesk.mjs [options]`.
- [maya-gate.mjs](maya-gate.mjs) — Exits immediately with a retirement message and performs no work; later comments describe the former diagnose and approval gate.
- [maya-qa-orchestrate.mjs](maya-qa-orchestrate.mjs) — Exits immediately with a retirement message and performs no work; later comments describe the former nightly QA orchestration.
- [open-engine-preflight.mjs](open-engine-preflight.mjs) — Verifies dev-engine runtime skill files and plane boundaries and exits non-zero when a check fails. Run: `node scripts/open-engine-preflight.mjs`.
- [open-engine-queue-runner.mjs](open-engine-queue-runner.mjs) — One-task Linear heartbeat for the dev engine agent that creates or fetches issues through the Linear API. Run: `node scripts/open-engine-queue-runner.mjs` or with `--dry-run`.
- [orgo-forensic-page.mjs](orgo-forensic-page.mjs) — Deeply exercises one production page's view controls and aborts non-GET requests so writes cannot land. Run: `node scripts/orgo-forensic-page.mjs --route <path>` or with no route to ask the scheduler.
- [orgo-site-walker.mjs](orgo-site-walker.mjs) — Walks the Command Center in a real browser profile and records speed, errors, click-through, and surface-level header findings. Run: `node scripts/orgo-site-walker.mjs`.
- [qa-agent-auth.mjs](qa-agent-auth.mjs) — Provisions and signs in the site QA walker with WorkOS magic auth so the one-time code is read from an API mailbox. Run: `node scripts/qa-agent-auth.mjs status`, `provision`, or `login`.
- [seed-sandbox-from-wichita.mjs](seed-sandbox-from-wichita.mjs) — Seeds the AccuLynx sandbox with anonymized job and contact copies and refuses to run against any other API credential. Run: `LIMIT=1 node scripts/seed-sandbox-from-wichita.mjs`.
- [seed-sandbox-messy.mjs](seed-sandbox-messy.mjs) — Seeds the AccuLynx sandbox with messy human-like leads, including a few malformed records, and refuses any non-sandbox credential. Run: `LIMIT=50 OFFSET=51 node scripts/seed-sandbox-messy.mjs`.
- [seed_jurisdictions.ts](seed_jurisdictions.ts) — Deno script that upserts jurisdictions and an initial regulatory snapshot from the roofer config into the brain. Run: `deno run --allow-net --allow-env scripts/seed_jurisdictions.ts config/roofer.config.yaml`.
- [seo-dataforseo-lighthouse.mjs](seo-dataforseo-lighthouse.mjs) — Runs a DataForSEO Lighthouse live audit for the critical pages in the SEO maintenance config and writes a JSON report.
- [seo-gsc-url-inspect.mjs](seo-gsc-url-inspect.mjs) — Read-only Google Search Console URL inspection for the configured critical pages, writing a JSON report under `reports/seo-maintenance`.
- [site-quality-sweep.mjs](site-quality-sweep.mjs) — Daily unattended site quality sweep over the repo link graph, live API routes, and read-only money checks. Run: `node scripts/site-quality-sweep.mjs` or with `--static`.
- [supabase-preflight.mjs](supabase-preflight.mjs) — Non-destructive local guardrail check before Supabase schema or infrastructure changes; production targets require backup proof. Run: `node scripts/supabase-preflight.mjs [options]`.
- [sync-health-component.mjs](sync-health-component.mjs) — Rewrites a sync incident route tag so different integration components stay separate inside the shared triage engine.
- [sync-health-fallback.mjs](sync-health-fallback.mjs) — Opens or closes one fixed GitHub issue when the scheduled sync-health runner cannot verify alert delivery.
- [sync-health-relay.mjs](sync-health-relay.mjs) — Minute relay on the approved agent host that posts to the Command Center sync-health endpoint and fails when the payload is unhealthy.
- [sync-health-triage.mjs](sync-health-triage.mjs) — Runs the vendored Sentry-to-Linear triage engine scoped to integration sync-health events, dry-run unless `--apply` is passed.
- [sync-health-watch.mjs](sync-health-watch.mjs) — Independent runner that posts to the Command Center sync-health endpoint and records a delivery incident when the monitor is unavailable.
- [test-self-heal-cache-risk.mjs](test-self-heal-cache-risk.mjs) — Node test that Astro remote image caching does not follow the unresolved max-stale hit path or return private cookies.
- [test-self-heal-heartbeat-age.mjs](test-self-heal-heartbeat-age.mjs) — Node test that a missing heartbeat timestamp is stale and that present timestamps keep ordinary age comparisons.
- [test-self-heal-routing.mjs](test-self-heal-routing.mjs) — Node tests for self-heal repository ownership, autofix queue selection, patch policy, and Sentry-to-Linear triage routing.
- [upload-agreement-pdf.mjs](upload-agreement-pdf.mjs) — Uploads a price-agreement source PDF into the agreements bucket and can bind it to the agreement it evidences. Run: `node scripts/upload-agreement-pdf.mjs <file.pdf>`.
- [validate-okf.mjs](validate-okf.mjs) — Walks an OKF knowledge bundle and fails when markdown is missing frontmatter, index files, or secret-like text. Default root is `docs/knowledge-base/the-roofers-open-brain`.
- [verify-roofing-agent-slack-routing.mjs](verify-roofing-agent-slack-routing.mjs) — Checks roofing-ops Slack app membership against the human accounting channels and the restricted internal channels. Supports `--dry-run` and `--offline`.
- [verify-roofing-agent-souls.mjs](verify-roofing-agent-souls.mjs) — Checks each roofing agent profile has a soul file that includes the profile display name and the required section headings.

## Python

- [build-chandler-wip-v1.py](build-chandler-wip-v1.py) — Pulls AccuLynx jobs from the pipeline mirror and a read-only QuickBooks cash snapshot, then writes the Chandler WIP workbook.
- [build-cpa-bank-decision-pack.py](build-cpa-bank-decision-pack.py) — Builds the pre-CPA bank decision workbook from the QuickBooks mirror and the latest AccuLynx WIP pack, read-only on QuickBooks.
- [build-internal-estimate.py](build-internal-estimate.py) — Renders the internal ops-review estimate PDF with line items, margin analysis, and an observed labor comparison. Run: `python3 scripts/build-internal-estimate.py --input bundle.json --out estimate.pdf`.
- [build-onboarding-pdf.py](build-onboarding-pdf.py) — Renders the onboarding worksheet from `onboarding/intake-schema.yaml` as a blank PDF, a prefilled PDF, and markdown. Run: `python3 scripts/build-onboarding-pdf.py`.
- [build-proposal-pdf.py](build-proposal-pdf.py) — Generates a watermarked Good/Better/Best client proposal draft PDF with scope totals and signature blocks, without internal costs. Run: `python3 scripts/build-proposal-pdf.py --input run.json --out proposal.pdf`.
- [deploy-agent.py](deploy-agent.py) — Fully automated deployment of one Open Brain agent profile. Run: `python deploy-agent.py <agent-id>`.
- [deploy-crons.py](deploy-crons.py) — Deploys roofing agent cron jobs into Hermes profiles on the agent host by writing definitions through the in-container cron API.
- [deploy-dev-crons.py](deploy-dev-crons.py) — Deploys DevTeam cron jobs to Hermes profiles on the agent host and includes no roofing brain workflows.
- [export-acculynx-property-addresses.py](export-acculynx-property-addresses.py) — Read-only export of every AccuLynx job location as one property row plus a job crosswalk sheet. Run: `python3 scripts/export-acculynx-property-addresses.py [--out path.xlsx]`.
- [export-property-review.py](export-property-review.py) — Read-only export of the AccuLynx job-to-property review queue into a multi-sheet workbook. Run: `python3 scripts/export-property-review.py [--out path.xlsx]`.
- [geocode-properties.py](geocode-properties.py) — Geocodes properties and unlinked AccuLynx review jobs, stores each answer, and applies those results to properties and the review queue. Run: `python3 scripts/geocode-properties.py [--properties] [--review-jobs] [--limit N] [--dry-run]`.
- [load-county-ref.py](load-county-ref.py) — Loads the Census county FIPS list into `public.county_ref` with an idempotent upsert. Run: `python3 scripts/load-county-ref.py path/to/national_county2020.txt`.
- [stage-property-list.py](stage-property-list.py) — Stages a property-list workbook into `property_list_import` as raw rows keyed by batch, file, and row number. Run: `python3 scripts/stage-property-list.py <import_batch> <file.xlsx>`.
- [update-cron-deliver-targets.py](update-cron-deliver-targets.py) — Rewrites agent cron deliver targets so output routes through the private agents-internal channel. Run: `python update-cron-deliver-targets.py <channel-id>`.
- [validate-agent.py](validate-agent.py) — End-to-end validation for one deployed Open Brain agent, posting a report when the run finishes. Run: `python validate-agent.py <agent-id>`.
- [write-cron-jobs.py](write-cron-jobs.py) — Writes Hermes `cron/jobs.json` into each agent profile; legacy bootstrap that must not be run for Maya while the listener owns that schedule.

## SQL

- [acculynx-read-sweep-reconcile.sql](acculynx-read-sweep-reconcile.sql) — Phase 1 read-sweep gate: three assertions over the latest sandbox sweep batch that must all return zero rows. Run via Supabase `execute_sql` or psql.
- [acculynx-reconcile-check.sql](acculynx-reconcile-check.sql) — Flags account and resource pairs whose brain row count differs more than five percent from the AccuLynx API count. Run: `psql $DATABASE_URL -f scripts/acculynx-reconcile-check.sql`.
- [acculynx-write-sweep-reconcile.sql](acculynx-write-sweep-reconcile.sql) — Phase 4 write-sweep gate: four assertions over the latest sandbox write-sweep batch that must all return zero rows. Run via Supabase `execute_sql` or psql.
- [register-sync-health-relay.sql](register-sync-health-relay.sql) — Inserts the sync-health relay runtime expectation row after human merge approval and does nothing when that row already exists.
- [retire-maya-sync-monitors.sql](retire-maya-sync-monitors.sql) — Marks the Maya gate and Maya QA runtime components retired without deleting jobs, events, heartbeats, or financial records.
- [seed-package-templates-2026-06-10.sql](seed-package-templates-2026-06-10.sql) — Idempotent data seed of captured estimate package templates one through four and their template lines, guarded by conflict checks.
- [verify-acculynx-cron.sql](verify-acculynx-cron.sql) — Re-runnable gate that the AccuLynx ingestion cron is hourly and that no dispatch is left unreconciled past the grace window. Run: `psql $DATABASE_URL -f scripts/verify-acculynx-cron.sql`.

## Folders

- [analytics/](analytics/) — Openpyxl five-surface pack builder, its Python requirements, and a unit test for PostgREST fetch retries. Same directory: [analytics](analytics).
- [fixtures/](fixtures/) — Synthetic self-heal acceptance fixture whose heartbeat helper is never imported by production application code. Same directory: [fixtures](fixtures).
- [invoice-audit-v2/](invoice-audit-v2/) — Invoice Audit v2 helpers that draft credit-memo packets, link vendor invoice PDFs, and hold the Wave A and Wave B SQL. Same directory: [invoice-audit-v2](invoice-audit-v2).
- [self-heal/](self-heal/) — Sentry to Linear autofix helpers: queue steps, patch policy, shared clients, triage, and production verify-and-close. Same directory: [self-heal](self-heal).
- [stormwatch/](stormwatch/) — Storm alert orchestration, connectivity runner, preflight checks, property-object sync, and sample event payloads. Same directory: [stormwatch](stormwatch).
- [tests/](tests/) — SQL and Node tests for AccuLynx dispatch, integration sync health, script path resolution, and the sync-health relay. Same directory: [tests](tests).
