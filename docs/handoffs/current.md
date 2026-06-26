# Project Handoff — A Roofer's Open Brain (Command Center)

**Project:** a-roofers-open-brain
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain (`origin`)
**Production URL:** https://cc.proexteriorsus.net (Coolify ← GitHub `main`; shared prod Supabase `rnhmvcpsvtqjlffpsayu`)
**Date:** 2026-06-26
**Agent:** Lead Orchestrator
**Reason:** User-requested cross-track handoff (two parallel work streams from the last 4 days, neither cleanly handed off)

> ⚠️ **StormWatch Pause Notice (still active).** StormWatch / property-layer *pipeline deployment* remains intentionally paused until Reonomy/ZoomInfo partnership terms are finalized and the property layer is validated E2E with production-grade data-quality checks. This session **committed the StormWatch artifacts** (docs/schemas/skills) so they stop living uncommitted on `main` — that is *not* a deploy. Do not run the live `--push-ghl` pipeline against production until the pause lifts.

---

## TL;DR — where we left off

- `main == origin/main`, **working tree clean**, single worktree. Everything below is pushed.
- Two stranded work streams are now committed and converged onto `main`:
  - **Track A — Performance + Agent Fleet** (was already merged via `cc-performance-review`).
  - **Track B — StormWatch / ZoomInfo** (was uncommitted; now committed `31fc04c`).
  - **Track C — Invoice "To Be Paid"** (was uncommitted; now committed `6600516`).
- Branch sprawl cleaned: **10 merged branches deleted** (local+remote), perf-review worktree removed.
- **4 branches remain open** with real unmerged work — each has a closure task list below.

---

## Accomplished This Session

### Convergence & commits (this session)
- `40c11c3` — `chore`: gitignore `__pycache__/`, `*.pyc`, `tmp_stormwatch_*`; untracked committed `.pyc` files.
- `31fc04c` — `feat(stormwatch)`: committed Track B (docs 47–54, schemas 147–152, `.codex/skills/{stormwatch-live-run-ops,gohighlevel-rest-ops}`, GHL bridge notes, daily log 06-24).
- `6600516` — `feat(invoice-audit)`: committed Track C (Invoices To Be Paid CSV export + processed-payment ledger schema 153).
- Pushed `main` (`f7ca415 → 6600516`).

### Branch / worktree cleanup
- Removed worktree `/Users/chussey/Documents/a-roofers-open-brain-perf-review` (its branch `cc-performance-review` was fully merged into `main`).
- Deleted 10 fully-merged branches (local + remote, recoverable from `main`): `cc-performance-review`, `observability-sentry`, `supabase-ops-knowledge-live`, `supabase-ops-knowledge`, `acculynx-api-blockers-email`, `acculynx-api-docs-skill`, `ai-agent-workspace-app`, `maintenance-agent-app-transition`, `product-data-auth-integration`, `vendor-territory-map-live` (the stale old "live" branch, 175 behind `main`).

## Git State
- **Branch:** `main`
- **Last commit:** `6600516` — "feat(invoice-audit): Invoices To Be Paid CSV export + processed ledger"
- **Uncommitted changes:** none — tree clean.
- **Worktrees:** one (`/Users/chussey/Documents/a-roofers-open-brain` → `main`).

