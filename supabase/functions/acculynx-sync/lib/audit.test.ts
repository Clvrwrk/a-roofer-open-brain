import {assertEquals} from "jsr:@std/assert@1";
import {startSyncAudit,auditStatus} from "./audit.ts";
Deno.test("audit insert uses the actual database enum contract",async()=>{
 let inserted:any;
 const sb={from:()=>({insert:async(row:any)=>{inserted=row;return {error:["daily","manual","backfill","incremental","cron_trigger"].includes(row.sync_type)?null:{message:"check violation"}};}})};
 assertEquals(await startSyncAudit(sb,"test","2026-10-23T00:00:00Z"),true);
 assertEquals(inserted.sync_type,"incremental");assertEquals(inserted.status,"running");
 assertEquals(auditStatus("partial_success"),"partial");
});
Deno.test("audit failure is surfaced before upstream data work",async()=>{
 assertEquals(await startSyncAudit({from:()=>({insert:async()=>({error:{message:"db unavailable"}})})},"test","now"),false);
});
