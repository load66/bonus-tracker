'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {sandbox:s,storage}=require('./full-app-smoke.test.js');
const run=code=>vm.runInContext(code,s);
run('openAdd()');
const afterOpen=JSON.stringify([...storage]);
assert.ok(!run('collectModalEntryData()'),'Blank bank cannot produce a savable record');
assert.match(run('modalValidationErrors.bank'),/Enter the bank/);
assert.equal(JSON.stringify([...storage]),afterOpen,'Inline validation is read-only');
run('modal.bank="Synthetic Validation Bank"');
assert.equal(run('saveEntry()'),false,'Unverified churn/terms cannot be saved by modal');
assert.equal(JSON.stringify([...storage]),afterOpen,'Failed eligibility validation must not write records');
assert.ok(run('Object.keys(modalValidationErrors).length')>0,'Failure stays visible for correction');
run('closeModal()');
assert.equal(run('Object.keys(modalValidationErrors).length'),0,'A dismissed form clears only its UI errors');
run('openAdd()');
const originalSave=run('saveEntry');
run('window.__testSaveCalls=0;saveEntry=function(){window.__testSaveCalls++;return false}');
const fakeButton={disabled:false,innerHTML:'Add Entry',textContent:'Add Entry',setAttribute(){},removeAttribute(){}};
s.document.body.contains=()=>false;
assert.equal(s.saveEntryFromButton(fakeButton,{preventDefault(){},stopPropagation(){}}),false);
assert.equal(s.saveEntryFromButton(fakeButton,{preventDefault(){},stopPropagation(){}}),false);
(async()=>{
 await new Promise(resolve=>setTimeout(resolve,25));
 assert.equal(s.__testSaveCalls,1,'Repeated click must not start two saves');
 s.saveEntry=originalSave;
 run('closeModal()');
 const oldId=s.document.getElementById;
 const input={id:'az_input',value:'short',parentElement:null,setAttribute(){},removeAttribute(){},focus(){},closest(){return null}};
 s.document.getElementById=id=>id==='az_input'?input:oldId(id);
 const before=JSON.stringify([...storage]);
 assert.equal(s.runMainAnalyze(),false,'Incomplete terms must not open the analyzer');
 assert.match(run('termsReviewError'),/complete promotion terms/);
 assert.equal(JSON.stringify([...storage]),before,'Invalid terms cannot persist anything');
 input.value='Full terms are being entered; no review has been requested.';
 run('onFormInput({target:document.getElementById("az_input")})');
 assert.equal(run('termsReviewError'),'','Editing clears the previous invalid state');
 assert.equal(run('analyzerResult'),null);
 assert.equal(JSON.stringify([...storage]),before);
 // Requirement confirmation is an actual historical date, not a reminder.
 // Invalid dates must not write the tracker or dismiss the on-screen prompt.
 const trackerBeforeReq=JSON.stringify([...storage]);
 run("reqPrompt={entryId:'NO-SUCH-ENTRY',bank:'Synthetic Date Bank',date:'2099-01-01',hasExisting:false};reqSubmit()");
 assert.equal(run('reqPrompt.date'),'2099-01-01','Future date draft must remain available to correct');
 assert.match(run('reqPrompt.error'),/future/i,'Future completion must show actionable inline guidance');
 assert.match(s.rReqMet(),/id="req-date-error"/,'Date error must be visible inside the requirement dialog');
 assert.equal(JSON.stringify([...storage]),trackerBeforeReq,'Future requirement date changed persisted tracker state');
 run("reqPrompt={entryId:'NO-SUCH-ENTRY',bank:'Synthetic Date Bank',date:'2026-02-31',hasExisting:false};reqSubmit()");
 assert.equal(run('reqPrompt.date'),'2026-02-31','Impossible calendar date draft must remain');
 assert.match(run('reqPrompt.error'),/valid calendar date/i);
 assert.equal(JSON.stringify([...storage]),trackerBeforeReq,'Impossible calendar date changed persisted tracker state');
 run("reqPrompt={entryId:'NO-SUCH-ENTRY',bank:'Synthetic Date Bank',date:'',hasExisting:false};reqSubmit()");
 assert.match(run('reqPrompt.error'),/actual date/i,'Blank completion date needs inline guidance');
 assert.equal(JSON.stringify([...storage]),trackerBeforeReq,'Blank requirement date changed persisted tracker state');
 run('reqPrompt=null');

 // Automation may populate the unsaved editor, but cannot change closure policy or
 // persist original terms until the user explicitly saves the account.
 const originalAnalyze=s.tcV3Analyze,originalSourceWrite=s.tcV3SaveSourceForCurrentEntry;
 const originalGetElement=s.document.getElementById,originalQueryAll=s.document.querySelectorAll;
 const syntheticRaw='Synthetic bank bonus promotion requires payroll deposits within 90 days; exact closure terms are unconfirmed.';
 let prematureSourceWrites=0;
 s.tcV3Analyze=()=>({
   raw:syntheticRaw,bank:'Synthetic Automation Bank',accountType:'business',
   bonus:350,closeRestrictionType:'payout-only',closeRuleText:'Keep account open until the bonus posts.',sourceKind:'pasted text',
   sourceSnippets:[{field:'Bank',kind:'extracted',confidence:'high',source:'Synthetic Automation Bank checking promotion'}],
   suggestedTimers:[]
 });
 s.tcV3SaveSourceForCurrentEntry=()=>{prematureSourceWrites++;return true};
 const reviewTextarea={value:syntheticRaw};
 const applyButton={disabled:false},timerButton={disabled:false},reviewStatus={textContent:''};
 const activeReview={__tcReviewedRaw:syntheticRaw,remove(){},
   querySelector:selector=>selector==='#tc_apply_btn'?applyButton:selector==='#tc_timer_btn'?timerButton:selector==='#az_apply_status'?reviewStatus:null,
   querySelectorAll:selector=>selector==='[data-tcf-field]:checked'?
   [{getAttribute:key=>key==='data-tcf-field'?'bank':null}]:[]};
 s.document.getElementById=id=>id==='tca_overlay'?activeReview:
   id==='tca_raw'?reviewTextarea:
   id==='az_opened_today'?{checked:false}:originalGetElement(id);
 // Underlying pages may contain selected stale fields; the live dialog must win.
 s.document.querySelectorAll=selector=>selector==='[data-tcf-field]:checked'?
   [{getAttribute:key=>key==='data-tcf-field'?'closeText':null}]:
   selector==='[data-tcf-timer]:checked'?[]:originalQueryAll(selector);
 run("modal={bank:'Original Bank',accountType:'business',bonus:999,opened:'2026-01-01',closeRestrictionType:'minimum-open',closeRuleBasis:'opened',minHoldDays:180,earlyCloseFee:25,tcSourceRaw:'Original enrolled terms',customTimers:[]};showAnalyzer=true");
 const beforeAutomation=JSON.stringify([...storage]);
 s.tcApplyReviewed();
 assert.equal(run('modal.bank'),'Synthetic Automation Bank','Approved source-backed identity should transfer to draft');
 assert.equal(run('modal.closeRestrictionType'),'minimum-open','Unselected closure policy was overwritten');
 assert.equal(run('modal.minHoldDays'),180,'Unselected hold period was overwritten');
 assert.equal(run('modal.earlyCloseFee'),25,'Unselected fee was overwritten');
 assert.equal(run('modal.tcSourceRaw'),syntheticRaw,'Reviewed terms must be attached to draft for final save');
 assert.equal(prematureSourceWrites,0,'Applying fields wrote terms to persistent source store before account save');
 assert.equal(JSON.stringify([...storage]),beforeAutomation,'Applying draft fields changed persisted data');
 // A discarded editor must not be reused through the global window mirror.
 run('closeModal()');
 assert.equal(run('modal'),null,'Discarded editor must be cleared from the active model');
 s.tcApplyReviewed();
 assert.equal(run('modal.earlyCloseFee'),null,'Reopened automated draft inherited an old early-close fee');
 assert.equal(run('modal.closeRestrictionType'),'manual-review','Reopened automated draft inherited an old closure policy');
 assert.equal(JSON.stringify([...storage]),beforeAutomation,'New automated draft persisted records before Save');
 // Stale checkboxes cannot silently approve revised promotion terms.
 reviewTextarea.value=syntheticRaw+' This revised promotion has changed requirements.';
 s.tcV3ReviewInputChanged();
 assert.equal(applyButton.disabled,true,'Modified terms should disable Apply');
 assert.equal(timerButton.disabled,true,'Modified terms should disable timer apply');
 assert.match(reviewStatus.textContent,/Analyze terms again/i,'Edited source should give clear next action');
 assert.equal(s.tcApplyReviewed(),false,'Stale source approval must reject instead of staging a draft');
 assert.equal(s.tcCreateSelectedTimers(),false,'Stale timer proposal must reject');
 assert.equal(JSON.stringify([...storage]),beforeAutomation,'Stale analysis attempt changed stored records');
 s.tcRunPro();
 assert.equal(activeReview.__tcReviewedRaw,reviewTextarea.value,'Reanalysis must update approved source snapshot');
 assert.equal(applyButton.disabled,false,'Reanalysis should restore Apply');
 assert.equal(timerButton.disabled,false,'Reanalysis should restore timer action');
 s.tcV3Analyze=originalAnalyze;s.tcV3SaveSourceForCurrentEntry=originalSourceWrite;
 s.document.getElementById=originalGetElement;s.document.querySelectorAll=originalQueryAll;
 run('closeModal()');
 console.log('Form reliability: inline errors, draft retention, no invalid writes, single-submit guard, terms recovery PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
