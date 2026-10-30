import {it,expect} from 'vitest';
import {runProbe} from './integration-probes.server';
import {INTEGRATIONS} from './runtime-registry';
it('uses the existing server credential for the private Supabase data probe',async()=>{
 const spec=INTEGRATIONS.find(x=>x.key==='int.supabase-rest')!;
 expect(spec.authEnv).toBe('SUPABASE_SERVICE_ROLE_KEY');
 let headers:any;
 const result=await runProbe(spec,{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-jwt'},Date.now(),async(_url,init)=>{headers=init?.headers;return new Response('[]',{status:200});});
 expect(result.ok).toBe(true);expect(headers.apikey).toBe('fixture-jwt');expect(headers.authorization).toBe('Bearer fixture-jwt');
});
it('sends new opaque API keys only in the apikey header',async()=>{
 let headers:any;
 await runProbe(INTEGRATIONS.find(x=>x.key==='int.supabase-rest')!,{SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_fixture'},Date.now(),async(_url,init)=>{headers=init?.headers;return new Response('[]',{status:200});});
 expect(headers.apikey).toBe('sb_secret_fixture');expect(headers.authorization).toBeUndefined();
});
