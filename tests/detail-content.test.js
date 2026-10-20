'use strict';
const assert=require('node:assert/strict');
const {sandbox,storage}=require('./full-app-smoke.test.js');
const {fixture}=require('./fixtures/financial-rules.cjs');
const before=JSON.stringify([...storage]);
const e=fixture();
Object.assign(e,{
  id:'CHA-P-01',bank:'Chase Total Checking',bonus:300,opened:'2026-10-15',
  reqDays:90,requiredDaysText:'90 calendar days',checklist:[],reqMet:'',
  customTimers:[
    {id:'req',text:'Bonus requirement deadline · complete all qualifying direct deposits',date:'2027-01-13',startDate:'2026-10-15',daysRequired:90,done:false},
    {id:'payout',text:'Payout review after direct deposits qualify',date:'2027-02-10',done:false}
  ]
});
e.financialRules.requirements=[{
  id:'dd10k',accountId:'checking',kind:'direct-deposit',amount:10000,
  text:'Receive qualifying direct deposits totaling $10,000 within 90 calendar days of opening.',
  timing:{basis:'opened',unit:'calendar-days',value:90}
}];
e.financialRules.accounts[0].fee={
  amount:15,currency:'USD',frequency:'monthly',
  evidence:{source:'fee-schedule',quote:'A $15 monthly fee applies.'},
  waiver:{operator:'any',evidence:{source:'fee-schedule',quote:'Fee waived with $500 electronic deposits, or $1,500 minimum daily balance, or linked checking.'},
    conditions:[
      {kind:'direct-deposit',amount:500,text:'Qualifying electronic deposits'},
      {kind:'balance-hold',metric:'minimum-daily-balance',amount:1500,text:'Minimum daily balance'},
      {kind:'relationship',text:'Linked checking'}
    ]}
};
e.monthlyFeeWaiverText='Fee waived with $500 electronic deposits, or $1,500 minimum daily balance, or linked checking.';
e.financialRules.closure.earlyCloseFee=null;
e.financialRules.closure.feeEvidence=null;
e.earlyCloseFee=0;
e.earlyTerminationFeeText='';

const requirements=sandbox.BT360.requirementRows(e);
assert.equal(requirements.count,1,'A structured requirement exists without checklist tasks');
assert.match(requirements.html,/Direct deposits totaling \$10,000 · due Jan 13, 2027/);
assert.match(requirements.html,/\$0 of \$10,000 · 0 recorded/);
assert.match(requirements.html,/role="progressbar"[^>]*aria-valuenow="0"/);
assert.match(requirements.html,/role="checkbox"/);
assert.doesNotMatch(requirements.html,/No checklist tasks saved yet/);
assert.match(sandbox.BT360.detailPanels(e),/Direct deposits totaling \$10,000/);


// v3.6.21: projection-only derived deadlines and explicit global confirmation.
const syntheticDerived={...e,customTimers:[]};
const generated=sandbox.BT360.timerRows(syntheticDerived);
assert.match(generated,/data-source="saved-requirement"/,'Saved structured requirement yields a timer even without manually added timers');
assert.match(generated,/Requirement due/);
assert.match(generated,/Jan 13, 2027 · from saved offer terms/);
assert.match(generated,/not an added reminder/);
assert.match(generated,/Receive qualifying direct deposits totaling \$10,000/,'Original evidence text remains accessible');
const manual=sandbox.BT360.timerRows(e);
assert.doesNotMatch(manual,/data-source="saved-requirement"/,'Manually scheduled matching requirement deadline is not duplicated');
assert.match(sandbox.BT360.detailPanels(e),/bt3621-confirm-all[^>]*onclick="openReqMet\(&quot;CHA-P-01&quot;\)"/,'Confirm all opens the existing canonical completion dialog');
const tasksOnly={...e,reqDays:0,completeBonusText:'',checklist:[{text:'Call bank',done:false}],financialRules:{...e.financialRules,requirements:[]}};
assert.doesNotMatch(sandbox.BT360.detailPanels(tasksOnly),/bt3621-confirm-all/,'Checklist-only records must not expose the offer-level completion action');
assert.match(sandbox.BT360.detailPanels(tasksOnly),/Call bank/,'Standalone checklist tasks remain fully accessible');
assert.match(sandbox.BT360.detailPanels(e),/\+ Add task/,'Existing checklist action remains available');

