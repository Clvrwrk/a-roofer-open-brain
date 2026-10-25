// Chris's business integration scope, 2026-10-23. Platform services support these
// paths; they are not additional business data providers. No provider activation.
export const BUSINESS_SYNC_PROVIDERS = [
 {id:'hailrecon',label:'HailRecon',probeKey:'int.hailrecon',commissioned:true,access:'signed_webhook_ingestion',runtime:'ihm-webhook-receiver',receipt:'ihm_hail_alerts'},
 {id:'companycam',label:'CompanyCam',probeKey:'int.companycam',commissioned:true,access:'read_only'},
 {id:'acculynx',label:'AccuLynx',probeKey:'int.acculynx',commissioned:true,access:'read_ingestion'},
 {id:'qbo',label:'QuickBooks Online',probeKey:'int.quickbooks',commissioned:true,access:'read_only'},
 {id:'weather',label:'National Weather Service / NOAA',probeKey:'int.weather',commissioned:true,access:'read_only_office_forecasts'},
] as const;
export const APP_SYNC_DESTINATIONS = [
 {id:'cc',label:'Command Center',verification:'partial',readback:'WIP report propagation verified through its production API'},
 {id:'crm',label:'CRM',verification:'unverified',readback:'Separate application; current module readback acceptance remains open'},
 {id:'hr',label:'HR',verification:'unverified',readback:'Module propagation receipt not yet verified'},
 {id:'pm',label:'Project Management',verification:'unverified',readback:'Module propagation receipt not yet verified'},
 {id:'admin',label:'Admin',verification:'unverified',readback:'Module propagation receipt not yet verified'},
] as const;
export const BUSINESS_PROBE_KEYS=new Set<string>(BUSINESS_SYNC_PROVIDERS.map(p=>p.probeKey));
export function integrationGroup(key:string):'integrations'|'accounting-inputs'|'platform'{
 return BUSINESS_PROBE_KEYS.has(key)?'integrations':key==='int.abc-supply'?'accounting-inputs':'platform';
}
// Exact identifiers only: retirement must never suppress a similarly named supplier.
export const RETIRED_SYNC_COMPONENTS = [
 'runtime:systemd.openbrain-jt-sentinel','int.jobtread',
 'runtime:systemd.openbrain-maya-gate','runtime:systemd.openbrain-maya-qa',
] as const;
export const RETIRED_SYNC_FILTER = `(${RETIRED_SYNC_COMPONENTS.join(',')})`;
export function isActiveSyncComponent(key:string):boolean{
 return !(RETIRED_SYNC_COMPONENTS as readonly string[]).includes(key);
}
// Moving a provider into its correct dashboard group must not stop its security monitor.
export function shouldMonitorComponent(c:{key?:string;group:string;commissioned?:boolean;monitorKey?:string}):boolean{
 return (!c.key||isActiveSyncComponent(c.key))&&c.commissioned!==false&&(['site','integrations','platform','accounting-inputs','feeds'].includes(c.group)||(c.group==='edge'&&Boolean(c.monitorKey)));
}
export function syncScope(){
 return {providers:BUSINESS_SYNC_PROVIDERS,destinations:APP_SYNC_DESTINATIONS,transport:'shared_authorized_backend',
  coverage:'incomplete',gaps:BUSINESS_SYNC_PROVIDERS.filter(p=>!p.commissioned).map(p=>({provider:p.id,reason:'Live sync not commissioned'})),
  supplierInputs:'retained_accounting_inputs'};
}
