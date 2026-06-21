# Handoff — Open-invoice API-price gap fill · Observability (Sentry + CodeRabbit) live · skill updates

**Date:** 2026-06-20 (evening) · **Branch:** `contrib/cleverwork/observability-sentry`.
✅ **ALIGNED + DEPLOYED: dev (local) = `origin/main` = `72c70dd`, 0/0.** Coolify auto-built `origin/main` → `cc.proexteriorsus.net`; verified live (`/healthz` buildCommit = `72c70dd`). **Sentry is live and verified end-to-end** (error → Sentry → Slack `#cc-proexteriors`).
**Full log:** `context/memory/2026-06-20.md` (later sessions). **Prior handoff:** `docs/handoffs/archive/2026-06-20-gpa-buildout.md` (its open items still stand — carried forward below).

This session did three things: (1) filled open-invoice API-price gaps, (2) stood up **error monitoring** for the Monday alpha, (3) corrected/added skills from what we learned.

## ✅ What shipped (live on prod + `origin/main`)

1. **Open-invoice API-price gap fill** (mig **142** + `integrations/bridges/abc-supply/fill-open-invoice-api-prices.mjs`, commit `a0ab2f3`). 172 open invoices → 418 distinct (item,branch) price points; **110 missing**. Fetched all 110 live from ABC: **69 priced + written** (clean UOM), **41 genuinely un-priceable** (ABC `"Cannot price item … Call for pricing."` — `NS*` special-order metal + CSI items — and transactional charges: DELIVERY/FUEL/JURDEL/Freight/PROMOCREDIT). Root cause of the 69: they lived only in raw `abc_product_catalog`, never promoted to curated `products`. **mig 142 promoted the 68 ABC-priceable items** (supplier→manufacturer alias map, taxonomy via ABC hierarchy, `internal_sku=M{legacy}-{sku}`, base_uom=stocking; fallback `MISCELLANEOUS VENDOR`). Open-invoice priced lines **990 → 1080**.

2. **Observability — Sentry + CodeRabbit** (commits `9382632`, `72c70dd`). **Live + verified.**
   - **Sentry**: `@sentry/astro` (web SSR) + `@sentry/node` (Slack runtime via `node --import`; nightly ABC sync staged/guarded). Full tracing, **masked Session Replay**, `setUser(id+email)`, PII scrubbed (`sendDefaultPii:false` + beforeSend). **Literal-DSN fallback** (a DSN is public) → errors+replay need no build-arg. **Source maps upload** (Coolify `SENTRY_AUTH_TOKEN` set `is_buildtime:true`; build creates a release). **Slack alert rule `17213565`** → `#cc-proexteriors` (new + regressed). Verified: deploy live, client SDK in served bundle, test error → Sentry → Slack with Resolve/Archive buttons.
   - **CodeRabbit**: kept advisory; added path_instructions flagging swallowed errors / missing Sentry capture / PII in error reports.

3. **Skill updates** (this turn — UNCOMMITTED until the wrap-up commit):
   - `coolify`: fixed creds location (root `.env` **commented** `# COOLIFY_*`, NOT `.env.agent-passwords`) + documented build-time env vars (`PATCH is_buildtime:true`).
   - **NEW `sentry` skill** (`.claude/skills/sentry/`): org/project/DSN, the two-token gotcha (`sntrys_`=source-maps only vs `SENTRY_PERSONAL_TOKEN`=full scopes for alerts/issues), architecture, alert-rule API, verify recipe.
   - `product-catalog-manager`: added the raw→curated promotion procedure.

## ▶ WHERE WE LEFT OFF (open, this session)

- **Rotate the `sntrys_` Sentry build token** — it was pasted in chat (transcript exposure). After rotating, update `SENTRY_AUTH_TOKEN` in Coolify (build var; see `coolify` skill).
- **Sentry → Slack app membership**: the alert posted in testing, but ensure the Sentry app stays a member of `#cc-proexteriors` so real alerts post.
- **Activate nightly-sync Sentry** on the Hetzner agent host: `npm i @sentry/node` (the `--import` in `scripts/abc-nightly-sync.sh` is guarded and dormant until then).
- **41 "call for pricing" items**: need an ABC quote conversation if they should ever be audited (no API price by design).
- **Fix loop is human-in-the-loop**: a Sentry alert → Chris picks which to fix → agent opens PR → CodeRabbit reviews → merge → Coolify deploys.

## ▶ Carried forward from the GPA handoff (still open — see archive)
Image chip visual-verify · Denver/Dallas promotion in `/accounting/price-agreement/review` · price crons (monthly-15th + 30-day on agent host, next cycle `2026-07`) · Accounting Slack for >6% criticals (`slack_queued`) · ABC account-expansion for ~546 unpriceable branches.

## Key files / refs
- `integrations/bridges/abc-supply/fill-open-invoice-api-prices.mjs` · `schemas/cleverwork-roofer/142-promote-open-invoice-catalog-products.sql`
- `app/command-center/`: `astro.config.mjs`, `sentry.{client,server}.config.ts`, `runtime/sentry-instrument.mjs`, `src/middleware.ts`, `Dockerfile`
- Skills: `.claude/skills/{sentry,coolify}/SKILL.md` · `skills/cleverwork-roofer/product-catalog-manager/SKILL.md` · `.coderabbit.yaml`
- Coolify app uuid `og0rmt02rff8qti9nlfk3nr7` · Sentry org `cleverwork` / project `cc-proexteriorsus`.
