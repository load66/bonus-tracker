/* Bonus Tracker v3.4.08 archive4 — Safari-safe archived lifecycle for non-repeatable offers. */
(function(){
  'use strict';
  if(window.__btNonRepeatableArchive4Loaded)return;
  window.__btNonRepeatableArchive4Loaded=true;

  const VER='3.4.08',PATCH='archive4';
  const original={
    status:typeof status==='function'?status:null,
    nextReopen:typeof nextReopen==='function'?nextReopen:null,
    churnReadyDate:typeof churnReadyDate==='function'?churnReadyDate:null,
    displayStatusMeta:typeof displayStatusMeta==='function'?displayStatusMeta:null,
    supportLine:typeof supportLine==='function'?supportLine:null,
    closeReadiness:typeof closeReadiness==='function'?closeReadiness:null,
    closePlanForEntry:typeof closePlanForEntry==='function'?closePlanForEntry:null,
    renderCleanPlanCard:typeof renderCleanPlanCard==='function'?renderCleanPlanCard:null,
    renderBankProfileSummary:typeof renderBankProfileSummary==='function'?renderBankProfileSummary:null,
    normalizeLifecycleEntry:typeof normalizeLifecycleEntry==='function'?normalizeLifecycleEntry:null,
    lifecycleSteps:typeof lifecycleSteps==='function'?lifecycleSteps:null,
    finishClose:typeof finishClose==='function'?finishClose:null,
    startNewCycle:typeof startNewCycle==='function'?startNewCycle:null,
    getDataHealthIssues:typeof getDataHealthIssues==='function'?getDataHealthIssues:null,
    backupIntegrityReport:typeof backupIntegrityReport==='function'?backupIntegrityReport:null,
    closeSafetyWarnings:typeof closeSafetyWarnings==='function'?closeSafetyWarnings:null,
    closePreviewWarnings:typeof closePreviewWarnings==='function'?closePreviewWarnings:null,
    collectModalEntryData:typeof collectModalEntryData==='function'?collectModalEntryData:null,
    btIsNonRepeatable:typeof window.btIsNonRepeatable==='function'?window.btIsNonRepeatable:null
  };

  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const formatDate=d=>{try{return typeof fD==='function'?fD(d):d}catch{return d||'—'}};

  function timedCooldownSentence(s){
    return /(?:within|during|past|last|preceding|previous)\s+(?:the\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty[- ]?four|thirty[- ]?six)\s+(?:calendar\s+)?(?:months?|years?)/i.test(s)
      || /(?:\d+|one|two|three|four|five)\s+(?:months?|years?)\s+(?:before|prior|preceding)/i.test(s);
  }

  function sourceText(e){
    const parts=[e?.eligibilityText,e?.analyzedTC,e?.completeBonusText,e?.notes,e?.closeRuleText,e?.churnReason,
      e?.analysis?.eligibilityText,e?.analysis?.churnReason,e?.analysis?.rawText,
      e?.reusableChurnProfile?.eligibility,e?.profile?.eligibilityText,e?.profile?.churnReason];
    try{if(Array.isArray(e?.analyzerHistory))parts.push(JSON.stringify(e.analyzerHistory.slice(-4)))}catch{}
    return parts.filter(Boolean).join(' ');
  }

  function lifetimeTextDetected(text){
    const raw=String(text||'');
    if(/once per lifetime|lifetime[- ]?like|not repeatable|one[- ]?time bonus only/i.test(raw))return true;
    return raw.split(/[.\n;]+/).some(sentence=>{
      const s=clean(sentence);
      if(!s||timedCooldownSentence(s))return false;
      return /(?:must not|may not|cannot|can't|not eligible|ineligible|have not|has not)[^.;]{0,220}(?:previously received|ever received|prior bonus|received[^.;]{0,80}(?:this|a|an|new account|checking account)[^.;]{0,60}bonus)/i.test(s)
        || /(?:previously received|ever received)[^.;]{0,180}(?:not eligible|ineligible|may not|cannot|can't)/i.test(s);
    });
  }

  function knownNonRepeatableBank(e){
    const bank=clean((e&&e.bank)||e||'');
    return /\bfour[\s-]*leaf\b/i.test(bank);
  }

  function isNonRepeatable(e){
    if(!e)return false;
    if(e.churnable===true||/^(?:repeatable|churnable)$/i.test(clean(e.churnability)))return false;
    if(e.lifecycleState==='archived-nonrepeatable'||e.churnable===false||clean(e.churnability).toLowerCase()==='not-repeatable')return true;
    try{if(original.btIsNonRepeatable&&original.btIsNonRepeatable(e))return true}catch{}
    if(lifetimeTextDetected(sourceText(e)))return true;
    return knownNonRepeatableBank(e);
  }

  function markNonRepeatable(x){
    if(!x||!isNonRepeatable(x))return x;
    x.churnable=false;
    x.churnability='not-repeatable';
    x.churnReason=clean(x.churnReason||x.analysis?.churnReason||'Not repeatable under the saved eligibility terms');
    x.churn='';
    if(x.closed){
      x.lifecycleState='archived-nonrepeatable';
      x.archived=true;
      x.archivedAt=x.archivedAt||x.closed;
      x.archiveReason=x.churnReason;
    }
    return x;
  }

  function normalizeFixed(e){
    const x=original.normalizeLifecycleEntry?original.normalizeLifecycleEntry(e):((e&&typeof e==='object')?{...e}:{});
    return markNonRepeatable(x);
  }

  function statusFixed(e){
    if(e?.closed&&isNonRepeatable(e))return'ARCHIVED';
    return original.status?original.status(e):'';
  }
  function nextReopenFixed(e){return isNonRepeatable(e)?'':(original.nextReopen?original.nextReopen(e):'')}
  function churnReadyDateFixed(e){return isNonRepeatable(e)?'':(original.churnReadyDate?original.churnReadyDate(e):'')}

  function displayStatusMetaFixed(raw){
    if(raw==='ARCHIVED')return{label:'Archived',cls:'w',icon:typeof I!=='undefined'?I.doc:''};
    return original.displayStatusMeta?original.displayStatusMeta(raw):{label:raw||'Status',cls:'w',icon:''};
  }
  function supportLineFixed(e,countdown){
    if(statusFixed(e)==='ARCHIVED')return'Closed • not repeatable';
    return original.supportLine?original.supportLine(e,countdown):'';
  }

  function closeReadinessFixed(e,closeDate=''){
    if(e?.closed&&isNonRepeatable(e))return{label:'Closed / Archived',cls:'done',archived:true,warnings:[],items:[
      {ok:true,label:'Closed date saved',detail:formatDate(e.closed)},
      {ok:true,label:'Archive status',detail:'Not repeatable under the saved eligibility terms'}
    ]};
    return original.closeReadiness?original.closeReadiness(e,closeDate):{label:'Manual Review',cls:'warn',items:[],warnings:[]};
  }

  function closePlanFixed(e){
    if(e?.closed&&isNonRepeatable(e))return{title:'Archive',sub:'Closed record saved',chip:'Archived',cls:'done',compact:true,
      rows:[{label:'Closed',value:formatDate(e.closed),cls:'ok'},{label:'Archive',value:'Non-repeatable offer',cls:'ok'}],
      notes:['This record stays in history and is excluded from cooldown and ready-to-churn lists.']};
    return original.closePlanForEntry?original.closePlanForEntry(e):null;
  }
  function renderClosePlanFixed(e){return original.renderCleanPlanCard?original.renderCleanPlanCard(closePlanFixed(e)):''}

  function renderProfileSummaryFixed(e){
    if(!(e?.closed&&isNonRepeatable(e)))return original.renderBankProfileSummary?original.renderBankProfileSummary(e):'';
    const bonus=e.bonusRecd?((e.bonus&&typeof fM==='function'?fM(e.bonus)+' · ':'')+formatDate(e.bonusRecd)):(e.bonus&&typeof fM==='function'?fM(e.bonus):'Not saved');
    const rows=[['Opened',e.opened?formatDate(e.opened):'Add date',''],['Closed',formatDate(e.closed),'ok'],['Bonus',bonus,e.bonusRecd?'ok':''],['Archive','Non-repeatable offer','ok']];
    const escape=v=>{try{return typeof esc==='function'?esc(String(v??'')):String(v??'')}catch{return String(v??'')}};
    return '<div class="profile-summary">'+rows.map(x=>'<div class="profile-summary-item '+escape(x[2])+'"><span>'+escape(x[0])+'</span><b>'+escape(x[1])+'</b></div>').join('')+'</div>';
  }

  function lifecycleStepsFixed(e){
    const steps=original.lifecycleSteps?original.lifecycleSteps(e):[];
    if(!(e?.closed&&isNonRepeatable(e)))return steps;
    return (steps||[]).filter(x=>x?.key!=='churn').concat({key:'archive',label:'Archived',done:true,date:e.closed||'',planned:false});
  }

  function startNewCycleFixed(id){
    let e=null;try{e=Array.isArray(entries)?entries.find(x=>x&&x.id===id):null}catch{}
    if(e&&isNonRepeatable(e)){
      const msg='This offer is non-repeatable. The closed record stays archived and cannot start another churn cycle.';
      try{if(typeof window.btNotify==='function')window.btNotify(msg,'info',4200);else alert(msg)}catch{}
      return;
    }
    return original.startNewCycle?original.startNewCycle.apply(this,arguments):undefined;
  }

  function finishCloseFixed(){
    let id='';try{id=closePrompt?.entryId||''}catch{}
    const out=original.finishClose?original.finishClose.apply(this,arguments):undefined;
    try{
      if(!id||typeof entries==='undefined'||!Array.isArray(entries))return out;
      const idx=entries.findIndex(x=>x&&x.id===id);
      if(idx<0)return out;
      const entry=normalizeFixed(entries[idx]);
      if(!(entry.closed&&isNonRepeatable(entry)))return out;
      entries[idx]=entry;
      if(typeof sv==='function'&&typeof SK!=='undefined')sv(SK,entries);
      if(typeof cfm!=='undefined'&&cfm){
        cfm={...cfm,title:'Closed & Archived',msg:`${entry.bank} closed on ${formatDate(entry.closed)}.\n\nArchive status: Non-repeatable offer.\nNo churn countdown or reopen date was created.\n\nUndo is available for 60 seconds at the bottom of the app.`};
      }
      if(typeof R==='function')R();
    }catch(err){console.error('Archive4 close finalization failed',err)}
    return out;
  }

  function entryById(id){try{return Array.isArray(entries)?entries.find(e=>e&&e.id===id):null}catch{return null}}
  function healthFixed(){
    const list=original.getDataHealthIssues?original.getDataHealthIssues():[];
    return (list||[]).filter(issue=>String(issue?.title||'').toLowerCase()!=='missing churn rule'||!isNonRepeatable(entryById(issue.entryId)));
  }
  function backupIntegrityFixed(data){
    const report=original.backupIntegrityReport?original.backupIntegrityReport(data):{warnings:[]};
    const rows=Array.isArray(data?.entries)?data.entries:(typeof entries!=='undefined'&&Array.isArray(entries)?entries:[]);
    const warnings=(report.warnings||[]).filter(x=>!/closed entr(?:y|ies).*missing churn rule/i.test(String(x)));
    const missing=rows.filter(e=>e?.closed&&!e?.churn&&!isNonRepeatable(e)).length;
    if(missing)warnings.push(missing+' closed entr'+(missing===1?'y':'ies')+' missing churn rule');
    return{...report,warnings,ok:warnings.length===0};
  }
  function filterChurnWarnings(base,e,args){
    const out=base?base.apply(null,args):[];
    return isNonRepeatable(e)?(out||[]).filter(x=>!/churn rule|reopen countdown/i.test(String(x))):(out||[]);
  }

  function collectModalEntryDataFixed(){
    const out=original.collectModalEntryData?original.collectModalEntryData.apply(this,arguments):null;
    if(!out)return out;
    try{
      const m=typeof modal!=='undefined'?modal:window.modal;
      if(m){
        if(m.churnable===false)out.churnable=false;
        if(m.churnability)out.churnability=m.churnability;
        if(m.churnReason)out.churnReason=m.churnReason;
        if(m.analysis?.churnable===false)out.churnable=false;
        if(m.analysis?.churnability)out.churnability=m.analysis.churnability;
        if(m.analysis?.churnReason)out.churnReason=m.analysis.churnReason;
      }
    }catch{}
    return markNonRepeatable(out);
  }

  function replaceGlobalBindings(){
    /* Bare assignments are intentional. Safari exposes window.status as a DOMString,
       so window.status = fn does not replace the tracker’s global status() binding. */
    try{status=statusFixed}catch{}
    try{nextReopen=nextReopenFixed}catch{}
    try{churnReadyDate=churnReadyDateFixed}catch{}
    try{displayStatusMeta=displayStatusMetaFixed}catch{}
    try{supportLine=supportLineFixed}catch{}
    try{closeReadiness=closeReadinessFixed}catch{}
    try{closePlanForEntry=closePlanFixed}catch{}
    try{renderClosePlan=renderClosePlanFixed}catch{}
    try{renderBankProfileSummary=renderProfileSummaryFixed}catch{}
    try{normalizeLifecycleEntry=normalizeFixed}catch{}
    try{normalizeLifecycleEntries=rows=>(rows||[]).map(normalizeFixed)}catch{}
    try{lifecycleSteps=lifecycleStepsFixed}catch{}
    try{if(original.finishClose)finishClose=finishCloseFixed}catch{}
    try{if(original.startNewCycle)startNewCycle=startNewCycleFixed}catch{}
    try{getDataHealthIssues=healthFixed}catch{}
    try{backupIntegrityReport=backupIntegrityFixed}catch{}
    try{if(original.closeSafetyWarnings)closeSafetyWarnings=function(e,p){return filterChurnWarnings(original.closeSafetyWarnings,e,[e,p])}}catch{}
    try{if(original.closePreviewWarnings)closePreviewWarnings=function(e,p){return filterChurnWarnings(original.closePreviewWarnings,e,[e,p])}}catch{}
    try{if(original.collectModalEntryData)collectModalEntryData=collectModalEntryDataFixed}catch{}

    window.nextReopen=nextReopenFixed;
    window.churnReadyDate=churnReadyDateFixed;
    window.displayStatusMeta=displayStatusMetaFixed;
    window.supportLine=supportLineFixed;
    window.closeReadiness=closeReadinessFixed;
    window.closePlanForEntry=closePlanFixed;
    window.renderClosePlan=renderClosePlanFixed;
    window.renderBankProfileSummary=renderProfileSummaryFixed;
    window.normalizeLifecycleEntry=normalizeFixed;
    window.normalizeLifecycleEntries=rows=>(rows||[]).map(normalizeFixed);
    window.lifecycleSteps=lifecycleStepsFixed;
    if(original.finishClose)window.finishClose=finishCloseFixed;
    if(original.startNewCycle)window.startNewCycle=startNewCycleFixed;
    window.getDataHealthIssues=healthFixed;
    window.backupIntegrityReport=backupIntegrityFixed;
    window.collectModalEntryData=collectModalEntryDataFixed;
  }

  function migrateExisting(){
    try{
      if(typeof entries==='undefined'||!Array.isArray(entries))return false;
      let changed=false;
      entries=entries.map(e=>{
        const before=JSON.stringify([e?.churnable,e?.churnability,e?.churn,e?.lifecycleState,e?.archived,e?.archivedAt,e?.archiveReason]);
        const x=normalizeFixed(e);
        const after=JSON.stringify([x?.churnable,x?.churnability,x?.churn,x?.lifecycleState,x?.archived,x?.archivedAt,x?.archiveReason]);
        if(before!==after)changed=true;
        return x;
      });
      if(typeof sortE==='function')entries=sortE(entries);
      if(changed){if(typeof sv==='function'&&typeof SK!=='undefined')sv(SK,entries);else localStorage.setItem('bt_e_v4',JSON.stringify(entries))}
      return changed;
    }catch(err){console.error('Archive4 migration failed',err);return false}
  }

  window.btKnownNonRepeatableBank=knownNonRepeatableBank;
  window.btIsArchivedNonRepeatable=isNonRepeatable;
  window.btNonRepeatableArchiveVersion=VER;
  window.btNonRepeatableArchivePatch=PATCH;
  window.BT_APP_VERSION=VER;
  replaceGlobalBindings();
  migrateExisting();
  setTimeout(()=>{try{replaceGlobalBindings();migrateExisting();if(typeof R==='function')R()}catch(err){console.error('Archive4 render failed',err)}},0);
})();
