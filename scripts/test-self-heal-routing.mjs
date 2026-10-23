import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readConfig, ownsIssue, repositoryMarker,setBugLogField} from './self-heal/lib.mjs';
import {select,recordVerification,report} from './self-heal/autofix-queue.mjs';
import {runTriage} from './self-heal/sentry-to-linear.mjs';
import {evaluatePatch} from './self-heal/patch-policy.mjs';
const repo='Clvrwrk/a-roofer-open-brain',owner='002bc1e6-c102-42f7-86cc-45b7c499dae3';
const cfg=readConfig({GITHUB_REPOSITORY:repo,LINEAR_HUMAN_ASSIGNEE_ID:owner,AUTOFIX_MAX_PER_RUN:'1'},{apply:true});
cfg.linear.labels={queued:'queued',running:'running',bug:'bug',sourceSentry:'source',needsHuman:'human'};
const ticket=(n,repository=repo)=>({id:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,identifier:`PEC-${n}`,title:'[S3] Test',description:`self-heal-repository:${repository};`,labels:{nodes:[]}});
test('repository ownership refuses missing, foreign and ambiguous markers',()=>{
 assert.equal(ownsIssue(cfg,ticket(1)),true);
 assert.equal(ownsIssue(cfg,ticket(2,'Clvrwrk/CRM_PWA')),false);
 assert.equal(ownsIssue(cfg,{description:''}),false);
 assert.equal(ownsIssue(cfg,{description:ticket(1).description+ticket(2).description}),false);
 assert.equal(repositoryMarker(cfg),`self-heal-repository:${repo};`);
});
test('queue claims only its repository and ignores another repository running count',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'selfheal-test-')),updates=[];
 try{
  const linear={listByLabel:async label=>label==='queued'?[ticket(1,'Clvrwrk/CRM_PWA'),ticket(2),{...ticket(3),description:''}]:[ticket(4,'Clvrwrk/CRM_PWA')],updateIssue:async(id,input)=>updates.push({id,input}),comment:async()=>{}};
  const result=await select({cfg,linear,outDir:dir,env:{}});
  assert.deepEqual(result.chosen.map(x=>x.identifier),['PEC-2']);assert.equal(updates.length,1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('dry run never emits an executable fix matrix or claims a ticket',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'selfheal-test-'));let writes=0;
 try {await select({cfg:{...cfg,apply:false},linear:{listByLabel:async l=>l==='queued'?[ticket(1)]:[],updateIssue:async()=>writes++,comment:async()=>writes++},outDir:dir,env:{GITHUB_OUTPUT:join(dir,'outputs')}});
 assert.equal(writes,0);assert.match(readFileSync(join(dir,'outputs'),'utf8'),/count=0/);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('triage assigns owner and stamps provenance; repeat pass deduplicates',async()=>{
 let created=null,creates=0;
 const linear={available:true,findBySentry:async()=>created,createIssue:async input=>{creates++;assert.equal(input.assigneeId,owner);assert.match(input.description,/self-heal-repository:Clvrwrk\/a-roofer-open-brain;/);created={...ticket(9),...input,assignee:{id:owner},url:'https://linear.app/cleverwork/issue/PEC-9'};return created;},attach:async()=>{},updateIssue:async()=>{},comment:async()=>{}};
 const sentry={listIssues:async()=>[{id:'123',shortId:'CC-TEST',title:'Synthetic defect',level:'error',count:'1',userCount:0}],latestEvent:async()=>({tags:[{key:'error_code',value:'synthetic_drill'},{key:'route',value:'/internal/self-heal-drill'}]}),recentEvents:async()=>[],canonicalUrl:()=> 'https://cleverwork.sentry.io/issues/123/',comment:async()=>{}};
 await runTriage({cfg,sentry,linear});await runTriage({cfg,sentry,linear});assert.equal(creates,1);
});
test('independent verification fails closed when missing or failing',()=>{
 assert.equal(recordVerification({STEP_APPLY:'success',STEP_TYPECHECK_BUILD_UNIT:'success'}).status,'passed');
 assert.equal(recordVerification({STEP_APPLY:'success'}).status,'failed');
 assert.equal(recordVerification({STEP_APPLY:'failure',STEP_TYPECHECK_BUILD_UNIT:'success'}).status,'failed');
});
test('patch policy rejects infrastructure and accepts bounded app plus reproduction test',()=>{
 const diff=p=>`diff --git a/${p} b/${p}\n--- a/${p}\n+++ b/${p}\n@@ -1 +1 @@\n-old\n+new\n`;
 assert.equal(evaluatePatch(diff('.github/workflows/verify.yml')).ok,false);
 assert.equal(evaluatePatch(diff('app/command-center/src/lib/access-control.ts')+diff('app/command-center/src/lib/example.test.ts')).ok,false);
 assert.equal(evaluatePatch(diff('app/command-center/src/lib/example.ts')+diff('app/command-center/src/lib/example.test.ts')).ok,true);
});
test('publisher opens drafts, requests human review, never merges or deploys',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/autofix.yml',import.meta.url),'utf8');
 assert.match(workflow,/gh pr create --draft --reviewer Clvrwrk/);
 assert.doesNotMatch(workflow,/gh pr merge|enableAutoMerge|COOLIFY_API|SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(workflow,/--max-budget-usd 5/);
});

test('published receipt removes only labels still present and safely retries',async()=>{
 const item={...ticket(77),labels:{nodes:[{id:'running'}]}}, updates=[];
 const linear={getIssue:async()=>item,updateIssue:async(id,input)=>{
  for(const removed of input.removedLabelIds) assert.ok(item.labels.nodes.some(l=>l.id===removed),'Linear rejects removing an absent label');
  updates.push(input);item.labels.nodes=item.labels.nodes.filter(l=>!input.removedLabelIds.includes(l.id));
 },attach:async()=>{},comment:async()=>{}};
 for(let i=0;i<2;i++) await report({cfg,linear,issueId:item.id,decision:{publish:true,result:{root_cause:'synthetic'}},prUrl:'https://github.com/Clvrwrk/example/pull/1'});
 assert.deepEqual(updates[0].removedLabelIds,['running']);
 assert.deepEqual(updates[1].removedLabelIds,[]);
 assert.equal(updates[0].assigneeId,owner);
});

test('Linear-normalized bullets replace and deduplicate bug log fields',()=>{
 const before='## Bug log\n* **Root cause:** pending\n- **Root cause:** old\n* **Fix:** pending\n* **Verification:** pending\n';
 const once=setBugLogField(before,'Root cause','confirmed cause');
 const twice=setBugLogField(once.replace(/^- /gm,'* '),'Root cause','confirmed cause');
 assert.equal((twice.match(/\*\*Root cause:\*\*/g)||[]).length,1);
 assert.match(twice,/Root cause:\*\* confirmed cause/);
 assert.doesNotMatch(twice,/Root cause:\*\* (pending|old)/);
 assert.match(twice,/Fix:\*\* pending/);
});
