/* Authenticated financial workspace. Private financial records are never written to browser storage. */
(function(){
  'use strict';
  const ENDPOINT='https://api-production-00f74.up.railway.app/api/bonus-tracker/simplefin';
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
  let currentRoot=null,sequence=0,hidden=false,data=null,busy=false,view='overview',period=30;
  let transactionSearch='',transactionAccount='',transactionCategory='',transactionStatus='';
  let accountSearch='',accountType='',saveNotice='';
  const el=(tag,text,parent,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;if(parent)parent.append(n);return n};
  const stamp=t=>Number.isFinite(t)&&t>0?new Date(t*1000).toLocaleString():'Unavailable';
  const date=t=>Number.isFinite(t)&&t>0?new Date(t*1000).toLocaleDateString():'Unavailable';
  function money(value,code='USD'){
    if(value===null||value===undefined||value===''||!Number.isFinite(Number(value)))return 'Unavailable';
    if(!code)return String(value)+' (currency unknown)';
    try{return new Intl.NumberFormat(undefined,{style:'currency',currency:code}).format(Number(value))}
    catch{return String(value)+' '+code}
  }
  function amount(value,code){return hidden&&value!==null?'••••••':money(value,code)}
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
    data.accountProfiles ||= {};
    return data.accountProfiles[account.key] ||= {kind:'unclassified',balanceMode:'exclude',order:499};
  }
  function sortedAccounts(){
    return [...(data.accounts||[])].sort((a,b)=>(profile(a).order??499)-(profile(b).order??499)
      ||String(a.bank||'').localeCompare(String(b.bank||''))||String(a.name||'').localeCompare(String(b.name||'')));
  }
  async function request(path='',options={}){
    const auth=window.BTBonusAuth;if(!auth?.connected())throw Error('Sign in to view finances.');
    const rev=sequence,token=await auth.token(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),65000);
    try{
      const response=await fetch(ENDPOINT+path,{...options,credentials:'omit',cache:'no-store',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},signal:controller.signal});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(typeof result.detail==='string'?result.detail:'Financial request could not be completed.');
      if(rev!==sequence||!auth.connected())throw Error('Sign-in changed. Reload Finances.');
      return result;
    }catch(error){if(error.name==='AbortError')throw Error('The request timed out. Refresh before retrying.');throw error}
    finally{clearTimeout(timer)}
  }
  async function change(work){
    if(busy)return;
    busy=true;saveNotice='';paint();
    try{
      data=await work();
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
    const accounts=new Map((data.accounts||[]).map(a=>[a.key,a])),rows=[];
    for(const [accountKey,records] of Object.entries(data.transactions||{})){
      const account=accounts.get(accountKey);if(!account)continue;
      for(const row of Object.values(records||{}))rows.push({...row,accountKey,account});
    }
    return rows.sort((a,b)=>b.posted-a.posted);
  }
  function hero(host,summary){
    const box=el('section',undefined,host,'finance-page-hero');
    const head=el('div',undefined,box,'finance-page-hero-head'),copy=el('div',undefined,head);
    el('span','MY FINANCES',copy,'finance-page-kicker');el('h2','Financial overview',copy);
    action(head,hidden?'Show amounts':'Hide amounts',()=>{hidden=!hidden;paint()});
    el('p',(data.accounts||[]).length+' connected account'+((data.accounts||[]).length===1?'':'s')+
      ' · '+(data.monitoredAccounts||[]).length+' monitored',box);
    const meta=el('div',undefined,box,'finance-page-meta');
    el('span','Connection Status: '+(data.status==='attention'?'Needs attention':'Active'),meta);
    el('span','Last Synced: '+stamp(data.lastSuccess),meta);
    el('span','Next Sync: '+stamp(data.nextSyncAt),meta);
    if(data.error)el('p',data.error,box,'finance-page-warning');
    for(const warning of data.warnings||[])el('p',warning,box,'finance-page-warning');
    if(data.missingAccounts?.length)el('p','A monitored account was absent from the latest provider response. Saved history remains available.',box,'finance-page-warning');
    const nav=el('nav',undefined,host,'finance-page-nav');nav.setAttribute('aria-label','Finance sections');
    for(const [id,label] of [['overview','Overview'],['transactions','Transactions'],['accounts','Accounts']]){
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
  function overview(host,summary){
    const position=el('section',undefined,host,'finance-page-card');
    const heading=el('div',undefined,position,'finance-page-section-head');el('h3','Financial position',heading);
    const grid=el('div',undefined,position,'finance-page-grid');
    metric(grid,'Cash',summary.cashAvailable?amount(summary.cash,'USD'):'Unavailable',summary.cashAvailable?summary.cashAccountCount+' deposit accounts':'Classify fresh checking and savings accounts');
    metric(grid,'Assets',summary.netWorthAvailable?amount(summary.assets,'USD'):'Unavailable',summary.netWorthAvailable?'Included accounts':'Complete account classification required');
    metric(grid,'Liabilities',summary.netWorthAvailable?amount(summary.liabilities,'USD'):'Unavailable',summary.netWorthAvailable?'Included accounts':'Complete account classification required');
    metric(grid,'Net Worth',summary.netWorthAvailable?amount(summary.netWorth,'USD'):'Unavailable',summary.netWorthAvailable?'Assets less liabilities':'Excluded or stale balances remain');
    if(!summary.netWorthAvailable)el('p','Net Worth appears only when every connected account has a confirmed type, balance treatment, USD balance, and recent update.',position);
    const trend=el('section',undefined,host,'finance-page-card');el('h3','Net Worth trend',trend);trendChart(trend,summary.netWorthHistory||[]);

    const activity=el('section',undefined,host,'finance-page-card');
    const activityHead=el('div',undefined,activity,'finance-page-section-head');el('h3','Cash Flow',activityHead);periodControl(activityHead);
    const activityGrid=el('div',undefined,activity,'finance-page-grid');
    metric(activityGrid,'Income',summary.hasActivity?amount(summary.income,'USD'):'Unavailable');
    metric(activityGrid,'Expenses',summary.hasActivity?amount(summary.expenses,'USD'):'Unavailable');
    metric(activityGrid,'Cash Flow',summary.hasActivity?amount(summary.cashFlow,'USD'):'Unavailable');
    metric(activityGrid,'Savings Rate',summary.savingsRate===null?'Unavailable':summary.savingsRate.toFixed(1)+'%');
    if(!summary.complete)el('p','Cash Flow is partial. '+summary.unreviewed+' transaction'+(summary.unreviewed===1?' needs':'s need')+' review; transfers, refunds, bonuses, pending items, and unavailable activity are excluded.',activity,'finance-page-caution');
    if(summary.pending)el('p',summary.pending+' pending transaction'+(summary.pending===1?' is':'s are')+' shown in Transactions and excluded from totals.',activity);
    if(summary.otherCurrencies?.length)el('p','Other currencies excluded from USD totals: '+summary.otherCurrencies.join(', '),activity);

    const monthly=el('section',undefined,host,'finance-page-card');el('h3','Monthly summary',monthly);
    if(!summary.monthly?.length)el('p','No categorized monthly activity is available yet.',monthly);
    else for(const item of summary.monthly){
      const line=el('article',undefined,monthly,'finance-page-month');
      el('strong',new Date(item.month+'-02T00:00:00').toLocaleDateString(undefined,{month:'short',year:'numeric'}),line);
      const values=el('div',undefined,line);el('span','Income '+amount(item.income,'USD'),values);el('span','Expenses '+amount(item.expenses,'USD'),values);el('b','Cash Flow '+amount(item.cashFlow,'USD'),values);
    }

    const spending=el('section',undefined,host,'finance-page-card');el('h3','Spending by category',spending);
    const categories=Object.entries(summary.spending||{}).sort((a,b)=>Number(b[1])-Number(a[1]));
    if(!categories.length)el('p','No categorized expenses are available for this period. Review transactions to build an accurate spending view.',spending);
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

    const attention=el('section',undefined,host,'finance-page-card');el('h3','Financial review',attention);
    const signals=flattenTransactions().filter(r=>!r.pending&&Array.isArray(r.signals)&&r.signals.some(x=>['possible_direct_deposit','possible_bonus','possible_reversal','possible_fee','possible_recurring'].includes(x)));
    if(!signals.length)el('p','No review signals are available in the retained transaction window.',attention);
    else for(const row of signals.slice(0,8)){
      const line=el('article',undefined,attention,'finance-page-review-row'),copy=el('div',undefined,line);
      el('strong',row.merchant||row.description,copy);el('small',row.account.bank+' · '+date(row.posted)+' · '+row.signals.map(signalLabel).join(' · '),copy);
      el('b',amount(row.amount,row.account.currency),line);
    }
    el('p','Review signals are observations. They never complete a bank bonus requirement or mark a bonus paid.',attention,'finance-page-caution');
  }
  function signalLabel(value){
    return ({possible_direct_deposit:'Possible direct deposit',possible_bonus:'Possible bonus',possible_reversal:'Possible reversal',
      possible_fee:'Possible fee',possible_recurring:'Possible recurring payment',matched_internal_transfer:'Matched transfer',
      possible_transfer:'Possible transfer',possible_refund:'Possible refund'})[value]||value.replaceAll('_',' ');
  }
  function transactions(host){
    const card=el('section',undefined,host,'finance-page-card');
    const head=el('div',undefined,card,'finance-page-section-head');el('h3','Transactions',head);periodControl(head);
    el('p','Original descriptions remain visible. Automatic categories are suggestions; confirmed corrections are encrypted with your financial data.',card);
    const controls=el('div',undefined,card,'finance-page-filters');
    const search=el('input',undefined,controls,'finance-page-search');search.type='search';search.placeholder='Search transactions';search.setAttribute('aria-label','Search transactions');search.value=transactionSearch;
    search.oninput=()=>{transactionSearch=search.value.trim().toLowerCase();renderRows()};
    const accountValues={'':'All accounts'};for(const a of sortedAccounts())accountValues[a.key]=[a.bank,a.name].filter(Boolean).join(' · ');
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
      if(!filtered.length){el('p','No transactions match these filters.',list);return}
      for(const row of filtered.slice(0,250)){
        const article=el('article',undefined,list,'finance-page-transaction');
        const top=el('div',undefined,article,'finance-page-transaction-top'),copy=el('div',undefined,top);
        el('strong',row.merchant||'Transaction',copy);
        el('small',[row.account.bank,row.account.name,date(row.posted),row.pending?'Pending':'Posted'].filter(Boolean).join(' · '),copy);
        el('b',amount(row.amount,row.account.currency),top);
        el('p',row.description,article,'finance-page-description');
        if(row.stalePending)el('p','Pending status has not been observed recently. Confirm it with the institution.',article,'finance-page-warning');
        const badges=el('div',undefined,article,'finance-page-badges');
        for(const signal of row.signals||[])el('span',signalLabel(signal),badges);
        const category=select(article,'Category',CATEGORIES,row.category,value=>change(()=>request('/transaction-review',{method:'PUT',body:JSON.stringify({account:row.accountKey,transaction:row.id,category:value})})));
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
    const head=el('div',undefined,card,'finance-page-section-head');el('h3','Accounts',head);
    action(head,'Manage connections',()=>window.btOpenBankSync?.(),'finance-page-button finance-page-primary');
    el('p','Set each account type and balance treatment. Net Worth stays unavailable until every connected account is classified and included.',card);
    const controls=el('div',undefined,card,'finance-page-filters');
    const search=el('input',undefined,controls,'finance-page-search');search.type='search';search.placeholder='Search accounts';search.setAttribute('aria-label','Search accounts');search.value=accountSearch;
    const list=el('div',undefined,card,'finance-page-account-groups');
    select(controls,'Type',{'':'All account types',...TYPES},accountType,value=>{accountType=value;render()});
    search.oninput=()=>{accountSearch=search.value.trim().toLowerCase();render()};
    function render(){
      list.replaceChildren();let shown=0;const institutions={};
      for(const account of sortedAccounts()){
        const p=profile(account),name=[account.bank,account.name].filter(Boolean).join(' · ').toLowerCase();
        if((accountSearch&&!name.includes(accountSearch))||(accountType&&p.kind!==accountType))continue;
        (institutions[account.bank||'Other institution'] ||= []).push(account);
      }
      for(const [institution,accounts] of Object.entries(institutions)){
        const group=el('section',undefined,list,'finance-page-institution');el('h4',institution,group);
        for(const account of accounts){shown++;accountEditor(group,account)}
      }
      if(!shown)el('p','No accounts match these filters.',list);
    }
    function accountEditor(parent,account){
      const p=profile(account),article=el('article',undefined,parent,'finance-page-account-editor');
      const top=el('div',undefined,article,'finance-page-account');
      const info=el('div',undefined,top,'finance-page-account-info');el('strong',account.name||'Financial account',info);
      el('small','Last Updated: '+stamp(account.balanceDate),info);
      el('small',(data.monitoredAccounts||[]).includes(account.key)?'Transaction monitoring on':'Transaction monitoring off',info);
      const balances=el('div',undefined,top,'finance-page-account-balances');
      el('b',amount(account.balance,account.currency),balances);
      el('small','Available Balance: '+amount(account.availableBalance,account.currency),balances);
      const fields=el('div',undefined,article,'finance-page-account-fields');
      select(fields,'Account type',TYPES,p.kind,value=>{p.kind=value},'finance-page-select');
      select(fields,'Net worth treatment',{exclude:'Exclude',asset:'Asset',liability:'Liability'},p.balanceMode||'exclude',value=>{p.balanceMode=value},'finance-page-select');
      const reorder=el('div',undefined,article,'finance-page-reorder');
      action(reorder,'Move up',()=>move(account,-1));action(reorder,'Move down',()=>move(account,1));
    }
    function move(account,direction){
      const rows=sortedAccounts(),index=rows.findIndex(a=>a.key===account.key),target=index+direction;
      if(target<0||target>=rows.length)return;
      rows.forEach((a,i)=>{const p=profile(a);p.order=i});
      const other=rows[target],current=profile(account).order;profile(account).order=profile(other).order;profile(other).order=current;render();
    }
    render();
    action(card,'Save account organization',()=>change(()=>{
      const profiles={};sortedAccounts().forEach((account,index)=>{const p=profile(account);profiles[account.key]={kind:p.kind||'unclassified',balanceMode:p.balanceMode||'exclude',order:index}});
      return request('/account-profiles',{method:'PUT',body:JSON.stringify({profiles})});
    }),'finance-page-button finance-page-primary');
  }
  function paint(){
    const host=currentRoot;if(!host||!host.isConnected)return;host.replaceChildren();
    const notice=el('p',saveNotice,host,'finance-page-notice');notice.setAttribute('role',saveNotice?'alert':'status');
    if(!data){statusMessage(host,'Loading financial accounts','Retrieving your private, read-only account summary.');return}
    if(!data.configured){statusMessage(host,'Financial connections unavailable','Secure account syncing is not configured on the server.');return}
    if(!data.connected){
      statusMessage(host,'Connect your first institution','Add a supported institution through SimpleFIN. BonusTracker cannot initiate payments, trades, or transfers.');
      action(host,'Manage financial connections',()=>window.btOpenBankSync?.(),'finance-page-button finance-page-primary');return;
    }
    const summary=window.BTFinanceOverview?.summarize(data,{days:period});
    hero(host,summary);
    if(view==='transactions')transactions(host);else if(view==='accounts')accounts(host);else overview(host,summary);
  }
  async function mount(){
    const host=document.getElementById('bt-finances-page');if(!host||host===currentRoot)return;
    currentRoot=host;data=null;const rev=++sequence;paint();
    if(!window.BTBonusAuth?.connected()){
      host.replaceChildren();statusMessage(host,'Sign in to view finances','Use your existing BonusTracker sign-in to load private financial records.');
      action(host,'Sign in / manage accounts',()=>window.btOpenBankSync?.(),'finance-page-button finance-page-primary');return;
    }
    try{const result=await request();if(rev!==sequence||host!==currentRoot||!host.isConnected)return;data=result;paint()}
    catch(error){if(rev!==sequence||host!==currentRoot||!host.isConnected)return;host.replaceChildren();statusMessage(host,'Accounts unavailable',error.message);action(host,'Try again',refresh)}
  }
  function refresh(){currentRoot=null;data=null;sequence++;mount()}
  window.btRefreshFinancesPage=refresh;
  window.btRegisterPostRender?.('finance-page',mount);
  window.addEventListener('storage',event=>{if(event.key==='bonus-ai-auth')refresh()});
})();