## Task Cut Off
None mid-block. **One verification debt:** Track C invoice work was committed from an in-flight session and has **not been build/test-verified** this session (see Next Task #1) — it compiles as authored but was not run.

---

## The two stranded work streams (what each track is)

### Track A — Performance + Agent Fleet  ✅ on `main`, deployed
Was developed on `contrib/cleverwork/cc-performance-review` (+ its worktree); fully merged into `main`.
- **Speed:** command-center response caching, warm-cadence learning + cache-warm endpoint, compacted vendor-territory-map payload, browser-cache navigation, preserve-last-complete render.
- **Agent profiles:** `agents/profiles/_schema.yaml` (58 fields, 44 required, 10 rules) + 7 profiles (maya-chen, alex-rivers, casey-morgan, jordan-price, sam-torres, rowan-vale, lena-brooks), all 7/7 valid.
- **Fleet deploy:** full 7-agent fleet, canonical `scripts/validate-agent.py`, multiple forensic fixes.
- **Crons:** 26 cron jobs across all 7 agents (`scripts/write-cron-jobs.py`, `0bf7a9e`).
- **Ops Conductor** architecture + output routing fix (`2d5c63c`).
- **Onboarding automation:** all 4 one-time setups complete (Kasm key, Slack config token, gcloud ADC pair, GHL Firebase token) — see archived 06-25 handoff for credential locations/pitfalls.

### Track B — StormWatch / ZoomInfo lead pipeline  ✅ committed `31fc04c`, ⏸ deploy paused
A parallel Codex session's storm-alert lead pipeline (ZoomInfo → Supabase → GHL). Now committed:
- **Docs 47–54:** ZoomInfo DevPortal playbook/checklist/app-create guide; ZoomInfo→Supabase→GHL field contract; full-field / lead-packaging / storm-alert-SLA validations (06-24); forensic review (06-25, the golden-path runbook).
- **Schemas 147–152** (additive/idempotent): zoominfo-ghl connectivity, full field contract, lead packaging, GHL property-object mapping, storm-event ledger, visit-task payload.
- **Scripts** (already on `main`): `scripts/stormwatch/{run_storm_alert_pipeline,stormwatch_preflight,run_stormwatch_connectivity,sync_stormwatch_property_object}.py`.
- **Skills:** `.codex/skills/stormwatch-live-run-ops`, `.codex/skills/gohighlevel-rest-ops`.
- Golden path (NON-PUSH first): preflight new `--event-id` → run pipeline (validate) → confirm accepted leads > 0 → only then `--push-ghl`. Known failure modes documented in `docs/54`.

### Track C — Invoice "To Be Paid" CSV + processed ledger  ✅ committed `6600516`
Continuation of today's invoice-audit work (`baf6f84`/`e12ce51`/`f7ca415`).
- `isInvoiceToBePaid` = audited & non-credit & unpaid & no pending lines; `toBePaid`/`processedAt` rollups at branch/office/totals.
- `app/command-center/src/pages/api/invoice-audit/to-be-paid.csv.ts` — access-gated service-role CSV export route.
- `schemas/cleverwork-roofer/153-invoice-payment-processed-ledger.sql` — additive `invoice_payment_processed` ledger (server-only) so a paid batch is recorded and excluded from later exports.

---

## Next Task — Start Here

**Task:** Verify Track C (invoice) builds/tests, apply pending Supabase migrations, then resolve the 4 open branches.

**What to check / do:**
1. **Verify Track C** — from `app/command-center/`: run the unit tests (`invoice-audit.unit.test.ts`) and a typecheck/build. If green, exercise the CSV route on the dev server reading prod DB.
2. **Apply additive migrations to prod Supabase** if not already applied: schemas `147–153` (StormWatch field contract/ledgers + invoice `153`). All are `IF NOT EXISTS`/idempotent — safe to re-run. Confirm via `list_migrations`/`list_tables`.
3. **Close the 4 open branches** (see "Open Branches" below) — decide merge-or-delete for each.

**If the invoice unit tests fail:** the `toBePaid`/`processedAt` fields were added to the rollup interfaces — check `invoice-audit-tree.ts` and the `.astro` consumer for a missing field before touching logic.

**Prompt to use:** "Read docs/handoffs/current.md. Verify Track C invoice work (build + unit tests in app/command-center), apply additive migrations 147–153 to prod Supabase if missing, then walk the 4 open branches and tell me merge-or-delete for each."

---

## Open Branches — closure plan (the only branches left)

`main` is canonical and clean. These 4 each carry real unmerged commits:

| Branch | Unique work | Recommended closure |
|---|---|---|
| `contrib/cleverwork/db-price-foundation-round4` | round4 price-foundation SQL: `schemas/cleverwork-roofer/price-foundation/round4/{001_phase1_sidecars,002_phase1_backfill_and_quarantine,003_phase1_validation_queries,900_ghost_smoke_fixture}.sql` + README + TRADEOFF_REGISTER + phase1 Supabase-branch run doc | **Decide & merge or archive.** Review the 001–003 sidecar migrations against current prod schema; if still wanted, apply + merge to `main`. Large deletions in the diff are just staleness (branch forked before much of `main` landed) — only the `price-foundation/round4/*` adds are real. |
| `contrib/cleverwork/db-price-foundation-round3` | Subset of round4 (round3's 2 commits are ancestors of round4) | **Delete** once round4 is resolved — fully contained in round4. |
| `contrib/cleverwork/vendor-territory-map` | Only a `scripts/memsearch-index-open-brain.sh` tweak is unique; the vendor map itself is already live on `main` | **Cherry-pick the script tweak if wanted, else delete.** Effectively superseded. |
| `contrib/cleverwork/coderabbit-config` (remote-only) | `.coderabbit.yaml` CI config (advisory-only, hard-rule path instructions) | **Adopt-or-drop.** If adopting CodeRabbit reviews, merge to `main`; else `git push origin --delete contrib/cleverwork/coderabbit-config`. Note hard-rule #12 (third-party agent tool gate) — a CI reviewer config is low-risk but worth a glance. |

Delete commands once decided (examples):
```
git branch -d contrib/cleverwork/db-price-foundation-round3 && git push origin --delete contrib/cleverwork/db-price-foundation-round3
git branch -D contrib/cleverwork/vendor-territory-map      && git push origin --delete contrib/cleverwork/vendor-territory-map
```

## Decisions Made This Session
- **Committed StormWatch artifacts despite the deploy pause** — committing docs/schemas/skills ≠ deploying the pipeline; leaving them uncommitted on `main` was the real risk (Live⇄Dev drift, hard rule 11).
- **Committed in-flight Track C invoice work** — user opted "commit both"; flagged as build/test-unverified rather than blocking the handoff.
- **Deleted merged branches on local *and* remote** — they are fully reachable from `main`, so recoverable; convergence per hard rule 11.
- **`tmp_stormwatch_*` gitignored, not committed** — per-run replay scratch (SQL/JSON), regenerated each run.
- **`__pycache__`/`*.pyc` untracked** — build output that had been committed under `scripts/stormwatch/`.

## Blockers Requiring Human Action
1. **StormWatch live deploy** — paused pending Reonomy/ZoomInfo partnership terms + property-layer E2E validation. (Standing.)
2. **`SLACK_ADMIN_BOT_TOKEN`** — one-time admin OAuth grant for zero-click Slack app installs (last manual step in agent deploy). (Carried from 06-25.)
3. **Open-branch decisions** — `db-price-foundation-round4` (apply migrations?) and `coderabbit-config` (adopt CodeRabbit?) need a human call.
4. **Carried debt:** rotate `sntrys_` Sentry build token; 41 "call for pricing" ABC items need a quote conversation; ABC full catalog sync still owed on Hetzner/Coolify host (Cowork sandbox can't complete the ~72-min/333-page job).

## Verification Commands
1. `git status --short` → empty (clean tree).
2. `git rev-list --left-right --count main...origin/main` → `0	0`.
3. `git worktree list` → single entry (`a-roofers-open-brain` → `main`).
4. `git branch -a | grep contrib` → only `db-price-foundation-round3/4`, `vendor-territory-map`, `coderabbit-config`.

---

## Full Context

### What was built across recent sessions (running list — append, never delete)
- Invoice & order audit: UOM-normalized pricing (canonical `price_per_uom`, migs 119–122, `docs/46`), hierarchical resumable review-progress bars site-wide, Global Price List review hierarchy (P4).
- Agreement Builder / Estimate Audit UOM normalization + coverage explain + deep-links.
- Command Center performance pass (caching, warm cadence, payload compaction, browser-cache nav).
- Agent fleet: 7 profiles + schema, full deploy, `validate-agent.py`, 26 crons, Ops Conductor.
- Agent onboarding automation (Kasm/Slack/gcloud/GHL setups) + deploy/onboarding skills.
- StormWatch/ZoomInfo lead pipeline (committed, deploy-paused).
- Invoice "To Be Paid" CSV export + processed-payment ledger.
- Observability (Sentry), WorkOS agent auth, vendor territory map (live on `main`).

### Key invariants (never violate)
- Additive/idempotent migrations only; never destructive against a client brain (hard rule 1).
- `command_center.approval_decide: false` and `google_workspace.external_send_authorized: false` on ALL agents — schema-enforced.
- Agent Google Workspace emails use `@cc.proexteriorsus.net` (NOT `@proexteriorsus.com`).
- Rowan Vale: `network_policy: external-only`, no Supabase token.
- Compare prices in ABC pricing UOM via `price_per_uom` + `v_item_uom_map` — never raw `quantity`/`uom`/`pricePerUnitAmount`.
- `main` is the only branch that deploys; converge contrib branches back, never strand work (hard rule 11).

### Service / deployment map
| Service | Detail |
|---|---|
| Command Center (prod) | https://cc.proexteriorsus.net — Coolify builds `app/command-center/Dockerfile` from GitHub `main` |
| Supabase (shared dev+prod) | project `rnhmvcpsvtqjlffpsayu` — additive migrations are live for both immediately |
| Agent host | Hetzner/Coolify (`docs/27`) — Kasm desktops, nightly ABC sync belongs here |
| Auth | WorkOS-gated dashboards; agents use `Authorization: Bearer <service-token>` on `/api/*` (skill `workos-agent-auth`) |

**Prior context:** `context/memory/2026-06-25.md`, `2026-06-24.md`, `2026-06-22.md`, `2026-06-20.md`; archived handoff `docs/handoffs/archive/2026-06-25-1043.md`.
