// Focused read-only payment refresh; source archives precede typed money writes.
// deno-lint-ignore-file no-explicit-any
import {acculynxGet,archiveRaw,isJobFinancialsBody} from './job-walk.ts';
import {mapJobFinancials,mapInvoiceHeader} from '../lib/mappers.ts';
const BASE='https://api.acculynx.com/api/v2';
export async function syncWipFinancials(sb:any,acct:any,apiKey:string,deadline:number,batchId:string,fetchFn:typeof fetch=fetch,pace=130){
 const {data,error}=await sb.rpc('acculynx_financial_sync_candidates',{p_account_key:acct.account_key});
 if(error)throw new Error('financial_candidates_unavailable');
 const candidates=data??[];const walked:string[]=[];let errors=0;
 const get=async(path:string,type:string)=>{
  if(Date.now()>=deadline)throw new Error('financial_budget_stop');
  if(pace)await new Promise(r=>setTimeout(r,pace));
  const response=await acculynxGet(BASE+path,apiKey,fetchFn);
  // Do not call an unarchived observation complete.
  const {error}=await sb.from('acculynx_raw').insert({sync_batch_id:batchId,resource_type:type,api_endpoint:path,http_status:response.status,payload:response.body,page_index:null});
  if(error)throw new Error('financial_archive_failed');
  return response;
 };
 for(const row of candidates){
  if(Date.now()>=deadline)break;
  const id=row.job_id;const ctx={account_key:acct.account_key,market:acct.market,job_id:id,now:new Date().toISOString()};
  try{
   const financial=await get(`/jobs/${encodeURIComponent(id)}/financials`,'job_financials');
   if(financial.status!==200||!isJobFinancialsBody(financial.body))throw new Error('invalid_financial_observation');
   const headers:any[]=[];let page=0;let complete=false;
   while(Date.now()<deadline&&page<200){
    const invoices=await get(`/jobs/${encodeURIComponent(id)}/invoices?pageSize=25&pageStartIndex=${page}`,'invoices');
    const body=invoices.body as any;
    if(invoices.status!==200||!Array.isArray(body?.items)||typeof body.count!=='number'||body.count<0)throw new Error('invalid_invoice_observation');
    for(const inv of body.items){
     if(typeof inv.id!=='string'||!inv.id||!['totalPrice','balanceDue'].every(k=>inv[k]===null||typeof inv[k]==='number'&&Number.isFinite(inv[k])))throw new Error('invalid_invoice_header');
     headers.push(mapInvoiceHeader(inv,ctx));
    }
    if(headers.length>=body.count){complete=true;break;}
    if(!body.items.length)throw new Error('truncated_invoice_observation');
    page++;
   }
   if(!complete)break; // resumable budget stop, never falsely fresh
   if(headers.length){const {error}=await sb.from('acculynx_invoices').upsert(headers);if(error)throw new Error('invoice_header_write_failed');}
   const {error}=await sb.from('acculynx_job_financials').upsert(mapJobFinancials(financial.body,ctx));
   if(error)throw new Error('financial_write_failed');
   walked.push(id);
  }catch(e){
   if((e as Error).message==='financial_budget_stop')break;
   errors++;
   await sb.from('acculynx_job_walk_errors').insert({account_key:acct.account_key,job_id:id,resource_type:'financial_refresh',sync_batch_id:batchId,error_message:(e as Error).message,http_status:null});
  }
 }
 return {candidates:candidates.length,walked,errors};
}
