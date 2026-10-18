'use strict';
const assert=require('node:assert/strict');
const {sandbox,storage}=require('./full-app-smoke.test.js');
const {fixture}=require('./fixtures/financial-rules.cjs');
const e=fixture(),payload={kind:'BonusTrackerEntry',schemaVersion:3,verification:{promoSourceUrl:e.promoSourceUrl,feeScheduleSourceUrl:e.feeScheduleSourceUrl,termsVerifiedAt:e.termsVerifiedAt},entry:e};
const before=JSON.stringify([...storage]);
const parsed=sandbox.btParseEntryFileText(JSON.stringify(payload),'Synthetic.json');
assert.equal(JSON.stringify(parsed.financialRules),JSON.stringify(e.financialRules));
assert.equal(JSON.stringify([...storage]),before,'Reading an import must not write account data');
sandbox.btStageEntryPayload(payload);
const projected=sandbox.collectModalEntryData();
assert.ok(projected);assert.equal(JSON.stringify(projected.financialRules),JSON.stringify(e.financialRules));assert.equal(projected.feeScheduleRaw,e.feeScheduleRaw);
assert.equal(sandbox.BTFinancialRules.validate(projected).ok,true);
assert.equal(projected.monthlyFeeChecked,false);assert.ok(!projected.reqMet&&!projected.bonusRecd,'Verified terms cannot mark actual account milestones');
const facts=sandbox.BTBonusAI.contextFor({...projected,monthlyFeeAmountText:'$999'});
assert.ok(facts.some(f=>f.id==='financialrules'&&f.text.includes('Share Savings')));
assert.ok(!facts.some(f=>f.id==='feeamount'),'Ambiguous legacy fees must not override structured product fees');
assert.ok(facts.length<=30&&JSON.stringify({question:'x'.repeat(500),facts}).length<=17500);
const ready={...projected,reqMet:'2026-04-01',bonusRecd:'2026-04-15',monthlyFeeChecked:true};
assert.equal(sandbox.closeReadiness(ready).cls,'safe');
const broken={...ready,financialRules:JSON.parse(JSON.stringify(ready.financialRules))};broken.financialRules.accounts[1].fee.amount=999;
assert.equal(sandbox.closeReadiness(broken).cls,'danger');assert.equal(sandbox.BTBonusAI.guidanceFor(broken,'Can I close?').verdict,'Needs verification');
const unsupported={...payload,entry:{...e,unexpectedAiFlag:true}};
assert.throws(()=>sandbox.btParseEntryFileText(JSON.stringify(unsupported),'Unexpected.json'),/unsupported entry fields/);
assert.throws(()=>sandbox.btParseEntryFileText(JSON.stringify({...payload,schemaVersion:4}),'Future.json'),/schema versions conflict|unsupported/);
const missing={...payload,entry:{...e,financialRules:null}};
assert.throws(()=>sandbox.btParseEntryFileText(JSON.stringify(missing),'Missing.json'),/requires/);
const invalid={...payload,entry:{...e,feeScheduleRaw:''}};
assert.throws(()=>sandbox.btParseEntryFileText(JSON.stringify(invalid),'NoSource.json'),/quotation/);
// Audit preservation: one enrolled cycle, its correction, and its exact
// historical financial rules must survive without altering the account entry.
const vmHistory=require('node:vm');
const historyEntry=JSON.parse(JSON.stringify(e));
historyEntry.id='SYNTHETIC-ARCHIVE-01';
historyEntry.bank='Synthetic History Credit Union';
historyEntry.opened='2026-08-15';
historyEntry.churn='1';historyEntry.churnBasis='bonus';
historyEntry.churnRuleText='Original enrolled text: prior bonus in past 12 months prevents eligibility.';
historyEntry.churnDecisionSource='saved-original-disclosure';
historyEntry.eligibilityRules.push({
 id:'closed-12m',basis:'account-closed',periodValue:12,periodUnit:'months',
 scope:'consumer-checking',evidenceText:'No new bonus if the checking account was closed within 12 months.',
 evidenceSource:'official-promotion-terms'
});
sandbox.__termTestRecord=historyEntry;
assert.equal(vmHistory.runInContext("saveTermsArchiveForNewCycle(__termTestRecord,'synthetic-import')",sandbox),true);
assert.equal(vmHistory.runInContext("saveTermsArchiveForNewCycle(__termTestRecord,'synthetic-import')",sandbox),false,'Identical terms should not append history');
const originalRules=JSON.stringify(historyEntry.financialRules);
const originalEligibility=JSON.stringify(historyEntry.eligibilityRules);
const changed=JSON.parse(JSON.stringify(historyEntry));
changed.feeScheduleRaw+=' Updated fee disclosure version: does not apply retroactively to the earlier archived text.';
changed.earlyTerminationFeeText='Updated fee disclosure — new terms under review.';
sandbox.__termTestRecord=changed;
assert.equal(vmHistory.runInContext("saveTermsArchiveForNewCycle(__termTestRecord,'synthetic-correction')",sandbox),true);
const historical=JSON.parse(storage.get('bt_tc_archive_v1'));
const historyBucket=Object.values(historical).find(b=>b.current?.entryId==='SYNTHETIC-ARCHIVE-01');
assert(historyBucket,'Archive must retain the enrolled bank cycle');
assert.equal(historyBucket.versions.length,1,'Fee revision must preserve previous terms');
assert.equal(historyBucket.versions[0].feeScheduleRaw,historyEntry.feeScheduleRaw);
assert.equal(historyBucket.versions[0].churn,'1');
assert.equal(historyBucket.versions[0].churnBasis,'bonus');
assert.equal(historyBucket.versions[0].churnRuleText,historyEntry.churnRuleText);
assert.equal(historyBucket.versions[0].churnDecisionSource,'saved-original-disclosure');
assert.equal(JSON.stringify(historyBucket.versions[0].financialRules),originalRules);
assert.equal(JSON.stringify(historyBucket.versions[0].eligibilityRules),originalEligibility);
assert.equal(historyBucket.current.eligibilityRules.length,2,'Distinct churn clocks survive revision');
assert.equal(historyBucket.versions[0].financialRules.accounts[1].fee.amount,10,'Required companion fee survives');
assert.match(sandbox.rTermsStorage(),/Previous T&amp;C cycles and revisions|Previous T&C cycles and revisions/);
assert.match(sandbox.rTermsStorage(),/Read original saved fee schedule/);
assert.match(sandbox.rTermsStorage(),/Read complete structured terms/);
delete sandbox.__termTestRecord;

