/*
 * filename: scripts/bank-action-prompt-fix.js
 * version: 3.3.13
 * purpose: Restore prompt-based Add Checklist and Add Timer from the bank Actions menu.
 * last-touched: 2026-05-02
 */
(function(){
  const VER='3.3.13';
  const originalRunBankAction=window.runBankAction;

  function saveEntries(){
    try{
      if(typeof sv==='function'&&typeof SK!=='undefined'){
        sv(SK,entries);
        return;
      }
    }catch{}
    try{
      localStorage.setItem('bt_e_v4',JSON.stringify(entries));
    }catch{}
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

  function clean(v){return String(v||'').trim()}

  function addChecklistPrompt(id){
    const e=getEntry(id);
    closeActions();
    if(!e){restoreCard(id);return}

    let txt=window.prompt('Add checklist step for '+(e.bank||'this bank')+':','');
    txt=clean(txt);
    if(!txt){restoreCard(id);return}

    if(!Array.isArray(e.checklist))e.checklist=[];
    e.checklist.push({text:txt,done:false});

    try{
      const st=inlineStateFor(id);
      st.checklist=false;
      st.timer=false;
    }catch{}

    saveEntries();
    restoreCard(id);
  }

  function validIsoDate(v){
    return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''));
  }

  function addTimerPrompt(id){
    const e=getEntry(id);
    closeActions();
    if(!e){restoreCard(id);return}

    let txt=clean(window.prompt('Mini timer name for '+(e.bank||'this bank')+':',''));
    if(!txt){restoreCard(id);return}

    const today=(typeof td==='function')?td():new Date().toISOString().split('T')[0];
    let start=clean(window.prompt('Start date (YYYY-MM-DD):',e.opened||today));
    if(!start){restoreCard(id);return}
    if(!validIsoDate(start)){
      window.alert('Use date format YYYY-MM-DD.');
      restoreCard(id);
      return;
    }

    let daysRaw=clean(window.prompt('How many days from the start date?',String(e.reqDays||'')));
    const days=parseInt(daysRaw,10);
    if(!(days>0)){
      window.alert('Days must be greater than 0.');
      restoreCard(id);
      return;
    }

    let due='';
    try{
      due=(typeof timerDueFromStart==='function')?timerDueFromStart(start,days):'';
    }catch{}
    if(!due){
      try{due=addD(start,days)}catch{due=start}
    }

    let next={
      id:(typeof timerId==='function')?timerId():('tm_'+Math.random().toString(36).slice(2,9)),
      text:txt,
      startDate:start,
      daysRequired:days,
      date:due,
      done:false
    };
    try{
      if(typeof normalizeTimer==='function')next=normalizeTimer(next);
    }catch{}

    if(!Array.isArray(e.customTimers))e.customTimers=[];
    try{e.customTimers=normalizeTimerList(e.customTimers)}catch{}
    e.customTimers.push(next);

    try{
      const st=inlineStateFor(id);
      st.checklist=false;
      st.timer=false;
      st.timerEdit=null;
    }catch{}

    saveEntries();
    restoreCard(id);
  }

  window.runBankAction=function(id,action){
    if(action==='checklist'){
      addChecklistPrompt(id);
      return;
    }
    if(action==='timer'){
      addTimerPrompt(id);
      return;
    }
    if(typeof originalRunBankAction==='function'){
      return originalRunBankAction(id,action);
    }
  };

  window.btBankActionPromptFixVersion=VER;
})();
