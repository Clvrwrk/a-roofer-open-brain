# 40 — Price Agreement Builder (Item 3) — build plan

Vendor-agnostic builder that produces, per branch, a negotiated price-agreement
package (PDF + CSV + magic link) when opening/renewing a branch. Foundation mapped
+ adversarially validated by an 11-agent workflow on 2026-06-18; corrections from
the validation layer are baked in below.

## Locked decisions (Chris, 2026-06-18)
- **Curation rule:** negotiable set = ABC **review-class A+B**, shown as **top-level
  families** (~454) that expand to SKU/color variations (857 SKUs total, ~87% of the
  $6.14M 36-mo spend). `family_id` is the grouping key (fall back to `item_number`).
- **Package grain:** **per branch**.
- **Prefill:** branch negotiated price → else **last invoiced unit price at the PE
  office if < 60 days old** → else **0**. No region/national fallback.
- **Recipient:** **Justin Garza** (`Justin.Garza@abcsupply.com`), the ABC **national
  account manager**, for ALL PE offices.
- **Magic-link TTL:** **7 working days**, normalized to expire at **06:00** (e.g. email
  Monday → link expires the following Wednesday 6 AM).
- **First-deployment comms rule (HARD):** an agent sends **zero email outside the
  company**. The agent drafts the package + PDF/CSV + magic link and notifies
  **Lucinda/Roberto** internally (Slack and/or internal AgentMail). The external send
  to Justin is a **human action from Hermes / Google Workspace** (`agents.proexteriorsus.net`,
  where all vendor/outside email is directed). Enforce with a code-level outbound
  allowlist (internal domains only); external recipients are blocked → draft.

## Validated facts (corrections applied)
- Negotiable master lives in `abc_product_catalog` (`review_class`, `family_id`,
  `family_name` [75.6% populated, used as display fallback], `uoms` jsonb, `spend_36mo`).
  Exposed as `v_negotiable_items` (schema 109).
- **Coverage is thin + uniform:** every branch inherits the same central agreement, so
  only ~66 of 857 A+B SKUs are negotiated anywhere (~8%). 791 need negotiating.
- Modern vendor-agnostic tables exist but are small: `products` (682), `product_color_variants`
  (220), `price_agreements` (7 uuid), `price_agreement_items` (317, with `product_id`/`color_variant_id`).
  Too sparse to source the ~500 — so the builder keys on `item_number`/`family_id` (catalog grain)
  and links to `products` only where a mapping exists.
- Contacts: `vendor_branches.manager_email` = **94/756** populated; `sales_rep_email` = **0/756**
  (genuine gap). **No `manager_json` column** (flat `manager_name`/`manager_email` only).
- Agreements: **1 active, 1 expiring, 4 expired** (not "all expired").
- Drafted-email queue already exists: `price_refresh_request` (schema 95/105) — reuse it,
  don't reinvent. Enforced pattern: agents draft, humans send (`lib/human-unblocker.ts`,
  `api/price-agreement/request-renewal.ts`).
- No PDF lib in `package.json` yet (offline `build-proposal-pdf.py` exists). No magic-link/
  tokenized-submission route yet; only `/auth/*` + the agentmail webhook are unauthenticated.

## Slice sequence
1. **DONE (commit dbafa9a)** — read-only per-branch builder: `v_negotiable_items` (109),
   `lib/agreement-package.ts`, `pages/accounting/price-agreement/builder.astro`,
   `scripts/agreement-builder-tree.ts`, nav. Family tree, branch picker, prefilled prices.
2. **DONE (commit 158d728 + 9f5a71c)** — editing + persistence: schema 110
   (`agreement_packages` / `agreement_package_items` + `v_recent_invoice_price` for the
   prefill fallback). Editable price per variation; family-level "Set all" cascades to
   non-overridden variations; a variation edit sets `is_override`. `POST
   /api/price-agreement/package/items` (auth-gated) get-or-creates a per-branch draft and
   upserts changed items. Recipient = Justin Garza. Adversarially reviewed + fixed.
3. **DONE (commit 85ccba7 + 9f5a71c)** — PDF + CSV export. `pdf-lib` (pure JS); GET
   `/api/price-agreement/package/{pdf,csv}?branch=` (auth-gated). PDF = header (branch,
   prepared-for Justin Garza, DRAFT note) + family-grouped Item/Desc/UOM/Prior/Proposed
   table, paginated (35pp for a full branch). CSV ends with a blank `vendor_final_price`.
   v1 uses a clean vendor-neutral table (exact ABC ledger fidelity deferred unless Chris needs it).
4. **TODO — drafted handoff (human-gated, zero external send)** — package →
   `price_refresh_request` draft (`reason='agreement_package'`, `status='awaiting_verification'`),
   attach PDF/CSV. Notify **Lucinda/Roberto** internally (Slack + internal AgentMail). The send
   to Justin is a **human** action from Hermes/Google Workspace. Add the outbound allowlist guard.
5. **TODO — magic-link submission** — `agreement_package_submissions` (append-only, `magic_token`
   NULL until a human approves), unauthenticated `/submit-agreement/[token]` (TTL = 7 working days
   @ 06:00; add to middleware public allowlist) for Justin's per-line final prices + approve/revise/reject.

## Human-gated boundary (never auto-send)
Email drafts only (`awaiting_verification` → human sends). Magic-link `magic_token` issued only
when a human moves `delivery_status` draft→approved. All builder/export/draft endpoints require an
authenticated actor; the only unauthenticated surface is the single-token submission page. No
outbound-email capability is added (consent boundary, CLAUDE.md rules 5/6).

## Open questions for Chris (before slices 2-5)
1. **Recipients:** `sales_rep_email` is 0/756 and `manager_email` only 94/756 — is branch-manager-only
   acceptable for v1, or must regional-rep emails be sourced first? Which `fyi_emails`?
2. **Magic-link lifetime** (proposed 30 days) and reuse policy (single-claim vs multi-visit-before-claim).
3. **Prefill scope:** "latest agreement price" = branch-only (current), or fall back to region/national
   when no branch-level price exists (would lift the ~8% prefill rate)?
4. **PDF fidelity:** must it match the ABC two-column ledger exactly, or is a clean vendor-neutral
   single-column table fine for v1?