/* v3.6.24: anchored requirement deadlines appear in the lifecycle banner
   without overriding unsupported clocks or completed milestones. */
const structuredOnly={...e,reqDays:0,requiredDaysText:'',customTimers:[]};
const structuredBanner=sandbox.BT360.detailPanels(structuredOnly);
assert.match(structuredBanner,/Requirements due Jan 13, 2027/,'Structured deadline drives the lifecycle summary without legacy reqDays');
assert.match(structuredBanner,/\d+ days left/,'Deadline badge uses the anchored countdown');
const doneRequirement={...structuredOnly,reqMet:'2026-10-17'};
assert.doesNotMatch(sandbox.BT360.timerRows(doneRequirement),/data-source="saved-requirement"/,'Completed requirements cannot generate overdue pending reminders');
assert.doesNotMatch(sandbox.BT360.detailPanels(doneRequirement),/Requirements due Jan 13, 2027/,'Completed requirement does not show as pending in lifecycle header');
const paidRequirement={...structuredOnly,bonusRecd:'2026-10-17'};
assert.doesNotMatch(sandbox.BT360.timerRows(paidRequirement),/data-source="saved-requirement"/,'Received bonus suppresses derived requirement reminders');
const unanchoredTiming={...e,reqDays:90,requiredDaysText:'90 days',financialRules:{...e.financialRules,requirements:[{...e.financialRules.requirements[0],timing:{basis:'opened',unit:'business-days',value:90}}]}};
assert.doesNotMatch(sandbox.BT360.detailPanels(unanchoredTiming),/Requirements due Jan 13, 2027/,'Do not invent calendar date from unsupported structured business-day clock');
assert.doesNotMatch(sandbox.BT360.timerRows({...unanchoredTiming,customTimers:[]}),/data-source="saved-requirement"/,'Unsupported clock never generates a dated timer');
const beforeBannerEntry=JSON.stringify(structuredOnly);
sandbox.BT360.detailPanels(structuredOnly);
assert.equal(JSON.stringify(structuredOnly),beforeBannerEntry,'Rendering deadline summaries never mutates saved entries');


// v3.6.25: match in-progress PDF section ordering without hiding existing actions.
const inProgressLayout=sandbox.BT360.detailPanels(e);
const sectionHeadings=[...inProgressLayout.matchAll(/<h3>([^<]+)<\/h3>/g)].map(match=>match[1]);
const reqIndex=sectionHeadings.indexOf('Requirements'),feeIndex=sectionHeadings.indexOf('Fees &amp; waivers'),timerIndex=sectionHeadings.indexOf('Timers');
assert(reqIndex>=0&&feeIndex>reqIndex&&timerIndex>feeIndex,'In-progress detail order must be Requirements, Fees & waivers, Timers');
assert.equal(sectionHeadings.filter(title=>title==='Fees &amp; waivers').length,1,'Monthly and early-close evidence must have exactly one fee section');
assert.match(inProgressLayout,/\+ Add task/,'Task editor link survives panel reordering');
assert.match(inProgressLayout,/openTimerEditor/,'Saved timer editing remains available after panel reordering');
assert.match(inProgressLayout,/runBankAction\(&quot;CHA-P-01&quot;,'timer'\)/,'Add timer still opens the saved timer handler');

const fees=sandbox.BT360.feeDetail(e);
assert.match(fees,/Monthly fee<\/span><div><b[^>]*>\$15<\/b>/);
assert.match(fees,/ANY: \$500\+ electronic deposits/);
assert.match(fees,/View saved fee terms/);
assert.match(fees,/Fee waived with \$500 electronic deposits/,'Original fee quote stays available');
assert.match(sandbox.BT360.feeDetail(require('./fixtures/financial-rules.cjs').fixture()),/Required companion: Share Savings: \$10 · membership minimum \$50/,'Companion account costs remain distinct from primary checking fee');
assert.match(fees,/Early close fee<\/span><div><b class="bt3611-amber">Not confirmed<\/b>/);
assert.doesNotMatch(fees,/>This month<|Waiver not confirmed/,'Only the two requested fee rows appear');
assert.doesNotMatch(fees,/Waiver on track/,'Never claim a monthly waiver from unlinked evidence');
assert.match(fees,/bt3611-amber/);

