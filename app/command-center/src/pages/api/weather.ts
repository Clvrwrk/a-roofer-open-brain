import type {APIRoute} from 'astro';
import {actorCanAccessDepartment,buildUnauthorizedResponse} from '@lib/access-control';
import {jsonApiResponse} from '@lib/agent-api';
import {createServerSupabaseClient} from '@lib/supabase.server';
import {loadOfficeWeather} from '@lib/weather.server';
export const prerender=false;
export const GET:APIRoute=async({locals})=>{
 if(!locals.actor)return buildUnauthorizedResponse();
 if(!['operations','sales','executive','system'].some(d=>actorCanAccessDepartment(locals.actor,d as any)))return jsonApiResponse({error:'forbidden'},{status:403});
 const {client}=createServerSupabaseClient();const result=await loadOfficeWeather(client);
 return jsonApiResponse(result,{status:result.status==='live'?200:503});
};
