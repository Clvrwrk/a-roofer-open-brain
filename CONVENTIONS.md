# CONVENTIONS — the shared contract

> This is the canonical reference every agent, skill, bridge, recipe, and doc in this repo must conform to. If a station's output disagrees with this file, this file wins. The Jidoka audit (`docs/06-...` + `scripts/verify-deployment.sh`) checks conformance.

---

## 1. Naming

- **Folders:** `kebab-case`. One concept per folder.
- **Per-folder files:** every leaf folder under `agents/`, `skills/`, `integrations/bridges/`, `recipes/` ships a `README.md`. Skills additionally ship `SKILL.md` + `metadata.json`. Agents ship `ROLE.md`.
- **Raw imports:** copied projects, third-party repos, and client-private files do not live permanently at repo root. Use local ignored `imports/` for raw project intake and local ignored `private/` for sensitive client material. Curated outputs move into canonical folders only through a reviewed move manifest.
- **App code:** the production Command Center will live under `app/command-center/` once the GSD app-transition phase starts. The current prototype remains under `deployment/remote/dashboard/` until migration verifies.
- **Vertical agent Slack handles:** `@ob-accounting`, `@ob-ops`, `@ob-sales`, `@ob-marketing`, `@ob-exec`.
- **Horizontal agents:** internal names, not Slack-mentionable by clients — `capture`, `historian`, `researcher`, `conductor`, `auditor`, `quality-control`, `innovator`, `maintenance`.
- **SQL:** snake_case tables/columns; new tables in `public`; every migration idempotent.
- **Atoms** are the unit of memory. We say "atom" in prose; the durable row lives in `public.thoughts` (OB1's table).

## 2. The atom model

The OB1 spine keeps the durable content in **`public.thoughts`** (id UUID, content, embedding, metadata JSONB, created_at, updated_at, content_fingerprint) plus OB1's enhanced/provenance columns (`type`, `sensitivity_tier`, `importance`, `quality_score`, `source_type`, `derived_from`, `derivation_layer`, `supersedes`). **Do not redefine these.** We extend them.

Cleverwork roofer extension columns on `public.thoughts` (see `schemas/cleverwork-roofer/`):

| Column | Type | Meaning |
| --- | --- | --- |
| `property_id` | UUID FK → `property`, nullable | the place this atom is about |
| `client_id` | UUID, not null (`'self'` in single-tenant) | owning client |
| `job_id` | UUID FK → `job`, nullable | the engagement |
| `trust_tier` | TEXT enum `instruction \| evidence \| inference` | see §3 |
| `model_card` | JSONB | `{provider, model_name, model_version, captured_at}` |
| `tool_spec_hash` | TEXT, nullable | detect tool-surface drift |
| `revalidation_timestamp` | TIMESTAMPTZ, nullable | last currency re-check |
| `era_of_practice` | TEXT, nullable | e.g. `IRC-2018`, `OSHA-pre-2024-silica` |
| `original_capture_date` | DATE, nullable | when the fact was first known |
| `original_practitioner` | JSONB, nullable | `{name, role, tenure_years, consent_to_attribute}` |
| `regulatory_snapshot_id` | UUID FK, nullable | code in effect at capture |
| `recontextualization_notes` | TEXT, nullable | "pre-current-code; verify vs latest" |
| `eeat_signal` | JSONB, nullable | `{type, value, publishable_with_consent, consent_recorded_at}` |
| `soft_or_hard` | TEXT enum `hard \| soft`, nullable | debrief atomization track |
| `consent_flags` | JSONB | `{cross_client_shareable, trade_restriction[], publishable_external, expires_at}` |
| `cold_archive_status` | TEXT enum `live \| archived \| deprecated` | retrieval tier |
| `source_link_broken` | BOOL | Maintenance sets on 404 |

New tables: `property`, `jurisdiction`, `regulatory_snapshot`, `job`, `insurance_claim`, `manufacturer_warranty`, `atom_access_log`. Defined in `schemas/cleverwork-roofer/`.

## 3. Trust tiers (map to OB1's provenance model)

| `trust_tier` | Meaning | OB1 mapping |
| --- | --- | --- |
| `instruction` | human-confirmed or trusted import; may steer behavior | `provenance_status IN (user_confirmed, imported)`, `can_use_as_instruction=true` |
| `evidence` | observed fact with a source (default for captured + inferred) | `can_use_as_evidence=true` |
| `inference` | model-generated conclusion; never auto-promoted to instruction | `provenance_status='generated'` |

**Rule:** inferred/generated content is `evidence` by default. Promotion to `instruction` requires human confirmation. **Only Quality Control may change a `trust_tier` on an existing atom.**

## 4. Security boundaries (non-negotiable)

- **Historian** retrieves only from the client's brain. **Never touches the public internet.**
- **Researcher** retrieves only from outside. **Never reads the client's brain.**
- These run as separate processes with separate credentials. This split closes the prompt-injection exfiltration path. Any agent/skill/bridge that blurs it fails the audit.
- **MCPs are MCP containers on Hetzner only.** No local stdio MCP servers, no `claude_desktop_config`-style local Node. (Inherited from OB1.)
- **One brain per client. Total isolation.** Cross-client sharing happens *only* through the consent-gated property read path (§7).
- **QuickBooks Online production is read-only / mirror-only.** Agents and sync jobs may extract into Supabase/Open Brain; they must never create, update, delete, void, or pay in live QBO. Enforce via `QUICKBOOKS_ACCESS_MODE=read_only`, `QUICKBOOKS_WRITE_ENABLED=false`, and `integrations/bridges/quickbooks/read-only-client.mjs`. Policy: `docs/74-quickbooks-production-read-only-guardrails.md` (PEC-98).

## 5. Skill format (merged OB1 + InfraNodus)

Every skill folder contains:
- `SKILL.md` — frontmatter (`name`, `description`, `when_to_use`, `inputs`, `outputs`, `trust_tier_of_output`, `bound_agents`, `provenance`) then the prompt/instructions.
- `metadata.json` — `{ "name", "version", "origin": "cleverwork|ob1|infranodus", "license", "bound_agents": [], "a3_ref": null }`.
- Originals go in `skills/cleverwork-roofer/`. Cited/adapted skills go in `skills/ob1/` or `skills/infranodus/` with an `ATTRIBUTION` note and a link — never copy proprietary text verbatim (§8).

## 6. Roofer specialization (stay on-domain)

This is a **roofer's** brain, not a generic construction template. Default assumptions:
- **PM tool:** AccuLynx (primary bridge; `acculynx-api` skill is the reference).
- **Photo/field doc:** CompanyCam (claim + EEAT evidence).
- **Measurement:** EagleView / aerial takeoff.
- **Accounting:** QuickBooks.
- **Insurance/storm work is first-class:** claims, supplements, Xactimate line items, adjuster meetings, ACV vs RCV, depreciation recovery, scope disputes. The `storm-response` recipe and `@ob-sales`/`@ob-accounting` skill packs assume this.
- **Manufacturers & certs:** GAF (Master Elite), CertainTeed (SELECT ShingleMaster), Owens Corning (Platinum Preferred) — warranty registration and cert-status tracking matter.
- **Code/era:** IRC roofing provisions, local AHJ amendments, ice-and-water-shield requirements, wind/uplift ratings, re-roof vs. tear-off rules. Era-stamp accordingly.

## 7. Consent & cross-client property sharing

- Global opt-in at onboarding (`config.consent.cross_client_default`). Carrot, not stick.
- Cross-client read path filters `consent_flags.cross_client_shareable=true`, drops atoms whose `trade_restriction` includes the requester's trade, anonymizes the source contractor by default, logs every read to `atom_access_log`.
- Two roofers never share with each other (same trade). Roofer↔remodeler/HVAC can.
- EEAT external publication requires `eeat_signal.publishable_with_consent=true` AND `consent_recorded_at` set AND an Auditor pass.

## 8. Licensing rules for generated content

- **Write Cleverwork-original prose/code** throughout. Do not paste source-repo text verbatim.
- **OB1** (FSL-1.1-MIT): base schemas may be vendored under `schemas/ob1-base/` **with `ATTRIBUTION.md`**; carry Nate B. Jones provenance and links naturally.
- **Dynamous** (proprietary-community): **reference and cite only — never copy files into this repo.** Point to concepts, re-express in our own words.
- **InfraNodus:** cite as the origin of cognition skills; re-express prompts in our own words, attribute.
- No secrets, API keys, tokens, or PII in any committed file. Use placeholders that match `config/.env.example`.
- No profanity anywhere (docs, prompts, seed data, comments).

## 9. Config-driven customization

Anything a roofer would plausibly change lives in `config/roofer.config.yaml` (company name, service area, license #, jurisdictions, manufacturers, enabled agents/skills, integration toggles, consent default, deployment profile, model tiers). Agents/recipes/bridges read config keys — they do **not** hard-code a specific company. Secrets live in `.env` (never committed), names mirrored in `config/.env.example`.

## 10. Governance

- No new skill ships without an A3 (`proposals/_a3-template.md`) showing a measured baseline, projected new state, and an explicit **≥10x ROI** calculation. *If the human is cheaper, the human remains.*
- Exempt from the 10x gate: mission-grade infrastructure (debrief pipeline, era-stamping, property model, EEAT) and high-error-cost tasks where avoided-error cost carries the math.
- **Auditor** enforces the current standard per work product. **Quality Control** sets/changes standards (DMAIC on 3+ repeats). They are separate roles; do not merge them.
- **Maintenance** runs 5S on the brain and never deletes, never edits provenance, never changes `trust_tier`, never publishes.
- **Structured source before OCR.** Before building any OCR/parse/extraction step, check whether the vendor API/`raw` JSON already carries the field (verify against the live DB). Don't OCR what's already structured.
- **The agent deploys; the gate is explain-then-ship.** The agent has full GitHub/Coolify/Hetzner access and ships its own deploys (corrected 2026-06-29, supersedes the prior human-only rule). Converge the branch into `main`, apply migrations, build + tests green; then state what's changing + impact + rollback, push the live branch, and poll `/healthz` `buildCommit` to live. Self-granting the permission in `settings.json` stays blocked and isn't needed. Canonical: `CLAUDE.md` → Live⇄Dev + the `/coolify` skill.


## 10a. Third-party agent tool gate

No external skill, plugin, MCP server, agent wrapper, memory tool, or installer repo may be installed, copied into the brain, enabled globally, or recommended as a standard workflow until it passes the third-party agent tool gate. Required evidence: A3 traceability, license/provenance review, egress review, installer/permission review, SkillSpector static scan where applicable, local-MCP compliance, rollback path, and human approval. This does not create an exception to the MCP rule: MCPs remain containerized on Hetzner only, with no local stdio MCP servers and no local Node MCPs. Current decisions live in [`docs/54-third-party-agent-tool-gate-2026-06-25.md`](docs/54-third-party-agent-tool-gate-2026-06-25.md).

## 10b. Price-agreement silos (invoice audit)

A negotiated price may meet an invoice line **only** if it passes all four gates. Each is independent; failing any one means no comparison happens.

- **Vendor.** Branch numbers collide across vendors (QXO's numerics overlap ABC's: 113, 249, 304, 412). Never join pricing to a branch by bare branch number — every such join also asserts the vendor (migration 208).
- **Office.** Agreements are office-specific and are never shared between PE offices. The office is resolved from the **invoice's own branch** (`vendor_branches.pricing_territory_office_id`), never from ship-to text and never from the agreement (migration 217). Before this existed, 188 lines were priced out-of-office and $3,212.04 of erroneous claims reached 46 approved credit-memo requests.
- **Time.** `effective_date <= invoice_date`, plus **item-aware** version supersession: among agreements sharing `(office_id, agreement_number)`, the winner is the latest `effective_date` still on or before the invoice date **that actually prices that item**. A newer version supersedes an older one only for the items it carries — a shorter new price list does **not** repeal the prices it omits, so an item the new list drops keeps its last known negotiated price (migration 277). This is the evergreen rule applied per item: **all agreements remain in effect until the vendor provides a new agreement** (Chris, 2026-08-25; active for ABC, SRS and QXO). Getting this wrong is silent — the line does not error, it falls out as No-Price, so the money simply stops being audited. **A price list stays in effect until a new price list supersedes it** — `expiry_date` is documentary, not a gate (Chris, 2026-08-24). That choice is now recorded per agreement in `renewal_mode` (`evergreen` default | `expires`), the gate is wired on all four arms and fires only on `expires`, and `priced_by_expired_agreement` discloses on the audit line when a price came off a lapsed book (migration 270).
- **UOM.** The audit **refuses rather than converts**: `negotiated_price` is emitted only when the units match, otherwise NULL with `uom_mismatch = true`. Where a sheet genuinely prices in a different unit, record `order_uom` + `uom_conversion_factor` on the item rather than loosening the gate. See §10c and [`docs/46-uom-pricing-normalization.md`](docs/46-uom-pricing-normalization.md).

Two consequences that have each already cost real money:

- **Fuzzy matching is always a fallback.** Exact item number → exact/prefix description → colour-key equality → **dimension-guarded** trigram, and only when no exact match exists in the office's governing book. Both vendors now carry the colour arm (migration 268). ABC keeps a trigram tail because 43% of its priced lines depend on it, but it is gated: the book row's numeric tokens must be a subset of the invoice line's, because ABC's failure mode is **dimension blindness, not colour blindness** — ungated, it priced `GAF 12" Cobra Snow Country` off `cobra 9 snow country` at +129%. Both trigram and the colour key strip bare digits as noise.
- **The final tie-break picks the LOWEST price**, which maximises computed variance. Before adding or backdating a book into an office that already has one, **simulate the change and diff which lines move**; confirm nothing is re-homed off an existing agreement onto a cheaper one.

Also: **read the audit through `mv_invoice_audit_line`, never `v_invoice_audit_line`.** The view resolves the governing price with a correlated LATERAL per line and costs ~8.8s, over the 8s `statement_timeout` that `service_role` inherits from `authenticator` — every PostgREST read of it fails, and the surfaces render empty rather than erroring (PEC-241/243, migrations 272–273). The matview refreshes every 15 minutes, so a price-list change is not visible to the audit until the next tick; force it with `REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_invoice_audit_line`.

Also: **credit memos never enter the standard price audit**, and **returns invert the variance sign** — every query presenting a claim filters `extended_price > 0`. Any aggregate shown to a human must be office-scoped; an aggregate that crosses a silo is a reporting bug even when the write path is safe.

### Vendor parity of the audit (read before adding or changing a vendor arm)

The audit runs one eval per vendor, and they may differ **only** where the vendor's own process differs. Every legitimate difference is listed here; anything else is a defect, not a variation.

**Legitimate, documented differences** (docs/81 decisions 13 and open item 1):

| | ABC Supply | SRS | QXO |
|---|---|---|---|
| Agreements on file | office-inherited books | Level 4 price sheet → Richardson TX | **none, ever** |
| Consequence | full audit | full audit | every line valid as billed; No-Price triage is the correct terminal state |
| Invoice source | ABC API (nightly) | CSV upload | CSV upload |
| PDF + OCR line-sum verification | yes | no PDF source exists | no PDF source exists |

**Everything else must behave identically across vendors.** The four gates, the UOM refusal, the lowest-price tie-break, the fuzzy fallback order, the No-Price threshold (`purchases_ytd >= 2` → `agreement_gap_queue`), and the credit-memo claim bar are vendor-agnostic rules. Do not special-case a vendor to make a number look right.

Both vendor arms are now at parity (migration 279) — the two divergences that existed are closed:

1. **Version supersession now runs on every arm.** `price_agreements` (SRS/QXO) previously had no supersession at all: its lateral ordered by `negotiated_price` with no `effective_date` term, so two active versions of one agreement number both stayed eligible and the **cheaper** sheet won regardless of age. It now mirrors ABC's item-aware rule, scoped by vendor + office + agreement number, with a NULL agreement number keyed on `'PA-'||id` so an unnumbered sheet can only supersede itself. Proved in a rolled-back transaction: a v2 that reprices one item **dearer** wins that item (recency beats the lowest-price tie-break *within* an agreement number), while an item v2 omits keeps its v1 price.
2. **Evergreen is one predicate on all four arms.** Every arm now excludes an agreement only when it is explicitly `renewal_mode = 'expires'` **and** has lapsed, written with `COALESCE` so a NULL can never make the predicate NULL and silently drop the row. Note the divergence was never reachable: `renewal_mode` is **`NOT NULL DEFAULT 'evergreen'`** on both `abc_price_agreements` and `price_agreements`, so the fail-open/fail-closed split was code hygiene, not a live bug.

**A negative total is a credit memo, never a payable.** Whatever the vendor flag says — 5 documents carried a negative total without being flagged (4 ABC, 1 QXO, incl. QXO `UX97791` at −$3,723.59) and leaked into the QB export. A negative-total document routes to credit-memo reconciliation against its original invoice, or a **CM TBD** line where the original is not yet identified: `v_credit_memo_tbd` (migration 280), cross-vendor. Derive this from the amount; never write the flag onto the mirror, because the nightly vendor sync overwrites it.

**The QB bank export is one file per vendor.** ABC, SRS and QXO each keep a **separate QB bank register**, so a mixed-vendor export would post one vendor's invoices into another's register. `scripts/build-inv-processed-weekly.mjs` writes `INV-PROCESSED-[vendor]-[date].csv` per vendor and refuses to emit a mixed file or a non-positive row. This supersedes docs/81 decisions 2 and 14 and restores the docs/63 contract (Chris, 2026-08-25).

**When adding a vendor arm, port all four gates plus item-aware supersession.** A new arm that reaches an agreement by a different table is still bound by the same rules; verify with a rolled-back transaction that a newer version wins the items it prices and an omitted item keeps its prior price.

Full contract: [`docs/105-price-agreement-silo-rules.md`](docs/105-price-agreement-silo-rules.md).

## 10c. UOM & pricing normalization (the unit every comparison happens in)

§10b decides *which* agreement price may meet a line. This decides *what unit* the comparison happens in. Read it before touching any price comparison.

**ABC ships every line in two units at once** — 99 BD and 33 SQ at 3 BD/SQ are the same shipment. Agreements are quoted in the **pricing** unit (`priceQty.uom`, e.g. SQ). The legacy `quantity`/`uom` columns were ingested inconsistently — usually from `priceQty`, but ~8.5% of lines from `shippedQty` — so one shingle SKU stored $46.50 (per bundle) on some invoices and $132 (per square) on others, and `effective_unit_price` inherited the inconsistency because it is derived from them. Order audits did no UOM handling at all, producing live variances of −80% to −100% that were pure artifacts.

- **One canonical effective price:** `extendedPriceAmount ÷ priceQty.value`, materialised as `abc_invoice_lines.price_per_uom`. Derived from `raw`, so it is immune to how any ingest writer fills the legacy columns.
- **Orders convert through `v_item_uom_map`** (`item_number → ship_uom, price_uom, units_per_price_uom`), because orders carry no `priceQty`: `effective price = unit_price × units_per_price_uom`.
- **Never compare on** `quantity`, `uom`, `unit_price`, `effective_unit_price`, or `raw.pricePerUnitAmount`. They are per-stocking-unit or inconsistent.
- **Never fabricate a variance across mismatched units.** Compare only when `price_uom` equals the agreement's unit; otherwise the variance is NULL and the line carries `uom_mismatch` — surfaced as a "Review (UOM)" badge, not a fake number. This is the same refusal §10b lists as its fourth gate.
- **Any new pricing surface reads `price_per_uom` / `v_item_uom_map`**, never the legacy columns.

Where a price sheet genuinely quotes in a different unit from the invoice, record `order_uom` + `uom_conversion_factor` on the agreement item rather than loosening the gate — e.g. Malarkey Vista, sheet in BD, invoice in SQ, manufacturer-stated 3 BD/SQ (migration 266).

Migrations **119–122** (2026-06-19). Full contract: [`docs/46-uom-pricing-normalization.md`](docs/46-uom-pricing-normalization.md).

## 11. Design system (one source of truth for every visual asset)

- Every visual asset the brain produces — web copy with styling, Property Cards, graphics, decks, dashboards, agent-app/Slack surfaces — follows **one** design system. The format is **DESIGN.md** (Google Labs, Apache-2.0), vendored at `standards/design/vendor/design.md/` so the brain is self-contained.
- The **live brand tokens** live in `config/brand/DESIGN.md` (brand identity is per-client → customization surface, §9). It is the source of truth: tokens are normative, prose is rationale. When an asset disagrees with the brand file, the brand file wins.
- The **contract** is `standards/design/v1.md` — QC owns it, Auditor enforces it. Brand file must lint with **zero errors** (`scripts/lint-design.sh`) before any change ships. Assets use **only** tokens from the brand file — no hard-coded hex, off-palette fonts, one-off radii, or bypass CSS custom properties. A value needed repeatedly is promoted to a token, not search-and-replaced.
- **Role discipline is the brand.** Each brand color keeps its single role (CTA color on interactions only; never decorative). Monospace tokens appear on Property Card surfaces only. Typeface phase migrations happen only when the brand file's tokens change (the token update is the trigger).

## 11a. Long-list disclosure (app-wide)

- Any work surface that can render an unbounded list opens showing **10 rows**, with the rest behind a `Show all N …` control. Revealing them keeps the pane **exactly 10 rows tall** so the list scrolls internally and the page does not grow.
- The pane is the **same height collapsed and expanded**. Collapsed it holds its 10 rows so no scrollbar appears and the wheel unambiguously belongs to the page; the wheel only changes owner as the direct result of a click.
- Pane height is **measured** (`header + rowHeight × 10 + scrollbar gutter`), never hardcoded. Reveal state persists per surface in `localStorage`. Filters apply **before** paging.
- Full contract, including the sticky-header rules a bounded pane forces (`overflow-x: auto` never with `overflow-y: visible`; measured multi-row header offsets; frozen-column selectors scoped to `thead tr:not(.fw-grouprow)` / `tbody`; column-group `colspan` recomputed on expand): [`standards/design/v1.md`](standards/design/v1.md) § Long-list disclosure.

## 12. Workspace front desk and GSD loop

- **Maintenance/Hermes owns orientation.** Agents should read `agents/horizontal/maintenance/WORKSPACE-MAP.md` before broad repo search. If the map is stale, flag Maintenance.
- **Moves are governed.** File relocation requires a move manifest with `from`, `to`, `lane`, `reason`, `owner`, and `status`. Raw imports, nested Git repos, and likely client-private files require human/QC review before moving.
- **No cron job moves files by itself.** Workspace inventory and conformance checks are dry-run until a manifest row is approved.
- **GSD Core is the app-build operating loop.** App/product work follows Discuss -> optional UI design -> Plan -> Execute -> Verify -> Ship. GSD artifacts may assist planning, but the 13-agent workforce and this repo's trust/security boundaries still govern behavior.
- **One task, one worktree.** `.worktrees/` is local-only. Agents must keep their assigned absolute path as the boundary and stage only files belonging to the current task.

## 13. Session wrap-up & agent alignment (the handoff contract)

This is the **canonical** end-of-session procedure for every harness (Claude Code, Codex, Cursor, and any future tool). Each harness's own instruction file (`CLAUDE.md`, `AGENTS.md`, `.cursor/rules/`) carries the trigger and a pointer here; this section is the source of truth.

**Trigger.** When the user says *"handoff"*, *"wrapup"*, *"wrap up"*, *"end of session"*, *"tie off"*, or invokes `/wrapup` — or when context usage reaches ~50% — run the checklist in order and do not stop until the working tree is clean and converged. Goal: the next session starts on a clean, current canonical branch and immediately knows where work left off.

1. **Finish the block.** Never stop mid-function/migration/component. Complete it, then commit completed work with a clear message.
2. **Clean the tree — `git status --short` must end empty.** Gitignore scratch/logs/byproducts (`*.log`, scratch `*.txt`, tool dirs, `* 2.*` editor/sync duplicate copies); `git rm --cached` anything tracked that should be ignored (logs, build output); delete empty/accidental files; commit anything that is real content. Never commit secrets or raw client/PII data (§4, hard rule 2) — ignore those buckets. When a non-scratch file's fate is unclear, ask rather than ignore/delete it.
3. **Update memory.** Write today's daily-log session block (`context/memory/{YYYY-MM-DD}.md`); update `context/MEMORY.md` (≤2,500 chars) and `context/USER.md` (≤1,375) only if something durable changed. Route curated writes through `meta-memory-write`.
4. **Converge (Live ⇄ Dev).** `git fetch origin`, confirm the canonical/live branch (do **not** assume `main`), merge the `contrib/cleverwork/<task>` branch into it, and **push to origin**. Never strand work on an unpushed side branch.
5. **Agent alignment.** Before reporting, verify every harness instruction file carries the same instruction set. If a rule, hard rule, memory budget, or this procedure changed, propagate the change to **all** of: `CLAUDE.md`, `AGENTS.md`, `CONVENTIONS.md` (this file — the source of truth), and `.cursor/rules/*.mdc`, plus any new harness file the team has added since. Commit the alignment in the same wrap-up. The harness files may differ in framing but must never contradict each other or this section.
6. **Report and stop.** One message: branch + last commit (hash — msg), `tree clean ✓`, what was accomplished, the exact next task, blockers needing the user. Then stop — do not start the next task.
