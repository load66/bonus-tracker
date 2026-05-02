/*
 * filename: scripts/legacy-item-id-migration-fix.js
 * version: 3.2.5
 * purpose: Migrate legacy mini timers/checklist items so Edit works on every bank.
 * last-touched: unknown
 */
(function(){
  const VER='3.2.5';
  const KEY=(typeof SK==='string'&&SK)||'bt_e_v4';

  function makeId(prefix, entryId, i){
    return prefix+'_'+String(entryId||'entry').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,24)+'_'+Date.now().toString(36)+'_'+i+'_'+Math.random().toString(36).slice(2,7);
  }
  function cleanStr(v){return String(v==null?'':v).trim();}
  function listFields(){
    return [
      'customTimers','miniTimers','timers','countdowns',
      'checklist','checklists','checklistItems','checks','steps','tasks','todo','todoItems','customChecklist','actionItems'
    ];
  }
  function normalizeTimerLocal(t, entryId, i){
    const x=(t&&typeof t==='object')?{...t}:{text:cleanStr(t)};
    if(!cleanStr(x.id)) x.id=makeId('tm',entryId,i);
    if(!cleanStr(x.text)) x.text=cleanStr(x.label||x.name||x.title||x.description||'Timer');
    if(!cleanStr(x.date)) x.date=cleanStr(x.dueDate||x.due||x.endDate||'');
    if(!cleanStr(x.startDate)) x.startDate=cleanStr(x.start||x.opened||'');
    const days=parseInt(x.daysRequired||x.days||x.durationDays||0,10)||0;
    x.daysRequired=days;
    x.done=!!x.done;
    return x;
  }
  function normalizeChecklistLocal(item, entryId, i){
    const x=(item&&typeof item==='object')?{...item}:{text:cleanStr(item)};
    if(!cleanStr(x.id)) x.id=makeId('ck',entryId,i);
    if(!cleanStr(x.text)) x.text=cleanStr(x.label||x.name||x.title||x.description||x.note||'Checklist step');
    x.done=!!(x.done||x.checked||x.complete||x.completed);
    return x;
  }
  function isTimerField(name){return /timer|countdown/i.test(name);}
  function migrateEntry(e, idx){
    if(!e||typeof e!=='object')return {entry:e,changed:false};
    let changed=false;
    const entryId=cleanStr(e.id)||('row_'+idx);
    const next={...e};

    listFields().forEach(field=>{
      if(!Array.isArray(next[field]))return;
      const before=JSON.stringify(next[field]);
      next[field]=next[field].map((item,i)=>isTimerField(field)?normalizeTimerLocal(item,entryId,i):normalizeChecklistLocal(item,entryId,i));
      if(JSON.stringify(next[field])!==before)changed=true;
    });

    return {entry:next,changed};
  }
  function migrateAll(){
    if(!Array.isArray(window.entries)&&typeof entries==='undefined')return false;
    let arr;
    try{arr=Array.isArray(entries)?entries:window.entries}catch{return false;}
    if(!Array.isArray(arr))return false;
    let changed=false;
    const next=arr.map((e,i)=>{const r=migrateEntry(e,i);if(r.changed)changed=true;return r.entry;});
    if(changed){
      try{entries=next}catch{}
      try{window.entries=next}catch{}
      try{localStorage.setItem(KEY,JSON.stringify(next))}catch{}
    }
    return changed;
  }

  function patchTimerEditor(){
    if(window.__btLegacyTimerEditorPatched)return;
    if(typeof window.openTimerEditor!=='function')return;
    const base=window.openTimerEditor;
    window.openTimerEditor=function(id,timerIdValue){
      migrateAll();
      const before=String(timerIdValue||'');
      try{base(id,timerIdValue)}catch{}
      let opened=false;
      try{opened=!!timerEditModal}catch{opened=!!window.timerEditModal}
      if(opened)return;

      let entry=null;
      try{entry=(entries||[]).find(e=>e.id===id)}catch{}
      if(!entry)return;
      const timers=Array.isArray(entry.customTimers)?entry.customTimers:[];
      let timer=timers.find(t=>String(t?.id||'')===before);
      if(!timer&&timers.length===1) timer=timers[0];
      if(!timer) return;

      try{
        timerEditModal={entryId:id,timerId:timer.id,text:timer.text||timer.label||'',mode:(parseInt(timer.daysRequired||0,10)||0)>0?'days':'due',startDate:((parseInt(timer.daysRequired||0,10)||0)>0?timer.startDate:timer.date)||'',daysRequired:timer.daysRequired?String(timer.daysRequired):''};
      }catch{
        window.timerEditModal={entryId:id,timerId:timer.id,text:timer.text||timer.label||'',mode:(parseInt(timer.daysRequired||0,10)||0)>0?'days':'due',startDate:((parseInt(timer.daysRequired||0,10)||0)>0?timer.startDate:timer.date)||'',daysRequired:timer.daysRequired?String(timer.daysRequired):''};
      }
      try{R()}catch{}
    };
    try{openTimerEditor=window.openTimerEditor}catch{}
    window.__btLegacyTimerEditorPatched=true;
  }

  function boot(){
    const changed=migrateAll();
    patchTimerEditor();
    if(changed){try{R()}catch{}}
  }

  window.btLegacyItemIdMigrationVersion=VER;
  window.btLegacyItemIdMigrationRun=function(){const changed=migrateAll();patchTimerEditor();if(changed){try{R()}catch{}}return {version:VER,changed};};

  setTimeout(boot,200);
  setTimeout(boot,900);
  setTimeout(boot,2200);
})();