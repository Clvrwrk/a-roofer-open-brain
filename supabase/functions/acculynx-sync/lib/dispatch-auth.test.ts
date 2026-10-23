import { assertEquals } from "jsr:@std/assert@1";
import { authorizeDispatch } from "./dispatch-auth.ts";
const id = "10000000-0000-4000-8000-000000000001";
Deno.test("dispatch denies missing token before any database call", async () => {
  let calls = 0;
  const r = await authorizeDispatch(new Request("https://example.test", {method:"POST",body:JSON.stringify({dispatch_run_id:id})}), {rpc:()=>{calls++;}});
  assertEquals(r instanceof Response && r.status, 401); assertEquals(calls,0);
});
Deno.test("dispatch rejects malformed IDs and tokens", async () => {
  const r = await authorizeDispatch(new Request("https://example.test", {method:"POST",headers:{"x-sync-token":"x"},body:JSON.stringify({dispatch_run_id:"bad"})}), {});
  assertEquals(r instanceof Response && r.status,401);
});
Deno.test("dispatch uses database-authorized scope, never caller-supplied account options", async () => {
  const r = await authorizeDispatch(new Request("https://example.test", {method:"POST",headers:{"x-sync-token":"a".repeat(64)},body:JSON.stringify({dispatch_run_id:id,accountFilter:["other"]})}), {rpc:async()=>({data:{body:{multiAccount:true,accountFilter:["test"]}},error:null})});
  assertEquals(r instanceof Response,false);
  if (!(r instanceof Response)) assertEquals(r.body.accountFilter,["test"]);
});
Deno.test("expired, replayed and invalid dispatches fail closed", async () => {
  const r = await authorizeDispatch(new Request("https://example.test", {method:"POST",headers:{"x-sync-token":"a".repeat(64)},body:JSON.stringify({dispatch_run_id:id})}), {rpc:async()=>({data:null,error:null})});
  assertEquals(r instanceof Response && r.status,401);
});
Deno.test("authorization database outage does not start a sync or expose details", async () => {
  const r = await authorizeDispatch(new Request("https://example.test", {method:"POST",headers:{"x-sync-token":"a".repeat(64)},body:JSON.stringify({dispatch_run_id:id})}), {rpc:async()=>({error:{message:"sensitive database detail"}})});
  assertEquals(r instanceof Response && r.status,503);
  if(r instanceof Response) assertEquals((await r.text()).includes("sensitive"),false);
});
