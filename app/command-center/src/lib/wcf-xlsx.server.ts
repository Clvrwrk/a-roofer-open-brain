// Server-side XLSX builders for the CEO surfaces (mig 281).
//
// One-click Excel exports carry the SAME live data the screen renders, stamped
// with as-of timestamp and basis_version, per the register's naming convention:
//   PE_13WCF_asof-YYYY-MM-DD.xlsx / PE_FixedCosts_asof-YYYY-MM-DD.xlsx
// Financial-model color code: blue = input/assumption, black = computed.

import ExcelJS from "exceljs";
import type { CashFlowBoard } from "@lib/cash-flow";
import type { FixedCostBoard } from "@lib/fixed-costs";

const CUR = '$#,##0;($#,##0);"-"';
const PCT = "0.0%";
const BLUE = { color: { argb: "FF0000FF" } };
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E3D" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" }, size: 10 };

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
  });
}

function newBook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PE Open Brain — Command Center";
  wb.created = new Date();
  return wb;
}

export function cashFlowFileName(asOfIso: string): string {
  return `PE_13WCF_asof-${asOfIso.slice(0, 10)}.xlsx`;
}

export function fixedCostFileName(asOfIso: string): string {
  return `PE_FixedCosts_asof-${asOfIso.slice(0, 10)}.xlsx`;
}

