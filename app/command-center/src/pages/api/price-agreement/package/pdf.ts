import type { APIRoute } from "astro";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { buildUnauthorizedResponse } from "@lib/access-control";
import { buildAgreementExport } from "@lib/agreement-export";

export const prerender = false;

// PDF export of a branch's negotiable agreement worksheet, mirroring the ABC branch
// agreement ledger (header + family-grouped item/price table). Auth-gated (internal).
// This is a DRAFT for internal review — it is not sent anywhere by an agent.
export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.actor) return buildUnauthorizedResponse();
  const branch = url.searchParams.get("branch") ?? undefined;
  const exp = await buildAgreementExport(branch);
  if (!exp.ok || !exp.branch) return new Response("No branch / negotiable items found.", { status: 404 });

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 48;
  const ink = rgb(0.11, 0.15, 0.2), muted = rgb(0.42, 0.47, 0.53), line = rgb(0.86, 0.89, 0.93), band = rgb(0.93, 0.94, 0.96);

  // Column layout: Item | Description | UOM | Prior | Proposed
  const cols = [
    { x: M, w: 86, label: "Item #", align: "l" as const },
    { x: M + 86, w: 250, label: "Description", align: "l" as const },
    { x: M + 336, w: 44, label: "UOM", align: "l" as const },
    { x: M + 380, w: 60, label: "Prior", align: "r" as const },
    { x: M + 440, w: W - M - (M + 440), label: "Proposed", align: "r" as const },
  ];
  const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fit = (s: string, f: typeof font, size: number, w: number) => {
    s = String(s ?? "");
    while (s.length > 1 && f.widthOfTextAtSize(s, size) > w) s = s.slice(0, -2);
    return s;
  };

  let page = doc.addPage([W, H]);
  let y = 0;

  const drawText = (s: string, x: number, yy: number, size: number, f = font, color = ink) => page.drawText(s, { x, y: yy, size, font: f, color });
  const drawRight = (s: string, rx: number, yy: number, size: number, f = font, color = ink) => page.drawText(s, { x: rx - f.widthOfTextAtSize(s, size), y: yy, size, font: f, color });

  function header() {
    y = H - M;
    drawText("Negotiated Price Agreement", M, y, 17, bold);
    drawText("DRAFT — internal review", W - M - font.widthOfTextAtSize("DRAFT — internal review", 9), y + 3, 9, font, muted);
    y -= 20;
    drawText("ABC Supply Co.", M, y, 11, bold, muted);
    y -= 16;
    drawText(`Branch: ${exp.branch!.name}  (#${exp.branch!.number})${exp.branch!.office ? "  ·  " + exp.branch!.office : ""}`, M, y, 10);
    y -= 14;
    drawText(`Prepared for: ${exp.recipient.name} — National Account Manager (${exp.recipient.email})`, M, y, 10, font, muted);
    y -= 14;
    drawText(`Generated ${exp.generatedAt.slice(0, 10)}  ·  ${exp.rows.length} items  ·  not yet sent`, M, y, 9, font, muted);
    y -= 18;
    columnHeader();
  }
  function columnHeader() {
    page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 16, color: band });
    for (const c of cols) {
      if (c.align === "r") drawRight(c.label, c.x + c.w, y, 8.5, bold, muted);
      else drawText(c.label, c.x, y, 8.5, bold, muted);
    }
    y -= 18;
  }
  function ensure(space: number) {
    if (y - space < M) { page = doc.addPage([W, H]); header(); }
  }

  header();

  // Group rows by family, in the order produced (families already spend-sorted).
  const seen = new Set<string>();
  const order: string[] = [];
  const byFam = new Map<string, typeof exp.rows>();
  for (const r of exp.rows) {
    if (!seen.has(r.familyName)) { seen.add(r.familyName); order.push(r.familyName); byFam.set(r.familyName, []); }
    byFam.get(r.familyName)!.push(r);
  }

  for (const fam of order) {
    const rows = byFam.get(fam)!;
    ensure(31); // band + at least one row, so a family header never strands at a page bottom
    // family band
    page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 15, color: rgb(0.97, 0.97, 0.99) });
    drawText(fit(fam, bold, 9.5, W - 2 * M - 70), M + 2, y, 9.5, bold, ink);
    drawRight(`${rows.length} item${rows.length === 1 ? "" : "s"}`, W - M - 2, y, 8.5, font, muted);
    y -= 16;
    for (const r of rows) {
      ensure(14);
      drawText(fit(r.itemNumber, font, 8.5, cols[0].w - 4), cols[0].x, y, 8.5, font);
      drawText(fit(r.description, font, 8.5, cols[1].w - 4), cols[1].x, y, 8.5, font);
      drawText(fit(r.uom, font, 8.5, cols[2].w - 2), cols[2].x, y, 8.5, font, muted);
      drawRight(r.priorPrice == null ? "—" : money(r.priorPrice), cols[3].x + cols[3].w, y, 8.5, font, muted);
      drawRight(money(r.finalPrice), cols[4].x + cols[4].w, y, 9, bold, ink);
      y -= 13;
      page.drawLine({ start: { x: M, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 0.4, color: line });
    }
    y -= 4;
  }

  const bytes = await doc.save();
  const safeName = (url.searchParams.get("name") || "").replace(/[^\w\-#.]/g, "");
  const fname = `${safeName || `agreement-${exp.branch.number}-${exp.generatedAt.slice(0, 10)}`}.pdf`;
  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${fname}"`,
    },
  });
};
