/* SimpleFIN trial: owner-private evidence, no tracker writes or browser-stored bank tokens. */
(function(){
  'use strict';
  const API='https://api-production-00f74.up.railway.app/api/bonus-tracker/simplefin';
  let panel=null,data=null,busy=false,generation=0,returnFocus=null,hideBalances=false,accountFilter='',onboardingStep=0,addFlowOpen=false;
  const el=(tag,text,parent)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(parent)parent.append(n);return n;};
  const stamp=t=>typeof t==='number'&&t>0?new Date(t*1000).toLocaleString():'Not available';
  const money=(a,c)=>{if(a===null||a===undefined||a===''||!Number.isFinite(Number(a)))return 'Unavailable';if(!c)return String(a)+' (currency unknown)';try{return new Intl.NumberFormat(undefined,{style:'currency',currency:c}).format(Number(a));}catch{return String(a)+' '+String(c);}};
  const active=()=>typeof entries!=='undefined'&&Array.isArray(entries)?entries.filter(e=>!e.closed&&e.id&&e.opened):[];
  const snapshot=d=>window.BTFinanceOverview?.summarize(d)||null;
  async function request(path='',options={}){
    const auth=window.BTBonusAuth;if(!auth?.connected())throw Error('Sign in with your existing BonusTracker account first.');
    const rev=generation,token=await auth.token();
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),65000);
    try{
      const r=await fetch(API+path,{...options,credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},signal:controller.signal});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw Error(typeof d.detail==='string'?d.detail:'Bank syncing could not complete. Try again.');
      if(rev!==generation||!auth.connected())throw Error('Sign-in changed. Reopen bank syncing.');
      return d;
    }catch(e){if(e.name==='AbortError')throw Error('The request timed out. Refresh status before trying again.');throw e;}finally{clearTimeout(timer);}
  }
  function message(s){const n=panel?.querySelector('#bank-sync-message');if(n)n.textContent=s;}
  async function run(work){
    if(busy)return;
    busy=true;
    const controls=[...(panel?.querySelectorAll('button,select,textarea,input')||[])];
    const previous=controls.map(n=>n.disabled);
    controls.forEach(n=>n.disabled=true);
    try{await work();}
    catch(e){message(e.message);}
    finally{
      busy=false;
      // Restore original disabled states only on surviving controls. Newly painted
      // controls retain their own validation-dependent disabled state.
      controls.forEach((n,i)=>{if(n.isConnected)n.disabled=previous[i];});
    }
  }
  function button(parent,label,fn,cls='btn-s'){const b=el('button',label,parent);b.type='button';b.className=cls;b.onclick=()=>run(fn);return b;}
  function close(){if(busy)return;generation++;panel?.remove();panel=null;data=null;hideBalances=false;accountFilter='';onboardingStep=0;addFlowOpen=false;returnFocus?.focus();window.btRefreshFinancesPage?.();}
  function providerLink(parent,text,url,cls=''){
    const a=el('a',text,parent);
    a.href=url;a.target='_blank';a.rel='noopener noreferrer';
    if(cls)a.className=cls;
    return a;
  }
  function progressSteps(host,active,labels){
    const list=el('ol',undefined,host);list.className='bank-sync-steps';
    for(let i=0;i<labels.length;i++){
      const item=el('li',undefined,list);
      item.className=i<active?'bank-sync-step complete':i===active?'bank-sync-step current':'bank-sync-step';
      el('span',String(i+1),item);
      el('strong',labels[i],item);
      if(i===active)item.setAttribute('aria-current','step');
    }
  }
  function tokenForm(host){
    const field=el('label','SimpleFIN setup token',host),input=el('input',undefined,field);
    input.id='bank-sync-token';input.type='password';input.autocomplete='off';input.spellcheck=false;
    input.autocapitalize='off';input.placeholder='Paste your one-time setup token';
    input.setAttribute('aria-describedby','bank-sync-token-help');
    const help=el('p','Only paste the one-time token created by SimpleFIN. Never enter your bank password here. The token is sent once to your encrypted, private server connection and is not saved in this browser.',host);
    help.id='bank-sync-token-help';help.className='bank-sync-security-note';
    const actions=el('div',undefined,host);actions.className='bank-sync-wizard-actions';
    button(actions,'Back to authorization',async()=>{onboardingStep=0;paint()});
    const submit=button(actions,'Connect SimpleFIN',async()=>{
      const token=input.value.trim();input.value='';
      if(!token)throw Error('Paste the one-time setup token from SimpleFIN.');
      data=await request('/connect',{method:'POST',body:JSON.stringify({setup_token:token})});
      onboardingStep=0;paint();message(data.error||'Connection established. Select accounts to monitor and link to bonuses.');
    },'btn-p');
    submit.dataset.connectToken='';
    if(navigator.clipboard?.readText){
      button(actions,'Paste from clipboard',async()=>{
        const value=(await navigator.clipboard.readText()).trim();
        if(!value)throw Error('Clipboard is empty. Copy the setup token in SimpleFIN first.');
        input.value=value;input.focus();
      });
    }
    return input;
  }
  function onboarding(host){
    const card=el('section',undefined,host);card.className='bank-sync-onboarding';
    const head=el('div',undefined,card);head.className='bank-sync-onboarding-head';
    el('small','SECURE CONNECTION',head);el('h3','Connect a financial institution',head);
    el('p','Set up read-only account access in three clear steps. Your bank sign-in happens with SimpleFIN—not inside BonusTracker.',head);
    progressSteps(card,onboardingStep,['Authorize','Link to BonusTracker']);
    const step=el('section',undefined,card);step.className='bank-sync-onboarding-step';
    if(onboardingStep===0){
      el('h4','Authorize with SimpleFIN',step);
      el('p','Use SimpleFIN Bridge to sign in or register, add the institutions you want, and create a one-time app setup token.',step);
      const links=el('div',undefined,step);links.className='bank-sync-links bank-sync-wizard-links';
      providerLink(links,'1. Add banks in SimpleFIN','https://beta-bridge.simplefin.org/','bank-sync-primary-link');
      providerLink(links,'2. Get setup token','https://bridge.simplefin.org/simplefin/create');
      providerLink(links,'Check supported banks','https://beta-bridge.simplefin.org/search-institutions');
      el('p','Use Financial Institutions → New Connection at SimpleFIN to authorize your bank. Then choose Apps → New Connection or use the setup-token link above. Return here after copying your token.',step,'bank-sync-help');
      button(step,'I have a setup token →',async()=>{onboardingStep=1;paint();panel?.querySelector('#bank-sync-token')?.focus()},'btn-p');
    }else{
      el('h4','Finish linking to BonusTracker',step);
      el('p','Copy the one-time setup token from SimpleFIN and paste it below. You only need this step when first connecting or replacing access.',step);
      tokenForm(step);
    }
    const trust=el('div',undefined,card);trust.className='bank-sync-trust';
    el('strong','Read-only access · No payments or transfers',trust);
    el('small','BonusTracker never asks for bank credentials. You can revoke the connection in SimpleFIN. Provider subscriptions are managed separately.',trust);
    return card;
  }
  function paint(){
    if(!panel)return;
    const body=panel.querySelector('.bank-sync-body');body.replaceChildren();
    if(!window.BTBonusAuth?.connected()){
      el('h3','Use your existing sign-in',body);el('p','Sign in with the same account you use for cloud backup. Bank data stays private to that account.',body);
      const form=el('form',undefined,body),emailLabel=el('label','Email',form),email=el('input',undefined,emailLabel);email.type='email';email.autocomplete='username';email.required=true;
      const passLabel=el('label','Password',form),pass=el('input',undefined,passLabel);pass.type='password';pass.autocomplete='current-password';pass.required=true;
      const submit=el('button','Sign in',form);submit.type='submit';submit.className='btn-p';
      form.onsubmit=e=>{e.preventDefault();const password=pass.value;pass.value='';run(async()=>{await window.BTBonusAuth.signIn(email.value.trim(),password);data=await request();paint();});};return;
    }
    if(!data){button(body,'Load connection status',async()=>{data=await request();paint();});return;}
    if(!data.configured){el('h3','Server setup is not ready',body);el('p','Bank syncing is awaiting secure server configuration. You do not need to buy a subscription yet.',body);return;}
    if(!data.connected){onboarding(body);if(data.error)el('p',data.error,body);return;}
    const status=el('section',undefined,body);status.className='bank-sync-card';
    el('h3',data.status==='attention'?'Connection needs attention':'Connection active',status);
    el('p','Last synced: '+stamp(data.lastSuccess),status);
    el('p','Next sync: '+stamp(data.nextSyncAt)+'. Bank updates can take several days to appear.',status);
    el('p','Balances and transactions may be delayed. A connection alone does not confirm a completed transaction sync.',status);
    if(data.error)el('p',data.error,status);
    for(const warning of data.warnings||[])el('p',warning,status);
    if(data.missingAccounts?.length)el('p','A selected account was missing from the latest response. Its saved evidence is retained; this does not mean it is closed.',status);
    button(status,'Refresh status',async()=>{data=await request();paint();});
    button(status,'Check for transactions',async()=>{data=await request('/sync',{method:'POST'});paint();message('Sync requested. Provider data refreshes at most daily; earlier checks may show previously saved data. Check Last synced for confirmation.');});
    const addSection=el('section',undefined,body);addSection.className='bank-sync-card bank-sync-add-institution';
    el('h3','Add another bank',addSection);
    el('p','Keep your existing connection and bonus history. Connect your institution at SimpleFIN, then discover newly authorized accounts here.',addSection);
    const addHeader=el('div',undefined,addSection);addHeader.className='bank-sync-wizard-actions';
    button(addHeader,addFlowOpen?'Hide connection guide':'Start bank connection',async()=>{addFlowOpen=!addFlowOpen;paint()},'btn-p');
    const addLinks=el('div',undefined,addSection);addLinks.className='bank-sync-links';
    providerLink(addLinks,'Add bank in SimpleFIN ↗','https://beta-bridge.simplefin.org/','bank-sync-add-bank-link');
    providerLink(addLinks,'Check supported banks','https://beta-bridge.simplefin.org/search-institutions');
    if(addFlowOpen){
      const guide=el('div',undefined,addSection);guide.className='bank-sync-onboarding-step';
      progressSteps(guide,0,['Authorize bank at SimpleFIN','Discover accounts in BonusTracker']);
      el('p','1. Open SimpleFIN and choose Financial Institutions → New Connection. Complete the provider-hosted authorization. 2. Return here and select Refresh accounts. No replacement token or disconnect is needed.',guide);
    }else{
      el('p','Financial Institutions → New Connection in SimpleFIN. Return here to refresh accounts. Provider discovery may be limited to once daily.',addSection);
    }
    button(addSection,'Refresh accounts after adding bank',async()=>{
      const existingKeys=new Set((data.accounts||[]).map(a=>a.key));
      data=await request('/discover',{method:'POST'});
      const newlyFound=(data.accounts||[]).filter(a=>!existingKeys.has(a.key)).length;
      if(newlyFound)accountFilter='';
      addFlowOpen=false;paint();
      message(newlyFound
        ?'Found '+newlyFound+' new account'+(newlyFound===1?'':'s')+'. Select monitoring and link the appropriate bonus, then save.'
        :'No new accounts found yet. Confirm the institution was added in SimpleFIN; the provider may limit discovery to once per day.');
    },'btn-p');
    if(data.status==='attention'&&data.error){
      const recovery=el('details',undefined,status),summary=el('summary','Reconnect SimpleFIN',recovery);
      summary.title='Replace an expired or revoked connection';
      el('p','Use a new one-time SimpleFIN setup token to replace the connection. Saved account settings, transaction evidence and bonus links are retained.',recovery);
      const label=el('label','New SimpleFIN setup token',recovery),input=el('textarea',undefined,label);input.autocomplete='off';input.spellcheck=false;input.rows=3;
      button(recovery,'Reconnect securely',async()=>{const token=input.value.trim();input.value='';if(!token)throw Error('Paste the new setup token from SimpleFIN.');data=await request('/reconnect',{method:'POST',body:JSON.stringify({setup_token:token})});paint();message(data.error||'Connection replaced. Refresh accounts, then check for transactions when the next provider update is available. Revoke the old token in SimpleFIN if it remains active.');},'btn-p');
    }
    const totals=snapshot(data);
    const overview=el('section',undefined,body);overview.className='bank-sync-card';
    el('h3','Financial activity · last 30 days',overview);
    if(totals?.hasActivity){
      const metrics=el('div',undefined,overview);metrics.className='bank-sync-summary-grid';
      for(const [label,value] of [['Observed credits',hideBalances?'••••••':money(totals.credits,'USD')],['Observed debits',hideBalances?'••••••':money(totals.debits,'USD')],['Posted transactions',String(totals.observations)],['Bonus candidates',String(totals.candidates)]]){
        const metric=el('div',undefined,metrics);metric.className='bank-sync-summary-metric';el('small',label,metric);el('strong',value,metric);
      }
      el('p','Net observed movement: '+(hideBalances?'••••••':money(totals.net,'USD'))+'. This is not verified cash flow.',overview);
      if(totals.reversals)el('p',String(totals.reversals)+' possible reversal entries need review.',overview);
    }else el('p',totals?.hasSync?'No recent posted USD observations. This does not mean there was no account activity.':'No successful transaction retrieval yet. Enable monitoring and check after the next eligible provider sync.',overview);
    el('p','Partial posted transaction observations only. Credits include transfers and refunds; debits include transfers and purchases. These are not verified income, expenses or net worth.',overview);
    if(totals?.otherCurrencies?.length)el('p','Non-USD activity excluded from totals: '+totals.otherCurrencies.join(', '),overview);
    if(totals?.unusable)el('p',String(totals.unusable)+' amounts were omitted because they could not be summed safely.',overview);
    if(totals?.usdAccounts&&totals.sourceAccounts<totals.usdAccounts)el('p','Transaction data is incomplete for one or more selected USD accounts.',overview);
    if(totals?.missingAccounts)el('p','At least one selected account was missing from the latest saved account list.',overview);
    el('h3','Connected accounts',body);el('p',String((data.accounts||[]).length)+' connected · '+String((data.monitoredAccounts||[]).length)+' monitored · '+String(Object.keys(data.mappings||{}).length)+' linked to bonuses',body);button(body,hideBalances?'Show balances':'Hide balances',async()=>{hideBalances=!hideBalances;paint();});
    el('p','Choose which accounts to monitor for read-only posted transactions, independently of bank bonuses. Link a checking or savings account to its matching bonus only when the account is eligible. Financial activity is not proof of a qualifying direct deposit.',body);
    const available=active(),selects=[],monitors=[],monitored=new Set(data.monitoredAccounts||[]),accountCards=[];
    let search=null;
    if(data.accounts?.length){search=el('input',undefined,body);search.type='search';search.setAttribute('aria-label','Search connected accounts');search.placeholder='Search banks and accounts';search.value=accountFilter;}
    for(const a of data.accounts||[]){
      const card=el('section',undefined,body);card.className='bank-sync-card';
      const accountName=[a.bank,a.name].filter(Boolean).join(' · ')||'Bank account';
      el('h4',accountName,card);accountCards.push({card,name:accountName.toLowerCase()});
      card.hidden=!!accountFilter&&!accountName.toLowerCase().includes(accountFilter);
      el('p','Balance: '+(hideBalances?'••••••':money(a.balance,a.currency))+' · Available Balance: '+(hideBalances?'••••••':money(a.availableBalance,a.currency))+' · Last Updated: '+stamp(a.balanceDate),card);if(a.balanceDate&&data.lastSuccess&&a.balanceDate>data.lastSuccess)el('p','Balance timestamp is newer than the last recorded transaction sync; these are separate provider updates.',card);
      const monitorLabel=el('label',undefined,card);monitorLabel.className='bank-sync-monitor-label';
      const checkbox=el('input',undefined,monitorLabel);checkbox.type='checkbox';checkbox.checked=monitored.has(a.key);checkbox.dataset.account=a.key;
      el('span','Monitor transactions (read-only)',monitorLabel);monitors.push(checkbox);
      const label=el('label','Link to bonus (optional)',card),select=el('select',undefined,card);select.id='bank-sync-cycle-'+a.key;label.htmlFor=select.id;select.dataset.account=a.key;
      const empty=el('option','No bonus linked',select);empty.value='';
      const current=data.mappings?.[a.key];
      for(const e of available){const option=el('option',e.bank+' · '+(e.accountType||'personal')+' · opened '+e.opened,select);option.value=String(e.id);if(current?.entryId===String(e.id)&&current.opened===e.opened&&current.bank===e.bank)option.selected=true;}
      if(current&&!available.some(e=>String(e.id)===current.entryId&&e.opened===current.opened&&e.bank===current.bank))el('p','The saved cycle changed or is no longer open. Choose a current cycle or remove this match.',card);
      // Explicit user selection only. Never infer product from provider account name.
      const productLabel=el('label','Bonus product (verified terms)',card);
      const productSelect=el('select',undefined,card);
      productSelect.id='bank-sync-product-'+a.key;productLabel.htmlFor=productSelect.id;
      const productHelp=el('small',undefined,card);
      const fillProducts=()=>{
        productSelect.replaceChildren();
        const none=el('option','Not assigned — review manually',productSelect);none.value='';
        const selected=available.find(e=>String(e.id)===select.value);
        const verified=selected?window.BTFinancialRules?.validate(selected):null;
        const products=verified?.ok&&verified.mode==='structured'&&Array.isArray(verified.rules?.accounts)
          ?verified.rules.accounts:[];
        for(const product of products){
          const option=el('option',product.label+(product.required?' (required)':' (optional)'),productSelect);
          option.value=product.id;
        }
        const sameCycle=current?.entryId===String(selected?.id)&&current?.opened===selected?.opened&&current?.bank===selected?.bank;
        if(sameCycle&&products.some(p=>p.id===current.productId))productSelect.value=current.productId;
        productSelect.disabled=!products.length;
        productHelp.textContent=products.length
          ?'Choose the checking, savings or membership product. This supports safe candidate progress, not automatic promotion completion.'
          :'No verified product list. Import official T&C before enabling product-specific deposit progress.';
      };
      select.addEventListener('change',fillProducts);fillProducts();
      selects.push({cycle:select,product:productSelect});
    }
    if(search)search.oninput=()=>{accountFilter=search.value.trim().toLowerCase();for(const item of accountCards)item.card.hidden=!!accountFilter&&!item.name.includes(accountFilter);};
    if(!data.accounts?.length)el('p','No accounts were returned. Refresh the account list after checking SimpleFIN.',body);
    if(data.accounts?.length)button(body,'Save monitoring preferences',async()=>{
      const accounts=monitors.filter(c=>c.checked).map(c=>c.dataset.account);
      const removed=(data.monitoredAccounts||[]).filter(key=>!accounts.includes(key));
      if(removed.length&&!(await window.btConfirmDialog('Turning off monitoring removes this app’s saved transaction history for the selected account'+(removed.length===1?'':'s')+'. Bank bonus evidence remains only when the account is still linked to a bonus.',{title:'Stop transaction monitoring?',confirmLabel:'Stop monitoring',danger:true})))return;
      data=await request('/monitoring',{method:'PUT',body:JSON.stringify({accounts})});paint();
      message('Monitoring preferences saved. Only the selected accounts will be retrieved for independent activity, subject to the daily provider limit.');
    },'btn-p');
    button(body,'Save account matches',async()=>{
      const mappings={};for(const {cycle,product} of selects){const entry=available.find(e=>String(e.id)===cycle.value);if(entry){const mapping={entryId:String(entry.id),bank:entry.bank,opened:entry.opened};if(product.value&&[...product.options].some(option=>option.value===product.value&&option.value!==''))mapping.productId=product.value;mappings[cycle.dataset.account]=mapping;}}
      data=await request('/selection',{method:'PUT',body:JSON.stringify({mappings})});paint();message('Bonus links saved. Monitored accounts and linked bonus accounts are included in the next eligible check.');
    },'btn-p');
    el('h3','Recent transactions',body);
    el('p','Available posted and pending transactions are shown for the provider’s retained window. Pending activity is excluded from totals. Transfers, dividends and refunds can appear as deposits. Bonus candidates require review; this section never changes tracker milestones.',body);
    let shown=0;
    for(const a of data.accounts||[]){
      const mapping=data.mappings?.[a.key];const watched=monitored.has(a.key);
      const valid=mapping&&available.find(e=>String(e.id)===mapping.entryId&&e.opened===mapping.opened&&e.bank===mapping.bank);
      if(!watched&&!valid)continue;
      const section=el('section',undefined,body);section.className='bank-sync-card';el('h4',[a.bank,a.name].filter(Boolean).join(' · '),section);
      if(valid)el('p','Linked bonus: '+mapping.bank+' · opened '+mapping.opened+'. Bonus eligibility must be verified separately.',section);
      const cutoff=!watched&&valid?Date.parse(mapping.opened+'T00:00:00Z')/1000:0;
      const rows=Object.values(data.transactions?.[a.key]||{}).filter(r=>r.posted>=cutoff).sort((a,b)=>b.posted-a.posted);
      if(!rows.length)el('p','No posted transactions retrieved yet. This does not establish a zero balance, absent income or unpaid bonus.',section);
      for(const row of rows.slice(0,100)){
        shown++;const article=el('article',undefined,section);article.className='bank-sync-transaction';
        el('strong',row.pending?'Pending':row.kind==='possible_bonus'?'Possible bonus · review':row.kind==='possible_reversal'?'Possible bonus reversal · review':Number(row.amount)>0?'Deposit':'Withdrawal',article);
        el('p',(hideBalances?'••••••':money(row.amount,a.currency))+' · '+(row.pending?'pending':'posted')+' '+stamp(row.posted),article);el('p',row.description,article);
        if(row.category)el('small','Category: '+String(row.category).replaceAll('_',' ')+(row.categorySource==='user'?' · confirmed':' · automatic'),article);
        if(row.changedAt)el('small','Provider changed this transaction: '+stamp(row.changedAt),article);
      }
      if(rows.length>100)el('p','Showing the latest 100 transactions for this account.',section);
    }
    if(!shown)el('p','No transactions are available for monitored or bonus-linked accounts. Use Check for transactions after enabling monitoring; provider updates are limited to once daily.',body);
    button(body,'Disconnect and remove sync data',async()=>{
      if(!(await window.btConfirmDialog('Stop background syncing and remove this app’s saved bank-sync data? Your tracker entries stay intact. To revoke the token at SimpleFIN or cancel billing, also use your SimpleFIN account.',{title:'Disconnect SimpleFIN?',confirmLabel:'Disconnect',danger:true})))return;
      data=await request('',{method:'DELETE'});paint();message('Disconnected. Manage token revocation and subscription billing in SimpleFIN.');
    });
  }
  function open(options={}){
    if(panel){if(options.flow==='add'){addFlowOpen=true;paint();}return;}
    returnFocus=document.activeElement;generation++;data=null;onboardingStep=0;addFlowOpen=options.flow==='add';
    panel=el('div');panel.className='ov bank-sync-overlay';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','bank-sync-title');
    const modal=el('section',undefined,panel);modal.className='bank-sync-modal';
    const header=el('header',undefined,modal);el('h2','Financial accounts',header).id='bank-sync-title';el('p','Balances, connections and bonus monitoring',header);
    const body=el('div',undefined,modal);body.className='bank-sync-body';
    const footer=el('footer',undefined,modal);const msg=el('p','',footer);msg.id='bank-sync-message';msg.setAttribute('role','status');
    const done=el('button','Done',footer);done.className='btn-s';done.type='button';done.onclick=close;
    document.body.append(panel);paint();done.focus();if(window.BTBonusAuth?.connected())run(async()=>{data=await request();paint();});
  }
  function install(){
    const menu=document.querySelector('.header-data-panel');if(!menu||menu.querySelector('[data-bank-sync]'))return;
    const b=el('button',undefined,menu);b.type='button';b.dataset.bankSync='';el('strong','Financial accounts',b);el('small','Connections, balances and monitored activity',b);b.onclick=()=>{document.getElementById('bt-data-menu').open=false;open();};
  }
  window.btOpenBankSync=open;
  window.btRegisterPostRender?.('simplefin-bank-sync',install);install();
  document.addEventListener('keydown',e=>{if(!panel)return;if(e.key==='Escape'){close();return;}if(e.key==='Tab'){const controls=[...panel.querySelectorAll('button,input,select,textarea,a[href]')].filter(n=>!n.disabled&&n.getClientRects().length);const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
  window.addEventListener('storage',e=>{if(e.key==='bonus-ai-auth'&&panel){generation++;data=null;paint();}});
})();
