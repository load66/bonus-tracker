'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {sandbox,document,storage}=require('./full-app-smoke.test.js');
const run=code=>vm.runInContext(code,sandbox);

setTimeout(()=>{
  try{
    run(`entries=[{id:'TEST-P-01',bank:'Next Action Bank',opened:'2024-02-28',bonus:200,reqDays:2,requiredDaysText:'2 calendar days',notes:'Keep these notes',history:[{at:'2024-02-28',type:'entry_saved',detail:'Original'}],checklist:[{text:'Deposit',done:false}],customTimers:[]}];sv(SK,entries);`);
    const before=run('JSON.stringify(entries)'),persisted=JSON.stringify([...storage]);
    const action=run('btNextActionForEntry(entries[0])');
    assert.equal(action.kind,'requirements');
    assert.match(action.explanation,/checklist task remains/);
    assert.match(action.explanation,/qualifying activity with the bank/);
    assert.equal(action.context.date,run('reqDeadline(entries[0])'));
    assert.equal(action.context.date,'2024-03-01');
    // Unsupported structured records must not invite milestone confirmation.
    const original=run('JSON.stringify(entries[0])');
    run('entries[0].schemaVersion=3;entries[0].financialRules={version:999};');
    const invalidSnapshot=run('JSON.stringify(entries)'),invalidStorage=JSON.stringify([...storage]);
    assert.equal(run('btNextActionForEntry(entries[0]).kind'),'review');
    assert.equal(run('btNextActionForEntry(entries[0]).context.confirmed'),false);
    assert.match(run('btNextActionForEntry(entries[0]).label'),/financial rules/);
    run('runNextAccountAction(entries[0].id)');
    assert.equal(run('reqPrompt'),null,'Invalid rules must not open a completion confirmation');
    assert.equal(run('JSON.stringify(entries)'),invalidSnapshot);
    assert.equal(JSON.stringify([...storage]),invalidStorage,'Invalid-rule guidance must not write records');
    run("entries[0].reqMet='2024-03-01';entries[0].bonusRecd='2024-03-02';entries[0].churn='1';");
    assert.equal(run('closeReadiness(entries[0]).label'),'Do Not Close Yet');
    assert.equal(run('closeReadiness(entries[0]).cls'),'danger');
    assert.equal(run('btNextActionForEntry(entries[0]).kind'),'review');
    assert.equal(run('btLifecycleStageForEntry(entries[0]).code'),'ACTION_NEEDED');
    assert.match(run('btLifecycleStageForEntry(entries[0]).support'),/Financial rules need review/);
    sandbox.auditOriginal=original;run('entries[0]=JSON.parse(auditOriginal)');
    assert.match(action.context.explanation,/2 calendar days/);
    run('getAttentionSuggestions();btNextActionForEntry(entries[0]);renderActionCenter()');
    const tiles=run('renderActionCenter()');
    assert.match(tiles,/ops-action-tile/);
    assert.match(tiles,/aria-label="View task"/);
    assert.doesNotMatch(tiles,/ops-action-explanation|ops-date-proof|Why this action/);
    assert.match(tiles,/ops-tile-status/);
    assert.match(tiles,/ops-tile-countdown/);
    assert(tiles.includes(action.task.title),'Tile hid the next concrete task');
    const account=run('expanded=entries[0].id;rTracker(entries)');
    assert.doesNotMatch(account,/ops-date-proof|ops-action-why|Saved deadline|Why this action/);
    assert.equal(run('entries[0].reqDays'),2,'Removing duplicate guidance changed the deadline');
    assert.equal(run('JSON.stringify(entries)'),before,'Recommendations must not mutate entries');
    assert.equal(JSON.stringify([...storage]),persisted,'Recommendations must not write storage');
    run('runNextAccountAction(entries[0].id)');
    assert.equal(run('reqPrompt'),null,'Reviewing one task must not confirm the whole offer');
    run('runNextAccountMilestone(entries[0].id)');
    assert.equal(run('reqPrompt.entryId'),run('entries[0].id'));
    assert.equal(run('JSON.stringify(entries)'),before,'Opening an action must not complete requirements');
    assert.equal(JSON.stringify([...storage]),persisted,'Opening a confirmation must preserve saved data');
    run(`reqPrompt=null;entries[0].reqMet='2024-03-01';`);
    assert.equal(run('btNextActionForEntry(entries[0]).kind'),'bonus');
    assert.match(run('btNextActionForEntry(entries[0]).explanation'),/payment is not recorded/);
    assert.equal(run('btNextActionForEntry(entries[0]).context.confirmed'),false);
    assert.match(run('btNextActionForEntry(entries[0]).context.explanation'),/Date not confirmed/);
    run('runNextAccountAction(entries[0].id)');
    assert.equal(run('rcvPrompt.entryId'),run('entries[0].id'));
    assert.equal(run('entries[0].bonusRecd'),undefined,'Opening a payout action must not invent receipt');
    run(`rcvPrompt=null;entries[0].completeBonusText='Deposit income each month';`);
    assert.equal(run('btNextActionForEntry(entries[0]).kind'),'review','Recurring requirements must not route to whole-offer completion');
    run(`entries[0].completeBonusText='';entries[0].reqMet='';entries[0].requiredDaysText='2 business days';`);
    assert.equal(run('reqDeadline(entries[0])'),null);
    assert.equal(run('btNextActionForEntry(entries[0]).context.confirmed'),false);
    for(const wording of ['1 calendar month','one statement cycle']){
      sandbox.wording=wording;run('entries[0].requiredDaysText=wording');
      assert.equal(run('reqDeadline(entries[0])'),null,'Unsupported units must not become calendar days');
    }
    run(`entries[0].requiredDaysText='';entries[0].reqMet='2026-09-01';entries[0].customTimers=[{id:'payout',kind:'payout',text:'Bonus payout',date:'2026-10-01',startDate:'2026-09-01',daysRequired:30,done:false}];`);
    assert.equal(run('btNextActionForEntry(entries[0]).context.date'),'2026-10-01');
    assert.equal(run('btNextActionForEntry(entries[0]).context.date'),run('btLifecycleStageForEntry(entries[0]).timer.date'));

    run(`entries[0].customTimers=[];entries[0].bonusRecd='2026-09-02';entries[0].closeRestrictionType='payout-only';entries[0].closeRuleText='Keep the account open until the bonus posts.';entries[0].earlyCloseFee=0;entries[0].earlyTerminationFeeText='No early closing fee.';entries[0].churnable=true;entries[0].churnability='repeatable';entries[0].churn='1';entries[0].churnPeriodValue=12;entries[0].churnPeriodUnit='months';entries[0].sourceEligibilityBasis='bonus-received';entries[0].eligibilityEvidenceText='Not eligible if you received a checking bonus within the past 12 months.';entries[0].eligibilityEvidenceSource='official-promotion-terms';`);
    assert.equal(run('btNextActionForEntry(entries[0]).context.date'),run('safeCloseDate(entries[0])'));
    assert.equal(run('btNextActionForEntry(entries[0]).kind'),'close');
    assert.match(run('btNextActionForEntry(entries[0]).explanation'),/companion accounts/);
    // Re-evaluation on click catches a restriction added after the row rendered.
    run(`entries[0].minHoldDays=180;entries[0].closeRuleSource='manual';entries[0].closeRuleBasis='bonus';entries[0].closeBufferDays=5;entries[0].closeRuleText='Keep the account open for 180 days after the bonus is received.';entries[0].closeRestrictionType='minimum-open';`);
    assert.equal(run('btNextActionForEntry(entries[0]).kind'),'review');
    run('runNextAccountAction(entries[0].id)');
    assert.equal(run('closePrompt'),null,'Stale close action must not bypass the hold');
    run(`entries[0].closed='2026-09-10';`);
    const eligibility=run('btNextActionForEntry(entries[0])');
    assert.equal(eligibility.context.date,run('churnReadyDate(entries[0])'));
    assert.match(eligibility.context.explanation,/official.*safe reapply.*buffer/);
    run(`entries[0].bonusRecd='';`);
    assert.equal(run('btNextActionForEntry(entries[0]).context.confirmed'),false,'Missing anchor must fail closed');

    assert.equal(run("addM('2024-01-31',1)"),'2024-02-29');
    assert.equal(run("addM('2025-01-31',1)"),'2025-02-28');
    assert.equal(run("dB('2026-03-07','2026-03-09')"),2,'DST must not change calendar-day differences');
    run(`entries[0].bonusRecd='2026-06-01';entries[0].closed='2027-08-01';entries[0].eligibilityRules=[{id:'bonus-24m',basis:'bonus-received',periodValue:24,periodUnit:'months',evidenceText:'Not eligible if you received a checking bonus within the past 24 months.',evidenceSource:'official-promotion-terms'},{id:'closed-12m',basis:'account-closed',periodValue:12,periodUnit:'months',evidenceText:'Not available if you closed a checking account within the previous 12 months.',evidenceSource:'official-promotion-terms'}];`);
    assert.equal(run('btNextActionForEntry(entries[0]).context.date'),'2028-08-03');
    assert.equal(run('btNextActionForEntry(entries[0]).context.date'),run('churnReadyDate(entries[0])'));
    assert.match(run('btNextActionForEntry(entries[0]).context.explanation'),/account closed/);

    // Move the runtime's Date forward to exercise rollover without writing milestones.
    const NativeDate=sandbox.Date;
    sandbox.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2030-01-02T12:00:00']))}};
    run('modal=null;cfm=null;reqPrompt=null;rcvPrompt=null;closePrompt=null;timerEditModal=null;');
    run(`modal={bank:'Unsaved form'};`);
    const saved=JSON.stringify([...storage]);
    assert.equal(sandbox.btRefreshActionDay(),false,'Date refresh must not destroy an unsaved form');
    assert.equal(run('modal.bank'),'Unsaved form');
    run('modal=null');
    document.activeElement={tagName:'INPUT'};
    assert.equal(sandbox.btRefreshActionDay(),false,'Date refresh must not replace active input');
    document.activeElement=null;
    assert.equal(sandbox.btRefreshActionDay(),true);
    assert.equal(sandbox.btRefreshActionDay(),false,'Same-day refresh should not rerender');
    assert.equal(JSON.stringify([...storage]),saved,'Day refresh must preserve stored data');
    sandbox.Date=NativeDate;
    // Requirement confirmation must be retryable and atomic if storage fails.
    run("entries=[{id:'SYN-REQ-1',bank:'Synthetic Requirements',accountType:'personal',opened:'2026-01-01',bonus:200,notes:'Do not lose',checklist:[],customTimers:[]}];sv(SK,entries);openReqMet('SYN-REQ-1')");
    const beforeEmptyReq=JSON.stringify([...storage].sort((a,b)=>a[0].localeCompare(b[0])));
    assert.equal(run('reqSubmit()'),false,'Blank date must fail inline without advancing the workflow');
    assert.match(run('reqPrompt.error'),/date.*required/i,'Missing date should have a visible error');
    assert.match(run('rReqMet()'),/role="alert"/,'Requirement validation must be announced within the sheet');
    assert.equal(JSON.stringify([...storage].sort((a,b)=>a[0].localeCompare(b[0]))),beforeEmptyReq,'Empty form must not touch financial records');

    run("reqPrompt.date='2026-04-12'");
    const beforeFailure=run('JSON.stringify(entries)');
    const beforeStorage=JSON.stringify([...storage].sort((a,b)=>a[0].localeCompare(b[0])));
    const originalCommit=sandbox.BTPersistence.commit;
    sandbox.BTPersistence.commit=function(store,writes,...args){
      if(Object.prototype.hasOwnProperty.call(writes,'bt_e_v4'))throw Error('Synthetic requirement save outage');
      return originalCommit.call(this,store,writes,...args);
    };
    try{
      assert.equal(run('reqSubmit()'),false,'A failed write cannot confirm completion');
    }finally{sandbox.BTPersistence.commit=originalCommit}
    assert.equal(run('JSON.stringify(entries)'),beforeFailure,'Failed save must restore exact in-memory entry');
    assert.equal(JSON.stringify([...storage].sort((a,b)=>a[0].localeCompare(b[0]))),beforeStorage,'Failed save must restore companion history and terms');
    assert.equal(run('reqPrompt.date'),'2026-04-12','Failed save must retain the selected date');
    assert.match(run('reqPrompt.error'),/not saved/i,'Failed save should explain retry inline');
    assert.equal(run('cfm'),null,'Failed save must not show a success confirmation');
    assert.equal(run('reqSubmit()'),true,'Retry must succeed with preserved date');
    assert.equal(run('entries[0].reqMet'),'2026-04-12');
    assert.equal(JSON.parse(storage.get('bt_e_v4'))[0].reqMet,'2026-04-12','Successful retry must persist completion');
    run('reqPrompt=null;cfm=null;');

    console.log('Next actions passed: direct confirmations, stale-action protection, recurring review, shared dates, missing anchors/units, calendar boundaries, day refresh, and stored-data preservation');
    process.exit(0);
  }catch(err){console.error(err);process.exit(1)}
},100);
