'use strict';
const fs=require('fs');
const vm=require('vm');

class ElementStub{
  constructor(tag='div'){
    this.tagName=String(tag).toUpperCase();this.children=[];this.style={setProperty(){}};this.dataset={};this.attributes={};this.value='';this.checked=false;this.textContent='';this._html='';this.id='';this.scrollTop=0;this.tabIndex=0;
    const classes=new Set();
    this.classList={add:(...x)=>x.forEach(v=>classes.add(v)),remove:(...x)=>x.forEach(v=>classes.delete(v)),toggle:v=>classes.has(v)?(classes.delete(v),false):(classes.add(v),true),contains:v=>classes.has(v)};
  }
  set innerHTML(v){this._html=String(v)} get innerHTML(){return this._html}
  appendChild(x){this.children.push(x);return x} prepend(x){this.children.unshift(x);return x}
  remove(){} focus(){} blur(){} click(){} select(){} querySelector(){return null} querySelectorAll(){return []} closest(){return null} contains(){return false}
  setAttribute(k,v){this.attributes[k]=String(v)} getAttribute(k){return this.attributes[k]??null}
  addEventListener(){} removeEventListener(){}
}

const app=new ElementStub('div');app.id='app';
const document={
  head:new ElementStub('head'),body:new ElementStub('body'),documentElement:new ElementStub('html'),readyState:'complete',activeElement:null,
  createElement:t=>new ElementStub(t),createTextNode:t=>({textContent:String(t)}),getElementById:id=>id==='app'?app:null,
  querySelector:s=>s==='#app'||s==='.app'?app:null,querySelectorAll:()=>[],addEventListener(){},removeEventListener(){}
};
const storage=new Map();
const localStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k),clear:()=>storage.clear(),key:i=>[...storage.keys()][i]||null,get length(){return storage.size}};
const errors=[];
const testConsole={
  log:console.log,
  warn:(...a)=>{errors.push('WARN '+a.map(String).join(' '));console.warn(...a)},
  error:(...a)=>{errors.push('ERROR '+a.map(String).join(' '));console.error(...a)}
};
class MutationObserverStub{constructor(cb){this.cb=cb}observe(){}disconnect(){}}
const sandbox={
  console:testConsole,document,localStorage,sessionStorage:localStorage,innerHeight:844,
  navigator:{userAgent:'iPhone Safari BonusTracker CI',serviceWorker:{register:()=>Promise.resolve({update(){}}),getRegistration:()=>Promise.resolve(null),addEventListener(){},removeEventListener(){},controller:null},clipboard:{writeText:()=>Promise.resolve()}},
  location:{href:'https://example.test/index.html',origin:'https://example.test',reload(){}},history:{pushState(){},replaceState(){}},
  alert(){},confirm(){return true},prompt(){return''},requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout,
  setTimeout,clearTimeout,setInterval,clearInterval,Blob,URL,Date,Math,JSON,Map,Set,WeakMap,WeakSet,Array,Object,String,Number,Boolean,RegExp,Error,TypeError,Promise,Intl,parseInt,parseFloat,isNaN,
  crypto:require('crypto').webcrypto,matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),getComputedStyle:()=>({}),Event:class{},CustomEvent:class{},FileReader:class{readAsText(){this.result='';this.onload&&this.onload()}},HTMLElement:ElementStub,Node:ElementStub,MutationObserver:MutationObserverStub,
  visualViewport:{height:760,offsetTop:0,addEventListener(){},removeEventListener(){}},addEventListener(){},removeEventListener(){}
};
sandbox.window=sandbox;sandbox.globalThis=sandbox;sandbox.self=sandbox;
vm.createContext(sandbox);

const html=fs.readFileSync('index.html','utf8');
const scripts=[...html.matchAll(/<script[^>]+src="\.\/([^"?]+)(?:\?[^\"]*)?"/g)].map(m=>m[1]);
const loaded=[];
for(const file of scripts){
  vm.runInContext(fs.readFileSync(file,'utf8'),sandbox,{filename:file,timeout:8000});
  loaded.push(file);
}

