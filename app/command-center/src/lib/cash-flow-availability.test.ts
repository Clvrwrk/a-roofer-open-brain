import ExcelJS from 'exceljs';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {requiredForecastAssumptions} from './cash-flow-inputs';
import {loadCashFlowBoard} from './cash-flow';
import {localActor} from './access-control';
import {GET as jsonGet} from '../pages/api/accounting/cash-flow.json';
import {GET as executiveGet} from '../pages/api/executive/cash-runway.json';
import {GET as xlsxGet} from '../pages/api/accounting/cash-flow.xlsx';
const state=vi.hoisted(()=>({rows:{} as Record<string,unknown>,failure:'',reject:false}));
vi.mock('./supabase.server',()=>({createServerSupabaseClient:()=>({config:{missing:[]},client:{from:(table:string)=>{
 const result=()=>state.reject?Promise.reject(Error('transport unavailable')):Promise.resolve({data:state.rows[table],error:state.failure===table?{message:'read failed'}:null});
 const query:any={then:(resolve:Function,reject:Function)=>result().then(resolve as any,reject as any)};
 for(const key of ['select','order','eq','is','gt','limit','maybeSingle'])query[key]=()=>query;
 return query;
}}})}));
beforeEach(()=>{
 state.failure='';state.reject=false;
 state.rows={wcf_assumptions:requiredForecastAssumptions.map(key=>({key,value:key==='new_billings_ramp_week'?1:0,min_value:key==='new_billings_ramp_week'?1:0,max_value:key==='new_billings_ramp_week'?13:key==='undated_collection_pct'?1:100000000})),v_cash_position:[{account_name:'Synthetic bank',balance:'0.00'}],v_13wcf_receipts_week:[],v_13wcf_undated_pool:{jobs:0,expected_cash:null,insurance_cash:null},wip_ar_master:[]};
});
const context={locals:{actor:localActor()}} as any;
describe('cash forecast availability across consumers',()=>{
 it('preserves explicit bank zero and legitimate empty AR',async()=>{
  const board=await loadCashFlowBoard();expect(board.status).toBe('live');expect(board.beginningCash).toBe(0);expect(board.weeks).toHaveLength(13);expect(board.weeks.every(w=>w.weeksOfCash===null)).toBe(true);
  expect((await jsonGet(context)).status).toBe(200);expect((await executiveGet(context)).status).toBe(200);const download=await xlsxGet(context);expect(download.status).toBe(200);
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(await download.arrayBuffer()));
  const sheet=workbook.getWorksheet('13WCF')!;
  for(const label of ['Weeks of cash on hand','  ≈ months of cash (4.345 wks/mo)']) expect(sheet.getRows(1,sheet.rowCount)!.find(r=>r.getCell(1).value===label)!.getCell(2).value).toBeNull();
 });
 it('blocks every consumer when bank rows or a bank balance are missing',async()=>{
  for(const banks of [[],[{balance:null}],[{balance:''}],[{balance:'NaN'}],[{balance:false}]]){
   state.rows.v_cash_position=banks;expect((await loadCashFlowBoard()).status).toBe('unconfigured');
   const response=await jsonGet(context);expect(response.status).toBe(503);expect(await response.json()).not.toHaveProperty('beginningCash');
   expect((await xlsxGet(context)).status).toBe(503);expect((await executiveGet(context)).status).toBe(503);
  }
 });
 it('requires every assumption without interpreting missing values as zero',async()=>{
  const original=structuredClone(state.rows.wcf_assumptions) as any[];
  for(const key of requiredForecastAssumptions){state.rows.wcf_assumptions=original.filter(a=>a.key!==key);expect((await loadCashFlowBoard()).status).toBe('unconfigured');}
  for(const value of [null,undefined,'',NaN,Infinity,false,-1,100000001]){state.rows.wcf_assumptions=original.map((a,i)=>i===0?{...a,value}:a);expect((await loadCashFlowBoard()).status).toBe('unconfigured');}
 });
 it('distinguishes empty aggregates from missing or incomplete totals',async()=>{
  for(const pool of [null,{jobs:1,expected_cash:null,insurance_cash:null},{jobs:undefined,expected_cash:null,insurance_cash:null}]){state.rows.v_13wcf_undated_pool=pool;expect((await loadCashFlowBoard()).status).toBe('unconfigured');}
  state.rows.v_13wcf_undated_pool={jobs:1,expected_cash:'120.55',insurance_cash:null};expect((await loadCashFlowBoard()).status).toBe('live');
 });
 it('rejects source dates and receipt totals that cannot come from the canonical views',async()=>{
  for(const date of ['2026-02-30','2026-13-01','not-a-date']){state.rows.v_13wcf_receipts_week=[{week_start:date,past_expected:false,jobs:1,expected_cash:100}];expect((await loadCashFlowBoard()).status).toBe('unconfigured');}
  state.rows.v_13wcf_receipts_week=[];
  for(const pool of [{jobs:1,expected_cash:-1,insurance_cash:null},{jobs:0,expected_cash:100,insurance_cash:null},{jobs:1,expected_cash:100,insurance_cash:101}]){state.rows.v_13wcf_undated_pool=pool;expect((await loadCashFlowBoard()).status).toBe('unconfigured');}
 });
 it('rejects malformed detail and handles query errors and rejected transport',async()=>{
  state.rows.wip_ar_master=[{outstanding_ar:null}];expect((await loadCashFlowBoard()).status).toBe('unconfigured');state.rows.wip_ar_master=[];
  for(const table of Object.keys(state.rows)){state.failure=table;expect((await loadCashFlowBoard()).status).toBe('unconfigured');}
  state.failure='';state.reject=true;expect((await loadCashFlowBoard()).status).toBe('unconfigured');expect((await jsonGet(context)).status).toBe(503);expect((await xlsxGet(context)).status).toBe(503);expect((await executiveGet(context)).status).toBe(503);
 });
});
