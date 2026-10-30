// Keep different integration incidents separate in the shared triage engine.
export function withSyncComponent(event) {
 const tags=Array.isArray(event?.tags)?event.tags:[];
 const component=tags.find(t=>t.key==='component')?.value;
 if(typeof component!=='string'||!/^[-A-Za-z0-9_.:]{1,120}$/.test(component))return event;
 return {...event,tags:[...tags.filter(t=>t.key!=='route'),{key:'route',value:`/sync/${component}`}]};
}
