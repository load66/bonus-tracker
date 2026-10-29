'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {fixture}=require('./fixtures/financial-rules.cjs');
const {sandbox,storage}=require('./full-app-smoke.test.js');
const check=require('../scripts/validate-arrival.cjs');
const cases=[
 {text:'Bonus is paid between the 90th and 120th calendar day after account opening.',window:{basis:'opened',unit:'calendar-days',min:90,max:120},start:'2026-04-01',end:'2026-05-01'},
 {text:'Each bonus pays within 60 days after its requirements are met.',window:{basis:'reqmet',unit:'calendar-days',min:0,max:60},start:'2026-01-10',end:'2026-03-11'},
 {text:'Bonus is paid within 30 days after offer enrollment.',window:{basis:'enrollment',unit:'calendar-days',min:0,max:30},start:'2026-01-05',end:'2026-02-04'},
 {text:'Bonus is paid within 1 calendar month after account opening.',window:{basis:'opened',unit:'calendar-months',min:0,max:1},start:'2026-01-01',end:'2026-02-01'},
 {text:'Bonus is paid within 30 days after the qualifying period ends.',window:{basis:'qualifying-period-end',unit:'calendar-days',min:0,max:30},start:'2026-01-31',end:'2026-03-02'}
];
function entry(c,version,bank,accountType){
 const e=fixture();Object.assign(e,{bank,accountType,opened:'2026-01-01',reqMet:'2026-01-10',offerEnrollmentDate:'2026-01-05',couponEnrollmentDate:'2026-01-05',payoutTimingText:c.text});
 e.tcSourceRaw+=' '+c.text;e.financialRules.version=version;
 if(c.window?.basis==='qualifying-period-end'){
  const r=e.financialRules.requirements[0],quote=r.evidence.quote;
  r.evidence.quote+=' Complete within 30 calendar days after account opening.';
  e.tcSourceRaw=e.tcSourceRaw.replace(quote,r.evidence.quote);
  r.timing={basis:'opened',unit:'calendar-days',value:30};
 }
 e.financialRules.payout={text:c.text,evidence:{source:'promotion',quote:c.text},...(version===3?{window:c.window}:{})};return e;
}
function envelope(e){return {kind:'BonusTrackerEntry',schemaVersion:3,verification:{promoSourceUrl:e.promoSourceUrl,feeScheduleSourceUrl:e.feeScheduleSourceUrl,termsVerifiedAt:e.termsVerifiedAt},entry:e};}
const before=JSON.stringify([...storage]);let count=0;
// Every identity, audience and supported historical version uses the same engine.
for(const c of cases)for(const bank of ['Synthetic Bank A','Synthetic Credit Union B','Future Institution C'])for(const accountType of ['personal','business'])for(const version of [1,2,3]){
 const original=entry(c,version,bank,accountType),snapshot=JSON.stringify(original);
 assert.equal(sandbox.BTFinancialRules.validate(original).ok,true);
 const legacy={...original,schemaVersion:1};delete legacy.financialRules;
 assert.equal(sandbox.BTFinancialRules.estimatedArrival(legacy)?.end,c.window.basis==='qualifying-period-end'?undefined:c.end);
 sandbox.btStageEntryPayload(envelope(original));const reviewed=sandbox.collectModalEntryData();
 const receipt=check(sandbox,original,reviewed,sandbox.BTBonusAI.contextFor(reviewed));
 assert.equal(receipt.range.start,c.start);assert.equal(receipt.range.end,c.end);
 assert.equal(JSON.stringify(original),snapshot,'Validation never modifies the original record');
 for(const field of ['bonusRecd','closed']){
  const finished={...reviewed,[field]:'2026-02-01'};
  assert.equal(check(sandbox,finished,finished,sandbox.BTBonusAI.contextFor(finished)).range,null);
 }
 count++;
}
assert.equal(JSON.stringify([...storage]),before,'Review/validation never writes tracker storage');
const e=entry(cases[1],3,'Synthetic Bank A','personal'),facts=sandbox.BTBonusAI.contextFor(e);
assert.throws(()=>check(sandbox,e,{...e,reqMet:'2026-01-11'},facts),/projection changed/);
assert.throws(()=>check(sandbox,e,e,facts.filter(f=>f.id!=='arrival')),/AI arrival/);
assert.throws(()=>check(sandbox,e,e,facts.map(f=>f.id==='arrival'?{...f,text:'Stale range'}:f)),/AI arrival/);
assert.throws(()=>check({...sandbox,BT360:{detailPanels:()=>''}},e,e,facts),/detail omitted/);
for(const text of ['Bonus paid after review.','Within 30 business days after account opening.','Within 2 statement cycles after account opening.','Within 60 days after requirements are met or after account opening.','Within 30 days after account opening and within 60 days after requirements are met.']){
 const unknown=entry({text},2,'Future Institution C','business');
 assert.equal(check(sandbox,unknown,unknown,sandbox.BTBonusAI.contextFor(unknown)).range,null,'Unsupported clocks never inherit another bank estimate');
}
const noDate={...e,reqMet:''};assert.equal(check(sandbox,noDate,noDate,sandbox.BTBonusAI.contextFor(noDate)).range,null);
// Run the mandatory generator command and inspect its real receipt.
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bt-arrival-validator-'));
try{
 const file=path.join(dir,'synthetic-entry.json');fs.writeFileSync(file,JSON.stringify(envelope(e)));
 const run=spawnSync(process.execPath,['scripts/validate-entry.cjs',file],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:30000});
 assert.equal(run.status,0,run.stderr);
 const receipt=JSON.parse(run.stdout.slice(run.stdout.lastIndexOf('{\n  "ok": true')));
 assert.equal(receipt.arrival.range.end,'2026-03-11');assert.equal(receipt.arrival.aiContext,true);assert.equal(receipt.arrival.detailView,true);
}finally{fs.rmSync(dir,{recursive:true,force:true});}
console.log('Cross-bank arrival: '+count+' identity/scope/version import journeys, legacy compatibility, generator receipt, mismatch rejection and no writes passed');
