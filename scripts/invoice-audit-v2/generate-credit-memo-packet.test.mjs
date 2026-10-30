import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const script=fileURLToPath(new URL('./generate-credit-memo-packet.mjs',import.meta.url));
function run(mode='invoice') {
 const dir=mkdtempSync(join(tmpdir(),'srs-packet-test-'));
 const mock=join(dir,'mock.mjs');
 writeFileSync(mock,`globalThis.fetch=async(input)=>{const u=new URL(input);let data;
 if(u.pathname.endsWith('/invoice_line_reaudit')) {if(u.searchParams.get('vendor_slug')!=='eq.srs')throw Error('missing vendor scope');data=[{invoice_number:'TEST-1',item_number:'ITEM',item_description:'Fixture item',quantity:2,uom:'BX',invoiced_price:30,office_price:20,variance_ext:20,office_name:'Test office',agreement_number:process.env.PACKET_MODE==='missing'?'':'AGR-1',agreement_effective:'2026-01-01',agreement_expiry:null,match_method:'item_number'}];}
 else if(u.pathname.endsWith('/vendors'))data=[{id:'fixture-vendor'}];
 else if(u.pathname.endsWith('/vendor_invoices')){if(u.searchParams.get('vendor_id')!=='eq.fixture-vendor')throw Error('missing vendor invoice scope');data=[{invoice_number:'TEST-1',invoice_date:'2026-10-01',doc_type:process.env.PACKET_MODE==='credit'?'credit':'invoice',total_due:process.env.PACKET_MODE==='credit'?-100:100}];}
 else throw Error('unexpected source '+u.pathname);
 return new Response(JSON.stringify(data),{status:200});};`);
 const execute=()=>execFileSync(process.execPath,['--import',mock,script,'--vendor=srs','--run=fixture','--outdir='+dir],{env:{...process.env,SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-only',PACKET_MODE:mode},encoding:'utf8',stdio:['ignore','pipe','pipe']});
 return {dir,execute,cleanup:()=>rmSync(dir,{recursive:true,force:true})};
}
test('SRS packet uses supplier scope and dates without historical ABC correspondence',()=>{
 const t=run();try {const result=JSON.parse(t.execute());assert.equal(result.invoices,1);assert.equal(result.total,20);const detail=readFileSync(join(t.dir,'credit_memo_request_detail.csv'),'utf8');assert.match(detail,/SRS Distribution,TEST-1,2026-10-01/);const html=readFileSync(join(t.dir,'credit_memo_request_email_srs.html'),'utf8');assert.doesNotMatch(html,/Casey|July 28|supersedes/i);}finally{t.cleanup();}
});
test('credit documents cannot become a new claim packet',()=>{const t=run('credit');try {assert.throws(t.execute,/requires matching positive invoices/);}finally{t.cleanup();}});
test('missing agreement provenance blocks the packet',()=>{const t=run('missing');try {assert.throws(t.execute,/lacks office\/agreement provenance/);}finally{t.cleanup();}});
