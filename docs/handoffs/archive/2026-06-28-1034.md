# Project Handoff — A Roofer's Open Brain (Command Center)

**Project:** a-roofers-open-brain
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain (`origin`)
**Production URL:** https://cc.proexteriorsus.net (Coolify ← GitHub `main`; shared prod Supabase `rnhmvcpsvtqjlffpsayu`)
**Date:** 2026-06-26 10:55
**Agent:** Lead Orchestrator
**Reason:** End of session

> ⚠️ **StormWatch Pause Notice (still active).** StormWatch / property-layer *pipeline deployment* stays paused until Reonomy/ZoomInfo partnership terms are finalized and the property layer is E2E-validated. The StormWatch artifacts (docs/schemas/skills) are committed on `main` — that is not a deploy. Do not run the live `--push-ghl` pipeline against production until the pause lifts.

---

## TL;DR — where we left off

- `main == origin/main`, **working tree clean**, single worktree. Everything is pushed and deploying.
- **Track C (Invoice "To Be Paid") is fully DONE** — two-phase payment loop, per-vendor CSV export, readable Payments modal, reconciliation. Built, verified (tsc/build/7 tests/prod-DB/browser), migration applied to prod, live on the site.
- Tracks A (perf + agent fleet) and B (StormWatch/ZoomInfo) remain converged on `main` from earlier today.
- **4 branches remain open** with real unmerged work — closure plan below.

---

## Accomplished This Session

### Track C — Invoice "To Be Paid" → two-phase payment loop (built from in-flight, then hardened)
- `app/command-center/src/lib/invoice-audit.ts`: status-aware classification (`derivePaymentState`) — `exported`/`paid` leave the To-Be-Paid queue, `returned` re-opens; `awaitingPayment` rollups at invoice/branch/office/totals.
- `app/command-center/src/lib/invoice-payment.ts`: CSV + ledger helpers; **locked QuickBooks columns**; `buildVendorFileName` + `vendorSlug` + `invoiceVendor` (the seam to generalize vendors).
- `app/command-center/src/lib/invoice-payment-targets.ts`: batch/invoice target resolution for confirm/return.
- `app/command-center/src/pages/api/invoice-audit/process-batch.ts`: POST export — groups to-be-paid by vendor, **one CSV per vendor**, marks `exported` only (no paid flip).
- `app/command-center/src/pages/api/invoice-audit/batch/[batchId].csv.ts`: idempotent download; `?vendor=` filter for per-vendor files.
- `app/command-center/src/pages/api/invoice-audit/{confirm-paid,return-batch,reconcile,batches}.ts`: confirm→paid, return→re-eligible, ABC AR auto-reconcile + drift, batch list.
- `app/command-center/src/pages/accounting/invoice-audit.astro`: Process button (POST+confirm), Awaiting Payment KPI, Payments modal styles.
- `app/command-center/src/scripts/invoice-audit-tree.ts`: Process flow (confirm → POST → download each vendor file → reload), Awaiting Payment pill, **Payments modal attached inside `.iv` + self-styled** (the readability fix), per-vendor re-download links.
- `schemas/cleverwork-roofer/153-invoice-payment-processed-ledger.sql`: status lifecycle ledger + `v_invoice_payment_reconciliation` view. **Applied to prod** (additive/idempotent).
- `app/command-center/src/lib/invoice-audit.unit.test.ts`: 7 tests (two-phase, locked CSV header, file-name convention).

### Commits (this session, on `main`)
- `a0a0d99` / merge `7f193cb` — `feat`: two-phase To-Be-Paid payment loop + reconciliation.
- `5cd485b` — `docs(handoff)`: Track C built/deployed.
- `61f4bb3` — `fix`: readable Payments modal + per-vendor CSV files + `[vendor]-invoices-to-be-paid-[timestamp]` naming. **(latest)**

## Git State
- **Branch:** `main`
- **Last commit:** `61f4bb3` — "fix(invoice-audit): readable Payments modal + per-vendor CSV files + naming"
- **Uncommitted changes:** none — tree clean.
- **Worktrees:** one (`/Users/chussey/Documents/a-roofers-open-brain` → `main`).