// Legacy imported terms must still render after migrating to v3.6.14.
const legacy={...e,financialRules:{accounts:[{role:'primary'}],closure:{}},
 monthlyFeeAmountText:'$8 per month',monthlyFeeWaiverText:'',
 avoidMonthlyFeeText:'Waived with $500 ACH direct deposits or $1,500 average balance',
 earlyCloseFee:0,earlyTerminationFeeText:'Early account closing: $25 fee if closed within 180 days of opening.',
 closeRuleText:'',feeScheduleSourceUrl:'https://www.regions.com/personal-banking/checking/lifegreen-checking-account'};
const legacyMarkup=sandbox.BT360.feeDetail(legacy);
assert.match(legacyMarkup,/Monthly fee<\/span><div><b[^>]*>\$8<\/b>/);
assert.match(legacyMarkup,/ANY: Waived with \$500 ACH direct deposits · \$1,500 average balance/);
assert.match(legacyMarkup,/\$25 early-close fee/,'Explicit old close-fee text is recovered');
assert.match(legacyMarkup,/View saved close terms/);
assert.match(legacyMarkup,/Fee schedule/);
assert.doesNotMatch(legacyMarkup,/>This month<|Waiver on track/);
assert.equal((legacyMarkup.match(/class="bt3613-fee-line"/g)||[]).length,2);
const savedZero={...legacy,earlyTerminationFeeText:'No early closing fee.',monthlyFeeAmountText:'No monthly service fee',
  monthlyFeeNoMonthlyServiceFee:true,avoidMonthlyFeeText:''};
assert.match(sandbox.BT360.feeDetail(savedZero),/No early-closing fee/);
assert.match(sandbox.BT360.feeDetail(savedZero),/>Monthly fee<\/span><div><b[^>]*>\$0<\/b>/);
const clawback={...legacy,earlyTerminationFeeText:'If the account is closed within six months, the bank will deduct the $900 bonus at closing.'};
assert.match(sandbox.BT360.feeDetail(clawback),/Not confirmed/,'Clawback is not fabricated as a fee');
assert.match(sandbox.BT360.feeDetail(clawback),/Bonus clawback is separate/);
assert.doesNotMatch(sandbox.BT360.feeDetail(clawback),/\$900 early-close fee/);
const conditionalNoFee={...legacy,earlyTerminationFeeText:'No early close fee after 180 days.'};
assert.match(sandbox.BT360.feeDetail(conditionalNoFee),/Not confirmed/,'Conditional no-fee wording cannot imply a free early closure');
const cooldownNoDate={
 id:'SYNT-P-84',bank:'Synthetic Churn Test',accountType:'personal',bonus:400,
 opened:'2026-01-10',closed:'2026-05-12',churnability:'repeatable',
 eligibilityText:'A previous checking bonus within 12 months is ineligible.'
};
const coolingList=sandbox.BT360.archive([cooldownNoDate]);
assert.match(coolingList,/Last saved \$400 bonus/);
assert.match(coolingList,/A previous checking bonus within 12 months is ineligible/);
assert.match(coolingList,/Details/);
assert.doesNotMatch(coolingList,/Needs review · verify eligibility rules/);
const coolingDetail=sandbox.BT360.detailPanels(cooldownNoDate);
assert.match(coolingDetail,/No confirmed date/);
assert.match(coolingDetail,/previous checking bonus within 12 months/);
const estimatedPast={...cooldownNoDate,id:'SYNT-P-85',opened:'2020-01-01',closed:'2021-01-01',
 churn:'1',eligibilityText:'Legacy saved one-year rule, no verified supporting source.'};
const estimatedList=sandbox.BT360.archive([estimatedPast]);
assert.match(estimatedList,/<b>0<\/b><small>Eligible now<\/small>/,'Unverified historic dates must not certify current eligibility');

