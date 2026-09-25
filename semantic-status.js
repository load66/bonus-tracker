/* BonusTracker v3.4.29 lifecycle-status — canonical timer semantics plus one user-facing bank-bonus lifecycle stage. */
(function(){
  'use strict';
  const VER='3.4.29-status1';
  const VALID=new Set(['requirement','funding','hold','payout','openby','close-review','custom']);
  const baseNormalizeTimer=window.normalizeTimer;
  const baseNormalizeTimerList=window.normalizeTimerList;
  const baseSupportLine=window.supportLine;
  const baseStatusBadgeHtml=window.statusBadgeHtml;
  const baseRequirementSummary=window.requirementSummaryForEntry;
  const baseLifecycleSteps=window.lifecycleSteps;
  const baseRenderLifecycleStepper=window.renderLifecycleStepper;
  const baseRenderBankProfileSummary=window.renderBankProfileSummary;
  const baseNormalizeLifecycleEntry=window.normalizeLifecycleEntry;
  const baseCollectModalEntryData=window.collectModalEntryData;
  const baseSuggestedTimers=window.tcV3MakeSuggestedTimers;
  const baseHydrateTimers=window.hydrateTimersFromOpened;

  function explicitKind(t){
    const raw=String(t?.kind||t?.category||t?.timerType||t?.type||'').toLowerCase().trim();
    if(VALID.has(raw))return raw;
    if(['requirements','req','requirement-due'].includes(raw))return'requirement';
    if(['fund','funding-due'].includes(raw))return'funding';
    if(['balance','balance-hold','maintenance','maintain'].includes(raw))return'hold';
    if(['bonus','bonus-pending','payment'].includes(raw))return'payout';
    if(['open-by','open_by','expiration','apply-by'].includes(raw))return'openby';
    if(['close','closecheck','close-review'].includes(raw))return'close-review';
    return'';
  }
  function inferredKind(t){
    if(!t)return'custom';
    const explicit=explicitKind(t);if(explicit)return explicit;
    const s=String([t.text,t.label,t.name,t.source].filter(Boolean).join(' ')).toLowerCase().replace(/\s+/g,' ').trim();
    if(!s)return'custom';
    if(/\b(open[ -]?by|apply by|application deadline|offer (?:expires?|expiration)|opening deadline)\b/.test(s))return'openby';
    if(/\b(balance hold|hold check|maintain(?:ing)? (?:a |the )?(?:minimum |required )?balance|required balance|keep (?:a |the )?.{0,30}balance|maintenance period)\b/.test(s))return'hold';
    if(/\b(funding|fund account|initial deposit|opening deposit|deposit new money|new money deposit)\b/.test(s))return'funding';
    if(/\b(bonus payout|payout|bonus pending|bonus payment|bonus expected|bonus deposit(?:ed)?|pay(?:ment)? deadline)\b/.test(s))return'payout';
    if(/\b(close review|safe close|early close|early closure|termination|close check)\b/.test(s))return'close-review';
    if(/\b(requirement|qualifying (?:electronic |direct )?deposits?|direct deposits?|enhanced direct deposits?|\bedd\b|debit (?:card )?(?:transactions?|purchases?)|transactions? requirement|spend requirement|purchase requirement|payroll requirement)\b/.test(s))return'requirement';
    return'custom';
  }
  function ensureKind(item){
    let x=item&&typeof item==='object'?{...item}:{};
    if(typeof baseNormalizeTimer==='function'){
      try{x={...x,...baseNormalizeTimer(x)}}catch{}
    }
    x.kind=inferredKind({...item,...x});
    return x;
  }
  function normalizeTimerSemantic(item){return ensureKind(item)}
  function normalizeTimerListSemantic(list){
    let rows=Array.isArray(list)?list:[];
    if(typeof baseNormalizeTimerList==='function'){
      try{rows=baseNormalizeTimerList(rows)||rows}catch{}
    }
    return rows.map(ensureKind);
  }
  function timerCategorySemantic(t){return inferredKind(t)}

  function nextTimer(e){
    try{if(typeof window.nextActiveTimer==='function')return window.nextActiveTimer(e)}catch{}
    const rows=normalizeTimerListSemantic(e?.customTimers||[]).filter(t=>!t.done&&t.date);
    rows.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    return rows[0]||null;
  }
  function icon(name,fallback=''){
    try{return window.I?.[name]||I?.[name]||fallback}catch{return fallback}
  }
  function metaForKind(kind){
    if(kind==='requirement')return{label:'Requirement Due',cls:'buf',icon:icon('target')};
    if(kind==='funding')return{label:'Funding Due',cls:'buf',icon:icon('clockShield')};
    if(kind==='hold')return{label:'Balance Hold',cls:'buf',icon:icon('clockShield')};
    if(kind==='payout')return{label:'Bonus Pending',cls:'req',icon:icon('gift')};
    if(kind==='openby')return{label:'Open By',cls:'buf',icon:icon('calendar')};
    if(kind==='close-review')return{label:'Close Review',cls:'buf',icon:icon('clockShield')};
    return{label:'Custom Timer',cls:'buf',icon:icon('clockShield')};
  }
  function timerStatusMetaSemantic(e){return metaForKind(timerCategorySemantic(nextTimer(e)))}
  function timerDays(t){
    try{if(typeof window.timerCountdownDays==='function')return window.timerCountdownDays(t)}catch{}
    try{if(t?.date&&typeof dB==='function'&&typeof td==='function')return dB(td(),t.date)}catch{}
    return null;
  }
  function dueText(t){
    if(!t?.date)return'';
    try{if(typeof fD==='function')return fD(t.date)}catch{}
    return String(t.date);
  }
  function semanticTimerSupport(e){
    const t=nextTimer(e);if(!t)return'Deadline active';
    const d=timerDays(t),due=dueText(t);
    if(d===null)return due?'Due '+due:'Deadline active';
    if(d<0)return'Overdue'+(due?' · Due '+due:'');
    if(d===0)return'Due today';
    return d+'d left'+(due?' · Due '+due:'');
  }
  const STAGES=Object.freeze({
    ACTION_NEEDED:'ACTION_NEEDED',
    IN_PROGRESS:'IN_PROGRESS',
    REQUIREMENTS_MET:'REQUIREMENTS_MET',
    AWAITING_BONUS:'AWAITING_BONUS',
    BONUS_RECEIVED:'BONUS_RECEIVED',
    HOLD_OPEN:'HOLD_OPEN',
    READY_TO_CLOSE:'READY_TO_CLOSE',
    COOLDOWN:'COOLDOWN',
    ELIGIBLE:'ELIGIBLE',
    ARCHIVED:'ARCHIVED'
  });
  const STAGE_META=Object.freeze({
    ACTION_NEEDED:{label:'Action Needed',cls:'bt-stage-action',priority:0},
    IN_PROGRESS:{label:'In Progress',cls:'bt-stage-progress',priority:2},
    REQUIREMENTS_MET:{label:'Requirements Met',cls:'bt-stage-met',priority:3},
    AWAITING_BONUS:{label:'Awaiting Bonus',cls:'bt-stage-await',priority:4},
    BONUS_RECEIVED:{label:'Bonus Received',cls:'bt-stage-received',priority:5},
    HOLD_OPEN:{label:'Hold Open',cls:'bt-stage-hold',priority:6},
    READY_TO_CLOSE:{label:'Ready to Close',cls:'bt-stage-ready',priority:1},
    COOLDOWN:{label:'Cooldown',cls:'bt-stage-cooldown',priority:8},
    ELIGIBLE:{label:'Eligible',cls:'bt-stage-eligible',priority:0.5},
    ARCHIVED:{label:'Archived',cls:'bt-stage-archived',priority:9}
  });
  function rawStatusCode(e){try{return typeof status==='function'?String(status(e)||''):''}catch{return''}}
  function pendingStageTimers(e){
    return normalizeTimerListSemantic(e?.customTimers||[]).filter(t=>t&&!t.done&&t.date).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  }
  function recurringRequirementTimer(t){
    const text=String([t?.text,t?.label,t?.name,t?.source].filter(Boolean).join(' ')).toLowerCase();
    return /(monthly|each month|every month|per month|recurring|ongoing)/.test(text);
  }
  function timerRelevantForStage(e,t){
    if(!e||!t||e.closed)return false;
    const kind=timerCategorySemantic(t);
    if(e.bonusRecd)return kind==='hold'||kind==='close-review'||kind==='custom';
    if(e.reqMet){
      if(kind==='requirement')return recurringRequirementTimer(t);
      return kind==='payout'||kind==='hold'||kind==='close-review'||kind==='custom';
    }
    if(kind==='openby'&&e.opened)return false;
    return true;
  }
  function nextStageTimer(e){return pendingStageTimers(e).find(t=>timerRelevantForStage(e,t))||null}
  function safeDaysLeft(e){try{const n=typeof daysLeft==='function'?daysLeft(e):null;return Number.isFinite(n)?n:null}catch{return null}}
  function safeDaysUntilClose(e){try{const n=typeof daysUntilSafe==='function'?daysUntilSafe(e):null;return Number.isFinite(n)?n:null}catch{return null}}
  function safeCloseDateValue(e){try{return typeof safeCloseDate==='function'?(safeCloseDate(e)||''):''}catch{return''}}
  function churnReadyDateValue(e){try{return typeof churnReadyDate==='function'?(churnReadyDate(e)||''):''}catch{return''}}
  function requirementDeadlineDays(e){
    try{
      if(e?.reqMet)return null;
      const due=typeof reqDeadline==='function'?reqDeadline(e):'';
      if(!due)return null;
      const n=typeof dB==='function'&&typeof td==='function'?dB(td(),due):null;
      return Number.isFinite(n)?n:null;
    }catch{return null}
  }
  function actionableTimer(t){
    if(!t)return false;
    return ['requirement','funding','openby','close-review','custom'].includes(timerCategorySemantic(t));
  }
  function timerNeedsActionSoon(t){
    if(!actionableTimer(t))return false;
    const d=timerDays(t);
    return Number.isFinite(d)&&d<=7;
  }
  function payoutEvidence(e,t){
    if(t&&timerCategorySemantic(t)==='payout')return true;
    return !!String(e?.payoutTimingText||e?.analysis?.payoutTimingText||'').trim();
  }
  function stageCore(e){
    const raw=rawStatusCode(e);
    if(!e||!e.bank)return{code:STAGES.IN_PROGRESS,raw,timer:null,kind:''};
    if(e.closed){
      try{if(typeof isNonRepeatableEntry==='function'&&isNonRepeatableEntry(e))return{code:STAGES.ARCHIVED,raw,timer:null,kind:''}}catch{}
      const dl=safeDaysLeft(e);
      return{code:dl!==null&&dl<=0?STAGES.ELIGIBLE:STAGES.COOLDOWN,raw,timer:null,kind:''};
    }
    const timer=nextStageTimer(e),kind=timer?timerCategorySemantic(timer):'';
    if(e.bonusRecd){
      const d=timer?timerDays(timer):null;
      if(timer&&kind==='close-review'&&Number.isFinite(d)&&d<=0)return{code:STAGES.ACTION_NEEDED,raw,timer,kind};
      if(timer&&(kind==='hold'||kind==='close-review')&&(!Number.isFinite(d)||d>0))return{code:STAGES.HOLD_OPEN,raw,timer,kind};
      if(raw==='WAITING TO CLOSE'||raw==='3-DAY BUFFER')return{code:STAGES.HOLD_OPEN,raw,timer,kind};
      if(raw==='SAFE TO CLOSE')return{code:STAGES.READY_TO_CLOSE,raw,timer,kind};
      return{code:STAGES.BONUS_RECEIVED,raw,timer,kind};
    }
    const recurring=!!(e.reqMet&&timer&&kind==='requirement'&&recurringRequirementTimer(timer));
    const reqDue=requirementDeadlineDays(e);
    if((!e.reqMet||recurring)&&((timer&&timerNeedsActionSoon(timer))||(Number.isFinite(reqDue)&&reqDue<=7)))return{code:STAGES.ACTION_NEEDED,raw,timer,kind};
    if(!e.reqMet||recurring)return{code:STAGES.IN_PROGRESS,raw,timer,kind};
    return{code:payoutEvidence(e,timer)?STAGES.AWAITING_BONUS:STAGES.REQUIREMENTS_MET,raw,timer,kind};
  }
  function shortText(v,max=52){
    const s=String(v||'').replace(/\s+/g,' ').trim();
    return s.length>max?s.slice(0,max-1).trim()+'…':s;
  }
  function fmtDate(v){if(!v)return'';try{return typeof fD==='function'?fD(v):String(v)}catch{return String(v)}}
  function deadlineSupport(t){
    if(!t)return'Action required';
    const d=timerDays(t),label=shortText(t.text||t.label||'Deadline',38),due=fmtDate(t.date);
    if(Number.isFinite(d)){
      if(d<0)return'Overdue · '+label+(due?' · '+due:'');
      if(d===0)return'Due today · '+label;
      return d+'d left · '+label+(due?' · '+due:'');
    }
    return label+(due?' · Due '+due:'');
  }
  function payoutSupport(e,t){
    if(t&&timerCategorySemantic(t)==='payout'){
      const d=timerDays(t),due=fmtDate(t.date);
      if(Number.isFinite(d)&&d>=0)return'Bonus expected in '+d+'d'+(due?' · '+due:'');
      if(d<0)return'Payout window reached'+(due?' · '+due:'');
    }
    const met=e?.reqMet?fmtDate(e.reqMet):'';
    const timing=shortText(e?.payoutTimingText||e?.analysis?.payoutTimingText||'',44);
    return (met?'Requirements met '+met:'Requirements complete')+(timing?' · '+timing:'');
  }
  function stageSupport(core,e){
    switch(core.code){
      case STAGES.ACTION_NEEDED:
        if(core.timer)return deadlineSupport(core.timer);
        try{
          const due=typeof reqDeadline==='function'?reqDeadline(e):'',d=due&&typeof dB==='function'&&typeof td==='function'?dB(td(),due):null;
          if(Number.isFinite(d)){if(d<0)return'Bonus requirement overdue · '+fmtDate(due);if(d===0)return'Bonus requirement due today';return d+'d left · requirement due '+fmtDate(due)}
        }catch{}
        return'Action required';
      case STAGES.IN_PROGRESS:
        if(core.timer&&e?.reqMet&&core.kind==='requirement')return deadlineSupport(core.timer);
        try{return typeof requirementSummaryForEntry==='function'?requirementSummaryForEntry(e):'Complete bonus requirements'}catch{return'Complete bonus requirements'}
      case STAGES.REQUIREMENTS_MET:
        return(e?.reqMet?'Completed '+fmtDate(e.reqMet):'Requirements complete')+' · payout timing not saved';
      case STAGES.AWAITING_BONUS:
        return payoutSupport(e,core.timer);
      case STAGES.BONUS_RECEIVED:
        return(e?.bonus?(typeof fM==='function'?fM(e.bonus):String(e.bonus)):'Bonus received')+(e?.bonusRecd?' received '+fmtDate(e.bonusRecd):'')+' · review close rules';
      case STAGES.HOLD_OPEN:{
        if(core.timer){
          const d=timerDays(core.timer),due=fmtDate(core.timer.date);
          if(Number.isFinite(d)&&d>0)return'Keep open · '+d+'d remaining'+(due?' · '+due:'');
        }
        const d=safeDaysUntilClose(e),safe=safeCloseDateValue(e);
        if(Number.isFinite(d)&&d>0)return'Safe close in '+d+'d'+(safe?' · '+fmtDate(safe):'');
        return'Bonus received · keep account open';
      }
      case STAGES.READY_TO_CLOSE:
        return(e?.bonusRecd?'Bonus received '+fmtDate(e.bonusRecd)+' · ':'')+'all close restrictions cleared';
      case STAGES.COOLDOWN:{
        const d=safeDaysLeft(e),ready=churnReadyDateValue(e);
        return(Number.isFinite(d)?d+'d until eligible':'Waiting for eligibility date')+(ready?' · '+fmtDate(ready):'');
      }
      case STAGES.ELIGIBLE:{
        const ready=churnReadyDateValue(e);
        return'Eligible to reapply'+(ready?' · '+fmtDate(ready):'');
      }
      case STAGES.ARCHIVED:return'Completed · non-repeatable offer';
      default:return'';
    }
  }
  function lifecycleStageForEntry(e){
    const core=stageCore(e),meta=STAGE_META[core.code]||STAGE_META.IN_PROGRESS;
    return{...core,label:meta.label,cls:meta.cls,priority:meta.priority,support:stageSupport(core,e)};
  }
  function supportLineSemantic(e,countdown){
    const stage=lifecycleStageForEntry(e);
    if(stage?.support)return stage.support;
    if(typeof baseSupportLine==='function'){try{return baseSupportLine(e,countdown)}catch{}}
    return'';
  }
  function displayMeta(raw,e){
    if(e){
      const stage=lifecycleStageForEntry(e),meta=STAGE_META[stage.code]||STAGE_META.IN_PROGRESS;
      return{label:meta.label,cls:meta.cls,icon:''};
    }
    if(raw==='CUSTOM TIMER')return timerStatusMetaSemantic(e);
    try{if(typeof window.displayStatusMeta==='function')return window.displayStatusMeta(raw)}catch{}
    return{label:raw||'Status',cls:'w',icon:''};
  }
  function statusBadgeHtmlSemantic(e,countdown){
    const stage=lifecycleStageForEntry(e),support=stage.support||supportLineSemantic(e,countdown);
    try{return'<span class="badge bt-stage '+stage.cls+'"><span>'+esc(stage.label)+'</span></span>'+(support?'<div class="card-subline">'+esc(support)+'</div>':'')}catch{}
    if(typeof baseStatusBadgeHtml==='function')return baseStatusBadgeHtml(e,countdown);
    return'';
  }
  function compactRequirementText(e){
    const raw=String(e?.dataPoint||'').replace(/^DD\s+/i,'').replace(/\s+/g,' ').trim();
    if(!raw)return'';
    if(raw.length<=46)return raw;
    const amount=raw.match(/\$\s?\d[\d,]*(?:\.\d{1,2})?/i)?.[0]?.replace(/\s+/g,'')||'';
    const count=raw.match(/(?:at least\s+)?(\d+)\s+(?:enhanced\s+)?(?:direct\s+)?deposits?/i)?.[1]||'';
    let type='';
    if(/enhanced direct deposit|\bedd\b/i.test(raw))type='EDD total';
    else if(/qualifying electronic deposit/i.test(raw))type='electronic deposits';
    else if(/direct deposit/i.test(raw))type='direct deposits';
    else if(/debit.*(?:transactions?|purchases?)/i.test(raw))type='debit transactions';
    if(amount&&type)return amount+' '+type+(count?' · '+count+' deposits':'');
    return raw.length>54?raw.slice(0,51).trim()+'…':raw;
  }
  function requirementSummarySemantic(e){
    if(!e)return'Pending';
    if(e.reqMet){try{return'Met '+fD(e.reqMet)}catch{return'Met'}}
    let text=compactRequirementText(e);
    if(!text&&typeof baseRequirementSummary==='function'){
      try{return baseRequirementSummary(e)}catch{}
    }
    if(!text&&Number(e.reqDays||0)>0)text='Complete bonus requirements';
    let due='';try{if(typeof reqDeadline==='function')due=reqDeadline(e)||''}catch{}
    if(due){try{text+=' · due '+fD(due)}catch{text+=' · due '+due}}
    return text||'Pending';
  }
  function lifecycleStepsSemantic(e){
    let steps=[];
    if(typeof baseLifecycleSteps==='function'){
      try{steps=(baseLifecycleSteps(e)||[]).map(x=>({...x}))}catch{}
    }
    if(!steps.length)return steps;
    return steps.map(st=>{
      if(st.key==='req')st.label=e?.reqMet?'Requirement Met':'Requirement Due';
      else if(st.key==='bonus')st.label=e?.bonusRecd?'Bonus Received':'Bonus Pending';
      else if(st.key==='funded')st.label=st.done?'Funding Complete':'Funding Due';
      return st;
    });
  }
  function renderLifecycleStepperSemantic(e){
    const steps=lifecycleStepsSemantic(e);
    if(!steps.length&&typeof baseRenderLifecycleStepper==='function')return baseRenderLifecycleStepper(e);
    try{
      let h='<div class="bt-life"><div class="bt-life-title">Lifecycle</div><div class="bt-life-steps">';
      steps.forEach(st=>{const cls=st.done?'done':'todo';const sub=st.date?fD(st.date):'Pending';h+='<div class="bt-life-step '+cls+'"><i>'+esc(st.done?'✓':'•')+'</i><b>'+esc(st.label)+'</b><span>'+esc(sub)+'</span></div>'});
      return h+'</div></div>';
    }catch{return typeof baseRenderLifecycleStepper==='function'?baseRenderLifecycleStepper(e):''}
  }
  function renderBankProfileSummarySemantic(e){
    if(!e)return'';
    try{
      const items=[];const add=(label,value,cls='')=>items.push({label,value,cls});
      add('Opened',e.opened?fD(e.opened):'Add date',e.opened?'':'warn');
      if(e.closed){
        add('Closed',fD(e.closed),'ok');
        add('Bonus',e.bonusRecd?((e.bonus?fM(e.bonus)+' · ':'')+fD(e.bonusRecd)):(e.bonus?fM(e.bonus):'Not saved'),e.bonusRecd?'ok':'');
        if(typeof isNonRepeatableEntry==='function'&&isNonRepeatableEntry(e))add('Archive','Non-repeatable offer','ok');
        else{const cr=typeof churnReadyDate==='function'?churnReadyDate(e):'';add('Next eligible',cr?fD(cr):'Waiting for close date',cr?'ok':'warn')}
      }else{
        add('Bonus',e.bonusRecd?((e.bonus?fM(e.bonus)+' · ':'')+fD(e.bonusRecd)):(e.bonus?fM(e.bonus)+' pending':'Pending'),e.bonusRecd?'ok':'warn');
        add('Requirement',requirementSummarySemantic(e),e.reqMet?'ok':'warn');
        const type=String(e.closeRestrictionType||e.analysis?.closeRestrictionType||'');
        const safe=typeof safeCloseDate==='function'?safeCloseDate(e):'';
        if(type==='payout-only')add('Earliest close',e.bonusRecd?'Bonus posted · close when ready':'After '+fM(e.bonus||0)+' posts',e.bonusRecd?'ok':'warn');
        else add('Earliest close',safe?fD(safe):'Review terms',safe&&typeof daysUntilSafe==='function'&&daysUntilSafe(e)<=0?'ok':safe?'warn':'bad');
      }
      return '<div class="profile-summary">'+items.map(x=>'<div class="profile-summary-item '+esc(x.cls||'')+'"><span>'+esc(x.label)+'</span><b>'+esc(x.value)+'</b></div>').join('')+'</div>';
    }catch{return typeof baseRenderBankProfileSummary==='function'?baseRenderBankProfileSummary(e):''}
  }
  function semanticStateForEntry(e){
    let raw='';try{raw=typeof status==='function'?status(e):''}catch{}
    const timer=nextTimer(e);
    const timerMeta=raw==='CUSTOM TIMER'?timerStatusMetaSemantic(e):displayMeta(raw,null);
    return{raw,kind:raw==='CUSTOM TIMER'?timerCategorySemantic(timer):'',label:timerMeta.label,timer,support:raw==='CUSTOM TIMER'?semanticTimerSupport(e):(typeof baseSupportLine==='function'?baseSupportLine(e,null):''),stage:lifecycleStageForEntry(e)};
  }
  function normalizeEntry(out){
    if(!out||typeof out!=='object')return out;
    out.customTimers=normalizeTimerListSemantic(out.customTimers||[]);
    return out;
  }
  function wrapEntryFunction(name,base){
    if(typeof base!=='function')return;
    const fn=function(){return normalizeEntry(base.apply(this,arguments))};
    fn.__btSemanticStatus=true;
    window[name]=fn;
    try{globalThis[name]=fn}catch{}
  }
  function wrapSuggested(){
    if(typeof baseSuggestedTimers!=='function')return;
    const fn=function(){return normalizeTimerListSemantic(baseSuggestedTimers.apply(this,arguments)||[])};
    fn.__btSemanticStatus=true;window.tcV3MakeSuggestedTimers=fn;
    try{tcV3MakeSuggestedTimers=fn}catch{}
  }
  function wrapHydrate(){
    if(typeof baseHydrateTimers!=='function')return;
    const fn=function(entry){const out=baseHydrateTimers.apply(this,arguments);normalizeEntry(entry);return out};
    fn.__btSemanticStatus=true;window.hydrateTimersFromOpened=fn;
    try{hydrateTimersFromOpened=fn}catch{}
  }
  function migrate(){
    try{
      if(typeof entries!=='undefined'&&Array.isArray(entries)){
        let changed=false;
        entries=entries.map(e=>{
          if(!e||typeof e!=='object')return e;
          const before=JSON.stringify(e.customTimers||[]);
          const next={...e,customTimers:normalizeTimerListSemantic(e.customTimers||[])};
          if(before!==JSON.stringify(next.customTimers))changed=true;
          return next;
        });
        if(changed&&typeof sv==='function'&&typeof SK!=='undefined')sv(SK,entries);
      }
    }catch{}
  }
  function install(){
    window.normalizeTimer=normalizeTimerSemantic;
    window.normalizeTimerList=normalizeTimerListSemantic;
    window.timerCategory=timerCategorySemantic;
    window.timerStatusMeta=timerStatusMetaSemantic;
    window.supportLine=supportLineSemantic;
    window.statusBadgeHtml=statusBadgeHtmlSemantic;
    window.requirementSummaryForEntry=requirementSummarySemantic;
    window.lifecycleSteps=lifecycleStepsSemantic;
    window.renderLifecycleStepper=renderLifecycleStepperSemantic;
    window.renderBankProfileSummary=renderBankProfileSummarySemantic;
    window.btSemanticStateForEntry=semanticStateForEntry;
    window.btSemanticTimerKind=timerCategorySemantic;
    window.btLifecycleStageForEntry=lifecycleStageForEntry;
    window.btLifecycleStageMeta=STAGE_META;
    window.btLifecycleStages=STAGES;
    window.btLifecycleStatusVersion=VER;
    window.btSemanticStatusVersion=VER;
    try{normalizeTimer=normalizeTimerSemantic}catch{}
    try{normalizeTimerList=normalizeTimerListSemantic}catch{}
    try{timerCategory=timerCategorySemantic}catch{}
    try{timerStatusMeta=timerStatusMetaSemantic}catch{}
    try{supportLine=supportLineSemantic}catch{}
    try{statusBadgeHtml=statusBadgeHtmlSemantic}catch{}
    try{requirementSummaryForEntry=requirementSummarySemantic}catch{}
    try{lifecycleSteps=lifecycleStepsSemantic}catch{}
    try{renderLifecycleStepper=renderLifecycleStepperSemantic}catch{}
    try{renderBankProfileSummary=renderBankProfileSummarySemantic}catch{}
    if(window.normalizeLifecycleEntry===baseNormalizeLifecycleEntry)wrapEntryFunction('normalizeLifecycleEntry',baseNormalizeLifecycleEntry);
    if(window.collectModalEntryData===baseCollectModalEntryData)wrapEntryFunction('collectModalEntryData',baseCollectModalEntryData);
    wrapSuggested();wrapHydrate();migrate();
  }
  function refresh(){migrate();try{if(typeof R==='function')R()}catch{}}
  install();
  setTimeout(refresh,180);
  setTimeout(refresh,1200);
})()
