# A3: AccuLynx estimate lines and job documents (CRM Job profile)

Proposed by: Chris (Phase 4 of the CRM profile pages, CRM `docs/delivery/PROFILE-PAGES.md`)
Date: 2026-10-01
Status: pending
Affected clients: pro-exteriors
A3 file: proposals/2026-10-01-crm-acculynx-estimate-lines-and-documents.md

---

## 1. The problem (measured)

- **Task being performed today:** seeing what was sold on a job (line items of the approved estimate or contract worksheet) and which documents were collected. The Job profile shows estimate headers and two "Not connected" panels; everyone opens AccuLynx.
- **What the brain holds (measured, 2026-10-01):**
  - `acculynx_estimates`: 445 rows on 390 jobs across 7 accounts, synced hourly — but **`title` and `total_price` are NULL on all 445**, and `raw` holds only `{id,isPrimary,job,_link}`. The sync sweeps `GET /estimates` (stubs) and never calls the detail endpoint ("Phase 3 enrichment" was never built). **The Job profile's estimate headers therefore render untitled with no total today — a live defect, independent of this A3.**
  - Estimates are lightly used: only **109 of 1,084** jobs with an approved value have any AccuLynx estimate. The contract worksheet (`GET /financials/{id}/worksheet`, sections + items) is the better source for approved line detail; `acculynx_job_financials.raw.worksheet` holds only a link today.
  - **Documents: no read path exists.** AccuLynx V2 offers only `POST /jobs/{jobId}/documents` and document-folder settings — no list, download or signed-status GET, no file webhook (confirmed against `apidocs.acculynx.com/llms.txt`, 2026-10-01; our 2026-06-09 request to AccuLynx is still open).
- **Frequency / time:** **not measured.** *Estimate for the math:* 20 look-ups a week × 4 minutes to open AccuLynx and find the worksheet.
- **Total monthly human cost (estimate):** 20 × 4 / 60 × 4.3 = 5.7 h × $65 = **$373/month**.

## 2. Root cause (5 Whys)

1. Why manual? — Line detail and documents exist only in the AccuLynx UI.
2. Why not mirrored? — The sync stopped at list stubs; documents have no API.
3. Why are existing tools inadequate? — AccuLynx shows one job at a time; the brain's estimate and invoice audits (docs/41, 81) need line-level data that the sync does not fetch.
4. Why not a priority until now? — No surface showed it.
5. Why now? — The Job profile shows empty estimate headers and two "Not connected" panels.

## 3. Proposed solution

- **Lines (feasible):** extend the AccuLynx sync (read-only GETs) to fetch estimate detail (`GET /estimates/{id}?includes=sections`, then items) and the financial worksheet per job; additive tables `acculynx_estimate_sections`, `acculynx_estimate_items` (or worksheet items) and a header backfill (`title`, `total_price`). Initial load ≈ 445 × 3 calls (minutes) plus ≈ 7,000 worksheet calls (~15 minutes per key at 8 requests/s), then incremental on `ModifiedDate` or the `approvedjobvaluechanged` webhook. A CRM reader and a line-detail panel on the Job profile's approved estimate.
- **Documents (not feasible through AccuLynx today):** keep "Not connected", with a deep link to the AccuLynx job. Revisit when AccuLynx adds a read endpoint, or through the CompanyCam documents mirror (624 documents, docs/120) under its own decision.
- **Integration required:** AccuLynx bridge (existing keys, GET only; writes stay on the gated pending-write path, migrations 184/185).
- **Trust tier:** `evidence` (mirrored vendor data).

## 4. The new state (projected)

- **Time per occurrence:** ~0.5 minute on the Job profile.
- **Agent cost:** API calls within existing limits; no model calls.
- **Human review:** none.

## 5. The math

| Item | Value |
|---|---|
| X, current monthly cost | $373 *(estimate)* |
| Y, new monthly cost | 20 × 0.5 / 60 × 4.3 × $65 ≈ **$47** |
| Z, one-time build (lines only) | ~32 engineering hours × $65 ≈ **$2,080** (sync resources, migration, backfill, reader, panel, tests) |
| Z/12 | $173 |
| **ROI = X / (Y + Z/12)** | **373 / 220 ≈ 1.7** |

**Exempt from 10x gate?** No for the panel. **The header backfill is a defect fix**, not a new skill: the live Job profile reads two columns the sync never fills.

## 6. Risks

- **UOM:** `estimateUnit` is a UUID resolved through `/acculynx/units-of-measure`; never compare these units with ABC pricing UOM (docs/46).
- **Paging quirk:** `pageStartIndex` is a page number for `/estimates` but a record offset for `/jobs`.
- **PII (documents, if ever):** contracts carry homeowner names, signatures, claim numbers and financing — private bucket and signed URLs only, as with CompanyCam photos.
- **Rollback:** stop the new sync resources; tables stay (additive).

## 7. Alternatives considered

- **Leave it human:** acceptable for line detail at current volume (ROI ≈ 1.7).
- **Defer until:** measured look-up time, or the estimate/invoice audits need line data (then the sync work serves both and the ROI is shared).

## 8. Decision

- [ ] **Approve** — build by [YYYY-MM-DD]; pilot client: pro-exteriors
- [ ] **Kill** — reason:
- [ ] **Defer** — revisit at: 2026-11-01, condition: measured look-up time, or an audit that needs line items

**Recommendation:** fix the estimate **header** backfill now as a defect (one detail call per estimate, ~445 calls); **defer** line detail; keep documents "Not connected" with an AccuLynx link until AccuLynx adds a read endpoint.

Approver: Chris
Approved / decided on:

---

## 9. Post-build tracking

*Fill in after a 2-week pilot if approved.*

Sources: `skills/cleverwork-roofer/acculynx-api/reference/{full-endpoint-reference.md,openapi-index.json}`, `docs/knowledge-base/acculynx/api/auth-and-limits.md`, `docs/65`, `docs/37`, `docs/120`, `docs/reference/acculynx-api-blocker-email-draft.md`, `supabase/functions/acculynx-sync/resources/estimates.ts`; live aggregates over `acculynx_estimates`, `acculynx_job_financials`, `acculynx_jobs` (2026-10-01, no PII).