console.log('Structured import passed: strict intake, full review projection, account-scoped AI context, unsupported-field rejection, no auto-completion and canonical close blocking');
const review=require('./fixtures/financial-rules.cjs').reviewFixture();const reviewPayload={kind:'BonusTrackerEntry',schemaVersion:3,verification:{promoSourceUrl:review.promoSourceUrl,feeScheduleSourceUrl:review.feeScheduleSourceUrl,termsVerifiedAt:review.termsVerifiedAt},entry:review};
sandbox.btStageEntryPayload(reviewPayload);const reviewed=sandbox.collectModalEntryData();
assert.equal(reviewed.financialRules.closure.earlyCloseFee,null);assert.equal(reviewed.closeRuleBasis,'manual');assert.equal(reviewed.closeRestrictionType,'manual-review');assert.equal(sandbox.BTFinancialRules.validate(reviewed).ok,true);
const afterPayout={...reviewed,reqMet:'2026-04-01',bonusRecd:'2026-04-15',monthlyFeeChecked:true};assert.equal(sandbox.closeReadiness(afterPayout).cls,'danger');assert(!sandbox.safeCloseDate(afterPayout),'Manual review cannot show a safe close date');assert(sandbox.BTBonusAI.contextFor(afterPayout).some(f=>f.id==='financialrules'&&/fee unconfirmed/.test(f.text)));
assert.throws(()=>sandbox.btParseEntryFileText(JSON.stringify({kind:'BonusTrackerResearchDraft',importable:false,bank:'Synthetic'}),'draft.json'),/review draft/);

