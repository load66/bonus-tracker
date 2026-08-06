/* Bonus Tracker Archive Rules v3.4.08 — closed non-repeatable/no-churn offers become archived records. */
(function(){
  'use strict';
  const VER='3.4.08',SCHEMA_KEY='bt_archive_schema_version',SCHEMA=1;
  const escFn=v=>{try{return esc(String(v??''))}catch{const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML}};
  const fmtDate=d=>{try{return typeof fD==='function'?fD(d):String(d||'')}catch{return String(d||'')}};
  const fmtMoney=n=>{try{return typeof fM==='function'?fM(n):'$'+Number(n||0).toLocaleString()}catch{return'$'+Number(n||0).toLocaleString()}};
  function bind(name,fn){window[name]=fn;try{globalThis[name]=fn}catch{}}

  function isNonRepeatable(e){
    try{if(typeof window.btIsNonRepeatable==='function')return !!window.btIsNonRepeatable(e)}catch{}
    if(e?.churnable===false||String(e?.churnability||'').toLowerCase()==='not-repeatable')return true;
    const s=String([e?.eligibilityText,e?.analyzedTC,e?.completeBonusText].filter(Boolean).join(' '));
    return /(?:not eligible|ineligible)[^.]{0,180}(?:previously received|ever received|prior bonus)|(?:previously received|ever received)[^.]{0,180}(?:not eligible|ineligible)|once per lifetime|lifetime-like/i.test(s);
  }
  function archiveReason(e){
    if(isNonRepeatable(e))return'Offer is not repeatable under the saved eligibility terms';
    if(!String(e?.churn||'').trim())return'No future churn cycle is saved';
    return String(e?.archiveReason||'Closed record archived');
  }
  function shouldArchive(e){
    return !!(e?.closed&&(e?.archived===true||isNonRepeatable(e)||!String(e?.churn||'').trim()));
  }

  const oldNormalize=typeof window.normalizeLifecycleEntry==='function'?window.normalizeLifecycleEntry:null;
  function normalizeArchiveEntry(e){
    const x=oldNormalize?oldNormalize(e):((e&&typeof e==='object')?{...e}:{});
    const nonRepeatable=isNonRepeatable(x);
    if(nonRepeatable){
      x.churn='';
      x.churnable=false;
      x.churnability='not-repeatable';
    }
    if(x.closed&&(x.archived===true||nonRepeatable||!String(x.churn||'').trim())){
      x.archived=true;
      x.archivedAt=x.archivedAt||x.closed;
      x.archiveReason=archiveReason(x);
    }else if(!x.closed){
      x.archived=false;
      x.archivedAt='';
      x.archiveReason='';
    }
    return x;
  }
  bind('normalizeLifecycleEntry',normalizeArchiveEntry);
  bind('normalizeLifecycleEntries',rows=>(rows||[]).map(normalizeArchiveEntry));

  const oldStatus=typeof window.status==='function'?window.status:null;
  function archiveStatus(e){
    if(!e||!e.bank)return'';
    if(shouldArchive(e))return'ARCHIVED';
    return oldStatus?oldStatus(e):'';
  }
  bind('status',archiveStatus);

  const oldStatusBadge=typeof window.statusBadgeHtml==='function'?window.statusBadgeHtml:null;
  if(oldStatusBadge)bind('statusBadgeHtml',function(e,countdown){
    if(shouldArchive(e)){
      let icon='';try{icon=typeof I!=='undefined'&&I.doc?I.doc:''}catch{}
      const support=isNonRepeatable(e)?'Closed · not repeatable':'Closed · no churn countdown';
      return '<span class="badge wt">'+icon+'<span>Archived</span></span><div class="card-subline">'+escFn(support)+'</div>';
    }
    return oldStatusBadge(e,countdown);
  });

  const oldReadiness=typeof window.closeReadiness==='function'?window.closeReadiness:null;
  if(oldReadiness)bind('closeReadiness',function(e,closeDate=''){
    if(shouldArchive(e))return{label:'Closed / Archived',cls:'done',items:[{ok:true,label:'Closed date saved',detail:fmtDate(e.closed)},{ok:true,label:'Archive status',detail:archiveReason(e)}],warnings:[],safeDate:'',rawDate:'',basis:''};
    return oldReadiness(e,closeDate);
  });

  const oldClosePlan=typeof window.closePlanForEntry==='function'?window.closePlanForEntry:null;
  if(oldClosePlan)bind('closePlanForEntry',function(e){
    if(shouldArchive(e))return{title:'Archive',sub:'Closed record saved',chip:'Archived',cls:'done',rows:[{label:'Closed',value:fmtDate(e.closed),cls:'ok'},{label:'Archive',value:archiveReason(e),cls:'ok'}],notes:['No churn countdown was created.'],compact:true};
    return oldClosePlan(e);
  });
  bind('renderClosePlan',e=>typeof window.renderCleanPlanCard==='function'?window.renderCleanPlanCard(window.closePlanForEntry(e)):'' );

  const oldProfileSummary=typeof window.renderBankProfileSummary==='function'?window.renderBankProfileSummary:null;
  if(oldProfileSummary)bind('renderBankProfileSummary',function(e){
    if(!shouldArchive(e))return oldProfileSummary(e);
    const items=[
      ['Opened',e.opened?fmtDate(e.opened):'Not saved',e.opened?'':'warn'],
      ['Closed',fmtDate(e.closed),'ok'],
      ['Bonus',e.bonusRecd?((e.bonus?fmtMoney(e.bonus)+' · ':'')+fmtDate(e.bonusRecd)):(e.bonus?fmtMoney(e.bonus):'Not saved'),e.bonusRecd?'ok':''],
      ['Archive',isNonRepeatable(e)?'Non-repeatable offer':'No churn cycle','ok']
    ];
    return '<div class="profile-summary">'+items.map(x=>'<div class="profile-summary-item '+escFn(x[2]||'')+'"><span>'+escFn(x[0])+'</span><b>'+escFn(x[1])+'</b></div>').join('')+'</div>';
  });

  const oldLifecycleSteps=typeof window.lifecycleSteps==='function'?window.lifecycleSteps:null;
  if(oldLifecycleSteps)bind('lifecycleSteps',function(e){
    const steps=oldLifecycleSteps(e)||[];
    if(!shouldArchive(e))return steps;
    return steps.filter(x=>x?.key!=='churn').concat({key:'archive',label:'Archived',done:true,date:e.closed||'',planned:false});
  });

  const oldStartNewCycle=typeof window.startNewCycle==='function'?window.startNewCycle:null;
  if(oldStartNewCycle)bind('startNewCycle',function(id){
    let e=null;try{e=Array.isArray(entries)?entries.find(x=>x.id===id):null}catch{}
    if(e&&isNonRepeatable(e)){
      const msg='This offer is non-repeatable, so the closed record stays archived and cannot start another churn cycle.';
      try{if(typeof window.btNotify==='function')window.btNotify(msg,'info',4200);else alert(msg)}catch{}
      return;
    }
    return oldStartNewCycle.apply(this,arguments);
  });

  const oldFinishClose=typeof window.finishClose==='function'?window.finishClose:null;
  if(oldFinishClose)bind('finishClose',function(){
    let id='';try{id=closePrompt?.entryId||''}catch{}
    const out=oldFinishClose.apply(this,arguments);
    try{
      if(!id||typeof entries==='undefined'||!Array.isArray(entries))return out;
      const idx=entries.findIndex(x=>x.id===id);
      if(idx<0)return out;
      const next=normalizeArchiveEntry(entries[idx]);
      if(!shouldArchive(next))return out;
      entries[idx]=next;
      if(typeof sv==='function'&&typeof SK!=='undefined')sv(SK,entries);
      if(typeof cfm!=='undefined'&&cfm){
        cfm={...cfm,title:'Closed & Archived',msg:`${next.bank} closed on ${fmtDate(next.closed)}.\n\nArchive status: ${archiveReason(next)}.\nNo churn countdown was created.\n\nUndo is available for 60 seconds at the bottom of the app.`};
      }
      if(typeof R==='function')R();
    }catch(err){console.error('Archive close finalization failed',err)}
    return out;
  });

  function migrate(){
    try{
      const current=parseInt(localStorage.getItem(SCHEMA_KEY)||'0',10)||0;
      if(current>=SCHEMA||typeof entries==='undefined'||!Array.isArray(entries))return false;
      entries=entries.map(normalizeArchiveEntry);
      if(typeof sv==='function'&&typeof SK!=='undefined')sv(SK,entries);
      localStorage.setItem(SCHEMA_KEY,String(SCHEMA));
      return true;
    }catch(err){console.error('Archive migration failed',err);return false}
  }

  window.btShouldArchive=shouldArchive;
  window.btArchiveReason=archiveReason;
  window.btArchiveRulesVersion=VER;
  window.BT_APP_VERSION=VER;
  migrate();
  setTimeout(()=>{try{if(typeof entries!=='undefined'&&Array.isArray(entries)){entries=entries.map(normalizeArchiveEntry);if(typeof sv==='function'&&typeof SK!=='undefined')sv(SK,entries)}if(typeof R==='function')R()}catch(err){console.error('Archive rules refresh failed',err)}},0);
})();
