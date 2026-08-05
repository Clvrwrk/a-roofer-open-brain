# 79 — QXO + SRS Vendor Invoice Onboarding Plan (2026-08-04)

**Status:** PROPOSED — awaiting Chris's sign-off on the decision points in §2.
**Goal:** QXO and SRS Distribution invoices flow through the same validation → disposition → payment/register pipeline as ABC Supply, visible per-vendor and per-location in the Command Center invoice audit tool (`/accounting/invoice-audit`). Neither vendor has an API — intake is **CSV/PDF uploads** (emails + invoice documents).

---

## 1. Where we start (verified 2026-08-04 against prod `rnhmvcpsvtqjlffpsayu`)

```
                         ALREADY VENDOR-NEUTRAL                    ABC-ONLY (the work)
             ┌────────────────────────────────────┐   ┌─────────────────────────────────────┐
             │ vendors (QXO + SRS rows seeded)    │   │ abc_invoices / abc_invoice_lines    │
             │ vendor_branches / office / regions │   │  └ generated UOM cols over ABC raw  │
             │ disposeInvoice() decision engine   │   │ v_invoice_audit_line + cascade views│
             │ invoice_line_audit (append ledger) │   │ v_item_uom_map, v_recent_invoice_…  │
             │ invoice_payment_processed (vendor  │   │ ship_to → branch → office resolution│
             │  col) + invoice_register_export    │   │ invoiceVendor() = "ABC Supply" const│
             │ per-vendor CSV batch machinery     │   │ abc_price_agreement_branch_matches  │
             │ ingest_price_list_observations RPC │   │ v_branch_item_api_price (api tier)  │
             │ Slack + AgentMail intake, storage  │   └─────────────────────────────────────┘
             │ PDF→stage→trigram→review pattern   │
             └────────────────────────────────────┘
```

Key facts the plan builds on:

- `vendors` already holds **QXO** (`slug=qxo`) and **SRS Distribution** (`slug=srs`), seeded 2026-05-21, no account numbers yet. `vendor_branches` has 756 ABC branches, **0** for QXO/SRS. Bridge skeletons exist at `integrations/bridges/qxo/` and `integrations/bridges/srs-roofhub/` (docs only, `enabled: false`).
- The Command Center audit UI (tree, filters, KPIs, disposition engine, comms, payment/register batching) is **~90% vendor-agnostic**. Batching already groups by vendor and emits one CSV per vendor; `invoice_payment_processed` and `invoice_register_export` already persist a `vendor` column; the single classifier seam is the `invoiceVendor()` constant in `app/command-center/src/lib/invoice-payment.ts:112`.
- The **SQL audit-view layer is 100% ABC-coupled** (~10 views across migs 99/119/120/122/124/126/134/154–161 hard-join `abc_*` tables). This is the core of the work.
- The **deepest coupling**: `price_per_uom`, `price_uom`, `ship_qty` etc. are *generated columns* over ABC's exact `raw` JSON shape (`priceQty`/`shippedQty`/`extendedPriceAmount`). Every audit view sits on `price_per_uom` being non-null.
- **There is no committed CSV invoice loader anywhere** — ABC's own CSV path (AR import, `abc_invoice_lines_full`) was one-off ad-hoc SQL. QXO/SRS get the first real one, as committed code.
- The cascade's `api` benchmark tier has no analog for a no-API vendor: QXO/SRS collapse to `negotiated → recent → none`. Expect a higher share of `accept-nochallenge` (coverage-gap) dispositions until agreements are loaded.
- The `gate-negotiated` human gate (negotiated overcharge ⇒ stays pending ⇒ invoice cannot reach payment export) is the safety rail that makes an immature pipeline safe to turn on day one.

**Known collision hazard:** `invoice_line_audit`, `invoice_documents` (partially), and several views key on bare `invoice_number`. A QXO invoice number can collide with an ABC one. The plan adds a vendor discriminator at every keying point (additive columns; hard rule 1 respected).

**Slug mismatch to fix:** DB says `srs`; `vendor-territories.ts` planned-vendor entry says `srs-distribution`. Standardize on the DB (`srs`) and update the map code.

---

## 2. Decision points for Chris (answer these, everything else proceeds)

