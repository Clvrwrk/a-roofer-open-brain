// acculynx-sync — lib/mappers.ts (Phase 7, plan 07-05 Task 2)
//
// Explicit raw(camelCase) -> typed snake_case field maps for the six job-walk
// sub-resource tables. Mirrors resources/jobs.ts mapJob() conventions:
//   - `?? null` defaults for every mapped column
//   - explicit key list (NEVER `...raw` spread into the typed row)
//   - the untyped `raw` jsonb column always carries the full original body
//   - unknown camelCase API keys are dropped — they exist only inside `raw`
//
// Column lists are authoritative per schemas/cleverwork-roofer/169-acculynx-resource-tables-ddl.sql.
// D-14 (capture-first, map-second): these mappers project FROM the raw body that
// job-walk.ts archives to acculynx_raw BEFORE calling any of these functions.

// deno-lint-ignore-file no-explicit-any

/** Shared per-row stamping context (account_key/market/last_seen_by_api/synced_at). */
export interface MapperCtx {
  account_key: string;
  market: string;
  now: string;
  job_id?: string;
  invoice_id?: string;
}

/**
 * Normalizes a raw API date-ish value for a `timestamptz` column: AccuLynx sends `""` (empty
 * string) for several date fields on voided/incomplete records (e.g. `dueDate`/`invoiceDate` on
 * void invoices — confirmed via 07-09 live-DB probe, job 03813301-8644-4553-af7f-ee151ea2e719),
 * which Postgres rejects with "invalid input syntax for type timestamp with time zone" — the
 * `?? null` idiom used elsewhere in this file only catches null/undefined, not `""`. Use this
 * wrapper for every date/timestamp field mapped from a raw AccuLynx body.
 */
function nullableDate(value: unknown): string | null {
  if (typeof value === "string" && value.trim() === "") return null;
  return (value as string | null | undefined) ?? null;
}

/**
 * Map a raw /jobs/{id}/contacts item to acculynx_job_contacts columns.
 * id and contact_id are sourced from the API item's id / contact.id.
 */
export function mapJobContact(raw: any, ctx: MapperCtx): Record<string, unknown> {
  return {
    id: raw?.id ?? null,
    job_id: ctx.job_id ?? null,
    contact_id: raw?.contact?.id ?? raw?.contactId ?? null,
    is_primary: raw?.isPrimary ?? null,
    relation_to_primary: raw?.relationToPrimary ?? null,
    account_key: ctx.account_key,
    market: ctx.market,
    last_seen_by_api: ctx.now,
    synced_at: ctx.now,
    raw,
  };
}

/**
 * Map a raw /jobs/{id}/financials body to acculynx_job_financials columns (job_id PK).
 * Anchored on the KS-11 ground truth: approvedJobValue 30368.48 -> approved_job_value 30368.48,
 * balanceDue 17532.48 -> balance_due 17532.48.
 */
export function mapJobFinancials(raw: any, ctx: MapperCtx): Record<string, unknown> {
  return {
    job_id: ctx.job_id ?? null,
    approved_job_value: raw?.approvedJobValue ?? null,
    balance_due: raw?.balanceDue ?? null,
    worksheet_total: raw?.worksheetTotal ?? null,
    change_order_total: raw?.changeOrderTotal ?? null,
    insurance_claim_total: raw?.insuranceClaimTotal ?? null,
    upgrade_total: raw?.upgradeTotal ?? null,
    discount_total: raw?.discountTotal ?? null,
    supplement_total: raw?.supplementTotal ?? null,
    work_not_doing_total: raw?.workNotDoingTotal ?? null,
    amendments: raw?.amendments ?? null,
    account_key: ctx.account_key,
    market: ctx.market,
    last_seen_by_api: ctx.now,
    synced_at: ctx.now,
    raw,
  };
}

