<!-- Cap: 2,500 chars. Curated working snapshot; update sparingly. -->
# Working Memory

## ▶ Pick up here
**8/24: PEC-235** — Long-list disclosure on 5 surfaces (Invoice Audit, Price List Review, Categorize, Credit Memos, Agreement Builder); ref friday-wip. Migs **268-276**: ABC colour arm + **dimension guard** (claims $7.3k→$6.1k; worst var 129→58.8%), `renewal_mode`, `mv_invoice_audit_line`. **Chris: a price list stays in effect until a NEW list supersedes it**; expiry is documentary.
**Blocked on Chris:** PEC-244 (23 stale Maya intake, 11 Urgent), 240 (Blake Wells CO), 242, 111, 221/214. PEC-216 shipped post-hold — confirm or revert mig 276.

## Standing instructions (Chris)
- **Silo doctrine: price agreement = (vendor, PE office). No pricing join crosses either; unknown office ⇒ No-Price; fail closed. Every money table keys (vendor_slug, invoice_number).**
- **A fix isn't fixed until verified through the LIVE call path.**
- Vendor data = official API docs FIRST; verify vs LIVE DB, not migration files.
- Zero external sends (v1); prod first-tries gated (sandbox → subset → fan-out).
- Deploys: AGENT ships — state change+impact+rollback, then push `HEAD:main`. Slack → `/slack-agents`.
- **All app/code/Linear-issue Slack traffic → `#pe-cc-dev-team`** (Chris 2026-08-07; incl. future fix-approval gates).

## Playbooks (docs/42 + PEC-184)
1. UOM: compare in pricing UOM `price_per_uom` via `v_item_uom_map` (docs/46). 2. PostgREST truncation: "exactly 1000"=cap→paginate; chunk `.in()`; partition upserts. 3. Structured source before OCR; tie vision output to printed totals server-side. 4. ABC mapping drift → COALESCE from `raw`. 5. Worktree agents: stage ONLY your files. 6. AccuLynx watermark PK `(account_key,resource_type)` (171). 7. Rotating OAuth: persist successor; diagnose via fingerprints, never values. 8. After host rebuilds ALL stored ids go stale — re-verify, never trust. 9. **Never read a per-row-LATERAL view via PostgREST** — the 8s `statement_timeout` is inherited by `service_role`; materialise. 10. **EXPLAIN a matcher predicate before shipping**; counts can be right while the plan is wrong.

## Environment / Deploy
GitHub `Clvrwrk/a-roofer-open-brain`; LIVE=`origin/main` (Coolify; verify `/healthz`). Supabase `rnhmvcpsvtqjlffpsayu`, schemas thru **276**. Dev port **4399**. Hetzner AGENT `178.156.203.23` (`~/.ssh/hetzner_office`). Linear PE-CC-DevTeam. **Full service map + Orgo/WorkOS ids: `docs/handoffs/current.md`.**
