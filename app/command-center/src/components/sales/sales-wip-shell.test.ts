import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import DesktopSales from './SalesWorkspace';
import CrmSalesMirror from './CrmSalesMirror';
import {financeHref,parseFinanceView} from '@proexteriors/sales-workspace';
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');

describe('optional CRM mirror confined to CC Sales',()=>{
 it('renders all five CRM journey groups and honest unavailable links while access loads',()=>{
  for(const page of ['Today','Pipeline','WIP/AR','More'] as const){
   const html=renderToStaticMarkup(createElement(DesktopSales,{initialRoute:{page}}));
   expect(html).toContain('Opening your workspace');expect(html).toContain('aria-label="Customer journey"');
   for(const label of ['Prospecting','Lead Management','Job Operations Management','Job Finance Management','Sales Team (Rep) Management/Training'])expect(html).toContain(label);
   expect(html.match(/Coming later/g)).toHaveLength(3);expect(html).toContain('aria-current="page"');expect(html).toContain('aria-disabled="true"');
   expect(html).not.toContain('Department navigation');expect(html).not.toContain('Download Pack');
  }
 });
 it('exposes both finance evaluation queues with same-path Sales links',()=>{
  const html=renderToStaticMarkup(createElement(CrmSalesMirror,{client:{} as any,practice:false}));
  expect(html).toContain('Canceled with balance');expect(html).toContain('Invoice issues');
  expect(html).toContain('href="?evaluation=canceled-balance#wip-main"');expect(html).toContain('href="?evaluation=invoice-issues#wip-main"');
  expect(html).not.toContain('/accounting/friday-wip');
  for(const queue of ['cancellation_review','invoice_review'] as const){const link=financeHref(queue,'?practice=1');expect(link.startsWith('?')).toBe(true);expect(parseFinanceView(link.split('#')[0])).toBe(queue);expect(link).toContain('practice=1');}
 });
 it('keeps deferred effort links honest and uses supplied host URLs for home/sign-in/sign-out',()=>{
  const html=renderToStaticMarkup(createElement(DesktopSales,{initialRoute:{page:'Pipeline',effortId:'00000000-0000-4000-8000-000000000001'}}));
  expect(html).toContain('saved legacy effort links do not select a record here.');
  const hosted=renderToStaticMarkup(createElement(CrmSalesMirror,{client:{} as any,practice:false,homeHref:'/sales',loginHref:'/auth/login?returnTo=%2Fsales',logoutAction:'/auth/logout',logoSrc:'/sales-mirror-assets/pro-exteriors-logo.svg'}));
  expect(hosted).toContain('href="/sales"');expect(hosted).toContain('action="/auth/logout"');expect(hosted).toContain('src="/sales-mirror-assets/pro-exteriors-logo.svg"');
 });
 it('keeps the vendored shell exactly equal to CRM after the documented host-only substitutions',async()=>{
  let source=await readFile(new URL('./CrmSalesMirror.tsx',import.meta.url),'utf8');
  source=source.replace("import './crm-mirror.css';","import '../styles/wip-release.css';")
   .replace("export default function CrmSalesMirror({client,practice,homeHref='/',loginHref='/auth/login?returnTo=%2Fsales',logoutAction='/auth/logout',logoSrc='/pro-exteriors-logo.svg'}:{client:SalesClient;practice:boolean;homeHref?:string;loginHref?:string;logoutAction?:string;logoSrc?:string}){",'export default function WipRelease({client,practice}:{client:SalesClient;practice:boolean}){')
   .replace('href={homeHref} aria-label="Pro Exteriors home"','href="/" aria-label="Pro Exteriors home"').replace('action={logoutAction}','action="/auth/logout"').replace('href={loginHref}','href="/auth/login"').replace('src={logoSrc}','src="/pro-exteriors-logo.svg"');
  expect(sha(source)).toBe('30edde1776cfaffbeef533ad1a1b934b5867e80c2424a4ee5a8d00874dd079d6');
  expect(sha(await readFile(new URL('./crm-mirror.css',import.meta.url),'utf8'))).toBe('a349549df1f3550363d8c06f73944742636dcfd58e688b9c87588546185bb2bd');
  expect(source).toContain('beforeunload');expect(source).toContain('pending.current||dirty.current');expect(source).toContain('onDirty=');expect(source).toContain('onPending=');
 });
 it('preserves the original Friday consumer and avoids changing the global shell',async()=>{
  const friday=await readFile(new URL('./FridayWeeklyWorkspace.tsx',import.meta.url),'utf8');
  expect(sha(friday)).toBe('6f290b963fa381a9f3ed007c1394809e5cbdf9706cafe971f94832b222a2ca5c');
  const page=await readFile(new URL('./SalesPage.astro',import.meta.url),'utf8');expect(page).not.toContain('AppShell');expect(page).toContain("Astro.response.headers.set('Cache-Control','no-store')");expect(page).toContain('viewport-fit=cover');expect(page).toContain("Astro.response.headers.set('X-CRM-Sales-Build',env.COMMAND_CENTER_BUILD_SHA)");
  const wrapper=await readFile(new URL('./SalesWorkspace.tsx',import.meta.url),'utf8');expect(wrapper).toContain("apiBase:'/api/sales'");expect(wrapper).not.toContain('CRM_WEEKLY_CANONICAL_ENABLED');
 });
});

describe('explicit Sales-only asset prefix',()=>{
 async function config(value?:string){let source=await readFile(new URL('../../../astro.config.mjs',import.meta.url),'utf8');source=source.replace(/^import .*;$/gm,'').replace('export default defineConfig(', 'result=defineConfig(');const context={process:{env:value?{CRM_SALES_MIRROR_ASSETS_PREFIX:value}:{}},JSON,result:undefined,defineConfig:(v:any)=>v,node:()=>({}),sentry:()=>({}),react:()=>({})};vm.runInNewContext(source,context);return context.result as any;}
 it('leaves default asset paths unchanged and enables only the explicit isolated prefix',async()=>{
  expect((await config()).build).toBeUndefined();const enabled=await config('/sales-mirror-assets');expect(enabled.build.assetsPrefix).toBe('/sales-mirror-assets');expect(enabled.vite.define['import.meta.env.CRM_SALES_MIRROR_ASSETS_PREFIX']).toBe('"/sales-mirror-assets"');
  for(const bad of ['/','/_astro','https://other.example','/sales-mirror-assets/'])await expect(config(bad)).rejects.toThrow('must be');
 });
 it('passes the optional build argument only in the build stage',async()=>{
  const docker=await readFile(new URL('../../../Dockerfile',import.meta.url),'utf8');expect(docker).toContain('ARG CRM_SALES_MIRROR_ASSETS_PREFIX=""');expect(docker).toContain('CRM_SALES_MIRROR_ASSETS_PREFIX="$CRM_SALES_MIRROR_ASSETS_PREFIX"');expect(docker.split(' AS runner')[1]).not.toContain('CRM_SALES_MIRROR_ASSETS_PREFIX');
 });
});
