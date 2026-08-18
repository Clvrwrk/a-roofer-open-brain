/**
 * qb-bank-job.ts
 * Job-number (QB "Check No") resolution helpers for the QB bank export.
 *
 * Standard ABC resolution order lives in the route:
 *   1. v_invoice_acculynx_match.pe_job_number
 *   2. canonical_po
 *   3. PEC-208 recovery — normalize a sloppy PO (ks179 → KS-179) and adopt it
 *      only if that job exists in AccuLynx
 *   4. blank
 *
 * Commercial invoices sit outside that model: the work is not tracked as an
 * AccuLynx job, so the match view falls back to the ship-to ACCOUNT name and
 * every commercial invoice exported Check No "Commercial" — useless for job
 * costing. PE records the commercial job reference in the invoice's Customer
 * PO# field, so for these invoices that field IS the job number (Chris,
 * 2026-08-18 / PEC-214).
 */

/** Ship-to account name that marks an ABC invoice as commercial work. */
const COMMERCIAL_SHIP_TO = "commercial";

/**
 * The commercial Check No override, or null to keep the standard resolution.
 *
 * Detection is by ship-to NAME (mig 231 generated column `abc_invoices.ship_to_name`)
 * rather than the ship-to number 2036874-17, so a second Commercial ship-to would
 * still be caught if ABC ever adds one.
 *
 * The Customer PO# is used VERBATIM (trim + uppercase). Job-shaped values such as
 * "TX454" are deliberately NOT normalized to "TX-454": on a commercial invoice the
 * PO as written is the reference accounting uses. Freeform values ("SERVICE STOCK",
 * "truck stock 6/29") are kept as-is too and are truncated by the shared 12-char QB
 * cap at the call site (Chris confirmed: keep freeform).
 *
 * A blank Customer PO# returns null so the invoice falls through to the standard
 * resolution rather than exporting an empty Check No.
 */
export function commercialCheckNo(
  shipToName: string | null | undefined,
  purchaseOrderNumber: string | null | undefined,
): string | null {
  if (String(shipToName ?? "").trim().toLowerCase() !== COMMERCIAL_SHIP_TO) return null;
  const po = String(purchaseOrderNumber ?? "").trim().toUpperCase();
  return po || null;
}
