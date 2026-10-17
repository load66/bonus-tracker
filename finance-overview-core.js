/* Exact-cent financial summaries. Pure and deterministic; never mutates private state. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.BTFinanceOverview=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const DAY=86400,MAX_DAYS=731,STALE_BALANCE_DAYS=7;
  const SPENDING=new Set(['housing','loan','utilities','groceries','dining','transportation','shopping','health','entertainment','fees','taxes','travel','subscription','other','unreviewed']);
  function cents(value){
    const m=/^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value??'').trim());
    if(!m)return null;
    try{
      const amount=BigInt(m[2])*100n+BigInt((m[3]||'').padEnd(2,'0')||'0');
      if(amount>100000000000000n)return null;
      return m[1]==='-'?-amount:amount;
    }catch{return null}
  }
  function decimal(value){
    const neg=value<0n,abs=neg?-value:value;
    return (neg?'-':'')+String(abs/100n)+'.'+String(abs%100n).padStart(2,'0');
  }
  function freshBalance(account,now){
    const amount=cents(account?.balance),at=account?.balanceDate;
    return amount!==null&&Number.isFinite(at)&&at>0&&at<=now+300&&at>=now-STALE_BALANCE_DAYS*DAY
      ?{amount,at}:null;
  }
  const financialInstitution=/\b(?:bank|fcu|credit\s*union|savings?|checking|brokerage|investing|investment|ira|citibank|citi|u\.?\s*s\.?\s*bank|capital\s*one|chase|wells\s*fargo|bofa|bank\s*of\s*america|amex|american\s*express|discover|synchrony|lafayette|navy\s*federal|paypal|venmo|cash\s*app|zelle|x\s*money|one\s*pay|onepay|robinhood|fidelity|schwab|vanguard)\b/i;
  const directed=/^\s*(?:to|from)\s+(.+?)\s*$/i;
  const bareIssuer=/^\s*(?:capital\s*one|u\.?\s*s\.?\s*bank|citibank|citi|amex|american\s*express|discover)\s*$/i;
  function financialMovement(row){
    if(['user','user_rule'].includes(row.categorySource))return false;
    const description=String(row.description||row.merchant||'').trim();
    const text=description+' '+String(row.merchant||'');
    const d=directed.exec(description);
    if(d&&financialInstitution.test(d[1]))return true;
    const amount=cents(row.amount);
    if(amount!==null&&amount<0n&&bareIssuer.test(description))return true;
    if(financialInstitution.test(text)&&/\b(?:pmt|payment|autopay|epay|crcardpmt|ccpmt)\b/i.test(text))return true;
    if(/\b(?:robinhood|fidelity|schwab|vanguard|brokerage|investment|ira)\b/i.test(text)&&
       /\b(?:contribution|contribute|deposit|funding|transfer)\b/i.test(text))return true;
    if(row.kind==='card_payment'||row.kind==='investment_contribution'||
       (row.signals||[]).includes('matched_internal_transfer'))return true;
    const value=cents(row.amount);
    if(value!==null&&value<0n&&String(row.category||'unreviewed')==='unreviewed'){
      const abs=-value;
      if((abs%100n===0n||abs>=100000n)&&(directed.test(description)||financialInstitution.test(description)||
         (row.signals||[]).includes('possible_transfer')))return true;
    }
    return false;
  }
  function investmentSummary(state={},options={}){
    const now=Number.isFinite(options.now)?options.now:Math.floor(Date.now()/1000);
    const accounts=Array.isArray(state.accounts)?state.accounts:[];
    const profiles=state.accountProfiles||{},history=state.balanceHistory||{};
    let total=0n,brokerage=0n,retirement=0n,eligible=0,missing=0,lastSyncChange=0n,monthChange=0n;
    let lastSyncKnown=0,monthKnown=0,investmentIncome=0n,invested=0n;
    const month=new Date(now*1000).getMonth(),year=new Date(now*1000).getFullYear();
    const midnight=new Date(year,month,1).getTime()/1000;
    for(const account of accounts){
      const kind=profiles[account.key]?.kind||account.kind||account.detectedType;
      if(!['brokerage','retirement'].includes(kind)||profiles[account.key]?.hidden)continue;
      eligible++;
      const v=cents(account.balance);
      if(v===null||account.currency!=='USD'){missing++;continue}
      total+=v;
      if(kind==='retirement')retirement+=v;else brokerage+=v;
      const points=(Array.isArray(history[account.key])?history[account.key]:[])
        .filter(r=>Number.isFinite(r?.observedAt||r?.at)&&cents(r.balance)!==null&&r.currency==='USD')
        .map(r=>({at:r.observedAt||r.at,value:cents(r.balance)})).sort((a,b)=>a.at-b.at);
      if(points.length>=2){lastSyncChange+=points.at(-1).value-points.at(-2).value;lastSyncKnown++}
      const lastMonth=points.filter(p=>p.at<=now-30*DAY).at(-1);
      if(lastMonth){monthChange+=v-lastMonth.value;monthKnown++}
    }
    for(const [key,rows] of Object.entries(state.transactions||{})){
      const account=accounts.find(a=>a.key===key);
      if(!account)continue;
      const kind=profiles[key]?.kind||account.kind||account.detectedType;
      for(const row of Object.values(rows||{})){
        if(!row||row.pending||row.excludedFromTotals||row.posted<midnight||row.posted>now)continue;
        const value=cents(row.amount);if(value===null)continue;
        if(['brokerage','retirement'].includes(kind)){
          if(value>0n&&/\b(?:dividend|interest)\b/i.test(String(row.description||'')))investmentIncome+=value;
        }else if(['checking','savings'].includes(kind)&&value<0n&&!['user','user_rule'].includes(row.categorySource)){
          const text=String(row.description||'');
          if(/^\s*to\s+/i.test(text)&&/\b(brokerage|ira|roth|401k|investing|robinhood|fidelity|schwab|vanguard)\b/i.test(text))
            invested-=value;
          else if((row.signals||[]).includes('investment_transfer'))invested-=value;
        }
      }
    }
    return Object.freeze({available:eligible>0&&eligible>missing,total:eligible>missing?decimal(total):null,
      accountCount:eligible,missingCount:missing,brokerage:decimal(brokerage),retirement:decimal(retirement),
      lastSyncChange:lastSyncKnown===eligible?decimal(lastSyncChange):null,
      monthChange:monthKnown===eligible?decimal(monthChange):null,
      investedThisMonth:decimal(invested),investmentIncome:decimal(investmentIncome)});
  }
  function summarize(state={},options={}){
    const now=Number.isFinite(options.now)?Math.floor(options.now):Math.floor(Date.now()/1000);
    const days=Number.isInteger(options.days)&&options.days>=1&&options.days<=MAX_DAYS?options.days:30;
    const accounts=Array.isArray(state.accounts)?state.accounts:[];
    const monitored=Array.isArray(state.monitoredAccounts)?state.monitoredAccounts:[];
    const mappings=state.mappings&&typeof state.mappings==='object'?state.mappings:{};
    const profiles=state.accountProfiles&&typeof state.accountProfiles==='object'?state.accountProfiles:{};
    const selected=new Set([...monitored,...Object.keys(mappings)]);
    const usd=accounts.filter(a=>a&&a.currency==='USD'&&selected.has(a.key)&&
      !['brokerage','retirement'].includes(profiles[a.key]?.kind||a.kind||a.detectedType));
    const history=state.transactions&&typeof state.transactions==='object'?state.transactions:{};
    const cutoff=now-days*DAY;
    let credits=0n,debits=0n,observations=0,candidates=0,reversals=0,unusable=0,pending=0;
    let income=0n,expenses=0n,transfers=0,unreviewed=0,uncategorized=0,recurring=0,sourceAccounts=0;
    const spending={},monthly={};
    for(const account of usd){
      const records=history[account.key];
      if(!records||typeof records!=='object'||Array.isArray(records))continue;
      sourceAccounts++;
      for(const row of Object.values(records)){
        if(!row||typeof row!=='object'||!Number.isFinite(row.posted)||row.posted<cutoff||row.posted>now+300)continue;
        const n=cents(row.amount);
        if(n===null){unusable++;continue}
        if(row.pending){pending++;continue}
        if(row.excludedFromTotals===true||profiles[account.key]?.includeSpending===false)continue;
        observations++;
        if(n>0n)credits+=n; else if(n<0n)debits-=n;
        if(row.kind==='possible_bonus'&&n>0n)candidates++;
        if(row.kind==='possible_reversal'&&n<0n)reversals++;
        const category=String(row.category||'unreviewed');
        if(category==='income'&&n>0n&&!financialMovement(row))income+=n;
        else if(n<0n&&!['transfer','verification','refund'].includes(category)&&
                !financialMovement(row)){
          const amount=-n,label=SPENDING.has(category)?category:'unreviewed';
          expenses+=amount;spending[label]=(spending[label]||0n)+amount;
          if(label==='unreviewed')uncategorized++;
        }else if(category==='transfer')transfers++;
        if(category==='unreviewed'||(category==='bonus'&&row.categorySource!=='user')||(!['user','user_rule'].includes(row.categorySource)&&row.confidence!=='high'))unreviewed++;
        if(Array.isArray(row.signals)&&row.signals.includes('possible_recurring'))recurring++;
        // Use the same local calendar basis as the day-grouped Finance ledger.
        const local=new Date(row.posted*1000);
        const key=String(local.getFullYear())+'-'+String(local.getMonth()+1).padStart(2,'0');
        const month=monthly[key]||(monthly[key]={income:0n,expenses:0n});
        if(category==='income'&&n>0n&&!financialMovement(row))month.income+=n;
        if(n<0n&&!['transfer','verification','refund'].includes(category)&&
           !financialMovement(row))month.expenses-=n;
      }
    }

    const profileEntries=accounts.filter(account=>!profiles[account.key]?.removed).map(account=>({account,profile:profiles[account.key]||{kind:'unclassified',balanceMode:'exclude'},balance:freshBalance(account,now)}));
    const cashEntries=profileEntries.filter(x=>['checking','savings'].includes(x.profile.kind));
    const readyCash=cashEntries.filter(x=>x.account.currency==='USD'&&x.balance);
    const cashReady=readyCash.length>0;
    const cash=readyCash.length?readyCash.reduce((sum,x)=>sum+x.balance.amount,0n):null;
    const cashMissing=cashEntries.length-readyCash.length;
    const included=profileEntries.filter(x=>x.profile.balanceMode!=='exclude');
    // Plaid supplies observedAt but not necessarily an authoritative balanceDate.
    // Show recently observed card debt without pretending its provider freshness was certified.
    const usable=included.map(x=>{
      if(x.balance||x.profile.kind!=='credit_card'||x.account.currency!=='USD')return x;
      const value=cents(x.account.balance),at=x.account.observedAt;
      return value!==null&&Number.isFinite(at)&&at>0&&at<=now+300&&at>=now-STALE_BALANCE_DAYS*DAY
        ?{...x,balance:{amount:value,at,provisional:true}}:x;
    }).filter(x=>x.account.currency==='USD'&&x.balance&&x.profile.kind!=='unclassified');
    const exclusions=profileEntries.filter(x=>x.profile.balanceMode==='exclude'||
      x.account.currency!=='USD'||x.profile.kind==='unclassified'||!usable.some(u=>u.account.key===x.account.key))
      .map(x=>({name:x.account.name||x.account.bank||'Account',
        reason:x.profile.balanceMode==='exclude'?'excluded by settings':
          x.account.currency!=='USD'?'non-USD balance':
          x.profile.kind==='unclassified'?'account type needs review':'balance not updated'}));
    const provisional=usable.filter(x=>x.balance.provisional).map(x=>x.account.name||'Credit card');
    const netWorthReady=usable.length>0;
    let assets=0n,liabilities=0n;
    if(netWorthReady)for(const x of usable){
      if(x.profile.balanceMode==='asset')assets+=x.balance.amount;
      else if(x.profile.balanceMode==='liability'){
        // A negative credit-card/loan balance is a credit owed to the user, not a debt.
        if(x.balance.amount<0n)assets-=x.balance.amount;
        else liabilities+=x.balance.amount;
      }
    }
    const netWorthHistory=[];
    if(usable.length>0){
      const balanceHistory=state.balanceHistory&&typeof state.balanceHistory==='object'?state.balanceHistory:{};
      const times=[...new Set(usable.flatMap(x=>(Array.isArray(balanceHistory[x.account.key])?balanceHistory[x.account.key]:[])
        .map(row=>row?.observedAt).filter(Number.isFinite)))].sort((a,b)=>a-b);
      for(const at of times){
        let point=0n,valid=true;
        for(const x of usable){
          const rows=(Array.isArray(balanceHistory[x.account.key])?balanceHistory[x.account.key]:[])
            .filter(row=>Number.isFinite(row?.observedAt)&&row.observedAt<=at&&row.currency==='USD')
            .sort((a,b)=>b.observedAt-a.observedAt);
          const latest=rows[0],value=latest&&at-latest.observedAt<=STALE_BALANCE_DAYS*DAY?cents(latest.balance):null;
          if(value===null){valid=false;break}
          point+=x.profile.balanceMode==='liability'?-value:value;
        }
        if(valid)netWorthHistory.push({at,value:decimal(point)});
      }
    }
    const missingAccounts=[...selected].filter(k=>!accounts.some(a=>a&&a.key===k)).length;
    const covered=usd.every(a=>history[a.key]&&typeof history[a.key]==='object'&&!Array.isArray(history[a.key]));
    const complete=observations>0&&unreviewed===0&&unusable===0&&missingAccounts===0&&covered;
    return Object.freeze({
      days,currency:'USD',connectedAccounts:accounts.length,selectedAccounts:selected.size,
      usdAccounts:usd.length,otherCurrencyAccounts:accounts.filter(a=>a&&selected.has(a.key)&&a.currency!=='USD').length,
      missingAccounts,otherCurrencies:[...new Set(accounts.filter(a=>a&&selected.has(a.key)&&a.currency!=='USD').map(a=>a.currency||'Unknown currency'))].sort(),
      sourceAccounts,observations,candidates,reversals,unusable,pending,unreviewed,uncategorized,transfers,recurring,
      hasSync:Number.isFinite(state.lastSuccess)&&state.lastSuccess>0,
      hasActivity:observations>0&&Number.isFinite(state.lastSuccess)&&state.lastSuccess>0,
      lastSync:Number.isFinite(state.lastSuccess)?state.lastSuccess:null,
      credits:observations?decimal(credits):null,debits:observations?decimal(debits):null,
      net:observations?decimal(credits-debits):null,
      income:observations?decimal(income):null,expenses:observations?decimal(expenses):null,
      cashFlow:observations?decimal(income-expenses):null,complete,
      savingsRate:complete&&income>0n?Number((income-expenses)*10000n/income)/100:null,
      spending:Object.fromEntries(Object.entries(spending).map(([k,v])=>[k,decimal(v)])),
      monthly:Object.entries(monthly).sort().map(([month,v])=>({month,income:decimal(v.income),expenses:decimal(v.expenses),cashFlow:decimal(v.income-v.expenses)})),
      cashAvailable:cashReady,cash:cashReady?decimal(cash):null,
      cashAccountCount:cashEntries.length,cashIncludedCount:readyCash.length,
      cashPartial:cashMissing>0,staleOrUnavailableCash:cashMissing,
      netWorthAvailable:netWorthReady,netWorthBasedOn:usable.length,netWorthTotalAccounts:accounts.length,
      netWorthPartial:usable.length<included.length||provisional.length>0,
      netWorthExclusions:exclusions,provisionalBalances:provisional,assets:netWorthReady?decimal(assets):null,
      liabilities:netWorthReady?decimal(liabilities):null,netWorth:netWorthReady?decimal(assets-liabilities):null,
      netWorthHistory:netWorthHistory.slice(-90),
      classifiedAccounts:profileEntries.filter(x=>x.profile.kind!=='unclassified').length,
      excludedFromNetWorth:profileEntries.filter(x=>x.profile.balanceMode==='exclude').length
    });
  }
  return Object.freeze({summarize,investmentSummary,cents,decimal});
});
