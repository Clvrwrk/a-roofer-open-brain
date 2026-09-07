import {describe,it,expect} from 'vitest';
import {readCompleteFinancialRows} from './financial-read';
describe('complete financial reads',()=>{
 it('reads more than the former20000 limit without losing a row',async()=>{
  const total=20001;let reads=0;
  const rows=await readCompleteFinancialRows('synthetic',async(from,to)=>{reads++;return {data:Array.from({length:Math.max(0,Math.min(to+1,total)-from)},(_,i)=>({id:String(from+i)})),count:total,error:null}},r=>r.id);
  expect(rows).toHaveLength(total);expect(reads).toBe(21);expect(rows.at(-1)?.id).toBe('20000');
 });
 it('rejects late errors, truncated pages, changed counts and duplicates',async()=>{
  const first=Array.from({length:1000},(_,i)=>({id:String(i)}));
  for(const later of [{data:null,count:1001,error:{message:'failed'}},{data:[],count:1001,error:null},{data:[{id:'1000'}],count:1002,error:null},{data:[{id:'999'}],count:1001,error:null}]){
   await expect(readCompleteFinancialRows('synthetic',async from=>from===0?{data:first,count:1001,error:null}:later,r=>r.id)).rejects.toThrow();
  }
 });
 it('distinguishes a counted empty set from an unverified or over-limit population',async()=>{
  expect(await readCompleteFinancialRows('synthetic',async()=>({data:[],count:0,error:null}),()=>'' )).toEqual([]);
  for(const count of [null,100001])await expect(readCompleteFinancialRows('synthetic',async()=>({data:[],count,error:null}),()=>'' )).rejects.toThrow();
 });
});
