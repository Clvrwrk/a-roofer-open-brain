# Project Handoff — Pro Exteriors Open Brain / Command Center
**Project:** a-roofers-open-brain (Pro Exteriors Command Center + agent fleet)
**Repo:** https://github.com/Clvrwrk/a-roofer-open-brain
**Production URL:** https://cc.proexteriorsus.net
**Date:** 2026-09-14 11:30 (CT)
**Agent:** Lead Orchestrator (Claude Code, Fable 5.1)
**Reason:** User-requested (/project-handoff after shipping the living design system)

---

## Accomplished This Session

Brief: `/design` — "the most detailed design system ever produced", deployed as an interactive site with sidebar navigation at `cc.proexteriorsus.net/design-system`. Shipped, deployed, verified.

### The site (18 chapters + machine feed)

- `app/command-center/src/layouts/DesignSystemShell.astro`: the site's own shell — navy chapter rail (search, grouped chapters with section sub-links, "← Command Center"), sticky top bar with the System/Light/Dark trio wired to `cc.theme`, right-hand "on this page" list, prev/next pager, copy-to-clipboard token chips, phone drawer collapsed by default.
- `app/command-center/src/lib/design-system/nav.ts`: chapter map (slug, group, sections) driving the rail, TOC, search index and pager.
- `app/command-center/src/lib/design-system/tokens.ts`: parses `global.css :root` at build time via `?raw`, resolves `var()` chains, defines `darkOverrides`, WCAG contrast + CMYK helpers.
- `app/command-center/src/pages/design-system/tokens.json.ts`: `GET /design-system/tokens.json` — every token with light/dark values, motion tokens, breakpoints, long-list constants.
- `app/command-center/src/pages/design-system/*.astro`: `index` (first-principles method, precedence, rule index), `color` (Pantone/CMYK/RGB per ink, five-role discipline, audit-surface palettes, measured contrast matrix both modes, vendor colours), `logo` (files, anatomy, clear space, backgrounds, placement, mark, vendor badges, misuse, alt), `typography` (ramp, weights, tracking/kerning, numerals, measure, mobile/print ramps), `spacing` (scale, app frame, rail, breakpoints, full-bleed contract, density, z-index), `iconography` (icon grammar, the set, image sizing, formats, alt-text rules), `components` (20 components as production markup incl. board specimens via `cash-surface.css`), `modes` (mechanism, token mapping, per-component behaviour, elevation), `motion` (13 motions live with replay; duration/easing tokens; reduced motion), `dashboards` (Tufte applied, page shapes, KPI rules, charts, numbers, lights), `decisions` (~90 recorded UX decisions with repo paths + never-do list), `mobile`, `accessibility` (WCAG 2.2 table, ARIA in use), `content`, `print`, `swag`, `web`, `agents` (recipe, ship checklist, file map, feed, escalation, changelog).
- `app/command-center/src/components/design-system/{DsSection,DsSpec,DsRule,DsToken}.astro`: documentation primitives.
- `app/command-center/src/styles/design-system.css`: site chrome + the canonical dark mapping (re-points the `:root` aliases).
- `app/command-center/src/lib/nav.ts`: "Design System" leaf under AI Agents.

### Swag renders

- `scripts/design-system-swag.mjs`: 12 items via fal.ai `openai/gpt-image-2.5/flare/edit` with the official logo as reference image; provenance manifest.
- `app/command-center/public/design-system/swag/*.jpg` + `manifest.json`: 960px JPEG q82, ≤ 250 KB each.

### Fix found while documenting

- `app/command-center/src/styles/global.css`: `--error-surface` / `--error-text` were consumed by `.button-danger`, `.priority-critical` and the CM panel but never declared; added as aliases. Destructive buttons had no fill in production.

### Docs and pointers

- `docs/112-design-system-site.md`: what it is, decisions, recorded gaps, keeping it true.
- `CLAUDE.md` (Working style), `CONVENTIONS.md` §11, `config/brand/DESIGN.md`, `standards/design/v1.md`: pointers to the site and the same-PR update rule.
- `context/memory/2026-09-14.md`: session block.
- Version `0.6.551A → 0.7.1A` (minor bump for a new major surface, docs/62).

## Git State
- **Branch:** `main` (feature branch `claude/cc-proexteriors-design-system-c99a08` merged fast-forward and also pushed)
- **Last commit:** `7296c22` — "feat(design-system): living design system at /design-system — 18 chapters, tokens.json feed, fal.ai swag renders"
- **Deployed:** `/healthz` `buildCommit` = `7296c22…` at 11:11 CT
- **Uncommitted changes:** this handoff only (committed as the wrap-up commit)

