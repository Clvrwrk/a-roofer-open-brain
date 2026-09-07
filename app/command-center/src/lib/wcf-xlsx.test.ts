import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildCashFlowWorkbook, buildFixedCostWorkbook, xlsxResponse } from './wcf-xlsx.server';
import type { CashFlowBoard } from './cash-flow';
import type { FixedCostBoard } from './fixed-costs';

// Synthetic values only. Check the serialized artifact, not just builder objects.
const cash: CashFlowBoard = {
  status: 'live', generatedAt: '2026-09-06T12:00:00Z', beginningCash: 5000.25,
  bankAccounts: [{ name: 'Synthetic operating', balance: 5000.25 }],
  assumptions: [{ key: 'undated_collection_pct', value: 0.125, label: 'Collection assumption', note: 'Synthetic assumption', minValue: 0, maxValue: 1, updatedBy: null, updatedAt: null }],
  weeks: [{ weekStart: '2026-09-07', beginningCash: 5000.25, datedReceipts: 800.5,
    undatedReceipts: 100, newBillings: 200, totalReceipts: 1100.5, materials: 400,
    subs: 200, commissions: 100, totalDirect: 700, payroll: 500,
    fixedOverhead: 200, oneTime: 0, totalOverhead: 700, totalDisbursements: 1400,
    net: -299.5, endingCash: 4700.75, weeksOfCash: 3.4, belowFloor: true }],
  minCashFloor: 5000, minEndingCash: 4700.75, minEndingWeek: '2026-09-07',
  floorBreached: true, datedCash: 800.5, datedJobs: 1, pastExpectedCash: 0,
  undatedCash: 1234.56, undatedJobs: 1, undatedInsuranceCash: 1234.56, datedShare: 0.4,
  undatedTopJobs: [{ jobId: 'synthetic', jobNumber: 'TEST-01', client: '=1+1', location: 'Test office', outstanding: 1234.56, hasInsurance: true }],
  provisionalNote: 'PROVISIONAL — synthetic forecast', error: null,
};
const fixed: FixedCostBoard = {
  status: 'live', generatedAt: cash.generatedAt, basisVersion: 7, provisional: true,
  monthlyNut: 1200.5, ttmOverhead: 14000, ttmRevenue: 50000, overheadPctOfRevenue: 0.28,
  fixedShare: 0.8, rulingsOpen: 1, pools: [{ pool: 'facilities', label: 'Facilities', monthlyBudget: 1200.5, ttmAmount: 14000, lastMonthActual: 1300, avg3moActual: 1250, accounts: 1, rulingsOpen: 1 }],
  rows: [{ accountFqn: 'Synthetic rent', costPool: 'facilities', costBehavior: 'fixed', attribution: 'corporate', attributionRule: null, allocationBasis: 'billed_share', monthlyBudget: 1200.5, ttmAmount: 14000, lastMonthActual: 1300, avg3moActual: 1250, needsRuling: true, rulingRef: 'TEST-RULING', notes: null }],
  officeAllocations: [{ location: 'Test office', billedShare: 1, corporateAllocated: 1200.5 }],
  cogsRows: [{ accountFqn: 'Synthetic materials', ttmAmount: 30000, lastMonthActual: 2500, avg3moActual: 2500 }],
  cogsTtm: 30000, grossMarginTtm: 20000, grossMarginPct: 0.4, variableOverheadTtm: 2800,
  fixedOverheadTtm: 11200, lastFullMonth: '2026-08-01', error: null,
};

describe('financial workbook dependency compatibility', () => {
  it('round-trips cash, AR cents, assumptions, literal client text and provenance', async () => {
    const bytes = await buildCashFlowWorkbook(cash);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes);
    expect(wb.worksheets.map(s => s.name)).toEqual(['13WCF', 'Assumptions', 'AR_Detail']);
    const sheet = wb.getWorksheet('13WCF')!;
    expect(sheet.getCell('A1').text).toContain('2026-09-06');
    expect(sheet.getCell('A2').text).toBe(cash.provisionalNote);
    expect(sheet.getCell('B5').value).toBe(5000.25);
    const valueFor = (label: string) => sheet.getRows(1, sheet.rowCount)!.find(row => row.getCell(1).value === label)!.getCell(2).value;
    expect(valueFor('Net cash flow')).toBe(-299.5);
    expect(valueFor('ENDING CASH')).toBe(4700.75);
    expect(valueFor('Below minimum floor?')).toBe('BELOW FLOOR');
    expect(wb.getWorksheet('Assumptions')!.getCell('B2').numFmt).toBe('0.0%');
    expect(wb.getWorksheet('AR_Detail')!.getCell('D5').value).toBe(1234.56);
    const client = wb.getWorksheet('AR_Detail')!.getCell('B5');
    expect(client.value).toBe('=1+1');
    expect(client.type).toBe(ExcelJS.ValueType.String);
    const response = xlsxResponse(bytes, 'synthetic.xlsx');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  });

  it('round-trips fixed-cost totals, ruling markers and provisional allocation basis', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildFixedCostWorkbook(fixed));
    expect(wb.worksheets.map(s => s.name)).toEqual(['Pools', 'Register', 'Cost Structure', 'Allocation Preview']);
    expect(wb.getWorksheet('Pools')!.getCell('A1').text).toContain('basis_version 7 (PROVISIONAL');
    expect(wb.getWorksheet('Pools')!.getCell('B5').value).toBe(1200.5);
    expect(wb.getWorksheet('Register')!.getCell('K2').value).toBe('TEST-RULING');
    expect(wb.getWorksheet('Cost Structure')!.getCell('B9').value).toBe(6000);
    expect(wb.getWorksheet('Allocation Preview')!.getCell('A2').text).toContain('PLACEHOLDER BASIS');
    expect(wb.getWorksheet('Allocation Preview')!.getCell('C5').value).toBe(1200.5);
  });

  it('round-trips extended data bars through ExcelJS CommonJS UUID generation', async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('UUID compatibility');
    sheet.addRows([[12], [-3]]);
    sheet.addConditionalFormatting({ ref: 'A1:A2', rules: [{ type: 'dataBar', priority: 1,
      gradient: false, cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: 'FF11133F' } }] });
    const restored = new ExcelJS.Workbook();
    await restored.xlsx.load(await wb.xlsx.writeBuffer());
    const rule = restored.getWorksheet(1)!.conditionalFormattings[0].rules[0];
    expect(rule.type).toBe('dataBar');
    expect(rule.gradient).toBe(false);
    expect(rule.x14Id).toMatch(/^\{[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}\}$/i);
  });
});
