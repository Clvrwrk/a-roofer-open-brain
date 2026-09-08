import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFile} from 'node:fs/promises';
import DesktopSales from './SalesWorkspace';

describe('desktop WIP-only Sales entry',()=>{
 it('keeps every entry in the embedded weekly release while staff access loads',()=>{
  for(const page of ['Today','Pipeline','WIP/AR','More'] as const){
   const html=renderToStaticMarkup(createElement(DesktopSales,{initialRoute:{page}}));
   expect(html).toContain('Opening your weekly review');expect(html).not.toContain('<h1');
   expect(html).toContain('aria-current="page"');expect(html.match(/disabled=""/g)).toHaveLength(5);
   for(const label of ['Lead management','Prospecting','Inspections','Agreements','Sales performance'])expect(html).toContain(label);
  }
 });
 it('honestly explains deferred effort links without rendering an effort editor',()=>{
  const html=renderToStaticMarkup(createElement(DesktopSales,{initialRoute:{page:'Pipeline',effortId:'00000000-0000-4000-8000-000000000001'}}));
  expect(html).toContain('Prospect and agreement workflows are not available yet.');expect(html).not.toContain('Save review');
 });
 it('uses only session bootstrap and shared weekly workspace, preserving host guards',async()=>{
  const source=await readFile(new URL('./SalesWorkspace.tsx',import.meta.url),'utf8');
  expect(source).toContain('client.session()');expect(source).toContain('<WeeklyWorkspace');
  expect(source).not.toContain('<SalesWorkspace');expect(source).not.toContain('/efforts');
  expect(source).toContain("session.capabilities.includes('wip_read')");expect(source).toContain('beforeunload');
  expect(source).toContain('onDirty=');expect(source).toContain('onPending=');
 });
});
