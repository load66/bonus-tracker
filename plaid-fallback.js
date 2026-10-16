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
    button.type='button';button.addEventListener('click',async()=>{
      if(button.disabled)return;button.disabled=true;
      try{await fn()}finally{if(button.isConnected&&!button.dataset.keepDisabled)button.disabled=false}
    });return button;
  };
  function sessionIdentity(token){
    try{
      const value=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      return typeof value?.sub==='string'&&value.sub
        ?JSON.stringify([value.iss||'',value.sub]):null;
    }catch{return null}
  }
  async function api(path='',options={}){
    const auth=window.BTBonusAuth;
    if(!auth?.connected())throw Error('Sign in before viewing private bank connections.');
    const token=await auth.token();
    const response=await fetch(URL+path,{...options,cache:'no-store',credentials:'omit',
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'Plaid fallback is unavailable.');
    if(window.BTBonusAuth!==auth||!auth.connected())
      throw Error('Sign-in changed. Reopen bank connections.');
    const current=await auth.token().catch(()=>null);
    if(!auth.connected()||!current||(current!==token&&
      (!sessionIdentity(token)||sessionIdentity(token)!==sessionIdentity(current))))
      throw Error('Sign-in changed. Reopen bank connections.');
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
    elem('h4','Connect with Plaid',host);
    elem('p','For banks unavailable through SimpleFIN.',host,'plaid-trial-subtitle');
    const summary=elem('p','Checking free Trial capacity…',host,'plaid-trial-counter');
    summary.setAttribute('role','status');
    const capacity=elem('div',undefined,host,'plaid-trial-capacity');capacity.hidden=true;
    const capacityFill=elem('span',undefined,capacity);
    const message=elem('p','',host,'plaid-trial-message');
    message.setAttribute('role','status');
    const body=elem('div',undefined,host,'plaid-trial-control');
    const accountsArea=elem('details',undefined,host,'plaid-trial-accounts plaid-trial-advanced');
    let amountsVisible=false,linkActive=false,exchangeInFlight=false,connectionComplete=false;
    function renderAccounts(snapshot){
      if(!host.isConnected)return;
      const expanded=accountsArea.open;
      accountsArea.replaceChildren();
      const items=Array.isArray(snapshot.accounts)?snapshot.accounts:[];
      elem('summary','Connected accounts ('+items.length+') · Manage',accountsArea);
      accountsArea.open=expanded;
      if(!items.length){
        elem('p','Your Plaid connection is secured. Discover accounts before choosing which ones to monitor.',accountsArea);
      }
      const selected=new Set(snapshot.monitoredAccounts||[]);
      elem('p',!items.length?'Discover accounts using the button below.':'Manage monitoring or optional bonus links here, or in Finances.',accountsArea,'plaid-trial-next-step');
      const options=elem('div',undefined,accountsArea,'plaid-trial-account-list');
      const available=typeof entries!=='undefined'&&Array.isArray(entries)
        ?entries.filter(e=>e&&!e.closed&&e.id!=null&&e.opened&&e.bank):[];
      const assignments=[];
      for(const account of items){
        const card=elem('section',undefined,options,'plaid-trial-account-card');
        const label=elem('label',undefined,card,'plaid-trial-check');
        const check=elem('input',undefined,label);check.type='checkbox';
        check.value=account.key;check.checked=selected.has(account.key);
        elem('span',[account.bank,account.name].filter(Boolean).join(' · '),label);
        if(available.length){
          const cycleLabel=elem('label','Link to bonus (optional)',card);
          const cycle=elem('select',undefined,cycleLabel);cycle.setAttribute('aria-label','Bonus campaign for '+account.name);
          const none=elem('option','No bonus linked',cycle);none.value='';
          const saved=snapshot.mappings?.[account.key];
          for(const entry of available){
            const option=elem('option',entry.bank+' · opened '+entry.opened,cycle);option.value=String(entry.id);
            if(saved?.entryId===String(entry.id)&&saved.bank===entry.bank&&saved.opened===entry.opened)option.selected=true;
          }
          cycle.disabled=!selected.has(account.key);
          const productLabel=elem('label','Bonus product (verified terms)',card);
          const product=elem('select',undefined,productLabel);product.setAttribute('aria-label','Bonus product for '+account.name);
          const fillProducts=()=>{
            product.replaceChildren();const none=elem('option','Not assigned — review manually',product);none.value='';
            const entry=available.find(e=>String(e.id)===cycle.value);
            const rules=entry?window.BTFinancialRules?.validate(entry):null;
            const products=rules?.ok&&rules.mode==='structured'&&Array.isArray(rules.rules?.accounts)?rules.rules.accounts:[];
            for(const value of products){const option=elem('option',value.label,product);option.value=value.id;}
            if(saved?.entryId===cycle.value&&saved.bank===entry?.bank&&saved.opened===entry?.opened&&products.some(p=>p.id===saved.productId))product.value=saved.productId;
            product.disabled=cycle.disabled||!products.length;
          };
          cycle.addEventListener('change',fillProducts);fillProducts();assignments.push({key:account.key,cycle,product});
        }
      }
      if(items.length){
        action(accountsArea,'Save monitored accounts',async()=>{
          const choices=[...options.querySelectorAll('input:checked')].map(n=>n.value);
          message.textContent='Saving monitoring preferences…';
          try{
            const result=await api('/accounts/monitoring',{method:'PUT',body:JSON.stringify({accounts:choices})});
            renderAccounts(result);
            message.textContent='Monitoring saved. Checking for available posted transactions…';
            try{
              const synced=await api('/accounts/sync',{method:'POST'});
              renderAccounts(synced);
              const count=Object.values(synced.transactions||{}).reduce(
                (total,rows)=>total+Object.keys(rows||{}).length,0);
              message.textContent=synced.error?'Monitoring saved · '+synced.error:
                'Monitoring saved · '+count+' posted transaction'+(count===1?'':'s')+
                ' available. Review all activity in Finances.';
              window.btRefreshFinancesPage?.();
            }catch(error){
              message.textContent='Monitoring saved; account activity can be reviewed after the next provider check. '+error.message;
              window.btRefreshFinancesPage?.();
            }
          }catch(error){message.textContent=error.message;}
        });
      }
      if(assignments.length)action(accountsArea,'Save bonus links',async()=>{
        const mappings={};
        for(const row of assignments){
          const entry=available.find(e=>String(e.id)===row.cycle.value);
          if(entry&&!row.cycle.disabled){
            mappings[row.key]={entryId:String(entry.id),bank:entry.bank,opened:entry.opened};
            if(row.product.value)mappings[row.key].productId=row.product.value;
          }
        }
        try{
          const result=await api('/accounts/selection',{method:'PUT',body:JSON.stringify({mappings})});
          message.textContent='Bonus links saved. Review possible deposits under Finances → Bonuses; milestones remain unconfirmed.';
          renderAccounts(result);
        }catch(error){message.textContent=error.message;}
      });
      action(accountsArea,items.length?'Sync selected activity':'Discover connected accounts',async()=>{
        message.textContent='Requesting read-only account status…';
        try{
          const result=await api('/accounts/sync',{method:'POST'});
          message.textContent=result.error||'Latest available provider data loaded. Review possible bonuses manually.';
          renderAccounts(result);
        }catch(error){message.textContent=error.message;}
      });
      const signals=Object.values(snapshot.transactions||{}).flatMap(rows=>Object.values(rows||{}))
        .filter(row=>!row.pending&&Array.isArray(row.signals)&&row.signals.some(v=>
          ['possible_bonus','possible_direct_deposit','possible_fee','possible_reversal'].includes(v)));
      if(signals.length){
        const review=elem('div',undefined,accountsArea,'plaid-trial-observations');
        elem('h5','Unverified activity for review',review);
        action(review,amountsVisible?'Hide amounts':'Show amounts',()=>{
          amountsVisible=!amountsVisible;renderAccounts(snapshot);
        });
        for(const row of signals.slice(0,5)){
          const label=elem('p',undefined,review);
          const flags=row.signals.filter(v=>v.startsWith('possible_'))
            .map(v=>v.replace(/^possible_/,'').replaceAll('_',' '));
          const amount=amountsVisible?(' · '+row.amount+' '+(row.currency||'USD')):' · ••••••';
          label.textContent=(row.merchant||row.description||'Transaction')+
            ' · '+flags.join(', ')+amount;
        }
        elem('p','These observations require review in Finances → Bonuses and do not automatically confirm payouts.',review);
      }
      if(snapshot.error)elem('p',snapshot.error,accountsArea,'plaid-trial-caution');
      if(snapshot.stale)elem('p','Provider data is stale or not yet synchronized.',accountsArea,'plaid-trial-caution');
    }
    async function loadAccounts(){
      if(!host.isConnected)return;
      try{
        const snapshot=await api('/accounts');
        if(host.isConnected&&snapshot.configured)renderAccounts(snapshot);
      }catch(error){if(host.isConnected)message.textContent=error.message}
    }
    const linkedNames=new Set((Array.isArray(linkedAccounts)?linkedAccounts:[])
      .map(a=>String(a.bank||'').trim().toLowerCase()).filter(Boolean));
    const status=()=>api().then(data=>{
      if(!host.isConnected)return;
      summary.textContent=data.used===null||data.used===undefined
        ?'Trial capacity not verified'
        :'Plaid Trial · '+data.used+'/10 used'+(data.reserved?' · '+data.reserved+' reserved':'');
      capacity.hidden=!Number.isFinite(data.used);
      if(!capacity.hidden){
        const occupied=Math.min(10,Math.max(0,data.used+(data.reserved||0)));
        capacityFill.style.width=(occupied*10)+'%';
        capacity.setAttribute('role','meter');capacity.setAttribute('aria-label','Plaid lifetime capacity used or reserved');
        capacity.setAttribute('aria-valuemin','0');capacity.setAttribute('aria-valuemax','10');capacity.setAttribute('aria-valuenow',String(occupied));
      }
      body.replaceChildren();
      if(!data.configured){
        elem('p','Plaid linking is locked until the free Trial plan, lifetime usage count, credentials and read-only transaction monitoring are verified. No connection or charge has been made.',body,'plaid-trial-caution');
        return;
      }
      elem('p','Each new bank login uses one permanent Trial slot. Reuse existing connections.',body,'plaid-trial-disclosure');
      if(Array.isArray(data.connected)&&data.connected.length)loadAccounts();
      if((data.remaining||0)<=0){
        elem('p','No unused Plaid Trial slots remain. Use SimpleFIN or manual entry. Paid upgrades are disabled.',body);
        return;
      }
      const plaidNames=new Set((Array.isArray(data.connected)?data.connected:[])
        .map(a=>String(a?.institution||'').trim().toLowerCase()).filter(Boolean));
      const label=elem('label','Bank name',body),name=elem('input',undefined,label);
      name.type='text';name.maxLength=100;name.placeholder='Search bank name (e.g. One Pay)';
      elem('p','Continue only if SimpleFIN could not connect this bank. A completed new Plaid login uses 1 permanent slot.',body,'plaid-trial-disclosure');
      const advanced=elem('details',undefined,body,'plaid-trial-advanced');
      advanced.hidden=true;
      elem('summary','This bank is already connected · Review',advanced);
      elem('p','Another login to the same bank consumes another permanent Trial slot. Manage the existing connection instead when possible.',advanced);
      const duplicate=elem('label',undefined,advanced,'plaid-trial-check');
      const relink=elem('input',undefined,duplicate);relink.type='checkbox';
      elem('span','Create an additional bank login anyway (another permanent slot).',duplicate);
      const updateDuplicate=()=>{
        const match=plaidNames.has(name.value.trim().toLowerCase());
        advanced.hidden=!match;
        if(!match){relink.checked=false;advanced.open=false}
      };
      name.addEventListener('input',updateDuplicate);
      const go=action(body,'Connect via Plaid · uses 1 lifetime slot',async()=>{
        if(linkActive){message.textContent='A Plaid Link session is already open.';return}
        const institution=name.value.trim();
        if(institution.length<2){message.textContent='Enter the institution name first.';return}
        if(linkedNames.has(institution.toLowerCase())){
          message.textContent='This bank is already linked in SimpleFIN. Reuse that connection instead of consuming a Plaid slot.';
          return;
        }
        if(plaidNames.has(institution.toLowerCase())&&!relink.checked){
          advanced.open=true;
          message.textContent='Already linked in Plaid. Reuse this connection, or explicitly allow another permanent slot above.';
          return;
        }
        linkActive=true;go.disabled=true;message.textContent='Requesting one safe Plaid Link session…';
        try{
          const result=await api('/link-token',{method:'POST',body:JSON.stringify({
            institution,triedSimplefin:true,understandsLifetimeSlot:true,allowDuplicate:relink.checked
          })});
          await loadLink();
          if(!host.isConnected)return;
          const link=window.Plaid.create({token:result.linkToken,
            onSuccess:async publicToken=>{
              // Plaid may close the Link overlay while this async exchange runs.
              // Keep CTA disabled, show a durable completion and never re-exchange.
              exchangeInFlight=true;
              message.textContent='Saving the bank connection securely…';
              try{
                await api('/exchange',{method:'POST',body:JSON.stringify({
                  session:result.session,publicToken
                })});
                connectionComplete=true;
                message.textContent='Bank connected. Discovering accounts…';
                let statusCode='pending',count=0;
                try{
                  const synced=await api('/accounts/sync',{method:'POST'});
                  count=(synced.accounts||[]).length;
                  statusCode=synced.error?'pending':'ready';
                  message.textContent=synced.error?
                    'Bank connected. Account discovery needs attention: '+synced.error:
                    'Bank connected · '+count+' account'+(count===1?'':'s')+
                    ' discovered. Enable read-only monitoring in Finances for transaction history.';
                }catch(error){
                  message.textContent='Bank connected. Account discovery was delayed: '+error.message+
                    '. Check connected accounts instead of reconnecting.';
                }
                // Do not depend on this wizard remaining mounted: Main app redraws
                // and the Plaid overlay can remove the original confirmation.
                window.dispatchEvent(new CustomEvent('bt:plaid-bank-connected',{
                  detail:{status:statusCode,count}
                }));
                try{await status()}catch(_error){/* Confirmation remains visible. */}
              }catch(error){
                message.textContent=error.message+
                  ' Check connected accounts before trying again; a permanent slot may already be consumed.';
              }finally{
                exchangeInFlight=false;linkActive=false;
                delete go.dataset.keepDisabled;
                if(go.isConnected)go.disabled=connectionComplete;
              }
            },
            onExit:()=>{
              if(exchangeInFlight||connectionComplete)return;
              linkActive=false;delete go.dataset.keepDisabled;go.disabled=false;
              message.textContent='Plaid Link closed. Check your connections before starting another login.';
            }
          });
          go.dataset.keepDisabled="true";link.open();
        }catch(error){linkActive=false;delete go.dataset.keepDisabled;message.textContent=error.message}
        finally{go.disabled=linkActive}
      });
    }).catch(error=>{if(host.isConnected){summary.textContent='Plaid slots used: unavailable / 10';message.textContent=error.message}});
    status();
  }
  window.BTLinkPlaidTrial=Object.freeze({mount});
})();
