import {assertEquals} from 'jsr:@std/assert';
import {verifySignature} from './security.ts';
async function sign(body:string,secret:string){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
Deno.test('accepts the valid provider signature contract',async()=>{
 const body='{"fixture":"accepted"}',secret='synthetic-signing-secret';
 assertEquals(await verifySignature(body,await sign(body,secret),secret),true);
 // Preserve the provider's existing trimmed-body signing contract.
 assertEquals(await verifySignature(' '+body+'\n',await sign(body,secret),secret),true);
});
Deno.test('rejects tampered body, different secret and signature length',async()=>{
 const body='{"fixture":"accepted"}',secret='synthetic-signing-secret',sig=await sign(body,secret);
 assertEquals(await verifySignature(body.replace('accepted','tampered'),sig,secret),false);
 assertEquals(await verifySignature(body,sig,'other-fixture-secret'),false);
 assertEquals(await verifySignature(body,sig.slice(1),secret),false);
});
Deno.test('fails closed when signature or configured secret is missing',async()=>{
 assertEquals(await verifySignature('{}','','fixture-secret'),false);
 assertEquals(await verifySignature('{}','fixture-signature',''),false);
});