/* v3.6.27: all computable saved dates show a countdown, with verification status. */
assert.match(require('node:fs').readFileSync('app.js','utf8'),/const APP_VERSION='3\.6\.51';/,'The on-screen app version reflects this release');
assert.match(require('node:fs').readFileSync('index.html','utf8'),/app\.js\?v=3\.6\.51-queue1/,'The version label is refreshed on clients');
const archiveFutureDate='2030-01-01';
const projectedFuture=sandbox.BT360.archiveCountdown({eligible:archiveFutureDate,verified:false});
assert(projectedFuture&&projectedFuture.days>0&&projectedFuture.caption==='days · estimate','Unverified saved future date shows an estimated countdown');
const verifiedFuture=sandbox.BT360.archiveCountdown({eligible:archiveFutureDate,verified:true});
assert(verifiedFuture&&verifiedFuture.days===projectedFuture.days&&verifiedFuture.caption==='days left','Verified saved future dates show the same countdown without estimate label');
const passedEstimate=sandbox.BT360.archiveCountdown({eligible:'2020-01-01',verified:false});
assert.equal(passedEstimate.days,0);
assert.equal(passedEstimate.caption,'Estimate passed','An expired unverified estimate cannot be labeled eligible now');
assert.equal(sandbox.BT360.archiveCountdown({eligible:'',verified:false}),null,'Missing date still uses Details');
const previewEstimate=sandbox.BT360.archive([estimatedPast]);
assert.match(previewEstimate,/class="bt3727-countdown is-estimated"/,'Saved unverified date has prominent right-hand countdown');
assert.match(previewEstimate,/>0<\/strong><small>Estimate passed<\/small>/,'Expired unverified estimates require review rather than certified eligibility');
assert.match(previewEstimate,/openArchived\(&quot;SYNT-P-85&quot;\)/,'Countdown remains linked to account details');
assert.match(previewEstimate,/Unverified dates are estimates/,'The archive explains why dates are provisional');
assert.equal((previewEstimate.match(/class="bt360-list-row bt3727-archive-row"/g)||[]).length,1,'Each saved estimate appears only once across Archive sections');
const beforeArchiveCountdown=JSON.stringify([...storage]);
sandbox.BT360.archive([estimatedPast,cooldownNoDate]);
assert.equal(JSON.stringify([...storage]),beforeArchiveCountdown,'Countdown presentation cannot mutate stored financial records');

// Unified view regression: scope is a display filter only.
const oldAudience=sandbox.BT360.audience;
const samplePersonal={...estimatedPast,id:'VIEW-P-01',accountType:'personal'};
const sampleBusiness={...estimatedPast,id:'VIEW-B-01',accountType:'business'};
const beforeUnified=JSON.stringify([...storage]);
const originalViewPreference=storage.get('bt3628_audience_session');
try{
 sandbox.BT360.setAudience('all');
 assert(sandbox.BT360.scope(samplePersonal)&&sandbox.BT360.scope(sampleBusiness));
 assert.match(sandbox.BT360.compactRow(sampleBusiness),/bt3628-kind business/);
 assert.match(sandbox.BT360.detailHead(sampleBusiness),/Business ·/);
 assert.match(sandbox.BT360.detailHead(samplePersonal),/Personal ·/);
 const both=sandbox.BT360.archive([samplePersonal,sampleBusiness]);
 assert.match(both,/bt3628-kind personal/);
 assert.match(both,/bt3628-kind business/);
 sandbox.BT360.setAudience('personal');
 assert(sandbox.BT360.scope(samplePersonal)&&!sandbox.BT360.scope(sampleBusiness));
 sandbox.BT360.setAudience('business');
 assert(!sandbox.BT360.scope(samplePersonal)&&sandbox.BT360.scope(sampleBusiness));
}finally{
 sandbox.BT360.setAudience(oldAudience);
 // The test sandbox shares its Map between sessionStorage and localStorage.
 // Restore the legitimate UI-only selection preference before asserting no financial writes.
 if(originalViewPreference===undefined)storage.delete('bt3628_audience_session');
 else storage.set('bt3628_audience_session',originalViewPreference);
}
assert.equal(JSON.stringify([...storage]),beforeUnified,'View filters cannot mutate records');
const archiveRecord={...legacy,closed:'2026-10-17',bonusRecd:'2026-10-17'};
assert.match(sandbox.BT360.detailPanels(archiveRecord),/Fees &amp; waivers|Fees & waivers/,'Churn and closed record details retain fee section');
assert.match(sandbox.BT360.detailPanels(archiveRecord),/\$25 early-close fee/);

