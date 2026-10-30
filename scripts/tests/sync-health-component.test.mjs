import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withSyncComponent} from '../sync-health-component.mjs';
import {summarizeIssue} from '../self-heal/sentry-to-linear.mjs';
test('different integration failures create separate stable incident signatures',()=>{
 const summarize=component=>summarizeIssue({id:'1'},withSyncComponent({tags:[{key:'component',value:component},{key:'error_code',value:'provider_unavailable'}]}),[],{sentry:{environment:'production'}},'');
 assert.notEqual(summarize('int.github').signature,summarize('int.betterstack').signature);
 assert.equal(summarize('int.github').signature,summarize('int.github').signature);
 assert.equal(summarize('int.github').route,'/sync/int.github');
});
test('does not promote arbitrary external component strings to routes',()=>{
 const e={tags:[{key:'component',value:'https://sensitive/?token=secret'}]};
 assert.equal(withSyncComponent(e),e);
});
