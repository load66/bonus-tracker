/* BonusTracker v3.4.14 semantic-status patch — one canonical timer category and status label for every bank. */
(function(){
  'use strict';
  const VER='3.4.14-semantic1';
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
  function supportLineSemantic(e,countdown){
    let raw='';try{raw=typeof status==='function'?status(e):''}catch{}
    if(raw==='CUSTOM TIMER')return semanticTimerSupport(e);
    if(typeof baseSupportLine==='function'){
      try{return baseSupportLine(e,countdown)}catch{}
    }
    return'';
  }
  function displayMeta(raw,e){
    if(raw==='CUSTOM TIMER')return timerStatusMetaSemantic(e);
    try{if(typeof window.displayStatusMeta==='function')return window.displayStatusMeta(raw)}catch{}
    return{label:raw||'Status',cls:'w',icon:''};
  }
  function statusBadgeHtmlSemantic(e,countdown){
    let raw='';try{raw=typeof status==='function'?status(e):''}catch{}
    const meta=displayMeta(raw,e),support=supportLineSemantic(e,countdown);
    try{return'<span class="badge '+meta.cls+'">'+(meta.icon||'')+'<span>'+esc(meta.label)+'</span></span>'+(support?'<div class="card-subline">'+esc(support)+'</div>':'')}catch{}
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
    return{raw,kind:raw==='CUSTOM TIMER'?timerCategorySemantic(timer):'',label:displayMeta(raw,e).label,timer,support:supportLineSemantic(e,null)};
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
})();
