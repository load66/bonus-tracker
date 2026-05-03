/*
 * filename: scripts/action-confirmations.js
 * version: 3.3.52
 * purpose: Confirmation prompts for Mark Received / Update Received and Delete Bank actions.
 */
(function(){
  const VER='3.3.52';
  const rerender=()=>{try{R()}catch{}};
  const get=id=>{try{return entries.find(x=>x&&x.id===id)||null}catch{return null}};
  const prettyDate=d=>{try{return fD(d)}catch{return d||''}};
  const save=()=>{try{sv(SK,entries)}catch{try{localStorage.setItem(SK,JSON.stringify(entries))}catch{}}};

  function install(){
    if(window.__btActionConfirmationsInstalled===VER)return true;
    if(typeof R!=='function'||typeof sv!=='function')return false;

    const baseRun=typeof runBankAction==='function'?runBankAction:null;
    const baseOpenReceived=typeof openRcv==='function'?openRcv:null;

    window.confirmMarkReceived=function(id){
      const e=get(id);
      if(!e)return;
      cfm={
        title:e.bonusRecd?'Update bonus received?':'Mark bonus received?',
        msg:(e.bonusRecd?'Update ':'Mark ')+e.bank+' bonus as received?\n\nYou can review the received date before saving.',
        green:true,
        action:()=>{cfm=null;if(baseOpenReceived)baseOpenReceived(id);else if(typeof openRcv==='function')openRcv(id);}
      };
      rerender();
    };

    if(baseRun){
      window.runBankAction=runBankAction=function(id,action){
        if(action==='received'){
          window.__btBankActionPrompt=null;
          window.confirmMarkReceived(id);
          return;
        }
        if(action==='delete'){
          window.__btBankActionPrompt=null;
          window.delEntry(id);
          return;
        }
        return baseRun(id,action);
      };
    }

    window.rcvSubmit=rcvSubmit=function(){
      const p=rcvPrompt;
      if(!p)return;
      const d=document.getElementById('rcv_date');
      if(d)p.date=d.value;
      if(!p.date){alert('Received date required');return;}
      entries=entries.map(e=>{
        if(e.id===p.entryId){
          e.bonusRecd=p.date;
          e.plannedClose='';
        }
        return e;
      });
      const e2=get(p.entryId);
      try{if(e2)syncProfileEventsFromEntry(e2)}catch{}
      try{if(e2)refreshSavedReqFromEntry(e2)}catch{}
      try{entries=sortE(entries)}catch{}
      save();
      rcvPrompt=null;
      cfm={
        title:'Bonus received saved',
        msg:(e2?e2.bank:'This bank')+' received date saved for '+prettyDate(p.date)+'.',
        green:true,
        action:()=>{cfm=null;rerender();}
      };
      rerender();
    };

    window.delEntry=delEntry=function(id){
      const e=get(id);
      if(!e)return;
      const name=e.bank||'This entry';
      const eid=e.id||'';
      cfm={
        title:'Delete bank entry?',
        msg:'Delete '+name+' '+eid+' from the tracker?\n\nThis action cannot be undone.',
        action:()=>{
          entries=entries.filter(x=>x.id!==id);
          save();
          try{expanded=null}catch{}
          cfm={
            title:'Bank entry deleted',
            msg:name+' was deleted from the tracker.',
            green:true,
            action:()=>{cfm=null;rerender();}
          };
          rerender();
        }
      };
      rerender();
    };

    window.BT_ACTION_CONFIRMATIONS_VERSION=VER;
    window.__btActionConfirmationsInstalled=VER;
    return true;
  }

  install();
  setTimeout(install,120);
  setTimeout(install,600);
})();
