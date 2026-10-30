// Values match the production crm_sync_log CHECK constraints. HTTP/run outcome
// names are a separate contract and must never be written directly to this log.
export async function startSyncAudit(sb:any,batchId:string,at:string):Promise<boolean>{
 const {error}=await sb.from("crm_sync_log").insert({sync_batch_id:batchId,sync_type:"incremental",started_at:at,status:"running",api_endpoint:"acculynx-sync"});
 return !error;
}
export function auditStatus(outcome:string):string{return outcome==="partial_success"?"partial":outcome;}
