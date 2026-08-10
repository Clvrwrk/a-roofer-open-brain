// Credit-memo vendor roster — THE single seam for the multi-vendor Credit Memo
// pill (docs/88, Chris 2026-08-09).
//
// FUTURE AGENTS — to add a vendor to the Credit Memo pill and weekly email:
//   1. Add one entry below. `slug` MUST equal `vendors.slug` in the DB (the same
//      vendor_slug stamped on credit_memo_requests / invoice_line_audit — never
//      invent a new spelling; see docs/87 vendor-silo rules).
//   2. Start it as `cmStatus: "coming_soon"` — the pill renders the button greyed
//      with a "Coming Soon" tooltip and no navigation.
//   3. Flip to `cmStatus: "live"` only when the vendor's CM pipeline is proven
//      end-to-end (claims engine writes credit_memo_requests rows carrying this
//      vendor_slug, and /accounting/credit-memos/weekly?vendor=<slug> renders its
//      email). A live vendor with zero draft/approved CMs still greys out, with a
//      "No credit memos exist for this weekly run" tooltip — that is automatic.
//   4. Nothing else to edit: the pill (invoice-audit.astro), the weekly page, and
//      the weekly-csv endpoint all iterate this array.
// PEC-196 extends this same roster to the AGREEMENT surfaces (Agreement Builder,
// Price Agreements worksheets, Price List Review) via `agreementStatus`:
//   "live"       — full builder/review/promote flow proven for this vendor
//   "read_only"  — coverage/worksheets/price lists render (generic price_agreements
//                  tables), but the ABC-shaped package/promote write flow is not
//                  wired; mutating actions grey out ("No data available — report
//                  empty" / "Coming Soon" tooltips) and endpoints refuse the slug
//                  (fail closed, docs/87)
//   "coming_soon"— vendor not wired at all on agreement surfaces
// Same rules as cmStatus: slug === vendors.slug, flip a status only after the live
// call path proves it. Scaffolding doc: docs/90 (agreement-surface twin of docs/88).
export interface CmVendor {
  /** vendors.slug — the silo key on every money table (docs/87). */
  slug: string;
  /** Human label used in emails and page headings. */
  label: string;
  /** Short acronym used on the pill buttons and QB bank descriptions. */
  acronym: string;
  cmStatus: "live" | "coming_soon";
  agreementStatus: "live" | "read_only" | "coming_soon";
}

export const CM_VENDORS: CmVendor[] = [
  { slug: "abc-supply", label: "ABC Supply", acronym: "ABC", cmStatus: "live", agreementStatus: "live" },
  { slug: "srs", label: "SRS Distribution", acronym: "SRS", cmStatus: "live", agreementStatus: "read_only" },
  { slug: "qxo", label: "QXO", acronym: "QXO", cmStatus: "coming_soon", agreementStatus: "coming_soon" },
];

export const cmVendorBySlug = (slug: string | null | undefined): CmVendor | undefined =>
  CM_VENDORS.find((v) => v.slug === (slug ?? "").trim());

export const cmVendorLabel = (slug: string | null | undefined): string =>
  cmVendorBySlug(slug)?.label ?? "ABC Supply";
