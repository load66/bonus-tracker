/* SimpleFIN trial: owner-private evidence, no tracker writes or browser-stored bank tokens. */
(function(){
  'use strict';
  const API='https://api-production-00f74.up.railway.app/api/bonus-tracker/simplefin';
  let panel=null,data=null,busy=false,generation=0,returnFocus=null,hideBalances=false,accountFilter='',view='accounts',wizardResult=null,changed=false;
  const BANK_OPTIONS=['Chase','Robinhood','Schwab','Citibank','Lafayette FCU','Capital One','Wells Fargo','Bank of America','U.S. Bank','Discover','Fidelity','OnePay','X Money','SoFi','Navy Federal','Regions','Equity Bank','PayPal','Webull'];
  const FLOW_KEY='bt_bank_add_step_v1';
  let selectedBank='',wizardStage='choose',awaitingReturn=false,lastReturnCheck=0,guidedTries=0,plaidSlots=null,foundAccounts=[];
  try{
    const saved=JSON.parse(sessionStorage.getItem(FLOW_KEY)||'null');
    if(saved&&typeof saved.bank==='string'&&saved.bank.length<=100&&['choose','route','simplefin','plaid','found'].includes(saved.stage)){
      selectedBank=saved.bank;wizardStage=saved.stage;awaitingReturn=saved.awaiting===true;
    }
  }catch(_e){}
  function rememberStep(){
    try{sessionStorage.setItem(FLOW_KEY,JSON.stringify({bank:selectedBank,stage:wizardStage,awaiting:awaitingReturn}))}catch(_e){}
  }
  function forgetStep(){selectedBank='';wizardStage='choose';awaitingReturn=false;guidedTries=0;foundAccounts=[];try{sessionStorage.removeItem(FLOW_KEY)}catch(_e){}}
  async function checkPlaidCapacity(){
    const auth=window.BTBonusAuth;if(!auth?.connected())return;
    const token=await auth.token();
    const r=await fetch('https://api-production-00f74.up.railway.app/api/bonus-tracker/plaid',{
      method:'GET',headers:{Authorization:'Bearer '+token},
      credentials:'omit',cache:'no-store'});
    if(!r.ok)throw Error('Plaid capacity is unavailable.');
    const result=await r.json();
    if(!auth.connected())throw Error('Sign-in changed.');
    plaidSlots=result;return result;
  }
  const el=(tag,text,parent)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(parent)parent.append(n);return n;};
  const stamp=t=>typeof t==='number'&&t>0?new Date(t*1000).toLocaleString():'Not synced';
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
  async function discoverAccounts(guided=false){
    if(!data?.connected){view='add-bank';paint();message('Connect SimpleFIN first.');return}
    const old=new Set((data.accounts||[]).map(a=>a.key));
    wizardResult=guided?'Looking for your new bank…':null;paint();
    data=await request(guided?'/discover-guided':'/discover',{method:'POST'});
    foundAccounts=(data.accounts||[]).filter(a=>!old.has(a.key));
    const expected=selectedBank.trim().toLowerCase();
    const matching=foundAccounts.filter(a=>!expected||String(a.bank||'').toLowerCase().includes(expected)||
      expected.includes(String(a.bank||'').toLowerCase())&&String(a.bank||'').length>2);
    if(foundAccounts.length){
      accountFilter='';wizardStage='found';awaitingReturn=false;rememberStep();
      const display=(matching.length?matching:foundAccounts);
      wizardResult='Found '+(display[0].bank||selectedBank||'bank')+' · '+display.length+
        ' account'+(display.length===1?'':'s')+'.';
      window.btRefreshFinancesPage?.();
    }else{
      wizardResult=guided
        ?'SimpleFIN is still connecting '+(selectedBank||'your bank')+'. We will check again within the provider limit.'
        :'No new accounts yet. Check the bank authorization in SimpleFIN.';
      if(guided&&awaitingReturn&&guidedTries<3&&panel){
        const then=Math.max(Date.now()+195000,(data.nextGuidedDiscoveryAt||0)*1000+15000);
        const current=generation;
        setTimeout(()=>{
          if(panel&&generation===current&&awaitingReturn&&document.visibilityState==='visible'&&!busy){
            guidedTries++;lastReturnCheck=Date.now();run(()=>discoverAccounts(true));
          }
        },Math.min(360000,then-Date.now()));
      }
    }
    paint();
    message(wizardResult);
  }
  function triggerReturnCheck(){
    if(!panel&&awaitingReturn&&window.BTBonusAuth?.connected()){open('add-bank');return}
    if(!panel||view!=='add-bank'||wizardStage!=='simplefin'||!data?.connected||
       !awaitingReturn||busy||document.visibilityState==='hidden')return;
    if(Date.now()-lastReturnCheck<160000)return;
    lastReturnCheck=Date.now();guidedTries++;
    run(()=>discoverAccounts(true));
  }
  function validSetupToken(input){
    const value=String(input||'').trim();
    if(!/^[A-Za-z0-9+/]+={0,2}$/.test(value)||value.length<16||value.length>4096)
      return false;
    try{
      const decoded=atob(value),u=new URL(decoded);
      return u.protocol==='https:'&&['bridge.simplefin.org','beta-bridge.simplefin.org'].includes(u.hostname)&&
        !u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&
        /^\/simplefin\/claim\/[A-Za-z0-9_-]+$/.test(u.pathname);
    }catch(_e){return false}
  }
  function connectFlow(body){
    const connected=Boolean(data?.connected);
    const root=el('section',undefined,body);root.className='bank-connect-flow finance-guided-bank-sheet';
    const header=el('div',undefined,root);header.className='bank-connect-header';
    el('span','ADD BANK · SECURE CONNECTION',header).className='bank-connect-kicker';
    el('h3',selectedBank?'Add '+selectedBank:'Find your bank',header);
    const stages=['choose','route',connected?'simplefin':'simplefin','found'];
    const steps=el('div',undefined,header);steps.className='bank-connect-progress';
    const stageNumber=Math.max(0,stages.indexOf(wizardStage));
    for(let i=0;i<4;i++){const dot=el('span',i===stageNumber?'●':'○',steps);dot.setAttribute('aria-label','Step '+(i+1)+(i===stageNumber?' current':''))}
    const area=el('section',undefined,root);area.className='bank-connect-stage';
    if(wizardStage==='choose'){
      el('p','Search for the bank you want to add. Connection details stay with the provider.',area);
      const query=el('input',undefined,area);query.type='search';query.maxLength=100;query.className='bank-connect-bank-search';
      query.placeholder='Search banks';query.setAttribute('aria-label','Search banks');query.value=selectedBank;
      const list=el('div',undefined,area);list.className='bank-connect-bank-choices';
      const results=()=>{
        list.replaceChildren();
        const typed=query.value.trim();
        const names=BANK_OPTIONS.filter(bank=>!typed||bank.toLowerCase().includes(typed.toLowerCase())).slice(0,9);
        if(typed.length>=2&&!names.some(n=>n.toLowerCase()===typed.toLowerCase()))names.push(typed);
        for(const bank of names){
          const choice=button(list,'◉  '+bank,async()=>{
            selectedBank=bank;wizardStage='route';rememberStep();paint();
          },'bank-connect-bank-choice');
          choice.setAttribute('aria-label','Choose '+bank);
        }
        if(!names.length)el('p','Enter a bank name to continue.',list);
      };
      query.oninput=results;results();
    }else if(wizardStage==='route'){
      el('p','Choose how to securely connect '+selectedBank+'.',area);
      el('p',connected?'SimpleFIN is already set up. No new setup token is needed.':
        'SimpleFIN setup is required once, then new institutions can be added from its website.',area);
      button(area,'Connect with SimpleFIN · recommended',async()=>{
        wizardStage='simplefin';rememberStep();paint();
      },'btn-p bank-connect-route');
      el('small','SimpleFIN supports up to 25 banks · subscription $15/year plus tax or $1.50/month plus tax.',area);
      const remaining=Number.isInteger(plaidSlots?.remaining)?plaidSlots.remaining:null;
      const canPlaid=plaidSlots?.configured===true&&remaining>0;
      const label=remaining===null?'Plaid Trial slots unavailable':
        'Connect with Plaid · uses 1 of '+remaining+' remaining slots';
      const plaids=button(area,label,async()=>{wizardStage='plaid';rememberStep();paint()},'btn-s bank-connect-route');
      plaids.disabled=!canPlaid;
      el('small','Plaid Trial: '+(remaining===null?'capacity not verified':remaining+' of '+plaidSlots.limit+' lifetime slots left')+
        '. A completed Plaid login permanently consumes a slot even if later disconnected.',area);
    }else if(wizardStage==='plaid'){
      el('p','Plaid is a fallback when SimpleFIN cannot connect this institution. One completed bank login consumes a permanent Trial slot.',area);
      const mount=el('div',undefined,area);
      window.BTLinkPlaidTrial?.mount(mount,data?.accounts||[],selectedBank);
    }else if(wizardStage==='found'){
      el('h4',wizardResult||'Accounts discovered',area);
      const accounts=foundAccounts.length?foundAccounts:(data.accounts||[]).filter(a=>String(a.bank||'').toLowerCase().includes(selectedBank.toLowerCase()));
      for(const a of accounts){
        const line=el('div',undefined,area);line.className='bank-connect-found-account';
        el('strong',a.name||'Connected account',line);
        el('small',[a.bank,a.mask?'··'+a.mask:''].filter(Boolean).join(' · '),line);
        const saved=data.accountProfiles?.[a.key]||{};
        const toggle=el('label',undefined,line);toggle.className='bank-connect-toggle';
        const box=el('input',undefined,toggle);box.type='checkbox';box.checked=saved.syncEnabled!==false;
        el('span','Sync activity',toggle);
        box.onchange=()=>run(async()=>{
          const profiles={};
          profiles[a.key]={kind:saved.kind||'unclassified',order:saved.order??499,
            balanceMode:saved.balanceMode||'exclude',syncEnabled:box.checked};
          data=await request('/account-profiles',{method:'PUT',body:JSON.stringify({profiles})});
          message('Account preference saved.');paint();
        });
      }
      button(area,'Done · view connected accounts',async()=>{view='accounts';forgetStep();paint()},'btn-p');
    }else{
      if(connected){
        el('h4','Add '+selectedBank+' on SimpleFIN',area);
        el('p','1. Sign in to SimpleFIN',area);
        el('p','2. Add '+selectedBank+' under Financial Institutions',area);
        el('p','3. Return to BonusTracker · detection runs automatically',area);
        const go=secureLink(area,'Open SimpleFIN in new tab ↗','https://beta-bridge.simplefin.org/',true);
        go.onclick=()=>{awaitingReturn=true;lastReturnCheck=Date.now()-180000;guidedTries=0;rememberStep();message('After authorizing your bank, return here to detect new accounts.')};
        if(wizardResult){const status=el('p',wizardResult,area);status.setAttribute('role','status');status.className='bank-connect-outcome'}
        const check=button(area,'Check again',()=>discoverAccounts(true),'btn-s');
        check.disabled=Date.now()<(data.nextGuidedDiscoveryAt||0)*1000;
        if(check.disabled)el('small','Next eligible check: '+stamp(data.nextGuidedDiscoveryAt),area);
      }else{
        el('h4','Connect SimpleFIN to BonusTracker once',area);
        el('p','1. Create your SimpleFIN account · $15/year plus tax (or $1.50/month plus tax)',area);
        secureLink(area,'Create or sign in to SimpleFIN ↗','https://beta-bridge.simplefin.org/',true);
        el('p','2. Add '+selectedBank+' in SimpleFIN',area);
        el('p','3. Create a one-time setup token',area);
        secureLink(area,'Create setup token ↗','https://bridge.simplefin.org/simplefin/create');
        el('p','4. Paste the setup token here',area);
        const field=el('textarea',undefined,area);field.id='bank-sync-token';field.rows=2;field.spellcheck=false;
        field.autocomplete='off';field.placeholder='Paste one-time setup token';field.setAttribute('aria-label','SimpleFIN setup token');
        const hint=el('p','',area);hint.setAttribute('role','status');
        const submit=button(area,'Connect securely',async()=>{
          const token=field.value.trim();
          if(!validSetupToken(token)){hint.textContent='This is not a valid SimpleFIN setup token. Create a new token and paste the full value.';return}
          field.value='';
          try{
            data=await request('/connect',{method:'POST',body:JSON.stringify({setup_token:token})});
            foundAccounts=data.accounts||[];wizardStage='found';
            wizardResult='Found '+(foundAccounts[0]?.bank||selectedBank)+' · '+foundAccounts.length+' account'+(foundAccounts.length===1?'':'s');
            rememberStep();paint();window.btRefreshFinancesPage?.();
          }catch(error){
            hint.textContent='Could not connect. '+error.message+' If this token was already used, create a new one.';
          }
        },'btn-p');submit.disabled=true;
        field.oninput=()=>{submit.disabled=!validSetupToken(field.value);hint.textContent=field.value&&!validSetupToken(field.value)?'Paste a complete SimpleFIN setup token.':''};
        button(area,'Paste from clipboard',async()=>{
          try{field.value=(await navigator.clipboard.readText()).trim();field.oninput();field.focus()}
          catch(_e){hint.textContent='Clipboard permission unavailable. Paste using your keyboard instead.'}
        });
      }
    }
    if(wizardStage!=='choose'&&wizardStage!=='found')
      button(root,'‹ Back',async()=>{
        wizardStage=wizardStage==='route'?'choose':'route';awaitingReturn=false;rememberStep();paint();
      },'btn-s');
    const help=el('details',undefined,root);help.className='bank-connect-security-details';
    el('summary','Connection and privacy',help);
    el('p','Your bank credentials stay with SimpleFIN or Plaid. BonusTracker never asks for them. Existing accounts stay connected.',help);
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
      el('p','SimpleFIN authorization is secure and separate. Connect once; add banks any time.',body);
      button(body,'Guided secure bank connection',async()=>{view='add-bank';wizardResult=null;paint();},'btn-p');
      if(data.error)el('p',data.error,body);
      return;
    }
    const status=el('section',undefined,body);status.className='bank-sync-card';
    el('h3',data.status==='attention'?'Connection needs attention':'Connection active',status);
    el('p','Last sync: '+stamp(data.lastSuccess),status);
    if(Number.isFinite(data.nextSyncAt)&&data.nextSyncAt>0)el('p','Next check: '+stamp(data.nextSyncAt),status);

    if(data.error)el('p',data.error,status);
    for(const warning of data.warnings||[])el('p',warning,status);
    if(data.missingAccounts?.length)el('p','A selected account was missing from the latest response. Its saved evidence is retained; this does not mean it is closed.',status);
    button(status,'Refresh status',async()=>{data=await request();paint();});
    button(status,'Check for transactions',async()=>{data=await request('/sync',{method:'POST'});paint();message('Sync requested. Provider data refreshes at most daily; earlier checks may show previously saved data. Check Last synced for confirmation.');});
    // The institution chooser lives in the SimpleFIN Bridge, not BonusTracker.
    // Keep the external authorization clearly separated from this read-only app.
    const addSection=el('section',undefined,body);addSection.className='bank-sync-card bank-sync-add-institution';
    el('h3','Add or find an account',addSection);
    button(addSection,'Add bank',async()=>{view='add-bank';wizardResult=null;paint();},'btn-p');

    const addLinks=el('div',undefined,addSection);addLinks.className='bank-sync-links';
    const addLink=el('a','Add bank in SimpleFIN ↗',addLinks);
    addLink.href='https://beta-bridge.simplefin.org/';addLink.target='_blank';addLink.rel='noopener noreferrer';
    addLink.className='bank-sync-add-bank-link';
    const supportedLink=el('a','Check supported banks',addLinks);
    supportedLink.href='https://beta-bridge.simplefin.org/search-institutions';
    supportedLink.target='_blank';supportedLink.rel='noopener noreferrer';

    button(addSection,'Discover accounts',discoverAccounts,'btn-p');
    el('p','Already authorized a bank? Discover accounts. New provider accounts may take up to a day.',addSection);

    if(data.status==='attention'&&data.error){
      const recovery=el('details',undefined,status),summary=el('summary','Reconnect SimpleFIN',recovery);
      summary.title='Replace an expired or revoked connection';
      el('p','Use a new one-time SimpleFIN setup token to replace the connection. Saved account settings, transaction evidence and bonus links are retained.',recovery);
      const label=el('label','New SimpleFIN setup token',recovery),input=el('textarea',undefined,label);input.autocomplete='off';input.spellcheck=false;input.rows=3;
      button(recovery,'Reconnect securely',async()=>{const token=input.value.trim();input.value='';if(!token)throw Error('Paste the new setup token from SimpleFIN.');data=await request('/reconnect',{method:'POST',body:JSON.stringify({setup_token:token})});paint();message(data.error||'Connection replaced. Transactions continue syncing automatically when the provider allows. Revoke the old token in SimpleFIN if it remains active.');},'btn-p');
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
    }else el('p',totals?.hasSync?'No recent posted USD observations. This does not mean there was no account activity.':'Connected accounts sync automatically. Initial transactions may still be processing.',overview);
    el('p','Partial posted transaction observations only. Credits include transfers and refunds; debits include transfers and purchases. These are not verified income, expenses or net worth.',overview);
    if(totals?.otherCurrencies?.length)el('p','Non-USD activity excluded from totals: '+totals.otherCurrencies.join(', '),overview);
    if(totals?.unusable)el('p',String(totals.unusable)+' amounts were omitted because they could not be summed safely.',overview);
    if(totals?.usdAccounts&&totals.sourceAccounts<totals.usdAccounts)el('p','Transaction data is incomplete for one or more selected USD accounts.',overview);
    if(totals?.missingAccounts)el('p','At least one selected account was missing from the latest saved account list.',overview);
    el('h3','Connected accounts',body);el('p',String((data.accounts||[]).length)+' accounts · automatic read-only sync · '+String(Object.keys(data.mappings||{}).length)+' bonus links',body);button(body,hideBalances?'Show balances':'Hide balances',async()=>{hideBalances=!hideBalances;paint();});
    el('p','Transactions from supported accounts sync automatically. Bonus links remain optional; financial activity is not proof of a qualifying direct deposit.',body);
    const available=active(),selects=[],monitored=new Set(data.monitoredAccounts||[]),accountCards=[];
    let search=null;
    if(data.accounts?.length){search=el('input',undefined,body);search.type='search';search.setAttribute('aria-label','Search connected accounts');search.placeholder='Search banks and accounts';search.value=accountFilter;}
    for(const a of data.accounts||[]){
      const card=el('section',undefined,body);card.className='bank-sync-card';
      const accountName=[a.bank,a.name].filter(Boolean).join(' · ')||'Bank account';
      el('h4',accountName,card);accountCards.push({card,name:accountName.toLowerCase()});
      card.hidden=!!accountFilter&&!accountName.toLowerCase().includes(accountFilter);
      el('p','Balance: '+(hideBalances?'••••••':money(a.balance,a.currency))+' · Available Balance: '+(hideBalances?'••••••':money(a.availableBalance,a.currency))+' · Last Updated: '+stamp(a.balanceDate),card);if(a.balanceDate&&data.lastSuccess&&a.balanceDate>data.lastSuccess)el('p','Balance timestamp is newer than the last recorded transaction sync; these are separate provider updates.',card);
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
    button(body,'Save account matches',async()=>{
      const mappings={};for(const {cycle,product} of selects){const entry=available.find(e=>String(e.id)===cycle.value);if(entry){const mapping={entryId:String(entry.id),bank:entry.bank,opened:entry.opened};if(product.value&&[...product.options].some(option=>option.value===product.value&&option.value!==''))mapping.productId=product.value;mappings[cycle.dataset.account]=mapping;}}
      data=await request('/selection',{method:'PUT',body:JSON.stringify({mappings})});paint();message('Bonus links saved. Account transactions continue syncing automatically.');
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
    if(!shown)el('p','No transactions are available yet. Connected accounts sync automatically as the provider returns data, subject to the daily limit.',body);
    button(body,'Disconnect and remove sync data',async()=>{
      if(!(await window.btConfirmDialog('Stop background syncing and remove this app’s saved bank-sync data? Your tracker entries stay intact. To revoke the token at SimpleFIN or cancel billing, also use your SimpleFIN account.',{title:'Disconnect SimpleFIN?',confirmLabel:'Disconnect',danger:true})))return;
      data=await request('',{method:'DELETE'});paint();message('Disconnected. Manage token revocation and subscription billing in SimpleFIN.');
    });
  }
  function open(mode='accounts'){
    if(panel){view=mode==='add-bank'?'add-bank':'accounts';wizardResult=null;paint();if(mode==='discover')run(discoverAccounts);if(mode==='add-bank')checkPlaidCapacity().then(()=>{if(panel)paint()}).catch(()=>{});return;}
    returnFocus=document.activeElement;generation++;data=null;changed=false;view=mode==='add-bank'?'add-bank':'accounts';wizardResult=null;
    panel=el('div');panel.className='ov bank-sync-overlay';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','bank-sync-title');
    const modal=el('section',undefined,panel);modal.className='bank-sync-modal';
    const header=el('header',undefined,modal);el('h2','Financial accounts',header).id='bank-sync-title';el('p','Balances, connections and bonus monitoring',header);
    const body=el('div',undefined,modal);body.className='bank-sync-body';
    const footer=el('footer',undefined,modal);const msg=el('p','',footer);msg.id='bank-sync-message';msg.setAttribute('role','status');
    const done=el('button','Done',footer);done.className='btn-s';done.type='button';done.onclick=close;
    document.body.append(panel);paint();done.focus();if(window.BTBonusAuth?.connected())run(async()=>{
      data=await request();if(mode==='discover')await discoverAccounts();else paint();
      if(mode==='add-bank')checkPlaidCapacity().then(()=>{if(panel)paint()}).catch(()=>{});
    }).then(()=>{if(mode==='add-bank'&&awaitingReturn)setTimeout(triggerReturnCheck,0)});
  }
  function install(){
    const menu=document.querySelector('.header-data-panel');if(!menu||menu.querySelector('[data-bank-sync]'))return;
    const b=el('button',undefined,menu);b.type='button';b.dataset.bankSync='';el('strong','Financial accounts',b);el('small','Connections, balances and monitored activity',b);b.onclick=()=>{document.getElementById('bt-data-menu').open=false;open();};
  }
  // The connection wizard stays open while Plaid's hosted Link closes.
  // Present a durable success in the modal's visible footer and ensure Done
  // refreshes Finances after this separate provider's write.
  window.addEventListener('bt:plaid-bank-connected',event=>{
    if(!panel||!window.BTBonusAuth?.connected())return;
    const detail=event?.detail||{},n=Number(detail.count);
    changed=true;
    message(detail.status==='ready'?
      'Plaid bank connected'+(Number.isInteger(n)&&n>=0?' · '+n+' account'+(n===1?'':'s')+' found':'')+
        '. Transactions are syncing automatically in Finances.':
      'Plaid authorization saved. Account discovery needs attention; use Connected accounts to review it.');
  });
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')triggerReturnCheck()});
  window.addEventListener('focus',triggerReturnCheck);
  window.btOpenBankSync=open;
  window.btOpenBankConnectFlow=()=>{wizardStage=awaitingReturn?'simplefin':selectedBank?'route':'choose';rememberStep();open('add-bank')};
  window.btDiscoverBankAccounts=()=>open('discover');
  window.btRegisterPostRender?.('simplefin-bank-sync',install);install();
  document.addEventListener('keydown',e=>{if(!panel)return;if(e.key==='Escape'){close();return;}if(e.key==='Tab'){const controls=[...panel.querySelectorAll('button,input,select,textarea,a[href]')].filter(n=>!n.disabled&&n.getClientRects().length);const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
  window.addEventListener('storage',e=>{if(e.key==='bonus-ai-auth'&&panel){generation++;data=null;paint();}});
})();