## Task Cut Off
None — session ended at a clean boundary. Everything committed, pushed, verified, and deploying.

---

## Next Task — Start Here

**Task:** Apply pending StormWatch migrations (147–152) to prod, then resolve the 4 open branches. Track C is complete.

**What to check / do:**
1. **Apply additive StormWatch migrations to prod Supabase** if not already applied: `schemas/cleverwork-roofer/147–152`. All `IF NOT EXISTS`/idempotent. Confirm via `list_migrations`/`list_tables`. (153 already applied.)
2. **Close the 4 open branches** (table below) — decide merge-or-delete for each.
3. **Track C follow-ups (optional, low priority):** (a) wire `POST /api/invoice-audit/reconcile` to a nightly cron (currently on-demand via the Payments "Manage" panel); (b) the vendor token in file names is lowercase-hyphen (`abc-supply`) — change `vendorSlug()` if accounting wants different casing.

**If you need to confirm Track C is healthy:** from `app/command-center/` run `npx vitest run src/lib/invoice-audit.unit.test.ts` (7 pass) and `npm run build` (clean). The live Payments panel: Invoice Audit → "Manage".

**Prompt to use:** "Read docs/handoffs/current.md. Apply StormWatch migrations 147–152 to prod Supabase if missing, then walk the 4 open branches and tell me merge-or-delete for each."

---

## Open Branches — closure plan (the only branches left)

| Branch | Unique work | Recommended closure |
|---|---|---|
| `contrib/cleverwork/db-price-foundation-round4` | round4 price-foundation SQL: `schemas/cleverwork-roofer/price-foundation/round4/{001_phase1_sidecars,002_phase1_backfill_and_quarantine,003_phase1_validation_queries,900_ghost_smoke_fixture}.sql` + README + TRADEOFF_REGISTER + phase1 Supabase-branch run doc | **Decide & merge or archive.** Review 001–003 against current prod schema; if wanted, apply + merge. Large diff deletions are just staleness — only `price-foundation/round4/*` adds are real. |
| `contrib/cleverwork/db-price-foundation-round3` | Subset of round4 (its 2 commits are ancestors of round4) | **Delete** once round4 resolved — fully contained in round4. |
| `contrib/cleverwork/vendor-territory-map` | Only a `scripts/memsearch-index-open-brain.sh` tweak is unique; the map itself is live on `main` | **Cherry-pick the script tweak if wanted, else delete.** Superseded. |
| `contrib/cleverwork/coderabbit-config` (remote-only) | `.coderabbit.yaml` CI config (advisory-only) | **Adopt-or-drop.** Merge if adopting CodeRabbit; else `git push origin --delete contrib/cleverwork/coderabbit-config`. Note hard-rule #12 (third-party tool gate). |

```
git branch -d contrib/cleverwork/db-price-foundation-round3 && git push origin --delete contrib/cleverwork/db-price-foundation-round3
git branch -D contrib/cleverwork/vendor-territory-map      && git push origin --delete contrib/cleverwork/vendor-territory-map
```

## Decisions Made This Session
- **Export ≠ Paid (two-phase).** Process marks invoices `exported` (Awaiting Payment); `paid` only via human Confirm or ABC AR reconcile. confirm-paid mirrors `mark-paid.ts` (flips `invoice_documents`, not `abc_invoices.ar_status`) — ABC AR stays source of truth for actual payment.
- **One CSV per vendor.** Export groups by vendor; file name = `[vendor]-invoices-to-be-paid-[YYYY-MM-DD-HHMM].csv` (Denver time, lowercase-hyphen vendor slug). Single-vendor ABC batch = one file. `invoiceVendor()` is the one place to extend when a second vendor pipeline lands.
- **QuickBooks CSV columns LOCKED** to accounting's live import file — do not reorder/rename without re-confirming (unit-tested).
- **POST + confirm dialog** for Process (no GET-with-side-effects; prefetch-safe).
- **Modal attaches inside `.iv` + self-styles** — the theme CSS variables only resolve inside `.iv`; appending to `document.body` made the card transparent/unreadable.
- **Did NOT click Process during verification** — it would export real prod invoices (an accounting action, not a test). Verified read-only surface + prod-DB lifecycle test + computed styles instead.

