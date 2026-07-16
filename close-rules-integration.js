/* Bonus Tracker Close Rules Integration v3.4.03 — binds the permanent core to the live app. */
(function(){
  'use strict';
  const VER='3.4.03',SCHEMA=6,SCHEMA_KEY='bt_data_schema_version',BACKUP_KEY='bt_pre_migration_backup_v6';
  const core=window.BTCloseRules;if(!core){console.error('Close Rules Core missing');return}
  const escFn=v=>{try{return esc(String(v??''))}catch{const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML}};
  const short=v=>String(v||'').replace(/\s+/g,' ').trim().slice(0,420);

  function bind(name,fn){window[name]=fn;try{globalThis[name]=fn}catch{}}
  function normalizeBasis(v){try{return normalizeCloseRuleBasis(v)}catch{return String(v||'opened')}}
  const ruleDays=e=>core.ruleDays(e);
  const basis=e=>normalizeBasis(core.basisFor(e));
  const baseDate=e=>core.baseDate(e);
  const rawDate=e=>core.rawSafeDate(e);
  const safeDate=e=>core.safeCloseDate(e);
  const daysSafe=e=>core.daysUntilSafe(e,typeof td==='function'?td():new Date().toISOString().slice(0,10));
  const inBuffer=e=>core.isInBuffer(e,typeof td==='function'?td():new Date().toISOString().slice(0,10));

  bind('knownClosePolicy',()=>null);
  bind('applyKnownClosePolicy',e=>core.sanitizeEntry(e));
  bind('closeRuleDaysFor',ruleDays);
  bind('closeRuleBasisFor',basis);
  bind('closeBasisDate',baseDate);
  bind('rawSafeDate',rawDate);
  bind('safeCloseDate',safeDate);
  bind('daysUntilSafe',daysSafe);
  bind('isInBuffer',inBuffer);
  bind('closeBufferDaysFor',e=>ruleDays(e)>0?Math.max(0,parseInt(e?.closeBufferDays,10)||0):0);

  const oldNormalize=window.normalizeLifecycleEntry;
  function normalizeEntry(e){const x=oldNormalize?oldNormalize(e):({...e});core.sanitizeEntry(x);try{if(typeof window.btBuildResolvedBankProfile==='function'){x.profile=window.btBuildResolvedBankProfile(x);x.profileVersion='bank-profile-v2'}}catch{}return x}
  bind('normalizeLifecycleEntry',normalizeEntry);
  bind('normalizeLifecycleEntries',rows=>(rows||[]).map(normalizeEntry));

  function statusFixed(e){
    if(!e||!e.bank)return'';
    if(e.closed)return daysLeft(e)===0?'TIME TO CHURN!':'WAITING TO CHURN!';
    const hasBonus=!!e.bonusRecd,hasReq=!!e.reqMet,hasHold=ruleDays(e)>0&&!!baseDate(e);
    if(hasBonus){if(hasHold){if(inBuffer(e))return'3-DAY BUFFER';const d=daysSafe(e);if(d!==null&&d>0)return'WAITING TO CLOSE'}return'SAFE TO CLOSE'}
    const active=typeof nextActiveTimer==='function'?nextActiveTimer(e):null;
    if(hasReq)return active?'CUSTOM TIMER':'REQ MET';
    return active?'CUSTOM TIMER':'WORKING'
  }
  bind('status',statusFixed);

  function readiness(e,closeDate=''){
    const items=[];const add=(ok,label,detail='',level='warn')=>items.push({ok:!!ok,label,detail,level});
    if(!e||!e.bank)return{label:'Manual Review',cls:'warn',items:[],warnings:['Entry missing']};
    if(e.closed)return{label:'Closed / Waiting to Churn',cls:'done',items:[{ok:true,label:'Closed date saved',detail:fD(e.closed)}],warnings:[]};
    const safe=safeDate(e),target=closeDate||(typeof td==='function'?td():new Date().toISOString().slice(0,10)),days=ruleDays(e),start=baseDate(e);
    add(!!e.reqMet,'Requirement met date saved',e.reqMet?fD(e.reqMet):'Save Req Met before closing','danger');
    add(!!e.bonusRecd,'Bonus received',e.bonusRecd?fD(e.bonusRecd):'Do not close before the bonus posts','danger');
    if(days){add(!!start,'Close-rule start date available',start?fD(start):'Missing','danger');add(!!safe&&dB(target,safe)<=0,'Hold period + buffer complete',safe?'Safe close: '+fD(safe):'Cannot calculate','danger')}
    else add(true,'No fixed post-bonus hold',core.typeForEntry(e)==='payout-only'?'Close after bonus posts':'No countdown found');
    add(!!e.churn,'Churn rule saved',e.churn?(e.churn==='180'?'180 days':e.churn+' year'):'Needed for future churn','warn');
    const hasFee=/(yes|\$|monthly|service fee|maintenance fee)/i.test(String(e.monthlyFeeYNText||'')+' '+String(e.avoidMonthlyFeeText||''));
    add(!hasFee||!!e.monthlyFeeChecked,'Monthly fee checked',hasFee?(e.monthlyFeeChecked?'Confirmed':'Check next statement before close'):'No monthly fee risk','warn');
    const warnings=items.filter(x=>!x.ok).map(x=>x.label+(x.detail?': '+x.detail:''));
    const blockers=items.filter(x=>!x.ok&&x.level==='danger'),cautions=items.filter(x=>!x.ok&&x.level!=='danger');
    return{label:blockers.length?'Do Not Close Yet':cautions.length?'Ready — Review Fee':'Safe to Close',cls:blockers.length?'danger':cautions.length?'warn':'safe',items,warnings,safeDate:safe,rawDate:rawDate(e),basis:basis(e)}
  }
  bind('closeReadiness',readiness);

  function closePlan(e){
    if(!e?.bank)return null;const ready=readiness(e),rows=[];
    if(e.closed){rows.push({label:'Closed',value:fD(e.closed),cls:'ok'});const cr=churnReadyDate(e);if(cr)rows.push({label:'Churn ready',value:fD(cr)});return{title:'Close Check',sub:'Closure saved',chip:ready.label,cls:ready.cls,rows,notes:[],compact:true}}
    const safe=safeDate(e),days=ruleDays(e),buffer=days?(parseInt(e.closeBufferDays,10)||0):0,type=core.typeForEntry(e);
    rows.push({label:'Earliest close',value:safe?fD(safe):(e.bonusRecd?'Close after bonus posts':'Wait for bonus'),cls:safe&&daysSafe(e)<=0?'ok':safe?'warn':'bad'});
    rows.push({label:'Rule',value:days?`${days} days from ${closeRuleBasisLabel(basis(e)).toLowerCase()}${buffer?' + '+buffer+' day safety':''}`:(type==='payout-only'?'Close after bonus posts':'No fixed post-bonus hold'),cls:days?'':'ok'});
    rows.push({label:'Final check',value:e.bonusRecd?'Bonus posted · no pending activity':'Wait for bonus to post',cls:e.bonusRecd?'':'bad'});
    return{title:'Close Check',sub:'One clear source of truth',chip:ready.label,cls:ready.cls,rows,notes:[],proof:core.sourceSentence(e),compact:true}
  }
  bind('closePlanForEntry',closePlan);

  function renderPlan(o){
    if(!o)return'';const cls=escFn(o.cls||''),rows=(o.rows||[]).filter(r=>r&&String(r.value??'').trim()),notes=(o.notes||[]).filter(Boolean);
    let h='<div class="clean-plan-card '+cls+(o.compact?' compact':'')+'"><div class="clean-plan-head"><div><div class="clean-plan-title">'+escFn(o.title||'Plan')+'</div>'+(o.sub?'<div class="clean-plan-sub">'+escFn(o.sub)+'</div>':'')+'</div>'+(o.chip?'<span class="clean-plan-chip '+cls+'">'+escFn(o.chip)+'</span>':'')+'</div>';
    if(rows.length)h+='<div class="clean-plan-rows">'+rows.map(r=>'<div class="clean-plan-row '+escFn(r.cls||'')+'"><span>'+escFn(r.label||'')+'</span><b>'+escFn(short(r.value).slice(0,160))+'</b></div>').join('')+'</div>';
    if(notes.length)h+='<div class="clean-plan-notes">'+notes.slice(0,3).map(x=>'<div>• '+escFn(short(x).slice(0,220))+'</div>').join('')+'</div>';
    if(o.proof)h+='<details class="clean-plan-proof"><summary>Why this close rule?</summary><div>'+escFn(short(o.proof))+'</div></details>';
    return h+'</div>'
  }
  bind('renderCleanPlanCard',renderPlan);
  bind('renderClosePlan',e=>renderPlan(closePlan(e)));

  const analyzer=window.tcV3Analyze;
  if(typeof analyzer==='function'){
    window.tcV3Analyze=function(raw,opts){return core.sanitizeAnalysis(analyzer(raw,opts),raw)};
    window.tcUnifiedAnalyze=window.tcV3Analyze;window.tcStrictAnalyze=window.tcV3Analyze;window.tcV3EngineVersion=VER;
  }
  const oldApply=window.tcApplyReviewed;
  if(typeof oldApply==='function')window.tcApplyReviewed=function(){const raw=document.getElementById('tca_raw')?.value||'';const result=window.tcV3Analyze?window.tcV3Analyze(raw):null;const out=oldApply.apply(this,arguments);setTimeout(()=>{try{if(typeof modal!=='undefined'&&modal){if(result){modal.closeRestrictionType=result.closeRestrictionType||'none';modal.closeRuleSourceSentence=result.closeRuleSourceSentence||'';modal.closeRuleSource='current-tc'}core.sanitizeEntry(modal)}if(typeof R==='function')R()}catch{}},0);return out};

  function migrateOnce(){
    try{
      const current=parseInt(localStorage.getItem(SCHEMA_KEY)||'0',10)||0;if(current>=SCHEMA)return false;
      if(typeof entries==='undefined'||!Array.isArray(entries))return false;
      if(!localStorage.getItem(BACKUP_KEY))localStorage.setItem(BACKUP_KEY,JSON.stringify({version:current,createdAt:new Date().toISOString(),entries}));
      entries=entries.map(normalizeEntry);sv(SK,entries);localStorage.setItem(SCHEMA_KEY,String(SCHEMA));localStorage.setItem('bt_last_migration_report',JSON.stringify({from:current,to:SCHEMA,changedAt:new Date().toISOString(),entries:entries.length}));return true
    }catch(err){console.error('Close-rule migration failed',err);return false}
  }

  function clearTimer(e){if(!e)return e;e.minHoldDays=0;e.closeFeeCountdownDays='';e.earlyCloseFee=0;e.earlyTerminationFeeText='';e.closeRuleBasis='bonus';e.closeBufferDays=0;e.closeRestrictionType=core.payoutText([e.closeRuleText,e.analyzedTC].filter(Boolean).join(' '))?'payout-only':'none';if(e.closeRestrictionType==='none')e.closeRuleText='';e.closeRuleSource='manual';e.profileRuleOverride='';e.feeChecked=true;return core.sanitizeEntry(e)}
  window.feeCheckRemoveTimer=function(){const p=typeof feeCheckPrompt!=='undefined'?feeCheckPrompt:window.feeCheckPrompt;if(!p)return;const id=p.entryId,current=entries.find(e=>e.id===id);entries=entries.map(e=>e.id===id?normalizeEntry(clearTimer({...e})):e);entries=sortE(entries);sv(SK,entries);feeCheckPrompt=null;cfm={title:'Timer Removed',msg:(current?current.bank+' ':'')+'early-close timer removed. This bank is now marked Safe to Close.',green:true,action:()=>{cfm=null;R()}};R()};
  window.feeCheckSave=function(){const p=typeof feeCheckPrompt!=='undefined'?feeCheckPrompt:window.feeCheckPrompt;if(!p)return;const id=p.entryId,months=Math.max(1,parseInt(p.months,10)||6),feeAmt=Math.max(0,parseFloat(p.feeAmount)||0);entries=entries.map(e=>{if(e.id!==id)return e;const x={...e},end=x.opened?addM(x.opened,months):'',days=x.opened&&end?dB(x.opened,end):months*30;x.minHoldDays=days;x.closeFeeCountdownDays=String(days);x.closeRuleBasis='opened';x.closeBufferDays=5;x.closeRestrictionType='manual-fixed';x.closeRuleSource='manual';x.earlyCloseFee=feeAmt;x.earlyTerminationFeeText=feeAmt?'$'+feeAmt.toLocaleString():'';x.closeRuleText=`Manual early-close hold: keep the account open for ${months} month${months===1?'':'s'} from the opened date${feeAmt?' to avoid a $'+feeAmt.toLocaleString()+' fee':''}.`;x.closeRuleSourceSentence=x.closeRuleText;x.fieldSources=(x.fieldSources&&typeof x.fieldSources==='object')?x.fieldSources:{};const meta={kind:'manual',confidence:'verified',source:'Set manually in the Early Closure Fee timer.',updatedAt:new Date().toISOString()};x.fieldSources.closeFeeCountdownDays=meta;x.fieldSources.closeRuleText=meta;x.fieldSources.closeRuleBasis=meta;return normalizeEntry(x)});entries=sortE(entries);sv(SK,entries);feeCheckPrompt=null;R()};

  window.btRunFullRegressionTests=function(){const report=core.runSelfTests();window.__btFullRegressionReport={...report,ranAt:new Date().toISOString()};try{localStorage.setItem('bt_last_regression_v1',JSON.stringify(window.__btFullRegressionReport))}catch{}return window.__btFullRegressionReport};
  window.BT_APP_VERSION=VER;window.btCloseRulesVersion=VER;
  migrateOnce();
  setTimeout(()=>{try{if(typeof entries!=='undefined')entries=entries.map(normalizeEntry);const rep=window.btRunFullRegressionTests();if(!rep.ok)console.warn('Close-rule regression warnings',rep);if(typeof R==='function')R()}catch(err){console.error('Close Rules Integration failed',err)}},0);
})();
