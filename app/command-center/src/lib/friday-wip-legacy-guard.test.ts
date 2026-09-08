import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import type {CommandCenterActor} from './access-control';
const mocks=vi.hoisted(()=>({env:{} as Record<string,string|undefined>,board:vi.fn(),supabase:vi.fn(),sendGuard:vi.fn(),classify:vi.fn(),fetch:vi.fn()}));
vi.mock('@lib/runtime-env',()=>({getRuntimeEnv:()=>mocks.env}));
vi.mock('@lib/friday-wip',()=>({loadFridayWipBoard:mocks.board}));
vi.mock('@lib/supabase.server',()=>({createServerSupabaseClient:mocks.supabase}));
vi.mock('@lib/outbound-guard',()=>({assertAgentSendAllowed:mocks.sendGuard,classifyRecipients:mocks.classify}));
import {GET as board} from '../pages/api/accounting/friday-wip.json';
import {POST as update} from '../pages/api/accounting/friday-wip/update';
import {POST as margin} from '../pages/api/accounting/friday-wip/margin';
import {POST as send} from '../pages/api/accounting/friday-wip/send';
import {GET as pack} from '../pages/api/accounting/friday-wip/pack';
import {GET as accrual} from '../pages/api/accounting/friday-wip/accrual.csv';
const routes=[{name:'board',handler:board,method:'GET'},{name:'update',handler:update,method:'POST'},{name:'margin',handler:margin,method:'POST'},{name:'send',handler:send,method:'POST'},{name:'pack',handler:pack,method:'GET'},{name:'accrual',handler:accrual,method:'GET'}];
const actor=(type:'human'|'service_agent',allowed=true):CommandCenterActor=>({id:'synthetic-'+type,type,displayName:'Synthetic actor',email:null,source:type==='human'?'workos':'service_token',roles:[],permissions:[],departmentAccess:allowed?['accounting']:['sales'],desktopEnabled:type==='human'});
const job='00000000-0000-4000-8000-000000000001';
const payload=(name:string)=>name==='update'?{jobId:job,field:'notes',value:'Synthetic meeting note'}:name==='margin'?{location:'synthetic',gmPct:30}:{};
const context=(name:string,method:string,who:CommandCenterActor|undefined)=>{const url=new URL('https://synthetic.invalid/api/accounting/friday-wip/'+name+'?meta=1&cutoff=2026-09-08&period_start=2026-01-01');const request=new Request(url,{method,...(!['GET','HEAD'].includes(method)?{body:JSON.stringify(payload(name)),headers:{'content-type':'application/json'}}:{})});return {url,request,locals:{actor:who}} as any;};
let db:any;
beforeEach(()=>{
 vi.clearAllMocks();mocks.env={CRM_WEEKLY_CANONICAL_ENABLED:'true',AGENTMAIL_API_KEY:'synthetic-test-only',FRIDAY_WIP_RECIPIENTS:'synthetic@example.invalid'};
 const query:any={};for(const method of ['select','eq','update'])query[method]=vi.fn(()=>query);
 query.maybeSingle=vi.fn(async()=>({data:{acculynx_job_id:job,notes:'Before',location:'synthetic'}}));query.single=vi.fn(async()=>({data:{acculynx_job_id:job,notes:'Synthetic meeting note'}}));query.insert=vi.fn(async()=>({error:null}));query.upsert=vi.fn(async()=>({error:null}));
 const storage={list:vi.fn(async()=>({data:[{name:'synthetic.xlsx'}],error:null})),createSignedUrl:vi.fn(async()=>({data:{signedUrl:'https://synthetic.invalid/pack'},error:null}))};
 db={from:vi.fn(()=>query),rpc:vi.fn(async()=>({data:[],error:null})),storage:{from:vi.fn(()=>storage)}};
 mocks.supabase.mockReturnValue({client:db,config:{missing:[]}});mocks.board.mockResolvedValue({status:'live',kpis:{billedAr:100,unbilled:50,totalBalance:150,collectedSince:0},groups:[]});mocks.fetch.mockResolvedValue(Response.json({ok:true}));vi.stubGlobal('fetch',mocks.fetch);
});
afterEach(()=>vi.unstubAllGlobals());
function noLegacyEffects(){for(const fn of [mocks.board,mocks.supabase,mocks.sendGuard,mocks.fetch,db.from,db.rpc,db.storage.from])expect(fn).not.toHaveBeenCalled();}
describe('actual legacy Friday handlers when canonical weekly mode is enabled',()=>{
 for(const route of routes)for(const type of ['human','service_agent'] as const){
  it(`${route.name}: ${type} receives conflict before any legacy effect`,async()=>{const c=context(route.name,route.method,actor(type));const body=vi.spyOn(c.request,'json');const response=await route.handler(c);expect(response.status).toBe(409);expect(await response.json()).toMatchObject({error:'canonical_friday_required',workspace:'/accounting/friday-wip'});expect(response.headers.get('location')).toBeNull();expect(response.headers.get('cache-control')).toBe('no-store');expect(body).not.toHaveBeenCalled();noLegacyEffects();});
  it(`${route.name}: ${type} unauthorized department still receives403`,async()=>{const response=await route.handler(context(route.name,route.method,actor(type,false)));expect(response.status).toBe(403);expect(await response.json()).toMatchObject({error:'forbidden'});noLegacyEffects();});
 }
 for(const route of routes){
  it(`${route.name}: missing actor still receives401`,async()=>{const response=await route.handler(context(route.name,route.method,undefined));expect(response.status).toBe(401);noLegacyEffects();});
  it(`${route.name}: no method can bypass its early canonical guard`,async()=>{for(const type of ['human','service_agent'] as const)for(const method of ['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS']){expect((await route.handler(context(route.name,method,actor(type)))).status).toBe(409);noLegacyEffects();}});
 }
});
describe('flag-off legacy handler compatibility',()=>{
 for(const flag of [undefined,'false','TRUE','1'])for(const route of routes)for(const type of ['human','service_agent'] as const){
  it(`${route.name}: ${type} retains actual legacy success with flag=${String(flag)}`,async()=>{mocks.env.CRM_WEEKLY_CANONICAL_ENABLED=flag;const response=await route.handler(context(route.name,route.method,actor(type)));expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
   if(route.name==='board'){expect(mocks.board).toHaveBeenCalledOnce();expect(await response.json()).toMatchObject({status:'live'});}
   if(route.name==='update'){expect(db.from).toHaveBeenCalledWith('wip_ar_master');expect(db.from).toHaveBeenCalledWith('wip_ar_master_updates');expect(await response.json()).toMatchObject({ok:true});}
   if(route.name==='margin'){expect(db.rpc).toHaveBeenCalledWith('refresh_wip_ar_master',{});expect(await response.json()).toMatchObject({ok:true});}
   if(route.name==='send'){expect(mocks.sendGuard).toHaveBeenCalledOnce();expect(mocks.fetch).toHaveBeenCalledOnce();expect(db.from).toHaveBeenCalledWith('wip_ar_master_updates');expect(await response.json()).toMatchObject({ok:true});}
   if(route.name==='pack'){expect(db.storage.from).toHaveBeenCalledWith('wip-packs');expect(await response.json()).toMatchObject({ok:true,name:'synthetic.xlsx',url:'https://synthetic.invalid/pack'});}
   if(route.name==='accrual'){expect(db.rpc).toHaveBeenCalledWith('wip_accrual_snapshot',{p_cutoff:'2026-09-08',p_period_start:'2026-01-01'});expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');expect(await response.text()).toContain('job_number,client,location');}
  });
 }
 for(const flag of [undefined,'false'])for(const route of routes)it(`${route.name}: flag=${String(flag)} retains401/403 before legacy effects`,async()=>{mocks.env.CRM_WEEKLY_CANONICAL_ENABLED=flag;expect((await route.handler(context(route.name,route.method,undefined))).status).toBe(401);for(const type of ['human','service_agent'] as const)expect((await route.handler(context(route.name,route.method,actor(type,false)))).status).toBe(403);noLegacyEffects();});
 it('retains legacy pack redirect when meta is absent and canonical flag isfalse',async()=>{mocks.env.CRM_WEEKLY_CANONICAL_ENABLED='false';const c=context('pack','GET',actor('human'));c.url.searchParams.delete('meta');const response=await pack(c);expect(response.status).toBe(302);expect(response.headers.get('location')).toBe('https://synthetic.invalid/pack');});
});
