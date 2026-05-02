/*
 * filename: scripts/bank-action-prompt-fix.js
 * version: 3.3.15
 * purpose: Route Bank Actions checklist/timer buttons to in-app modals, not browser prompts or old inline rows.
 * last-touched: 2026-05-02
 */
(function(){
  const VER='3.3.15';
  const originalRunBankAction=window.runBankAction;
  const originalSaveTimerEditor=window.saveTimerEditor;

  let checklistModal=null;

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
    try{return entries.find(function(e){return e&&e.id===id})||null}catch{return null}
  }

  function closeActions(){
    try{window.__btBankActionPrompt=null}catch{}
  }

  function clearInlineState(id){
    try{
      const st=inlineStateFor(id);
      st.checklist=false;
      st.timer=false;
      st.timerEdit=null;
    }catch{}
  }

  function render(){
    try{R()}catch{}
  }

  function removeChecklistModal(){
    const old=document.getElementById('bt_checklist_modal');
    if(old)old.remove();
  }

  function closeChecklistModal(){
    checklistModal=null;
    removeChecklistModal();
  }

  function saveChecklistModal(){
    if(!checklistModal)return;
    const input=document.getElementById('bt_checklist_modal_text');
    const text=(input&&input.value?input.value:'').trim();
    if(!text){alert('Add a checklist description.');return;}
    const id=checklistModal.entryId;
    entries=entries.map(function(e){
      if(e&&e.id===id){
        if(!Array.isArray(e.checklist))e.checklist=[];
        e.checklist.push({text:text,done:false});
      }
      return e;
    });
    saveEntries();
    try{expanded=id}catch{}
    closeChecklistModal();
    render();
  }

  function showChecklistModal(){
    removeChecklistModal();
    if(!checklistModal)return;

    const overlay=document.createElement('div');
    overlay.id='bt_checklist_modal';
    overlay.className='cbg';
    overlay.addEventListener('click',closeChecklistModal);

    const box=document.createElement('div');
    box.className='dd-box';
    box.addEventListener('click',function(ev){ev.stopPropagation();});

    const title=document.createElement('h3');
    title.textContent='Add checklist step';

    const sub=document.createElement('div');
    sub.className='sub';
    sub.textContent='Add one requirement task for '+(checklistModal.bank||'this bank')+'.';

    const fg=document.createElement('div');
    fg.className='fg';

    const label=document.createElement('label');
    label.textContent='Description';

    const input=document.createElement('input');
    input.id='bt_checklist_modal_text';
    input.placeholder='e.g. Make 1 debit card transaction';
    input.addEventListener('keydown',function(ev){
      if(ev.key==='Enter')saveChecklistModal();
    });

    fg.appendChild(label);
    fg.appendChild(input);

    const row=document.createElement('div');
    row.className='crow';

    const cancel=document.createElement('button');
    cancel.className='c-c';
    cancel.textContent='Cancel';
    cancel.addEventListener('click',closeChecklistModal);

    const save=document.createElement('button');
    save.className='c-g';
    save.textContent='Save';
    save.addEventListener('click',saveChecklistModal);

    row.appendChild(cancel);
    row.appendChild(save);

    box.appendChild(title);
    box.appendChild(sub);
    box.appendChild(fg);
    box.appendChild(row);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    setTimeout(function(){try{input.focus()}catch{}},30);
  }

  function openChecklistModal(id){
    const e=getEntry(id);
    closeActions();
    if(!e){render();return;}
    clearInlineState(id);
    try{expanded=id}catch{}
    checklistModal={entryId:id,bank:e.bank||''};
    render();
    showChecklistModal();
  }

  function newTimerId(){
    try{if(typeof timerId==='function')return timerId()}catch{}
    return 'tm_'+Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4);
  }

  function openNewTimerModal(id){
    const e=getEntry(id);
    closeActions();
    if(!e){render();return;}
    clearInlineState(id);
    try{expanded=id}catch{}
    const start=e.opened||todayIso();
    const defaultDays=parseInt(e.reqDays||0,10)||0;
    try{
      timerEditModal={
        entryId:id,
        timerId:newTimerId(),
        text:'',
        mode:defaultDays>0?'days':'due',
        startDate:start,
        daysRequired:defaultDays>0?String(defaultDays):''
      };
    }catch{}
    render();
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

    entries=entries.map(function(e){
      if(e&&e.id===p.entryId){
        let timers=[];
        try{timers=normalizeTimerList(e.customTimers)}catch{timers=Array.isArray(e.customTimers)?e.customTimers:[]}
        const idx=timers.findIndex(function(t){return t&&t.id===updated.id});
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
    render();
  }

  window.runBankAction=function(id,action){
    if(action==='checklist'){
      openChecklistModal(id);
      return;
    }
    if(action==='timer'){
      openNewTimerModal(id);
      return;
    }
    if(typeof originalRunBankAction==='function')return originalRunBankAction(id,action);
  };

  window.saveTimerEditor=saveTimerEditor=saveTimerEditorWithInsert;
  window.btCloseChecklistActionModal=closeChecklistModal;
  window.btBankActionPromptFixVersion=VER;
})();
