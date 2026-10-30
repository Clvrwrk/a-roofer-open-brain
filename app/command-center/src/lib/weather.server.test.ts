import {beforeEach,expect,it,vi} from 'vitest';
import {loadOfficeWeather,resetWeatherCache,validateForecastUrl} from './weather.server';
const now=Date.parse('2026-10-24T12:00:00Z');
const office={id:'office',name:'Test office',latitude:'37.6857',longitude:'-97.3285'};
const client=(data:any=[office],error:any=null)=>({from:()=>({select:()=>({eq:()=>({order:async()=>({data,error})})})})}) as any;
const forecast=(generatedAt=new Date(now).toISOString())=>({properties:{generatedAt,periods:[{number:1,name:'Today',startTime:'2026-10-24T06:00:00Z',endTime:'2026-10-25T06:00:00Z',temperature:70,temperatureUnit:'F',windSpeed:'5 mph',windDirection:'N',shortForecast:'Clear'}]}});
beforeEach(resetWeatherCache);
it('rejects untrusted forecast URLs before sending any request',()=>{
 for(const x of ['https://evil.test/gridpoints/ICT/1,2/forecast','http://api.weather.gov/gridpoints/ICT/1,2/forecast','https://api.weather.gov@evil.test/gridpoints/ICT/1,2/forecast','https://api.weather.gov/gridpoints/ICT/1,2/forecast?x=1'])expect(()=>validateForecastUrl(x)).toThrow();
 expect(validateForecastUrl('https://api.weather.gov/gridpoints/ICT/1,2/forecast')).toContain('api.weather.gov');
});
it('reads active offices, fetches a forecast and shares one in-flight/cached refresh',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json({properties:{forecast:'https://api.weather.gov/gridpoints/ICT/1,2/forecast'}})).mockResolvedValueOnce(Response.json(forecast()));
 const db=client();const [a,b]=await Promise.all([loadOfficeWeather(db,now,fetcher),loadOfficeWeather(db,now,fetcher)]);
 expect(a).toEqual(b);expect(a.status).toBe('live');expect(a.offices[0].periods).toHaveLength(1);expect(fetcher).toHaveBeenCalledTimes(2);
 await loadOfficeWeather(db,now+1000,fetcher);expect(fetcher).toHaveBeenCalledTimes(2);
 expect(fetcher.mock.calls[0][1].redirect).toBe('manual');expect(fetcher.mock.calls[0][1].headers['User-Agent']).toContain('cc.proexteriorsus.net');
});
it('does not turn stale, malformed, missing-office or failed forecasts green',async()=>{
 for(const data of [forecast('2026-10-22T00:00:00Z'),{properties:{generatedAt:new Date(now).toISOString(),periods:[]}}]){
  resetWeatherCache();const f=vi.fn().mockResolvedValueOnce(Response.json({properties:{forecast:'https://api.weather.gov/gridpoints/ICT/1,2/forecast'}})).mockResolvedValueOnce(Response.json(data));
  expect((await loadOfficeWeather(client(),now,f)).status).toBe('unavailable');
 }
 resetWeatherCache();expect((await loadOfficeWeather(client([]),now,vi.fn())).status).toBe('unavailable');
 resetWeatherCache();expect((await loadOfficeWeather(client(),now,vi.fn().mockResolvedValue(new Response('',{status:503})))).status).toBe('unavailable');
});
it('keeps partial failure visible and never fetches a URL supplied by a caller',async()=>{
 const f=vi.fn().mockResolvedValue(Response.json({properties:{forecast:'https://evil.test/'}}));
 const d=await loadOfficeWeather(client(),now,f);expect(d.status).toBe('unavailable');expect(f).toHaveBeenCalledTimes(1);
 expect(JSON.stringify(d)).not.toContain('evil.test');
});
