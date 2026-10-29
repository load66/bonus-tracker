'use strict';
const assert=require('node:assert/strict'),engine=require('../financial-rules.js');
const {fixture}=require('./fixtures/financial-rules.cjs');
const original=fixture(),snapshot=JSON.stringify(original);
assert.deepEqual(engine.validate(original).issues,[]);
const fees=engine.answer(original,'How much are the service charges?');
assert.ok(fees.answer.includes('Checking: No recurring')&&fees.answer.includes('Share Savings: $10 monthly'));
assert.ok(fees.step.includes('$50 every day')&&fees.step.includes('Retain $50'));
assert.ok(engine.answer(original,'How many deposits qualify?').step.includes('every specified period'));
assert.equal(engine.summarize(original).recurring,true);
assert.equal(JSON.stringify(original),snapshot,'Evaluation must not mutate records');
const clone=()=>JSON.parse(snapshot),reject=(change,path)=>{const e=clone();change(e);assert.ok(!engine.validate(e).ok&&engine.validate(e).issues.some(x=>x.path.includes(path)),path);};
const looseZero=clone();
looseZero.feeScheduleRaw+=' Monthly fee $0 for the first cycle.';
looseZero.financialRules.closure.feeEvidence.quote='Monthly fee $0 for the first cycle.';
assert.equal(engine.validate(looseZero).ok,false,'A monthly $0 is not an early-close fee of zero');
reject(e=>e.financialRules.version=99,'version');
reject(e=>e.financialRules.accounts[1].fee.amount=null,'fee.amount');
reject(e=>e.financialRules.accounts[1].fee.amount=0,'fee.amount');
reject(e=>e.financialRules.accounts[1].fee.amount='10','fee.amount');
reject(e=>e.financialRules.accounts[1].id='checking','id');
reject(e=>e.financialRules.requirements[0].accountId='unknown','requirements');
reject(e=>e.financialRules.accounts[0].fee.evidence.quote='An invented fee waiver.','quote');
reject(e=>e.financialRules.accounts[1].fee.evidence.source='promotion','source');
reject(e=>e.financialRules.closure.minHoldDays=60,'closure');
reject(e=>e.financialRules.bonus.amount=500,'bonus');
reject(e=>e.financialRules.closure.feeEvidence.quote='No closing fees invented here.','quote');
reject(e=>e.termsVerifiedAt='2026-02-30','source');
reject(e=>e.financialRules.accounts[1].fee.frequency='none','frequency');
reject(e=>e.financialRules.payout.text='Paid immediately.','payout.text');
reject(e=>e.financialRules.accounts[1].fee.waiver.conditions[0].metric='average-daily-balance','metric');
const alternatives=clone();
const quote='Waive the $10 fee with either a $50 minimum daily balance OR $500 in payroll deposits each calendar month.';
alternatives.feeScheduleRaw+=' '+quote;
alternatives.financialRules.accounts[1].fee.waiver={operator:'any',evidence:{source:'fee-schedule',quote},conditions:[{id:'balance',kind:'balance-hold',metric:'minimum-daily-balance',amount:50,text:'Maintain a $50 daily balance.',period:'calendar-month',evidence:{source:'fee-schedule',quote}},{id:'payroll',kind:'direct-deposit',amount:500,text:'Receive $500 in payroll deposits each month.',period:'calendar-month',evidence:{source:'fee-schedule',quote}}]};
assert.equal(engine.validate(alternatives).ok,true);
assert.ok(engine.answer(alternatives,'How do I waive the fee?').answer.includes('any ONE'));
alternatives.financialRules.accounts[1].fee.waiver.operator='all';assert.equal(engine.validate(alternatives).ok,false,'OR cannot silently become AND');
const combined=clone(),both='Waive the $10 fee with BOTH a $50 minimum daily balance AND $500 in payroll deposits each calendar month.';
combined.feeScheduleRaw+=' '+both;
combined.financialRules.accounts[1].fee.waiver={...alternatives.financialRules.accounts[1].fee.waiver,evidence:{source:'fee-schedule',quote:both},conditions:alternatives.financialRules.accounts[1].fee.waiver.conditions.map(c=>({...c,evidence:{source:'fee-schedule',quote:both}}))};
assert.equal(engine.validate(combined).ok,true);assert.ok(engine.answer(combined,'Waive fees').answer.includes('ALL'));
const business=clone();business.tcSourceRaw+=' Complete requirements within three statement cycles after opening.';business.financialRules.requirements[0].evidence.quote=business.tcSourceRaw;business.financialRules.requirements[0].timing={basis:'opened',value:3,unit:'statement-cycles'};
assert.equal(engine.validate(business).ok,true);assert.ok(engine.validate(business).warnings.some(w=>w.message.includes('no day-count approximation')));
const legacy={bank:'Legacy bank'};assert.equal(engine.validate(legacy).mode,'legacy');assert.equal(engine.answer(legacy,'Monthly fee'),null);
const broken=clone();broken.financialRules.accounts[1].fee.amount=999;
assert.ok(engine.answer(broken,'Monthly fee').answer.includes('conflicting'));assert.ok(!engine.answer(broken,'Monthly fee').answer.includes('$999'));
assert.ok(engine.answer(broken,'Tell me about this offer').answer.includes('conflicting'),'An unfamiliar question cannot bypass invalid rule protection');
console.log('Financial rule contract passed: product scope, companion fees, ALL/ANY waivers, recurring periods, source evidence, conflicting numbers, unknowns, unsupported versions, calendar boundaries and legacy preservation');
const review=require('./fixtures/financial-rules.cjs').reviewFixture();
assert.equal(engine.validate(review).ok,true);assert(engine.validate(review).warnings.some(w=>/unconfirmed/.test(w.message)));
assert(engine.summarize(review).closure.includes('fee unconfirmed'));
const invalidReview=JSON.parse(JSON.stringify(review));invalidReview.financialRules.closure.restrictionType='payout-only';assert(!engine.validate(invalidReview).ok,'Unknown charge must not become automatic closure readiness');
const v1=JSON.parse(JSON.stringify(review));v1.financialRules.version=1;assert(!engine.validate(v1).ok,'v1 cannot silently acquire new metric or unknown-fee semantics');
const wrongMetric=JSON.parse(JSON.stringify(review));wrongMetric.financialRules.accounts[1].fee.waiver.conditions[0].metric='average-beginning-day-balance';wrongMetric.financialRules.accounts[1].fee.waiver.conditions[0].evidence.quote='The Share Savings fee is waived by maintaining a $50 minimum daily balance.';assert(!engine.validate(wrongMetric).ok,'A daily balance cannot stand in for a beginning-day average');


