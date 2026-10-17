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
  function internalPayment(row){
    if((row.signals||[]).includes('matched_internal_transfer'))return true;
    const t=String(row.description||'')+' '+String(row.merchant||'');
    return /\b(capital\s*one|chase|amex|american\s*express|discover|citi(?:bank)?|robinhood|fidelity|schwab|vanguard|synchrony|barclays)\b/i.test(t)
      &&/\b(pmt|pymt|payment|autopay|epay|crcardpmt|contribution|funding)\b/i.test(t);
  }
  function summarize(state={},options={}){
    const now=Number.isFinite(options.now)?Math.floor(options.now):Math.floor(Date.now()/1000);
    const days=Number.isInteger(options.days)&&options.days>=1&&options.days<=MAX_DAYS?options.days:30;
    const accounts=Array.isArray(state.accounts)?state.accounts:[];
    const monitored=Array.isArray(state.monitoredAccounts)?state.monitoredAccounts:[];
    const mappings=state.mappings&&typeof state.mappings==='object'?state.mappings:{};
    const profiles=state.accountProfiles&&typeof state.accountProfiles==='object'?state.accountProfiles:{};
    const selected=new Set([...monitored,...Object.keys(mappings)]);
    const usd=accounts.filter(a=>a&&a.currency==='USD'&&selected.has(a.key));
    const history=state.transactions&&typeof state.transactions==='object'?state.transactions:{};
    const cutoff=now-days*DAY;
    let credits=0n,debits=0n,observations=0,candidates=0,reversals=0,unusable=0,pending=0;
    let income=0n,expenses=0n,transfers=0,unreviewed=0,recurring=0,sourceAccounts=0;
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
        if(category==='income'&&n>0n)income+=n;
        else if(n<0n&&SPENDING.has(category)&&!internalPayment(row)){
          const amount=-n;expenses+=amount;spending[category]=(spending[category]||0n)+amount;
        }else if(category==='transfer')transfers++;
        if(category==='unreviewed'||(category==='bonus'&&row.categorySource!=='user')||(!['user','user_rule'].includes(row.categorySource)&&row.confidence!=='high'))unreviewed++;
        if(Array.isArray(row.signals)&&row.signals.includes('possible_recurring'))recurring++;
        // Use the same local calendar basis as the day-grouped Finance ledger.
        const local=new Date(row.posted*1000);
        const key=String(local.getFullYear())+'-'+String(local.getMonth()+1).padStart(2,'0');
        const month=monthly[key]||(monthly[key]={income:0n,expenses:0n});
        if(category==='income'&&n>0n)month.income+=n;
        if(SPENDING.has(category)&&n<0n&&!internalPayment(row))month.expenses-=n;
      }
    }

    const profileEntries=accounts.filter(account=>!profiles[account.key]?.removed).map(account=>({account,profile:profiles[account.key]||{kind:'unclassified',balanceMode:'exclude'},balance:freshBalance(account,now)}));
    const cashEntries=profileEntries.filter(x=>['checking','savings'].includes(x.profile.kind));
    const cashKnown=cashEntries.filter(x=>x.account.currency==='USD'&&x.balance);
    const cashReady=cashKnown.length>0;
    const cash=cashReady?cashKnown.reduce((sum,x)=>sum+x.balance.amount,0n):null;
    const cashIncomplete=cashEntries.length-cashKnown.length;
    const included=profileEntries.filter(x=>x.profile.balanceMode!=='exclude');
    const usable=included.filter(x=>x.account.currency==='USD'&&x.balance&&x.profile.kind!=='unclassified');
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
      sourceAccounts,observations,candidates,reversals,unusable,pending,unreviewed,transfers,recurring,
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
      cashAccountCount:cashEntries.length,staleOrUnavailableCash:cashIncomplete,
      netWorthAvailable:netWorthReady,netWorthBasedOn:usable.length,netWorthTotalAccounts:included.length,
      netWorthPartial:usable.length<included.length,assets:netWorthReady?decimal(assets):null,
      liabilities:netWorthReady?decimal(liabilities):null,netWorth:netWorthReady?decimal(assets-liabilities):null,
      netWorthHistory:netWorthHistory.slice(-90),
      netWorthExclusions:profileEntries.filter(x=>x.profile.balanceMode==='exclude'||!x.balance||x.account.currency!=='USD'||x.profile.kind==='unclassified').map(x=>({name:String(x.account.name||x.account.bank||'Account'),reason:x.profile.balanceMode==='exclude'?'excluded in account settings':x.profile.kind==='unclassified'?'account type not set':x.account.currency!=='USD'?'non-USD balance':'balance not updated'})),
      classifiedAccounts:profileEntries.filter(x=>x.profile.kind!=='unclassified').length,
      excludedFromNetWorth:profileEntries.filter(x=>x.profile.balanceMode==='exclude').length
    });
  }
  return Object.freeze({summarize,cents,decimal});
});