## Task Cut Off
None — session ended at a clean boundary. Build green, 352/352 tests green, deploy confirmed.

## Next Task — Start Here

**Task:** Close the recorded design-system gaps (docs/112 → "Recorded gaps"), starting with the `:focus-visible` ring (rule A-02).

**What to check / do:**
1. Read `/design-system/agents` (recipe + ship checklist) and `/design-system/accessibility#focus`.
2. Add `:focus-visible` rules to `app/command-center/src/styles/global.css` for buttons, links, inputs, summaries, segments (2px ring in `--primary`, 2px offset; inputs move the border), and gold in each board's `[data-theme="dark"]` block.
3. Remove the resting shadow from `.metric-panel` and `.gap-metric-card` (CMP-12).
4. Move `price-agreement/review.astro` and `price-list/branch.astro` from raw `prefers-color-scheme` onto `cc.theme` via `initThemePref` (MD-01).
5. Open each touched page in both modes and at 390px; cite the rule ids in the commit.

**If the dev server will not start in the worktree:** `npm ci --no-audit --no-fund` in `app/command-center` (the worktree has no `node_modules` until installed); preview via `.claude/launch.json` `command-center` on port 4399.

**Prompt to use:** "Read docs/handoffs/current.md. Then close the design-system gaps listed in docs/112 starting with the :focus-visible ring (rule A-02), verifying each surface in both modes before committing."

## Decisions Made This Session

- **The design system is a site, not a document.** Chapters are the navigation, so it has its own rail (`DesignSystemShell`), not the department rail. Do not fold it into `AppShell`.
- **Tokens are parsed from `global.css` at build time, never copied.** Contrast ratios are computed, not asserted. A table that could drift from production is not allowed on the site.
- **The site's dark mode is the canonical dark mapping** (`design-system.css` + `tokens.ts darkOverrides`). Production dark mode stays per-surface (Chris, 2026-06-17); a future shell-level dark mode copies this mapping — and must re-point the `:root` aliases (`--surface`, `--text`, …) because `var()` resolves where declared.
- **Board specimens use `cash-surface.css` (`.cfx`)**, the shareable copy of the canonical `.fw` vocabulary, with a `MutationObserver` mirroring the page theme.
- **Swag renders are references, not artwork.** The purchase order carries the artwork file, Pantone numbers, method and size from the per-item table; renders are regenerated only when the logo file changes.
- **Pantone numbers are nearest solid-coated matches by sRGB** and are labelled as such; rule C-07 requires a physical fan proof before any run over 100 units.
- **Rule ids are permanent** (C-, L-, T-, S-, I-, CMP-, MD-, MO-, D-, UX-, M-, A-, W-, P-, SW-, WEB-, G-). Retire with a note; never renumber. A change to a token, component, mode, motion or decision updates the matching chapter in the same PR (G-04).
- **`/design` canvas artifact not used** — the deliverable was the route itself.

## Blockers Requiring Human Action

1. **Client artwork** — an official reversed (white) logo and a roof-only mark are still needed; the current white SVG and favicon are Cleverwork stand-ins (Logo chapter, L-05).
2. **Carried forward, unchanged:** PEC-257 (7 August lines), PEC-258 (9 CMs without originals), the unstamped 2026-08-25 weekly batch, the pre-August $575.92 ruling, `morning_abc_sync` paused, CPA rulings, Coolify API token → `BETTERSTACK_API_TOKEN` on prod, stop `cc-production-e4344d8`, Q5 JT grant key, Q7 BS→Slack (see `context/MEMORY.md` ▶ Pick up here).

## Open branch not on main — PR #9 (green, waiting on a human)

`claude/project-handoff-5ua2fw` carries the PEC-221 price-agreement coverage work: migrations
**292-296** (already applied to prod, all additive) plus `docs/107` and `docs/108`. Kept 0
behind main and merged with it daily. All reviewers green on the current head; **not merged,
not deployed.**

