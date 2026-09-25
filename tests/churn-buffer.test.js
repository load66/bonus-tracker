'use strict';
const fs=require('fs');
const vm=require('vm');
const G=require('../eligibility-gate.js');

function assert(ok,msg){if(!ok)throw new Error(msg)}
function parts(date){const m=String(date||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?{y:+m[1],mo:+m[2],d:+m[3]}:null}
function addD(date,days){const p=parts(date);if(!p)return'';const d=new Date(Date.UTC(p.y,p.mo-1,p.d));d.setUTCDate(d.getUTCDate()+Number(days||0));return d.toISOString().slice(0,10)}
function addM(date,months){const p=parts(date);if(!p)return'';const total=p.y*12+(p.mo-1)+Number(months||0),y=Math.floor(total/12),mo=((total%12)+12)%12,last=new Date(Date.UTC(y,mo+1,0)).getUTCDate();return `${y}-${String(mo+1).padStart(2,'0')}-${String(Math.min(p.d,last)).padStart(2,'0')}`}
function dB(a,b){const x=parts(a),y=parts(b);return Math.round((Date.UTC(y.y,y.mo-1,y.d)-Date.UTC(x.y,x.mo-1,x.d))/864e5)}
const evidence='Not eligible if you received a Wells Fargo consumer checking bonus within the past 12 months.';

const saved=[];
const sandbox={
  console,Date,Math,JSON,parseInt,
  addD,addM,dB,td:()=> '2026-08-18',BTEligibilityGate:G,
  setTimeout:()=>0,
  churnDecisionForEntry:e=>e?.churnable===false||e?.churnability==='not-repeatable'?'nonrepeatable':(e?.churnable===true||e?.churnability==='repeatable'||e?.churn||e?.churnPeriodValue?'repeatable':''),
  entries:[
    {id:'WFB-P-01',bank:'Wells Fargo',bonusRecd:'2026-08-14',closed:'2026-08-18',churn:'1',churnPeriodValue:12,churnPeriodUnit:'months',churnable:true,churnability:'repeatable',churnBasis:'bonus',sourceEligibilityBasis:'bonus-received',eligibilityEvidenceText:evidence,eligibilityEvidenceSource:'official-promotion-terms'},
    {id:'ARCH-01',bank:'FourLeaf',closed:'2026-08-18',churnable:false,churnability:'not-repeatable',churnBufferDays:99,eligibilityEvidenceText:'This bonus is available once per lifetime and is not repeatable.',eligibilityEvidenceSource:'official-promotion-terms'}
  ],
  SK:'bt_e_v4',sv:(k,v)=>saved.push([k,JSON.parse(JSON.stringify(v))])
};
sandbox.window=sandbox;sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('churn-close-policy.js','utf8'),sandbox,{filename:'churn-close-policy.js'});

const verified={bonusRecd:'2026-08-14',closed:'2026-08-18',churn:'1',churnPeriodValue:12,churnPeriodUnit:'months',churnable:true,churnability:'repeatable',sourceEligibilityBasis:'bonus-received',eligibilityEvidenceText:evidence,eligibilityEvidenceSource:'official-promotion-terms'};
assert(sandbox.btChurnSafetyBufferDays===5,'Global churn safety buffer is not 5 days');
assert(sandbox.churnBufferDaysFor(verified)===5,'Verified repeatable bank did not receive 5-day buffer');
assert(sandbox.churnBufferDaysFor({churnable:true,churnability:'repeatable',churn:'1',sourceEligibilityBasis:'bonus-received'})===0,'Unverified T&C rule incorrectly received a buffer');
assert(sandbox.churnBufferDaysFor({churnable:false,churnability:'not-repeatable'})===0,'Unverified non-repeatable offer incorrectly received churn buffer');

assert(sandbox.btOfficialEligibilityDate(verified)==='2027-08-14','Official eligibility date is not the exact source date + cooldown');
assert(sandbox.nextReopen(verified)==='2027-08-19','Bonus-received rule is not source date + 12 months + 5 days');

const opened={opened:'2026-01-31',churnPeriodValue:12,churnPeriodUnit:'months',churnable:true,churnability:'repeatable',sourceEligibilityBasis:'account-opened',eligibilityEvidenceText:'Not eligible if you opened a checking account within the past 12 months.',eligibilityEvidenceSource:'official-promotion-terms'};
assert(sandbox.nextReopen(opened)==='2027-02-05','Opened-date rule did not preserve calendar-month end + 5 days');

