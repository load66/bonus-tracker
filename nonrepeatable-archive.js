/* Bonus Tracker v3.4.07 — archive closed non-repeatable offers without putting them in churn cooldown. */
(function(){
  'use strict';
  if(window.__btNonRepeatableArchiveLoaded)return;
  window.__btNonRepeatableArchiveLoaded=true;

  const VER='3.4.07';
  const PATCH='archive2';
  const bind=(name,fn)=>{window[name]=fn;try{globalThis[name]=fn}catch{}};
  const baseStatus=typeof window.status==='function'?window.status:null;
  const baseNextReopen=typeof window.nextReopen==='function'?window.nextReopen:null;
  const baseChurnReadyDate=typeof window.churnReadyDate==='function'?window.churnReadyDate:null;
  const baseDisplayStatusMeta=typeof window.displayStatusMeta==='function'?window.displayStatusMeta:null;
  const baseSupportLine=typeof window.supportLine==='function'?window.supportLine:null;
  const baseCloseReadiness=typeof window.closeReadiness==='function'?window.closeReadiness:null;
  const baseClosePlan=typeof window.closePlanForEntry==='function'?window.closePlanForEntry:null;
  const baseRenderPlan=typeof window.renderCleanPlanCard==='function'?window.renderCleanPlanCard:null;
  const baseRenderProfileSummary=typeof window.renderBankProfileSummary==='function'?window.renderBankProfileSummary:null;
  const baseNormalize=typeof window.normalizeLifecycleEntry==='function'?window.normalizeLifecycleEntry:null;
  const baseHealth=typeof window.getDataHealthIssues==='function'?window.getDataHealthIssues:null;
  const baseBackupIntegrity=typeof window.backupIntegrityReport==='function'?window.backupIntegrityReport:null;
  const baseCloseSafety=typeof window.closeSafetyWarnings==='function'?window.closeSafetyWarnings:null;
  const baseClosePreview=typeof window.closePreviewWarnings==='function'?window.closePreviewWarnings:null;
  const baseIsNonRepeatable=typeof window.btIsNonRepeatable==='function'?window.btIsNonRepeatable:null;
  const baseCollectModalEntryData=typeof window.collectModalEntryData==='function'?window.collectModalEntryData:null;

  function clean(v){return String(v||'').replace(/\s+/g,' ').trim()}
  function knownNonRepeatableBank(e){
    const bank=clean(e?.bank);
    return /\bfour[\s-]*leaf\b/i.test(bank)
  }
  function timedCooldownSentence(s){
    return /(?:within|during|past|last|preceding|previous)\s+(?:the\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty[- ]?four|thirty[- ]?six)\s+(?:calendar\s+)?(?:months?|years?)/i.test(s)
      || /(?:\d+|one|two|three|four|five)\s+(?:months?|years?)\s+(?:before|prior|preceding)/i.test(s)
  }
  function lifetimeTextDetected(text){
    const raw=String(text||'');
    if(/once per lifetime|lifetime[- ]?like|not repeatable|one[- ]?time bonus only/i.test(raw))return true;
    return raw.split(/[.\n;]+/).some(sentence=>{
      const s=clean(sentence);
      if(!s||timedCooldownSentence(s))return false;
      return /(?:must not|may not|cannot|can't|not eligible|ineligible|have not|has not)[^.;]{0,220}(?:previously received|ever received|prior bonus|received[^.;]{0,80}(?:this|a|an|new account|checking account)[^.;]{0,60}bonus)/i.test(s)
        || /(?:previously received|ever received)[^.;]{0,180}(?:not eligible|ineligible|may not|cannot|can't)/i.test(s)
    })
  }
  function sourceText(e){
    const parts=[
      e?.eligibilityText,e?.analyzedTC,e?.completeBonusText,e?.notes,e?.closeRuleText,e?.churnReason,
      e?.analysis?.eligibilityText,e?.analysis?.churnReason,e?.analysis?.rawText,
      e?.reusableChurnProfile?.eligibility,e?.profile?.eligibilityText,e?.profile?.churnReason
    ];
    try{if(Array.isArray(e?.analyzerHistory))parts.push(JSON.stringify(e.analyzerHistory.slice(-4)))}catch{}
    return parts.filter(Boolean).join(' ')
  }
  function explicitlyRepeatable(e){
    return e?.churnable===true||/^(?:repeatable|churnable)$/i.test(clean(e?.churnability))
  }
  function isNonRepeatable(e){
    if(!e)return false;
    if(explicitlyRepeatable(e))return false;
    if(e.lifecycleState==='archived-nonrepeatable')return true;
    if(e.churnable===false||clean(e.churnability).toLowerCase()==='not-repeatable')return true;
    try{if(baseIsNonRepeatable&&baseIsNonRepeatable(e))return true}catch{}
    if(lifetimeTextDetected(sourceText(e)))return true;
    return knownNonRepeatableBank(e)
  }
  function markNonRepeatable(target,reason=''){
    if(!target||!isNonRepeatable(target))return target;
    target.churnable=false;
    target.churnability='not-repeatable';
    target.churnReason=clean(reason||target.churnReason||target.analysis?.churnReason||'Not repeatable under the saved eligibility terms');
    target.churn='';
    return target
  }
  function currentModal(){
    try{return typeof modal!=='undefined'?modal:(window.modal||null)}catch{return window.modal||null}
  }
  function carryAnalyzerFlags(target){
    if(!target)return target;
    const m=currentModal();
    const sources=[m,m?.analysis,window.__tcV3AnalysisResult,window.__tcCurrentAnalysisResult].filter(Boolean);
    const src=sources.find(x=>isNonRepeatable(x));
    if(src){
      target.churnable=false;
      target.churnability='not-repeatable';
      target.churnReason=clean(src.churnReason||src.analysis?.churnReason||target.churnReason||'Not repeatable under the analyzed eligibility terms');
      target.churn='';
    }
    return markNonRepeatable(target)
  }

  function normalizeArchivedEntry(e){
    const x=baseNormalize?baseNormalize(e):((e&&typeof e==='object')?{...e}:{});
    markNonRepeatable(x);
    if(x?.closed&&isNonRepeatable(x)){
      x.lifecycleState='archived-nonrepeatable';
      x.archiveReason='Not repeatable under the saved eligibility terms';
    }else if(x?.lifecycleState==='archived-nonrepeatable'&&!isNonRepeatable(x)){
      delete x.lifecycleState;
      delete x.archiveReason;
    }
    return x
  }

  function statusFixed(e){
    if(e?.closed&&isNonRepeatable(e))return'ARCHIVED';
    return baseStatus?baseStatus(e):''
  }
  function nextReopenFixed(e){
    if(isNonRepeatable(e))return'';
    return baseNextReopen?baseNextReopen(e):''
  }
  function churnReadyDateFixed(e){
    if(isNonRepeatable(e))return'';
    return baseChurnReadyDate?baseChurnReadyDate(e):''
  }
  function displayStatusMetaFixed(raw){
    if(raw==='ARCHIVED'){
      const out=baseDisplayStatusMeta?baseDisplayStatusMeta(raw):{};
      return{...out,label:'Archived',cls:out?.cls||'w'}
    }
    return baseDisplayStatusMeta?baseDisplayStatusMeta(raw):{label:raw||'Status',cls:'w',icon:''}
  }
  function supportLineFixed(e,countdown){
    if(statusFixed(e)==='ARCHIVED')return'Closed • not repeatable';
    return baseSupportLine?baseSupportLine(e,countdown):''
  }
  function closeReadinessFixed(e,closeDate=''){
    if(e?.closed&&isNonRepeatable(e))return{
      label:'Closed / Archived',cls:'done',archived:true,
      items:[
        {ok:true,label:'Closed date saved',detail:typeof fD==='function'?fD(e.closed):e.closed},
        {ok:true,label:'Future churn',detail:'Not repeatable under the saved eligibility terms'}
      ],warnings:[]
    };
    return baseCloseReadiness?baseCloseReadiness(e,closeDate):{label:'Manual Review',cls:'warn',items:[],warnings:[]}
  }
  function closePlanFixed(e){
    if(e?.closed&&isNonRepeatable(e))return{
      title:'Close Check',sub:'Closure saved',chip:'Archived',cls:'done',compact:true,
      rows:[
        {label:'Closed',value:typeof fD==='function'?fD(e.closed):e.closed,cls:'ok'},
        {label:'Future churn',value:'Not repeatable',cls:'ok'}
      ],
      notes:['The record stays in bank history but is excluded from cooldown and ready-to-churn lists.']
    };
    return baseClosePlan?baseClosePlan(e):null
  }
  function renderClosePlanFixed(e){
    const plan=closePlanFixed(e);
    return baseRenderPlan?baseRenderPlan(plan):''
  }
  function renderProfileSummaryFixed(e){
    if(!(e?.closed&&isNonRepeatable(e)))return baseRenderProfileSummary?baseRenderProfileSummary(e):'';
    const fmtDate=d=>typeof fD==='function'?fD(d):d;
    const fmtMoney=n=>typeof fM==='function'?fM(n):'$'+Number(n||0).toLocaleString();
    const escHtml=v=>{try{return typeof esc==='function'?esc(String(v??'')):String(v??'')}catch{return String(v??'')}};
    const bonus=e.bonusRecd?((e.bonus?fmtMoney(e.bonus)+' · ':'')+fmtDate(e.bonusRecd)):(e.bonus?fmtMoney(e.bonus):'Not saved');
    const rows=[
      ['Opened',e.opened?fmtDate(e.opened):'Add date',e.opened?'':'warn'],
      ['Closed',fmtDate(e.closed),'ok'],
      ['Bonus',bonus,e.bonusRecd?'ok':''],
      ['Future churn','Not repeatable','ok']
    ];
    return '<div class="profile-summary">'+rows.map(x=>'<div class="profile-summary-item '+escHtml(x[2])+'"><span>'+escHtml(x[0])+'</span><b>'+escHtml(x[1])+'</b></div>').join('')+'</div>'
  }

  function entryById(id){
    try{return typeof entries!=='undefined'&&Array.isArray(entries)?entries.find(e=>e&&e.id===id):null}catch{return null}
  }
  function healthFixed(){
    const list=baseHealth?baseHealth():[];
    return (list||[]).filter(issue=>{
      if(String(issue?.title||'').toLowerCase()!=='missing churn rule')return true;
      return !isNonRepeatable(entryById(issue.entryId))
    })
  }
  function backupIntegrityFixed(data){
    const report=baseBackupIntegrity?baseBackupIntegrity(data):{warnings:[]};
    const rows=Array.isArray(data?.entries)?data.entries:(typeof entries!=='undefined'&&Array.isArray(entries)?entries:[]);
    const warnings=(report.warnings||[]).filter(x=>!/closed entr(?:y|ies).*missing churn rule/i.test(String(x)));
    const missing=rows.filter(e=>e?.closed&&!e?.churn&&!isNonRepeatable(e)).length;
    if(missing)warnings.push(missing+' closed entr'+(missing===1?'y':'ies')+' missing churn rule');
    return{...report,warnings,ok:warnings.length===0}
  }
  function filterChurnWarning(base,e,args){
    const out=base?base.apply(null,args):[];
    if(!isNonRepeatable(e))return out||[];
    return (out||[]).filter(x=>!/churn rule|reopen countdown/i.test(String(x)))
  }
  function migrateExisting(){
    try{
      if(typeof entries==='undefined'||!Array.isArray(entries))return false;
      let changed=false;
      entries=entries.map(e=>{
        const x=normalizeArchivedEntry(e);
        if(x.lifecycleState!==e?.lifecycleState||x.archiveReason!==e?.archiveReason||x.churnable!==e?.churnable||x.churnability!==e?.churnability||x.churn!==e?.churn)changed=true;
        return x
      });
      if(typeof sortE==='function')entries=sortE(entries);
      if(changed){
        if(typeof sv==='function'&&typeof SK!=='undefined')sv(SK,entries);
        else localStorage.setItem('bt_e_v4',JSON.stringify(entries))
      }
      return changed
    }catch(err){console.error('Non-repeatable archive migration failed',err);return false}
  }

  bind('btIsNonRepeatable',isNonRepeatable);
  bind('btIsArchivedNonRepeatable',isNonRepeatable);
  bind('normalizeLifecycleEntry',normalizeArchivedEntry);
  bind('normalizeLifecycleEntries',rows=>(rows||[]).map(normalizeArchivedEntry));
  if(baseCollectModalEntryData)bind('collectModalEntryData',function(){return carryAnalyzerFlags(baseCollectModalEntryData.apply(this,arguments))});
  bind('status',statusFixed);
  bind('nextReopen',nextReopenFixed);
  bind('churnReadyDate',churnReadyDateFixed);
  bind('displayStatusMeta',displayStatusMetaFixed);
  bind('supportLine',supportLineFixed);
  bind('closeReadiness',closeReadinessFixed);
  bind('closePlanForEntry',closePlanFixed);
  bind('renderClosePlan',renderClosePlanFixed);
  bind('renderBankProfileSummary',renderProfileSummaryFixed);
  bind('getDataHealthIssues',healthFixed);
  bind('backupIntegrityReport',backupIntegrityFixed);
  if(baseCloseSafety)bind('closeSafetyWarnings',function(e,p){return filterChurnWarning(baseCloseSafety,e,[e,p])});
  if(baseClosePreview)bind('closePreviewWarnings',function(e,p){return filterChurnWarning(baseClosePreview,e,[e,p])});

  window.btNonRepeatableArchiveVersion=VER;
  window.btNonRepeatableArchivePatch=PATCH;
  migrateExisting();
  setTimeout(()=>{try{migrateExisting();if(typeof R==='function')R()}catch(err){console.error('Non-repeatable archive render failed',err)}},0);
})();
