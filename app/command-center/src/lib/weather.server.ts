// NWS public office forecasts only. No customer coordinates or arbitrary fetch URLs.
import type {SupabaseClient} from '@supabase/supabase-js';
const TTL=300_000;
const HEADERS={'User-Agent':'ProExteriors-CommandCenter (https://cc.proexteriorsus.net)','Accept':'application/geo+json'};
export interface OfficeForecast {officeId:string;name:string;sourceUrl:string|null;generatedAt:string|null;periods:Record<string,unknown>[];error:string|null;}
export interface WeatherSnapshot {status:'live'|'degraded'|'unavailable';provider:'NWS/NOAA';refreshedAt:string;offices:OfficeForecast[];error:string|null;}
let cache:{at:number;value:WeatherSnapshot}|null=null;
let pending:Promise<WeatherSnapshot>|null=null;
export function resetWeatherCache(){cache=null;pending=null;}
export function validateForecastUrl(value:unknown):string{
 if(typeof value!=='string'||!/^https:\/\/api\.weather\.gov\/gridpoints\/[A-Z]{3}\/\d{1,4},\d{1,4}\/forecast$/.test(value))throw Error('invalid_nws_forecast_url');
 return value;
}
async function nwsJson(url:string,fetcher:typeof fetch){
 const r=await fetcher(url,{headers:HEADERS,redirect:'manual',signal:AbortSignal.timeout(6000)});
 if(!r.ok)throw Error('nws_unavailable');
 return r.json();
}
async function officeForecast(o:any,now:number,fetcher:typeof fetch):Promise<OfficeForecast>{
 const base:OfficeForecast={officeId:o.id,name:o.name,sourceUrl:null,generatedAt:null,periods:[],error:null};
 try{
  const lat=Number(o.latitude),lon=Number(o.longitude);
  if(o.latitude==null||o.longitude==null||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<24||lat>50||lon< -125||lon> -66)throw Error('office_coordinates_unavailable');
  const point=await nwsJson(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`,fetcher);
  const sourceUrl=validateForecastUrl(point?.properties?.forecast);
  const data=await nwsJson(sourceUrl,fetcher);const p=data?.properties;
  const generated=Date.parse(p?.generatedAt??'');
  const valid=(p?.periods??[]).filter((x:any)=>Date.parse(x.endTime)>now&&Number.isFinite(Date.parse(x.startTime)));
  if(!Number.isFinite(generated)||generated>now+300000||now-generated>12*3600000||!valid.some((x:any)=>Date.parse(x.startTime)<=now)||!valid.length)throw Error('nws_forecast_stale_or_invalid');
  const periods=valid.slice(0,14).map((x:any)=>({name:String(x.name??'').slice(0,80),startTime:x.startTime,endTime:x.endTime,temperature:typeof x.temperature==='number'?x.temperature:null,temperatureUnit:String(x.temperatureUnit??'').slice(0,4),windSpeed:String(x.windSpeed??'').slice(0,40),windDirection:String(x.windDirection??'').slice(0,12),shortForecast:String(x.shortForecast??'').slice(0,200)}));
  return {...base,sourceUrl,generatedAt:p.generatedAt,periods};
 }catch(e){return {...base,error:e instanceof Error&&['office_coordinates_unavailable','nws_forecast_stale_or_invalid'].includes(e.message)?e.message:'nws_unavailable'};}
}
export async function loadOfficeWeather(client:SupabaseClient|null,now=Date.now(),fetcher:typeof fetch=fetch):Promise<WeatherSnapshot>{
 if(cache&&now>=cache.at&&now-cache.at<(cache.value.status==='live'?TTL:30000))return cache.value;
 if(pending)return pending;
 pending=(async()=>{
  const base={provider:'NWS/NOAA' as const,refreshedAt:new Date(now).toISOString()};
  try{
   if(!client)throw Error('weather_office_lookup_unavailable');
   const {data,error}=await client.from('office').select('id,name,latitude,longitude').eq('is_active',true).order('name');
   if(error||!data?.length||data.length>50)throw Error('weather_office_lookup_unavailable');
   // Bound requests to three offices at a time; concurrent board/API callers share this refresh.
   const offices:OfficeForecast[]=[];
   for(let i=0;i<data.length;i+=3)offices.push(...await Promise.all(data.slice(i,i+3).map(o=>officeForecast(o,now,fetcher))));
   const good=offices.filter(o=>!o.error).length;
   return {...base,status:good===offices.length?'live':good?'degraded':'unavailable',offices,error:good===offices.length?null:'weather_refresh_incomplete'} as WeatherSnapshot;
  }catch{return {...base,status:'unavailable' as const,offices:[],error:'weather_office_lookup_unavailable'};}
 })();
 try{const value=await pending;cache={at:now,value};return value;}finally{pending=null;}
}
