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
    unreviewed:'Needs review',income:'Income',housing:'Housing',utilities:'Utilities',groceries:'Groceries',
    dining:'Dining',transportation:'Transportation',shopping:'Shopping',health:'Health',
    entertainment:'Entertainment',fees:'Fees',taxes:'Taxes',travel:'Travel',
    subscription:'Subscription',transfer:'Transfer',refund:'Refund',bonus:'Bank bonus',other:'Other'
  };
  let currentRoot=null,sequence=0,hidden=false,data=null,otherData=null,busy=false,view='overview',period=90;
  let transactionSearch='',transactionAccount='',transactionCategory='',transactionStatus='';
  let accountSearch='',accountType='',saveNotice='',accountDraftProfiles={},currentCombined=null;
  let activityNotice='',monitoringNotice='',connectionNotice='';
  const dirtyAccounts=new Set(),monitoringDraft={};
  const sourceSnapshot=source=>source===provider?data:otherData?.provider===source?otherData.snapshot:null;
  const unified=()=>window.BTFinanceUnified?.combine({simplefin:sourceSnapshot('simplefin'),plaid:sourceSnapshot('plaid')})||null;
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
    try{return new Intl.NumberFormat(undefined,{style:'currency',currency:code}).format(Number(value))}
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
        balanceMode:saved.balanceMode||'exclude',
        order:Number.isInteger(saved.order)?saved.order:499
      };
    }
    return accountDraftProfiles[account.key];
  }
  function sortedAccounts(){
    return [...(currentCombined?.accounts||[])].sort((a,b)=>(profile(a).order??499)-(profile(b).order??499)
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
    provider=source;hidden=true;transactionAccount='';transactionSearch='';
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
    if(!coverage.enabled){view='transactions';activityNotice='';paint();return;}
    if(busy)return;
    busy=true;activityNotice='';paint();
    const updates=[],errors=[];
    try{
      for(const source of coverage.sources){
        const previous=sourceSnapshot(source);
        if(!(previous?.monitoredAccounts||[]).length)continue;
        try{
          const snapshot=await request('/sync',{method:'POST'},source);
          applySource(source,snapshot);
          updates.push(sourceLabel(source)+': '+activityStatus(snapshot,previous));
        }catch(error){errors.push(sourceLabel(source)+': '+String(error?.message||'sync unavailable'));}
      }
    }finally{
      busy=false;activityNotice=[...updates,...errors].join(' · ')||'No monitored accounts to refresh.';
      paint();
    }
  }
  async function enableAllActivity(){
    if(busy)return;
    const targets=['simplefin','plaid'].filter(source=>
      sourceSnapshot(source)?.connected&&(sourceSnapshot(source)?.accounts||[]).length);
    if(!targets.length)return;
    busy=true;activityNotice='';paint();
    let saved=0;const problems=[];
    try{
      for(const source of targets){
        const snapshot=sourceSnapshot(source),keys=(snapshot.accounts||[]).map(a=>a.key);
        const existing=new Set(snapshot.monitoredAccounts||[]);
        if(keys.every(k=>existing.has(k)))continue;
        try{
          const updated=await request('/monitoring',{method:'PUT',body:JSON.stringify({
            accounts:[...new Set([...existing,...keys])]
          })},source);
          applySource(source,updated);saved+=keys.filter(k=>!existing.has(k)).length;
        }catch(error){problems.push(sourceLabel(source)+': '+String(error?.message||'monitoring could not be enabled'));}
      }
    }finally{
      busy=false;
      monitoringNotice=saved?saved+' account'+(saved===1?'':'s')+' enabled for read-only monitoring.':'';
      activityNotice=problems.length?'Review: '+problems.join(' · '):'';
      paint();
    }
    if(saved&&!problems.length)await refreshActivity();
  }
  function activityPrompt(host){
    const coverage=activityCoverage();
    if(!coverage.total||coverage.enabled===coverage.total)return;
    const box=el('section',undefined,host,'finance-page-card finance-page-activity-setup');
    el('h3',coverage.enabled?'More accounts available':'Transaction monitoring is off',box);
    el('p',coverage.enabled+' of '+coverage.total+' accounts monitored. Enable read-only access '
      +'to import available posted transactions (up to 90 days).',box);
    const actions=el('div',undefined,box,'finance-page-quick-actions');
    action(actions,'Enable activity for all '+coverage.total+' accounts',enableAllActivity,
      'finance-page-button finance-page-primary');
    action(actions,'Choose accounts',()=>{view='accounts';paint()},'finance-page-button');
    el('p','No transfers or payments. Does not confirm bonus qualifications.',box,'finance-page-hint');
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
      if(other.error)el('p','Account check needs attention. Open Plaid to review the connection.',panel,'finance-page-warning');
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
    const accounts=new Map((currentCombined?.accounts||[]).map(a=>[a.key,a])),rows=[];
    for(const [accountKey,records] of Object.entries(currentCombined?.transactions||{})){
      const account=accounts.get(accountKey);if(!account)continue;
      for(const row of Object.values(records||{}))rows.push({...row,accountKey,account,source:account.source});
    }
    return rows.sort((a,b)=>b.posted-a.posted);
  }
  function hero(host,summary){
    const box=el('section',undefined,host,'finance-page-hero');
    const head=el('div',undefined,box,'finance-page-hero-head'),copy=el('div',undefined,head);
    el('span','MY MONEY',copy,'finance-page-kicker');el('h2','Finances',copy);
    action(head,hidden?'Show amounts':'Hide amounts',()=>{hidden=!hidden;paint()});
    const banks=new Set((currentCombined?.accounts||[]).map(a=>String(a.bank||'').trim().toLowerCase()).filter(Boolean));
    el('p',(currentCombined?.accounts||[]).length+' accounts · '+banks.size+' institutions · '+(currentCombined?.sourceCount||0)+' secure connections',box,'finance-page-count');
    const actions=el('div',undefined,box,'finance-page-quick-actions');
    action(actions,'Add bank',()=>window.btOpenBankConnectFlow?.(),'finance-page-button finance-page-primary');
    action(actions,'Discover accounts',discoverSelected,'finance-page-button');
    action(actions,activityCoverage().enabled?'Refresh activity':'Set up activity',refreshActivity,'finance-page-button');
    const meta=el('div',undefined,box,'finance-page-meta');
    el('span',currentCombined?.sourceCount?'Connected':'Not linked',meta);
    for(const [source,label] of [['simplefin','SimpleFIN'],['plaid','Plaid']]){
      const status=currentCombined?.providerState?.[source];
      if(status?.connected)el('span',label+': '+stamp(status.lastSuccess),meta);
    }
    if(currentCombined?.possibleDuplicates?.length)el('p','Possible duplicate account connections detected. Review both before relying on combined totals.',box,'finance-page-warning');
    if(Object.keys(currentCombined?.sourceErrors||{}).length)el('p','One provider needs attention. Account data may be incomplete.',box,'finance-page-warning');
    const nav=el('nav',undefined,host,'finance-page-nav');nav.setAttribute('aria-label','Finance sections');
    for(const [id,label] of [['overview','Overview'],['transactions','Transactions'],['accounts','Accounts'],['bonuses','Bonuses']]){
      const b=action(nav,label,()=>{view=id;paint()},'finance-page-nav-button'+(view===id?' is-active':''));
      b.setAttribute('aria-current',view===id?'page':'false');
    }
    return summary;
  }
  function periodControl(parent){
    const wrap=el('div',undefined,parent,'finance-page-period');
    for(const days of [30,60,90])action(wrap,days+' days',()=>{period=days;paint()},'finance-page-chip'+(period===days?' is-active':''));
  }
  function metric(grid,label,value,note){
    const tile=el('div',undefined,grid,'finance-page-tile');el('span',label,tile);el('strong',value,tile);
    if(note)el('small',note,tile);return tile;
  }
  function trendChart(parent,points){
    if(points.length<2){el('p','Net Worth history will appear after at least two complete balance snapshots.',parent);return}
    const values=points.map(p=>Number(p.value)),min=Math.min(...values),max=Math.max(...values),range=max-min||1;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 320 110');svg.setAttribute('role','img');svg.setAttribute('aria-label','Net Worth trend');svg.classList.add('finance-page-line-chart');
    const coords=values.map((value,index)=>[10+index*(300/Math.max(1,values.length-1)),95-(value-min)/range*75]);
    const area=document.createElementNS(svg.namespaceURI,'path');area.setAttribute('d','M '+coords[0][0]+' 100 L '+coords.map(x=>x.join(' ')).join(' L ')+' L '+coords.at(-1)[0]+' 100 Z');area.setAttribute('class','finance-page-line-area');svg.append(area);
    const line=document.createElementNS(svg.namespaceURI,'polyline');line.setAttribute('points',coords.map(x=>x.join(',')).join(' '));line.setAttribute('class','finance-page-line');svg.append(line);parent.append(svg);
    const labels=el('div',undefined,parent,'finance-page-chart-labels');el('span',date(points[0].at),labels);el('strong',amount(points.at(-1).value,'USD'),labels);el('span',date(points.at(-1).at),labels);
  }
  function compactAccountPreview(host){
    const card=el('section',undefined,host,'finance-page-card finance-page-preview-card');
    const head=el('div',undefined,card,'finance-page-section-head');
    el('h3','Connected accounts',head);
    action(head,'View all',()=>{view='accounts';paint()},'finance-page-preview-link');
    const accounts=sortedAccounts();
    if(!accounts.length){el('p','Connect a bank to view its accounts.',card,'finance-page-hint');return}
    const list=el('div',undefined,card,'finance-page-preview-list');
    for(const account of accounts.slice(0,4)){
      const line=el('div',undefined,list,'finance-page-preview-row');
      const copy=el('div',undefined,line,'finance-page-preview-copy');
      el('strong',account.bank||'Financial institution',copy);
      el('small',(account.name||'Account')+' · '+account.sourceLabel,copy);
      el('b',amount(account.balance,account.currency),line,'finance-page-preview-value');
    }
    if(accounts.length>4)el('p','+'+(accounts.length-4)+' more accounts',card,'finance-page-hint');
  }
  function compactActivityPreview(host){
    const card=el('section',undefined,host,'finance-page-card finance-page-preview-card');
    const head=el('div',undefined,card,'finance-page-section-head');
    el('h3','Recent transactions',head);
    action(head,'View all',()=>{view='transactions';paint()},'finance-page-preview-link');
    const rows=flattenTransactions().filter(row=>Number.isFinite(row.posted)&&row.posted>0).slice(0,5);
    if(!rows.length){el('p','Transaction activity appears here after account monitoring is enabled.',card,'finance-page-hint');return}
    const list=el('div',undefined,card,'finance-page-preview-list');
    for(const row of rows){
      const item=el('div',undefined,list,'finance-page-preview-row');
      const copy=el('div',undefined,item,'finance-page-preview-copy');
      el('strong',row.merchant||row.description||'Transaction',copy);
      el('small',(row.account.bank||'Bank')+' · '+row.account.sourceLabel+' · '+date(row.posted),copy);
      el('b',amount(row.amount,row.account.currency),item,'finance-page-preview-value');
    }
  }
  function overview(host,summary){
    const position=el('section',undefined,host,'finance-page-card');
    el('h3','All accounts',position);
    const grid=el('div',undefined,position,'finance-page-grid');
    const cash=(currentCombined?.accounts||[]).filter(a=>['checking','savings'].includes(profile(a).kind));
    const exact=window.BTFinanceOverview;
    const canReport=cash.length>0&&cash.every(a=>a.currency==='USD'&&exact.cents(a.balance)!==null&&!a.possibleDuplicate);
    const reported=canReport?cash.reduce((total,a)=>total+exact.cents(a.balance),0n):null;
    metric(grid,'Cash (reported)',canReport?amount(exact.decimal(reported),'USD'):'—','Provider balances may be delayed');
    metric(grid,'Cash (verified)',summary.cashAvailable?amount(summary.cash,'USD'):'—');
    metric(grid,'Assets',summary.netWorthAvailable?amount(summary.assets,'USD'):'—');
    metric(grid,'Liabilities',summary.netWorthAvailable?amount(summary.liabilities,'USD'):'—');
    metric(grid,'Net worth',summary.netWorthAvailable?amount(summary.netWorth,'USD'):'—');
    if(!summary.netWorthAvailable)el('p','Net worth requires complete, correctly categorized, recently verified USD balances. An unknown amount is not $0.00.',position,'finance-page-hint');
    if(currentCombined?.possibleDuplicates?.length)el('p','Overlapping bank connections are excluded from reported totals pending review.',position,'finance-page-caution');
    compactAccountPreview(host);
    const activity=el('section',undefined,host,'finance-page-card');
    const activityHead=el('div',undefined,activity,'finance-page-section-head');el('h3','Cash flow',activityHead);periodControl(activityHead);
    const activityGrid=el('div',undefined,activity,'finance-page-grid');
    metric(activityGrid,'Income',summary.hasActivity?amount(summary.income,'USD'):'—');
    metric(activityGrid,'Expenses',summary.hasActivity?amount(summary.expenses,'USD'):'—');
    metric(activityGrid,'Net flow',summary.hasActivity?amount(summary.cashFlow,'USD'):'—');
    metric(activityGrid,'Savings rate',summary.savingsRate===null?'—':summary.savingsRate.toFixed(1)+'%');
    if(!summary.complete)el('p','Cash Flow is partial: review '+summary.unreviewed+' uncategorized transaction'+(summary.unreviewed===1?'':'s')+'.',activity,'finance-page-caution');
    compactActivityPreview(host);
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
        bar.style.width=Math.max(3,Number(value)/max*100)+'%';
      }
    }
    const attention=el('section',undefined,more,'finance-page-card');el('h3','Needs review',attention);
    const signals=flattenTransactions().filter(r=>!r.pending&&Array.isArray(r.signals)&&r.signals.some(x=>['possible_direct_deposit','possible_bonus','possible_reversal','possible_fee','possible_recurring'].includes(x)));
    if(!signals.length)el('p','No flagged transactions in the available data.',attention);
    else for(const row of signals.slice(0,8)){
      const line=el('article',undefined,attention,'finance-page-review-row'),copy=el('div',undefined,line);
      el('strong',row.merchant||row.description,copy);el('small',row.account.bank+' · '+date(row.posted)+' · '+row.signals.map(signalLabel).join(' · '),copy);
      el('b',amount(row.amount,row.account.currency),line);
    }
    el('p','A flagged transaction is not confirmation of bonus eligibility.',attention,'finance-page-hint');
  }
  function signalLabel(value){
    return ({possible_direct_deposit:'Possible direct deposit',possible_bonus:'Possible bonus',possible_reversal:'Possible reversal',
      possible_fee:'Possible fee',possible_recurring:'Possible recurring payment',matched_internal_transfer:'Matched transfer',
      possible_transfer:'Possible transfer',possible_refund:'Possible refund'})[value]||value.replaceAll('_',' ');
  }
  function transactions(host){
    const card=el('section',undefined,host,'finance-page-card');
    const head=el('div',undefined,card,'finance-page-section-head');el('h3','Transactions',head);periodControl(head);
    el('p','Available posted transactions from monitored accounts, across both providers.',card,'finance-page-hint');
    activityPrompt(host);
    const controls=el('div',undefined,card,'finance-page-filters');
    const search=el('input',undefined,controls,'finance-page-search');search.type='search';search.placeholder='Search transactions';search.setAttribute('aria-label','Search transactions');search.value=transactionSearch;
    search.oninput=()=>{transactionSearch=search.value.trim().toLowerCase();renderRows()};
    const accountValues={'':'All accounts'};for(const a of sortedAccounts())accountValues[a.key]=[a.bank,a.name,a.sourceLabel].filter(Boolean).join(' · ');
    select(controls,'Account',accountValues,transactionAccount,value=>{transactionAccount=value;renderRows()});
    select(controls,'Category',{'':'All categories',...CATEGORIES},transactionCategory,value=>{transactionCategory=value;renderRows()});
    select(controls,'Status',{'':'Posted and pending',posted:'Posted',pending:'Pending'},transactionStatus,value=>{transactionStatus=value;renderRows()});
    const list=el('div',undefined,card,'finance-page-transactions');
    function renderRows(){
      list.replaceChildren();const cutoff=Math.floor(Date.now()/1000)-period*86400;
      const filtered=flattenTransactions().filter(row=>{
        const hay=(row.merchant+' '+row.description+' '+row.account.bank+' '+row.account.name).toLowerCase();
        return row.posted>=cutoff&&(!transactionSearch||hay.includes(transactionSearch))
          &&(!transactionAccount||row.accountKey===transactionAccount)
          &&(!transactionCategory||row.category===transactionCategory)
          &&(!transactionStatus||(transactionStatus==='pending')===!!row.pending);
      });
      if(!filtered.length){el('p',activityCoverage().enabled?
        'No matching posted transactions yet. Check the selected account, date range, and next provider sync.':
        'Transactions have not been enabled. Choose which accounts to monitor above.',list);return}
      for(const row of filtered.slice(0,250)){
        const article=el('article',undefined,list,'finance-page-transaction');
        const top=el('div',undefined,article,'finance-page-transaction-top'),copy=el('div',undefined,top);
        el('strong',row.merchant||'Transaction',copy);
        el('small',[row.account.bank,row.account.name,row.account.sourceLabel,date(row.posted),row.pending?'Pending':'Posted'].filter(Boolean).join(' · '),copy);
        el('b',amount(row.amount,row.account.currency),top);
        el('p',row.description,article,'finance-page-description');
        if(row.stalePending)el('p','Pending status has not been observed recently. Confirm it with the institution.',article,'finance-page-warning');
        const badges=el('div',undefined,article,'finance-page-badges');
        for(const signal of row.signals||[])el('span',signalLabel(signal),badges);
        const category=select(article,'Category',CATEGORIES,row.category,value=>change(async()=>{
          const snapshot=await request('/transaction-review',{method:'PUT',body:JSON.stringify({
            account:row.account.rawKey,transaction:row.id,category:value
          })},row.source);
          return {financeSource:row.source,snapshot};
        }));
        category.setAttribute('aria-label','Category for '+(row.merchant||row.description));
        el('small',row.categorySource==='user'?'Confirmed by you':'Automatic · '+(row.confidence||'low')+' confidence',article,'finance-page-source');
        if(row.changedAt)el('small','Provider changed this transaction on '+stamp(row.changedAt)+'. A previous correction was cleared for review.',article,'finance-page-warning');
      }
      if(filtered.length>250)el('p','Showing the latest 250 matching transactions.',list);
    }
    renderRows();
  }
  function accounts(host){
    const card=el('section',undefined,host,'finance-page-card');
    const head=el('div',undefined,card,'finance-page-section-head');
    const title=el('div',undefined,head,'finance-page-accounts-title');
    el('h3','Accounts',title);
    el('span',String((currentCombined?.accounts||[]).length),title,'finance-page-account-count');
    action(head,'Manage connections',()=>window.btOpenBankSync?.(),'finance-page-button');
    const controls=el('div',undefined,card,'finance-page-account-filters');
    const search=el('input',undefined,controls,'finance-page-search');search.type='search';
    search.placeholder='Find a bank or account (e.g. X Money)';
    search.setAttribute('aria-label','Search accounts');search.value=accountSearch;
    const filters=el('details',undefined,controls,'finance-page-filter-details');
    el('summary','Filter by account type',filters);
    select(filters,'Type',{'':'All account types',...TYPES},accountType,value=>{accountType=value;render()});
    const list=el('div',undefined,card,'finance-page-account-groups');
    search.oninput=()=>{accountSearch=search.value.trim().toLowerCase();render()};
    function render(){
      list.replaceChildren();let shown=0;const institutions={};
      for(const account of sortedAccounts()){
        const p=profile(account),name=[account.bank,account.name,account.accountType,account.accountSubtype,account.sourceLabel].filter(Boolean).join(' · ').toLowerCase();
        if((accountSearch&&!name.includes(accountSearch))||(accountType&&p.kind!==accountType))continue;
        (institutions[account.bank||'Other institution'] ||= []).push(account);
      }
      for(const [institution,accounts] of Object.entries(institutions)){
        const group=el('section',undefined,list,'finance-page-institution');el('h4',institution,group);
        for(const account of accounts){shown++;accountEditor(group,account)}
      }
      if(!shown){
        el('h4',accountSearch?'No matching accounts':'No connected accounts found',list);
        el('p',accountSearch?'Check the institution name or try Discover accounts.':'Authorize a bank securely and discover its accounts.',list,'finance-page-hint');
        const quick=el('div',undefined,list,'finance-page-quick-actions');
        action(quick,'Add bank',()=>window.btOpenBankConnectFlow?.(),'finance-page-button finance-page-primary');
        action(quick,'Discover accounts',discoverSelected,'finance-page-button');
      }
    }
    function accountEditor(parent,account){
      const p=profile(account),article=el('article',undefined,parent,'finance-page-account-editor');
      const top=el('div',undefined,article,'finance-page-account');
      const info=el('div',undefined,top,'finance-page-account-info');el('strong',account.name||'Financial account',info);
      const monitored=Object.hasOwn(monitoringDraft,account.key)?monitoringDraft[account.key]
        :(currentCombined?.monitoredAccounts||[]).includes(account.key);
      el('small',account.sourceLabel+' · '+(TYPES[p.kind]||'Type unknown')+' · '+(monitored?'Activity on':'Balance only'),info,'finance-page-account-source');
      if(account.possibleDuplicate)el('small','Possible duplicate connection · excluded from consolidated totals',info,'finance-page-warning');
      if(!(Number.isFinite(account.balanceDate)&&account.balanceDate>0))el('small','Balance time not provided',info,'finance-page-hint');
      const balances=el('div',undefined,top,'finance-page-account-balances');
      el('b',amount(account.balance,account.currency),balances);
      if(account.availableBalance!==null&&account.availableBalance!==undefined)el('small','Available '+amount(account.availableBalance,account.currency),balances);
      const settings=el('details',undefined,article,'finance-page-account-settings');
      el('summary','Account settings',settings);
      const fields=el('div',undefined,settings,'finance-page-account-fields');
      const monitoringLabel=el('label',undefined,fields,'finance-page-monitor');
      const monitoring=el('input',undefined,monitoringLabel);monitoring.type='checkbox';
      monitoring.checked=monitored;monitoring.setAttribute('aria-label','Monitor transactions for '+account.name+' via '+account.sourceLabel);
      el('span','Monitor transactions (read-only)',monitoringLabel);
      monitoring.onchange=()=>{monitoringDraft[account.key]=monitoring.checked;dirtyAccounts.add(account.key)};
      el('small','Activity monitoring is optional. It does not move funds or confirm bonus requirements.',fields,'finance-page-hint');
      el('small','Account type: '+(TYPES[p.kind]||'Unclassified'),fields,'finance-page-hint');
      const typeFields=el('div',undefined,fields,'finance-page-correction');
      function editor(){select(typeFields,'Correct account type',TYPES,p.kind,value=>{p.kind=value;dirtyAccounts.add(account.key)},'finance-page-select')}
      if(p.kind==='unclassified')editor();
      else action(fields,'Correct type',()=>{typeFields.replaceChildren();editor()},'finance-page-edit-type');
      select(fields,'Net worth treatment',{exclude:'Exclude',asset:'Asset',liability:'Liability'},p.balanceMode||'exclude',value=>{p.balanceMode=value;dirtyAccounts.add(account.key)},'finance-page-select');
      const reorder=el('div',undefined,settings,'finance-page-reorder');
      action(reorder,'Move up',()=>move(account,-1));action(reorder,'Move down',()=>move(account,1));
    }
    function move(account,direction){
      const rows=sortedAccounts(),index=rows.findIndex(a=>a.key===account.key),target=index+direction;
      if(target<0||target>=rows.length)return;
      rows.forEach((a,i)=>{const p=profile(a);p.order=i});
      const other=rows[target],current=profile(account).order;profile(account).order=profile(other).order;
      profile(other).order=current;dirtyAccounts.add(account.key);dirtyAccounts.add(other.key);render();
    }
    render();
    action(card,'Save account settings',()=>change(async()=>{
      const sources=[...new Set([...dirtyAccounts].map(k=>k.split(':')[0]))];
      for(const source of sources){
        const original=sourceSnapshot(source);
        if(!original?.connected)throw Error('Reopen connected accounts before saving.');
        const profiles={};
        const accounts=currentCombined.accounts.filter(a=>a.source===source);
        for(const account of accounts){
          const p=profile(account);
          profiles[account.rawKey]={kind:p.kind||'unclassified',
            balanceMode:p.balanceMode||'exclude',order:p.order??499};
        }
        const latest=await request('/account-profiles',{method:'PUT',body:JSON.stringify({profiles})},source);
        applySource(source,latest);
        const monitorChanges=accounts.some(a=>Object.hasOwn(monitoringDraft,a.key));
        if(monitorChanges){
          const existing=new Set(sourceSnapshot(source)?.monitoredAccounts||[]);
          for(const account of accounts){
            if(!Object.hasOwn(monitoringDraft,account.key))continue;
            if(monitoringDraft[account.key])existing.add(account.rawKey);
            else existing.delete(account.rawKey);
          }
          const updated=await request('/monitoring',{method:'PUT',body:JSON.stringify({accounts:[...existing]})},source);
          applySource(source,updated);
        }
      }
      return data;
    },true),'finance-page-button finance-page-save');
  }
  function paint(){
    const host=currentRoot;if(!host||!host.isConnected)return;
    if(view!=='bonuses')window.BTBonusEvidence?.dispose();
    host.replaceChildren();
    currentCombined=unified();
    const notice=el('p',saveNotice,host,'finance-page-notice');notice.setAttribute('role',saveNotice?'alert':'status');
    if(!data){statusMessage(host,'Loading accounts','Checking secure connections…');return}
    if(!currentCombined?.connected){
      statusMessage(host,'Connect a bank','All of your supported accounts will appear in one dashboard.');
      action(host,'Add bank',()=>window.btOpenBankConnectFlow?.(),'finance-page-button finance-page-primary');return;
    }
    const summaryState=window.BTFinanceUnified.safeForSummary(currentCombined);
    const calculated=window.BTFinanceOverview?.summarize(summaryState,{days:period});
    const trustedTotals=!summaryState.incompleteProviders&&!summaryState.excludedForReview;
    const summary={...calculated,
      complete:!!calculated?.complete&&trustedTotals,
      cashAvailable:!!calculated?.cashAvailable&&trustedTotals,
      netWorthAvailable:!!calculated?.netWorthAvailable&&trustedTotals};
    hero(host,summary);
    if(connectionNotice){const banner=el('p',connectionNotice,host,'finance-page-connection-success');banner.setAttribute('role','status');}
    if(monitoringNotice){const banner=el('p',monitoringNotice,host,'finance-page-activity-result');banner.setAttribute('role','status');}
    if(activityNotice){const banner=el('p',activityNotice,host,'finance-page-activity-result');banner.setAttribute('role','status');}
    if(view==='overview')activityPrompt(host);
    if(summaryState.incompleteProviders)el('p','Financial activity is partial: one linked provider has not completed a recent sync.',host,'finance-page-caution');
    if(view==='bonuses'){
      const sourceSelector=el('section',undefined,host,'finance-page-connection');
      const sourceSelect=select(sourceSelector,'Review connection',{
        simplefin:'SimpleFIN',plaid:'Plaid'},provider,switchSource);
      sourceSelect.setAttribute('aria-label','Bank activity connection source');
      const review=el('section',undefined,host,'finance-page-bonus-host');
      if(!window.BTBonusEvidence?.mount(review,provider))statusMessage(review,'Bonus activity not ready','Reload Finances to review linked bonus activity.');
    }else if(view==='transactions')transactions(host);
    else if(view==='accounts')accounts(host);
    else overview(host,summary);
  }
  let sessionIdentity=null,mountCall=0;
  async function mount(){
    const host=document.getElementById('bt-finances-page');if(!host||host===currentRoot)return;
    const call=++mountCall,auth=window.BTBonusAuth;
    if(!auth?.connected()){
      window.BTBonusEvidence?.dispose();
      sessionIdentity=null;currentRoot=host;data=null;otherData=null;sequence++;
      host.replaceChildren();statusMessage(host,'Sign in to view finances','Sign in securely to view linked financial accounts.');
      action(host,'Sign in / manage accounts',()=>window.btOpenBankSync?.(),'finance-page-button finance-page-primary');return;
    }
    let identity=null;
    try{const token=await auth.token();identity=sessionOwner(token)||token}
    catch(_error){/* Never render another owner's cached financial data on auth errors. */}
    if(call!==mountCall||!host.isConnected||!auth.connected()||window.BTBonusAuth!==auth)return;
    if(!identity){
      window.BTBonusEvidence?.dispose();sessionIdentity=null;data=null;otherData=null;currentRoot=host;
      host.replaceChildren();statusMessage(host,'Session needs attention','Sign in again before viewing financial records.');return;
    }
    if(identity===sessionIdentity&&data){
      // Main app redraws must not destroy in-progress review, filters or account
      // snapshots for the same owner. Preserve any in-flight second-provider read.
      currentRoot=host;paint();return;
    }
    window.BTBonusEvidence?.dispose();
    sessionIdentity=identity;currentRoot=host;data=null;otherData=null;monitoringNotice='';activityNotice='';connectionNotice='';
    accountDraftProfiles={};dirtyAccounts.clear();
    Object.keys(monitoringDraft).forEach(k=>delete monitoringDraft[k]);
    const rev=++sequence;paint();
    try{
      const result=await request();
      if(rev!==sequence||host!==currentRoot||!host.isConnected)return;
      data=result;paint();loadOtherSource(rev);
    }catch(error){
      if(rev!==sequence||host!==currentRoot||!host.isConnected)return;
      // A broken SimpleFIN connection must not hide already-authorized Plaid
      // accounts. Fall back to the other source while explaining partial data.
      data={configured:false,connected:false,accounts:[],error:String(error.message||'Connection unavailable')};
      paint();loadOtherSource(rev);
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
      'Enable transaction monitoring to import posted activity.':
      'Plaid authorization saved. Account discovery needs attention; manage this bank in Finances.';
    activityNotice='';refresh();
  });
  window.btRefreshFinancesPage=refresh;
  window.btRegisterPostRender?.('finance-page',mount);
  window.addEventListener('storage',event=>{if(event.key==='bonus-ai-auth')refresh()});
})();