// Cooldown history uses account-specific archived evidence before newer bank
// versions, shows last-saved provenance, and never upgrades live enrolled data.
const termsBackup=storage.get('bt_tc_archive_v1');
try{
 const archivedPersonal={bank:'Synthetic Cooldown CU',accountType:'personal',entryId:'SYN-CLOSE-1',
  opened:'2026-01-01',monthlyFeeAmountText:'$8 per month',
  monthlyFeeWaiverText:'$500 monthly ACH direct deposits or $1,500 average balance',
  earlyTerminationFeeText:'$25 early closing fee within 180 days.'};
 const newerPersonal={...archivedPersonal,entryId:'SYN-NEW-2',opened:'2026-09-01',
  monthlyFeeAmountText:'$14 per month',earlyTerminationFeeText:'$35 early closing fee.'};
 const otherBusiness={...archivedPersonal,accountType:'business',monthlyFeeAmountText:'$99 per month'};
 storage.set('bt_tc_archive_v1',JSON.stringify({
  personal:{current:newerPersonal,versions:[archivedPersonal]},
  business:{current:otherBusiness,versions:[]}
 }));
 const closed={id:'SYN-CLOSE-1',bank:'Synthetic Cooldown CU',accountType:'personal',
  opened:'2026-01-01',closed:'2026-08-01',earlyCloseFee:0,financialRules:null};
 const cooldown=sandbox.BT360.feeDetail(closed);
 assert.match(cooldown,/Last saved · saved enrolled terms/,'Historical sources must be labeled');
 assert.match(cooldown,/>Monthly fee<\/span><div><b[^>]*>\$8<\/b>/,'Exact-cycle fee wins over newer version');
 assert.match(cooldown,/\$25 early-close fee/);
 assert.doesNotMatch(cooldown,/\$14|\$35|\$99|Not confirmed|Waiver not confirmed/,
  'Newer-cycle and business fees must not leak into the historical offer');
 assert.equal((cooldown.match(/class="bt3613-fee-line"/g)||[]).length,2);
 const latestOnly={...closed,id:'SYN-OLDER-0',opened:'2025-01-01'};
 assert.match(sandbox.BT360.feeDetail(latestOnly),/Last saved · last saved bank terms/);
 assert.match(sandbox.BT360.feeDetail(latestOnly),/\$14/,'No cycle-specific terms: use labeled last saved bank info');
 const empty={...closed,bank:'Synthetic Missing Fee CU'};
 assert.match(sandbox.BT360.feeDetail(empty),/Not listed in saved terms/);
 assert.doesNotMatch(sandbox.BT360.feeDetail(empty),/>Not confirmed<\/b>/);
 const active={...closed,closed:''};
 assert.match(sandbox.BT360.feeDetail(active),/Not confirmed/,'Open accounts do not borrow different-cycle fee terms');
 assert.doesNotMatch(sandbox.BT360.feeDetail(active),/Last saved ·/);
 const historicalSnapshot=JSON.stringify(closed);
 sandbox.BT360.feeDetail(closed);
 assert.equal(JSON.stringify(closed),historicalSnapshot,'Rendering historical terms never mutates account records');
}finally{
 if(termsBackup===undefined)storage.delete('bt_tc_archive_v1');
 else storage.set('bt_tc_archive_v1',termsBackup);
}
const legacyCompanion={...legacy,financialRules:null,monthlyFeeAmountText:'$10',
 monthlyFeeYNText:'Personal checking: $0 monthly maintenance fee. Required Share Savings: $10/month if the $50 minimum balance is not maintained.',
 monthlyFeeWaiverText:'Keep $50 in Share Savings to avoid the fee.'};
const shareMarkup=sandbox.BT360.feeDetail(legacyCompanion);
assert.match(shareMarkup,/>Monthly fee<\/span><div><b[^>]*>\$0<\/b>/,'Checking fee stays $0');
assert.match(shareMarkup,/Required companion: Share Savings: \$10\/month/,'Share Savings fee remains separate');
const bonusClawback={...legacy,bank:'Synthetic Equity',bonus:400,earlyCloseFee:400,
 earlyTerminationFeeText:'400',notes:'180 day clawback',closed:'2026-09-16'};
const bonusClawbackMarkup=sandbox.BT360.feeDetail(bonusClawback);
assert.match(bonusClawbackMarkup,/Saved bonus clawback: up to \$400/);
assert.doesNotMatch(bonusClawbackMarkup,/\$400 early-close fee/,
 'A clawback is not a bank early-closing service charge');

assert.equal(JSON.stringify([...storage]),before,'Fee projections never write stored records');


// A conditional no-fee statement must never yield a green Close check,
// even if the saved hold clock has elapsed. The fee-summary evidence
// projection is the single source used for both read-only displays.
const conditionalClosing={...e,earlyCloseFee:0,earlyTerminationFeeText:'No early close fee after 180 days.',
  financialRules:{...e.financialRules,closure:{...e.financialRules.closure,earlyCloseFee:null,feeEvidence:null}}};
