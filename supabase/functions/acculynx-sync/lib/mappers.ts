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
    date_of_loss: raw?.dateOfLoss ?? null,
    claim_filed: raw?.claimFiled ?? null,
    claim_filed_date: raw?.claimFiledDate ?? null,
    claim_number: raw?.claimNumber ?? null,
    has_paperwork: raw?.hasPaperwork ?? null,
    account_key: ctx.account_key,
    market: ctx.market,
    last_seen_by_api: ctx.now,
    synced_at: ctx.now,
    raw,
  };
}

/** Map a raw /jobs/{id}/milestone-history item to acculynx_job_milestone_history columns. */
export function mapMilestoneHistoryItem(raw: any, ctx: MapperCtx): Record<string, unknown> {
  return {
    id: raw?.id ?? null,
    job_id: ctx.job_id ?? null,
    milestone_name: raw?.milestoneName ?? null,
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
    invoice_date: raw?.invoiceDate ?? null,
    due_date: raw?.dueDate ?? null,
    current_invoice_state: raw?.currentInvoiceState ?? null,
    total_price: raw?.totalPrice ?? null,
    balance_due: raw?.balanceDue ?? null,
    created_date: raw?.createdDate ?? null,
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
