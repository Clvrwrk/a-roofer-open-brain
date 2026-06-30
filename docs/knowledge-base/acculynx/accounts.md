---
type: Account Registry
title: AccuLynx Account Registry
description: The 9 AccuLynx accounts (8 production locations/programs + sandbox) and their secret names.
resource: https://supabase.com/dashboard/project/rnhmvcpsvtqjlffpsayu/editor
tags: [acculynx, accounts, registry, secrets, multi-location]
timestamp: 2026-06-30T00:00:00Z
---

AccuLynx is a **per-account** API. Each Pro Exteriors location/program is a separate
AccuLynx account with its own API key and its own 10 req/s rate limit. The registry
table `public.acculynx_accounts` (migration 165) maps each account to the **NAME** of
the Supabase Edge secret holding its key — **never the value** (hard rule 2).

# Schema

`public.acculynx_accounts` — `account_key` (slug), `env_secret_name` (secret NAME),
`label`, `program`, `state`, `environment` (`production`|`sandbox`), `is_active`,
`acculynx_company_id` (bound after a probe), `notes`.

# The 9 accounts

| account_key | env_secret_name | label | state | environment |
|---|---|---|---|---|
| `florida` | `PE_CC_FLORIDA_ACCULYNX_API_KEY` | Florida | FL | production |
| `colorado` | `PE_CC_COLORADO_ACCULYNX_API_KEY` | Colorado | CO | production |
| `georgia` | `PE_CC_GEORGIA_ACCULYNX_API_KEY` | Georgia | GA | production |
| `kansas_city` | `PE_CC_KANSAS_CITY_ACCULYNX_API_KEY` | Kansas City | KS | production |
| `texas` | `PE_CC_TEXAS_ACCULYNX_API_KEY` | Texas | TX | production |
| `wichita` | `PE_CC_WICHITA_ACCULYNX_API_KEY` | Wichita | KS | production |
| `insurance_program` | `PE_CC_INSURANCE_PROGRAM_ACCULYNX_API_KEY` | Insurance Program | — | production |
| `multi_family_commercial` | `PE_CC_MULTI_FAMILY_COMMERCIAL_ACCULYNX_API_KEY` | Multi-Family / Commercial | — | production |
| `sandbox` | `PE_CC_SANDBOX_ACCULYNX_API_KEY` | Sandbox | — | sandbox |

> The `multi_family_commercial` secret name uses underscores (the AccuLynx UI label
> has a hyphen); Supabase secret names must be `[A-Z0-9_]`.

# Current coverage (2026-06-30)

The live [sync pipeline](ingestion/sync-pipeline.md) uses a **single** key —
`acculynx_jobs` is ~99% Kansas (1,273 / 1,284 rows). The other 7 production accounts
are **not yet synced**; multi-location fan-out (reading this registry) is Phase 2.

# Secrets handling

- Keys live as **Supabase Edge Function secrets**, resolved at runtime via
  `Deno.env.get(env_secret_name)`. The DB stores only the NAME.
- The repo documents the 9 names as `__set_me__` placeholders in `config/.env.example`.
- Rotation: `supabase secrets set <NAME>=<new>` — no code/DB change, no redeploy.
- Phase 1 testing used **only** the `sandbox` key, enforced in code (see
  [read-sweep](ingestion/read-sweep.md)).

# Citations

[1] migration `schemas/cleverwork-roofer/165-acculynx-accounts-registry.sql`
[2] [Sync Pipeline](ingestion/sync-pipeline.md)
