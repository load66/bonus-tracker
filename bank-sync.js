/* SimpleFIN trial: owner-private evidence, no tracker writes or browser-stored bank tokens. */
(function(){
  'use strict';
  const API='https://api-production-00f74.up.railway.app/api/bonus-tracker/simplefin';
  let panel=null,data=null,busy=false,generation=0,returnFocus=null,hideBalances=false;
  const el=(tag,text,parent)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(parent)parent.append(n);return n;};
  const stamp=t=>typeof t==='number'&&t>0?new Date(t*1000).toLocaleString():'Not available';
  const money=(a,c)=>{if(a===null||a===undefined||a===''||!Number.isFinite(Number(a)))return 'Unavailable';try{return new Intl.NumberFormat(undefined,{style:'currency',currency:c||'USD'}).format(Number(a));}catch{return String(a)+' '+String(c||'');}};
  const active=()=>typeof entries!=='undefined'&&Array.isArray(entries)?entries.filter(e=>!e.closed&&e.id&&e.opened):[];
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
  async function run(work){if(busy)return;busy=true;panel?.querySelectorAll('button,select,textarea,input').forEach(n=>n.disabled=true);try{await work();}catch(e){message(e.message);}finally{busy=false;panel?.querySelectorAll('button,select,textarea,input').forEach(n=>n.disabled=false);}}
  function button(parent,label,fn,cls='btn-s'){const b=el('button',label,parent);b.type='button';b.className=cls;b.onclick=()=>run(fn);return b;}
  function close(){if(busy)return;generation++;panel?.remove();panel=null;data=null;hideBalances=false;returnFocus?.focus();}
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
    if(!data.connected){
      el('h3','Connect a financial institution',body);
      el('p','Check supported institutions before subscribing. Authorize only accounts you intend to share. SimpleFIN manages bank authorization and billing separately.',body);
      const links=el('div',undefined,body);links.className='bank-sync-links';
      for(const [label,url] of [['Check supported banks','https://beta-bridge.simplefin.org/search-institutions'],['Set up SimpleFIN','https://bridge.simplefin.org/simplefin/create']]){const a=el('a',label,links);a.href=url;a.target='_blank';a.rel='noopener noreferrer';}
      el('p','Create a SimpleFIN app connection for BonusTracker. Enter its one-time setup token here only. Never share bank passwords or tokens in chat. BonusTracker does not initiate payments.',body);
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
    button(status,'Refresh accounts',async()=>{data=await request('/discover',{method:'POST'});paint();});

    const overview=window.BTFinanceOverview?.summarize(data);
    const snapshot=el('section',undefined,body);snapshot.className='bank-finance-overview';snapshot.setAttribute('aria-label','Financial activity overview');
    const snapshotHeader=el('div',undefined,snapshot);snapshotHeader.className='bank-finance-overview-header';
    el('h3','Financial overview',snapshotHeader);
    button(snapshotHeader,hideBalances?'Show balances':'Hide balances',async()=>{hideBalances=!hideBalances;paint();});
    el('p','Last 30 days · posted USD transactions from monitored or bonus-linked accounts only.',snapshot);
    if(overview?.hasActivity){
      const tiles=el('div',undefined,snapshot);tiles.className='bank-finance-grid';
      for(const item of [
        ['Money in',overview.credits],['Money out',overview.debits],
        ['Net observed',overview.net],['Transactions',String(overview.observations)]
      ]){
        const tile=el('div',undefined,tiles);tile.className='bank-finance-metric';
        el('span',item[0],tile);
        el('strong',item[0]==='Transactions'?item[1]:(hideBalances?'••••••':money(item[1],'USD')),tile);
      }
      if(overview.candidates)el('p',String(overview.candidates)+' possible bonus or reversal entries need individual review.',snapshot);
    }else{
      el('p',overview?.hasSync?'No posted USD transactions observed during this period. This is not proof of zero activity.':'Transaction activity not yet synced. Enable monitoring on an account, then run an eligible transaction check.',snapshot);
    }
    if(overview?.otherCurrencyAccounts)el('p','Non-USD accounts are excluded from the USD totals.',snapshot);
    if(overview?.missingAccounts)el('p','One or more monitored accounts were absent from the latest provider response. Previously observed evidence is retained.',snapshot);
    if(overview?.hasSync&&Date.now()/1000-overview.lastSync>2*86400)el('p','Activity may be out of date. Review Last synced and the connection status.',snapshot);
    el('p','These are observed gross credits and debits, not verified income, spending, cash flow or net worth. Transfers may appear on both sides; no balances are combined.',snapshot);
    el('h3','Connected accounts',body);el('p',String((data.accounts||[]).length)+' connected · '+String((data.monitoredAccounts||[]).length)+' monitored · '+String(Object.keys(data.mappings||{}).length)+' linked to bonuses',body);
    el('p','Choose which accounts to monitor for read-only posted transactions, independently of bank bonuses. Link a checking or savings account to its matching bonus only when the account is eligible. Financial activity is not proof of a qualifying direct deposit.',body);
    const available=active(),selects=[],monitors=[],monitored=new Set(data.monitoredAccounts||[]);
    for(const a of data.accounts||[]){
      const card=el('section',undefined,body);card.className='bank-sync-card';
      el('h4',[a.bank,a.name].filter(Boolean).join(' · ')||'Bank account',card);
      el('p','Balance: '+(hideBalances?'••••••':money(a.balance,a.currency))+' · As of '+stamp(a.balanceDate),card);if(a.balanceDate&&data.lastSuccess&&a.balanceDate>data.lastSuccess)el('p','Balance timestamp is newer than the last recorded transaction sync; these are separate provider updates.',card);
      const monitorLabel=el('label',undefined,card);monitorLabel.className='bank-sync-monitor-label';
      const checkbox=el('input',undefined,monitorLabel);checkbox.type='checkbox';checkbox.checked=monitored.has(a.key);checkbox.dataset.account=a.key;
      el('span','Monitor transactions (read-only)',monitorLabel);monitors.push(checkbox);
      const label=el('label','Link to bonus (optional)',card),select=el('select',undefined,card);select.id='bank-sync-cycle-'+a.key;label.htmlFor=select.id;select.dataset.account=a.key;
      const empty=el('option','No bonus linked',select);empty.value='';
      const current=data.mappings?.[a.key];
      for(const e of available){const option=el('option',e.bank+' · '+(e.accountType||'personal')+' · opened '+e.opened,select);option.value=String(e.id);if(current?.entryId===String(e.id)&&current.opened===e.opened&&current.bank===e.bank)option.selected=true;}
      if(current&&!available.some(e=>String(e.id)===current.entryId&&e.opened===current.opened&&e.bank===current.bank))el('p','The saved cycle changed or is no longer open. Choose a current cycle or remove this match.',card);
      selects.push(select);
    }
    if(!data.accounts?.length)el('p','No accounts were returned. Refresh the account list after checking SimpleFIN.',body);
    if(data.accounts?.length)button(body,'Save monitoring preferences',async()=>{
      const accounts=monitors.filter(c=>c.checked).map(c=>c.dataset.account);
      data=await request('/monitoring',{method:'PUT',body:JSON.stringify({accounts})});paint();
      message('Monitoring preferences saved. Only the selected accounts will be retrieved for independent activity, subject to the daily provider limit.');
    },'btn-p');
    button(body,'Save account matches',async()=>{
      const mappings={};for(const s of selects){const entry=available.find(e=>String(e.id)===s.value);if(entry)mappings[s.dataset.account]={entryId:String(entry.id),bank:entry.bank,opened:entry.opened};}
      data=await request('/selection',{method:'PUT',body:JSON.stringify({mappings})});paint();message('Bonus links saved. Monitored accounts and linked bonus accounts are included in the next eligible check.');
    },'btn-p');
    el('h3','Recent transactions',body);
    el('p','Only available, posted transactions are shown (up to 90 days of retained observations). Transfers, dividends and refunds may appear as deposits. Bonus candidates require review; this section never changes tracker milestones.',body);
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
        el('strong',row.kind==='possible_bonus'?'Possible bonus · review':row.kind==='possible_reversal'?'Possible bonus reversal · review':Number(row.amount)>0?'Deposit':'Withdrawal',article);
        el('p',(hideBalances?'••••••':money(row.amount,a.currency))+' · posted '+stamp(row.posted),article);el('p',row.description,article);
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
  function open(){
    if(panel)return;returnFocus=document.activeElement;generation++;data=null;
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
