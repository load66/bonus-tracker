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

const fees=sandbox.BT360.feeDetail(e);
assert.match(fees,/Monthly fee<\/span><div><b>\$15<\/b>/);
assert.match(fees,/ANY: \$500\+ electronic deposits/);
assert.match(fees,/View full terms/);
assert.match(fees,/Fee waived with \$500 electronic deposits/,'Original fee quote stays available');
assert.match(fees,/Early close fee<\/span><div><b class="bt3611-amber">Not confirmed<\/b>/);
assert.match(fees,/Waiver not confirmed/,'Waiver remains unconfirmed without recorded activity');
assert.doesNotMatch(fees,/Waiver on track/,'Never claim a monthly waiver from unlinked evidence');
assert.match(fees,/bt3611-amber/);

const timers=sandbox.BT360.timerRows(e);
assert.match(timers,/Requirement due/);
assert.match(timers,/Jan 13, 2027 · 90 days after opening/);
assert.match(timers,/bt3611-timer-body/);
assert.match(timers,/Bonus pending/);
assert.doesNotMatch(timers,/Due Date:|Start \+ Days:/);
assert.match(timers,/Bonus requirement deadline · complete all qualifying direct deposits/,'Full timer text preserved when expanded');

const details=sandbox.BT360.detailPanels(e);
assert.match(details,/Set rule/);
assert.match(details,/Close terms missing|Close rule unverified/);
assert.match(details,/Eligibility rule missing|Date not calculable|After account closure/);
assert.match(details,/This month/);
const payoutOnly={...e,customTimers:[],payoutTimingText:'Expected within 15 days after requirements',financialRules:{...e.financialRules,payout:{text:'Expected within 15 days after requirements',timing:{basis:'reqmet',value:15,unit:'calendar-days'}}}};
assert.match(sandbox.BT360.timerRows(payoutOnly),/Bonus pending/);
assert.match(sandbox.BT360.timerRows(payoutOnly),/After qualification/);
assert.doesNotMatch(sandbox.BT360.timerRows(payoutOnly),/Payout on track|Bonus received/);

assert.match(details,/Fees &amp; waivers|Fees & waivers/);
assert.doesNotMatch(details,/\b(?:null|structured rule|anchor|verified \$0|provenance)\b/i);
assert.equal(typeof sandbox.BT360.openRuleEditor,'function');
assert.equal(typeof sandbox.BT360.openActivity,'function');
assert.equal(JSON.stringify([...storage]),before,'The new detail functions may not write account data');
console.log('Bonus detail v3.6.13 passed: Chase requirement, due date, zero recorded progress, compact timers, fee summary, unconfirmed close fee, rule editor, read-only data');


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
console.log('Manage sheet v3.6.12 passed: human stage, SVG icons, safe-area layout contract, no duplicate actions or storage writes');