1. **Sample files (blocking).** I need 2–3 months of real QXO and SRS invoice documents — per vendor: invoice PDFs, any CSV/XLSX export the branch or portal can produce, a statement/AR aging if available, and 2–3 of the actual emails they arrive in. Parser design starts from these, not from guesses.
2. **Generic tables vs per-vendor tables.** Recommendation: **one generic family** — `vendor_invoices` / `vendor_invoice_lines` keyed `(vendor_id, invoice_number)` with *real* (loader-computed, not generated-over-raw) canonical UOM columns — rather than `qxo_*` + `srs_*` clones. Matches the "normalize once, map many" doctrine; ABC stays where it is and is UNIONed in at the view layer.
3. **Intake front door order.** Recommendation: **(a)** AgentMail inbound email (forward vendor emails to a dedicated address) and Slack `#accounting-vendor-intake` first — both are live, byte-verified, durable; **(b)** a proper upload page in the Command Center as Phase 5 (there is currently *no* upload UI in the app at all). Confirm the email-forwarding workflow works for Lucinda's team.
4. **Do negotiated agreements exist for QXO/SRS?** If PE has signed pricing agreements with either vendor (PDFs), the negotiated tier lights up via the existing `ingest_price_list_observations(vendor_slug)` RPC + staging/review pattern. If not, lines will benchmark against `recent` (own history) only, and the audit is a drift-watch rather than a contract-compliance check until agreements land.

---

## 3. Target architecture

```
 email (AgentMail) ─┐
 Slack #accounting-vendor-intake ─┤──► vendor_invoice_uploads (file registry: vendor_id,
 CC upload page (Phase 5) ─┘        storage_path, sha256, source, parse_status)
                                        │
                                        ▼
                       per-vendor parser (committed code, integrations/bridges/{qxo,srs-roofhub}/)
                        CSV → rows directly; PDF → pdftotext → regex; scan → Unstructured.io OCR
                                        │
                                        ▼
                    vendor_invoice_staging (+ parse review queue, confidence tiers
                       exact / high / review / none — same pattern as price_list_pdf_staging)
                                        │  human promotes 'review'; exact/high auto-promote
                                        ▼
        vendor_invoices (vendor_id, invoice_number, branch_key, office_id, order_name,
                         customer_po, invoice_date, totals, ar_status…)
        vendor_invoice_lines (vendor_id, invoice_number, line_key, item_number, descr,
                         ship_qty, ship_uom, price_qty, price_uom, price_per_uom ← loader-computed)
                                        │
                                        ▼
        v_all_invoices / v_all_invoice_lines  =  ABC (mapped) UNION vendor_* (native)
                         └─ every audit view repointed here, vendor_slug as a dimension
                                        │
              ┌─────────────────────────┼──────────────────────────┐
              ▼                         ▼                          ▼
   v_invoice_audit_line(+cascade)   AccuLynx job match         benchmarks:
   vendor-aware; api tier only      (PE {OFFICE}-{num} naming   negotiated (agreements via
   where a feed exists              is PE's convention — works  vendor-slug RPC) → recent
              │                     for any vendor's order_name) (per-vendor) → none
              ▼
   disposeInvoice()  →  invoice_line_audit (+ vendor_slug col)  →  same gates, same SOP
              ▼
   payment/register batches — already per-vendor; emits qxo-…-to-be-paid.csv etc.
```

UOM contract for new vendors: the **loader** computes `price_per_uom = extended_price ÷ price_qty` and records the vendor's pricing UOM at load time, with a load-time validation queue for lines where qty/price can't be resolved (never a NULL that silently drops out of audit — docs/46 discipline, enforced at ingest instead of via generated columns).

