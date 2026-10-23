import {it,expect} from 'vitest';
import {BUSINESS_SYNC_PROVIDERS,APP_SYNC_DESTINATIONS,integrationGroup,shouldMonitorComponent,syncScope} from './sync-scope';
it('limits the business provider catalog to Chris’s five services',()=>{
 expect(BUSINESS_SYNC_PROVIDERS.map(p=>p.id)).toEqual(['hailrecon','companycam','acculynx','qbo','weather']);
 expect(APP_SYNC_DESTINATIONS.map(p=>p.id)).toEqual(['cc','crm','hr','pm','admin']);
 expect(BUSINESS_SYNC_PROVIDERS.find(p=>p.id==='qbo')?.access).toBe('read_only');
});
it('keeps platform and supplier monitoring when they leave the business list',()=>{
 for(const key of ['int.workos','int.supabase-rest','int.betterstack','int.github','int.linear']){
  expect(integrationGroup(key)).toBe('platform');expect(shouldMonitorComponent({group:integrationGroup(key)})).toBe(true);
 }
 expect(integrationGroup('int.abc-supply')).toBe('accounting-inputs');
 expect(shouldMonitorComponent({group:integrationGroup('int.abc-supply')})).toBe(true);
});
it('never labels an uncommissioned connection healthy or polls a guessed endpoint',()=>{
 expect(syncScope().gaps.map(g=>g.provider)).toEqual(['weather']);
 expect(syncScope().coverage).toBe('incomplete');
 expect(syncScope().supplierInputs).toBe('retained_accounting_inputs');
 expect(BUSINESS_SYNC_PROVIDERS.find(p=>p.id==='weather')?.label).toBe('National Weather Service / NOAA');
 expect(shouldMonitorComponent({group:'integrations',commissioned:false})).toBe(false);
 expect(BUSINESS_SYNC_PROVIDERS.filter(p=>!p.commissioned).every(p=>!('url' in p))).toBe(true);
});