const feeCheck=entry=>sandbox.BT360.closeCheckPresentation(entry).find(item=>item.label==='Early close fee window cleared');
assert.equal(feeCheck(conditionalClosing).ok,false,'Conditional fee-free terms are not unconditional clearance');
assert.match(feeCheck(conditionalClosing).detail,/conditional|Needs review/i);
const explicitFree={...conditionalClosing,bonusRecd:'2026-10-12',earlyTerminationFeeText:'No early closing fee.'};
assert.equal(feeCheck(explicitFree).ok,true,'Explicit unconditional no-fee evidence may be shown as cleared');
assert.match(feeCheck(explicitFree).detail,/Explicit no-fee terms saved/);
assert.equal(sandbox.BT360.closeCheckPresentation(explicitFree).find(x=>x.label==='Minimum hold met').ok,true,'Verified payout-only closure with posted bonus must not need a fictitious fixed hold');
const pendingPayout={...explicitFree,bonusRecd:''};
assert.equal(sandbox.BT360.closeCheckPresentation(pendingPayout).find(x=>x.label==='Minimum hold met').ok,false,'Payout-only restriction stays pending until confirmed receipt');
const feeCharged={...conditionalClosing,earlyCloseFee:25,earlyTerminationFeeText:'$25 early closing fee for accounts closed within 180 days.'};
assert.equal(feeCheck(feeCharged).ok,false,'Positive early-close charges require window review even when a hold timer runs out');
assert.match(feeCheck(feeCharged).detail,/fee window before closing/);
assert.equal(JSON.stringify([...storage]),before,'Close checks are pure view projections');


// A payout must not silently clear the bonus-retention check without evidence.
const payoutForRetention={...e,bonusRecd:'2026-10-12',
 financialRules:{...e.financialRules,closure:{...e.financialRules.closure,restrictionType:'payout-only',
  evidence:{source:'promotion',quote:'Keep the account open until the bonus posts.'}}}};
const retained=entry=>sandbox.BT360.closeCheckPresentation(entry).find(item=>item.label==='Bonus kept after closing');
assert.equal(retained(payoutForRetention).ok,true,'Payout-only evidence with received bonus can clear its documented restriction');
const noRetentionEvidence={...payoutForRetention,closeRuleText:'',closeRuleSourceSentence:'',
 closeRestrictionType:'none',financialRules:{...payoutForRetention.financialRules,closure:{...payoutForRetention.financialRules.closure,restrictionType:'none',evidence:null}}};
assert.equal(retained(noRetentionEvidence).ok,false,'No saved closure evidence cannot prove the bonus will be retained');
const feeOnlyRetention={...noRetentionEvidence,closeRuleText:'No early closing fee.'};
assert.equal(retained(feeOnlyRetention).ok,false,'An early-close service fee is not evidence against bonus clawback');
assert.equal(sandbox.BT360.closeCheckPresentation(feeOnlyRetention).find(x=>x.label==='Bonus kept after closing').ok,false,'No-fee alone cannot prove no clawback');
const explicitRetention={...noRetentionEvidence,closeRuleText:'No bonus clawback applies after closing.'};
assert.equal(retained(explicitRetention).ok,true,'Explicit saved no-clawback evidence may confirm retention');
assert.equal(retained({...payoutForRetention,bonusRecd:''}).ok,false,'Without received payout the retention check stays open');
assert.equal(JSON.stringify([...storage]),before,'Retention evidence review does not write stored data');

const timers=sandbox.BT360.timerRows(e);
assert.match(timers,/Requirement due/);
assert.match(timers,/Jan 13, 2027 · 90 days after opening/);
assert.match(timers,/bt3611-timer-body/);
assert.match(timers,/Bonus pending/);
assert.doesNotMatch(timers,/Due Date:|Start \+ Days:/);
assert.match(timers,/Bonus requirement deadline · complete all qualifying direct deposits/,'Full timer text preserved when expanded');

const details=sandbox.BT360.detailPanels(e);
assert.match(details,/After bonus posts/,'Close date explains the payout trigger without making up a date');
assert.match(details,/After bonus payment/,'Eligibility displays the pending known start event');
assert.doesNotMatch(details,/Set rule/,'Known rules awaiting payout should not require needless editing');
assert.doesNotMatch(details,/>This month</);
const payoutOnly={...e,customTimers:[],payoutTimingText:'Expected within 15 days after requirements',financialRules:{...e.financialRules,payout:{text:'Expected within 15 days after requirements',timing:{basis:'reqmet',value:15,unit:'calendar-days'}}}};
assert.match(sandbox.BT360.timerRows(payoutOnly),/Bonus pending/);
assert.match(sandbox.BT360.timerRows(payoutOnly),/After qualification/);
assert.doesNotMatch(sandbox.BT360.timerRows(payoutOnly),/Payout on track|Bonus received/);

