import type {APIRoute} from 'astro';
import {canonicalHttp} from '@proexteriors/crm-server';
import {getRuntimeEnv} from '@lib/runtime-env';
/** Same RPC dispatch as the PWA; only middleware-verified human staff sessions can reach it. */
export const ALL:APIRoute=async({locals,request})=>{
 const actor=locals.actor;
 if(actor?.type!=='human'||actor.source!=='workos')return new Response(JSON.stringify({code:'unauthenticated',message:'A verified CRM staff session is required.'}),{status:401,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 const env=getRuntimeEnv();
 return canonicalHttp({request,apiBase:'/api/sales',session:locals.crmStaffSession,config:{enabled:env.CRM_CANONICAL_ENABLED==='true',url:env.CRM_SUPABASE_URL??'',publishableKey:env.CRM_SUPABASE_PUBLISHABLE_KEY??'',publicOrigin:env.COMMAND_CENTER_PUBLIC_URL??'https://cc.proexteriorsus.net'}});
};