// v4: Exact 12-calendar-month bonus hold with separately unconfirmed service fee.
// These are synthetic terms; never infer a 365-day approximation or safe closure.
const calendarHold=clone();
const holdText='Account must remain open for a minimum of 12 months from account opening. If closed within 12 months the bonus may be deducted.';
const feeText='Fees may apply to account services; early-closing service charges are not specified in this schedule.';
calendarHold.opened='2026-10-29';
calendarHold.tcSourceRaw+=' '+holdText;
calendarHold.feeScheduleRaw=calendarHold.feeScheduleRaw.replace('No early account-closure fee applies.',feeText);
calendarHold.financialRules.version=4;
calendarHold.financialRules.closure={
  restrictionType:'manual-review',basis:'manual',minHoldDays:0,earlyCloseFee:null,
  hold:{basis:'opened',value:12,unit:'calendar-months'},text:holdText,
  evidence:{source:'promotion',quote:holdText},feeEvidence:{source:'fee-schedule',quote:feeText}
};
calendarHold.closeRuleBasis='manual';calendarHold.closeRestrictionType='manual-review';
calendarHold.minHoldDays=0;calendarHold.earlyCloseFee=null;calendarHold.closeBufferDays=3;
assert.equal(engine.validate(calendarHold).ok,true);
assert.ok(engine.validate(calendarHold).warnings.some(w=>/unconfirmed/i.test(w.message)));
assert.deepEqual(engine.closeHoldInfo(calendarHold),{
 holdUntil:'2027-10-29',reviewOn:'2027-11-01',
 basis:'opened',months:12,bufferDays:3,feeUnconfirmed:true,bonusReceived:false
});
const endFeb=JSON.parse(JSON.stringify(calendarHold));endFeb.opened='2024-02-29';
assert.equal(engine.closeHoldInfo(endFeb).holdUntil,'2025-02-28','Leap-year anniversary must clamp correctly');
const absent=JSON.parse(JSON.stringify(calendarHold));absent.opened='';
assert.equal(engine.closeHoldInfo(absent),null,'Unconfirmed opening date cannot generate hold date');
const noFeeProof=JSON.parse(JSON.stringify(calendarHold));noFeeProof.financialRules.closure.earlyCloseFee=0;
assert.equal(engine.validate(noFeeProof).ok,false,'Unknown closing charge cannot become $0');
const falseDays=JSON.parse(JSON.stringify(calendarHold));
falseDays.minHoldDays=365;falseDays.financialRules.closure.minHoldDays=365;
assert.equal(engine.validate(falseDays).ok,false,'Month-based hold cannot be approximated by days');
const wrongMonth=JSON.parse(JSON.stringify(calendarHold));wrongMonth.financialRules.closure.hold.value=11;
assert.equal(engine.validate(wrongMonth).ok,false,'Unsupported 11-month hold must be rejected');
const originalCalendar=JSON.stringify(calendarHold);
engine.closeHoldInfo(calendarHold);assert.equal(JSON.stringify(calendarHold),originalCalendar,'Closure projection must be read-only');
