import type {APIRoute} from 'astro';
/** Closed until verified CRM staff-session and scoped canonical BFF integration. */
export const ALL:APIRoute=async({locals})=>{
 const actor=locals.actor;
 const authenticated=actor?.type==='human' && actor.source==='workos';
 return new Response(JSON.stringify({code:authenticated?'provider_unavailable':'unauthenticated',message:authenticated?'The shared CRM data connection is not activated yet.':'A verified CRM staff session is required.'}),{status:authenticated?503:401,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
};
