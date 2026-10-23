import {assertEquals,assertStringIncludes} from 'jsr:@std/assert';
import {completeStoredWebhook,reportIhmOutcome} from './observability.ts';
Deno.test('projection failure keeps archived webhook pending and emits a failure',async()=>{
 let acknowledged=false;const reports:any[]=[];
 const client={from:()=>{acknowledged=true;throw new Error('should not ack');}};
 const ok=await completeStoredWebhook(client,1,async()=>{throw new Error('synthetic projection failure');},async(...args)=>{reports.push(args);});
 assertEquals(ok,false);assertEquals(acknowledged,false);assertEquals(reports,[[false,'webhook_projection_failed']]);
});
Deno.test('acknowledgement failure is not recorded as success',async()=>{
 const reports:any[]=[];const client={from:()=>({update:()=>({eq:()=>({throwOnError:()=>{throw new Error('fixture ack');}})})})};
 assertEquals(await completeStoredWebhook(client,1,async()=>{},async(...args)=>{reports.push(args);}),false);
 assertEquals(reports,[[false,'webhook_projection_failed']]);
});
Deno.test('projection plus durable acknowledgement records success',async()=>{
 const order:string[]=[];const client={from:()=>({update:()=>({eq:()=>({throwOnError:async()=>{order.push('ack');}})})})};
 assertEquals(await completeStoredWebhook(client,1,async()=>{order.push('project');},async()=>{order.push('report');}),true);
 assertEquals(order,['project','ack','report']);
});
Deno.test('database health recording failure uses sanitized independent Sentry fallback',async()=>{
 let body='';await reportIhmOutcome({rpc:()=>({abortSignal:async()=>({error:{message:'private fixture data'}})})},false,'webhook_storage_failed',async(url,init)=>{
  assertStringIncludes(String(url),'ingest.us.sentry.io');body=String((init as {body?:unknown})?.body);return new Response('{}');
 });
 assertStringIncludes(body,'webhook_storage_failed');assertEquals(body.includes('private fixture data'),false);
});
Deno.test('successful durable health report needs no fallback delivery',async()=>{
 let sent=false;await reportIhmOutcome({rpc:()=>({abortSignal:async()=>({error:null})})},true,null,async()=>{sent=true;return new Response('{}');});assertEquals(sent,false);
});