const closed={closed:'2026-03-05',churnPeriodValue:24,churnPeriodUnit:'months',churnable:true,churnability:'repeatable',sourceEligibilityBasis:'account-closed',eligibilityEvidenceText:'Not available if you closed a checking account within the previous 24 months.',eligibilityEvidenceSource:'official-promotion-terms'};
assert(sandbox.nextReopen(closed)==='2028-03-10','Closed-date source rule did not receive 5 safety days');

const sixMonths={opened:'2026-01-31',churnPeriodValue:6,churnPeriodUnit:'months',churnable:true,churnability:'repeatable',sourceEligibilityBasis:'account-opened',eligibilityEvidenceText:'Not eligible if you opened a checking account within the past 6 months.',eligibilityEvidenceSource:'official-promotion-terms'};
assert(sandbox.nextReopen(sixMonths)==='2026-08-05','Six calendar months was incorrectly treated as a day count');

assert(sandbox.nextReopen({bonusRecd:'2026-08-14',churn:'1',churnable:true,churnability:'repeatable',sourceEligibilityBasis:'bonus-received'})==='','Countdown was created without T&C evidence');
assert(sandbox.nextReopen({...sixMonths,churnPeriodValue:180,churnPeriodUnit:'days'})==='','Mismatched 180-day period passed a 6-month T&C rule');

const current={...verified,closed:'',eligibilityEvidenceText:'New checking customers only. '+evidence};
assert(sandbox.btApplicationReadyDate(current)==='','Application-ready date exists even though current-customer terms require closure');
assert(sandbox.btApplicationReadyDate({...current,closed:'2027-08-10'})==='2027-08-19','Required early closure incorrectly moved the safe eligibility date');
assert(sandbox.btApplicationReadyDate({...current,closed:'2027-08-25'})==='2027-08-25','Later required closure was not respected');

assert(sandbox.entries[0].churnBasis==='bonus'&&sandbox.entries[0].sourceEligibilityBasis==='bonus-received'&&sandbox.entries[0].churnBufferDays===5&&sandbox.entries[0].eligibilityVerified===true,'Existing source-backed entry was not normalized correctly');
assert(sandbox.entries[0].churnTrackingPolicy==='source-bonus-received-plus-5-day-buffer','Source tracking policy was not persisted');
assert(sandbox.entries[1].churnBufferDays===0,'Non-repeatable saved entry retained a churn buffer');
assert(/12 months after bonus received/.test(sandbox.btFutureEligibilityText(sandbox.entries[0]))&&/5-day safety buffer/.test(sandbox.btFutureEligibilityText(sandbox.entries[0])),'Future eligibility text does not disclose exact source basis + safety buffer');
assert(/T&C verification required/.test(sandbox.btFutureEligibilityText({churn:'1',churnable:true,churnability:'repeatable'})),'Missing T&C evidence is not surfaced for review');
assert(saved.length>0,'Existing-entry normalization was not persisted');

const workflow=fs.readFileSync('.github/workflows/close-rules.yml','utf8');
const index=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
assert(workflow.includes('node tests/churn-buffer.test.js'),'Pages deploy is not gated by the churn-buffer regression test');
assert(workflow.includes('node tests/eligibility-gate.test.js'),'Pages deploy is not gated by the eligibility evidence regression test');
assert(index.includes('./churn-close-policy.js?v=3.4.20-multirule1'),'Index does not force-refresh the evidence-gated churn policy');
assert(index.includes('./eligibility-gate.js?v=3.4.20'),'Index does not load the churn evidence validator');
assert(index.includes('./sw.js?v=3.4.20-multirule1'),'Index does not force-refresh the evidence-gated service worker');
assert(sw.includes("const V = 'bt-v3.4.20-multirule1'"),'Service worker cache version is stale');
assert(sw.includes("'./eligibility-gate.js'"),'Eligibility gate is missing from the offline cache');

console.log('Eligibility countdown passed: T&C evidence chooses the exact clock and unit, unverified rules fail closed, and the 5-day safety buffer is separate from official eligibility');
