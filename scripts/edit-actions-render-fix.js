/* ✅ Version 3.2.4 Newest update: Restore edit modal rendering for mini countdown timers and checklist actions. */
(function(){
  const VER='3.2.4';

  function app(){return document.getElementById('app')||document.body;}
  function hasVisibleModalInput(ids){return ids.some(id=>!!document.getElementById(id));}
  function safeCall(fn){try{return typeof fn==='function'?fn():''}catch{return''}}
  function stateExists(name){try{return !!window[name] || !!eval(name)}catch{return false}}
  function setStateNull(name){try{window[name]=null}catch{};try{eval(name+'=null')}catch{}}

  function injectHtmlOnce(html, markerId, inputIds){
    if(!html||typeof html!=='string')return false;
    if(document.getElementById(markerId)||hasVisibleModalInput(inputIds))return false;
    const wrap=document.createElement('div');
    wrap.id=markerId;
    wrap.dataset.editActionsFix='true';
    wrap.innerHTML=html;
    app().appendChild(wrap);
    return true;
  }

  function renderTimerEditorIfNeeded(){
    const exists=stateExists('timerEditModal');
    if(!exists)return false;
    const html=safeCall(window.rTimerEdit);
    return injectHtmlOnce(html,'bt_timer_edit_render_fix',['tem_text','tem_start']);
  }

  function renderChecklistEditorIfNeeded(){
    const maybe=['checklistEditModal','checkEditModal','checklistEditor','checklistEdit','stepEditModal'];
    if(!maybe.some(stateExists))return false;
    const renderers=['rChecklistEdit','rChecklistEditor','renderChecklistEdit','renderChecklistEditor','rCheckEdit','rStepEdit'];
    for(const name of renderers){
      const html=safeCall(window[name]);
      if(injectHtmlOnce(html,'bt_checklist_edit_render_fix',['cem_text','che_text','chk_text','cl_text','step_text']))return true;
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
      window.closeTimerEditor=function(){
        setStateNull('timerEditModal');
        document.getElementById('bt_timer_edit_render_fix')?.remove();
        try{R()}catch{}
      };
    }
    ['closeChecklistEditor','closeChecklistEdit','closeCheckEditor','closeStepEditor'].forEach(name=>{
      if(typeof window[name]!=='function'){
        window[name]=function(){
          ['checklistEditModal','checkEditModal','checklistEditor','checklistEdit','stepEditModal'].forEach(setStateNull);
          document.getElementById('bt_checklist_edit_render_fix')?.remove();
          try{R()}catch{}
        };
      }
    });
  }

  function patchR(){
    if(window.__btEditActionsRPatched)return;
    if(typeof window.R!=='function')return;
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
        setTimeout(()=>{patchCloseFns();cleanupMarkers();renderTimerEditorIfNeeded();renderChecklistEditorIfNeeded();},120);
        setTimeout(()=>{patchCloseFns();cleanupMarkers();renderTimerEditorIfNeeded();renderChecklistEditorIfNeeded();},450);
      }
    },false);
    window.__btEditActionsClickObserved=true;
  }

  function boot(){patchCloseFns();patchR();observeEditClicks();cleanupMarkers();renderTimerEditorIfNeeded();renderChecklistEditorIfNeeded();}

  window.btEditActionsRenderFixVersion=VER;
  window.btEditActionsHealthCheck=function(){
    boot();
    return {
      version:VER,
      timerModal:stateExists('timerEditModal'),
      timerInput:!!document.getElementById('tem_text'),
      checklistModal:['checklistEditModal','checkEditModal','checklistEditor','checklistEdit','stepEditModal'].some(stateExists),
      patchedR:!!window.__btEditActionsRPatched
    };
  };

  setTimeout(boot,250);
  setTimeout(boot,1000);
  setTimeout(boot,2500);
  setInterval(boot,2500);
})();
