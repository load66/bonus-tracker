'use strict';
const G=require('../eligibility-gate.js');

function assert(ok,msg){if(!ok)throw new Error(msg)}
function parts(date){const m=String(date||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?{y:+m[1],mo:+m[2],d:+m[3]}:null}
function addD(date,days){const p=parts(date);if(!p)return'';const d=new Date(Date.UTC(p.y,p.mo-1,p.d));d.setUTCDate(d.getUTCDate()+Number(days||0));return d.toISOString().slice(0,10)}
function addM(date,months){const p=parts(date);if(!p)return'';const total=p.y*12+(p.mo-1)+Number(months||0),y=Math.floor(total/12),mo=((total%12)+12)%12,last=new Date(Date.UTC(y,mo+1,0)).getUTCDate();return `${y}-${String(mo+1).padStart(2,'0')}-${String(Math.min(p.d,last)).padStart(2,'0')}`}

assert(G.VERSION==='1.3.0','Unexpected eligibility gate version');

const bonusRule={
  churnable:true,churnability:'repeatable',churn:'1',churnPeriodValue:12,churnPeriodUnit:'months',
  sourceEligibilityBasis:'bonus-received',bonusRecd:'2026-09-01',
  eligibilityEvidenceText:'Not eligible if you received a Wells Fargo consumer checking bonus within the past 12 months.',
  eligibilityEvidenceSource:'official-promotion-terms'
};
let v=G.validate(bonusRule);
assert(v.ok&&v.basis==='bonus-received'&&v.period.value===12&&v.period.unit==='months','Bonus-received T&C did not verify');
assert(G.officialEligibilityDate(bonusRule,addD,addM)==='2027-09-01','Official eligibility date is wrong');
assert(G.safeEligibilityDate(bonusRule,addD,addM)==='2027-09-06','5-day safe application date is wrong');

const wrongBasis={...bonusRule,sourceEligibilityBasis:'account-opened',churnBasis:'opened',opened:'2026-08-25'};
assert(!G.validate(wrongBasis).ok,'Mismatched account-opened basis passed bonus-received wording');

const sixMonths={
  churnable:true,churnability:'repeatable',churnPeriodValue:6,churnPeriodUnit:'months',sourceEligibilityBasis:'account-opened',opened:'2026-01-31',
  eligibilityEvidenceText:'You are not eligible if you opened a checking account with us within the past 6 months.',
  eligibilityEvidenceSource:'official-promotion-terms'
};
assert(G.validate(sixMonths).ok,'Exact six-month rule did not verify');
assert(G.safeEligibilityDate(sixMonths,addD,addM)==='2026-08-05','Six calendar months was not preserved as calendar months');

const wrongSix={...sixMonths,churnPeriodValue:180,churnPeriodUnit:'days'};
assert(!G.validate(wrongSix).ok,'180 days incorrectly matched a 6-month T&C restriction');

const closeRule={
  churnable:true,churnability:'repeatable',churnPeriodValue:24,churnPeriodUnit:'months',sourceEligibilityBasis:'account-closed',closed:'2026-04-10',
  eligibilityEvidenceText:'Not available if you closed a checking account with us within the previous 24 months.',
  eligibilityEvidenceSource:'official-promotion-terms'
};
assert(G.validate(closeRule).ok&&G.safeEligibilityDate(closeRule,addD,addM)==='2028-04-15','Closed-date 24-month rule failed');


const multiRule={
  churnable:true,churnability:'repeatable',
  bonusRecd:'2026-06-01',closed:'2027-08-01',
  eligibilityRules:[
    {id:'bonus-24m',basis:'bonus-received',periodValue:24,periodUnit:'months',scope:'consumer-checking',evidenceText:'Not eligible if you received a consumer checking bonus within the past 24 months.',evidenceSource:'official-promotion-terms'},
    {id:'closed-12m',basis:'account-closed',periodValue:12,periodUnit:'months',scope:'consumer-checking',evidenceText:'Not eligible if you closed a consumer checking account within the past 12 months.',evidenceSource:'official-promotion-terms'}
  ]
};
v=G.validate(multiRule);
assert(v.ok&&v.rules.length===2,'Multiple eligibility restrictions did not verify');
assert(G.officialEligibilityDate(multiRule,addD,addM)==='2028-08-01','Latest actual eligibility date was not selected');
assert(G.controllingRule(multiRule,addD,addM)?.id==='closed-12m','Shorter close-based rule should control because it ends later');
assert(G.safeEligibilityDate(multiRule,addD,addM)==='2028-08-06','Multi-rule safe eligibility date is wrong');
const multiStamped=G.stamp(multiRule);
assert(multiStamped.eligibilityRules.length===2&&multiStamped.churnBasis==='multiple','Stamped multi-rule entry did not preserve every restriction');

const missingClose={...multiRule,closed:''};
assert(G.officialEligibilityDate(missingClose,addD,addM)==='','Tracker produced a final eligibility date while one rule anchor was still missing');


const usBankFinePrint='To be eligible, you or any owner(s) on your new Bank Smartly Checking account cannot have an existing U.S. Bank consumer checking account, had a U.S. Bank consumer checking account in the last 12 months or received other U.S. Bank consumer checking bonus offers within the past 12 months.';
const usBankRules={
  churnable:true,churnability:'repeatable',opened:'2026-05-10',closed:'2026-08-01',tcSourceRaw:usBankFinePrint,
  eligibilityRules:[
    {id:'ownership-12m',basis:'account-ownership-ended',periodValue:12,periodUnit:'months',scope:'us-bank-consumer-checking',evidenceText:usBankFinePrint,evidenceSource:'official-promotion-terms'},
    {id:'offer-12m',basis:'bonus-offer-received',periodValue:12,periodUnit:'months',anchorDate:'2026-05-01',scope:'us-bank-consumer-checking',evidenceText:usBankFinePrint,evidenceSource:'official-promotion-terms'}
  ]
};
v=G.validate(usBankRules);
assert(v.ok&&v.rules.length===2,'U.S. Bank-style ownership/bonus-offer rules did not verify separately');
assert(v.rules.some(r=>r.basis==='account-ownership-ended')&&v.rules.some(r=>r.basis==='bonus-offer-received'),'U.S. Bank semantic anchors were collapsed');
assert(G.officialEligibilityDate(usBankRules,addD,addM)==='2027-08-01','Later account-ownership clearing date did not control equal 12-month rules');
assert(G.safeEligibilityDate(usBankRules,addD,addM)==='2027-08-06','U.S. Bank-style safe date is wrong');

const wrongUsBankBasis={...usBankRules,eligibilityRules:[
  usBankRules.eligibilityRules[0],
  {...usBankRules.eligibilityRules[1],basis:'bonus-received'}
]};
assert(!G.validate(wrongUsBankBasis).ok,'Phrase "received bonus offers" was incorrectly accepted as bonus payout received');

const discoveredUsBank=G.discoverTimedRestrictions(usBankFinePrint);
assert(discoveredUsBank.some(r=>r.basis==='account-ownership-ended')&&discoveredUsBank.some(r=>r.basis==='bonus-offer-received'),'T&C discovery missed U.S. Bank ownership or bonus-offer restriction');
assert(!discoveredUsBank.some(r=>r.basis==='bonus-received'),'T&C discovery mislabeled a bonus offer as a bonus payout');


const chaseFinePrint='Checking offer is not available to existing Chase checking customers. Savings offer is not available to existing Chase savings customers. Both offers are not available to those whose accounts have been closed within 90 days or closed with a negative balance within the last 3 years. You can receive only one new checking and one new savings account opening related bonus every two years from the last coupon enrollment date and only one bonus per account. Coupon is good for one-time use.';
const chaseRules={
  churnable:true,churnability:'repeatable',opened:'2026-05-01',closed:'2026-08-01',closedWithNegativeBalance:false,tcSourceRaw:chaseFinePrint,
  eligibilityRules:[
    {id:'closed-90d',basis:'account-closed',periodValue:90,periodUnit:'days',scope:'chase-checking',evidenceText:chaseFinePrint,evidenceSource:'official-promotion-terms'},
    {id:'negative-close-3y',basis:'account-closed',periodValue:3,periodUnit:'years',scope:'chase-checking',condition:{type:'closed-with-negative-balance',expected:true},evidenceText:chaseFinePrint,evidenceSource:'official-promotion-terms'},
    {id:'coupon-2y',basis:'offer-enrollment',periodValue:2,periodUnit:'years',scope:'chase-checking',anchorFallback:'account-opened',evidenceText:chaseFinePrint,evidenceSource:'official-promotion-terms'}
  ]
};
v=G.validate(chaseRules);
assert(v.ok&&v.rules.length===3,'Chase-style conditional/enrollment rules did not verify');
assert(G.officialEligibilityDate(chaseRules,addD,addM)==='2028-05-01','Coupon enrollment fallback to opening date did not control normal Chase churn');
assert(G.safeEligibilityDate(chaseRules,addD,addM)==='2028-05-06','Chase normal safe churn date is wrong');
assert(G.controllingRule(chaseRules,addD,addM)?.id==='coupon-2y','Coupon enrollment rule should control a normal Chase closure');

const chaseNegative={...chaseRules,closedWithNegativeBalance:true};
assert(G.officialEligibilityDate(chaseNegative,addD,addM)==='2029-08-01','Conditional 3-year negative-balance rule did not activate');
assert(G.safeEligibilityDate(chaseNegative,addD,addM)==='2029-08-06','Negative-balance safe churn date is wrong');
assert(G.controllingRule(chaseNegative,addD,addM)?.id==='negative-close-3y','Negative-balance conditional rule should control when applicable');

const chaseUnknown={...chaseRules};delete chaseUnknown.closedWithNegativeBalance;
assert(G.officialEligibilityDate(chaseUnknown,addD,addM)==='','Tracker guessed a final date before the negative-balance condition was answered');

const chaseDiscovered=G.discoverTimedRestrictions(chaseFinePrint);
assert(chaseDiscovered.some(r=>r.basis==='offer-enrollment'&&r.period.value===2&&r.period.unit==='years'),'Coupon enrollment cooldown was not discovered');
assert(chaseDiscovered.some(r=>r.basis==='account-closed'&&r.period.value===90&&r.period.unit==='days'&&!r.condition),'Normal 90-day close rule was not discovered');
assert(chaseDiscovered.some(r=>r.basis==='account-closed'&&r.period.value===3&&r.period.unit==='years'&&r.condition?.type==='closed-with-negative-balance'),'Conditional 3-year negative-balance rule was not discovered');

const chaseMissingCondition={...chaseRules,eligibilityRules:chaseRules.eligibilityRules.map(r=>r.id==='negative-close-3y'?({...r,condition:null}):r)};
assert(!G.validate(chaseMissingCondition).ok,'Conditional Chase rule passed after its negative-balance condition was removed');

const noEvidence={churnable:true,churnability:'repeatable',churn:'1',sourceEligibilityBasis:'bonus-received'};
assert(!G.validate(noEvidence).ok,'Manual dropdown values passed without T&C evidence');

const lifetime={
  churnable:false,churnability:'not-repeatable',
  eligibilityEvidenceText:'This bonus is available once per lifetime and is not repeatable.',
  eligibilityEvidenceSource:'official-promotion-terms'
};
assert(G.validate(lifetime).ok,'Explicit non-repeatable wording did not verify');

const currentCustomer={
  ...bonusRule,closed:'',
  eligibilityEvidenceText:'New checking customers only. Not eligible if you received a checking bonus within the past 12 months.'
};
v=G.validate(currentCustomer);
assert(v.ok&&v.mustCloseBeforeReapply,'Current-customer exclusion was not captured');
const stamped=G.stamp(currentCustomer);
assert(stamped.currentCustomerEvidenceText&&stamped.reapplicationAction==='close-before-reapply','Current-customer evidence/action was not persisted');
assert(G.validate(stamped).mustCloseBeforeReapply,'Stamped entry forgot the current-customer closure requirement');
assert(G.applicationReadyDate(currentCustomer,addD,addM)==='','Application-ready date was shown while a required account closure is missing');
assert(G.applicationReadyDate({...currentCustomer,closed:'2027-08-15'},addD,addM)==='2027-09-06','Early account close incorrectly moved the cooldown date');
assert(G.applicationReadyDate({...currentCustomer,closed:'2027-09-10'},addD,addM)==='2027-09-10','Later required account close was not respected');

console.log('Eligibility evidence gate passed: single/multi-rule wording, U.S. Bank semantics, Chase conditional/enrollment rules, latest-date control, exact units, and safe dates verified');
