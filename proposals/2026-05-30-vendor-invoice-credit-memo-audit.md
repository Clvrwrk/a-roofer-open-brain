# A3: Vendor Invoice Credit Memo Audit

Proposed by: Chris
Date: 2026-05-30
Status: pending
Affected clients: pro-exteriors
A3 file: proposals/2026-05-30-vendor-invoice-credit-memo-audit.md

---

## 1. The problem (measured)

- **Task being performed today:** validating vendor invoice line items against negotiated pricing agreements, identifying overcharges, and requesting credit memos.
- **Frequency:** pending baseline from accounting/vendor invoice volume.
- **Time per occurrence:** pending baseline.
- **Error rate:** pending baseline; suspected high-value miss pattern because invoices can be paid against incorrect vendor pricing.
- **Cost of error:** direct cash leakage equal to invoice overcharge not recovered, plus follow-up/rework time.
- **Total monthly human cost:** pending baseline.

Required baseline inputs:

- Monthly invoice count by vendor.
- Average line count per invoice.
- Number/percent of invoices with price discrepancies.
- Average credit memo value per discrepancy.
- Current time to detect, request, and close a credit memo.
- Current percentage of credit memo requests not followed up within one week.

---

## 2. Root cause (5 Whys — brief)

1. Why does this task consume human time?
   — It requires line-level comparison between invoices, negotiated agreements, product identity, UOM, branch/region, and effective dates.
2. Why is it not already automated?
   — Product catalogs, vendor crosswalks, UOM conversions, negotiated price agreements, and invoice lines are not yet governed as one complete pricing system.
3. Why are the existing tools inadequate?
   — Vendor invoices and negotiated pricing agreements are not automatically reconciled one line at a time with approval-ready credit memo drafts.
4. Why has this not been a Cleverwork priority until now?
   — The first Open Brain scaffold focused on memory and agent architecture; Pro Exteriors has now identified cash recovery as the urgent first workflow.
5. Why now?
   — ABC is already in scope, eight additional vendors/benchmarks are coming, and PE needs multi-metro negotiated pricing discipline on a six-month cadence.

---

## 3. Proposed solution

- **Which agent receives this skill:** `@ob-accounting`, supported by `@ob-ops` in Product Catalog Manager mode, Auditor, and Conductor.
- **What the skill does:** ingest/normalize product catalog data, negotiated pricing agreements, and vendor invoice line items; propose product equivalency matches across vendor SKUs; route uncertain matches to Slack for human approval; match invoice lines to approved catalog/price-agreement records; detect overcharges; calculate expected credit memo amounts; draft one internal "Credit Memo Request Email" per invoice; route it to Lucinda in Slack for review; create and monitor follow-up tasks until credit memo receipt.
- **Integration required:** Supabase vendor/product/pricing/invoice tables; PDF/CSV vendor portal ingestion scripts; Slack internal review; future vendor data imports.
- **Trust tier of output:** evidence for discrepancy packets; inference for product equivalency candidates until approved; instruction only for human-approved negotiated price agreements and catalog mappings.

---

## 4. The new state (projected)

- **Time per occurrence post-skill:** pending baseline; target is human review only.
- **Error rate post-skill:** pending pilot measurement.
- **Cost of agent operation per occurrence:** expected low; mostly database queries, deterministic comparison, and one draft email.
- **Required human review:** yes. Lucinda reviews every credit memo request before any external email is sent.

---

## 5. The math

| Item | Value |
|---|---|
| Total monthly cost, current state (X) | pending baseline: unrecovered overcharges + human detection/follow-up time |
| Total monthly agent operating cost, new state (Y) | pending pilot estimate |
| One-time build cost (Z) | pending scope after data map |
| Build cost amortized over 12 months (Z/12) | pending |
| **ROI multiplier: X / (Y + Z/12)** | **pending; must be >= 10 or qualify as high-error-cost recovery** |
| Payback period | pending |

**Exempt from 10x gate?** Potentially, if measured unrecovered overcharges show high-error-cost cash leakage. Otherwise this must clear the standard 10x gate.

---

## 6. Risks

- **What breaks if this skill misbehaves?**
  — False discrepancy claims damage vendor relationships; missed discrepancies leave cash unrecovered; bad product equivalencies corrupt catalog trust; wrong regional zone applies the wrong negotiated agreement.
- **Rollback path:**
  — Disable the audit runner; keep all draft packets and audit logs; no external communications are sent by agents, so rollback is operationally clean.
- **Trust tier of output:**
  — Product equivalency candidates are inference until approved. Negotiated agreement records are instruction only after human approval and source-document attachment. Invoice discrepancy packets are evidence after Auditor pass.
- **New consent flags required?**
  — No customer consent flags expected. Vendor/accounting sensitivity flags may be required for access control.
- **New standards checks required?**
  — Yes. Accounting standard needs credit memo packet checks: one invoice per request, source agreement attached, UOM verified, date range verified, discrepancy math verified, no external send by agent.

---

## 7. Alternative considered

- **Leave it human:**
  — Revisit only if baseline shows invoice volume and overcharge recovery are too low to justify automation.
- **Defer until condition X:**
  — Defer only if negotiated pricing source documents or invoice line-item data are unavailable.

---

## 8. Decision

- [ ] **Approve** — build by [YYYY-MM-DD]; pilot client: pro-exteriors
- [ ] **Kill** — reason: [text]
- [ ] **Defer** — revisit at: [YYYY-MM-DD], condition: [specific measurable condition]

Approver: Chris + Lucinda
Approved / decided on: YYYY-MM-DD

---

## 10. Initial scope details

### Vendors

Negotiated / supplier vendors:

- ABC Supply
- SRS Distribution
- QXO
- Beacon Building Products
- Gulfeagle Supply
- RWC Building Products
- Mid-Atlantic Roofing Supply

Retail benchmark only:

- Home Depot
- Lowe's

### Ingestion model

- Price agreements arrive as PDFs and are ingested into Supabase price agreement tables.
- Extracted pricing is logged into the product file.
- Vendor invoices currently arrive through a manual ABC portal workflow: Lucinda orders monthly invoice exports, receives an email with a CSV and ZIP of invoice PDFs, forwards it to Chris, and Chris asks Claude/Codex to ingest the batch into Supabase.
- The first build should replace that ad hoc handoff with a tracked batch intake process in Supabase. The workflow state should live in Supabase only.
- Invoice audit observations update product-level min, max, and median price intelligence.

### Human approval model

- Product Catalog Manager proposes best-match product equivalencies across vendor SKU/name differences.
- Human approval via Slack is required before product equivalencies become instruction-grade.
- Lucinda receives credit memo request drafts in a dedicated accounting Slack channel.
- Agents never send vendor-facing emails.

### Region model

- `regions` represents PE branch-level price zones.
- `abc_regions` represents the ABC/vendor-level region mirror.
- The first build must confirm and enforce the matching identifier that connects PE regions to vendor regions.

---

## 9. Post-build tracking (completed after pilot)

*Fill in after 2-week pilot period.*

- Actual time per occurrence post-skill: [minutes]
- Actual error rate: [%]
- Actual credit memo dollars recovered: [$]
- Actual ROI multiplier: [X_actual / (Y_actual + Z/12)]
- Promoted to template-default: [Yes / No / Pending]
- QC observation: [Pass | Revise | Kill]
