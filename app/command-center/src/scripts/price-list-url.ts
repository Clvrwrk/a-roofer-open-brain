// Canonical Price List URL builder (PEC-193) — THE single seam every surface uses
// to link to /accounting/price-list/branch. Vendor silo: branch numbers collide
// across vendors, so the vendor slug is ALWAYS named; the PE office rides along so
// the target page can resolve the office-inherited agreement set even when
// vendor_branches has no pricing_territory_office_id for the branch (the root
// cause of "button enabled → empty price list": 12 of 37 ABC branches lacked the
// mapping, and the button's own gate checks (vendor, office) coverage — the page
// must resolve through the same pair).
//
// Adding a vendor? Nothing to do here — pass its slug. The roster that decides
// which vendors surface buttons lives in lib/cm-vendor-roster.ts (docs/88).

export interface PriceListTarget {
  branch: string;
  vendor: string; // vendor slug, e.g. "abc-supply" | "srs" | "qxo" — never omit
  invoice?: string; // scopes the list to the agreement in force on the invoice date
  office?: string; // PE office name — the (vendor, office) silo key the audit gate used
}

export function priceListUrl(t: PriceListTarget): string {
  const p = new URLSearchParams();
  p.set("branch", t.branch);
  p.set("vendor", t.vendor || "abc-supply");
  if (t.invoice) p.set("invoice", t.invoice);
  if (t.office) p.set("office", t.office);
  return `/accounting/price-list/branch?${p.toString()}`;
}
