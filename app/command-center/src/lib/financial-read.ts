export interface FinancialPage<T> {data:T[]|null;error:{message:string}|null;count:number|null}
/** A bounded scan may fail explicitly; it must never return an unproven prefix. */
export async function readCompleteFinancialRows<T>(label:string,read:(from:number,to:number)=>PromiseLike<FinancialPage<T>>,identity:(row:T)=>string):Promise<T[]> {
 const size=1000,maximum=100000,rows:T[]=[],seen=new Set<string>();let expected:number|undefined;
 for(let from=0;;from+=size){
  const page=await read(from,from+size-1);
  if(page.error || !Array.isArray(page.data))throw Error(`${label} could not be read completely.`);
  if(page.count===null || !Number.isSafeInteger(page.count) || page.count<0 || page.count>maximum)throw Error(`${label} population could not be verified within the read limit.`);
  if(expected!==undefined && expected!==page.count)throw Error(`${label} changed during the read. Try again.`);
  expected=page.count;
  if(page.data.length!==Math.min(size,Math.max(0,expected-from)))throw Error(`${label} returned an incomplete page.`);
  for(const row of page.data){const key=identity(row);if(!key || seen.has(key))throw Error(`${label} identities changed or were duplicated.`);seen.add(key);rows.push(row);}
  if(rows.length===expected)return rows;
 }
}
