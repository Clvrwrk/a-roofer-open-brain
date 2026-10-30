import {assertEquals} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {restoreContactParents} from "./contact-parents.ts";
const id="10000000-0000-4000-8000-000000000001";
const acct={account_key:"test",market:"test"};
function mock(){const writes:any[]=[];const sb={from:()=>({select:()=>({in:()=>({eq:()=>Promise.resolve({data:[],error:null})})}),upsert:(row:any)=>{writes.push(row);return Promise.resolve({error:null});}})};return {sb,writes};}
Deno.test("missing parent restored from same-account authoritative contact before retry",async()=>{
 const {sb,writes}=mock();assertEquals(await restoreContactParents(sb,acct,[{contact_id:id}],Date.now()+10000,()=>Promise.resolve({status:200,body:{id,firstName:"Fixture"}})),true);
 assertEquals(writes[0].account_key,"test");assertEquals(writes[0].first_name,"Fixture");
});
Deno.test("failed, mismatched and over-budget reads never fabricate a contact",async()=>{
 for(const response of [{status:404,body:{}},{status:200,body:{id:"wrong"}}]){const {sb,writes}=mock();assertEquals(await restoreContactParents(sb,acct,[{contact_id:id}],Date.now()+10000,()=>Promise.resolve(response)),false);assertEquals(writes.length,0);}
 const {sb,writes}=mock();let calls=0;assertEquals(await restoreContactParents(sb,acct,[{contact_id:id}],0,()=>{calls++;throw new Error();}),false);assertEquals(calls,0);assertEquals(writes.length,0);
});