(async()=>{
 sandbox.atob=atob;
 const original=JSON.stringify([...storage]);
 sandbox.btConfirmDialog=async()=>true;
 const result=await sandbox.btImportEntryFileObject({name:'Review-v3.json',text:async()=>JSON.stringify(reviewPayload)});
 assert.equal(result.status,'review');assert.equal(sandbox.collectModalEntryData().financialRules.version,2);
 const html='<a href="#btadd='+Buffer.from(JSON.stringify(reviewPayload)).toString('base64url')+'">Import</a>';
 assert.equal((await sandbox.btImportEntryFileObject({name:'Review-v3.html',text:async()=>html})).status,'review');
 sandbox.btConfirmDialog=async()=>false;
 const modalBefore=require('node:vm').runInContext('JSON.stringify(modal)',sandbox);
 assert.equal((await sandbox.btImportEntryFileObject({name:'cancel.json',text:async()=>JSON.stringify(reviewPayload)})).status,'cancelled');assert.equal(require('node:vm').runInContext('JSON.stringify(modal)',sandbox),modalBefore);
 sandbox.btConfirmDialog=async()=>true;
 await assert.rejects(sandbox.btImportEntryFileObject({name:'bad.json',text:async()=>JSON.stringify({...reviewPayload,entry:{...reviewPayload.entry,profile:{untrusted:true}}})}),/unsupported entry fields/);
 assert.equal(JSON.stringify([...storage]),original,'File confirmation wrote saved records');

 // Synthetic replacement identity probe: only the personal Chase cycle is eligible.
 const run=code=>require('node:vm').runInContext(code,sandbox);
 run(`entries=[{id:'CHA-P-01',bank:'Chase',accountType:'personal',opened:'2023-01-01',closed:'2025-01-01',bonusRecd:'2023-03-01',bonus:100,churn:'1',churnable:true,notes:'Old personal history',customTimers:[],checklist:[],history:[]},{id:'CHA-B-01',bank:'Chase Biz',accountType:'business',opened:'2023-01-01',closed:'2025-01-01',bonusRecd:'2023-03-01',bonus:500,churn:'1',churnable:true,notes:'Business unchanged',customTimers:[],checklist:[],history:[]},{id:'CIT-P-01',bank:'Citi',accountType:'personal',opened:'2023-01-01',closed:'2025-01-01',bonus:50,churn:'1',churnable:true,notes:'Other unchanged',customTimers:[],checklist:[],history:[]}];sv(SK,entries);`);
 const seeded=storage.get('bt_e_v4'),businessBefore=run(`JSON.stringify(entries.find(e=>e.id==='CHA-B-01'))`),otherBefore=run(`JSON.stringify(entries.find(e=>e.id==='CIT-P-01'))`);
 const chasePayload=JSON.parse(JSON.stringify(reviewPayload));chasePayload.entry.bank='Chase';
 await sandbox.btImportEntryFileObject({name:'Synthetic-Chase-v3.json',text:async()=>JSON.stringify(chasePayload)});
 assert.equal(storage.get('bt_e_v4'),seeded,'File review wrote old accounts');
 sandbox.saveEntry();
 assert.equal(run('replacementPickerPrompt.candidates.length'),1);assert.equal(run('replacementPickerPrompt.selectedId'),'CHA-P-01');assert.equal(storage.get('bt_e_v4'),seeded,'Opening replacement picker changed old accounts');
 sandbox.doReplacementPickerReplace();assert.equal(storage.get('bt_e_v4'),seeded,'Replacement preview changed old accounts');
 sandbox.doOverwrite();
 assert.equal(run(`BTFinancialRules.validate(entries.find(e=>e.id==='CHA-P-01')).ok`),true);
 assert.equal(run('entries.length'),3);assert.equal(run(`entries.find(e=>e.id==='CHA-P-01').financialRules.version`),2);assert.equal(run(`entries.find(e=>e.id==='CHA-P-01').closed`),'');assert.equal(run(`entries.find(e=>e.id==='CHA-P-01').previousCycles[0].closed`),'2025-01-01');assert.equal(run(`JSON.stringify(entries.find(e=>e.id==='CHA-B-01'))`),businessBefore);assert.equal(run(`JSON.stringify(entries.find(e=>e.id==='CIT-P-01'))`),otherBefore);
 console.log('Actual v3 file-import path passed: confirmation, runtime metadata, JSON/HTML, cancellation, strict untrusted fields, confirmed replacement, history retention and business-account isolation.');
})().catch(e=>{console.error(e);process.exitCode=1});
