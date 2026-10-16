/* SimpleFIN primary > Plaid Trial fallback > manual entry. Never auto-link. */
(function(){
  'use strict';
  const URL='https://api-production-00f74.up.railway.app/api/bonus-tracker/plaid';
  const APP_SCRIPT='https://cdn.plaid.com/link/v2/stable/link-initialize.js';
  let scriptPromise=null;
  const elem=(tag,text,parent,cls)=>{
    const node=document.createElement(tag);
    if(text!==undefined)node.textContent=text;
    if(cls)node.className=cls;
    if(parent)parent.append(node);
    return node;
  };
  const action=(host,label,fn)=>{
    const button=elem('button',label,host,'btn-s plaid-trial-action');
    button.type='button';button.addEventListener('click',fn);return button;
  };
  async function api(path='',options={}){
    const auth=window.BTBonusAuth;
    if(!auth?.connected())throw Error('Sign in before viewing private bank connections.');
    const token=await auth.token();
    const response=await fetch(URL+path,{...options,cache:'no-store',credentials:'omit',
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'Plaid fallback is unavailable.');
    return data;
  }
  function loadLink(){
    if(window.Plaid?.create)return Promise.resolve();
    if(!scriptPromise){
      scriptPromise=new Promise((resolve,reject)=>{
        const script=document.createElement('script');
        script.src=APP_SCRIPT;script.async=true;
        script.onload=()=>window.Plaid?.create?resolve():reject(Error('Plaid Link did not start.'));
        script.onerror=()=>reject(Error('The secure Plaid Link service could not load.'));
        document.head.append(script);
      }).catch(error=>{scriptPromise=null;throw error});
    }
    return scriptPromise;
  }
  function mount(host,linkedAccounts=[]){
    if(!host)return;
    host.replaceChildren();
    host.classList.add('plaid-trial-fallback');
    elem('h4','Alternative connection — Plaid Trial',host);
    elem('p','SimpleFIN is the primary bank connection. Use Plaid only if your institution cannot be connected through SimpleFIN. Manual entry remains available without consuming any Plaid slots.',host);
    const summary=elem('p','Checking free Trial capacity…',host,'plaid-trial-counter');
    summary.setAttribute('role','status');
    const message=elem('p','',host,'plaid-trial-message');
    message.setAttribute('role','status');
    const body=elem('div',undefined,host,'plaid-trial-control');
    const linkedNames=new Set((Array.isArray(linkedAccounts)?linkedAccounts:[])
      .map(a=>String(a.bank||'').trim().toLowerCase()).filter(Boolean));
    const status=()=>api().then(data=>{
      if(!host.isConnected)return;
      summary.textContent=data.used===null||data.used===undefined
        ?'Plaid slots used: not verified / 10'
        :'Plaid slots used: '+data.used+'/10'+(data.reserved?' · '+data.reserved+' reserved':'');
      body.replaceChildren();
      if(!data.configured){
        elem('p','Plaid linking is locked until the free Trial plan, lifetime usage count, credentials and read-only transaction monitoring are verified. No connection or charge has been made.',body,'plaid-trial-caution');
        return;
      }
      elem('p','Every new Plaid login permanently uses 1 of 10 slots, even if disconnected later. Never re-link unnecessarily.',body,'plaid-trial-caution');
      if((data.remaining||0)<=0){
        elem('p','No unused Plaid Trial slots remain. Use SimpleFIN or manual entry. Paid upgrades are disabled.',body);
        return;
      }
      const label=elem('label','Bank or credit union name',body),name=elem('input',undefined,label);
      name.type='text';name.maxLength=100;name.placeholder='Institution not supported by SimpleFIN';
      const tried=elem('label',undefined,body,'plaid-trial-check');
      const trial=elem('input',undefined,tried);trial.type='checkbox';
      elem('span','I tried SimpleFIN first and could not link this institution.',tried);
      const warned=elem('label',undefined,body,'plaid-trial-check');
      const acknowledge=elem('input',undefined,warned);acknowledge.type='checkbox';
      elem('span','I understand this permanently uses one of my 10 free Plaid Trial slots.',warned);
      const duplicate=elem('label',undefined,body,'plaid-trial-check');
      const relink=elem('input',undefined,duplicate);relink.type='checkbox';
      elem('span','Allow another Plaid login for this bank even if already connected through Plaid.',duplicate);
      const go=action(body,'Connect with Plaid (last fallback)',async()=>{
        const institution=name.value.trim();
        if(institution.length<2){message.textContent='Enter the institution name first.';return}
        if(linkedNames.has(institution.toLowerCase())){
          message.textContent='This bank is already linked in SimpleFIN. Reuse that connection instead of consuming a Plaid slot.';
          return;
        }
        if(!trial.checked||!acknowledge.checked){
          message.textContent='Both acknowledgements are required before continuing.';
          return;
        }
        go.disabled=true;message.textContent='Requesting one safe Plaid Link session…';
        try{
          const result=await api('/link-token',{method:'POST',body:JSON.stringify({
            institution,triedSimplefin:true,understandsLifetimeSlot:true,allowDuplicate:relink.checked
          })});
          await loadLink();
          if(!host.isConnected)return;
          const link=window.Plaid.create({token:result.linkToken,
            onSuccess:async publicToken=>{
              message.textContent='Saving the bank connection securely…';
              try{
                await api('/exchange',{method:'POST',body:JSON.stringify({session:result.session,publicToken})});
                message.textContent='Connection secured. Review transaction availability before considering it monitored.';
                await status();
              }catch(error){message.textContent=error.message+
                ' Do not retry the bank login automatically; a permanent slot may already be consumed.';}
            },
            onExit:()=>{message.textContent='Link closed. An unused reservation may remain until it expires; no automatic retry was started.';}
          });
          link.open();
        }catch(error){message.textContent=error.message}
        finally{go.disabled=false}
      });
    }).catch(error=>{if(host.isConnected){summary.textContent='Plaid slots used: unavailable / 10';message.textContent=error.message}});
    status();
  }
  window.BTLinkPlaidTrial=Object.freeze({mount});
})();
