/*
 * filename: scripts/checklist-action-modal-fix.js
 * version: 3.3.15
 * purpose: Open Add Checklist from Bank Actions as an in-app modal.
 * last-touched: 2026-05-02
 */
(function(){
  const VER='3.3.15';
  const previousRunBankAction=window.runBankAction;
  const previousRender=window.R;

  window.btChecklistActionModal=null;

  function saveEntries(){
    try{
      if(typeof sv==='function'&&typeof SK!=='undefined'){
        sv(SK,entries);
        return;
      }
    }catch{}
    try{localStorage.setItem('bt_e_v4',JSON.stringify(entries));}catch{}
  }

  function getEntry(id){
    try{return entries.find(e=>e&&e.id===id)||null}catch{return null}
  }

  function closeActions(){
    try{window.__btBankActionPrompt=null}catch{}
  }

  function render(){
    try{R()}catch{}
  }

  function openModal(id){
    const e=getEntry(id);
    closeActions();
    if(!e){render();return}
    try{expanded=id}catch{}
    try{
      const st=inlineStateFor(id);
      st.checklist=false;
      st.timer=false;
      st.timerEdit=null;
    }catch{}
    window.btChecklistActionModal={entryId:id,bank:e.bank||''};
    render();
    setTimeout(function(){try{document.getElementById('bt_ck_modal_text')?.focus()}catch{}},40);
  }

  window.btCloseChecklistActionModal=function(){
    window.btChecklistActionModal=null;
    render();
  };

  window.btSaveChecklistActionModal=function(){
    const p=window.btChecklistActionModal;
    if(!p)return;
    const txt=(document.getElementById('bt_ck_modal_text')?.value||'').trim();
    if(!txt){alert('Add a checklist description.');return}
    entries=entries.map(function(e){
      if(e.id===p.entryId){
        if(!Array.isArray(e.checklist))e.checklist=[];
        e.checklist.push({text:txt,done:false});
      }
      return e;
    });
    saveEntries();
    try{expanded=p.entryId}catch{}
    window.btChecklistActionModal=null;
    render();
  };

  function modalHtml(){
    const p=window.btChecklistActionModal;
    if(!p)return'';
    return '<div class="cbg" onclick="btCloseChecklistActionModal()">'
      + '<div class="dd-box" onclick="event.stopPropagation()">'
      + '<h3>Add checklist step</h3>'
      + '<div class="sub">Add one requirement task for '+esc(p.bank||'this bank')+'.</div>'
      + '<div class="fg"><label>Description</label><input id="bt_ck_modal_text" placeholder="e.g. Make 1 debit card transaction" onkeydown="if(event.key===\'Enter\'){btSaveChecklistActionModal()}"></div>'
      + '<div class="crow"><button class="c-c" onclick="btCloseChecklistActionModal()">Cancel</button><button class="c-g" onclick="btSaveChecklistActionModal()">Save</button></div>'
      + '</div></div>';
  }

  window.runBankAction=function(id,action){
    if(action==='checklist'){
      openModal(id);
      return;
    }
    if(typeof previousRunBankAction==='function')return previousRunBankAction(id,action);
  };

  if(typeof previousRender==='function'){
    window.R=R=function(){
      previousRender.apply(this,arguments);
      const app=document.getElementById('app');
      if(app&&window.btChecklistActionModal)app.insertAdjacentHTML('beforeend',modalHtml());
    };
  }

  window.btChecklistActionModalFixVersion=VER;
})();