assert.match(details,/Fees &amp; waivers|Fees & waivers/);
assert.doesNotMatch(details,/\b(?:null|structured rule|anchor|verified \$0|provenance)\b/i);
assert.equal(typeof sandbox.BT360.openRuleEditor,'function');
assert.equal(typeof sandbox.BT360.openActivity,'function');
assert.equal(JSON.stringify([...storage]),before,'The new detail functions may not write account data');
const priorSuggestions=sandbox.getAttentionSuggestions;
sandbox.getAttentionSuggestions=()=>[{entryId:e.id,bank:e.bank,stageCode:'AWAITING_BONUS',stageLabel:'Awaiting Bonus',task:{title:'Confirm bonus payment'},dateContext:{date:'',confirmed:false}}];
try{
 const needs=sandbox.BT360.tasks([e]);
 assert.match(needs,/Awaiting bonus/,'Show actual lifecycle stage instead of missing-date status');
 assert.match(needs,/Payout date not confirmed/,'Missing payout clock must be separately explained');
 assert.doesNotMatch(needs,/>Needs review<\/span>/,'No generic review badge replacing lifecycle stage');
}finally{sandbox.getAttentionSuggestions=priorSuggestions}

console.log('Bonus detail v3.6.17 passed: Chase requirement, due date, zero recorded progress, compact timers, fee summary, unconfirmed close fee, rule editor, read-only data');


/* The Manage sheet must be read-only and use the same underlying action handlers. */
const vm=require('node:vm'),fs=require('node:fs');
const sheetRecord={...e,id:'CHA-P-01',bank:'Chase',reqMet:'2026-10-18',bonusRecd:'',closed:'',checklist:[],customTimers:[]};
const originalEntries=vm.runInContext('entries',sandbox),previousPrompt=sandbox.__btBankActionPrompt;
sandbox.__manageFixture=sheetRecord;
vm.runInContext('entries=[__manageFixture];window.__btBankActionPrompt=__manageFixture.id;',sandbox);
try{
  const sheet=sandbox.rBankActions();
  assert.match(sheet,/role="dialog" aria-modal="true" aria-label="Account actions"/);
  assert.match(sheet,/bt-ba-backdrop/);
  assert.match(sheet,/bt-ba-stage/);
  const footerLabel=sandbox.BT360.primaryAction(sheetRecord).label;
  if(footerLabel==='Record deposit')assert.doesNotMatch(sheet,/Update completion date/,'Completion confirmation cannot duplicate the footer');
  else assert.match(sheet,/Update completion date/);
  assert.match(sheet,/Edit account/);
  assert.match(sheet,/Add task/);
  assert.match(sheet,/Add timer/);
  assert.match(sheet,/Activity/);
  assert.match(sheet,/Delete account/);
  assert.match(sheet,/<svg viewBox="0 0 24 24"/);
  assert.doesNotMatch(sheet,/\bREQ MET\b|REQ_MET/);
  const visibleActions=sheet.split('<details class="bt-ba-more">')[0]+' '+sheet.slice(sheet.indexOf('<div class="bt-ba-delete"'));
  assert.doesNotMatch(visibleActions,/[\u{1F300}-\u{1FAFF}]/u,'Visible Manage actions cannot use emoji');
  if(footerLabel==='Confirm received')assert.doesNotMatch(visibleActions,/>Confirm bonus received</,'Stage action must not duplicate primary footer');
  assert.doesNotMatch(visibleActions,/>Ask AI</,'Footer Ask AI must not repeat in main menu');
  assert(sheet.lastIndexOf('Delete account')>sheet.indexOf('Activity'),'Delete must appear last');
  const theme=fs.readFileSync('redesign-v360.css','utf8');
  assert(theme.includes('#12141C')&&theme.includes('.bt-ba-delete'),'Dark manage sheet style absent');
  assert(theme.includes('env(safe-area-inset-bottom'),'iPhone safe-area inset missing');
  assert.equal(JSON.stringify([...storage]),before,'Previewing Manage wrote storage');
  assert.equal(typeof sandbox.runBankAction,'function','Existing handler must be retained');
}finally{
  sandbox.__originalEntries=originalEntries;
  vm.runInContext('entries=__originalEntries;window.__btBankActionPrompt=null;',sandbox);
  delete sandbox.__originalEntries;delete sandbox.__manageFixture;
  sandbox.__btBankActionPrompt=previousPrompt;
}
console.log('Manage sheet v3.6.13 passed: human stage, SVG icons, safe-area layout contract, no duplicate actions or storage writes');


