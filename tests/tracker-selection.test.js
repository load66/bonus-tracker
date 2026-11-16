'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm');
const {sandbox,storage}=require('./full-app-smoke.test.js'),run=s=>vm.runInContext(s,sandbox);
const rows=['A','B','C'].map(id=>({id:'SYN-'+id,bank:'Synthetic '+id,accountType:'personal',bonus:100,opened:'2026-01-01',checklist:[],customTimers:[]}));
run('entries='+JSON.stringify(rows)+';expanded=null;search="";localStorage.setItem(SK,JSON.stringify(entries));');
sandbox.getAttentionSuggestions=()=>rows.map(e=>({entryId:e.id,bank:e.bank,stageCode:'IN_PROGRESS',stageLabel:'In progress',task:{title:'Review saved requirement'},dateContext:{confirmed:false}}));
const before=JSON.stringify([...storage]);
const taskCards=sandbox.BT360.tasks(rows);
assert.doesNotMatch(taskCards,/is-selected|bt360-actions|>Details<|Deposit reports/);
assert.equal((taskCards.match(/data-attention-link=/g)||[]).length,3);
assert.match(sandbox.rTracker(rows),/bt3641-directory/);assert.doesNotMatch(sandbox.rTracker(rows),/bt366-compact-row/);
for(const row of rows){
 sandbox.BT360.toggleAttention(row.id);
 assert.equal(run('expanded'),row.id);
 assert.equal(run('tab'),'tracker');
 assert.equal(sandbox.BT360.selectedAttentionId,null);
 run('expanded=null');
}
sandbox.BT360.toggleAttention('missing');assert.equal(sandbox.BT360.selectedAttentionId,null);
sandbox.BT360.toggleAccountList();assert.match(sandbox.rTracker(rows),/bt366-compact-row/);
sandbox.BT360.toggleAccountList();assert.doesNotMatch(sandbox.rTracker(rows),/bt366-compact-row/);
assert.match(sandbox.rTracker(rows),/Search 3 accounts/,'Search shortcut includes visible account count');
sandbox.BT360.openAccountSearch();assert.equal(sandbox.BT360.accountListOpen,true);assert.match(sandbox.rTracker(rows),/id="tracker-search"/);
run('search="Synthetic B"');assert.equal((sandbox.rTracker(rows).match(/class="card-h bt366-compact-row"/g)||[]).length,1);
sandbox.BT360.closeAccountSearch();assert.equal(run('search'),'');assert.equal(sandbox.BT360.accountListOpen,false);assert.doesNotMatch(sandbox.rTracker(rows),/bt366-compact-row/);
assert.match(sandbox.rTracker(rows.slice(0,1)),/Search 1 account<\/span>/,'Singular count stays concise');
sandbox.BT360.setStage('IN_PROGRESS');assert.match(sandbox.rTracker(rows),/Hide accounts/,'Stage filters still reveal matching records');
sandbox.BT360.closeAccountSearch();assert.equal(sandbox.BT360.selectedStage,'');assert.doesNotMatch(sandbox.rTracker(rows),/bt366-compact-row/,'Hide closes a directory opened by stage filtering');

assert.equal(JSON.stringify([...storage]),before,'Card and directory selection never write financial data');
console.log('Tracker selection passed: each bank opens direct details, directory access remains and navigation makes no financial writes.');
// Task shortcuts scope exact bank identity and discard stale research filters.
sandbox.getAttentionSuggestions=()=>rows.map((e,i)=>({entryId:e.id,bank:e.bank,stageCode:'IN_PROGRESS',task:{title:'Saved task',activityKind:i===1?'direct-deposit':'new-money'}}));
assert.doesNotMatch(sandbox.BT360.tasks(rows),/Deposit reports|openTaskDatapoints/,'Dashboard has no task-specific buttons');
run("dpFilters.result='failed';dpFilters.source='reddit';dpSearch='old search';openTaskDatapoints('SYN-B')");
assert.equal(run('dpTaskBankKey'),run('datapointBankKey(entries[1])'));
assert.equal(run('tab'),'tips');assert.equal(run('dpSearch'),'');assert.equal(run('dpFilters.result'),'all');
assert.equal(run('dpFilters.source'),'all');assert.equal(run('window.bt366GroupData'),false);
assert.match(sandbox.rTips(),/No reports match this view/);
assert.doesNotMatch(sandbox.rTips(),/Synthetic A|Synthetic C/);
run('resetDPFilters()');assert.equal(run('dpTaskBankKey'),'');
assert.equal(JSON.stringify([...storage]),before,'Datapoints shortcut never changes financial records');
process.exit(0);