export async function buildCashFlowWorkbook(board: CashFlowBoard): Promise<Buffer> {
  const wb = newBook();

  const s = wb.addWorksheet("13WCF");
  s.getColumn(1).width = 34;
  for (let i = 0; i < 13; i++) s.getColumn(2 + i).width = 12;
  s.addRow([`PE 13-Week Cash Flow Forecast — as of ${board.generatedAt.slice(0, 10)}`]).font = { name: "Arial", bold: true, size: 13 };
  s.addRow([board.provisionalNote]).font = { name: "Arial", italic: true, size: 9 };
  s.addRow([]);
  const header = s.addRow(["Week beginning", ...board.weeks.map((w) => w.weekStart.slice(5))]);
  styleHeader(header);

  const line = (label: string, values: number[], opts?: { bold?: boolean; blue?: boolean }) => {
    const r = s.addRow([label, ...values]);
    r.eachCell((cell, col) => {
      if (col === 1) {
        cell.font = { name: "Arial", bold: Boolean(opts?.bold), size: 10 };
      } else {
        cell.numFmt = CUR;
        cell.font = { name: "Arial", bold: Boolean(opts?.bold), size: 10, ...(opts?.blue ? BLUE : {}) };
      }
    });
    return r;
  };

  line("Beginning cash", board.weeks.map((w) => w.beginningCash), { bold: true });
  line("Dated AR collections (WIP board)", board.weeks.map((w) => w.datedReceipts));
  line("Undated AR pool @ weekly %", board.weeks.map((w) => w.undatedReceipts), { blue: true });
  line("New billings converting to cash", board.weeks.map((w) => w.newBillings), { blue: true });
  line("Total receipts", board.weeks.map((w) => w.totalReceipts), { bold: true });
  line("Materials (ABC/SRS/QXO)", board.weeks.map((w) => w.materials), { blue: true });
  line("Subcontractors", board.weeks.map((w) => w.subs), { blue: true });
  line("Sales commissions (1099)", board.weeks.map((w) => w.commissions), { blue: true });
  line("W-2 payroll + employer taxes", board.weeks.map((w) => w.payroll), { blue: true });
  line("Fixed overhead (register)", board.weeks.map((w) => w.fixedOverhead));
  line("One-time / past-due AP", board.weeks.map((w) => w.oneTime), { blue: true });
  line("Total disbursements", board.weeks.map((w) => w.totalDisbursements), { bold: true });
  line("Net cash flow", board.weeks.map((w) => w.net), { bold: true });
  line("ENDING CASH", board.weeks.map((w) => w.endingCash), { bold: true });
  const woc = s.addRow(["Weeks of cash on hand", ...board.weeks.map((w) => w.weeksOfCash)]);
  woc.eachCell((cell, col) => {
    cell.font = { name: "Arial", size: 10, bold: col === 1 };
    if (col > 1) cell.numFmt = "0.0";
  });
  // Definition audited 2026-08-26: ending cash ÷ average weekly TOTAL
  // disbursements. Months shown alongside (4.345 weeks/month) so the two
  // scales can never be confused.
  const moc = s.addRow(["  ≈ months of cash (4.345 wks/mo)", ...board.weeks.map((w) => Math.round((w.weeksOfCash / 4.345) * 10) / 10)]);
  moc.eachCell((cell, col) => {
    cell.font = { name: "Arial", size: 9, italic: true, color: { argb: "FF666666" } };
    if (col > 1) cell.numFmt = "0.0";
  });
  const flags = s.addRow(["Below minimum floor?", ...board.weeks.map((w) => (w.belowFloor ? "BELOW FLOOR" : "ok"))]);
  flags.eachCell((cell, col) => {
    cell.font = { name: "Arial", size: 10, bold: col === 1, color: String(cell.value) === "BELOW FLOOR" ? { argb: "FFA33B2E" } : undefined };
  });

  const a = wb.addWorksheet("Assumptions");
  a.getColumn(1).width = 48;
  a.getColumn(2).width = 16;
  a.getColumn(3).width = 80;
  styleHeader(a.addRow(["Assumption", "Value", "Note"]));
  for (const item of board.assumptions) {
    const r = a.addRow([item.label, item.value, item.note ?? ""]);
    r.getCell(1).font = { name: "Arial", size: 10 };
    r.getCell(2).font = { name: "Arial", size: 10, ...BLUE };
    r.getCell(2).numFmt = item.key === "undated_collection_pct" ? PCT : item.key === "new_billings_ramp_week" ? "0" : CUR;
    r.getCell(3).font = { name: "Arial", size: 9 };
  }
  a.addRow([]);
  styleHeader(a.addRow(["Bank account", "Balance", ""]));
  for (const b of board.bankAccounts) {
    const r = a.addRow([b.name, b.balance, ""]);
    r.getCell(2).numFmt = CUR;
  }

  const d = wb.addWorksheet("AR_Detail");
  d.getColumn(1).width = 16;
  d.getColumn(2).width = 34;
  d.getColumn(3).width = 20;
  d.getColumn(4).width = 14;
  d.getColumn(5).width = 12;
  d.addRow([`AR population — dated ${Math.round(board.datedShare * 100)}% by value; undated pool $${Math.round(board.undatedCash).toLocaleString()} across ${board.undatedJobs} jobs`]).font = { name: "Arial", bold: true, size: 11 };
  d.addRow(["Undated jobs below need an expected_invoice_cash_date on the Friday WIP/AR board."]).font = { name: "Arial", italic: true, size: 9 };
  d.addRow([]);
  styleHeader(d.addRow(["Job #", "Client", "Location", "Outstanding", "Insurance?"]));
  for (const j of board.undatedTopJobs) {
    const r = d.addRow([j.jobNumber, j.client, j.location, j.outstanding, j.hasInsurance ? "Y" : ""]);
    r.getCell(4).numFmt = CUR;
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildFixedCostWorkbook(board: FixedCostBoard): Promise<Buffer> {
  const wb = newBook();

  const p = wb.addWorksheet("Pools");
  p.getColumn(1).width = 28;
  for (const c of [2, 3, 4, 5]) p.getColumn(c).width = 15;
  p.getColumn(6).width = 12;
  p.addRow([`PE Fixed-Cost Register — basis_version ${board.basisVersion}${board.provisional ? " (PROVISIONAL — CPA rulings pending)" : ""} — as of ${board.generatedAt.slice(0, 10)}`]).font = { name: "Arial", bold: true, size: 13 };
  p.addRow([]);
  styleHeader(p.addRow(["Cost pool", "Monthly budget", "TTM actual", "Last full month", "3-mo avg", "Open rulings"]));
  for (const pool of board.pools) {
    const r = p.addRow([pool.label, pool.monthlyBudget, pool.ttmAmount, pool.lastMonthActual, pool.avg3moActual, pool.rulingsOpen || ""]);
    for (const c of [2, 3, 4, 5]) r.getCell(c).numFmt = CUR;
  }
  const t = p.addRow([
    "TOTAL",
    board.pools.reduce((s, x) => s + x.monthlyBudget, 0),
    board.pools.reduce((s, x) => s + x.ttmAmount, 0),
    board.pools.reduce((s, x) => s + x.lastMonthActual, 0),
    board.pools.reduce((s, x) => s + x.avg3moActual, 0),
    board.rulingsOpen,
  ]);
  t.eachCell((cell, col) => {
    cell.font = { name: "Arial", bold: true, size: 10 };
    if (col > 1 && col < 6) cell.numFmt = CUR;
  });

  const g = wb.addWorksheet("Register");
  const widths = [44, 22, 12, 14, 26, 16, 12, 12, 12, 12, 8];
  widths.forEach((w, i) => (g.getColumn(i + 1).width = w));
  styleHeader(g.addRow(["Account", "Pool", "Behavior", "Attribution", "Rule", "Basis", "Monthly budget", "TTM", "Last month", "3-mo avg", "Ruling"]));
  for (const row of board.rows) {
    const r = g.addRow([
      row.accountFqn,
      row.costPool,
      row.costBehavior,
      row.attribution,
      row.attributionRule ?? "",
      row.allocationBasis,
      row.monthlyBudget,
      row.ttmAmount,
      row.lastMonthActual,
      row.avg3moActual,
      row.rulingRef ?? "",
    ]);
    for (const c of [7, 8, 9, 10]) r.getCell(c).numFmt = CUR;
    if (row.needsRuling) r.getCell(11).font = { name: "Arial", bold: true, color: { argb: "FFB4560F" }, size: 10 };
  }

  const o = wb.addWorksheet("Allocation Preview");
  o.getColumn(1).width = 28;
  o.getColumn(2).width = 14;
  o.getColumn(3).width = 20;
  o.addRow(["Corporate monthly budget spread by billed share of the current WIP/AR population."]).font = { name: "Arial", bold: true, size: 11 };
  o.addRow(["PLACEHOLDER BASIS — real location P&L arrives with the Jan 1 GL conversion (QBO Locations + Classes)."]).font = { name: "Arial", italic: true, size: 9, color: { argb: "FFB4560F" } };
  o.addRow([]);
  styleHeader(o.addRow(["Location", "Billed share", "Corporate allocated / mo"]));
  for (const al of board.officeAllocations) {
    const r = o.addRow([al.location, al.billedShare, al.corporateAllocated]);
    r.getCell(2).numFmt = PCT;
    r.getCell(3).numFmt = CUR;
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function xlsxResponse(buffer: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