Item identity: `vendor_item_map (vendor_id, vendor_item_number, description, uom_map, product_id?)` — crosswalk into the canonical `products` catalog by `manufacturer_sku` where possible; unmapped items still audit (recent-price benchmark keys on the vendor's own item number), mapping improves cross-vendor price comparison (`v_best_vendor_price`) over time.

---

## 4. Phases

### Phase 0 — Inputs & seeds (blocked on §2 answers; ~half a day once samples arrive)
- Collect sample files; catalog each vendor's invoice fields → write `mapping.md` in each bridge folder (skeletons exist).
- Fill `vendors` rows: account numbers, cc_emails, primary contacts. Fix the `srs` slug mismatch in `vendor-territories.ts`.
- Seed `vendor_branches` for the branches PE actually buys from (start with the handful on the sample invoices; drive-time territory assignment via existing mig-70 machinery → `pricing_territory_office_id`).

### Phase 1 — Schema (migration ~186+; additive only)
- `vendor_invoice_uploads`, `vendor_invoice_staging`, `vendor_invoices`, `vendor_invoice_lines`, `vendor_item_map` (+ indexes, RLS/grants mirroring mig 127).
- `ADD COLUMN IF NOT EXISTS vendor_slug` (default `'abc-supply'`) to `invoice_line_audit`; include vendor in the current-state view keys. Backfill-free (default covers history).
- `v_all_invoices` / `v_all_invoice_lines` union views with `vendor_slug` discriminator. ABC output must be **byte-identical** to today — verified by a parity diff query before anything repoints.
- Commit reference DDL for the new tables in `schemas/cleverwork-roofer/` (unlike the abc_* tables, which have no committed DDL — don't repeat that debt).

### Phase 2 — Ingestion (the new build)
- One loader per vendor under its bridge folder (`ingest-invoices.mjs`): reads a file from `vendor_invoice_uploads`, parses (CSV native; PDF via pdftotext; OCR fallback), writes staging with confidence tiers, promotes exact/high, queues the rest for human review.
- Wire intake: AgentMail webhook route + Slack `#accounting-vendor-intake` handler tag files to a vendor (sender domain / channel prefix / explicit tag) and register them in `vendor_invoice_uploads` with SHA-256.
- Run ledger rows in `abc_api_sync_runs`-style bookkeeping (reuse the table or a `vendor_ingest_runs` sibling) so Aug-2-style silent stalls are visible.

### Phase 3 — Benchmarks
- If agreements exist: ingest via `ingest_price_list_observations(p_vendor_slug)` + the mig-139 staging/trigram/review pattern → negotiated tier per branch.
- Per-vendor `recent` benchmark: generalize `v_recent_invoice_price` over `v_all_invoice_lines` keyed `(vendor_slug, item_number, branch_key, price_uom)`.
- No `api` tier for QXO/SRS — deliberate, documented; cascade = negotiated → recent → org_inv (credit memos) → none.

### Phase 4 — Audit view layer (the biggest chunk, all SQL)
- Rewrite the mig-120/126/154 family to read `v_all_*` with `vendor_slug` threaded through `v_invoice_audit_line`, `v_invoice_audit_line_cascade`, `v_invoice_audit_invoice`, summary matview (156/161 perf work re-checked).
- Office resolution: ABC keeps branch→territory logic; QXO/SRS use `vendor_invoices.office_id` (loader-assigned from branch registry, falling back to the `{OFFICE}-` prefix on the job name — mig 163's `v_pe_job_label_parse` is vendor-neutral already).
- Parity gate: ABC KPI totals and tree counts before vs after must match exactly on prod data before the app repoints.

### Phase 5 — Command Center app
- Thread `vendor` as a scope dimension following the `AuditMode` precedent — but generalize mode+vendor into one scope object rather than a third parallel param; cache keys become per-(mode, vendor) to avoid cross-vendor cache bleed.
- Mechanical fixes: `invoiceVendor()` reads the row's vendor; CSV vendor cell; `batches.ts` fallback; "Reconcile with ABC AR" label becomes vendor-aware; vendor `<select>` next to the office filter + `vendorOk` gate in the tree script; `run-disposition` vendor scope filter.
- New **upload page** (`/accounting/vendor-uploads`): drag-drop → `invoices` bucket → `vendor_invoice_uploads` → parse status + review queue surface. First real upload UI in the app.
- Reconciliation: no AR feed for QXO/SRS → the existing manual `confirm-paid` flow is the fallback; statement-CSV import as a later enhancement.

### Phase 6 — Rollout (production-gating rule)
1. Sandbox-prove loaders on the sample set; parity checks green.
2. Turn on **one vendor** (whichever has better samples), **one office**, human gate on *all* dispositions (auto-accept tiers disabled) for the first weekly cycle.
3. Lucinda/Alex review the first disposition batch → enable the auto tiers → widen offices → enable second vendor.
4. Every widening step is a human-approved scope step; the agent ships each deploy with change/impact/rollback stated.

---

## 5. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Vendor invoice formats vary by branch/portal export | Staging + confidence tiers + human promote gate; parser fixes are cheap once staged rows are durable |
| UOM ambiguity in QXO/SRS docs (no `priceQty` equivalent) | Loader-side UOM validation queue; never emit NULL `price_per_uom` silently (docs/46 rule) |
| `invoice_number` collisions across vendors | `vendor_slug` discriminator added everywhere the bare number is a key (Phase 1) |
| ABC audit regression while repointing views | Parity diff gate in Phases 1 & 4 before app cutover |
| Coverage-gap disposition volume (no api tier, thin agreements) | Expected & routed to the existing Jordan queue; agreements ingest (Phase 3) shrinks it |
| Repeat of ABC's ad-hoc CSV debt | All loaders are committed code with run-ledger rows from day one |

## 6. Explicitly out of scope (this pass)
- QXO/SRS **order** mirroring (no API; invoices are the audit unit).
- Catalog cycle-counting / change-log machinery for the new vendors (API-dependent).
- Automated AR reconciliation for QXO/SRS (manual confirm-paid until statement imports exist).

## 7. Ops note (unrelated but open)
The ABC nightly (`openbrain-abc-sync.timer`, host 5.78.146.161) last ran **2026-08-02**; Aug 3–4 runs are missing. Needs a host-side `systemctl`/journal check before the next audit cycle trusts freshness.
