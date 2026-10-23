import {it,expect} from 'vitest';
import {loadHailReconReceipt} from './hailrecon-state';
const client=(data:any,error:any=null,pending:any=null)=>({from:(table:string)=>{
 const q:any={select:()=>q,eq:()=>q,lt:()=>q,order:()=>q,limit:()=>q,maybeSingle:async()=>({data:table==='ihm_hail_alerts'?data:pending,error})};return q;
}}) as any;
it('reads accepted IHM receipts as the existing HailRecon connection',async()=>{
 const state=await loadHailReconReceipt(client({created_at:'2026-10-23T13:21:16Z'}));
 expect(state.light).toBe('green');expect(state.lastAt).toBe('2026-10-23T13:21:16Z');
});
it('does not call a quiet event-driven feed a scheduler outage',async()=>{
 expect((await loadHailReconReceipt(client(null))).light).toBe('unknown');
});
it('fails an unreadable or malformed receipt instead of inventing healthy state',async()=>{
 expect((await loadHailReconReceipt(client(null,{message:'fixture'}))).light).toBe('red');
 expect((await loadHailReconReceipt(client({created_at:'invalid'}))).light).toBe('red');
});

it('retains a pending projection failure even when later alerts were accepted',async()=>{
 const state=await loadHailReconReceipt(client({created_at:'2026-10-23T13:21:16Z'},null,{received_at:'2026-10-23T12:00:00Z'}));
 expect(state.light).toBe('red');expect(state.headline).toMatch(/unprocessed/);
});
