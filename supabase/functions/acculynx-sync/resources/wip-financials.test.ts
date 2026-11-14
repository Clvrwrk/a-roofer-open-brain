// deno-lint-ignore-file no-explicit-any
import {assertEquals} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {syncWipFinancials} from './wip-financials.ts';
function setup(candidates=[{job_id:'job'}]){const writes:any[]=[];return {writes,sb:{rpc:()=>Promise.resolve({data:candidates}),from:(table:string)=>({insert:(rows:any)=>{writes.push({table,rows});return Promise.resolve({error:null});},upsert:(rows:any)=>{writes.push({table,rows});return Promise.resolve({error:null});}})}};}
const acct={account_key:'test',market:'test'};
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
Deno.test('financial pass archives source, pages all invoices, then marks financial snapshot fresh',async()=>{
 const {sb,writes}=setup();let calls=0;
 const fetcher=(async(input:any)=>{calls++;return String(input).includes('/financials')?response({approvedJobValue:100,balanceDue:20}):response({count:2,items:[{id:'inv'+calls,totalPrice:100,balanceDue:20}]});}) as typeof fetch;
 const result=await syncWipFinancials(sb,acct,'fixture',Date.now()+10000,'batch',fetcher,0);
 assertEquals(result.walked,['job']);assertEquals(calls,3);
 assertEquals(writes.filter(x=>x.table==='acculynx_invoices')[0].rows.length,2);
 assertEquals(writes.at(-1).table,'acculynx_invoices');
 assertEquals(writes[0].table,'acculynx_raw');
});
Deno.test('invalid financial payload never makes money fresh',async()=>{
 const {sb,writes}=setup();const fetcher=(async(input:any)=>String(input).includes('/financials')?response({error:'bad'}):response({count:1,items:[]})) as typeof fetch;
 const result=await syncWipFinancials(sb,acct,'fixture',Date.now()+10000,'batch',fetcher,0);
 assertEquals(result.errors,1);assertEquals(writes.some(x=>x.table==='acculynx_job_financials'),false);
});
Deno.test('truncated invoice payload keeps a valid financial snapshot fresh',async()=>{
 const {sb,writes}=setup();const fetcher=(async(input:any)=>String(input).includes('/financials')?response({approvedJobValue:100,balanceDue:20}):response({count:1,items:[]})) as typeof fetch;
 const result=await syncWipFinancials(sb,acct,'fixture',Date.now()+10000,'batch',fetcher,0);
 assertEquals(result.errors,1);assertEquals(writes.some(x=>x.table==='acculynx_job_financials'),true);
});
Deno.test('budget stop performs no provider call and remains resumable',async()=>{
 const {sb}=setup();let calls=0;const result=await syncWipFinancials(sb,acct,'fixture',0,'batch',(()=>{calls++;throw new Error();}) as typeof fetch,0);
 assertEquals(calls,0);assertEquals(result.walked,[]);
});
Deno.test('persists job financials before invoice headers finish paging',async()=>{
 const {sb,writes}=setup();
 const fetcher=(async(input:any)=>String(input).includes('/financials')?response({approvedJobValue:100,balanceDue:20}):response({count:1,items:[{id:'inv1',totalPrice:100,balanceDue:20}]})) as typeof fetch;
 await syncWipFinancials(sb,acct,'fixture',Date.now()+10000,'batch',fetcher,0);
 const finIdx=writes.findIndex(x=>x.table==='acculynx_job_financials');
 const invIdx=writes.findIndex(x=>x.table==='acculynx_invoices');
 assertEquals(finIdx>=0,true);assertEquals(invIdx>=0,true);assertEquals(finIdx<invIdx,true);
});
Deno.test('budget stop during invoice paging still refreshes job financial snapshot',async()=>{
 const {sb,writes}=setup();
 const fetcher=(async(input:any)=>String(input).includes('/financials')?response({approvedJobValue:100,balanceDue:20}):response({count:50,items:[{id:'inv1',totalPrice:100,balanceDue:20}]})) as typeof fetch;
 const result=await syncWipFinancials(sb,acct,'fixture',Date.now()+500,'batch',fetcher,0);
 assertEquals(result.walked,['job']);
 assertEquals(writes.some(x=>x.table==='acculynx_job_financials'),true);
});
