/*
 * filename: scripts/bank-action-prompt-fix.js
 * version: 3.3.14
 * purpose: Route Bank Actions checklist/timer buttons to in-app UI, not browser prompts.
 * last-touched: 2026-05-02
 */
(function(){
  const VER='3.3.14';
  const originalRunBankAction=window.runBankAction;
  const originalSaveTimerEditor=window.saveTimerEditor;

  function saveEntries(){
    try{
      if(typeof sv==='function'&&typeof SK!=='undefined'){
        sv(SK,entries);
        return;
      }
    }catch{}
    try{localStorage.setItem('bt_e_v4',JSON.stringify(entries));}catch{}
  }

  function todayIso(){
    try{return typeof td==='function'?td():new Date().toISOString().split('T')[0]}catch{return new Date().toISOString().split('T')[0]}
  }

  function getEntry(id){
    try{return entries.find(e=>e&&e.id===id)||null}catch{return null}
  }

  function closeActions(){
    try{window.__btBankActionPrompt=null}catch{}
  }

  function restoreCard(id){
    try{expanded=id}catch{}
    try{R()}catch{}
  }

  function openChecklistInline(id){
    closeActions();
    const e=getEntry(id);
    if(!e){restoreCard(id);return}
    try{
      const st=inlineStateFor(id);
      st.checklist=true;
      st.timer=false;
      st.timerEdit=null;
    }catch{}
    restoreCard(id);
    setTimeout(()=>{try{document.getElementById('ck_'+id)?.focus()}catch{}},30);
  }

  function newTimerId(){
    try{if(typeof timerId==='function')return timerId()}catch{}
    return 'tm_'+Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4);
  }

  function openNewTimerModal(id){
    closeActions();
    const e=getEntry(id);
    if(!e){restoreCard(id);return}
    try{expanded=id}catch{}
    const start=e.opened||todayIso();
    const defaultDays=(parseInt(e.reqDays||0,10)||0);
    try{
      timerEditModal={
        entryId:id,
        timerId:newTimerId(),
        text:'',
        mode:defaultDays>0?'days':'due',
        startDate:start,
        daysRequired:defaultDays>0?String(defaultDays):''
      };
    }catch(err){
      // Fallback to the existing inline flow if the timer modal binding is unavailable.
      try{
        const st=inlineStateFor(id);
        st.timer=true;
        st.checklist=false;
        st.timerEdit=null;
      }catch{}
    }
    restoreCard(id);
  }

  function saveTimerEditorWithInsert(){
    let p;
    try{p=timerEditModal}catch{return typeof originalSaveTimerEditor==='function'?originalSaveTimerEditor():undefined}
    if(!p)return;

    const txt=(document.getElementById('tem_text')?.value||'').trim();
    const start=(document.getElementById('tem_start')?.value||'').trim();
    const rawDays=document.getElementById('tem_days')?.value||'';
    const days=p.mode==='days'?(parseInt(rawDays,10)||0):0;

    if(!txt||!start){alert('Add a description and a date.');return;}
    if(p.mode==='days'&&days<=0){alert('Add the number of days for a Start Date + Days timer.');return;}

    let due=start;
    try{due=days>0?timerDueFromStart(start,days):start}catch{due=start}

    let updated={
      id:p.timerId||newTimerId(),
      text:txt,
      startDate:days>0?start:'',
      daysRequired:days,
      date:due,
      done:false
    };
    try{updated=normalizeTimer(updated)}catch{}

    try{
      entries=entries.map(e=>{
        if(e.id===p.entryId){
          let timers=[];
          try{timers=normalizeTimerList(e.customTimers)}catch{timers=Array.isArray(e.customTimers)?e.customTimers:[]}
          const idx=timers.findIndex(t=>t&&t.id===updated.id);
          if(idx>=0){
            updated.done=!!timers[idx].done;
            timers[idx]=updated;
          }else{
            timers.push(updated);
          }
          e.customTimers=timers;
        }
        return e;
      });
      saveEntries();
      timerEditModal=null;
      R();
    }catch(err){
      if(typeof originalSaveTimerEditor==='function')return originalSaveTimerEditor();
    }
  }

  window.runBankAction=function(id,action){
    if(action==='checklist'){
      openChecklistInline(id);
      return;
    }
    if(action==='timer'){
      openNewTimerModal(id);
      return;
    }
    if(typeof originalRunBankAction==='function')return originalRunBankAction(id,action);
  };

  window.saveTimerEditor=saveTimerEditor=saveTimerEditorWithInsert;
  window.btBankActionPromptFixVersion=VER;
})();
