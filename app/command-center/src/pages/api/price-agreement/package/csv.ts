import type { APIRoute } from "astro";
import { buildUnauthorizedResponse } from "@lib/access-control";
import { buildAgreementExport, csvCell } from "@lib/agreement-export";

export const prerender = false;

// CSV export of a branch's negotiable agreement worksheet. Auth-gated (internal).
// Columns: item, family, description, uom, class, prior_price, prior_source,
// proposed_price, final_price(blank for the vendor to fill).
export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.actor) return buildUnauthorizedResponse();
  const branch = url.searchParams.get("branch") ?? undefined;
  const exp = await buildAgreementExport(branch);
  if (!exp.ok || !exp.branch) {
    return new Response("No branch / negotiable items found.", { status: 404 });
  }

  // final_price = the computed proposed/agreement price; vendor_final_price is left
  // blank for the vendor to confirm on the returned sheet.
  const header = ["item_number", "family", "description", "uom", "review_class", "prior_price", "prior_source", "final_price", "vendor_final_price"];
  const lines = [header.join(",")];
  for (const r of exp.rows) {
    lines.push([
      csvCell(r.itemNumber), csvCell(r.familyName), csvCell(r.description), csvCell(r.uom), csvCell(r.reviewClass),
      r.priorPrice == null ? "" : r.priorPrice.toFixed(2), csvCell(r.priorSource), r.finalPrice.toFixed(2), "",
    ].join(","));
  }
  const csv = lines.join("\r\n");
  const safeName = (url.searchParams.get("name") || "").replace(/[^\w\-#.]/g, "");
  const fname = `${safeName || `agreement-${exp.branch.number}-${exp.generatedAt.slice(0, 10)}`}.csv`;
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${fname}"`,
    },
  });
};
