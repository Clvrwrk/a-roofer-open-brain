import {it,expect,vi,beforeEach} from 'vitest';
const sdk=vi.hoisted(()=>({loadSealedSession:vi.fn()}));
vi.mock('./workos.server',()=>({getWorkOs:()=>({userManagement:sdk})}));
import {authenticateSession} from './session.server';
import {attachCrmStaffSession} from './crm-staff.server';
const token=(c:object)=>`header.${Buffer.from(JSON.stringify(c)).toString('base64url')}.signature`;
const claims={sub:'user-a',org_id:'org-a',sid:'sid-a',role:'member',exp:Math.floor(Date.now()/1000)+600};
const user={id:'user-a',email:'test@example.invalid',firstName:'Synthetic',lastName:'Person',emailVerified:true};
const success={authenticated:true,user,organizationId:claims.org_id,sessionId:claims.sid,accessToken:token(claims)};
const env={CRM_WORKOS_ORGANIZATION_ID:'org-a',CRM_CANONICAL_ENABLED:'true',COMMAND_CENTER_AUTH_MODE:'workos',WORKOS_COOKIE_PASSWORD:'synthetic-cookie-password-more-than32',COMMAND_CENTER_PUBLIC_URL:'https://cc.example'};
const human={type:'human',source:'workos'};
beforeEach(()=>vi.clearAllMocks());
it('uses verified sealed session identity only on the staff sales namespace',async()=>{
 sdk.loadSealedSession.mockReturnValue({authenticate:vi.fn(async()=>success)});const result=await authenticateSession('sealed',env);expect(result.status).toBe('authenticated');
 const session=attachCrmStaffSession('/api/sales/v1/session',human,result,env);expect(session?.accessToken).toBe(success.accessToken);expect(session?.csrfToken).toBeTruthy();
 for(const actor of [null,{type:'local_operator',source:'local'},{type:'service_agent',source:'service_token'},{type:'human',source:'local'}])expect(attachCrmStaffSession('/api/sales/v1/session',actor,result,env)).toBeUndefined();
 for(const path of ['/sales','/api/sales-other/v1/session','/api/accounting'])expect(attachCrmStaffSession(path,human,result,env)).toBeUndefined();
 for(const override of [{CRM_CANONICAL_ENABLED:'false'},{COMMAND_CENTER_AUTH_MODE:'disabled'},{WORKOS_COOKIE_PASSWORD:''}])expect(attachCrmStaffSession('/api/sales/v1/session',human,result,{...env,...override})).toBeUndefined();
 if(result.status==='authenticated')expect(result.user).not.toHaveProperty('accessToken');
});
it('reauthenticates refreshed sealed state before forwarding its current token',async()=>{
 const fresh={...success,accessToken:token({...claims,exp:claims.exp+300})};const authenticate=vi.fn(async()=>fresh);
 sdk.loadSealedSession.mockReturnValueOnce({authenticate:vi.fn(async()=>({authenticated:false,reason:'invalid_jwt'})),refresh:vi.fn(async()=>({authenticated:true,sealedSession:'fresh-sealed',user,session:{accessToken:'untrusted-refresh-token'}}))}).mockReturnValueOnce({authenticate});
 const result=await authenticateSession('old-sealed',env);expect(result.status).toBe('authenticated');expect(authenticate).toHaveBeenCalledOnce();expect(sdk.loadSealedSession).toHaveBeenLastCalledWith({sessionData:'fresh-sealed',cookiePassword:env.WORKOS_COOKIE_PASSWORD});
 if(result.status==='authenticated'){expect(result.crmIdentity?.accessToken).toBe(fresh.accessToken);expect(result.refreshedSealedSession).toBe('fresh-sealed');}
});
it('fails closed on fresh verification failure or user mismatch and never forwards refresh-only token',async()=>{
 for(const fresh of [{authenticated:false},{...success,user:{...user,id:'other'}}]){
 sdk.loadSealedSession.mockReset().mockReturnValueOnce({authenticate:vi.fn(async()=>({authenticated:false,reason:'invalid_jwt'})),refresh:vi.fn(async()=>({authenticated:true,sealedSession:'fresh',user,session:{accessToken:'unverified'}}))}).mockReturnValueOnce({authenticate:vi.fn(async()=>fresh)});
 expect((await authenticateSession('sealed',env)).status).toBe('unauthenticated');}
});
it('does not substitute CC email roles for missing or mismatched canonical organization identity',async()=>{
 for(const identity of [{...success,organizationId:undefined},{...success,organizationId:'wrong-org'},{...success,accessToken:token({...claims,role:'service_role'})}]){
 sdk.loadSealedSession.mockReturnValue({authenticate:vi.fn(async()=>identity)});const result=await authenticateSession('sealed',env);expect(attachCrmStaffSession('/api/sales/v1/session',human,result,env)).toBeUndefined();}
});

it('does not attach canonical authority for an unverified email',async()=>{sdk.loadSealedSession.mockReturnValue({authenticate:vi.fn(async()=>({...success,user:{...user,emailVerified:false}}))});const result=await authenticateSession('sealed',env);expect(attachCrmStaffSession('/api/sales/v1/session',human,result,env)).toBeUndefined();});