/** Map a raw /jobs/{id}/insurance body to acculynx_job_insurance columns (job_id PK). */
export function mapJobInsurance(raw: any, ctx: MapperCtx): Record<string, unknown> {
  return {
    job_id: ctx.job_id ?? null,
    insurance_company_id: raw?.insuranceCompany?.id ?? null,
    insurance_company_name: raw?.insuranceCompany?.name ?? null,
    custom_insurance_company_name: raw?.customInsuranceCompanyName ?? null,
    damage_location: raw?.damageLocation ?? null,
    date_of_loss: nullableDate(raw?.dateOfLoss),
    claim_filed: raw?.claimFiled ?? null,
    claim_filed_date: nullableDate(raw?.claimFiledDate),
    claim_number: raw?.claimNumber ?? null,
    has_paperwork: raw?.hasPaperwork ?? null,
    account_key: ctx.account_key,
    market: ctx.market,
    last_seen_by_api: ctx.now,
    synced_at: ctx.now,
    raw,
  };
}

/** Map a raw /jobs/{id}/milestone-history item to acculynx_job_milestone_history columns.
 *  `id` is intentionally omitted: the LIVE column is `bigint GENERATED ALWAYS AS IDENTITY`
 *  (confirmed via information_schema against prod rnhmvcpsvtqjlffpsayu, 07-09 live-DB probe —
 *  this differs from the 169 migration file's plain `bigint primary key`, an example of the
 *  CLAUDE.md "verify against the live DB, not migration files" lesson). Postgres rejects any
 *  explicit non-DEFAULT value for a GENERATED ALWAYS column. Dedup instead relies on the
 *  existing natural unique index (job_id, milestone_name, milestone_date). */
export function mapMilestoneHistoryItem(raw: any, ctx: MapperCtx): Record<string, unknown> {
  return {
    job_id: ctx.job_id ?? null,
    milestone_name: raw?.milestoneName ?? null,
    // milestone_date is NOT NULL at the DB level; no `""` case has been observed for this
    // field (unlike invoice_date/dueDate), so it is left as `?? null` deliberately — if
    // AccuLynx ever sends "" here, the NOT NULL constraint should fail loudly via
    // recordWalkError() rather than have this mapper silently invent a null value for a
    // required column.
    milestone_date: raw?.milestoneDate ?? null,
    account_key: ctx.account_key,
    market: ctx.market,
    last_seen_by_api: ctx.now,
    synced_at: ctx.now,
  };
}

/** Map a raw /jobs/{id}/invoices list item (invoice header stub) to acculynx_invoices columns. */
export function mapInvoiceHeader(raw: any, ctx: MapperCtx): Record<string, unknown> {
  return {
    id: raw?.id ?? null,
    job_id: ctx.job_id ?? null,
    invoice_number: raw?.invoiceNumber ?? null,
    invoice_sequence: raw?.invoiceSequence ?? null,
    invoice_name: raw?.invoiceName ?? null,
    // invoice_date is timestamptz (nullable) -> normalize AccuLynx's `""` on void invoices.
    invoice_date: nullableDate(raw?.invoiceDate),
    // due_date is `text` at the DB level (confirmed live, 07-09 probe) -- "" passes through
    // fine as a text value; no normalization needed/applied here.
    due_date: raw?.dueDate ?? null,
    current_invoice_state: raw?.currentInvoiceState ?? null,
    total_price: raw?.totalPrice ?? null,
    balance_due: raw?.balanceDue ?? null,
    created_date: nullableDate(raw?.createdDate),
    sort_index: raw?.sortIndex ?? null,
    account_key: ctx.account_key,
    market: ctx.market,
    last_seen_by_api: ctx.now,
    synced_at: ctx.now,
    raw,
  };
}

/** Map a raw /invoices/{invoiceId} line item to acculynx_invoice_lines columns. */
export function mapInvoiceLine(raw: any, ctx: MapperCtx): Record<string, unknown> {
  return {
    id: raw?.id ?? null,
    invoice_id: ctx.invoice_id ?? null,
    section_id: raw?.sectionId ?? null,
    section_type: raw?.sectionType ?? null,
    item_name: raw?.itemName ?? null,
    price: raw?.price ?? null,
    total_price: raw?.totalPrice ?? null,
    hierarchy_sort_order: raw?.hierarchySortOrder ?? null,
    reference_type: raw?.referenceType ?? null,
    account_key: ctx.account_key,
    market: ctx.market,
    last_seen_by_api: ctx.now,
    synced_at: ctx.now,
    raw,
  };
}
