/* Authenticated financial workspace. Private financial records are never written to browser storage. */
(function(){
  'use strict';
  const BASE='https://api-production-00f74.up.railway.app/api/bonus-tracker';
  let provider='simplefin';
  const TYPES={
    unclassified:'Choose account type',checking:'Checking',savings:'Savings',credit_card:'Credit card',
    brokerage:'Brokerage',retirement:'Retirement',loan:'Loan',mortgage:'Mortgage',
    other_asset:'Other asset',other_liability:'Other liability'
  };
  const CATEGORIES={
    unreviewed:'Uncategorized',income:'Income',housing:'Housing',utilities:'Utilities',groceries:'Groceries',
    dining:'Dining',transportation:'Transportation',shopping:'Shopping',health:'Health',
    entertainment:'Entertainment',fees:'Fees',taxes:'Taxes',travel:'Travel',
    subscription:'Subscriptions',transfer:'Transfer',refund:'Refund',verification:'Account verification',loan:'Loan payment',bonus:'Bank bonus',other:'Other'
  };
  // Keep 'bonus' as a persisted category for canonical tracker/evidence logic;
  // Finances never treats an unconfirmed promotional credit as verified income.
  const FINANCE_CATEGORIES=Object.fromEntries(Object.entries(CATEGORIES).filter(([key])=>key!=='bonus'));
  const financeCategory=key=>key==='bonus'?'Needs review':(FINANCE_CATEGORIES[key]||'Needs review');
  function displayMerchant(row){
    const merchant=String(row.merchant||'').trim();
    if(!merchant||/^(transaction|transfer|purchase|payment|debit|credit)$/i.test(merchant))
      return String(row.description||merchant||'Transaction').replace(/\s+/g,' ').trim();
    return merchant;
  }
  // v2 is a privacy preference only; legacy hidden-by-default is not migrated.
  const AMOUNTS_PREF='bt_finance_hide_v2';
  let hideChoice=false;
  try{hideChoice=localStorage.getItem(AMOUNTS_PREF)==='true'}catch(_error){}
  let currentRoot=null,sequence=0,hidden=hideChoice,data=null,otherData=null,busy=false,view='overview',period=90;
  let spendingMonth=new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0');
  let worthRange='3M',financePrefs={version:1,revision:0,budgets:{},duplicates:{},recurring:{},transactionMeta:{}};
  let preferenceAvailable=false,archiveLoading=false,settingsNotice='';
  const archives={simplefin:{},plaid:{}},archivesPending=new Set();
  let transactionSearch='',transactionAccount='',transactionCategory='',transactionStatus='',transactionVisibleLimit=100,expandedTransaction='';
  let transactionMin='',transactionMax='';
  let accountSearch='',accountType='',showHiddenAccounts=false,saveNotice='',accountDraftProfiles={},currentCombined=null;
  let activityNotice='',monitoringNotice='',connectionNotice='';
  const dirtyAccounts=new Set(),expandedAccountSettings=new Set(),monitoringDraft={};
  const sourceSnapshot=source=>source===provider?data:otherData?.provider===source?otherData.snapshot:null;
  function sourceWithArchive(source){
    const snapshot=sourceSnapshot(source);
    if(!snapshot)return snapshot;
    const months=Object.values(archives[source]||{});
    if(!months.length)return snapshot;
    const transactions={...snapshot.transactions};
    for(const payload of months){
      for(const [key,rows] of Object.entries(payload.transactions||{})){
        transactions[key]={...rows,...transactions[key]};
      }
    }
    return {...snapshot,transactions};
  }
  const unified=()=>window.BTFinanceUnified?.combine({
    simplefin:sourceWithArchive('simplefin'),plaid:sourceWithArchive('plaid')},financePrefs)||null;
  function applySource(source,snapshot){
    if(source===provider)data=snapshot;
    else if(otherData?.provider===source)otherData={provider:source,snapshot};
  }
  const el=(tag,text,parent,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;if(parent)parent.append(n);return n};
  const stamp=t=>Number.isFinite(t)&&t>0?new Date(t*1000).toLocaleString():'Not synced';
  const date=t=>Number.isFinite(t)&&t>0?new Date(t*1000).toLocaleDateString():'—';
  function money(value,code='USD'){
    if(value===null||value===undefined||value===''||!Number.isFinite(Number(value)))return '—';
    if(!code)return String(value)+' (currency unknown)';
    try{return new Intl.NumberFormat(code==='USD'?'en-US':undefined,{style:'currency',currency:code}).format(Number(value)).replace(/^-/,'−')}
    catch{return String(value)+' '+code}
  }
  function amount(value,code){return hidden&&value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?'••••••':money(value,code)}
  function action(parent,text,onClick,cls='finance-page-button'){
    const b=el('button',text,parent,cls);b.type='button';b.disabled=busy;b.onclick=onClick;return b;
  }
  function select(parent,label,values,current,onChange,cls='finance-page-select'){
    const wrap=el('label',undefined,parent,'finance-page-field');el('span',label,wrap);
    const input=el('select',undefined,wrap,cls);
    for(const [value,name] of Object.entries(values)){const option=el('option',name,input);option.value=value;option.selected=value===current}
    input.onchange=()=>onChange(input.value);return input;
  }
  function statusMessage(host,title,message){
    const card=el('section',undefined,host,'finance-page-card');el('h3',title,card);el('p',message,card);return card;
  }
  function profile(account){
    // Keep unsaved edits in memory, separate from the last server-confirmed data.
    // Network errors and cloud redraws must not silently revert user selections
    // or leak unconfirmed classifications into the financial summary.
    if(!Object.prototype.hasOwnProperty.call(accountDraftProfiles,account.key)){
      const saved=sourceSnapshot(account.source)?.accountProfiles?.[account.rawKey]||{};
      accountDraftProfiles[account.key]={
        kind:saved.kind&&saved.kind!=='unclassified'?saved.kind:(account.detectedType||'unclassified'),
        balanceMode:saved.balanceMode||({
          checking:'asset',savings:'asset',brokerage:'asset',retirement:'asset',
          other_asset:'asset',credit_card:'liability',loan:'liability',mortgage:'liability',
          other_liability:'liability'})[saved.kind||account.detectedType]||'exclude',
        order:Number.isInteger(saved.order)?saved.order:499,hidden:saved.hidden===true,displayName:saved.displayName||'',
        syncEnabled:saved.syncEnabled!==false,includeSpending:saved.includeSpending??['checking','credit_card'].includes(saved.kind||account.detectedType)
      };
    }
    return accountDraftProfiles[account.key];
  }
  function sortedAccounts(includeHidden=false){
    return [...(currentCombined?.accounts||[])].filter(a=>includeHidden||(!profile(a).hidden&&!a.removedAt)).sort((a,b)=>(profile(a).order??499)-(profile(b).order??499)
      ||String(a.bank||'').localeCompare(String(b.bank||''))||String(a.name||'').localeCompare(String(b.name||'')));
  }
  function sessionOwner(jwt){
    if(typeof jwt!=='string')return null;
    const part=jwt.split('.')[1];
    if(!part)return null;
    try{
      const value=JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/')));
      return typeof value?.sub==='string'&&value.sub
        ?JSON.stringify([value.iss||'',value.sub]):null;
    }catch{return null}
  }
  function sameSessionToken(original,current){
    if(typeof current!=='string'||!current)return false;
    if(current===original)return true;
    const first=sessionOwner(original),latest=sessionOwner(current);
    return Boolean(first&&latest&&first===latest);
  }
  async function request(path='',options={},selectedSource=provider){
    const auth=window.BTBonusAuth;if(!auth?.connected())throw Error('Sign in to view finances.');
    const source=selectedSource,rev=sequence,token=await auth.token(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),65000);
    try{
      const response=await fetch(BASE+(source==='plaid'?'/plaid/accounts':'/simplefin')+path,{...options,credentials:'omit',cache:'no-store',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},signal:controller.signal});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(typeof result.detail==='string'?result.detail:'Financial request could not be completed.');
      // Check owner continuity on every response, including a user switch
      // that did not trigger a Finances redraw. Token refresh alone is safe.
      if(source!=='simplefin'&&source!=='plaid')throw Error('Invalid bank connection route.');
      if(window.BTBonusAuth!==auth||!auth.connected())
        throw Error('Sign-in changed. Reload Finances.');
      const latest=await auth.token().catch(()=>null);
      if(!auth.connected()||!sameSessionToken(token,latest))
        throw Error('Sign-in changed. Reload Finances.');
      // A successful write survives a same-owner redraw. Older reads must
      // never replace the refreshed view's newer account snapshot.
      if(rev!==sequence&&(options.method||'GET').toUpperCase()==='GET')
        throw Error('Finances view refreshed. Retrieve the latest account status.');
      return result;
    }catch(error){if(error.name==='AbortError')throw Error('The request timed out. Refresh before retrying.');throw error}
    finally{clearTimeout(timer)}
  }
  async function settingsRequest(path='',options={}){
    const auth=window.BTBonusAuth;if(!auth?.connected())throw Error('Sign in again to save Finance settings.');
    const token=await auth.token(),rev=sequence;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await fetch(BASE+(path.startsWith('/../plaid/')?path.slice(3):'/finances'+path),{
        ...options,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
        credentials:'omit',cache:'no-store',signal:controller.signal});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(result.detail||'Could not save Finance settings.');
      if(!auth.connected()||window.BTBonusAuth!==auth||!sameSessionToken(token,await auth.token()))
        throw Error('Sign-in changed; refresh Finances.');
      if(rev!==sequence)throw Error('Finances was reloaded; refresh the latest settings.');
      return result;
    }finally{clearTimeout(timer)}
  }
  async function loadSettings(rev){
    try{
      const latest=await settingsRequest('/preferences');
      if(rev!==sequence)return;
      financePrefs=latest;preferenceAvailable=true;settingsNotice='';
    }catch(_error){
      if(rev!==sequence)return;
      preferenceAvailable=false;settingsNotice='Saved Finance settings are unavailable. Changes are disabled.';
    }
    if(currentRoot?.isConnected&&data)paint();
  }
  async function saveSetting(section,key,value){
    if(!preferenceAvailable){settingsNotice='Saved settings are unavailable. Try again after syncing.';paint();return}
    try{
      const saved=await settingsRequest('/preferences',{
        method:'PUT',body:JSON.stringify({revision:financePrefs.revision,section,key,value})});
      financePrefs=saved;settingsNotice='';paint();
    }catch(error){settingsNotice='Change not saved. '+String(error.message||'Try again.');paint()}
  }
  async function loadArchiveMonth(month){
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return;
    const rev=sequence;let refreshed=false;
    for(const source of ['simplefin','plaid']){
      const snapshot=sourceSnapshot(source);
      const key=source+'|'+month;
      if(!snapshot?.connected||!(snapshot.historyMonths||[]).includes(month)||archives[source][month]||archivesPending.has(key))continue;
      archivesPending.add(key);archiveLoading=true;
      try{
        const payload=await request('/history/'+month,{},source);
        if(rev!==sequence)return;
        archives[source][month]=payload;refreshed=true;
      }catch(_error){settingsNotice='Some earlier transactions could not be loaded. Try again.'}
      finally{archivesPending.delete(key)}
    }
    archiveLoading=archivesPending.size>0;
    if(refreshed&&rev===sequence&&currentRoot?.isConnected)paint();
  }
  function requestArchiveWindow(days){
    const today=new Date(),limit=Math.min(24,Math.ceil(days/28)+1);
    for(let index=0;index<limit;index++){
      const d=new Date(today.getFullYear(),today.getMonth()-index,1);
      const month=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
      // Archive reads are owner-authenticated and only for advertised months.
      loadArchiveMonth(month);
    }
  }
  async function loadOtherSource(rev){
    // One authenticated read to surface linked accounts across both providers.
    // Never combine totals: overlapping bank connections would double-count balances.
    const otherSource=provider==='plaid'?'simplefin':'plaid';
    const auth=window.BTBonusAuth;if(!auth?.connected())return;
    const token=await auth.token();
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await fetch(BASE+(otherSource==='plaid'?'/plaid/accounts':'/simplefin'),{
        headers:{Authorization:'Bearer '+token},credentials:'omit',cache:'no-store',signal:controller.signal});
      if(!response.ok)return;
      let snapshot=await response.json();
      if(rev!==sequence||!auth.connected()||window.BTBonusAuth!==auth)return;
      const latest=await auth.token().catch(()=>null);
      if(rev!==sequence||!sameSessionToken(token,latest))return;
      otherData={provider:otherSource,snapshot};
      if(data&&currentRoot?.isConnected)paint();
      // A prior Plaid Link may have authorized a bank without initial account
      // discovery. Recover read-only accounts once, never repeat a Link/exchange.
      if(otherSource==='plaid'&&snapshot.connected&&!(snapshot.accounts||[]).length
          &&!snapshot.lastSuccess&&!snapshot.error
          &&(!snapshot.nextSyncAt||snapshot.nextSyncAt<=Date.now()/1000)){
        const latestBeforeSync=await auth.token().catch(()=>null);
        if(rev!==sequence||!auth.connected()||!sameSessionToken(token,latestBeforeSync))return;
        const syncController=new AbortController(),syncTimer=setTimeout(()=>syncController.abort(),65000);
        try{
          const synced=await fetch(BASE+'/plaid/accounts/sync',{
            method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
            credentials:'omit',cache:'no-store',signal:syncController.signal});
          if(synced.ok){
            const recovered=await synced.json();
            const latestAfterSync=await auth.token().catch(()=>null);
            if(rev===sequence&&auth.connected()&&sameSessionToken(token,latestAfterSync)){
              snapshot=recovered;otherData={provider:otherSource,snapshot};
              if(data&&currentRoot?.isConnected)paint();
            }
          }
        }catch(_error){/* Recovery failure stays visible as not-yet-discovered. */}
        finally{clearTimeout(syncTimer)}
      }
    }catch(_error){/* Other provider may not be configured; primary accounts remain available. */}
    finally{clearTimeout(timer)}
  }
  function switchSource(source,preserveSearch=false){
    if(provider===source)return;
    provider=source;transactionAccount='';transactionSearch='';
    if(!preserveSearch)accountSearch='';
    accountType='';saveNotice='';refresh();
  }
  function discoverSelected(){window.btDiscoverBankAccounts?.();}
  const sourceLabel=source=>source==='plaid'?'Plaid':'SimpleFIN';
  function activityCoverage(){
    const accounts=currentCombined?.accounts||[],enabled=new Set(currentCombined?.monitoredAccounts||[]);
    return {total:accounts.length,enabled:accounts.filter(a=>enabled.has(a.key)).length,
      sources:['simplefin','plaid'].filter(source=>sourceSnapshot(source)?.connected)};
  }
  function activityStatus(snapshot,previous){
    if(snapshot?.error)return 'Needs attention: '+snapshot.error;
    if(Number(snapshot?.lastSuccess)>Number(previous?.lastSuccess||0))
      return 'Latest available activity checked';
    const next=Number(snapshot?.nextSyncAt);
    if(Number.isFinite(next)&&next>Date.now()/1000)return 'Next check '+stamp(next);
    return 'No new posted activity returned';
  }
  async function refreshActivity(){
    const coverage=activityCoverage();
    if(!coverage.sources.length){view='transactions';activityNotice='No connected banks to sync.';paint();return;}
    if(busy)return;
    busy=true;activityNotice='';paint();
    const updates=[],errors=[];
    try{
      for(const source of coverage.sources){
        const previous=sourceSnapshot(source);
        try{
          const snapshot=await request('/sync',{method:'POST'},source);
          applySource(source,snapshot);
          updates.push(sourceLabel(source)+': '+activityStatus(snapshot,previous));
        }catch(error){errors.push(sourceLabel(source)+': '+String(error?.message||'sync unavailable'));}
      }
    }finally{
      busy=false;activityNotice=[...updates,...errors].join(' · ')||'No connected accounts to refresh.';
      paint();
    }
  }
  function connectedSources(host){
    const other=otherData?.snapshot;
    if(!other?.connected)return;
    const accounts=other.accounts||[],source=otherData.provider;
    const panel=el('section',undefined,host,'finance-page-other-source');
    const heading=el('div',undefined,panel,'finance-page-source-head');
    el('strong',source==='plaid'?'Plaid connected banks':'SimpleFIN connected banks',heading);
    el('small',accounts.length+' account'+(accounts.length===1?'':'s'),heading);
    if(accounts.length){
      const names=[...new Set(accounts.map(a=>a.bank||a.name).filter(Boolean))].slice(0,4);
      el('p',names.join(' · ')+(new Set(accounts.map(a=>a.bank||a.name).filter(Boolean)).size>4?' · +more':''),panel);
    }else{
      const next=Number(other.nextSyncAt);
      el('p',next>Date.now()/1000
        ?'Bank linked · next account check '+stamp(next)
        :'Bank linked · accounts not yet discovered',panel);
      if(other.error)el('p','This bank needs attention. Check the connection in Accounts.',panel,'finance-page-warning');
    }
    const row=el('div',undefined,panel,'finance-page-quick-actions');
    action(row,'View '+(source==='plaid'?'Plaid':'SimpleFIN')+' accounts',
      ()=>switchSource(source,true),'finance-page-button finance-page-primary');
  }
  async function change(work,commitAccountProfiles=false){
    if(busy)return;
    busy=true;saveNotice='';paint();
    try{
      const saved=await work();
      if(saved&&saved.financeSource)applySource(saved.financeSource,saved.snapshot);
      else if(saved)data=saved;
      if(commitAccountProfiles){accountDraftProfiles={};dirtyAccounts.clear();Object.keys(monitoringDraft).forEach(k=>delete monitoringDraft[k]);}
      saveNotice='';
    }catch(error){
      // Account organization drafts stay on this page for retry. Transaction
      // categories are not changed locally without a confirmed server response.
      saveNotice='Changes were not saved. '+String(error?.message||'Please retry.')+' Review your selections and try again.';
    }finally{
      busy=false;paint();
    }
  }
  function flattenTransactions(){
    const accounts=new Map((currentCombined?.accounts||[]).filter(a=>!profile(a).hidden).map(a=>[a.key,a])),rows=[];
    const sourceAccounts=new Map((currentCombined?.accounts||[]).map(a=>[a.key,a]));
    // The confirmed primary prevents duplicate charges, while unique
    // secondary-bank records keep their original link for editing.
    const summarized=window.BTFinanceUnified.safeForSummary(currentCombined);
    for(const [accountKey,records] of Object.entries(summarized.transactions||{})){
      const visibleAccount=accounts.get(accountKey);if(!visibleAccount)continue;
      for(const row of Object.values(records||{})){
        const account=sourceAccounts.get(row.originalAccountKey)||visibleAccount;
        const source=account.source,rawKey=account.rawKey;
        const preferenceKey=source+':'+rawKey+':'+String(row.id);
        const meta=financePrefs.transactionMeta?.[preferenceKey]||{};
        rows.push({...row,accountKey,account,source,
          settingKey:preferenceKey,merchant:meta.name||row.merchant,
          note:meta.note||'',excludedFromTotals:meta.exclude===true||row.excludedFromTotals===true,
          markedRecurring:meta.markRecurring===true});
      }
    }
    return rows.sort((a,b)=>b.posted-a.posted);
  }
  function hero(host,summary){
    const compact=view!=='overview';
    const box=el('section',undefined,host,'finance-page-hero'+(compact?' finance-page-hero-compact':''));
    const head=el('div',undefined,box,'finance-page-hero-head'),copy=el('div',undefined,head);
    if(!compact)el('span','MY MONEY',copy,'finance-page-kicker');el('h2','Finances',copy);
    action(head,hidden?'Show amounts':'Hide amounts',()=>{
      hidden=!hidden;
      try{localStorage.setItem(AMOUNTS_PREF,String(hidden))}catch(_error){}
      paint();
    });
    if(!compact){
      el('span','Cash',box,'finance-page-hero-cash-label');
      el('strong',summary.cashAvailable?amount(summary.cash,'USD'):'—',box,'finance-page-hero-cash-value');
      el('small',summary.cashAvailable?'Recent bank balances':'Cash balance is not available yet',box,'finance-page-hero-cash-status');
      const banks=new Set(sortedAccounts().map(a=>String(a.bank||'').trim().toLowerCase()).filter(Boolean));
      el('p',sortedAccounts().length+' accounts · '+banks.size+' institutions · '+(currentCombined?.sourceCount||0)+' secure connections',box,'finance-page-count');
      const actions=el('div',undefined,box,'finance-page-quick-actions');
      const quick=(label,path,run)=>{
        const button=action(actions,'',run,'finance-page-round-action');button.setAttribute('aria-label',label);
        const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
        const shape=document.createElementNS(icon.namespaceURI,'path');shape.setAttribute('d',path);shape.setAttribute('fill','none');shape.setAttribute('stroke','currentColor');shape.setAttribute('stroke-width','1.7');shape.setAttribute('stroke-linecap','round');shape.setAttribute('stroke-linejoin','round');icon.append(shape);button.append(icon);el('span',label,button);
      };
      quick('Add bank','M12 5v14M5 12h14',()=>window.btOpenBankConnectFlow?.());
      quick('Discover accounts','M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12M15 15l5 5',discoverSelected);
      quick('Refresh activity','M20 7v5h-5M4 17v-5h5M5.5 8a7 7 0 0 1 12-3L20 8M4 16l2.5 3a7 7 0 0 0 12-3',refreshActivity);
      const meta=el('div',undefined,box,'finance-page-meta');
      el('span',currentCombined?.sourceCount?'Connected':'Not linked',meta);
      for(const [source,label] of [['simplefin','SimpleFIN'],['plaid','Plaid']]){
        const status=currentCombined?.providerState?.[source];
        if(status?.connected)el('span',label+': '+stamp(status.lastSuccess),meta);
      }
      if(summary.hiddenAccounts)el('p',summary.hiddenAccounts+' hidden account'+(summary.hiddenAccounts===1?' is':'s are')+' excluded from Finances totals. Show them under Accounts.',box,'finance-page-hint');
      if(currentCombined?.possibleDuplicates?.length)el('small','Review possible matching accounts in Accounts',box,'finance-page-hint');
    }
    const nav=el('nav',undefined,host,'finance-page-nav');nav.setAttribute('aria-label','Finance sections');
    for(const [id,label] of [['overview','Overview'],['spending','Spending'],['recurring','Recurring'],['transactions','Transactions'],['accounts','Accounts']]){
      const b=action(nav,label,()=>{
        view=id;paint();
        if(id==='recurring')requestArchiveWindow(731);
        if(id==='spending')loadArchiveMonth(spendingMonth);
        if(id==='transactions'&&period>90)requestArchiveWindow(period);
      },'finance-page-nav-button'+(view===id?' is-active':''));
      b.setAttribute('aria-current',view===id?'page':'false');
    }
    queueMicrotask(()=>{if(!nav.isConnected)return;const active=nav.querySelector('[aria-current=page]');if(active&&active.offsetLeft+active.offsetWidth>nav.scrollLeft+nav.clientWidth)nav.scrollLeft=active.offsetLeft+active.offsetWidth-nav.clientWidth+12;});
    return summary;
  }
  function periodControl(parent){
    const wrap=el('div',undefined,parent,'finance-page-period');
    for(const days of [30,90,180,365,730])action(wrap,({30:'30D',90:'90D',180:'6M',365:'1Y',730:'2Y'})[days],()=>{
      period=days;paint();if(days>90)requestArchiveWindow(days);
    },'finance-page-chip'+(period===days?' is-active':''));
  }
  function metric(grid,label,value,note){
    const tile=el('div',undefined,grid,'finance-page-tile');el('span',label,tile);el('strong',value,tile);
    if(note)el('small',note,tile);return tile;
  }
  function trendChart(parent,points){
    if(hidden){el('p','Balance trend hidden',parent);return}
    if(points.length<2){el('p','Net Worth history will appear after at least two complete balance snapshots.',parent);return}
    const values=points.map(p=>Number(p.value)),min=Math.min(...values),max=Math.max(...values),range=max-min||1;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 320 110');svg.setAttribute('role','img');svg.setAttribute('aria-label','Net Worth trend');svg.classList.add('finance-page-line-chart');
    const coords=values.map((value,index)=>[10+index*(300/Math.max(1,values.length-1)),95-(value-min)/range*75]);
    const area=document.createElementNS(svg.namespaceURI,'path');area.setAttribute('d','M '+coords[0][0]+' 100 L '+coords.map(x=>x.join(' ')).join(' L ')+' L '+coords.at(-1)[0]+' 100 Z');area.setAttribute('class','finance-page-line-area');svg.append(area);
    const line=document.createElementNS(svg.namespaceURI,'polyline');line.setAttribute('points',coords.map(x=>x.join(',')).join(' '));line.setAttribute('class','finance-page-line');svg.append(line);parent.append(svg);
    const labels=el('div',undefined,parent,'finance-page-chart-labels');el('span',date(points[0].at),labels);el('strong',amount(points.at(-1).value,'USD'),labels);el('span',date(points.at(-1).at),labels);
  }
  function spendingDonut(host,summary){
    const rows=Object.entries(summary.spending||{}).filter(([,value])=>
      Number.isFinite(Number(value))&&Number(value)>0).sort((a,b)=>Number(b[1])-Number(a[1]));
    const card=el('section',undefined,host,'finance-page-card finance-page-spending-card');
    const head=el('div',undefined,card,'finance-page-section-head');
    el('h3','Spending by category',head);
    if(!summary.complete)el('span','Partial',head,'finance-page-coverage-pill');
    if(!rows.length){el('p','Category spending will appear as transactions are categorized.',card,'finance-page-hint');return}
    const total=rows.reduce((sum,[,value])=>sum+Number(value),0);
    if(!Number.isFinite(total)||total<=0){el('p','Spending breakdown is not available.',card);return}
    const colors=['#5BE3B0','#49BFA1','#378F83','#306A68','#425D68','#5F6880','#7A7990','#A0A6B8'];
    let start=0;
    const stops=rows.map(([,value],i)=>{
      const end=start+Number(value)/total*100;
      const stop=colors[i%colors.length]+' '+start.toFixed(4)+'% '+end.toFixed(4)+'%';
      start=end;return stop;
    });
    const display=el('div',undefined,card,'finance-page-spending-breakdown');
    const circle=el('div',undefined,display,'finance-page-donut');
    circle.style.background=hidden?'#1E212C':'conic-gradient('+stops.join(',')+')';
    circle.setAttribute('role','img');
    circle.setAttribute('aria-label','Distribution of categorized spending'+(summary.complete?'':' · partial history'));
    const legend=el('div',undefined,display,'finance-page-donut-legend');
    for(const [i,[category,value]] of rows.entries()){
      const item=el('div',undefined,legend,'finance-page-donut-item');
      const marker=el('span',undefined,item,'finance-page-donut-dot');marker.style.background=colors[i%colors.length];
      el('span',financeCategory(category),item,'finance-page-donut-label');
      el('strong',amount(value,'USD'),item);
    }
    if(!summary.complete)el('p','Only categorized posted transactions are included. Your bank history may still be loading.',card,'finance-page-hint');
  }
  function compactAccountPreview(host){
    const card=el('section',undefined,host,'finance-page-card finance-page-preview-card');
    const head=el('div',undefined,card,'finance-page-section-head');el('h3','Connections',head);
    action(head,'Manage connections',()=>{view='connections';paint()},'finance-page-preview-link');
    const institutions=new Map();
    for(const account of sortedAccounts()){
      const key=account.source+':'+(account.connectionHandle||account.bank);
      if(!institutions.has(key))institutions.set(key,[]);institutions.get(key).push(account);
    }
    if(!institutions.size)el('p','Connect a bank to view your accounts.',card);
    for(const rows of [...institutions.values()].slice(0,5)){
      const account=rows[0],attention=rows.some(a=>a.transactionSyncStatus==='needs_attention')||currentCombined.providerState[account.source]?.needsAttention;
      const line=el('div',undefined,card,'finance-page-preview-row');
      const dot=el('span',undefined,line,'finance-health-dot'+(attention?' is-warning':''));dot.setAttribute('aria-hidden','true');
      const copy=el('div',undefined,line,'finance-page-preview-copy');el('strong',account.bank||'Bank',copy);
      el('small','via '+account.sourceLabel+' · '+rows.length+' account'+(rows.length===1?'':'s'),copy);
      el('small',attention?'Needs attention':syncLabel(sourceSnapshot(account.source)?.lastSuccess),copy);
      if(attention)action(line,'Reconnect',()=>reconnectAccount(account),'finance-page-preview-link');
    }
  }
  function compactActivityPreview(host){
    const card=el('section',undefined,host,'finance-page-card finance-page-preview-card');
    const head=el('div',undefined,card,'finance-page-section-head');
    el('h3','Recent transactions',head);
    action(head,'View all',()=>{view='transactions';paint()},'finance-page-preview-link');
    const rows=flattenTransactions().filter(row=>Number.isFinite(row.posted)&&row.posted>0).slice(0,5);
    if(!rows.length){
      const loading=(currentCombined?.accounts||[]).some(a=>a.transactionSyncStatus==='history_still_loading'||a.transactionSyncStatus==='awaiting_first_sync');
      el('p',loading?'Importing transaction history for 1 bank. Updates automatically.':'Transactions will appear as each bank finishes syncing.',card,'finance-page-hint');return
    }
    const list=el('div',undefined,card,'finance-page-preview-list');
    for(const row of rows){
      const item=el('div',undefined,list,'finance-page-preview-row');
      const copy=el('div',undefined,item,'finance-page-preview-copy');
      el('strong',row.merchant||row.description||'Transaction',copy);
      el('small',(row.account.bank||'Bank')+' · '+row.account.sourceLabel+' · '+date(row.posted),copy);
      el('b',amount(row.amount,row.account.currency),item,'finance-page-preview-value');
    }
  }
  function cumulativeSpendingChart(host,current,previous){
    if(hidden){el('p','Spending trend hidden',host);return}
    const series=data=>{
      let sum=0;
      return Array.from({length:31},(_,i)=>{
        sum+=Number(data.byDay?.[i+1]||0);
        return Number.isFinite(sum)?sum:0;
      });
    };
    const a=series(current),b=series(previous),maximum=Math.max(1,...a,...b);
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 320 120');svg.setAttribute('role','img');
    svg.setAttribute('aria-label','Cumulative daily spending this month compared with last month');
    svg.classList.add('finance-page-spending-line');
    for(const [values,label] of [[b,'previous'],[a,'current']]){
      const poly=document.createElementNS(svg.namespaceURI,'polyline');
      poly.setAttribute('points',values.map((v,i)=>(8+i*10.1)+','+(110-v/maximum*95)).join(' '));
      poly.setAttribute('fill','none');
      poly.setAttribute('class','is-'+label);
      poly.setAttribute('stroke-width','2.5');
      svg.append(poly);
    }
    host.append(svg);
    el('small','Mint: this month · Gray: last month',host,'finance-page-hint');
  }
  function overview(host,summary){
    const net=sectionTitle(host,'Net worth');
    el('strong',summary.netWorthAvailable?amount(summary.netWorth,'USD'):'—',net,'finance-page-big-number');
    el('small','Based on '+(summary.netWorthBasedOn||0)+' of '+(summary.netWorthTotalAccounts||0)+' accounts',net,'finance-page-coverage-label');
    if(summary.netWorthPartial)el('small','Other balances are not available yet.',net,'finance-page-hint');
    const cutoff=Math.floor(Date.now()/1000)-30*86400;
    const lastMonth=(summary.netWorthHistory||[]).filter(x=>x.at<=cutoff).at(-1);
    if(!hidden&&!summary.netWorthPartial&&summary.netWorthAvailable&&lastMonth){
      const before=Number(lastMonth.value),current=Number(summary.netWorth);
      if(Number.isFinite(before)&&Number.isFinite(current)){
        const difference=current-before,pct=before!==0?Math.abs(difference/before*100).toFixed(1):null;
        el('small',(difference>=0?'▲ ':'▼ ')+amount(Math.abs(difference).toFixed(2),'USD')+
           (pct===null?'':' ('+pct+'%)')+' from last month',net,
           'finance-page-month-change'+(difference<0?' is-negative':''));
      }
    }
    const worthControls=el('div',undefined,net,'finance-page-period');
    for(const label of ['1M','3M','6M','1Y','All']){
      action(worthControls,label,()=>{worthRange=label;paint()},
        'finance-page-chip'+(worthRange===label?' is-active':''));
    }
    const spans={'1M':30,'3M':90,'6M':183,'1Y':365,'All':10000};
    const points=(summary.netWorthHistory||[]).filter(x=>x.at>=Math.floor(Date.now()/1000)-spans[worthRange]*86400);
    trendChart(net,points);
    const breakdown=el('div',undefined,net,'finance-page-net-worth-split');
    metric(breakdown,'Assets',summary.netWorthAvailable?amount(summary.assets,'USD'):'—');
    metric(breakdown,'Liabilities',summary.netWorthAvailable?amount(summary.liabilities,'USD'):'—');

    const insight=window.BTFinanceInsights;
    if(insight){
      const month=insight.monthKey(Date.now()),previous=insight.monthShift(month,-1);
      const today=new Date().getDate();
      const rows=flattenTransactions();
      const spent=insight.spent(rows,month),prior=insight.spent(rows,previous);
      const priorThrough=insight.spent(rows.filter(row=>new Date(row.posted*1000).getDate()<=today),previous);
      const activity=sectionTitle(host,'Spent this month');
      el('strong',amount(spent.total,'USD'),activity,'finance-page-big-number');
      const delta=Number(spent.total)-Number(priorThrough.total);
      el('small',amount(Math.abs(delta).toFixed(2),'USD')+' '+(delta<=0?'less':'more')+
        ' than last month at this point',activity,'finance-page-hint');
      cumulativeSpendingChart(activity,spent,prior);
      const upcoming=insight.upcoming(insight.recurring(rows,Date.now()),Date.now(),14);
      const card=sectionTitle(host,'Upcoming','Expected charges in the next 14 days');
      if(upcoming.length){
        let sum=0;
        for(const item of upcoming.slice(0,5)){
          sum+=Number(item.lastAmount);
          const line=el('div',undefined,card,'finance-page-preview-row');
          el('strong',item.merchant,line);el('small',date(item.nextAt),line);
          el('b',amount(item.lastAmount,'USD'),line);
        }
        el('strong','Total expected '+amount(sum.toFixed(2),'USD'),card);
      }else el('p','Upcoming payments will appear as patterns are found.',card,'finance-page-hint');
      const categories=sectionTitle(host,'Top spending categories');
      if(spent.categories.length){
        const max=Math.max(...spent.categories.map(x=>Number(x.amount)),1);
        for(const item of spent.categories.slice(0,5)){
          const line=el('div',undefined,categories,'finance-page-category-progress');
          const title=el('div',undefined,line,'finance-page-section-head');
          el('span',financeCategory(item.category),title);el('b',amount(item.amount,'USD'),title);
          const bar=el('div',undefined,line,'finance-page-budget-track');
          const fill=el('span',undefined,bar,'finance-page-budget-progress');
          fill.hidden=hidden;fill.style.width=Number(item.amount)/max*100+'%';
        }
      }else el('p','No categorized spending yet.',categories,'finance-page-hint');
    }
    compactAccountPreview(host);
    const activity=el('section',undefined,host,'finance-page-card');
    const activityHead=el('div',undefined,activity,'finance-page-section-head');el('h3','Cash flow',activityHead);periodControl(activityHead);
    const activityGrid=el('div',undefined,activity,'finance-page-grid');
    metric(activityGrid,'Income',summary.hasActivity?amount(summary.income,'USD'):'—');
    metric(activityGrid,'Expenses',summary.hasActivity?amount(summary.expenses,'USD'):'—');
    metric(activityGrid,'Net flow',summary.hasActivity?amount(summary.cashFlow,'USD'):'—');
    metric(activityGrid,'Savings rate',hidden?'••••••':summary.savingsRate===null?'—':summary.savingsRate.toFixed(1)+'%');
    if(!summary.complete)el('p','Spending needs a closer look: categorize '+summary.unreviewed+' uncategorized transaction'+(summary.unreviewed===1?'':'s')+'.',activity,'finance-page-caution');
    compactActivityPreview(host);
    spendingDonut(host,summary);
    const more=el('details',undefined,host,'finance-page-more');
    el('summary','More insights · trends, spending & review',more);
    const trend=el('section',undefined,more,'finance-page-card');el('h3','Net worth trend',trend);trendChart(trend,summary.netWorthHistory||[]);
    const monthly=el('section',undefined,more,'finance-page-card');el('h3','Monthly activity',monthly);
    if(!summary.monthly?.length)el('p','No categorized monthly activity yet.',monthly);
    else for(const item of summary.monthly){
      const line=el('article',undefined,monthly,'finance-page-month');
      el('strong',new Date(item.month+'-02T00:00:00').toLocaleDateString(undefined,{month:'short',year:'numeric'}),line);
      const values=el('div',undefined,line);el('span','Income '+amount(item.income,'USD'),values);el('span','Expenses '+amount(item.expenses,'USD'),values);el('b','Net '+amount(item.cashFlow,'USD'),values);
    }
    const spending=el('section',undefined,more,'finance-page-card');el('h3','Spending',spending);
    const categories=Object.entries(summary.spending||{}).sort((a,b)=>Number(b[1])-Number(a[1]));
    if(!categories.length)el('p','No categorized expenses yet.',spending);
    else{
      const max=Math.max(...categories.map(([,v])=>Number(v)));
      const chart=el('div',undefined,spending,'finance-page-bars');
      for(const [category,value] of categories){
        const row=el('div',undefined,chart,'finance-page-bar-row'),label=el('div',undefined,row,'finance-page-bar-label');
        el('span',CATEGORIES[category]||category,label);el('strong',amount(value,'USD'),label);
        const track=el('div',undefined,row,'finance-page-bar-track'),bar=el('span',undefined,track,'finance-page-bar');
        bar.hidden=hidden;bar.style.width=Math.max(3,Number(value)/max*100)+'%';
      }
    }
    const attention=el('section',undefined,more,'finance-page-card');el('h3','Needs review',attention);
    const signalCutoff=Math.floor(Date.now()/1000)-period*86400;
    const signals=flattenTransactions().filter(r=>!r.pending&&r.posted>=signalCutoff&&r.posted<=Math.floor(Date.now()/1000)+300&&Array.isArray(r.signals)&&r.signals.some(x=>['possible_direct_deposit','possible_reversal','possible_fee','possible_recurring'].includes(x)));
    if(!signals.length)el('p','No transactions need attention.',attention);
    else for(const row of signals.slice(0,8)){
      const line=el('article',undefined,attention,'finance-page-review-row'),copy=el('div',undefined,line);
      el('strong',row.merchant||row.description,copy);el('small',row.account.bank+' · '+date(row.posted)+' · '+row.signals.map(signalLabel).join(' · '),copy);
      el('b',amount(row.amount,row.account.currency),line);
    }
    el('p','Compare anything unusual with your bank statement.',attention,'finance-page-hint');
  }
  function spendMonth(month){
    return window.BTFinanceInsights?.spent(flattenTransactions(),month)||
      {month,total:'0.00',income:'0.00',uncategorized:0,categories:[],byDay:{}};
  }
  function moveSpendingMonth(delta){
    const insight=window.BTFinanceInsights;
    const next=insight.monthShift(spendingMonth,delta),now=insight.monthKey(Date.now());
    if(next>now||next<insight.monthShift(now,-23))return;
    spendingMonth=next;paint();loadArchiveMonth(next);
  }
  function sectionTitle(host,title,description){
    const section=el('section',undefined,host,'finance-page-card finance-page-insights');
    el('h3',title,section);
    if(description)el('p',description,section,'finance-page-hint');
    return section;
  }
  function spendingView(host){
    const insight=window.BTFinanceInsights;
    if(!insight){statusMessage(host,'Spending unavailable','Refresh Finances to load spending charts.');return}
    const value=spendMonth(spendingMonth),previous=spendMonth(insight.monthShift(spendingMonth,-1));
    const root=el('section',undefined,host,'finance-page-spending-view');
    const head=el('div',undefined,root,'finance-page-month-picker');
    action(head,'‹ Previous month',()=>moveSpendingMonth(-1),'finance-page-chip');
    el('strong',new Date(spendingMonth+'-02T12:00:00').toLocaleDateString(undefined,
      {month:'long',year:'numeric'}),head);
    const future=insight.monthShift(spendingMonth,1)>insight.monthKey(Date.now());
    const next=action(head,'Next month ›',()=>moveSpendingMonth(1),'finance-page-chip');next.disabled=future;
    const overview=sectionTitle(root,'Spending this month');
    el('strong',amount(value.total,'USD'),overview,'finance-page-big-number');
    el('small','Based on categorized purchases from connected accounts',overview);
    if(value.uncategorized>0)el('p',value.uncategorized+' transactions need a category. Spending is partial.',overview,'finance-page-hint');
    const delta=Number(value.total)-Number(previous.total);
    el('p',Math.abs(delta).toFixed(2)+' '+(delta>=0?'more':'less')+' than last month (full-month comparison)',overview,'finance-page-hint');
    spendingDonut(root,{spending:Object.fromEntries(value.categories.map(x=>[x.category,x.amount])),
      complete:!value.uncategorized&&!archiveLoading});
    const budgetCard=sectionTitle(root,'Monthly budgets','Optional limits saved securely to your account');
    const categories=[...new Set([...value.categories.map(x=>x.category),...Object.keys(financePrefs.budgets||{})])];
    if(!categories.length)categories.push('groceries','dining','shopping','utilities');
    let budgetTotal=0,budgetSpend=0;
    for(const name of categories){
      const actual=Number(value.categories.find(x=>x.category===name)?.amount||0);
      const planned=Number(financePrefs.budgets?.[name]?.amount||0);
      if(planned>0){budgetTotal+=planned;budgetSpend+=actual}
      const line=el('div',undefined,budgetCard,'finance-page-budget-row');
      const label=el('div',undefined,line,'finance-page-section-head');
      el('strong',financeCategory(name),label);
      el('span',amount(actual.toFixed(2),'USD')+(planned>0?' / '+amount(planned.toFixed(2),'USD'):''),label);
      const track=el('div',undefined,line,'finance-page-budget-track');
      const progress=el('span',undefined,track,'finance-page-budget-progress');
      progress.style.width=hidden?'0%':(planned>0?Math.min(100,actual/planned*100):0)+'%';
      progress.dataset.level=planned>0&&actual>=planned?'over':planned>0&&actual>=planned*.8?'near':'ok';
      const control=el('label',undefined,line,'finance-page-budget-editor');
      el('span','Budget',control);
      const input=el('input',undefined,control);input.type='number';input.min='0';input.max='10000000';input.step='.01';
      input.value=planned>0?String(planned):'';input.placeholder='Optional';
      input.setAttribute('aria-label','Monthly budget for '+financeCategory(name));
      input.disabled=!preferenceAvailable;
      input.onchange=()=>{
        const amountValue=input.value.trim();
        if(!amountValue)saveSetting('budgets',name,null);
        else saveSetting('budgets',name,{amount:amountValue});
      };
    }
    if(budgetTotal>0)el('strong',amount(Math.max(0,budgetTotal-budgetSpend).toFixed(2),'USD')+' left to spend',budgetCard);
    const halfYear=sectionTitle(root,'Income and spending','Last six months · available transactions only');
    for(let offset=5;offset>=0;offset--){
      const month=insight.monthShift(spendingMonth,-offset),fig=spendMonth(month),line=el('div',undefined,halfYear,'finance-page-income-compare');
      const label=el('span',new Date(month+'-02T12:00:00').toLocaleDateString(undefined,{month:'short'}),line);
      const bars=el('div',undefined,line,'finance-page-compare-bars');
      const max=Math.max(1,Number(fig.income),Number(fig.total));
      for(const [type,v] of [['income',fig.income],['spending',fig.total]]){
        const bar=el('span',undefined,bars,'finance-page-compare-bar is-'+type);
        bar.style.width=hidden?'0%':Math.min(100,Number(v)/max*100)+'%';bar.title=type+': '+amount(v,'USD');
      }
      el('small','In '+amount(fig.income,'USD')+' · Out '+amount(fig.total,'USD'),line);
    }
  }
  function recurringView(host){
    const insight=window.BTFinanceInsights;
    if(!insight){statusMessage(host,'Recurring unavailable','Refresh Finances to load recurring payments.');return}
    const raw=insight.recurring(flattenTransactions(),Date.now());
    const list=raw.filter(item=>!financePrefs.recurring?.[item.key]?.dismissed);
    const upcoming=insight.upcoming(list,Date.now(),14);
    const visible=sectionTitle(host,'Upcoming payments','Estimated from patterns in available account history');
    if(!upcoming.length)el('p','No upcoming recurring charges have been identified yet.',visible);
    else{
      let due=0;
      for(const item of upcoming){
        due+=Number(item.lastAmount);
        const line=el('div',undefined,visible,'finance-page-preview-row');
        el('strong',item.merchant,line);el('small',date(item.nextAt),line);
        el('b',amount(item.lastAmount,'USD'),line);
      }
      el('strong',amount(due.toFixed(2),'USD')+' expected in the next 14 days',visible);
    }
    const calendar=sectionTitle(host,'This month','Upcoming expected charge dates');
    const now=new Date(),month=insight.monthKey(now.getTime());
    const calendarRows=list.filter(item=>insight.monthKey(item.nextAt*1000)===month);
    if(!calendarRows.length)el('p','No expected charges this month.',calendar);
    for(const item of calendarRows){
      const row=el('div',undefined,calendar,'finance-page-preview-row');
      el('strong',date(item.nextAt),row);el('span',item.merchant,row);el('b',amount(item.lastAmount,'USD'),row);
    }
    const groups=[
      ['Subscriptions',item=>item.category==='subscription'||item.category==='entertainment'],
      ['Bills & payments',item=>['utilities','housing','loan','transfer'].includes(item.category)],
      ['Income',item=>item.direction==='income'],
      ['Other',()=>true]
    ];
    const assigned=new Set();
    for(const [title,predicate] of groups){
      const matches=list.filter(item=>!assigned.has(item.key)&&predicate(item));
      if(!matches.length)continue;
      for(const item of matches)assigned.add(item.key);
      const group=sectionTitle(host,title);
      for(const item of matches){
        const itemRule=financePrefs.recurring?.[item.key]||{};
        const detail=el('details',undefined,group,'finance-page-recurring-item');
        const line=el('summary',undefined,detail,'finance-page-recurring-summary');
        el('span',(itemRule.name||item.merchant).slice(0,1).toUpperCase(),line,'finance-page-transaction-icon');
        const text=el('span',undefined,line,'finance-page-recurring-info');
        el('strong',itemRule.name||item.merchant,text);
        el('small',item.frequency+' · Next '+date(item.nextAt),text);
        el('b',amount(item.lastAmount,'USD'),line);
        el('small',item.status==='possibly_canceled'?'Possibly canceled':item.status==='price_increased'?'Price increased':'Active',detail,'finance-page-recurring-status');
        const controls=el('div',undefined,detail,'finance-page-recurring-controls');
        const label=el('label',undefined,controls);el('span','Rename',label);
        const input=el('input',undefined,label);input.value=itemRule.name||item.merchant;input.maxLength=90;
        action(controls,'Save name',()=>saveSetting('recurring',item.key,{...itemRule,name:input.value.trim()}));
        action(controls,'Not recurring',()=>saveSetting('recurring',item.key,{...itemRule,dismissed:true}));
        action(controls,'Confirm recurring',()=>saveSetting('recurring',item.key,{...itemRule,confirmed:true}));
        const history=el('div',undefined,detail,'finance-page-recurring-history');
        for(const charge of item.history.slice(-8).reverse()){
          const line=el('p',undefined,history);el('span',date(charge.posted),line);el('b',amount(charge.amount,'USD'),line);
        }
      }
    }
    el('small','These are estimates, not confirmed bills or scheduled payments.',host,'finance-page-hint');
  }
  function signalLabel(value){
    return ({possible_direct_deposit:'Possible direct deposit',possible_bonus:'Possible bonus',possible_reversal:'Possible reversal',
      possible_fee:'Possible fee',possible_recurring:'Possible recurring payment',matched_internal_transfer:'Matched transfer',
      possible_transfer:'Possible transfer',possible_refund:'Possible refund'})[value]||value.replaceAll('_',' ');
  }
  function transactions(host){
    const card=el('section',undefined,host,'finance-page-card finance-page-transactions-card');
    const head=el('div',undefined,card,'finance-page-section-head finance-page-transactions-head');el('h3','Transactions',head);
    action(head,'Refresh activity',refreshActivity,'finance-page-preview-link');
    const controls=el('div',undefined,card,'finance-page-transaction-tools');
    const searchWrap=el('div',undefined,controls,'finance-page-search-wrap');
    el('span','⌕',searchWrap,'finance-page-search-icon');
    const search=el('input',undefined,searchWrap,'finance-page-search');search.type='search';search.placeholder='Search transactions';search.setAttribute('aria-label','Search transactions');search.value=transactionSearch;
    search.oninput=()=>{transactionSearch=search.value.trim().toLowerCase();transactionVisibleLimit=100;renderRows()};
    const filterPanel=el('details',undefined,controls,'finance-page-transaction-filters');
    const filterSummary=el('summary','Filters',filterPanel,'finance-page-filter-button');filterSummary.setAttribute('role','button');
    const filterFields=el('div',undefined,filterPanel,'finance-page-filter-fields');
    const accountValues={'':'All accounts'};for(const a of sortedAccounts())accountValues[a.key]=[a.bank,a.name,a.sourceLabel].filter(Boolean).join(' · ');
    select(filterFields,'Account',accountValues,transactionAccount,value=>{transactionAccount=value;transactionVisibleLimit=100;renderRows()});
    select(filterFields,'Category',{'':'All categories',...FINANCE_CATEGORIES},transactionCategory,value=>{transactionCategory=value;transactionVisibleLimit=100;renderRows()});
    select(filterFields,'Status',{'':'Posted and pending',posted:'Posted',pending:'Pending'},transactionStatus,value=>{transactionStatus=value;transactionVisibleLimit=100;renderRows()});
    const range=el('div',undefined,filterFields,'finance-page-filter-range');el('span','History',range);periodControl(range);
    for(const [name,type] of [['Minimum amount','min'],['Maximum amount','max']]){
      const label=el('label',undefined,filterFields,'finance-page-field');el('span',name,label);
      const input=el('input',undefined,label,'finance-page-search');input.type='number';
      input.min='0';input.step='.01';input.value=type==='min'?transactionMin:transactionMax;
      input.oninput=()=>{if(type==='min')transactionMin=input.value;else transactionMax=input.value;renderRows()};
    }
    const list=el('div',undefined,card,'finance-page-transactions');
    const rowIdentity=row=>[row.source,row.accountKey,row.id].join(':');
    const dayKey=value=>new Date(value*1000).toLocaleDateString('en-CA');
    const dayLabel=value=>new Date(value*1000).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
    function shownAmount(row){
      const formatted=amount(row.amount,row.account.currency);
      return !hidden&&Number(row.amount)>0&&formatted!=='—'?'+'+formatted:formatted;
    }
    function renderRows(){
      list.replaceChildren();const cutoff=Math.floor(Date.now()/1000)-period*86400;
      const filtered=flattenTransactions().filter(row=>{
        const hay=(row.merchant+' '+row.description+' '+row.account.bank+' '+row.account.name).toLowerCase();
        return row.posted>=cutoff&&row.posted<=Math.floor(Date.now()/1000)+300&&(!transactionSearch||hay.includes(transactionSearch))
          &&(!transactionAccount||row.accountKey===transactionAccount)
          &&(!transactionCategory||row.category===transactionCategory)
          &&(!transactionStatus||(transactionStatus==='pending')===!!row.pending)
          &&(!transactionMin||Math.abs(Number(row.amount))>=Number(transactionMin))
          &&(!transactionMax||Math.abs(Number(row.amount))<=Number(transactionMax));
      });
      if(!filtered.length){el('p','No matching transactions are available yet. Check the account, date range or next bank sync.',list);return}
      let group=null,lastDay='';
      for(const row of filtered.slice(0,transactionVisibleLimit)){
        const currentDay=dayKey(row.posted);
        if(currentDay!==lastDay){
          group=el('section',undefined,list,'finance-page-transaction-group');
          el('h4',dayLabel(row.posted),group,'finance-page-transaction-date');lastDay=currentDay;
        }
        const id=rowIdentity(row),open=expandedTransaction===id;
        const article=el('article',undefined,group,'finance-page-transaction'+(open?' is-open':''));
        const top=el('button',undefined,article,'finance-page-transaction-summary');top.type='button';
        top.setAttribute('aria-expanded',String(open));top.setAttribute('aria-label',displayMerchant(row)+' details');
        const copy=el('span',undefined,top,'finance-page-transaction-copy');
        el('strong',displayMerchant(row),copy);
        if(row.categorySource==='ai')el('small','Auto',copy,'finance-page-auto-tag');
        const metadata=el('span',undefined,copy,'finance-page-transaction-meta');
        el('small',financeCategory(row.category),metadata,'finance-page-category-chip');
        el('small',row.account.name||row.account.bank,metadata,'finance-page-transaction-account');
        const value=el('span',undefined,top,'finance-page-transaction-value');
        el('b',shownAmount(row),value,Number(row.amount)>0?'is-credit':'');
        if(row.pending)el('small','Pending',value);
        top.onclick=()=>openDetail(row);
      }
      function openDetail(row){
        const detail=sheet('Transaction details for '+displayMerchant(row));
        detail.classList.add('finance-page-transaction-detail');
        el('h4',displayMerchant(row),detail);
        el('p',row.description||'No additional description supplied.',detail,'finance-page-description');
        el('small',[row.account.bank,row.account.name,row.account.sourceLabel,date(row.posted),row.pending?'Pending':'Posted'].filter(Boolean).join(' · '),detail,'finance-page-detail-meta');
        if(row.stalePending)el('p','This pending charge has not updated recently. Check your bank.',detail,'finance-page-warning');
        const visibleSignals=(row.signals||[]).filter(signal=>signal!=='possible_bonus');
        if(visibleSignals.length){const badges=el('div',undefined,detail,'finance-page-badges');for(const signal of visibleSignals)el('span',signalLabel(signal),badges);}
        const similarLabel=el('label',undefined,detail,'finance-page-learn-label');
        const similar=el('input',undefined,similarLabel);similar.type='checkbox';similar.checked=false;
        el('span','Apply to similar transactions',similarLabel);
        const category=select(detail,'Category',FINANCE_CATEGORIES,row.category==='bonus'?'unreviewed':row.category,async value=>{await change(async()=>{
          const snapshot=await request('/transaction-review',{method:'PUT',body:JSON.stringify({account:row.account.rawKey,transaction:row.id,category:value,applySimilar:similar.checked})},row.source);
          return {financeSource:row.source,snapshot};
        });
          if(saveNotice){el('p',saveNotice,detail,'finance-page-warning');category.value=row.category}
          else detail.close();
        });
        category.setAttribute('aria-label','Category for '+(row.merchant||row.description));
        el('small',row.categorySource==='user'?'Confirmed by you':
          row.categorySource==='user_rule'?'Saved merchant rule':
          row.categorySource==='ai'?'Auto suggestion · review anytime':
          'Automatic · '+(row.confidence||'low')+' confidence',detail,'finance-page-source');
        if(row.changedAt)el('small','Your bank updated this transaction on '+stamp(row.changedAt)+'. A previous correction was cleared for review.',detail,'finance-page-warning');
        const saved=financePrefs.transactionMeta?.[row.settingKey]||{};
        const edit=el('div',undefined,detail,'finance-page-transaction-edits');
        const nameLabel=el('label',undefined,edit,'finance-page-field');
        el('span','Merchant name',nameLabel);
        const merchant=el('input',undefined,nameLabel,'finance-page-search');
        merchant.value=saved.name||displayMerchant(row);merchant.maxLength=90;
        const noteLabel=el('label',undefined,edit,'finance-page-field');
        el('span','Note',noteLabel);
        const note=el('textarea',undefined,noteLabel,'finance-page-search');
        note.value=saved.note||'';note.maxLength=500;note.rows=2;
        const toggle=(label,checked)=>{
          const wrap=el('label',undefined,edit,'finance-page-learn-label');
          const input=el('input',undefined,wrap);input.type='checkbox';input.checked=checked;
          el('span',label,wrap);return input;
        };
        const exclude=toggle('Exclude from totals',saved.exclude===true);
        const recurring=toggle('Mark recurring',saved.markRecurring===true);
        const saveMeta=action(edit,'Save transaction details',()=>{
          saveSetting('transactionMeta',row.settingKey,{
            name:merchant.value.trim(),note:note.value.trim(),
            exclude:exclude.checked,markRecurring:recurring.checked
          });
        },'finance-page-button finance-page-primary');
        saveMeta.disabled=!preferenceAvailable;

      }
      if(filtered.length>transactionVisibleLimit){
        const remaining=filtered.length-transactionVisibleLimit;
        action(list,'Show '+Math.min(100,remaining)+' more transactions · '+remaining+' remaining',()=>{
          transactionVisibleLimit+=100;renderRows();
        },'finance-page-button finance-page-show-more');
      }
    }
    renderRows();
  }
  async function disconnectBank(source,handle,name){
    if(busy)return;
    const plaid=source==='plaid';
    const warning=plaid
      ?'Disconnect '+(name||'this bank')+'? This removes its saved Finances activity, but keeps your bonus tracker entries. The used Plaid Trial slot is not returned.'
      :'Disconnect SimpleFIN? All SimpleFIN bank connections and synced activity will be removed from BonusTracker. Bonus tracker entries remain. Revoke the connection separately in SimpleFIN Bridge.';
    const okay=await confirmFinance(warning,{
      title:plaid?'Remove connected bank?':'Disconnect SimpleFIN?',
      confirmLabel:plaid?'Remove bank':'Disconnect all',danger:true
    });
    if(!okay)return;
    busy=true;activityNotice='';paint();
    try{
      if(plaid&&!handle)throw Error('This bank has no valid connection reference.');
      await request(plaid?'/items/'+encodeURIComponent(handle):'',{method:'DELETE'},source);
      const latest=await request('',{},source);
      applySource(source,latest);
      accountDraftProfiles={};dirtyAccounts.clear();expandedAccountSettings.clear();
      connectionNotice=(plaid?'Bank removed.':'SimpleFIN disconnected.')+' Saved bonus tracker entries were not changed.';
    }catch(error){
      activityNotice='Removal could not be confirmed. '+String(error?.message||'Check your connection and retry.');
    }finally{busy=false;paint();}
  }
  function accountTitle(account){
    const p=profile(account),last=String(account.mask||account.last4||'');
    let name=String(p.displayName||account.name||TYPES[p.kind]||'Account').trim();
    // Strip only an explicit mask, never a meaningful number in a product name.
    for(let i=0;i<4;i++){
      const cleaned=name.replace(/(?:[·•*x]{2,}|ending\s*(?:in)?\s*)\s*\d{4}\s*$/i,'')
        .replace(/\s*\(\s*(?:[·•*x]{0,2})\d{4}\s*\)\s*$/i,'').trim();
      if(cleaned===name)break;
      name=cleaned;
    }
    if(/^\d{4}$/.test(last))name=name.replace(new RegExp('[ ·•*x]+'+last+'\\s*$','i'),'').trim();
    const bank=String(account.bank||'').trim();
    if(bank&&name.toLowerCase().startsWith((bank+' '+bank).toLowerCase()))name=name.slice(bank.length+1);
    if(bank&&/^(?:credit\s*card|visa|mastercard)$/i.test(name))name=bank+' '+name;
    return name+(/^\d{4}$/.test(last)?' ··'+last:'');
  }
  function syncLabel(at){
    if(!Number.isFinite(at)||at<=0)return 'Not synced yet';
    const d=new Date(at*1000),now=new Date(),yesterday=new Date();yesterday.setDate(now.getDate()-1);
    if(d.toDateString()===now.toDateString())return 'Synced '+d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
    if(d.toDateString()===yesterday.toDateString())return 'Synced yesterday';
    return 'Synced '+d.toLocaleDateString(undefined,{month:'short',day:'numeric'});
  }
  function accountAmount(account){
    const value=window.BTFinanceOverview.cents(account.balance),p=profile(account);
    if(value!==null&&['credit_card','loan','mortgage','other_liability'].includes(p.kind))
      return amount(window.BTFinanceOverview.decimal(value<0n?-value:value),account.currency)+(value<0n?' credit':' owed');
    return amount(account.balance,account.currency);
  }
  function accountIcon(parent,account){
    return el('span',String(account.bank||account.name||'A').trim().slice(0,1).toUpperCase(),parent,'finance-page-account-icon');
  }
  function sheet(title,full=false){
    const previous=document.activeElement;
    const dialog=el('dialog',undefined,document.body,'finance-page finance-modal'+(full?' finance-modal-full':''));
    dialog.setAttribute('aria-label',title);
    const head=el('div',undefined,dialog,'finance-page-section-head finance-modal-head');
    el('h2',title,head);action(head,'Close',()=>dialog.close());
    dialog.addEventListener('close',()=>{dialog.remove();if(previous?.isConnected)previous.focus()},{once:true});
    dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientY<r.top||event.clientY>r.bottom||event.clientX<r.left||event.clientX>r.right)dialog.close()}});
    dialog.showModal();return dialog;
  }
  function confirmFinance(message,options={}){
    return new Promise(resolve=>{const modal=sheet(options.title||'Please review');
      let settled=false;const finish=value=>{if(settled)return;settled=true;resolve(value);modal.close()};
      el('p',message,modal);action(modal,'Cancel',()=>finish(false));
      action(modal,options.confirmLabel||'Continue',()=>finish(true),'finance-page-button finance-danger');
      modal.addEventListener('close',()=>{if(!settled){settled=true;resolve(false)}},{once:true});
    });
  }
  function closeFinanceDialogs(){for(const modal of document.querySelectorAll('dialog.finance-modal'))modal.close()}
  async function saveAccountProfile(account,updates){
    const current=sourceSnapshot(account.source)?.accountProfiles?.[account.rawKey]||{};
    const p={...profile(account),...updates};
    return change(async()=>{
      const snapshot=await request('/account-profiles',{method:'PUT',body:JSON.stringify({profiles:{[account.rawKey]:{
        ...current,kind:p.kind,balanceMode:p.balanceMode,order:p.order??499,hidden:p.hidden===true,
        displayName:p.displayName||'',includeSpending:p.includeSpending,syncEnabled:p.syncEnabled!==false
      }}})},account.source);
      return {financeSource:account.source,snapshot};
    },true);
  }
  async function accountAction(account,actionName,extra={}){
    const snapshot=await request('/account-action',{method:'POST',body:JSON.stringify({account:account.rawKey,action:actionName,...extra})},account.source);
    applySource(account.source,snapshot);accountDraftProfiles={};paint();return snapshot.accountAction;
  }
  function removeAccount(account,parent){
    const modal=sheet('Remove '+accountTitle(account)+'?');
    el('p','Only this account will stop syncing. Your other accounts stay connected.',modal);
    el('p','Past transactions stay in reports unless you choose to delete history.',modal);
    const remove=async deleteHistory=>{
      if(deleteHistory){
        const confirmed=await confirmFinance('Permanently delete this account’s saved transactions and balance history? This cannot be undone after the Undo window.',{title:'Delete history?',confirmLabel:'Delete history',danger:true});
        if(!confirmed)return;
      }
      try{
        const result=await accountAction(account,'remove',{deleteHistory});
        modal.close();if(parent?.open)parent.close();
        undoRemoval(account,result,deleteHistory);
      }catch(error){el('p','Account was not removed. '+error.message,modal,'finance-page-warning')}
    };
    action(modal,'Remove account',()=>remove(false),'finance-page-button finance-page-primary');
    action(modal,'Remove and delete history',()=>remove(true),'finance-page-button finance-danger');
    action(modal,'Cancel',()=>modal.close());
  }
  function undoRemoval(account,result,deleteHistory){
    const expectedOwner=sessionIdentity;
    const toast=el('aside',undefined,document.body,'finance-page finance-undo');toast.setAttribute('role','status');
    el('span','Account removed · Undo available for 10 seconds',toast);
    let undone=false;
    const undo=action(toast,'Undo',async()=>{
      undo.disabled=true;
      if(expectedOwner!==sessionIdentity){clearTimeout(timer);toast.remove();return}
      try{await accountAction(account,'restore',{removalId:result.removalId});undone=true;clearTimeout(timer);toast.remove()}
      catch(error){undo.disabled=false;el('small',error.message,toast)}
    });
    const timer=setTimeout(async()=>{
      undo.disabled=true;
      if(!undone&&deleteHistory&&expectedOwner===sessionIdentity&&window.BTBonusAuth?.connected()){
        try{await accountAction(account,'delete_history',{deleteHistory:true,removalId:result.removalId})}
        catch(error){connectionNotice='Account removed; history deletion was not completed. '+error.message;paint()}
      }
      toast.remove();
    },10200);
  }
  function openAccount(account){
    const modal=sheet(accountTitle(account),true),p={...profile(account)};
    const intro=el('section',undefined,modal,'finance-page-account-intro');accountIcon(intro,account);
    el('p',account.bank||'Bank',intro);el('strong',accountAmount(account),intro,'finance-page-big-number');
    if(account.creditLimit!=null)el('small','Credit limit '+amount(account.creditLimit,account.currency),intro);
    if(account.availableBalance!=null)el('small','Available '+amount(account.availableBalance,account.currency),intro);
    el('small',syncLabel(account.transactionLastSyncAt||sourceSnapshot(account.source)?.lastSuccess),intro);
    const chart=el('section',undefined,modal,'finance-page-card');el('h3','Balance history',chart);
    const ranges=el('div',undefined,chart,'finance-page-period'),plot=el('div',undefined,chart);
    const draw=days=>{plot.replaceChildren();
      const points=(currentCombined.balanceHistory?.[account.key]||[]).filter(x=>(x.observedAt||x.at)>Date.now()/1000-days*86400)
        .map(x=>({at:x.observedAt||x.at,value:profile(account).balanceMode==='liability'?String(-Number(x.balance)):x.balance}));
      if(points.length<2)el('p','Your balance trend will appear after more syncs.',plot);else trendChart(plot,points);
    };
    for(const [label,days] of [['1M',30],['3M',90],['1Y',365]])action(ranges,label,()=>draw(days),'finance-page-chip');draw(90);
    const recent=el('section',undefined,modal,'finance-page-card');el('h3','Recent transactions',recent);
    const rows=Object.values(currentCombined.transactions?.[account.key]||{}).sort((a,b)=>b.posted-a.posted).slice(0,5);
    if(!rows.length)el('p',account.historyComplete===false?'History still loading':'No recent transactions',recent);
    for(const row of rows){const line=el('div',undefined,recent,'finance-page-preview-row');el('strong',displayMerchant(row),line);el('b',amount(row.amount,account.currency),line)}
    action(recent,'See all',()=>{transactionAccount=account.key;view='transactions';modal.close();paint()});
    const fields=el('section',undefined,modal,'finance-page-card');el('h3','Settings',fields);
    const label=el('label',undefined,fields,'finance-page-field');el('span','Name',label);
    const name=el('input',undefined,label,'finance-page-search');name.value=p.displayName||account.name||'';name.maxLength=90;
    select(fields,'Type',TYPES,p.kind,value=>{
      p.kind=value;p.balanceMode=['credit_card','loan','mortgage','other_liability'].includes(value)?'liability':'asset';
      p.includeSpending=['checking','credit_card'].includes(value);net.checked=true;spending.checked=p.includeSpending;
    });
    const toggle=(title,checked,callback)=>{const wrap=el('label',undefined,fields,'finance-setting-row');el('span',title,wrap);const input=el('input',undefined,wrap);input.type='checkbox';input.setAttribute('role','switch');input.checked=checked;input.onchange=()=>callback(input.checked);return input};
    const net=toggle('Include in net worth',p.balanceMode!=='exclude',checked=>{p.balanceMode=checked?(['credit_card','loan','mortgage','other_liability'].includes(p.kind)?'liability':'asset'):'exclude'});
    const spending=toggle('Include in spending & budgets',p.includeSpending!==false,checked=>p.includeSpending=checked);
    toggle('Sync',p.syncEnabled!==false,checked=>p.syncEnabled=checked);
    const save=action(fields,'Save account settings',async()=>{
      save.disabled=true;await saveAccountProfile(account,{...p,displayName:name.value.trim()});
      if(!saveNotice&&modal.open)modal.close();else{save.disabled=false;el('p',saveNotice,fields,'finance-page-warning')}
    },'finance-page-button finance-page-primary');
    action(fields,p.hidden?'Unhide account':'Hide account',async()=>{await saveAccountProfile(account,{hidden:!p.hidden});if(!saveNotice)modal.close()});
    const bonus=el('details',undefined,fields,'finance-page-optional-tracking');el('summary','Bonus tracking',bonus);
    el('p','Optional. Manage which tracker entry this account belongs to.',bonus);
    action(bonus,'Manage tracking',()=>{modal.close();window.btOpenBankSync?.()});
    action(modal,'Remove account',()=>removeAccount(account,modal),'finance-page-button finance-danger');
    if(account.source==='simplefin'){const tip=el('p','To stop sharing this account at the bank connection too, update ',modal);const link=el('a','SimpleFIN Bridge',tip);link.href='https://bridge.simplefin.org/';link.target='_blank';link.rel='noopener noreferrer'}
  }
  function accounts(host){
    const card=el('section',undefined,host,'finance-page-card finance-page-accounts-card');
    const head=el('div',undefined,card,'finance-page-section-head');el('h3','Accounts',head);
    const add=action(head,'+',()=>window.btOpenBankConnectFlow?.(),'finance-page-button finance-page-primary');add.setAttribute('aria-label','Add account');
    if(currentCombined.possibleDuplicates?.length){
      const review=el('details',undefined,card,'finance-page-matching-accounts');el('summary','Review matching accounts',review);
      for(const pair of currentCombined.possibleDuplicates){
        const id=pair.slice().sort((a,b)=>a.startsWith('simplefin:')?-1:b.startsWith('simplefin:')?1:0).join('|');
        const members=pair.map(key=>currentCombined.accounts.find(a=>a.key===key));
        const section=el('section',undefined,review,'finance-page-card');
        el('p',members.map(a=>accountTitle(a)+' via '+a.sourceLabel).join(' / '),section);
        el('small','Confirm whether these are the same account. Only the preferred connection supplies the balance.',section);
        const choices={'':'Choose preferred connection'};for(const a of members)choices[a.key]=a.sourceLabel+' · '+accountTitle(a);
        const chooser=select(section,'Same account — preferred connection',choices,financePrefs.duplicates?.[id]?.primary||'',value=>{if(value)saveSetting('duplicates',id,{primary:value})});
        chooser.disabled=!preferenceAvailable;
        action(section,'These are separate accounts',()=>saveSetting('duplicates',id,{separate:true})).disabled=!preferenceAvailable;
      }
    }
    const controls=el('div',undefined,card,'finance-page-account-tools');
    const search=el('input',undefined,controls,'finance-page-search');search.type='search';search.placeholder='Find an account';search.setAttribute('aria-label','Search accounts');search.value=accountSearch;
    const filters=el('details',undefined,controls,'finance-page-filter-details');const filter=el('summary','Filters',filters);filter.setAttribute('role','button');
    select(filters,'Type',{'':'All account types',...TYPES},accountType,value=>{accountType=value;render()});
    const list=el('div',undefined,card,'finance-page-account-groups');
    action(card,'Manage connections',()=>{view='connections';paint()});
    search.oninput=()=>{accountSearch=search.value.trim().toLowerCase();render()};
    function row(parent,account){
      const wrap=el('article',undefined,parent,'finance-page-account-editor');
      const button=action(wrap,'',()=>openAccount(account),'finance-page-account');button.setAttribute('aria-label',accountTitle(account));
      accountIcon(button,account);const info=el('span',undefined,button,'finance-page-account-info');
      el('strong',accountTitle(account),info);el('small',account.bank+' · via '+account.sourceLabel,info,'finance-page-account-source');
      el('small',syncLabel(account.transactionLastSyncAt||sourceSnapshot(account.source)?.lastSuccess),info);
      if(account.source==='plaid'){
        const last=Number(account.transactionLastSyncAt)||0,next=Number(account.transactionNextSyncAt)||0,now=Date.now()/1000;
        const hours=seconds=>Math.max(0,Math.round(seconds/3600));
        if(account.historyComplete===true&&!Object.values(currentCombined?.transactions?.[account.key]||{}).length)
          el('small','No transactions yet',info,'finance-page-loading-hint');
        else if(account.historyComplete===false){
          const overdue=last&&now-last>86400;
          el('small',overdue?'Still waiting on '+account.bank+' — last checked '+hours(now-last)+'h ago, next check in '+hours(next-now)+'h':'History still loading',info,'finance-page-loading-hint');
          if(overdue)action(wrap,'Refresh',refreshActivity,'finance-page-button');
        }
      }
      if(account.invalidTransactionRows>0)el('small',account.invalidTransactionRows+' transactions could not be read',info,'finance-page-warning');
      const balance=el('span',undefined,button,'finance-page-account-balances');el('b',accountAmount(account),balance);
      if(account.removedAt)action(wrap,'Restore',()=>change(async()=>{await accountAction(account,'restore');return sourceSnapshot(account.source)}));
    }
    function render(){
      list.replaceChildren();const groups={Cash:[], 'Credit cards':[], Investments:[], Loans:[], Other:[]},inactive=[];
      const broken=new Set();
      const secondaries=new Set(Object.entries(financePrefs.duplicates||{}).filter(([,decision])=>decision.primary).flatMap(([pair,decision])=>pair.split('|').filter(k=>k!==decision.primary)));
      for(const a of sortedAccounts(true)){
        if(secondaries.has(a.key))continue;
        const p=profile(a),match=[a.bank,accountTitle(a)].join(' ').toLowerCase();
        if(accountSearch&&!match.includes(accountSearch)||accountType&&p.kind!==accountType)continue;
        if(a.removedAt||p.hidden){inactive.push(a);continue}
        const group=['checking','savings'].includes(p.kind)?'Cash':p.kind==='credit_card'?'Credit cards':['brokerage','retirement'].includes(p.kind)?'Investments':['loan','mortgage','other_liability'].includes(p.kind)?'Loans':'Other';
        groups[group].push(a);
      }
      for(const [title,rows] of Object.entries(groups)){
        if(!rows.length)continue;
        const group=el('section',undefined,list,'finance-page-institution');
        const head=el('div',undefined,group,'finance-page-institution-head');el('h4',title,head);
        const usd=rows.filter(a=>a.currency==='USD'),values=usd.map(a=>window.BTFinanceOverview.cents(a.balance));
        const subtotal=values.length&&values.every(x=>x!==null)?window.BTFinanceOverview.decimal(values.reduce((sum,x)=>sum+x,0n)):null;
        el('b',(usd.length!==rows.length?'USD subtotal · ':'')+amount(subtotal,'USD')+
          (title==='Credit cards'&&subtotal!==null?(values.reduce((sum,x)=>sum+x,0n)<0n?' credit':' owed'):''),head);
        for(const a of rows){
          const bankKey=a.source+':'+(a.connectionHandle||a.bank);
          if(a.transactionSyncStatus==='needs_attention'&&!broken.has(bankKey)){
            broken.add(bankKey);const alert=el('div',undefined,group,'finance-connection-error');
            el('span',a.source==='simplefin'?a.bank+' needs you to sign in again on SimpleFIN':a.bank+' needs connection attention',alert);
            action(alert,a.source==='simplefin'?'Reconnect SimpleFIN':'Reconnect',()=>reconnectAccount(a));
          }
          row(group,a);
        }
      }
      if(inactive.length){const hidden=el('details',undefined,list,'finance-page-hidden-accounts');el('summary','Hidden and removed ('+inactive.length+')',hidden);for(const a of inactive)row(hidden,a)}
      if(!Object.values(groups).some(x=>x.length)&&!inactive.length)el('p',accountSearch?'No matching accounts':'Add a bank to see your accounts here.',list);
    }
    render();
  }
  async function reconnectAccount(account){
    if(account.source==='simplefin'){window.btOpenBankSync?.();return}
    try{
      const result=await settingsRequest('/../plaid/items/'+encodeURIComponent(account.connectionHandle)+'/link-token',{method:'POST'});
      if(!window.Plaid?.create)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://cdn.plaid.com/link/v2/stable/link-initialize.js';script.onload=resolve;script.onerror=()=>reject(Error('Reconnect window could not load.'));document.head.append(script)});
      const link=window.Plaid.create({token:result.linkToken,onSuccess:async()=>{
        try{const snapshot=await settingsRequest('/../plaid/items/'+encodeURIComponent(account.connectionHandle)+'/update-complete',{method:'POST'});applySource('plaid',snapshot);connectionNotice='Bank connection updated.';paint()}
        catch(error){connectionNotice=error.message;paint()}finally{link.destroy?.()}
      },onExit:()=>link.destroy?.()});link.open();
    }catch(error){connectionNotice='Reconnect could not open. '+error.message;paint()}
  }
  function connections(host){
    const section=el('section',undefined,host,'finance-page-card');
    const head=el('div',undefined,section,'finance-page-section-head');el('h3','Manage connections',head);action(head,'Back to accounts',()=>{view='accounts';paint()});
    const institutions=new Map();
    for(const account of sortedAccounts(true)){const key=account.source+':'+(account.connectionHandle||account.bank);if(!institutions.has(key))institutions.set(key,[]);institutions.get(key).push(account)}
    for(const rows of institutions.values()){
      const account=rows[0],broken=rows.some(a=>a.transactionSyncStatus==='needs_attention'),loading=rows.some(a=>a.historyComplete===false);
      const card=action(section,'',()=>openConnection(rows),'finance-page-connection-card');accountIcon(card,account);
      const text=el('span',undefined,card);el('strong',account.bank||'Bank',text);el('small','via '+account.sourceLabel+' · '+rows.filter(a=>!a.removedAt).length+' accounts',text);
      el('small',syncLabel(sourceSnapshot(account.source)?.lastSuccess),text);el('span',rows.every(a=>a.institutionRemoved||a.connectionStatus==='disconnected')?'Disconnected':broken?'Needs attention':loading?'Syncing':'Connected',card,'finance-page-status-pill');
    }
  }
  function openConnection(rows){
    const account=rows[0],modal=sheet(account.bank||'Bank',true);
    el('p','Connected via '+account.sourceLabel,modal);
    for(const a of rows){const p=profile(a),line=el('div',undefined,modal,'finance-setting-row');
      el('span',accountTitle(a),line);
      if(a.removedAt||p.hidden){action(line,'Restore',async()=>{try{if(a.removedAt)await accountAction(a,'restore');if(p.hidden)await saveAccountProfile(a,{hidden:false});modal.close()}catch(error){el('p',error.message,modal)}});continue}
      const label=el('label',undefined,line);el('span','Sync',label);const input=el('input',undefined,label);input.type='checkbox';input.setAttribute('role','switch');input.checked=p.syncEnabled!==false;input.setAttribute('aria-label','Sync '+accountTitle(a));input.onchange=async()=>{await saveAccountProfile(a,{syncEnabled:input.checked});if(saveNotice)input.checked=!input.checked};
    }
    action(modal,'Refresh now',async()=>{try{const snapshot=await request('/sync',{method:'POST'},account.source);applySource(account.source,snapshot);connectionNotice='Refresh complete.';modal.close();paint()}catch(error){el('p',error.message,modal)}});
    action(modal,'Reconnect',()=>{modal.close();reconnectAccount(account)});
    if(account.source==='plaid')action(modal,'Choose which accounts to share',()=>{modal.close();reconnectAccount(account)});
    action(modal,'Disconnect bank',()=>disconnectConnection(account,modal),'finance-page-button finance-danger');
    if(account.source==='simplefin'){const p=el('p','To revoke sharing or manage your subscription, visit ',modal);const link=el('a','SimpleFIN Bridge',p);link.href='https://bridge.simplefin.org/';link.target='_blank';link.rel='noopener noreferrer'}
  }
  function disconnectConnection(account,parent){
    const modal=sheet('Disconnect '+account.bank+'?');
    el('p','Only this bank will stop syncing. Other banks stay connected.',modal);
    const disconnect=async deleteHistory=>{
      if(deleteHistory&&!await confirmFinance('Permanently delete the saved transactions and balance history for every account at this bank?',{title:'Delete bank history?',confirmLabel:'Delete history'}))return;
      try{
        const path=account.source==='simplefin'?'/institution-action':'/items/'+encodeURIComponent(account.connectionHandle)+(deleteHistory?'?delete_history=true':'');
        const options=account.source==='simplefin'?{method:'POST',body:JSON.stringify({handle:account.connectionHandle,deleteHistory})}:{method:'DELETE'};
        const snapshot=await request(path,options,account.source);
        applySource(account.source,account.source==='simplefin'?snapshot:await request('',{},account.source));
        connectionNotice='Bank disconnected. '+(deleteHistory?'History deleted.':'History kept.');
        modal.close();if(parent.open)parent.close();paint();
      }catch(error){el('p','Disconnect could not be confirmed. '+error.message,modal,'finance-page-warning')}
    };
    action(modal,'Disconnect and keep history',()=>disconnect(false),'finance-page-button finance-page-primary');
    action(modal,'Disconnect and delete history',()=>disconnect(true),'finance-page-button finance-danger');
    action(modal,'Cancel',()=>modal.close());
  }
  function paint(){
    const host=currentRoot;if(!host||!host.isConnected)return;
    // An old in-memory Bonuses selection falls back to Finance Overview.
    if(view==='bonuses')view='overview';
    window.BTBonusEvidence?.dispose();
    host.replaceChildren();
    currentCombined=unified();
    if(saveNotice){const notice=el('p',saveNotice,host,'finance-page-notice');notice.setAttribute('role','alert');}
    if(!data){const skeleton=statusMessage(host,'Loading accounts','Checking secure connections…');skeleton.classList.add('finance-skeleton');skeleton.setAttribute('aria-busy','true');return}
    if(!currentCombined?.connected){
      statusMessage(host,data?.error?'Bank connections unavailable':'Connect a bank',data?.error||'All of your supported accounts will appear in one dashboard.');
      action(host,'Add bank',()=>window.btOpenBankConnectFlow?.(),'finance-page-button finance-page-primary');return;
    }
    const summaryState=window.BTFinanceUnified.safeForSummary(currentCombined);
    const calculated=window.BTFinanceOverview?.summarize(summaryState,{days:period});
    const trustedTotals=!summaryState.incompleteProviders&&!summaryState.excludedForReview;
    const summary={...calculated,
      complete:!!calculated?.complete&&trustedTotals&&!summaryState.historyIncomplete&&!summaryState.malformedActivity,
      cashAvailable:!!calculated?.cashAvailable&&trustedTotals,
      netWorthAvailable:!!calculated?.netWorthAvailable,
      netWorthPartial:!!calculated?.netWorthPartial||!trustedTotals,
      hiddenAccounts:summaryState.hiddenAccounts||0};
    hero(host,summary);
    if(connectionNotice){const banner=el('p',connectionNotice,host,'finance-page-connection-success');banner.setAttribute('role','status');}
    if(monitoringNotice){const banner=el('p',monitoringNotice,host,'finance-page-activity-result');banner.setAttribute('role','status');}
    if(activityNotice){const banner=el('p',activityNotice,host,'finance-page-activity-result');banner.setAttribute('role','status');}
    const needsAttention=summaryState.incompleteProviders||summaryState.malformedActivity;
    const loading=summaryState.historyIncomplete;
    if(needsAttention||loading||settingsNotice||archiveLoading){
      const row=el('details',undefined,host,'finance-page-status-row');
      const count=(currentCombined?.accounts||[]).filter(a=>a.transactionSyncStatus==='needs_attention').length;
      const label=needsAttention?(count||1)+' bank'+((count||1)===1?'':'s')+' needs attention':
        loading?'Importing transaction history for 1 bank. Updates automatically.':
        archiveLoading?'Loading earlier transactions…':settingsNotice;
      el('summary',label,row);
      const detail=el('p',undefined,row);
      detail.textContent=needsAttention?'Open Accounts to check the connection or refresh your accounts.':
        loading?'Transaction imports continue automatically. Earlier months may be incomplete.':
        archiveLoading?'Previously imported months are being loaded securely.':settingsNotice;
      if(needsAttention)action(row,'Check accounts',()=>{view='accounts';paint()});
    }
    if(view==='transactions')transactions(host);
    else if(view==='accounts')accounts(host);
    else if(view==='connections')connections(host);
    else if(view==='spending')spendingView(host);
    else if(view==='recurring')recurringView(host);
    else overview(host,summary);
  }
  let sessionIdentity=null,lastAuthenticatedOwner=null,mountCall=0;
  async function mount(){
    const host=document.getElementById('bt-finances-page');if(!host||host===currentRoot)return;
    const call=++mountCall,auth=window.BTBonusAuth;
    if(!auth?.connected()){
      window.BTBonusEvidence?.dispose();
      closeFinanceDialogs();
      sessionIdentity=null;lastAuthenticatedOwner=null;expandedAccountSettings.clear();monitoringNotice='';activityNotice='';connectionNotice='';
      currentRoot=host;data=null;otherData=null;sequence++;
      for(const key of ['simplefin','plaid'])archives[key]={};financePrefs={version:1,revision:0,budgets:{},duplicates:{},recurring:{},transactionMeta:{}};preferenceAvailable=false;
      host.replaceChildren();statusMessage(host,'Sign in to view finances','Sign in securely to view linked financial accounts.');
      action(host,'Sign in / manage accounts',()=>window.btOpenBankSync?.(),'finance-page-button finance-page-primary');return;
    }
    let identity=null;
    try{const token=await auth.token();identity=sessionOwner(token)||token}
    catch(_error){/* Never render another owner's cached financial data on auth errors. */}
    if(call!==mountCall||!host.isConnected||!auth.connected()||window.BTBonusAuth!==auth)return;
    if(!identity){
      closeFinanceDialogs();
      window.BTBonusEvidence?.dispose();sessionIdentity=null;data=null;otherData=null;currentRoot=host;
      host.replaceChildren();statusMessage(host,'Session needs attention','Sign in again before viewing financial records.');return;
    }
    if(identity===sessionIdentity&&data){
      // Main app redraws must not destroy in-progress review, filters or account
      // snapshots for the same owner. Preserve any in-flight second-provider read.
      currentRoot=host;paint();return;
    }
    window.BTBonusEvidence?.dispose();
    if(lastAuthenticatedOwner&&lastAuthenticatedOwner!==identity){
      closeFinanceDialogs();
      expandedAccountSettings.clear();monitoringNotice='';activityNotice='';connectionNotice='';
    }
    lastAuthenticatedOwner=identity;sessionIdentity=identity;currentRoot=host;data=null;otherData=null;
    for(const key of ['simplefin','plaid'])archives[key]={};financePrefs={version:1,revision:0,budgets:{},duplicates:{},recurring:{},transactionMeta:{}};preferenceAvailable=false;
    accountDraftProfiles={};dirtyAccounts.clear();
    Object.keys(monitoringDraft).forEach(k=>delete monitoringDraft[k]);
    const rev=++sequence;paint();
    try{
      const result=await request();
      if(rev!==sequence||host!==currentRoot||!host.isConnected)return;
      data=result;paint();loadOtherSource(rev);loadSettings(rev);
    }catch(error){
      if(rev!==sequence||host!==currentRoot||!host.isConnected)return;
      // A broken SimpleFIN connection must not hide already-authorized Plaid
      // accounts. Fall back to the other source while explaining partial data.
      data={configured:false,connected:false,accounts:[],error:String(error.message||'Connection unavailable')};
      paint();loadOtherSource(rev);loadSettings(rev);
    }
  }
  function refresh(){
    window.BTBonusEvidence?.dispose();currentRoot=null;data=null;otherData=null;sessionIdentity=null;
    accountDraftProfiles={};dirtyAccounts.clear();
    Object.keys(monitoringDraft).forEach(k=>delete monitoringDraft[k]);sequence++;mount();
  }
  window.addEventListener('bt:plaid-bank-connected',event=>{
    const detail=event?.detail||{},count=Number(detail.count);
    connectionNotice=detail.status==='ready'?
      'Plaid bank connected. '+(Number.isInteger(count)&&count>=0?count+' account'+(count===1?'':'s')+' discovered. ':'')+
      'Transaction history is syncing automatically.':
      'Plaid authorization saved. Account discovery needs attention; manage this bank in Finances.';
    activityNotice='';refresh();
  });
  window.btRefreshFinancesPage=refresh;
  window.btRegisterPostRender?.('finance-page',mount);
  window.addEventListener('storage',event=>{if(event.key==='bonus-ai-auth')refresh()});
})();
