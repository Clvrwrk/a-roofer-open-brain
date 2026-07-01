---
type: Overview
title: AccuLynx Integration Overview
description: Why the AccuLynx brain exists, what it covers, and when it runs.
tags: [acculynx, integration, overview, pm-system]
timestamp: 2026-06-30T00:00:00Z
---

AccuLynx is the **primary project-management system of record** for Pro Exteriors.
The brain mirrors AccuLynx so agents can read job, lead, contact, financial, and
insurance context, and (later) act on it within human-approved guardrails.

# Why (core value)

Complete, hourly-current, trustworthy AccuLynx data for **every** Pro Exteriors
location — actionable by an agent within human-approved guardrails. If everything
else fails, the data must be complete across all accounts and never stale by more
than an hour.

# What (data surface)

AccuLynx exposes leads/jobs, milestones, contacts, estimates, financials, invoices,
supplements, insurance, payments, and representatives. Today the brain ingests
**jobs + users**; contacts, estimates, invoices, financials, insurance, and
milestone history are scoped for [multi-location ingestion](/index.md) (Phase 2).
See [Jobs & Pipeline](data/jobs.md) and [Brain Tables](data/tables.md).

# How (ingestion + write-action)

**Read side (ingestion):** A pull-based [sync pipeline](ingestion/sync-pipeline.md)
— `pg_cron → pg_net → acculynx-sync` Edge Function — does incremental,
watermark-based syncs and lands data in `acculynx_jobs` + `crm_pipeline`. A
separate sandbox-only [read-capability sweep](ingestion/read-sweep.md) maps the
full API surface.

**Write side (the action layer):** Writes are never fired directly. A sandbox-only
[write-sweep](ingestion/write-sweep.md) red-teamed every documented write endpoint
(Phase 4) to prove real behavior before anything touches production. The proven-safe
lanes are exposed through the [write-action layer](ingestion/write-action.md)
(Phase 5) — a human-approval-gated loop: an agent *enqueues* a proposed write, a
human *previews and approves* it on the Command Center work-queue, only then does
the `acculynx-write-action` Edge Function *execute* it and record an audit row. If
ingestion or a write needs recovery, see the [runbook](ingestion/runbook.md).

# Where (in the brain)

Supabase project `rnhmvcpsvtqjlffpsayu`. The canonical job table is
[`acculynx_jobs`](data/jobs.md); the normalized consumer is `crm_pipeline`; the
[account registry](accounts.md) is `acculynx_accounts`. Full list:
[Brain Tables](data/tables.md).

# When (schedule & freshness)

Today: daily `pg_cron` at 08:15 UTC (jobs + users). Target: **hourly** for all
accounts and resources (Phase 3 cron hardening). Incremental syncs advance a
per-resource watermark; see the [sync pipeline](ingestion/sync-pipeline.md).

# Who (accounts & owners)

AccuLynx is **per-account**: each Pro Exteriors location/program is a separate
AccuLynx account with its own API key. The brain tracks all 9 (8 production + 1
sandbox) in the [account registry](accounts.md).

# Citations

[1] [AccuLynx API V2 docs](https://apidocs.acculynx.com/)
[2] [Read-capability matrix](../../65-acculynx-read-capability-matrix.md)
[3] [Write-capability matrix](../../37-acculynx-write-capability-matrix.md)
[4] [acculynx-api skill](../../../skills/cleverwork-roofer/acculynx-api/SKILL.md)
