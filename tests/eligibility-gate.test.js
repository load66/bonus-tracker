'use strict';
const G=require('../eligibility-gate.js');

function assert(ok,msg){if(!ok)throw new Error(msg)}
function parts(date){const m=String(date||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?{y:+m[1],mo:+m[2],d:+m[3]}:null}
function addD(date,days){const p=parts(date);if(!p)return'';const d=new Date(Date.UTC(p.y,p.mo-1,p.d));d.setUTCDate(d.getUTCDate()+Number(days||0));return d.toISOString().slice(0,10)}
function addM(date,months){const p=parts(date);if(!p)return'';const total=p.y*12+(p.mo-1)+Number(months||0),y=Math.floor(total/12),mo=((total%12)+12)%12,last=new Date(Date.UTC(y,mo+1,0)).getUTCDate();return `${y}-${String(mo+1).padStart(2,'0')}-${String(Math.min(p.d,last)).padStart(2,'0')}`}

assert(G.VERSION==='1.0.0','Unexpected eligibility gate version');

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

console.log('Eligibility evidence gate passed: source wording, exact units, anchor matching, non-repeatable proof, current-customer closure, and safe dates verified');
