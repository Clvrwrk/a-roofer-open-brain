import {beforeEach,describe,expect,it,vi} from 'vitest';
import ExcelJS from 'exceljs';
import {loadFixedCostBoard} from './fixed-costs';
import {localActor} from './access-control';
import {GET as jsonGet} from '../pages/api/executive/fixed-costs.json';
import {GET as xlsxGet} from '../pages/api/executive/fixed-costs.xlsx';
const state=vi.hoisted(()=>({rows:{} as Record<string,any[]>,fail:'',failFrom:0,reject:false,calls:[] as any[]}));
vi.mock('./supabase.server',()=>({createServerSupabaseClient:()=>({config:{missing:[]},client:{from:(table:string)=>{
 const query:any={filters:[] as any[],from:0,to:999};
 for(const method of ['select','eq','gte','lt','order'])query[method]=(...args:any[])=>{query.filters.push([method,...args]);return query};
 query.range=(from:number,to:number)=>{query.from=from;query.to=to;return query};
 query.then=(resolve:any,reject:any)=>{
  const key=table==='mv_overhead_account_month'?(query.filters.some((f:any[])=>f[0]==='eq')?'cogs':'actuals'):table;
  state.calls.push({table,filters:query.filters,from:query.from});
  if(state.reject)return Promise.reject(Error('transport')).then(resolve,reject);
  const all=state.rows[key];return Promise.resolve({data:all?.slice(query.from,query.to+1)??null,count:all?.length??null,error:state.fail===table&&query.from>=state.failFrom?{message:'read failed'}:null}).then(resolve,reject);
 };return query;
}}})}));
beforeEach(()=>{
 state.fail='';state.failFrom=0;state.reject=false;state.calls=[];
 state.rows={fixed_cost_register:[{id:1,account_fqn:'Synthetic rent',cost_pool:'facilities',cost_behavior:'fixed',attribution:'corporate',allocation_basis:'billed_share',ttm_amount:1200,monthly_budget:100,needs_ruling:false,provisional:true}],actuals:[],cogs:[],wip_ar_master:[],qbo_invoices:[]};
});
const ctx={locals:{actor:localActor()}} as any;
describe('fixed-cost availability and source basis',()=>{
 it('keeps counted zero invoices valid but all ratios/allocations unknown with zero denominators',async()=>{
  state.rows.fixed_cost_register[0].ttm_amount=0;state.rows.wip_ar_master=[{acculynx_job_id:'test',location:'Test',billed_total:0}];
  const board=await loadFixedCostBoard();expect(board.status).toBe('live');expect(board.ttmRevenue).toBe(0);expect(board.overheadPctOfRevenue).toBeNull();expect(board.grossMarginPct).toBeNull();expect(board.fixedShare).toBeNull();expect(board.officeAllocations[0].billedShare).toBeNull();expect(board.officeAllocations[0].corporateAllocated).toBeNull();
  const wb=new ExcelJS.Workbook();const download=await xlsxGet(ctx);expect(download.status).toBe(200);await wb.xlsx.load(Buffer.from(await download.arrayBuffer()));
  expect(wb.getWorksheet('Cost Structure')!.getCell('C4').value).toBeNull();expect(wb.getWorksheet('Allocation Preview')!.getCell('B5').value).toBeNull();expect(wb.getWorksheet('Basis')!.getCell('A1').text).toContain('Invoice values exclude');
 });
 it('fails all consumers on a late invoice page instead of returning partial revenue',async()=>{
  state.rows.qbo_invoices=Array.from({length:1001},(_,i)=>({qbo_id:String(i),total_amt:10}));state.fail='qbo_invoices';state.failFrom=1000;
  expect((await loadFixedCostBoard()).status).toBe('unconfigured');const r=await jsonGet(ctx);expect(r.status).toBe(503);expect(await r.json()).not.toHaveProperty('ttmRevenue');expect((await xlsxGet(ctx)).status).toBe(503);
 });
 it('includes more than1000 allocation rows and uses one closed-month period for invoices and costs',async()=>{
  state.rows.wip_ar_master=Array.from({length:1001},(_,i)=>({acculynx_job_id:String(i),location:i===1000?'Last':'First',billed_total:1}));state.rows.qbo_invoices=[{qbo_id:'q1',total_amt:2000},{qbo_id:'q2',total_amt:-100}];
  const board=await loadFixedCostBoard();expect(board.status).toBe('live');expect(board.ttmRevenue).toBe(1900);expect(board.officeAllocations.find(a=>a.location==='Last')!.billedShare).toBeCloseTo(1/1001);
  const invoice=state.calls.find(c=>c.table==='qbo_invoices');expect(invoice.filters).toContainEqual(['gte','txn_date',board.comparisonPeriod!.start]);expect(invoice.filters).toContainEqual(['lt','txn_date',board.comparisonPeriod!.endExclusive]);
  const cogs=state.calls.find(c=>c.table==='mv_overhead_account_month'&&c.filters.some((f:any[])=>f[0]==='eq'));expect(cogs.filters).toContainEqual(['gte','month',board.comparisonPeriod!.start]);expect(cogs.filters).toContainEqual(['lt','month',board.comparisonPeriod!.endExclusive]);expect(board.basisNote).toContain('unverified period');
 });
 it('preserves account cents before computing direct-cost totals and comparisons',async()=>{
  const now=new Date();const month=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,1)).toISOString().slice(0,10);
  state.rows.cogs=[{account_fqn:'A',month,amount:1.49},{account_fqn:'B',month,amount:1.49}];state.rows.qbo_invoices=[{qbo_id:'q',total_amt:10}];
  const board=await loadFixedCostBoard();expect(board.cogsTtm).toBe(2.98);expect(board.grossMarginTtm).toBe(7.02);
 });
 it('rejects missing register/null amounts and all read failures while preserving explicit negative input',async()=>{
  const original=structuredClone(state.rows);
  for(const [table,rows] of [['fixed_cost_register',[]],['qbo_invoices',[{qbo_id:'bad',total_amt:null}]],['wip_ar_master',[{acculynx_job_id:'bad',billed_total:''}]] ] as [string,any[]][]){state.rows=structuredClone(original);state.rows[table]=rows;expect((await loadFixedCostBoard()).status).toBe('unconfigured');}
  state.rows=original;state.rows.fixed_cost_register[0].ttm_amount=-10;expect((await loadFixedCostBoard()).status).toBe('live');
  for(const table of ['fixed_cost_register','mv_overhead_account_month','wip_ar_master','qbo_invoices']){state.fail=table;expect((await loadFixedCostBoard()).status).toBe('unconfigured');}
  state.fail='';state.reject=true;expect((await loadFixedCostBoard()).status).toBe('unconfigured');
 });
});
