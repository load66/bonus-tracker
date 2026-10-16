/* Exact-cent financial summaries. Pure and deterministic; never mutates private state. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.BTFinanceOverview=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const DAY=86400,MAX_DAYS=90,STALE_BALANCE_DAYS=7;
  const SPENDING=new Set(['housing','utilities','groceries','dining','transportation','shopping','health','entertainment','fees','taxes','travel','subscription','other']);
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
  const ZONE='America/Chicago';
  const chicagoParts=new Intl.DateTimeFormat('en-US',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'});
  const ASSETS=new Set(['checking','savings','brokerage','retirement','other_asset']);
  const DEBTS=new Set(['credit_card','loan','mortgage','other_liability']);
  function chicagoMonth(t){
    const p=Object.fromEntries(chicagoParts.formatToParts(new Date(t*1000))
      .filter(x=>['month','year'].includes(x.type)).map(x=>[x.type,x.value]));
    return p.year+'-'+p.month;
  }
  function inferredProfile(account,profiles){
    const saved=profiles[account.key]||{};
    const kind=saved.kind&&saved.kind!=='unclassified'?saved.kind:
      account.kind&&account.kind!=='unclassified'?account.kind:(account.detectedType||'unclassified');
    const mode=DEBTS.has(kind)?'liability':ASSETS.has(kind)?'asset':'exclude';
    return {kind,balanceMode:saved.balanceMode||mode};
  }
  function observedBalance(account,now){
    const amount=cents(account.balance),sourceAt=account.balanceDate;
    const dateValid=Number.isFinite(sourceAt)&&sourceAt>0;
    const observedAt=Number.isFinite(account.observedAt)&&account.observedAt>0?account.observedAt:null;
    const at=dateValid?sourceAt:observedAt;
    if(amount===null||(at&&at>now+300))return null;
    return {amount,at,stale:!!(at&&at<now-STALE_BALANCE_DAYS*DAY),undated:!dateValid};
  }
  function coverage(items,now){
    const result={eligible:items.length,covered:0,stale:0,undated:0,missing:0,unsupportedCurrency:0};
    for(const x of items){
      if(x.account.currency!=='USD'){result.unsupportedCurrency++;continue}
      const found=observedBalance(x.account,now);
      if(!found){result.missing++;continue}
      result.covered++;
      if(found.stale)result.stale++;
      if(found.undated)result.undated++;
    }
    return Object.freeze(result);
  }
  function attributedRefund(row,accountKey,rows){
    if(SPENDING.has(row.refundCategory))return row.refundCategory;
    if(SPENDING.has(row.originalCategory))return row.originalCategory;
    const link=row.originalTransactionId||row.originalPurchaseId;
    if(link){
      const matches=rows.filter(x=>x.key===link||x.row.id===link);
      return matches.length===1&&SPENDING.has(matches[0].row.category)?matches[0].row.category:null;
    }
    const amt=cents(row.amount),merchant=String(row.merchant||'').trim().toLowerCase();
    if(!merchant||amt===null||amt<=0n)return null;
    const matches=rows.filter(x=>x.accountKey===accountKey&&x.row!==row
      &&String(x.row.merchant||'').trim().toLowerCase()===merchant
      &&x.row.posted<=row.posted&&x.row.posted>=row.posted-90*DAY
      &&cents(x.row.amount)===-amt&&SPENDING.has(x.row.category));
    return matches.length===1?matches[0].row.category:null;
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
    let income=0n,bonusIncome=0n,refunds=0n,unattributedRefunds=0,expenses=0n,transfers=0,unreviewed=0,recurring=0,sourceAccounts=0;
    const spending={},monthly={},allRows=[];
    for(const a of usd){
      const records=history[a.key];
      if(!records||typeof records!=='object'||Array.isArray(records))continue;
      for(const [key,row] of Object.entries(records)){
        if(row&&typeof row==='object'&&Number.isFinite(row.posted))allRows.push({accountKey:a.key,key,row});
      }
    }
    for(const account of usd){
      const records=history[account.key];
      if(!records||typeof records!=='object'||Array.isArray(records))continue;
      sourceAccounts++;
      for(const row of Object.values(records)){
        if(!row||typeof row!=='object'||!Number.isFinite(row.posted)||row.posted<cutoff||row.posted>now+300)continue;
        const n=cents(row.amount);
        if(n===null){unusable++;continue}
        if(row.pending){pending++;continue}
        observations++;
        if(n>0n)credits+=n; else if(n<0n)debits-=n;
        if(row.kind==='possible_bonus'&&n>0n)candidates++;
        if(row.kind==='possible_reversal'&&n<0n)reversals++;
        const category=String(row.category||'unreviewed');
        const key=chicagoMonth(row.posted);
        const month=monthly[key]||(monthly[key]={income:0n,bonusIncome:0n,expenses:0n,refunds:0n});
        if(category==='bonus'&&n>0n){bonusIncome+=n;month.bonusIncome+=n}
        else if(category==='income'&&n>0n){income+=n;month.income+=n}
        else if(SPENDING.has(category)&&n<0n){
          const value=-n;expenses+=value;month.expenses+=value;
          spending[category]=(spending[category]||0n)+value;
        }else if(n>0n&&(category==='refund'||row.signals?.includes('possible_refund'))){
          const target=attributedRefund(row,account.key,allRows);
          if(target){refunds+=n;expenses-=n;month.refunds+=n;month.expenses-=n;
            spending[target]=(spending[target]||0n)-n}
          else unattributedRefunds++;
        }else if(category==='transfer'||row.signals?.includes('matched_internal_transfer'))transfers++;
        if(category==='unreviewed')unreviewed++;
        if(Array.isArray(row.signals)&&row.signals.includes('possible_recurring'))recurring++;
      }
    }

    const profileEntries=accounts.map(account=>({account,profile:inferredProfile(account,profiles),balance:freshBalance(account,now)}));
    const cashEntries=profileEntries.filter(x=>['checking','savings'].includes(x.profile.kind));
    const included=profileEntries.filter(x=>x.profile.balanceMode!=='exclude');
    const eligible=included.filter(x=>x.profile.kind!=='unclassified'&&
      ['asset','liability'].includes(x.profile.balanceMode));
    const cashCoverage=coverage(cashEntries,now),rawNetWorthCoverage=coverage(eligible,now);
    const netWorthCoverage=Object.freeze({...rawNetWorthCoverage,eligible:included.length,
      unclassified:included.length-eligible.length});
    const cashReady=cashEntries.length>0&&cashEntries.every(x=>x.account.currency==='USD'&&x.balance);
    const cash=cashReady?cashEntries.reduce((sum,x)=>sum+x.balance.amount,0n):null;
    const netWorthReady=included.length>0&&eligible.length===included.length
      &&included.every(x=>x.account.currency==='USD'&&x.balance);
    let assets=0n,liabilities=0n,observedAssets=0n,observedLiabilities=0n;
    let observedNetWorthAccounts=0,observedCash=0n,observedCashAccounts=0;
    for(const x of cashEntries){
      if(x.account.currency!=='USD')continue;
      const value=observedBalance(x.account,now);
      if(value){observedCash+=value.amount;observedCashAccounts++}
    }
    for(const x of eligible){
      if(x.account.currency!=='USD')continue;
      const value=observedBalance(x.account,now);
      if(!value)continue;
      observedNetWorthAccounts++;
      // Positive liability = owed; negative liability = credit balance.
      // Provider sign normalization must remain part of the connection contract.
      if(x.profile.balanceMode==='liability')observedLiabilities+=value.amount;
      else observedAssets+=value.amount;
      if(x.balance){
        if(x.profile.balanceMode==='liability')liabilities+=x.balance.amount;
        else assets+=x.balance.amount;
      }
    }
    const netWorthHistory=[];
    if(included.length&&eligible.length===included.length&&included.every(x=>x.account.currency==='USD')){
      const balanceHistory=state.balanceHistory&&typeof state.balanceHistory==='object'?state.balanceHistory:{};
      const times=[...new Set(included.flatMap(x=>(Array.isArray(balanceHistory[x.account.key])?balanceHistory[x.account.key]:[])
        .map(row=>row?.observedAt).filter(Number.isFinite)))].sort((a,b)=>a-b);
      for(const at of times){
        let point=0n,valid=true;
        for(const x of included){
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
    const complete=observations>0&&unreviewed===0&&unusable===0&&missingAccounts===0&&covered&&unattributedRefunds===0&& !state.incompleteProviders&&!state.excludedForReview;
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
      income:observations?decimal(income):null,bonusIncome:observations?decimal(bonusIncome):null,
      expenses:observations?decimal(expenses):null,refunds:observations?decimal(refunds):null,
      unattributedRefunds,cashFlow:observations?decimal(income+bonusIncome-expenses):null,complete,
      savingsRate:complete&&(income+bonusIncome)>0n?Number((income+bonusIncome-expenses)*10000n/(income+bonusIncome))/100:null,
      spending:Object.fromEntries(Object.entries(spending).map(([k,v])=>[k,decimal(v)])),
      monthly:Object.entries(monthly).sort().map(([month,v])=>({month,income:decimal(v.income),bonusIncome:decimal(v.bonusIncome),expenses:decimal(v.expenses),refunds:decimal(v.refunds),cashFlow:decimal(v.income+v.bonusIncome-v.expenses)})),
      cashAvailable:cashReady,cash:cashReady?decimal(cash):null,
      observedCash:observedCashAccounts?decimal(observedCash):null,cashCoverage,
      cashAccountCount:cashEntries.length,staleOrUnavailableCash:cashEntries.filter(x=>x.account.currency!=='USD'||!x.balance).length,
      netWorthAvailable:netWorthReady,assets:netWorthReady?decimal(assets):null,
      liabilities:netWorthReady?decimal(liabilities):null,netWorth:netWorthReady?decimal(assets-liabilities):null,
      observedAssets:observedNetWorthAccounts?decimal(observedAssets):null,
      observedLiabilities:observedNetWorthAccounts?decimal(observedLiabilities):null,
      observedNetWorth:observedNetWorthAccounts?decimal(observedAssets-observedLiabilities):null,
      netWorthCoverage,netWorthHistory:netWorthHistory.slice(-90),
      classifiedAccounts:profileEntries.filter(x=>x.profile.kind!=='unclassified').length,
      excludedFromNetWorth:profileEntries.filter(x=>x.profile.balanceMode==='exclude').length
    });
  }
  return Object.freeze({summarize,cents,decimal});
});