## Blockers Requiring Human Action
1. **StormWatch live deploy** — paused pending Reonomy/ZoomInfo terms + property-layer E2E validation. (Standing.)
2. **`SLACK_ADMIN_BOT_TOKEN`** — one-time admin OAuth grant for zero-click Slack app installs. (Carried.)
3. **Open-branch decisions** — `db-price-foundation-round4` (apply migrations?) and `coderabbit-config` (adopt?) need a human call.
4. **Carried debt:** rotate `sntrys_` Sentry build token; 41 "call for pricing" ABC items need a quote; ABC full catalog sync still owed on Hetzner (Cowork sandbox can't finish the ~72-min/333-page job).

## Verification Commands
1. `git status --short` → empty (clean tree).
2. `git rev-list --left-right --count main...origin/main` → `0	0`.
3. `cd app/command-center && npx vitest run src/lib/invoice-audit.unit.test.ts` → 7 passed.
4. `git branch | grep contrib` → only `db-price-foundation-round3/4`, `vendor-territory-map`.

---

## Full Context

### What was built across recent sessions (running list — append, never delete)
- Invoice & order audit: UOM-normalized pricing (`price_per_uom`, migs 119–122, `docs/46`), hierarchical resumable review-progress bars site-wide, Global Price List review hierarchy (P4).
- Agreement Builder / Estimate Audit UOM normalization + coverage explain + deep-links.
- Command Center performance pass (caching, warm cadence, payload compaction, browser-cache nav).
- Agent fleet: 7 profiles + schema, full deploy, `validate-agent.py`, 26 crons, Ops Conductor.
- Agent onboarding automation (Kasm/Slack/gcloud/GHL) + deploy/onboarding skills.
- StormWatch/ZoomInfo lead pipeline (committed, deploy-paused).
- **Invoice "To Be Paid" two-phase payment loop:** export→exported→paid/returned lifecycle, per-vendor QuickBooks CSV, reconciliation with ABC AR, Payments management panel. (migration 153 + `v_invoice_payment_reconciliation`.)
- Observability (Sentry), WorkOS agent auth, vendor territory map (live on `main`).

### Key invariants (never violate)
- Additive/idempotent migrations only; never destructive against a client brain (hard rule 1).
- Invoice payment: **export ≠ paid**; QuickBooks CSV column order is locked; one file per vendor.
- `command_center.approval_decide: false` and `google_workspace.external_send_authorized: false` on ALL agents — schema-enforced.
- Agent Google Workspace emails use `@cc.proexteriorsus.net` (NOT `@proexteriorsus.com`).
- Rowan Vale: `network_policy: external-only`, no Supabase token.
- Compare prices in ABC pricing UOM via `price_per_uom` + `v_item_uom_map` — never raw `quantity`/`uom`/`pricePerUnitAmount`.
- `main` is the only branch that deploys; converge contrib branches back, never strand work (hard rule 11).

### Service / deployment map
| Service | Detail |
|---|---|
| Command Center (prod) | https://cc.proexteriorsus.net — Coolify builds `app/command-center/Dockerfile` from GitHub `main` |
| Supabase (shared dev+prod) | project `rnhmvcpsvtqjlffpsayu` — additive migrations live for both immediately |
| Agent host | Hetzner/Coolify (`docs/27`) — Kasm desktops, nightly ABC sync belongs here |
| Auth | WorkOS-gated dashboards; agents use `Authorization: Bearer <service-token>` on `/api/*` (skill `workos-agent-auth`); local dev uses the Local Operator fallback |

**Prior context:** `context/memory/2026-06-26.md` (today's daily log); archived handoffs `docs/handoffs/archive/2026-06-26-0837.md`, `2026-06-25-1043.md`.
