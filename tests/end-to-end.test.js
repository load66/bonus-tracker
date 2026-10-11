'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {sandbox,storage,errors}=require('./full-app-smoke.test.js');
const run=code=>vm.runInContext(code,sandbox);

setTimeout(()=>{
  try{
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
    run("openReqMet(testId);reqPrompt.date='2026-04-01';reqSubmit();cfm=null");
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
    run('if(undoTimer)clearTimeout(undoTimer);undoState=null;R()');
    assert.equal(errors.length,0,'Integrated flow emitted a runtime error');
    console.log('End-to-end integration passed: installed editor, JSON review/save, edit/escaping, requirements, payout, timers, closure, exact eligibility, tax years, and full backup restore');
  }catch(err){console.error(err);process.exitCode=1}
},150);
