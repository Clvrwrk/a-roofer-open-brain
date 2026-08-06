// GET /api/price-agreements/request-output?id=<requestId>&format=csv|md
// docs/83 P2: downloadable outputs of a frozen monthly request snapshot.
// (The HTML rendering lives on /accounting/price-agreements/request.)

import type { APIRoute } from "astro";
import { actorCanAccessDepartment } from "@lib/access-control";
import { requireActor } from "@lib/api-guards";
import { jsonApiResponse } from "@lib/agent-api";
import { createServerSupabaseClient } from "@lib/supabase.server";

export const prerender = false;

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const m2 = (v: unknown) => (v == null || v === "" ? "" : Number(v).toFixed(2));

export const GET: APIRoute = async ({ locals, url }) => {
  const { actor, response: authError } = requireActor(locals);
  if (!actor) return authError;
  if (!actorCanAccessDepartment(actor, "accounting")) {
    return jsonApiResponse({ error: "forbidden" }, { status: 403 });
  }
  const id = url.searchParams.get("id") ?? "";
  const format = url.searchParams.get("format") === "md" ? "md" : "csv";
  const { client } = createServerSupabaseClient();
  if (!client || !id) return jsonApiResponse({ error: "invalid_request" }, { status: 400 });

  const { data: rows } = await client.from("price_agreement_requests").select("*").eq("id", id).limit(1);
  const req = (rows as any[] | null)?.[0];
  if (!req) return jsonApiResponse({ error: "not_found" }, { status: 404 });
  const p = req.payload as any;
  const stamp = `${p.vendorSlug}-price-request-${req.month_label}`;

  if (format === "csv") {
    const lines = ["Office,Section,Item,Description,UOM,Purchases,Lifetime Value,Min Paid,Avg Paid,Max Paid,Latest Paid,API Price,Current Negotiated,Proposed Price"];
    for (const o of p.offices ?? []) {
      for (const g of o.gapItems ?? []) {
        lines.push([o.officeName, "gap", g.itemNumber, g.description, g.uom, g.purchaseCount, m2(g.lifetimeValue), m2(g.minPaid), m2(g.avgPaid), m2(g.maxPaid), m2(g.latestPaid), m2(g.apiPrice), "", m2(g.proposedPrice ?? g.latestPaid)].map(csvCell).join(","));
      }
      for (const r of o.renewalItems ?? []) {
        lines.push([o.officeName, "renewal", r.itemNumber, r.description, r.uom, r.purchaseCount, "", "", m2(r.avgPaid), "", m2(r.latestPaid), "", m2(r.negotiatedPrice), m2(r.proposedPrice ?? r.negotiatedPrice)].map(csvCell).join(","));
      }
    }
    return new Response(lines.join("\n") + "\n", {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${stamp}.csv"` },
    });
  }

  const md: string[] = [
    `# ${p.vendorName} — Price Agreement Request · ${req.month_label}`,
    ``,
    `Generated ${String(req.generated_at).slice(0, 10)} by ${req.generated_by ?? "operator"}. Prices are per the item's pricing UOM.`,
    ``,
  ];
  for (const o of p.offices ?? []) {
    md.push(`## ${o.officeName}`, ``);
    if ((o.gapItems ?? []).length) {
      md.push(`### New items to add (bought repeatedly, no negotiated price)`, ``, `| Item | Description | UOM | Buys | Latest Paid | Requested Price |`, `|---|---|---|---|---|---|`);
      for (const g of o.gapItems) md.push(`| ${g.itemNumber} | ${g.description} | ${g.uom} | ${g.purchaseCount} | $${m2(g.latestPaid)} | $${m2(g.proposedPrice ?? g.latestPaid)} |`);
      md.push(``);
    }
    if ((o.renewalItems ?? []).length) {
      md.push(`### Current items (renewal / update)`, ``, `| Item | Description | UOM | Current | Requested |`, `|---|---|---|---|---|`);
      for (const r of o.renewalItems) md.push(`| ${r.itemNumber} | ${r.description} | ${r.uom} | $${m2(r.negotiatedPrice)} | $${m2(r.proposedPrice ?? r.negotiatedPrice)} |`);
      md.push(``);
    }
  }
  return new Response(md.join("\n"), {
    headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${stamp}.md"` },
  });
};
