/* Bonus Tracker v3.4.07 — archive closed non-repeatable offers without putting them in churn cooldown. */
(function(){
  'use strict';
  if(window.__btNonRepeatableArchiveLoaded)return;
  window.__btNonRepeatableArchiveLoaded=true;

  const VER='3.4.07';
  const bind=(name,fn)=>{window[name]=fn;try{globalThis[name]=fn}catch{}};
  const baseStatus=typeof window.status==='function'?window.status:null;
  const baseNextReopen=typeof window.nextReopen==='function'?window.nextReopen:null;
  const baseChurnReadyDate=typeof window.churnReadyDate==='function'?window.churnReadyDate:null;
  const baseDisplayStatusMeta=typeof window.displayStatusMeta==='function'?window.displayStatusMeta:null;
  const baseSupportLine=typeof window.supportLine==='function'?window.supportLine:null;
  const baseCloseReadiness=typeof window.closeReadiness==='function'?window.closeReadiness:null;
  const baseClosePlan=typeof window.closePlanForEntry==='function'?window.closePlanForEntry:null;
  const baseRenderPlan=typeof window.renderCleanPlanCard==='function'?window.renderCleanPlanCard:null;
  const baseNormalize=typeof window.normalizeLifecycleEntry==='function'?window.normalizeLifecycleEntry:null;
  const baseHealth=typeof window.getDataHealthIssues==='function'?window.getDataHealthIssues:null;
  const baseBackupIntegrity=typeof window.backupIntegrityReport==='function'?window.backupIntegrityReport:null;
  const baseCloseSafety=typeof window.closeSafetyWarnings==='function'?window.closeSafetyWarnings:null;
  const baseClosePreview=typeof window.closePreviewWarnings==='function'?window.closePreviewWarnings:null;

  function isNonRepeatable(e){
    if(!e)return false;
    try{if(typeof window.btIsNonRepeatable==='function'&&window.btIsNonRepeatable(e))return true}catch{}
    if(e.churnable===false||String(e.churnability||'').toLowerCase()==='not-repeatable')return true;
    const text=String([
      e.eligibilityText,e.analyzedTC,e.completeBonusText,e.notes,e.closeRuleText,
      e.analysis?.eligibilityText,e.analysis?.churnReason
    ].filter(Boolean).join(' '));
    return /(?:not eligible|ineligible)[^.]{0,220}(?:previously received|ever received|prior bonus)|(?:previously received|ever received)[^.]{0,220}(?:not eligible|ineligible)|once per lifetime|lifetime-like|not repeatable/i.test(text);
  }

  function normalizeArchivedEntry(e){
    const x=baseNormalize?baseNormalize(e):((e&&typeof e==='object')?{...e}:{});
    if(x?.closed&&isNonRepeatable(x)){
      x.lifecycleState='archived-nonrepeatable';
      x.archiveReason='Not repeatable under the saved eligibility terms';
    }else if(x?.lifecycleState==='archived-nonrepeatable'&&!isNonRepeatable(x)){
      delete x.lifecycleState;
      delete x.archiveReason;
    }
    return x;
  }

  function statusFixed(e){
    if(e?.closed&&isNonRepeatable(e))return'ARCHIVED';
    return baseStatus?baseStatus(e):'';
  }

  function nextReopenFixed(e){
    if(isNonRepeatable(e))return'';
    return baseNextReopen?baseNextReopen(e):'';
  }

  function churnReadyDateFixed(e){
    if(isNonRepeatable(e))return'';
    return baseChurnReadyDate?baseChurnReadyDate(e):'';
  }

  function displayStatusMetaFixed(raw){
    if(raw==='ARCHIVED'){
      const out=baseDisplayStatusMeta?baseDisplayStatusMeta(raw):{};
      return{...out,label:'Archived',cls:out?.cls||'w'};
    }
    return baseDisplayStatusMeta?baseDisplayStatusMeta(raw):{label:raw||'Status',cls:'w',icon:''};
  }

  function supportLineFixed(e,countdown){
    if(statusFixed(e)==='ARCHIVED')return'Closed • not repeatable';
    return baseSupportLine?baseSupportLine(e,countdown):'';
  }

  function closeReadinessFixed(e,closeDate=''){
    if(e?.closed&&isNonRepeatable(e))return{
      label:'Closed / Archived',cls:'done',archived:true,
      items:[
        {ok:true,label:'Closed date saved',detail:typeof fD==='function'?fD(e.closed):e.closed},
        {ok:true,label:'Future churn',detail:'Not repeatable under the saved eligibility terms'}
      ],warnings:[]
    };
    return baseCloseReadiness?baseCloseReadiness(e,closeDate):{label:'Manual Review',cls:'warn',items:[],warnings:[]};
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
    return baseClosePlan?baseClosePlan(e):null;
  }

  function renderClosePlanFixed(e){
    const plan=closePlanFixed(e);
    return baseRenderPlan?baseRenderPlan(plan):'';
  }

  function entryById(id){
    try{return typeof entries!=='undefined'&&Array.isArray(entries)?entries.find(e=>e&&e.id===id):null}catch{return null}
  }

  function healthFixed(){
    const list=baseHealth?baseHealth():[];
    return (list||[]).filter(issue=>{
      if(String(issue?.title||'').toLowerCase()!=='missing churn rule')return true;
      return !isNonRepeatable(entryById(issue.entryId));
    });
  }

  function backupIntegrityFixed(data){
    const report=baseBackupIntegrity?baseBackupIntegrity(data):{warnings:[]};
    const rows=Array.isArray(data?.entries)?data.entries:(typeof entries!=='undefined'&&Array.isArray(entries)?entries:[]);
    const warnings=(report.warnings||[]).filter(x=>!/closed entr(?:y|ies).*missing churn rule/i.test(String(x)));
    const missing=rows.filter(e=>e?.closed&&!e?.churn&&!isNonRepeatable(e)).length;
    if(missing)warnings.push(missing+' closed entr'+(missing===1?'y':'ies')+' missing churn rule');
    return{...report,warnings,ok:warnings.length===0};
  }

  function filterChurnWarning(base,e,args){
    const out=base?base.apply(null,args):[];
    if(!isNonRepeatable(e))return out||[];
    return (out||[]).filter(x=>!/churn rule|reopen countdown/i.test(String(x)));
  }

  function migrateExisting(){
    try{
      if(typeof entries==='undefined'||!Array.isArray(entries))return false;
      let changed=false;
      entries=entries.map(e=>{
        const x=normalizeArchivedEntry(e);
        if(x.lifecycleState!==e?.lifecycleState||x.archiveReason!==e?.archiveReason)changed=true;
        return x;
      });
      if(typeof sortE==='function')entries=sortE(entries);
      if(changed){
        if(typeof sv==='function'&&typeof SK!=='undefined')sv(SK,entries);
        else localStorage.setItem('bt_e_v4',JSON.stringify(entries));
      }
      return changed;
    }catch(err){console.error('Non-repeatable archive migration failed',err);return false}
  }

  bind('btIsArchivedNonRepeatable',isNonRepeatable);
  bind('normalizeLifecycleEntry',normalizeArchivedEntry);
  bind('normalizeLifecycleEntries',rows=>(rows||[]).map(normalizeArchivedEntry));
  bind('status',statusFixed);
  bind('nextReopen',nextReopenFixed);
  bind('churnReadyDate',churnReadyDateFixed);
  bind('displayStatusMeta',displayStatusMetaFixed);
  bind('supportLine',supportLineFixed);
  bind('closeReadiness',closeReadinessFixed);
  bind('closePlanForEntry',closePlanFixed);
  bind('renderClosePlan',renderClosePlanFixed);
  bind('getDataHealthIssues',healthFixed);
  bind('backupIntegrityReport',backupIntegrityFixed);
  if(baseCloseSafety)bind('closeSafetyWarnings',function(e,p){return filterChurnWarning(baseCloseSafety,e,[e,p])});
  if(baseClosePreview)bind('closePreviewWarnings',function(e,p){return filterChurnWarning(baseClosePreview,e,[e,p])});

  window.btNonRepeatableArchiveVersion=VER;
  migrateExisting();
  setTimeout(()=>{try{migrateExisting();if(typeof R==='function')R()}catch(err){console.error('Non-repeatable archive render failed',err)}},0);
})();
