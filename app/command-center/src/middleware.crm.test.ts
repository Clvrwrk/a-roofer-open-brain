import {it,expect,vi,beforeEach} from 'vitest';
const d=vi.hoisted(()=>({env:{} as Record<string,string>, authenticate:vi.fn(), access:vi.fn()}));
vi.mock('astro:middleware',()=>({defineMiddleware:(f:unknown)=>f}));
vi.mock('@sentry/astro',()=>({setUser:vi.fn(),setTag:vi.fn()}));
vi.mock('@lib/runtime-env',()=>({getRuntimeEnv:()=>d.env}));
vi.mock('@lib/prewarm.server',()=>({prewarmSurfaceCaches:vi.fn(),recordCommandCenterActivity:vi.fn()}));
vi.mock('@lib/agent-service-token.server',()=>({resolveRegistryServiceActorFromBearer:vi.fn(async()=>null)}));
vi.mock('@lib/session.server',()=>({SESSION_COOKIE:'wos-session',SESSION_COOKIE_OPTIONS:{httpOnly:true},authenticateSession:d.authenticate}));
vi.mock('@lib/crm-access.server',async(importOriginal)=>({...await importOriginal<object>(),resolveCrmHumanAccess:d.access}));
import {onRequest} from './middleware';
function context(path='/sales/wip-ar') {const url=new URL(path,'https://cc.example');return {url,request:new Request(url),cookies:{get:vi.fn(()=>({value:'old-sealed'})),set:vi.fn()},locals:{},redirect:(location:string,status:number)=>new Response(null,{status,headers:{location}})};}
beforeEach(()=>{vi.clearAllMocks();d.env={CRM_CANONICAL_ENABLED:'true',COMMAND_CENTER_AUTH_MODE:'workos'};});
it('fails closed before Local Operator fallback on incompatible canonical configuration',async()=>{
 for(const mode of ['', 'local', 'disabled']){d.env.COMMAND_CENTER_AUTH_MODE=mode;const next=vi.fn();const response=await onRequest(context() as never,next as never);expect(response.status).toBe(503);expect(next).not.toHaveBeenCalled();expect(d.authenticate).not.toHaveBeenCalled();}
});
it('persists verified refreshed state even when canonical access subsequently fails',async()=>{
 d.authenticate.mockResolvedValue({status:'authenticated',user:{id:'user-a',email:'rep@example.invalid'},refreshedSealedSession:'fresh-sealed'});d.access.mockResolvedValue(null);
 const c=context();const next=vi.fn();const response=await onRequest(c as never,next as never);expect(c.cookies.set).toHaveBeenCalledWith('wos-session','fresh-sealed',{httpOnly:true});expect(response.status).toBe(302);expect(response.headers.get('location')).toBe('/auth/denied');expect(next).not.toHaveBeenCalled();
});
it('enforces sales-only route denial before protected handlers',async()=>{
 d.authenticate.mockResolvedValue({status:'authenticated',user:{id:'u',email:'e'},refreshedSealedSession:null});d.access.mockResolvedValue({actor:{type:'human',source:'workos'},salesOnly:true});
 for(const path of ['/accounting','/api/accounting','/sales/unknown','/sales/pipeline','/operations']){const next=vi.fn();expect((await onRequest(context(path) as never,next as never)).status).toBe(403);expect(next).not.toHaveBeenCalled();}
 const next=vi.fn(async()=>new Response('ok'));expect((await onRequest(context('/sales/wip-ar') as never,next as never)).status).toBe(200);expect(next).toHaveBeenCalledOnce();
});
