'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {sandbox,document,storage,errors}=require('./full-app-smoke.test.js');
const run=code=>vm.runInContext(code,sandbox);

setTimeout(()=>{
  try{
    const toolbarHandler=document.eventListeners.find(x=>x.type==='click'&&x.capture===true&&String(x.fn).includes('buttonText(btn)'));
    assert.ok(toolbarHandler,'Toolbar delegation is installed');
    for(const text of ['Restore Backup','Restore Complete','Pre-restore safety copy']){
      let intercepted=false;
      toolbarHandler.fn({target:{closest:()=>({textContent:text})},preventDefault(){intercepted=true},stopImmediatePropagation(){intercepted=true}});
      assert.equal(intercepted,false,'Toolbar must not intercept '+text);
    }
    run('openAdd()');
    for(const editing of [false,true]){
      sandbox.editing=editing;
      run("modal._edit=editing;modal.bank='Verification Bank';modal.bonus=325;modal.accountType='business';modal.churn='1';modal.churnability='repeatable';modal.churnable=true");
      const form=run('rModal()');
      for(const field of ['bank','accountType','bonus']){
        assert.match(form,new RegExp("btModalSet\\('"+field+"',"),'Fully installed editor must retain '+field);
      }
      assert.match(form,/Can this bonus be earned again/);
      assert.equal((form.match(/Can this bonus be earned again/g)||[]).length,1);
      assert.match(form,/value="325"/);
      assert.match(form,/value="business" selected/);
    }
    run("modal._wizardStep=2;modal.requiredDaysText='90 calendar days'");
    assert.match(run('rModal()'),/type="text"[^>]*value="90 calendar days"[^>]*btModalSet\('requiredDaysText'/,'Editor must display exact deadline wording and units');
    run(`closeModal();entries=[];sv(SK,entries);`);
    const entry={bank:'Verification Bank',accountType:'personal',bonus:325,opened:'2026-01-31',
      churn:'1',churnable:true,churnability:'repeatable',churnBasis:'bonus',sourceEligibilityBasis:'bonus-received',
      churnPeriodValue:12,churnPeriodUnit:'months',eligibilityEvidenceText:'Not eligible if you received a checking bonus within the past 12 months.',
      eligibilityEvidenceSource:'official-promotion-terms',reqDays:90,requiredDaysText:'90 calendar days',
      dataPoint:'Employer DD',payoutTimingText:'Within 30 calendar days after requirements are met',
      notes:'Preserve this personal note',customTimers:[],closeRestrictionType:'payout-only',
      closeRuleText:'Keep the account open until the bonus posts.',monthlyFeeChecked:true};
    sandbox.payload={kind:'BonusTrackerEntry',entry};
    const staged=run("btStageEntryPayload(btParseEntryFileText(JSON.stringify(payload),'verification.json'),'entry-file','verification.json')");
    assert.equal(staged.status,'review');
    assert.equal(run('entries.length'),0,'Import review cannot create an account');
    assert.equal(run('modal.monthlyFeeChecked'),false,'Import requires a fresh fee review');
    assert.equal(run('saveEntry()'),true);
    assert.equal(run('entries.length'),1);
    const id=run('entries[0].id');assert.ok(id);
    sandbox.testId=id;
    assert.equal(run('reqDeadline(entries[0])'),'2026-05-01');
    assert.equal(JSON.parse(storage.get('bt_e_v4'))[0].notes,entry.notes);
    run("openEdit(testId);btModalSet('notes','Updated note with <tags> & quotes');saveEntry()");
    assert.equal(run('entries[0].id'),id);
    assert.equal(run('entries.length'),1,'Editing must not create a duplicate');
    run('expanded=testId');
    assert.match(run('rTracker(entries)'),/&lt;tags&gt;/,'Personal notes must be escaped');
    run('openReqMet(testId)');
    const reqInput=run('rReqMet()').match(/<input[^>]*id="req_date"[^>]*>/)[0];
    const reqHandler=reqInput.match(/oninput="([^"]+)"/)[1];
    run(`(function(){${reqHandler}}).call({value:'2026-04-01'});R()`);
    assert.match(run('rReqMet()'),/value="2026-04-01"/,'Redraw must retain the unsaved date draft');
    assert.equal(run('entries[0].reqMet'),'','Typing must not save a milestone');
    run('reqSubmit();cfm=null');
    assert.equal(run('entries[0].reqMet'),'2026-04-01');
    assert.equal(run('btLifecycleStageForEntry(entries[0]).code'),'AWAITING_BONUS');
    run("openRcv(testId);rcvPrompt.date='2026-04-15';rcvPrompt.reqDate='2026-04-01';rcvSubmit();cfm=null");
    assert.equal(run('entries[0].bonusRecd'),'2026-04-15');
    assert.match(run('buildTaxCSV(2026)'),/Verification Bank/,'Tax must include a received bonus on an open account');
    assert.doesNotMatch(run('buildTaxCSV(2025)'),/Verification Bank/);
    run("saveEntryTimer(testId,{text:'Manual reminder',startDate:'2026-03-08',daysRequired:1,date:'2026-03-09'});toggleCk(testId,0)");
    assert.equal(run('entries[0].customTimers.some(t=>t.text===\'Manual reminder\'&&t.date===\'2026-03-09\')'),true);
    run("startCloseFlow(testId);closePrompt.closeDate='2026-05-01';closePrompt.monthlyFeeChecked=true;closeNext();closeNext();closeNext()");
    assert.equal(run('closePrompt.step'),'review');
    run('finishClose();cfm=null');
    assert.equal(run('entries[0].closed'),'2026-05-01');
    assert.equal(run('btOfficialEligibilityDate(entries[0])'),'2027-04-15');
    assert.equal(run('nextReopen(entries[0])'),'2027-04-20');
    assert.equal(run('btLifecycleStageForEntry(entries[0]).code'),'COOLDOWN');
    run('undoClose()');
    assert.equal(run('entries[0].closed'),'','Undo must restore the pre-close account');
    assert.equal(run('entries[0].notes'),'Updated note with <tags> & quotes');
    assert.equal(run('entries[0].customTimers.some(t=>t.text===\'Manual reminder\')'),true);
    run("startCloseFlow(testId);closePrompt.closeDate='2026-05-01';closePrompt.monthlyFeeChecked=true;closeNext();closeNext();closeNext();finishClose();cfm=null");
    const backup=run('buildPortableBackupPayload()');
    sandbox.backup=JSON.parse(JSON.stringify(backup));
    const before=run('JSON.stringify(entries[0])');
    run("entries[0].notes='Changed after backup';sv(SK,entries)");
    run('applyPortableRestore(backup);cfm=null');
    const restored=JSON.parse(run('JSON.stringify(entries[0])'));
    for(const [key,value] of Object.entries(JSON.parse(before))){
      if(key==='profile')continue; // Derived profile timestamps refresh during normalization.
      assert.deepEqual(restored[key],value,'Backup restore must preserve saved '+key);
    }
    assert.equal(JSON.parse(storage.get('bt_e_v4'))[0].id,id);
    assert.ok(run('entries[0].history.some(x=>x.type===\'req_met\')'));
    assert.ok(run('entries[0].history.some(x=>x.type===\'bonus_received\')'));
    assert.ok(run('entries[0].history.some(x=>x.type===\'actual_close\')'));
    // Exercise the opposite eligibility branch through the real save/close path.
    sandbox.oneTime={kind:'BonusTrackerEntry',entry:{...entry,bank:'One Time Verification Bank',bonus:0,churn:'',churnable:false,churnability:'not-repeatable',churnBasis:'',sourceEligibilityBasis:'',churnPeriodValue:0,churnPeriodUnit:'',eligibilityEvidenceText:'This bonus is available once per lifetime.',customTimers:[]}};
    run("btStageEntryPayload(btParseEntryFileText(JSON.stringify(oneTime),'one-time.json'),'entry-file','one-time.json')");
    assert.equal(run('saveEntry()'),true);
    run("var oneTimeId=entries.find(e=>e.bank==='One Time Verification Bank').id;startCloseFlow(oneTimeId);closePrompt.closeDate=td();closeNext();closeNext();closeNext();finishClose();cfm=null");
    assert.equal(run("entries.find(e=>e.id===oneTimeId).archived"),true,'Non-repeatable account must archive');
    assert.equal(run("!!nextReopen(entries.find(e=>e.id===oneTimeId))"),false,'Non-repeatable account must not invent eligibility');
    assert.equal(run("entries.find(e=>e.id===testId).notes"),restored.notes,'Saving another account cannot change existing notes');
    run('if(undoTimer)clearTimeout(undoTimer);undoState=null;R()');
    assert.equal(errors.length,0,'Integrated flow emitted a runtime error');
    console.log('End-to-end integration passed: installed editor, JSON review/save, edit/escaping, requirements, payout, timers, closure, exact eligibility, tax years, and full backup restore');
  }catch(err){console.error(err);process.exitCode=1}
},150);
