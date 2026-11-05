import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readConfig} from './self-heal/lib.mjs';
import {report} from './self-heal/autofix-queue.mjs';
import {runTriage,classifyFixability} from './self-heal/sentry-to-linear.mjs';
const repo='Clvrwrk/a-roofer-open-brain',owner='002bc1e6-c102-42f7-86cc-45b7c499dae3';
const mk=(env={})=>{const c=readConfig({GITHUB_REPOSITORY:repo,LINEAR_HUMAN_ASSIGNEE_ID:owner,...env},{apply:true});c.linear.labels={queued:'queued',running:'running',bug:'bug',sourceSentry:'source',needsHuman:'human',prOpen:'pr',laneSentinel:'sentinel'};return c;};
const sig=(code)=>({title:'x',level:'error',stack:[],errorCode:code,route:'/a'});
test('provider_unavailable routes to ops remediation, not a human',()=>{
 const c=classifyFixability(sig('provider_unavailable'));
 assert.equal(c.route,'ops-remediation');
 assert.equal(classifyFixability(sig('unauthorized')).route,'human');
 assert.equal(classifyFixability({...sig(null),userReport:{}}).route,'human');
});
const sentryFor=code=>({listIssues:async()=>[{id:'1',shortId:'S-1',title:'t',level:'error',count:'1',userCount:0}],latestEvent:async()=>({tags:[{key:'error_code',value:code},{key:'route',value:'/r'}]}),recentEvents:async()=>[],canonicalUrl:()=>'https://cleverwork.sentry.io/issues/1/',comment:async()=>{}});
test('infra Sentry issue is queued on lane:sentinel and left unassigned',async()=>{
 let input;const linear={available:true,findBySentry:async()=>null,createIssue:async i=>{input=i;return {id:'x',identifier:'PEC-1',url:'u'};},attach:async()=>{}};
 await runTriage({cfg:mk(),sentry:sentryFor('provider_unavailable'),linear});
 assert.deepEqual(input.labelIds.sort(),['bug','queued','sentinel','source'].sort());
 assert.equal(input.assigneeId,undefined);
});
test('needs-human Sentry issue is still assigned to the owner',async()=>{
 let input;const linear={available:true,findBySentry:async()=>null,createIssue:async i=>{input=i;return {id:'x',identifier:'PEC-1',url:'u'};},attach:async()=>{}};
 await runTriage({cfg:mk(),sentry:sentryFor('unauthorized'),linear});
 assert.ok(input.labelIds.includes('human'));assert.equal(input.assigneeId,owner);
});
test('assignee mismatch alone is not a change and updates never reassign',async()=>{
 const sentry=sentryFor('provider_unavailable');let first;
 const l1={available:true,findBySentry:async()=>null,createIssue:async i=>{first=i;return {id:'x',identifier:'PEC-1',url:'u'};},attach:async()=>{}};
 await runTriage({cfg:mk(),sentry,linear:l1});
 const existing={id:'x',identifier:'PEC-1',description:first.description,assignee:null,labels:{nodes:[]}};
 await runTriage({cfg:mk(),sentry,linear:{available:true,findBySentry:async()=>existing,updateIssue:async(id,i)=>{existing.description=i.description;assert.equal(i.assigneeId,undefined);}}});
 const updates=[];const actions=await runTriage({cfg:mk(),sentry,linear:{available:true,findBySentry:async()=>existing,updateIssue:async(id,i)=>updates.push(i)}});
 assert.equal(actions[0].action,'unchanged');assert.equal(updates.length,0);
});
const ticket=(desc='')=>({id:'00000000-0000-4000-8000-000000000001',identifier:'PEC-1',description:`self-heal-repository:${repo};${desc}`,labels:{nodes:[{id:'running',name:'autofix:running'}]}});
const run=async(item,cfg)=>{const ups=[];await report({cfg,linear:{getIssue:async()=>item,updateIssue:async(id,i)=>ups.push(i),attach:async()=>{},comment:async()=>{}},issueId:item.id,decision:{publish:false,reasons:['no fix']}});return ups[0];};
test('no-PR result requeues with a retry count before escalating',async()=>{
 const u=await run(ticket(),mk());
 assert.deepEqual(u.addedLabelIds,['queued']);assert.equal(u.assigneeId,undefined);
 assert.match(u.description,/autofix-attempts:1;/);
});
test('no-PR escalates to needs-human after the configured attempts',async()=>{
 const u=await run(ticket('\nautofix-attempts:2;'),mk({AUTOFIX_MAX_ATTEMPTS:'3'}));
 assert.deepEqual(u.addedLabelIds,['human']);assert.equal(u.assigneeId,owner);
 assert.match(u.description,/autofix-attempts:3;/);
 assert.equal(mk().maxAutofixAttempts,3);
});
