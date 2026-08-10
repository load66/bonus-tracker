/* BonusTracker v3.4.14 semantic-status patch — one canonical timer category and status label for every bank. */
(function(){
  'use strict';
  const VER='3.4.14-semantic1';
  const VALID=new Set(['requirement','funding','hold','payout','openby','close-review','custom']);
  const baseNormalizeTimer=window.normalizeTimer;
  const baseNormalizeTimerList=window.normalizeTimerList;
  const baseTimerCategory=window.timerCategory;
  const baseTimerStatusMeta=window.timerStatusMeta;
  const baseSupportLine=window.supportLine;
  const baseStatusBadgeHtml=window.statusBadgeHtml;
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
    try{
      if(typeof baseTimerCategory==='function'){
        const k=String(baseTimerCategory(t)||'').toLowerCase().trim();
        if(VALID.has(k))return k;
        if(k==='close')return'close-review';
      }
    }catch{}
    const s=String([t.text,t.label,t.name,t.source].filter(Boolean).join(' ')).toLowerCase().replace(/\s+/g,' ');
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
    window.btSemanticStateForEntry=semanticStateForEntry;
    window.btSemanticTimerKind=timerCategorySemantic;
    window.btSemanticStatusVersion=VER;
    try{normalizeTimer=normalizeTimerSemantic}catch{}
    try{normalizeTimerList=normalizeTimerListSemantic}catch{}
    try{timerCategory=timerCategorySemantic}catch{}
    try{timerStatusMeta=timerStatusMetaSemantic}catch{}
    try{supportLine=supportLineSemantic}catch{}
    try{statusBadgeHtml=statusBadgeHtmlSemantic}catch{}
    if(window.normalizeLifecycleEntry===baseNormalizeLifecycleEntry)wrapEntryFunction('normalizeLifecycleEntry',baseNormalizeLifecycleEntry);
    if(window.collectModalEntryData===baseCollectModalEntryData)wrapEntryFunction('collectModalEntryData',baseCollectModalEntryData);
    wrapSuggested();wrapHydrate();migrate();
  }
  install();
  setTimeout(migrate,250);
  setTimeout(migrate,1200);
})();
