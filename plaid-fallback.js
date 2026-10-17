/* SimpleFIN primary > Plaid Trial fallback > manual entry. Activity auto-syncs after authorized linking. */
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
        elem('p','Bank linked. Account discovery or its first transaction sync is pending.',accountsArea);
      }
      elem('p','Transactions sync automatically. Bonus links remain optional.',accountsArea,'plaid-trial-next-step');
      const options=elem('div',undefined,accountsArea,'plaid-trial-account-list');
      const available=typeof entries!=='undefined'&&Array.isArray(entries)
        ?entries.filter(e=>e&&!e.closed&&e.id!=null&&e.opened&&e.bank):[];
      const assignments=[];
      for(const account of items){
        const card=elem('section',undefined,options,'plaid-trial-account-card');
        const label=elem('div',undefined,card,'plaid-trial-account-heading');
        elem('strong',[account.bank,account.name].filter(Boolean).join(' · '),label);
        if(available.length){
          const cycleLabel=elem('label','Link to bonus (optional)',card);
          const cycle=elem('select',undefined,cycleLabel);cycle.setAttribute('aria-label','Bonus campaign for '+account.name);
          const none=elem('option','No bonus linked',cycle);none.value='';
          const saved=snapshot.mappings?.[account.key];
          for(const entry of available){
            const option=elem('option',entry.bank+' · opened '+entry.opened,cycle);option.value=String(entry.id);
            if(saved?.entryId===String(entry.id)&&saved.bank===entry.bank&&saved.opened===entry.opened)option.selected=true;
          }
          cycle.disabled=false;
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
          // First discovery is NOT proof of the opening date. Offer an explicit
          // one-tap review only for one exact institution/cycle/date-window match.
          const firstSeen=Number(account.firstSeenAt);
          const possibilities=available.filter(entry=>{
            const opened=Date.parse(entry.opened+'T00:00:00Z')/1000;
            return String(account.bank||'').trim().toLowerCase()===
                String(entry.bank||'').trim().toLowerCase()&&
              Number.isFinite(firstSeen)&&firstSeen>0&&Number.isFinite(opened)&&
              firstSeen>=opened&&firstSeen-opened<=30*86400;
          });
          if(!saved&&(snapshot.monitoredAccounts||[]).includes(account.key)&&possibilities.length===1){
            const suggested=possibilities[0];
            action(card,'Link to '+suggested.bank+' bonus?',async()=>{
              if(typeof window.btConfirmDialog!=='function'){
                message.textContent='Opening-date verification is unavailable. Use the manual account selector.';
                return;
              }
              const approved=await window.btConfirmDialog(
                'Plaid first discovered this account after your tracked '+suggested.bank+
                ' opening date. Discovery is not proof of account opening. Verify the real opening date ('+
                suggested.opened+'), institution and account before linking.',{
                  title:'Verify bonus-account match',confirmLabel:'I verified the opening date',
                  cancelLabel:'Not sure — cancel'});
              if(!approved)return;
              try{
                // Recheck after approval to avoid overwriting a link created on
                // another device or assigning an outdated Tracker campaign.
                const latest=await api('/accounts');
                const entry=available.find(e=>String(e.id)===String(suggested.id)&&
                  e.bank===suggested.bank&&e.opened===suggested.opened);
                const found=(latest.accounts||[]).find(a=>a.key===account.key);
                if(!entry||!found||latest.mappings?.[account.key]||
                   !(latest.monitoredAccounts||[]).includes(account.key)){
                  message.textContent='The account or bonus link changed. Refresh and review the selection.';
                  renderAccounts(latest);return;
                }
                const mappings={...latest.mappings,[account.key]:{
                  entryId:String(entry.id),bank:entry.bank,opened:entry.opened}};
                const result=await api('/accounts/selection',{method:'PUT',
                  body:JSON.stringify({mappings})});
                message.textContent='Confirmed bonus-account link saved. Requirement qualification remains unverified.';
                renderAccounts(result);
              }catch(error){message.textContent='Link not saved: '+error.message;}
            });
            elem('p','Suggestion only. Confirm the actual opening date; no account is linked automatically.',
              card,'plaid-trial-disclosure');
          }
        }
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
      elem('p','Newly linked Plaid institutions are imported automatically. History may still be loading while the bank prepares transactions.',accountsArea);
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
      if(Array.isArray(data.connected)&&data.connected.length){
        const banks=elem('div',undefined,body,'plaid-trial-connected-banks');
        for(const bank of data.connected){
          const row=elem('div',undefined,banks,'plaid-trial-connected-bank');
          elem('span',bank.institution||'Connected bank',row);
          if(bank.handle)action(row,'Remove',async()=>{
            const approved=await window.btConfirmDialog(
              'Disconnect '+(bank.institution||'this bank')+'? Saved account activity is removed, but bonus tracker entries stay. This does not restore the permanent Plaid Trial slot.',
              {title:'Remove Plaid bank?',confirmLabel:'Remove bank',danger:true});
            if(!approved)return;
            try{
              await api('/items/'+encodeURIComponent(bank.handle),{method:'DELETE'});
              message.textContent='Bank disconnected. Your bonus tracker entries are unchanged.';
              window.btRefreshFinancesPage?.();
              await status();
            }catch(error){message.textContent='Bank removal needs attention: '+error.message}
          });
        }
        loadAccounts();
      }
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
                message.textContent='Bank connected. Automatic account and transaction import has started.';
                let statusCode='pending',count=0;
                // The backend queues its first import as part of /exchange.
                // Read status only; never issue a second provider sync or
                // require the owner to click Discover.
                try{
                  const snapshot=await api('/accounts');
                  count=(snapshot.accounts||[]).length;
                  statusCode=count&&!snapshot.error?'ready':'pending';
                  message.textContent=count?
                    'Connected · '+count+' account'+(count===1?'':'s')+
                      ' found. Available transactions import automatically.':
                    'Bank connection saved. Account import is running automatically.';
                }catch(_error){
                  message.textContent='Bank connection saved. Server-side import will continue automatically.';
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