function assert(ok,msg){if(!ok)throw new Error(msg)}

setTimeout(()=>{
  try{
    assert(loaded.length===scripts.length,'Not every index script loaded');
    assert(sandbox.BT_APP_VERSION==='3.4.13',`Unexpected app version ${sandbox.BT_APP_VERSION}`);
    assert(sandbox.btReleaseVersion==='3.4.13',`Unexpected mobile release version ${sandbox.btReleaseVersion}`);
    assert(sandbox.tcV3FourLeafRulesVersion==='3.4.13',`Unexpected FourLeaf rule version ${sandbox.tcV3FourLeafRulesVersion}`);
    assert(sandbox.tcV3WellsConsumerRulesVersion==='3.4.13',`Unexpected Wells consumer rule version ${sandbox.tcV3WellsConsumerRulesVersion}`);
    assert(sandbox.BTCloseRules?.VERSION==='3.4.13',`Unexpected close-rule core version ${sandbox.BTCloseRules?.VERSION}`);
    assert(app.innerHTML.length>1000,'Tracker did not render meaningful HTML');
    const report=sandbox.btRunFullRegressionTests();
    assert(report.ok,`Full regression failed: ${JSON.stringify(report)}`);
    assert(report.total>=17,`Full regression suite is incomplete: ${report.total}`);
    const wells='Wells Fargo business checking offer. To receive the $400 bonus, bonus offer code must be used when opening a new eligible business checking account by May 5, 2026. Eligible accounts include Initiate Business Checking, Navigate Business Checking or Optimize Business Checking. Deposit $2,500 or more by day 30 from account opening and maintain a minimum daily collected balance of $2,500 through day 60 after account opening. Bonus deposited within 30 days after the 60-day qualification period.';
    const wr=sandbox.tcV3Analyze(wells,{noGlobalFallback:true});
    assert(wr.bank==='Wells Fargo','Wells Fargo rule failed');
    assert(!(wr.bankRulesApplied||[]).includes('Chase Business Checking'),'Chase rule contaminated Wells Fargo analysis');
    sandbox.tcV3ClearChurnProfiles();
    const businessProfile=sandbox.tcV3Analyze(wells,{noGlobalFallback:true});
    sandbox.tcV3SaveChurnProfile(businessProfile);
    assert(sandbox.tcV3FindChurnProfile('Wells Fargo','consumer checking','personal')===null,'Business analyzer memory leaked into personal Wells profile lookup');
    const wellsConsumer='Account opening bonus disclosure. To be eligible: Offer is for new consumer checking customers only. Offer is not available to customers that received a bonus for a Wells Fargo consumer checking account within the past 12 months, are Wells Fargo employees, or are non-resident aliens or foreign entities signing IRS Form W-8. To receive the $400 bonus: you must use your bonus offer code when opening a new Wells Fargo consumer checking account by August 18, 2026 and receive $1,000 or more in qualifying electronic deposits within 90 calendar days of account opening. A qualifying electronic deposit is a posted direct deposit through ACH, an instant payment through RTP or FedNow, or an electronic credit from a third party service to your debit card using the Visa or Mastercard network. Transfers from one account to another, mobile deposits, Zelle, or deposits made at a branch or ATM are not considered a qualifying electronic deposit. Once you have met all requirements, we will deposit the bonus into your new account within 30 calendar days. Your new account must stay open through the time we attempt to deposit the bonus. See the Consumer Account Fee and Information Schedule for the applicable monthly service fee and options to avoid it. The actions required for this bonus are separate from the actions available to avoid the monthly service fee.';
    const wc=sandbox.tcV3Analyze(wellsConsumer,{noGlobalFallback:true});
    assert(wc.bank==='Wells Fargo'&&wc.accountType==='personal'&&wc.bonus===400,'Wells consumer identification failed');
    assert(wc.reqMoney===1000&&wc.reqIsTotal===true&&wc.reqDays===90,'Wells consumer $1,000 / 90-day requirement failed');
    assert(Number(wc.fundedDays||0)===0&&Number(wc.holdDays||0)===0&&Number(wc.minHoldDays||0)===0,'Wells consumer received false funding/hold requirements');
    assert(wc.closeRestrictionType==='payout-only'&&wc.closeBufferDays===0,'Wells consumer payout-only close rule failed');
    assert(wc.churnable===true&&wc.churnability==='repeatable'&&wc.churn==='1'&&wc.churnBasis==='bonus'&&wc.churnBufferDays===0,'Wells 12-month bonus-received eligibility basis failed');
    assert(/not stated in bonus disclosure/i.test(wc.monthlyFeeYNText||''),'Wells fee disclosure was invented instead of deferred to the separate fee schedule');
    const wt=sandbox.tcV3MakeSuggestedTimers(wc,'2026-08-10');
    assert(wt.some(t=>/\$1,000 qualifying electronic deposits/i.test(t.text)&&Number(t.daysRequired)===90),'Wells requirement timer missing');
    assert(!wt.some(t=>/funding|maintain|required balance|hold/i.test(t.text)),'Wells false funding/hold timer survived');
    assert(!wt.some(t=>/payout/i.test(t.text)&&t.startDate==='2026-08-10'),'Payout timing was incorrectly anchored to account opening');
    assert(!wt.some(t=>sandbox.timerCategory(t)==='openby'),'Offer open-by timer remained active after the account was already opened');
    const payoutAfterMet=sandbox.tcV3MakeSuggestedTimers({...wc,reqMet:'2026-08-20'},'2026-08-10');
    assert(payoutAfterMet.some(t=>sandbox.timerCategory(t)==='payout'&&t.startDate==='2026-08-20'&&Number(t.daysRequired)===30),'Wells payout deadline was not anchored to requirement-met date');
    const repaired=sandbox.normalizeLifecycleEntry({bank:'Wells Fargo',accountType:'personal',bonus:400,opened:'2026-08-10',dataPoint:'DD $1,000 within 90 days',reqDays:90,analyzedTC:'Wells Fargo consumer checking $400 bonus. $1,000 qualifying electronic deposits within 90 calendar days. Bonus within 30 calendar days after requirements are met. Received a Wells Fargo consumer checking bonus within past 12 months.',fundedDays:30,holdDays:60,minHoldDays:60,customTimers:[{text:'Deposit new money / funding deadline',startDate:'2026-08-10',daysRequired:30,date:'2026-09-09'},{text:'Maintain required balance / hold check',startDate:'2026-08-10',daysRequired:60,date:'2026-10-09'},{text:'Bonus requirement deadline',startDate:'2026-08-10',daysRequired:90,date:'2026-11-08'},{text:'Bonus payout watch',startDate:'2026-08-10',daysRequired:120,date:'2026-12-08'}]});
    assert(repaired.fundedDays===0&&Number(repaired.holdDays||0)===0&&repaired.minHoldDays===0,'Existing Wells consumer record was not repaired');
    assert(repaired.customTimers.length===1&&sandbox.timerCategory(repaired.customTimers[0])==='requirement','Existing Wells bad timers were not cleaned');
    assert(sandbox.timerStatusMeta(repaired).label==='Requirement Due','Custom Timer badge was not replaced with semantic status');
    assert(!sandbox.lifecycleSteps(repaired).some(x=>x.key==='funded'),'Optional Funded lifecycle step still appears for Wells');
    assert(sandbox.requirementSummaryForEntry(repaired).includes('$1,000'),'Professional requirement summary missing');
    assert(sandbox.monthlyFeePlanForEntry(repaired).chip==='Fee Schedule','Wells separate fee schedule was not shown professionally');
    const preBonusPlan=sandbox.closePlanForEntry(repaired);
    assert(preBonusPlan.rows.some(x=>x.label==='Earliest close'&&x.value==='After $400 posts'),'Wells earliest-close summary is still contradictory');
    const eligibility=sandbox.normalizeLifecycleEntry({...repaired,reqMet:'2026-08-20',bonusRecd:'2026-09-01',closed:'2026-09-10'});
    assert(sandbox.nextReopen(eligibility)==='2027-09-01'&&sandbox.churnReadyDate(eligibility)==='2027-09-01','Wells future eligibility incorrectly starts from close date or adds a fake buffer');
    sandbox.openAdd();
    sandbox.btModalSet('bank','Wells Fargo');sandbox.btModalSet('accountType','personal');sandbox.btModalSet('bonus','400','number');sandbox.setModalChurnability('repeatable');sandbox.setModalChurnRule('1');sandbox.setModalChurnBasis('bonus');sandbox.btModalSet('opened','2026-08-10');sandbox.btModalSet('monthlyFeeYNText','Not stated in bonus disclosure — separate Wells Fargo fee schedule applies');sandbox.btModalSet('avoidMonthlyFeeText','Review the Wells Fargo Consumer Account Fee and Information Schedule.');
    sandbox.btWizardStep(1);
    const wizardBasics=sandbox.rModal();
    assert(/Can this bonus be earned again\? \*/.test(wizardBasics)&&/Eligibility clock starts from \*/.test(wizardBasics),'Guided editor did not show required future-eligibility decision and basis');
    sandbox.btWizardStep(4);
    const wizardReview=sandbox.rModal();
    assert(/Future eligibility/.test(wizardReview)&&/1 year after bonus received date/.test(wizardReview),'Guided review did not preserve the saved eligibility basis');

    const fourLeaf='FourLeaf Checking Up to $550 Bonus Offer. Open a Free Checking, Smart Checking, or Student Checking account between February 2, 2026 and December 31, 2026. Have a Qualifying Direct Deposit post within ninety (90) calendar days of account opening. A Qualifying Direct Deposit is a recurring electronic deposit of a paycheck, pension, or government benefits of $500.00 or more. The First Direct Deposit Bonus of $350 will be deposited within sixty (60) calendar days following the initial Qualifying Direct Deposit. Continue to have a Qualifying Direct Deposit for twelve (12) consecutive months for an additional $100 and twenty-four (24) consecutive months for another $100. The checking account must remain open and in good standing up to and including the date each bonus is deposited. You must not have previously received a new checking account opening related bonus from FourLeaf.';
    const fr=sandbox.tcV3Analyze(fourLeaf,{noGlobalFallback:true});
    assert(fr.bank==='FourLeaf','FourLeaf bank identification failed');
    assert(fr.bonus===550,'FourLeaf bonus amount failed');
    assert(fr.reqMoney===500&&fr.reqDays===90,'FourLeaf $500 / 90-day requirement failed');
    assert(fr.closeRestrictionType==='payout-only'&&Number(fr.minHoldDays||0)===0,'FourLeaf payout-only close rule failed');
    assert(fr.churnable===false&&fr.churnability==='not-repeatable','FourLeaf lifetime-like churn restriction failed');
    assert(/24 consecutive/i.test(fr.actionPlan||''),'FourLeaf 24-month milestone plan missing');
    assert(typeof sandbox.churnDecisionForEntry==='function'&&typeof sandbox.hasSavedChurnDecision==='function','Churnability intake helpers missing');
    assert(sandbox.hasSavedChurnDecision({bank:'Repeat Bank',churnable:true,churnability:'repeatable',churn:'2'})===true,'Repeatable decision was not recognized');
    assert(sandbox.hasSavedChurnDecision({bank:'Unknown Bank',churn:'',churnability:''})===false,'Unknown churnability was incorrectly accepted');
    const gate=vm.runInContext(`(function(){
      const before=entries.length;
      openAdd();modal.bank='Gate Test Bank';modal.bonus=100;
      const blocked=saveEntry();
      const afterBlocked=entries.length;
      modal.churnable=true;modal.churnability='repeatable';modal.churn='2';
      const saved=saveEntry();
      const created=entries.find(x=>x.bank==='Gate Test Bank');
      return{before,blocked,afterBlocked,saved,created};
    })()`,sandbox);
    assert(gate.blocked===false&&gate.afterBlocked===gate.before,'New bank saved without a churnability decision');
    assert(gate.saved===true&&gate.created?.churnability==='repeatable'&&gate.created?.churn==='2','Repeatable churn decision was not saved');
    const nonrepeat=vm.runInContext(`(function(){
      openAdd();modal.bank='Lifetime Unique Credit Union';modal.bonus=50;modal._skipDuplicateCheck=true;modal._skipManualReplacePrompt=true;modal.churnable=false;modal.churnability='not-repeatable';modal.churnReason='One-time offer';
      const saved=saveEntry();const created=entries.find(x=>x.bank==='Lifetime Unique Credit Union');return{saved,created};
    })()`,sandbox);
    assert(nonrepeat.saved===true&&nonrepeat.created?.churnable===false&&nonrepeat.created?.churn==='', 'Non-repeatable decision was not saved correctly');
    const closedFourLeaf=sandbox.normalizeLifecycleEntry({
      bank:'FourLeaf Bank',accountType:'personal',id:'FOURLEAF-ARCHIVE',
      opened:'2026-07-21',reqMet:'2026-07-25',bonusRecd:'2026-08-01',closed:'2026-08-06',
      bonus:350,churn:'2',churnable:false,churnability:'not-repeatable',
      eligibilityText:'Not eligible if you previously received a new checking account opening related bonus from FourLeaf.'
    });
    assert(closedFourLeaf.archived===true&&closedFourLeaf.lifecycleState==='archived-nonrepeatable','Closed FourLeaf record was not marked archived');
    assert(closedFourLeaf.churn==='', 'Archived FourLeaf record kept a churn rule');
    assert(sandbox.status(closedFourLeaf)==='ARCHIVED','Closed non-repeatable entry did not show Archived');
    assert(sandbox.nextReopen(closedFourLeaf)==='','Archived entry received a reopen date');
    assert(sandbox.churnReadyDate(closedFourLeaf)==='','Archived entry received a churn-ready date');
    assert(sandbox.closeReadiness(closedFourLeaf).label==='Closed / Archived','Archived close-readiness label is incorrect');
    const archivedPlan=sandbox.closePlanForEntry(closedFourLeaf);
    assert(archivedPlan?.chip==='Archived'&&archivedPlan?.rows?.some(x=>x.value==='Non-repeatable offer'),'Archived close plan is incorrect');
    const integrity=sandbox.backupIntegrityReport({entries:[closedFourLeaf]});
    assert(!(integrity.warnings||[]).some(x=>/missing churn rule/i.test(String(x))),'Archive incorrectly requires a churn rule');
    const close=sandbox.BTCloseRules.sanitizeEntry({bank:'Chase Biz',accountType:'business',opened:'2026-05-07',reqMet:'2026-05-29',bonusRecd:'2026-07-14',minHoldDays:90,closeFeeCountdownDays:'90',closeRuleBasis:'bonus',closeBufferDays:5,closeRestrictionType:'payout-only',closeRuleText:'Keep the account open until the bonus posts.'});
    assert(close.minHoldDays===0,'Stale Chase close countdown survived');
    assert(sandbox.BTCloseRules.safeCloseDate(close)==='2026-07-14','Payout-only close date is incorrect');
    if(typeof sandbox.R==='function')sandbox.R();
    assert(app.innerHTML.length>1000,'Tracker failed to render after regression run');
    assert(!errors.some(x=>x.startsWith('ERROR ')),`Runtime console errors: ${errors.join(' | ')}`);
    console.log(`Full app smoke passed: ${scripts.length} runtime scripts · ${report.passed}/${report.total} regression checks · Wells consumer accuracy, FourLeaf archive, and mobile Safari release verified`);
  }catch(err){console.error(err.stack||err);process.exitCode=1}
},2200);