Migration numbers have moved **thirteen** times as parallel sessions claimed numbers on main —
most recently 2026-09-15 (main took 289-291, so the set moved 289-293 → 292-296), three days
after the twelfth. Prod labels are unaffected throughout: Supabase keys on timestamp, so
`245_`/`246_`/`248_`/`249_` and `290_coverage_views_service_role_only` still name the applied
migrations and nothing is re-applied. If you take 292-296 on main, move the **whole** set
again, not just the colliding files — the spend view must keep preceding the two migrations
that read it. Two `COMMENT ON VIEW` bodies in prod also cite migration numbers, so re-issue
those and read them back; the file alone is not the whole change.

Thirteen collisions is a **mis-scoped branch**, not bad luck: five contiguous numbers held
open for three weeks against a main that ships several a day. If this work is picked up
again, land the schema in its own short-lived PR the day it is written and let the surface
work follow. Full history in `docs/107`.

**The defect it documents:** Denver × SRS has live, in-territory agreements the office ring
cannot reach, so the coverage surface reads `priced_items = 0` while a separate line-level
path prices some of the same lines. Two pricing paths disagreeing is the finding.

Four items need a human — full detail in `docs/107` and `docs/108`:
1. **Confirm `AMSDE` == `SBP-SOUTHDENVER`**, or approve repointing the agreement join to
   `vendor_branch_id` with mig 244's equivalence proof. **128 items.** This is the one that
   unblocks the defect.
2. Four branches (21, 39, 465, 684) geocoded but `geocode_status = 'pending'`, against a
   `geom IS NOT NULL` ⇒ `'ok'` invariant holding for 1,752 rows. Mig 293 demoted two; 39 and
   465 were touched by another process where `pending` may be a deliberate re-geocode
   request, so they were left alone rather than guessed at.
3. `v_office_vendor_branch` / `v_office_vendor_inheritance` are `anon`-readable on the same
   default grants mig 296 closed for the four coverage views. They predate this branch and
   are read by other surfaces, so locking them down needs a caller audit first.
4. **Repo-wide customer PII** (`docs/108`) — named individuals beside outstanding balances
   across at least 18 tracked files, including test fixtures that assert on the names. On
   `main`, not introduced by this branch. Needs a policy boundary, a replacement token, a
   decision on git history, and a CI check. A piecemeal sweep was tried and reverted for
   leaving tables half-anonymised; it needs its own workstream.

**Closed 2026-09-15 — ABC branch 326 (Topeka KS).** This branch raised it as a fifth item;
Chris ruled on it the same day and main shipped `291-rekey-abc-branch-326-topeka.sql`. The
Topeka row is re-keyed `topeka-KS-66618-1445` → `326`, the invoice FK is backfilled, and
`no_branch_resolved` is back to 0 rows / unresolved spend back to $27,566.56. The general
exposure was then largely closed by a second parallel session at 15:44 UTC (prod migration
`292_alias_slug_keyed_abc_branches`), which seeded numeric aliases for the slug-keyed rows.
Measured straight after: of ABC's 684 slug-keyed branches, **589 now resolve from a bare
invoice number and 95 still do not**. Reduced, not eliminated — each of those 95 repeats
branch 326 the first time it invoices. Watch `v_unresolved_branch_spend`; the query for the
95 is in the `docs/107` 2026-09-15 addendum.

**Do not quote a chase-total dollar figure from this work.** It tracks live purchasing on
pairs that cannot yet be audited, so it moves with ordinary invoice flow (a credit memo took
it down 2026-09-02; an invoice took it up 2026-09-05). Run the query instead:
`SELECT office_name, vendor_slug, invoice_count, spend, agreement_status FROM v_office_vendor_gap_exposure WHERE needs_ruling ORDER BY spend DESC;`

## Verification Commands
1. `git status --short` — empty
2. `git rev-parse --short HEAD origin/main` — both `7296c22` (or the wrap-up commit that follows)
3. `curl -s https://cc.proexteriorsus.net/healthz` — `buildCommit` starts with the deployed SHA
4. `curl -s -o /dev/null -w "%{http_code}" https://cc.proexteriorsus.net/design-system` — `302` to `/auth/login` when signed out; `200` with a session
5. `cd app/command-center && npm run build && npm test` — build complete, 29 files / 352 tests pass
6. Signed in: `/design-system/tokens.json` returns `"version": "0.7.1A"` and 77+ tokens

## Full Context

