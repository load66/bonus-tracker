'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm');
const {sandbox:s,storage}=require('./full-app-smoke.test.js');
const run=code=>vm.runInContext(code,s),before=JSON.stringify([...storage]);
run("tab='tracker';expanded=null;showTemplates=true;showAnalyzer=false;");
s.R();assert.doesNotMatch(s.document.getElementById('app').innerHTML,/class="fab bt362-add-fab"/,'Quick Add must hide the floating Add button');
assert.match(s.rTracker([]),/aria-label="Close Quick Add"/);
assert.match(s.rTracker([]),/closeTrackerTool\('quick-add'\)/);
s.closeTrackerTool('quick-add');assert.equal(run('showTemplates'),false);
run("showAnalyzer=true;analyzerText='Saved unsent terms draft';");
s.R();assert.doesNotMatch(s.document.getElementById('app').innerHTML,/class="fab bt362-add-fab"/,'Terms review must hide the floating Add button');
const html=s.rTracker([]);
assert.match(html,/aria-label="Close promo terms"/);assert.match(html,/for="az_input"/);
assert.match(html,/oninput="analyzerText=this.value"/);assert.match(html,/Saved unsent terms draft/);
assert.match(html,/bt3651-terms-input/);assert.match(html,/>Review terms<\/button>/);
s.closeTrackerTool('promo-terms');assert.equal(run('showAnalyzer'),false);assert.equal(run('analyzerText'),'Saved unsent terms draft');
assert.equal(JSON.stringify([...storage]),before,'Closing tools must not change saved records');
console.log('Tracker tools passed: visible close buttons, labeled dark review input, retained draft and no financial writes.');
// Disclosure state and empty-state recovery are view operations only.
const financialBefore=JSON.stringify([storage.get('bt_e_v4'),storage.get('bt_tc_archive_v1')]);
s.toggleTrackerAddMenu(true);assert.equal(s.bt362AddOpen,true);
assert.match(s.document.getElementById('app').innerHTML,/id="bt-add-actions"/);
assert.match(s.document.getElementById('app').innerHTML,/aria-controls="bt-add-actions"/);
let prevented=0,stopped=0;
s.trackerAddKey({key:'Tab',preventDefault(){prevented++},stopPropagation(){stopped++}});
assert.equal(s.bt362AddOpen,true,'Tab follows normal document order');
s.trackerAddKey({key:'Escape',preventDefault(){prevented++},stopPropagation(){stopped++}});
assert.equal(s.bt362AddOpen,false);assert.equal(prevented,1);assert.equal(stopped,1);
run("entries=[{id:'SYN-EMPTY',bank:'Synthetic View Bank',opened:'2026-01-01',closed:'',accountType:'personal'}];search='unmatched';");
const entryBefore=run('JSON.stringify(entries)');
assert.match(s.renderAccountEmptyState('<script>'),/No matching accounts/);
assert.match(s.renderAccountEmptyState('<script>'),/&lt;script&gt;/);
s.clearTrackerSearch();assert.equal(run('search'),'');assert.equal(s.BT360.accountListOpen,true);
s.BT360.setAudience('business');assert.match(s.renderAccountEmptyState(''),/No accounts in this view/);
assert.doesNotMatch(s.renderAccountEmptyState(''),/No accounts yet/);
s.clearTrackerFilters();assert.equal(s.BT360.audience,'all');assert.equal(s.BT360.accountListOpen,true);
s.BT360.setStage('READY_TO_CLOSE');assert.match(s.renderAccountEmptyState(''),/Show all accounts/);s.clearTrackerSearch();assert.equal(s.BT360.selectedStage,'READY_TO_CLOSE','Clearing text preserves the chosen stage');s.clearTrackerFilters();assert.equal(s.BT360.selectedStage,'','Explicit Show all accounts resets the stage');
assert.equal(run('JSON.stringify(entries)'),entryBefore,'Filter recovery does not edit entries');
run("entries[0].closed='2026-09-01';entries[0].churnable=true;entries[0].churnability='repeatable';");
assert.match(s.renderAccountEmptyState(''),/No open accounts/);
run('entries=[]');assert.match(s.renderAccountEmptyState(''),/No accounts yet/);
assert.equal(JSON.stringify([storage.get('bt_e_v4'),storage.get('bt_tc_archive_v1')]),financialBefore,'Disclosure and filters never write financial records');
console.log('Keyboard/search polish passed: dismissible disclosure, honest empty views and read-only recovery.');
// Quick Add templates contain sample offers, never verified lifecycle events.
run('entries=[];tab="tracker";expanded=null;modal=null;showTemplates=true;');
const beforeTemplate=JSON.stringify([...storage]);
s.addFromTpl(5); // Synthetic test of the Citi example; no provider call or persisted record.
assert.equal(run('modal.bank'),'Citi');
assert.equal(run('modal.opened'),'','Choosing a template must not invent an account opening date');
assert.equal(run('modal._fromTemplate'),true);
assert.match(s.rModal(),/Historical example — not a verified offer/,'Wizard explains historical-only fields');
assert.equal(JSON.stringify([...storage]),beforeTemplate,'Selecting a template must not write financial records');
run('closeModal()');
// Exhaustive historical-sample safety: no old payout/fee/ACH/churn facts enter a new account.
run('entries=[];tab="tracker";expanded=null;modal=null;showTemplates=true;');
const templatesCount=run('TEMPLATES.length');
assert.equal(templatesCount,12,'Intentional sample inventory changed: audit shortcuts before adding one');
assert.match(s.rTracker([]),/Historical \$325 · Expired example/,'An expired promotion is explicitly labeled');
assert.match(s.rTracker([]),/Historical \$250 · Multiple offer paths/,'Offer versions cannot be conflated');
assert.match(s.rTracker([]),/Historical \$300 · Unverified example/);
assert.equal(s.quickAddReviewStatus({bank:'Wells Fargo'}).checked,'2026-10-20');
assert.match(s.quickAddReviewStatus({bank:'Capital One'}).note,/separate qualifying/);
for(let i=0;i<templatesCount;i++){
  run('modal=null;showTemplates=true');
  const old=JSON.stringify([...storage]);
  s.addFromTpl(i);
  const draft=run('JSON.stringify(modal)');
  const data=JSON.parse(draft);
  const bank=run('TEMPLATES['+i+'].bank');
  assert.equal(data.bank,bank,'Only bank identity may be copied');
  for(const key of ['bonus','reqDays','minHoldDays','referralBonus']){
    assert.equal(data[key],0,'Historical numeric term leaked: '+bank+' '+key);
  }
  for(const key of ['churn','opened','closed','dataPoint','notes','analyzedTC','monthlyFeeYNText','earlyTerminationFeeText','eligibilityText','promoCodeText','requiredDaysText','completeBonusText']){
    assert.equal(data[key],'','Historical text/rule leaked: '+bank+' '+key);
  }
  assert.equal(data.earlyCloseFee,null,'Unknown early close fee cannot be $0 by default: '+bank);
  assert.equal(data.churnable,null,'Historical churn rules cannot be certified: '+bank);
  assert.equal(data.feeChecked,false,'No sample fee can be considered verified');
  assert.equal(data._fromTemplate,true);
  assert.equal(JSON.stringify([...storage]),old,'Selection must not persist any historical facts');
  if(bank==='Wells Fargo')assert.match(s.rModal(),/October 13, 2026/,'Expiry requires an official offer check');
  s.closeModal();
}
console.log('All historical templates are quarantined from new offer financial fields. No write.');
console.log('Quick Add sample provenance and unknown opening-date regression PASS');
process.exit(0);
