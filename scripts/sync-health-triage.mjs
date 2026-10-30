// Scope the existing, vendored triage engine to the health monitor's events.
// No code-fixing agent or additional provider credential is introduced.
import {readConfig,createHttp,sentryClient,linearClient,missingForApply} from './self-heal/lib.mjs';
import {withSyncComponent} from './sync-health-component.mjs';
import {runTriage} from './self-heal/sentry-to-linear.mjs';
const apply=process.argv.includes('--apply');
const cfg=readConfig(process.env,{apply});
if(cfg.killSwitch){console.log('kill switch enabled');process.exit(0);}
if(apply&&missingForApply(cfg).length)throw new Error('Sync triage configuration incomplete');
const http=createHttp({apply});
const scoped={...http,request(url,options){
 const u=new URL(url);
 if(u.hostname.endsWith('sentry.io')&&/\/projects\/[^/]+\/[^/]+\/issues\/$/.test(u.pathname))
  u.searchParams.set('query',`${u.searchParams.get('query')||''} logger:integration-sync-health`);
 return http.request(u,options);
}};
const client=sentryClient(cfg,scoped);
const sentry={...client,async latestEvent(id){return withSyncComponent(await client.latestEvent(id));},async recentEvents(id){return (await client.recentEvents(id)).map(withSyncComponent);}};
const actions=await runTriage({cfg,sentry,linear:linearClient(cfg,http)});
console.log(JSON.stringify({mode:apply?'apply':'dry-run',scope:'integration-sync-health',actions,writes:http.writes.length}));
