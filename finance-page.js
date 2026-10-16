/* First-class, read-only finance page. Financial data is never written to browser storage. */
(function(){
  'use strict';
  const ENDPOINT='https://api-production-00f74.up.railway.app/api/bonus-tracker/simplefin';
  let currentRoot=null,sequence=0,hidden=false;
  const el=(tag,text,parent,cls)=>{
    const node=document.createElement(tag);
    if(text!==undefined)node.textContent=text;
    if(cls)node.className=cls;
    if(parent)parent.append(node);
    return node;
  };
  const stamp=t=>Number.isFinite(t)&&t>0?new Date(t*1000).toLocaleString():'Not available';
  const currency=(value,code)=>{
    if(value===null||value===undefined||value===''||!Number.isFinite(Number(value)))return 'Unavailable';
    if(!code)return String(value)+' (currency unknown)';
    try{return new Intl.NumberFormat(undefined,{style:'currency',currency:code}).format(Number(value))}
    catch{return String(value)+' '+code}
  };
  function action(parent,text,onClick,cls='finance-page-button'){
    const b=el('button',text,parent,cls);b.type='button';b.onclick=onClick;return b;
  }
  function statusMessage(host,title,message){
    const card=el('section',undefined,host,'finance-page-card');
    el('h3',title,card);el('p',message,card);
    return card;
  }
  function paint(host,data){
    if(host!==currentRoot||!host.isConnected)return;
    host.replaceChildren();
    const hero=el('section',undefined,host,'finance-page-hero');
    const head=el('div',undefined,hero,'finance-page-hero-head');
    const copy=el('div',undefined,head);
    el('span','MY FINANCES',copy,'finance-page-kicker');
    el('h2','Financial overview',copy);
    action(head,hidden?'Show amounts':'Hide amounts',()=>{hidden=!hidden;paint(host,data)});
    if(!data?.configured){
      statusMessage(host,'Financial connections unavailable','Secure bank syncing is not configured on the server.');
      return;
    }
    if(!data.connected){
      statusMessage(host,'Connect your first institution','Add an eligible financial institution using SimpleFIN. This application never initiates payments or transfers.');
      action(host,'Manage financial connections',()=>window.btOpenBankSync?.(),'finance-page-button finance-page-primary');
      return;
    }
    const total=(data.accounts||[]).length,selected=(data.monitoredAccounts||[]).length;
    el('p',total+' connected account'+(total===1?'':'s')+' · '+selected+' independently monitored',hero);
    const meta=el('div',undefined,hero,'finance-page-meta');
    el('span','Connection: '+(data.status==='attention'?'Needs attention':'Active'),meta);
    el('span','Last synced: '+stamp(data.lastSuccess),meta);
    if(data.error)el('p',data.error,hero);
    for(const warning of data.warnings||[])el('p',warning,hero);
    const summary=window.BTFinanceOverview?.summarize(data);
    const activity=el('section',undefined,host,'finance-page-card');
    el('h3','Observed activity · last 30 days',activity);
    if(summary?.hasActivity){
      const grid=el('div',undefined,activity,'finance-page-grid');
      for(const [label,value] of [
        ['Credits',hidden?'••••••':currency(summary.credits,'USD')],
        ['Debits',hidden?'••••••':currency(summary.debits,'USD')],
        ['Net observed',hidden?'••••••':currency(summary.net,'USD')],
        ['Transactions',String(summary.observations)]
      ]){
        const tile=el('div',undefined,grid,'finance-page-tile');el('span',label,tile);el('strong',value,tile);
      }
      if(summary.candidates)el('p',summary.candidates+' possible bonus credits need review.',activity);
    }else el('p',summary?.hasSync?'No posted USD transaction observations in this period. Missing activity does not establish zero spending.':'No successful transaction retrieval yet. Select accounts to monitor to begin building history.',activity);
    if(summary?.otherCurrencies?.length)el('p','Other currencies excluded from USD totals: '+summary.otherCurrencies.join(', '),activity);
    if(summary?.unusable)el('p',summary.unusable+' amounts could not be safely included in the totals.',activity);
    if(summary?.usdAccounts&&summary.sourceAccounts<summary.usdAccounts)el('p','Some selected accounts have incomplete transaction coverage.',activity);
    if(data.missingAccounts?.length)el('p','A selected account is missing from the latest provider response. This does not mean it is closed.',activity);
    el('p','These are partial gross posted credits/debits, not verified income, spending, cash flow, or net worth. Transfers can appear on both sides. Investment and liability balances are not combined.',activity);
    const accounts=el('section',undefined,host,'finance-page-card');
    const h=el('div',undefined,accounts,'finance-page-section-head');
    el('h3','Accounts',h);
    action(h,'Manage accounts',()=>window.btOpenBankSync?.(),'finance-page-button finance-page-primary');
    if(!total){el('p','No accounts returned by the provider. Check connection status and refresh account discovery.',accounts);return;}
    const search=el('input',undefined,accounts,'finance-page-search');
    search.type='search';search.placeholder='Search connected institutions';search.setAttribute('aria-label','Search financial accounts');
    const list=el('div',undefined,accounts,'finance-page-list'),cards=[];
    const sorted=[...data.accounts].sort((a,b)=>String(a.bank||a.name||'').localeCompare(String(b.bank||b.name||'')));
    for(const a of sorted){
      const line=el('article',undefined,list,'finance-page-account');
      const info=el('div',undefined,line,'finance-page-account-info');
      const name=[a.bank,a.name].filter(Boolean).join(' · ')||'Financial account';
      el('strong',name,info);
      el('small','Updated: '+stamp(a.balanceDate),info);
      const flags=(data.monitoredAccounts||[]).includes(a.key)?'Monitoring on':'Not monitored';
      el('small',flags+(data.mappings?.[a.key]?' · Linked to bonus':''),info);
      el('span',hidden?'••••••':currency(a.balance,a.currency),line,'finance-page-balance');
      cards.push({line,name:name.toLowerCase()});
    }
    search.oninput=()=>{const q=search.value.toLowerCase().trim();for(const x of cards)x.line.hidden=!!q&&!x.name.includes(q);};
  }
  async function mount(){
    const host=document.getElementById('bt-finances-page');
    if(!host||host===currentRoot)return;
    currentRoot=host;
    const rev=++sequence;
    host.replaceChildren();
    if(!window.BTBonusAuth?.connected()){
      statusMessage(host,'Sign in to view finances','Use your existing BonusTracker sign-in to view your connected accounts. Your private banking records are not stored on this page.');
      action(host,'Sign in / manage accounts',()=>window.btOpenBankSync?.(),'finance-page-button finance-page-primary');
      return;
    }
    statusMessage(host,'Loading financial accounts','Retrieving your private, read-only account summary.');
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),25000);
    try{
      const bearer=await window.BTBonusAuth.token();
      if(rev!==sequence||host!==currentRoot||!host.isConnected)return;
      const response=await fetch(ENDPOINT,{method:'GET',cache:'no-store',credentials:'omit',headers:{Authorization:'Bearer '+bearer},signal:ctrl.signal});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'Financial accounts could not be loaded.');
      if(rev!==sequence||host!==currentRoot||!host.isConnected||!window.BTBonusAuth.connected())return;
      paint(host,data);
    }catch(error){
      if(rev!==sequence||host!==currentRoot||!host.isConnected)return;
      host.replaceChildren();
      statusMessage(host,'Accounts unavailable',error.name==='AbortError'?'The connection timed out. Refresh the page to retry.':String(error.message||'Could not load account status.'));
      action(host,'Try again',()=>refresh());
    }finally{clearTimeout(timer);}
  }
  function refresh(){currentRoot=null;sequence++;mount();}
  window.btRefreshFinancesPage=refresh;
  window.btRegisterPostRender?.('finance-page',mount);
  window.addEventListener('storage',e=>{if(e.key==='bonus-ai-auth')refresh();});
})();
