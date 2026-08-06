import type { APIRoute } from "astro";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { actorCanAccessDepartment, serializeActor } from "@lib/access-control";
import { requireActor } from "@lib/api-guards";
import { jsonApiResponse } from "@lib/agent-api";
import {
  loadPriceAgreementCoverage,
  type CoverageBranch,
  type CoverageOffice,
} from "@lib/price-agreement-coverage";

export const prerender = false;

const INHERITANCE_RULE =
  "An agreement held by any branch inside a PE office's 2-hour drive-time ring is inherited by every branch of that vendor in the ring. Competing agreements resolve per item, lowest price wins. A lapsed list stays in force until the vendor replaces it (Extended).";

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const miles = (b: CoverageBranch) => (b.milesFromOffice == null ? "" : b.milesFromOffice.toFixed(1));
const statusLabel = (b: CoverageBranch) => (b.isLapsed ? "Extended" : b.holdsAgreement ? "Current" : "");

export const GET: APIRoute = async ({ url, locals }) => {
  const { actor, response: authError } = requireActor(locals, {
    department: "accounting",
    forbiddenMessage: "This actor cannot access price agreement coverage data.",
    forbiddenExtra: (a) => ({ actor: serializeActor(a) }),
  });
  if (!actor) return authError;

  const vendorSlug = (url.searchParams.get("vendor") ?? "").trim();
  const format = (url.searchParams.get("format") ?? "pdf").toLowerCase() === "csv" ? "csv" : "pdf";
  if (!vendorSlug) return new Response("Missing ?vendor=<slug>.", { status: 400 });

  const coverage = await loadPriceAgreementCoverage();

  // Keep every office ring the vendor appears in — a branch in two rings is listed twice by design.
  const offices: { office: CoverageOffice; vendorName: string; branches: CoverageBranch[] }[] = [];
  for (const office of coverage.offices) {
    const vendor = office.vendors.find((v) => v.vendorSlug === vendorSlug);
    if (!vendor) continue;
    offices.push({ office, vendorName: vendor.vendorName, branches: vendor.branches });
  }
  if (offices.length === 0) return new Response("No territory coverage found for that vendor.", { status: 404 });

  const vendorName = offices[0].vendorName || vendorSlug;
  const today = coverage.generatedAt.slice(0, 10);
  const safeSlug = vendorSlug.replace(/[^\w-]/g, "") || "vendor";

  if (format === "csv") {
    const lines: string[] = [
      [
        "Office", "Vendor", "Branch Number", "Branch Name", "City", "State",
        "Miles From Office", "Role", "Agreement Number", "Effective Date", "Status",
      ].join(","),
    ];
    for (const entry of offices) {
      for (const b of entry.branches) {
        lines.push([
          entry.office.officeName, entry.vendorName, b.branchNumber, b.branchName, b.city, b.state,
          miles(b), b.role, b.agreementNumber ?? "", b.effectiveDate ?? "", statusLabel(b),
        ].map(csvCell).join(","));
      }
    }
    return new Response(lines.join("\n"), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="pe-${safeSlug}-territory-coverage-${today}.csv"`,
      },
    });
  }

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 792, H = 612, M = 40; // landscape — 11 columns
  const ink = rgb(0.11, 0.15, 0.2), muted = rgb(0.42, 0.47, 0.53);
  const line = rgb(0.86, 0.89, 0.93), band = rgb(0.93, 0.94, 0.96);

  const cols = [
    { x: M, w: 58, label: "Branch #", align: "l" as const },
    { x: M + 58, w: 150, label: "Branch Name", align: "l" as const },
    { x: M + 208, w: 108, label: "City", align: "l" as const },
    { x: M + 316, w: 34, label: "St", align: "l" as const },
    { x: M + 350, w: 46, label: "Miles", align: "r" as const },
    { x: M + 396, w: 92, label: "Role", align: "l" as const },
    { x: M + 488, w: 106, label: "Agreement #", align: "l" as const },
    { x: M + 594, w: 64, label: "Effective", align: "l" as const },
    { x: M + 658, w: W - M - (M + 658), label: "Status", align: "l" as const },
  ];

  const fit = (s: string, f: typeof font, size: number, w: number) => {
    let out = String(s ?? "");
    while (out.length > 1 && f.widthOfTextAtSize(out, size) > w) out = out.slice(0, -2);
    return out;
  };

  let page = doc.addPage([W, H]);
  let y = 0;
  const drawText = (s: string, x: number, yy: number, size: number, f = font, color = ink) =>
    page.drawText(s, { x, y: yy, size, font: f, color });
  const drawRight = (s: string, rx: number, yy: number, size: number, f = font, color = ink) =>
    page.drawText(s, { x: rx - f.widthOfTextAtSize(s, size), y: yy, size, font: f, color });

  // Wrap the inheritance-rule paragraph to the page width.
  const wrap = (s: string, size: number, w: number) => {
    const words = s.split(/\s+/);
    const out: string[] = [];
    let cur = "";
    for (const word of words) {
      const next = cur ? `${cur} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > w && cur) { out.push(cur); cur = word; } else cur = next;
    }
    if (cur) out.push(cur);
    return out;
  };

  function pageHeader() {
    y = H - M;
    drawText("Territory Coverage — who inherits which price list", M, y, 15, bold);
    y -= 17;
    drawText(vendorName, M, y, 11, bold, muted);
    drawRight(`Generated ${today}`, W - M, y, 9, font, muted);
    y -= 15;
    for (const ruleLine of wrap(INHERITANCE_RULE, 8, W - 2 * M)) {
      drawText(ruleLine, M, y, 8, font, muted);
      y -= 10;
    }
    y -= 6;
  }
  function columnHeader() {
    page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 16, color: band });
    for (const c of cols) {
      if (c.align === "r") drawRight(c.label, c.x + c.w, y, 8.5, bold, muted);
      else drawText(c.label, c.x, y, 8.5, bold, muted);
    }
    y -= 18;
  }
  function newPage() {
    page = doc.addPage([W, H]);
    pageHeader();
  }
  function ensure(space: number) {
    if (y - space < M) { newPage(); columnHeader(); }
  }

  pageHeader();

  for (const entry of offices) {
    ensure(46);
    page.drawRectangle({ x: M, y: y - 5, width: W - 2 * M, height: 17, color: rgb(0.97, 0.97, 0.99) });
    drawText(
      `${entry.office.officeName}${entry.office.officeState ? ` (${entry.office.officeState})` : ""}`,
      M + 3, y, 10.5, bold, ink,
    );
    drawRight(`${entry.branches.length} branch${entry.branches.length === 1 ? "" : "es"} in ring`, W - M - 3, y, 8.5, font, muted);
    y -= 20;
    columnHeader();

    for (const b of entry.branches) {
      ensure(14);
      drawText(fit(b.branchNumber, font, 8.5, cols[0].w - 4), cols[0].x, y, 8.5, font);
      drawText(fit(b.branchName, b.isPrimaryBranch ? bold : font, 8.5, cols[1].w - 4), cols[1].x, y, 8.5, b.isPrimaryBranch ? bold : font);
      drawText(fit(b.city, font, 8.5, cols[2].w - 4), cols[2].x, y, 8.5, font);
      drawText(fit(b.state, font, 8.5, cols[3].w - 2), cols[3].x, y, 8.5, font, muted);
      drawRight(miles(b), cols[4].x + cols[4].w, y, 8.5, font, muted);
      drawText(fit(b.role, font, 8.5, cols[5].w - 4), cols[5].x, y, 8.5, font);
      drawText(fit(b.agreementNumber ?? "—", font, 8.5, cols[6].w - 4), cols[6].x, y, 8.5, font);
      drawText(fit(b.effectiveDate ?? "—", font, 8.5, cols[7].w - 4), cols[7].x, y, 8.5, font, muted);
      drawText(fit(statusLabel(b) || "—", font, 8.5, cols[8].w - 4), cols[8].x, y, 8.5, font, muted);
      y -= 13;
      page.drawLine({ start: { x: M, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 0.4, color: line });
    }
    y -= 10;
  }

  const bytes = await doc.save();
  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="pe-${safeSlug}-territory-coverage-${today}.pdf"`,
    },
  });
};