### What was built across ALL sessions (complete feature list)
Carried forward from prior handoffs (see `docs/handoffs/archive/`), plus:
- Invoice Audit v2 (docs/81), office-inherited pricing, vendor/office/time/UOM silos (migs 119–122, 201, 208, 217)
- Friday WIP/AR board (mig 215) with the long-list disclosure rule (2026-08-21), credit-memo claim sets, Agreement Builder + `agreement_gap_queue` (migs 229/229b)
- Materialised audit line + on-demand refresh (migs 272–276); item-aware supersession (277); weekly QB export set (278); vendor arm parity (279); negative-total/CM routing + per-vendor export (280)
- Cash family: 13-week cash flow, cash runway, fixed costs (mig 281)
- Runtime uptime board at `/agents` with direct third-party pings (docs/109, D16, 2026-09-12); Thursday WIP/AR pack on openpyxl (Aspose retired)
- CC ⇄ CRM parity fixes 2026-09-11 (body 14px, Inter loaded, purple accent → navy/info); CRM PWA companion repo (docs/111)
- **This session:** the living design system at `/design-system` (docs/112), `tokens.json`, swag renders, `--error-surface` fix, version 0.7.x

### Architecture decisions
- `v_invoice_audit_line` is the definition of record; every reader goes through `mv_invoice_audit_line` (the view exceeds the 8s `statement_timeout`; a direct PostgREST read renders empty). Matview refreshes every 15 min via pg_cron job 13.
- The audit is continuous, not batch. "Is anything undispositioned?" is the question.
- Credit status is derived from the amount, never written onto the vendor mirror.
- Dark mode is per surface via `theme-pref.ts` (`cc.theme`); the design-system site demonstrates the shell-level form and owns the dark mapping.
- Design tokens exist in exactly one place (`global.css :root`); the site parses them.

### Design system
- **Site:** https://cc.proexteriorsus.net/design-system — start at `/design-system/agents`.
- Inter 400/600/700/800 (self-hosted). Body 14px/1.5 shell, 12.5–13px boards. Navy `#11133f` (Pantone 2766 C) authority, flag red `#c22326` (186 C) the one CTA, gold `#eaa221` (1235 C) attention never a button, hunter green `#3b6b4c` (7733 C) status only, smart blue `#0066cc` (2935 C) links/data. Radius 8 default, 4px spacing scale, borders over shadows, one flag-red primary per viewport, status always a word + colour, ten-row long-list panes, PE Office → Vendor Branch → Document → Line nesting.

### Key invariants (never violate)
- Four pricing gates: vendor · office · time (item-aware supersession) · UOM; the audit refuses rather than converts; lowest-price tie-break — simulate before adding a book.
- A negative total is a credit memo. One QB export file per vendor. `register_exported_at` is one-way. A human cancellation is a decision.
- No literal hex / spacing / font outside the token system (DSN-010/014); no role swaps (DSN-011); one flag-red CTA (DSN-012); mono only on Property Cards + SKU cells (DSN-013).
- Nothing external without a human. QBO is read-only.
- Every change to a token, component, mode, motion or decision updates the design-system chapter in the same PR.

### Service / deployment map
| Service | Detail |
|---------|--------|
| Prod Supabase | `rnhmvcpsvtqjlffpsayu` (shared by dev and live). For the applied watermark, query it — `SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;` — do not read a number from this table. Main ships several a day, so any number written here is stale within hours; it read "through 287" while prod was past 292. |
| Deploy | Coolify → `cc.proexteriorsus.net`, builds `app/command-center/Dockerfile` from `origin/main`; verify `/healthz buildCommit`; Coolify host `178.105.220.14`; helper `scripts/coolify-redeploy.sh`; skill `/coolify` |
| Dev | port 4399 via `.claude/launch.json` `command-center`; worktrees need `npm ci` in `app/command-center` |
| Nightly loop | `scripts/abc-nightly-sync.sh` 03:30 ET on the agent host (`178.156.203.23`) |
| pg_cron job 13 | `mv_invoice_audit_line` + office pricing matviews, every 15 min |
| Weekly QB batch | `node scripts/build-inv-processed-weekly.mjs` (Tuesdays), prep-only unless `--stamp` |
| Runtime board | `/agents` (docs/109); Better Stack watches the site only; third parties by direct ping |
| Swag renders | `node scripts/design-system-swag.mjs` — needs `FAL_KEY`, which loads only in an interactive zsh: `zsh -lic 'node /abs/path/scripts/design-system-swag.mjs'` |
| Agent auth to live site | Bearer service tokens on `/api/*`; skill `/workos-agent-auth` |
| Slack | per-agent bots per `/slack-agents`; all dev traffic → `#pe-cc-dev-team` |