/* v3.6.29: bank-first attention hierarchy and verified local logo registry. */
const chaseMark=sandbox.bankLogo('Chase Total Checking',true);
assert.match(chaseMark,/bank-logos\/chase\.svg/,'Chase variants share their local institution mark');
assert.match(sandbox.bankLogo('Citi Checking',true),/bank-logos\/citi\.svg/);
assert.match(sandbox.bankLogo('Wells Fargo Everyday',true),/bank-logos\/wells-fargo\.svg/);
assert.match(sandbox.bankLogo('Bank of America Business Advantage',true),/bank-logos\/bank-of-america\.svg/);
assert.match(sandbox.bankLogo('Citizens Bank',true),/bank-logos\/citizens-bank\.svg/,'Citizens receives its own logo, never Citi');
assert.doesNotMatch(sandbox.bankLogo('Citizen City Credit Union',true),/<img /,'Similar generic words do not borrow institution marks');
assert.match(sandbox.bankLogo('PNC Virtual Wallet',true),/bank-logos\/pnc\.svg/);
assert.match(sandbox.bankLogo('U.S. Bank Smartly',true),/bank-logos\/us-bank\.svg/);
assert.match(sandbox.bankLogo('Regions Bank',true),/bank-logos\/regions-bank\.svg/);
assert.match(sandbox.bankLogo('Huntington National Bank',true),/bank-logos\/huntington-bank\.svg/);
assert.doesNotMatch(sandbox.bankLogo('Fidelity Bank',true),/<img /,'Independent Fidelity-named bank must not inherit brokerage logo');
assert.doesNotMatch(sandbox.bankLogo('Central Bank of America',true),/<img /,'Embedded names are not authoritative identities');
assert.match(sandbox.bankLogo('Unknown Local Credit Union',true),/blogo/,'Unknown institutions retain initials fallback');
const originalAttention=sandbox.getAttentionSuggestions;
sandbox.getAttentionSuggestions=()=>[
 {entryId:'logo-chase',bank:'Chase',stageCode:'IN_PROGRESS',stageLabel:'In progress',task:{title:'Receive $10,000 in qualifying direct deposits'},dateContext:{confirmed:true,date:'2026-10-22'}},
 {entryId:'logo-citi',bank:'Citi',stageCode:'AWAITING_BONUS',stageLabel:'Awaiting bonus',task:{title:'Confirm bonus payment'},dateContext:{confirmed:false,date:''}}
];
try{
 const chaseRow={...e,id:'logo-chase',bank:'Chase',bonus:900,checklist:[],financialRules:{...e.financialRules,requirements:[]}};
 const citiRow={...e,id:'logo-citi',bank:'Citi',bonus:325,checklist:[],reqMet:'2026-10-10'};
 const attention=sandbox.BT360.tasks([chaseRow,citiRow]);
 assert.match(attention,/bt3729-bank-name">Chase<\/b>/,'Bank name leads the featured card');
 assert.match(attention,/bt3729-bank-name">Citi<\/b>/,'Bank name leads regular card');
 assert.match(attention,/Receive \$10,000 in qualifying direct deposits/,'Requirement remains under bank');
 assert.match(attention,/Personal · Due Oct 22, 2026/,'Account type and due date share the metadata line');
 assert.equal((attention.match(/\$900/g)||[]).length,1,'Featured bonus amount must not repeat in subtitles');
 assert.equal((attention.match(/\$325/g)||[]).length,1,'Regular bonus amount must not repeat in subtitles');
 assert.match(attention,/onclick="runNextAccountAction/,'Existing action handler retained');
 assert.match(attention,/onclick="openAccountFromActionCenter/,'Existing detail handler retained');
}finally{sandbox.getAttentionSuggestions=originalAttention;}
assert.equal(JSON.stringify([...storage]),before,'Logo and attention projections are read-only');
console.log('Bank logo and attention hierarchy regression passed');

