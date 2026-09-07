import {createCrmStaffSession,type CrmStaffSession} from '@proexteriors/crm-server';
import type {SessionResult} from './session.server';
import type {RuntimeEnv} from './runtime-env';
/** Accept only the existing middleware's authenticated human result, never bearer headers or local actors. */
export function attachCrmStaffSession(path:string,actor:{type:string;source:string}|null,result:SessionResult,env:RuntimeEnv):CrmStaffSession|undefined{
 if(!path.startsWith('/api/sales/')||env.CRM_CANONICAL_ENABLED!=='true'||env.COMMAND_CENTER_AUTH_MODE!=='workos'||actor?.type!=='human'||actor.source!=='workos'||result.status!=='authenticated'||!result.crmIdentity)return;
 if(result.crmIdentity.subject!==result.user.id)return;
 try{return createCrmStaffSession(result.crmIdentity,env.WORKOS_COOKIE_PASSWORD??'',env.COMMAND_CENTER_PUBLIC_URL??'https://cc.proexteriorsus.net');}catch{return;}
}
