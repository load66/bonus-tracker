/* SimpleFIN trial: owner-private evidence, no tracker writes or browser-stored bank tokens. */
(function(){
  'use strict';
  const API='https://api-production-00f74.up.railway.app/api/bonus-tracker/simplefin';
  let panel=null,data=null,busy=false,generation=0,returnFocus=null,hideBalances=false,accountFilter='',view='accounts',wizardResult=null,changed=false;
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
      if(options.method&&options.method.toUpperCase()!=='GET')changed=true;
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
  function close(){
    if(busy)return;
    const mustRefresh=changed;
    generation++;panel?.remove();panel=null;data=null;changed=false;hideBalances=false;accountFilter='';view='accounts';wizardResult=null;
    returnFocus?.focus();
    // Opening a connection wizard or reading status must never disturb pending
    // financial edits in the parent view. Refresh only after a real mutation.
    if(mustRefresh)window.btRefreshFinancesPage?.();
  }
  function secureLink(parent,label,url,primary=false){
    const a=el('a',label,parent);
    a.href=url;a.target='_blank';a.rel='noopener noreferrer';
    a.className='bank-connect-link'+(primary?' bank-connect-link-primary':'');
    return a;
  }
  function connectFlow(body){
    const connected=Boolean(data?.connected);
    const shell=el('section',undefined,body);shell.className='bank-connect-flow';
    const top=el('div',undefined,shell);top.className='bank-connect-header';
    el('span','SECURE BANK CONNECTION',top).className='bank-connect-kicker';
    el('h3',connected?'Add a financial institution':'Connect your first bank',top);
    el('p','Complete authorization through SimpleFIN, then return to BonusTracker to manage your connected accounts.',top);
    const steps=el('ol',undefined,shell);steps.className='bank-connect-steps';
    for(const [n,label] of [['01','Open secure connection'],['02',connected?'Authorize your bank':'Get a one-time token'],['03',connected?'Find your accounts':'Finish in BonusTracker']]){
      const li=el('li',undefined,steps);
      el('b',n,li);el('span',label,li);
    }
    const external=el('section',undefined,shell);external.className='bank-connect-stage';
    el('h4','1. Open the bank connection',external);
    el('p','Sign in with your SimpleFIN account and choose Financial Institutions → Add a bank. Your bank credentials and any verification codes are entered only on the provider or bank’s secure site.',external);
    const links=el('div',undefined,external);links.className='bank-connect-actions';
    secureLink(links,'Continue securely to SimpleFIN ↗','https://beta-bridge.simplefin.org/',true);
    secureLink(links,'Check supported banks ↗','https://beta-bridge.simplefin.org/search-institutions');
    el('p','SimpleFIN requires a separate provider authorization screen. BonusTracker never asks for your bank password or verification code.',external).className='bank-connect-security';
    const finish=el('section',undefined,shell);finish.className='bank-connect-stage';
    if(connected){
      el('h4','2. Return and find your newly authorized accounts',finish);
      el('p','After adding the bank in SimpleFIN, return to this window and select Find my accounts. We keep your existing linked bonuses, transaction history and monitoring settings.',finish);
      const btn=button(finish,'I authorized my bank — Find my accounts',async()=>{
        const old=new Set((data.accounts||[]).map(a=>a.key));
        data=await request('/discover',{method:'POST'});
        const added=(data.accounts||[]).filter(a=>!old.has(a.key)).length;
        if(added)accountFilter='';
        wizardResult=added?'Found '+added+' new account'+(added===1?'':'s')+'.':'No new accounts were returned.';
        paint();
        message(added
          ?'New accounts found. Review their monitoring and bonus links before saving.'
          :'No accounts appeared yet. Confirm the bank is authorized in SimpleFIN. Discovery may be limited to once per 24 hours.');
      },'btn-p');
      btn.classList.add('bank-connect-finish');
      el('p','SimpleFIN may limit discovery to one request per 24 hours. Newly authorized banks can also take time to appear; this button does not force the bank to refresh sooner.',finish);
      if(wizardResult){
        const notice=el('p',wizardResult,finish);notice.className='bank-connect-outcome';notice.setAttribute('role','status');
      }
    }else{
      el('h4','2. Authorize BonusTracker using a one-time token',finish);
      el('p','After authorizing your bank, choose Apps → New Connection in SimpleFIN, then copy the one-time setup token. Return here to finish linking BonusTracker.',finish);
      secureLink(finish,'Get my SimpleFIN setup token ↗','https://bridge.simplefin.org/simplefin/create');
      const label=el('label','One-time SimpleFIN setup token',finish),input=el('textarea',undefined,label);
      input.id='bank-sync-token';input.autocomplete='off';input.spellcheck=false;input.rows=3;
      input.placeholder='Paste the one-time token from SimpleFIN';
      const btn=button(finish,'Connect my accounts securely',async()=>{
        const token=input.value.trim();input.value='';
        if(!token)throw Error('Paste the one-time setup token from SimpleFIN.');
        data=await request('/connect',{method:'POST',body:JSON.stringify({setup_token:token})});
        wizardResult='Connected. '+(data.accounts||[]).length+' account'+((data.accounts||[]).length===1?'':'s')+' available.';
        paint();
        message('SimpleFIN connection saved securely. Review accounts and enable monitoring only where needed.');
      },'btn-p');
      btn.classList.add('bank-connect-finish');
      el('p','The setup token is single-use and exchanged securely by the BonusTracker backend. Do not share it in messages, screenshots or email.',finish);
    }
    const fallback=el('details',undefined,shell);fallback.className='bank-connect-fallback';
    el('summary','Plaid Trial fallback · only when SimpleFIN is unsupported',fallback);
    const fallbackBody=el('div',undefined,fallback);
    window.BTLinkPlaidTrial?.mount(fallbackBody,data?.accounts||[]);
    const back=el('div',undefined,shell);back.className='bank-connect-bottom';
    button(back,connected?'Back to connected accounts':'Back to connection options',async()=>{view='accounts';wizardResult=null;paint();});
    if(connected&&wizardResult)button(back,'Review account settings',async()=>{view='accounts';wizardResult=null;paint();},'btn-p');
  }
  function paint(){
    if(!panel)return;
    const body=panel.querySelector('.bank-sync-body');body.replaceChildren();
    if(!window.BTBonusAuth?.connected()){
      el('h3','Use your existing sign-in',body);el('p','Sign in with the same account you use for cloud backup. Bank data stays private to that account.',body);
      const form=el('form',undefined,body),emailLabel=el('label','Email',form),email=el('input',undefined,emailLabel);email.type='email';email.autocomplete='username';email.required=true;
      const passLabel=el('label','Password',form),pass=el('input',undefined,passLabel);pass.type='password';pass.autocomplete='current-password';pass.required=true;
      const submit=el('button','Sign in',form);submit.type='submit';submit.className='btn-p';
      form.onsubmit=e=>{e.preventDefault();const password=pass.value;pass.value='';run(async()=>{await window.BTBonusAuth.signIn(email.value.trim(),password);changed=true;data=await request();paint();});};return;
    }
    if(!data){button(body,'Load connection status',async()=>{data=await request();paint();});return;}
    if(!data.configured){el('h3','Server setup is not ready',body);el('p','Bank syncing is awaiting secure server configuration. You do not need to buy a subscription yet.',body);return;}
    if(view==='add-bank'){connectFlow(body);return;}
    if(!data.connected){
      el('h3','Connect a financial institution',body);
      button(body,'Guided secure bank connection',async()=>{view='add-bank';wizardResult=null;paint();},'btn-p');
      el('p','Check supported institutions before subscribing. Authorize only accounts you intend to share. SimpleFIN manages bank authorization and billing separately.',body);
      const links=el('div',undefined,body);links.className='bank-sync-links';
      for(const [label,url] of [['1. Add banks in SimpleFIN','https://beta-bridge.simplefin.org/'],['2. Get setup token','https://bridge.simplefin.org/simplefin/create'],['Check supported banks','https://beta-bridge.simplefin.org/search-institutions']]){const a=el('a',label,links);a.href=url;a.target='_blank';a.rel='noopener noreferrer';}
      el('p','First add your banks under Financial Institutions in SimpleFIN. Then use Apps → New Connection to create a one-time setup token for BonusTracker. Paste that token here. Bank logins are completed in SimpleFIN, not BonusTracker. Never share bank passwords or tokens in chat.',body);
      const label=el('label','SimpleFIN setup token',body),input=el('textarea',undefined,label);input.id='bank-sync-token';input.autocomplete='off';input.spellcheck=false;input.rows=3;
      button(body,'Connect SimpleFIN',async()=>{const token=input.value.trim();input.value='';if(!token)throw Error('Paste the setup token from SimpleFIN.');data=await request('/connect',{method:'POST',body:JSON.stringify({setup_token:token})});paint();if(data.error)message(data.error);},'btn-p');
      if(data.error)el('p',data.error,body);return;
    }
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
    // The institution chooser lives in the SimpleFIN Bridge, not BonusTracker.
    // Keep the external authorization clearly separated from this read-only app.
    const addSection=el('section',undefined,body);addSection.className='bank-sync-card bank-sync-add-institution';
    el('h3','Add another bank',addSection);
    button(addSection,'Connect a bank — guided setup',async()=>{view='add-bank';wizardResult=null;paint();},'btn-p');
    el('p','New banks are authorized inside your existing SimpleFIN Bridge account—not from the account list below. You do not need to disconnect your current BonusTracker connection.',addSection);
    const addLinks=el('div',undefined,addSection);addLinks.className='bank-sync-links';
    const addLink=el('a','Add bank in SimpleFIN ↗',addLinks);
    addLink.href='https://beta-bridge.simplefin.org/';addLink.target='_blank';addLink.rel='noopener noreferrer';
    addLink.className='bank-sync-add-bank-link';
    const supportedLink=el('a','Check supported banks',addLinks);
    supportedLink.href='https://beta-bridge.simplefin.org/search-institutions';
    supportedLink.target='_blank';supportedLink.rel='noopener noreferrer';
    el('p','1. Open SimpleFIN and choose Financial Institutions → New Connection. 2. Authorize the new bank. 3. Return here and choose Refresh accounts. The provider may limit account discovery to one refresh every 24 hours.',addSection);
    button(addSection,'Refresh accounts after adding bank',async()=>{
      const existingKeys=new Set((data.accounts||[]).map(a=>a.key));
      data=await request('/discover',{method:'POST'});
      const newlyFound=(data.accounts||[]).filter(a=>!existingKeys.has(a.key)).length;
      if(newlyFound)accountFilter=''; // Make newly discovered accounts visible even after searching the old bank.
      paint();
      message(newlyFound
        ?'Found '+newlyFound+' new account'+(newlyFound===1?'':'s')+'. Select monitoring and link any appropriate bank bonus, then save your preferences.'
        :'No new accounts appeared. Confirm the bank was added in SimpleFIN. Discovery can be limited to once per day, and provider updates may be delayed.');
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
  function open(mode='accounts'){
    if(panel){view=mode==='add-bank'?'add-bank':'accounts';wizardResult=null;paint();return;}
    returnFocus=document.activeElement;generation++;data=null;changed=false;view=mode==='add-bank'?'add-bank':'accounts';wizardResult=null;
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
  window.btOpenBankConnectFlow=()=>open('add-bank');
  window.btRegisterPostRender?.('simplefin-bank-sync',install);install();
  document.addEventListener('keydown',e=>{if(!panel)return;if(e.key==='Escape'){close();return;}if(e.key==='Tab'){const controls=[...panel.querySelectorAll('button,input,select,textarea,a[href]')].filter(n=>!n.disabled&&n.getClientRects().length);const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
  window.addEventListener('storage',e=>{if(e.key==='bonus-ai-auth'&&panel){generation++;data=null;paint();}});
})();
