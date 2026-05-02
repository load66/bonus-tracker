/*
 * filename: scripts/edit-actions-render-fix.js
 * version: 3.3.1
 * purpose: Stable edit actions + legacy timer/checklist ID migration. No version badge control.
 * last-touched: unknown
 */
(function(){
  const VER='3.3.1';
  const KEY=(typeof SK==='string'&&SK)||'bt_e_v4';

  function app(){return document.getElementById('app')||document.body;}
  function hasVisibleModalInput(ids){return ids.some(id=>!!document.getElementById(id));}
  function safeCall(fn){try{return typeof fn==='function'?fn():''}catch{return''}}
  function stateExists(name){try{return !!window[name] || !!eval(name)}catch{return false}}
  function setStateNull(name){try{window[name]=null}catch{};try{eval(name+'=null')}catch{}}
  function cleanStr(v){return String(v==null?'':v).trim();}
  function makeId(prefix, entryId, i){return prefix+'_'+String(entryId||'entry').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,24)+'_'+Date.now().toString(36)+'_'+i+'_'+Math.random().toString(36).slice(2,7);}

  function normalizeTimerLocal(t, entryId, i){
    const x=(t&&typeof t==='object')?{...t}:{text:cleanStr(t)};
    if(!cleanStr(x.id))x.id=makeId('tm',entryId,i);
    if(!cleanStr(x.text))x.text=cleanStr(x.label||x.name||x.title||x.description||'Timer');
    if(!cleanStr(x.date))x.date=cleanStr(x.dueDate||x.due||x.endDate||'');
    if(!cleanStr(x.startDate))x.startDate=cleanStr(x.start||x.opened||'');
    x.daysRequired=parseInt(x.daysRequired||x.days||x.durationDays||0,10)||0;
    x.done=!!x.done;
    return x;
  }
  function normalizeChecklistLocal(item, entryId, i){
    const x=(item&&typeof item==='object')?{...item}:{text:cleanStr(item)};
    if(!cleanStr(x.id))x.id=makeId('ck',entryId,i);
    if(!cleanStr(x.text))x.text=cleanStr(x.label||x.name||x.title||x.description||x.note||'Checklist step');
    x.done=!!(x.done||x.checked||x.complete||x.completed);
    return x;
  }
  function migrateLegacyIds(){
    let arr;
    try{arr=Array.isArray(entries)?entries:window.entries}catch{return false;}
    if(!Array.isArray(arr))return false;
    let changed=false;
    const fields=['customTimers','miniTimers','timers','countdowns','checklist','checklists','checklistItems','checks','steps','tasks','todo','todoItems','customChecklist','actionItems'];
    const next=arr.map((e,idx)=>{
      if(!e||typeof e!=='object')return e;
      const n={...e};
      const entryId=cleanStr(n.id)||('row_'+idx);
      fields.forEach(field=>{
        if(!Array.isArray(n[field]))return;
        const before=JSON.stringify(n[field]);
        const isTimer=/timer|countdown/i.test(field);
        n[field]=n[field].map((item,i)=>isTimer?normalizeTimerLocal(item,entryId,i):normalizeChecklistLocal(item,entryId,i));
        if(JSON.stringify(n[field])!==before)changed=true;
      });
      return n;
    });
    if(changed){
      try{entries=next}catch{}
      try{window.entries=next}catch{}
      try{localStorage.setItem(KEY,JSON.stringify(next))}catch{}
    }
    return changed;
  }
  function injectHtmlOnce(html, markerId, inputIds){
    if(!html||typeof html!=='string')return false;
    if(document.getElementById(markerId)||hasVisibleModalInput(inputIds))return false;
    const wrap=document.createElement('div');wrap.id=markerId;wrap.dataset.editActionsFix='true';wrap.innerHTML=html;app().appendChild(wrap);return true;
  }
  function renderTimerEditorIfNeeded(){
    if(!stateExists('timerEditModal'))return false;
    return injectHtmlOnce(safeCall(window.rTimerEdit),'bt_timer_edit_render_fix',['tem_text','tem_start']);
  }
  function renderChecklistEditorIfNeeded(){
    const states=['checklistEditModal','checkEditModal','checklistEditor','checklistEdit','stepEditModal'];
    if(!states.some(stateExists))return false;
    const renderers=['rChecklistEdit','rChecklistEditor','renderChecklistEdit','renderChecklistEditor','rCheckEdit','rStepEdit'];
    for(const name of renderers){
      if(injectHtmlOnce(safeCall(window[name]),'bt_checklist_edit_render_fix',['cem_text','che_text','chk_text','cl_text','step_text']))return true;
    }
    return false;
  }
  function cleanupMarkers(){
    const tm=document.getElementById('bt_timer_edit_render_fix');
    if(tm&&!stateExists('timerEditModal'))tm.remove();
    const cm=document.getElementById('bt_checklist_edit_render_fix');
    const checklistOpen=['checklistEditModal','checkEditModal','checklistEditor','checklistEdit','stepEditModal'].some(stateExists);
    if(cm&&!checklistOpen)cm.remove();
  }
  function patchCloseFns(){
    if(typeof window.closeTimerEditor!=='function'){
      window.closeTimerEditor=function(){setStateNull('timerEditModal');document.getElementById('bt_timer_edit_render_fix')?.remove();try{R()}catch{}};
    }
    ['closeChecklistEditor','closeChecklistEdit','closeCheckEditor','closeStepEditor'].forEach(name=>{
      if(typeof window[name]!=='function'){
        window[name]=function(){['checklistEditModal','checkEditModal','checklistEditor','checklistEdit','stepEditModal'].forEach(setStateNull);document.getElementById('bt_checklist_edit_render_fix')?.remove();try{R()}catch{}};
      }
    });
  }
  function patchTimerEditorFallback(){
    if(window.__btLegacyTimerEditorPatched||typeof window.openTimerEditor!=='function')return;
    const base=window.openTimerEditor;
    window.openTimerEditor=function(id,timerIdValue){
      migrateLegacyIds();
      try{base(id,timerIdValue)}catch{}
      let opened=false;
      try{opened=!!timerEditModal}catch{opened=!!window.timerEditModal}
      if(opened)return;
      let entry=null;
      try{entry=(entries||[]).find(e=>e.id===id)}catch{}
      if(!entry)return;
      const timers=Array.isArray(entry.customTimers)?entry.customTimers:[];
      let timer=timers.find(t=>String(t?.id||'')===String(timerIdValue||''));
      if(!timer&&timers.length===1)timer=timers[0];
      if(!timer)return;
      const days=parseInt(timer.daysRequired||0,10)||0;
      const payload={entryId:id,timerId:timer.id,text:timer.text||timer.label||'',mode:days>0?'days':'due',startDate:(days>0?timer.startDate:timer.date)||'',daysRequired:days?String(days):''};
      try{timerEditModal=payload}catch{window.timerEditModal=payload}
      try{R()}catch{}
    };
    try{openTimerEditor=window.openTimerEditor}catch{}
    window.__btLegacyTimerEditorPatched=true;
  }
  function patchR(){
    if(window.__btEditActionsRPatched||typeof window.R!=='function')return;
    const baseR=window.R;
    window.R=function(){
      const out=baseR.apply(this,arguments);
      setTimeout(()=>{patchCloseFns();cleanupMarkers();renderTimerEditorIfNeeded();renderChecklistEditorIfNeeded();},0);
      return out;
    };
    window.__btEditActionsRPatched=true;
  }
  function observeEditClicks(){
    if(window.__btEditActionsClickObserved)return;
    document.addEventListener('click',function(e){
      const btn=e.target?.closest?.('button,a,[role="button"]');
      if(!btn)return;
      const txt=(btn.textContent||btn.value||btn.getAttribute('aria-label')||'').trim().toLowerCase();
      if(txt==='edit'||txt.includes('edit')){
        migrateLegacyIds();
        setTimeout(()=>{patchCloseFns();cleanupMarkers();renderTimerEditorIfNeeded();renderChecklistEditorIfNeeded();},120);
        setTimeout(()=>{patchCloseFns();cleanupMarkers();renderTimerEditorIfNeeded();renderChecklistEditorIfNeeded();},450);
      }
    },false);
    window.__btEditActionsClickObserved=true;
  }
  function boot(){migrateLegacyIds();patchTimerEditorFallback();patchCloseFns();patchR();observeEditClicks();cleanupMarkers();renderTimerEditorIfNeeded();renderChecklistEditorIfNeeded();}

  window.btEditActionsRenderFixVersion=VER;
  window.btEditActionsHealthCheck=function(){const changed=migrateLegacyIds();boot();return {version:VER,changed,timerModal:stateExists('timerEditModal'),timerInput:!!document.getElementById('tem_text'),checklistModal:['checklistEditModal','checkEditModal','checklistEditor','checklistEdit','stepEditModal'].some(stateExists),patchedR:!!window.__btEditActionsRPatched,legacyPatch:!!window.__btLegacyTimerEditorPatched};};
  window.btLegacyItemIdMigrationRun=function(){const changed=migrateLegacyIds();if(changed){try{R()}catch{}}return {version:VER,changed};};

  setTimeout(boot,250);setTimeout(boot,1000);setTimeout(boot,2500);setInterval(boot,2500);
})();