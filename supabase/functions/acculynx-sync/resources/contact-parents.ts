// Repair an ordering dependency with authoritative reads, under the same tenant and budget.
// deno-lint-ignore-file no-explicit-any
import {mapContact} from "./contacts.ts";
export async function restoreContactParents(sb:any,acct:any,rows:Record<string,unknown>[],deadline:number,getContact:(id:string)=>Promise<{status:number;body:unknown}>):Promise<boolean>{
 const ids=[...new Set(rows.map(r=>r.contact_id).filter((id):id is string=>typeof id==="string"&&/^[0-9a-f-]{36}$/i.test(id)))];
 if(!ids.length)return false;
 const {data,error}=await sb.from("acculynx_contacts").select("id").in("id",ids).eq("account_key",acct.account_key);
 if(error)return false;
 const existing=new Set((data??[]).map((r:any)=>r.id));
 for(const id of ids.filter(id=>!existing.has(id))){
  if(Date.now()>=deadline)return false;
  const response=await getContact(id);
  const body=response.body as any;
  if(response.status!==200||!body||body.id!==id)return false;
  const {error}=await sb.from("acculynx_contacts").upsert(mapContact(body,acct,new Date().toISOString()),{onConflict:"id"});
  if(error)return false;
 }
 return true;
}
