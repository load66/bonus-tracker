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
  const financialInstitution=/(?:\bcapital\s*one\b|\bchase\b|\bamerican\s*express\b|\bamex\b|\bdiscover\b|\bciti(?:bank)?\b|\brobinhood\b|\bfidelity\b|\bschwab\b|\bvanguard\b|\bsynchrony\b|\bbarclays\b)/i;
  const financialAction=/(?:\b(?:pmt|pymt|payment|autopay|epay|crcardpmt|ccpmt)\b)/i;
  const investmentInstitution=/(?:\brobinhood\b|\bfidelity\b|\bschwab\b|\bvanguard\b|\bbrokerage\b|\binvestment\b|\b401k\b|\broth\s*ira\b|\bira\b)/i;
  const contributionAction=/(?:\b(?:contribution|contribute|deposit|funding|transfer)\b)/i;
  function financialMovement(row){
    if(['user','user_rule'].includes(row.categorySource))return row.category==='transfer';
    const text=String(row.description||'')+' '+String(row.merchant||'');
    return row.kind==='card_payment'||row.kind==='investment_contribution'||
      (row.signals||[]).includes('matched_internal_transfer')||
      (financialInstitution.test(text)&&financialAction.test(text))||
      (investmentInstitution.test(text)&&contributionAction.test(text));
  }
  function summarize(state={},options={}){
    const guard=typeof window!=='undefined'?window.BTFinanceTransfer:typeof require==='function'?require('./finance-transfer-core.js'):null;
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
        const item=guard?.effective(row)||row;
        const category=String(item.category||'unreviewed');
        if(category==='income'&&n>0n)income+=n;
        else if(n<0n&&!['transfer','verification','refund'].includes(category)&&
                !financialMovement(item)&&!item.signals?.includes('possible_transfer')){
          const amount=-n,label=SPENDING.has(category)?category:'unreviewed';
          expenses+=amount;spending[label]=(spending[label]||0n)+amount;
          if(label==='unreviewed')uncategorized++;
        }else if(category==='transfer')transfers++;
        if((category==='unreviewed'&&!item.signals?.includes('possible_transfer'))||(category==='bonus'&&row.categorySource!=='user')||(!['user','user_rule'].includes(row.categorySource)&&row.confidence!=='high'))unreviewed++;
        if(Array.isArray(row.signals)&&row.signals.includes('possible_recurring'))recurring++;
        // Use the same local calendar basis as the day-grouped Finance ledger.
        const local=new Date(row.posted*1000);
        const key=String(local.getFullYear())+'-'+String(local.getMonth()+1).padStart(2,'0');
        const month=monthly[key]||(monthly[key]={income:0n,expenses:0n});
        if(category==='income'&&n>0n)month.income+=n;
        if(n<0n&&!['transfer','verification','refund'].includes(category)&&
           !financialMovement(item)&&!item.signals?.includes('possible_transfer'))month.expenses-=n;
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
      .map(x=>({key:x.account.key,name:x.account.name||x.account.bank||'Account',
        reason:x.profile.balanceMode==='exclude'?'excluded by settings':
          x.account.currency!=='USD'?'non-USD balance':
          x.profile.kind==='unclassified'?'account type needs review':'balance not updated'}));
    const provisional=usable.filter(x=>x.balance.provisional).map(x=>x.account.name||'Credit card');

    // The four Overview amounts are a partition of the SAME included balances
    // used for net worth; stale/raw balances must never leak into these rows.
    const groups={cash:0n,investments:0n,creditCards:0n,other:0n};
    const groupAccounts={cash:[],investments:[],creditCards:[],other:[]};
    for(const x of usable){
      const kind=x.profile.kind,mode=x.profile.balanceMode;
      const signed=mode==='liability'?-x.balance.amount:x.balance.amount;
      // Product type, never the sign of its balance, determines the row.
      const category=kind==='credit_card'?'creditCards':
        mode==='asset'&&['checking','savings'].includes(kind)?'cash':
        mode==='asset'&&['brokerage','retirement'].includes(kind)?'investments':'other';
      groups[category]+=signed;
      groupAccounts[category].push({
        key:x.account.key,name:x.account.name||x.account.bank||'Account',
        bank:x.account.bank||'',kind,amount:decimal(signed),
        balanceDate:x.balance.at,provisional:x.balance.provisional===true,
        includedInNetWorth:true
      });
    }
    const netWorthGroups=Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,decimal(v)]));
    const netWorthNotUpdated=profileEntries.filter(x=>x.profile.balanceMode!=='exclude'&&
      x.account.currency==='USD'&&x.profile.kind!=='unclassified'&&
      !usable.some(y=>y.account.key===x.account.key)).map(x=>({
      key:x.account.key,name:x.account.name||x.account.bank||'Account',
      bank:x.account.bank||'',kind:x.profile.kind,
      lastUpdated:Number.isFinite(x.account.balanceDate)?x.account.balanceDate:
        Number.isFinite(x.account.observedAt)?x.account.observedAt:null,
      lastKnownIncluded:false,
      lastKnownBalance:cents(x.account.balance)!==null?decimal(cents(x.account.balance)):null
    }));
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
    const investmentEntries=profileEntries.filter(x=>['brokerage','retirement'].includes(x.profile.kind));
    const balanceSeries=state.balanceHistory&&typeof state.balanceHistory==='object'?state.balanceHistory:{};
    const investmentAccounts=investmentEntries.map(x=>{
      const raw=cents(x.account.balance),historyPoints=Array.isArray(balanceSeries[x.account.key])?balanceSeries[x.account.key]
        .filter(v=>Number.isFinite(v?.observedAt)&&v.currency==='USD'&&cents(v.balance)!==null)
        .sort((a,b)=>a.observedAt-b.observedAt):[];
      const observation=x.account.balanceDate||x.account.observedAt||null;
      const usable=x.account.currency==='USD'&&raw!==null;
      const historical=offset=>{
        const limit=now-offset;
        const candidate=historyPoints.filter(v=>v.observedAt<=limit).at(-1);
        return candidate?cents(candidate.balance):null;
      };
      return {key:x.account.key,name:x.account.name||'Investment account',kind:x.profile.kind,
        value:usable?raw:null,asOf:observation,
        last:historyPoints.length>1?cents(historyPoints.at(-2).balance):null,
        monthAgo:historical(30*DAY)};
    });
    const investmentValid=investmentAccounts.filter(x=>x.value!==null);
    // An incomplete set of investment balances cannot be presented as a known total.
    // Zero is valid only when every included investment account has a usable balance.
    const investmentReady=investmentAccounts.length>0&&investmentValid.length===investmentAccounts.length;
    const investmentValue=investmentValid.reduce((v,x)=>v+x.value,0n);
    const investmentByKind={brokerage:0n,retirement:0n};
    for(const x of investmentValid)investmentByKind[x.kind]+=x.value;
    const sumChange=which=>{
      if(!investmentValid.length||investmentValid.some(x=>x[which]===null))return null;
      return decimal(investmentValid.reduce((acc,x)=>acc+x.value-x[which],0n));
    };
    const currentMonth=new Date(now*1000),monthStart=Math.floor(new Date(
      currentMonth.getFullYear(),currentMonth.getMonth(),1).getTime()/1000);
    let invested=0n,investmentIncome=0n;
    for(const account of accounts){
      for(const row of Object.values(history[account.key]||{})){
        const value=cents(row?.amount);
        const investmentAccount=investmentEntries.some(x=>x.account.key===account.key);
        if(value===null||row.pending||(row.excludedFromTotals&&!investmentAccount)||
           !Number.isFinite(row.posted)||row.posted<monthStart||row.posted>now)continue;
        if(investmentAccount){
          if(value>0n&&/\b(?:dividend|interest)\b/i.test(row.description||''))investmentIncome+=value;
        }else if(value<0n&&(row.signals||[]).includes('investment_transfer'))invested-=value;
      }
    }

    // Transfers must never be reported as investment performance. Missing
    // full-period cash-flow coverage makes market change unavailable.
    let verifiedContributions=0n,verifiedWithdrawals=0n,verifiedFlowRows=0,flowCoverage=true;
    const beginnings=new Map();
    for(const x of investmentEntries){
      const key=x.account.key,points=Array.isArray(balanceSeries[key])?balanceSeries[key]:[];
      const startPoint=points.filter(p=>p&&Number.isFinite(p.observedAt)&&p.observedAt<=monthStart&&
        p.currency==='USD'&&cents(p.balance)!==null).sort((a,b)=>b.observedAt-a.observedAt)[0];
      beginnings.set(key,startPoint?cents(startPoint.balance):null);
      const coverage=state.investmentFlowCoverage?.[key];
      if(!startPoint||!x.balance||coverage?.complete!==true||
        !Number.isFinite(coverage?.from)||coverage.from>startPoint.observedAt||
        !Number.isFinite(coverage?.through)||coverage.through<now-86400)flowCoverage=false;
      for(const row of Object.values(history[key]||{})){
        if(!row||row.pending||!Number.isFinite(row.posted)||
          row.posted<monthStart||row.posted>now)continue;
        const value=cents(row.amount),flags=Array.isArray(row.signals)?row.signals:[];
        if(value===null)continue;
        const movement=flags.includes('investment_transfer')||row.kind==='investment_contribution';
        if(movement&&row.transferPairId&&row.transferOtherAccountKey){
          if(value>0n)verifiedContributions+=value;
          if(value<0n)verifiedWithdrawals-=value;
          verifiedFlowRows++;
        }else if(movement||row.category==='transfer')flowCoverage=false;
      }
    }
    const investmentPerformanceReady=flowCoverage&&investmentEntries.length>0&&
      investmentEntries.every(x=>beginnings.get(x.account.key)!==null&&x.balance?.amount!==null);
    const delta=investmentPerformanceReady?investmentEntries.reduce((v,x)=>
      v+x.balance.amount-beginnings.get(x.account.key),0n):null;
    const investmentMarketChange=delta===null?null:decimal(delta-verifiedContributions+verifiedWithdrawals);
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
      investments:investmentReady?decimal(investmentValue):null,
      investmentAccounts:investmentAccounts.map(x=>({key:x.key,name:x.name,kind:x.kind,
        value:x.value!==null?decimal(x.value):null,asOf:x.asOf})),
      investmentBrokerage:decimal(investmentByKind.brokerage),
      investmentRetirement:decimal(investmentByKind.retirement),
      investmentChangeLastSync:sumChange('last'),investmentChange1M:sumChange('monthAgo'),
      investedThisMonth:verifiedFlowRows?decimal(verifiedContributions):null,
      investmentIncome:decimal(investmentIncome),
      investmentContributions:verifiedFlowRows?decimal(verifiedContributions):null,
      investmentWithdrawals:verifiedFlowRows?decimal(verifiedWithdrawals):null,
      investmentMarketChange,investmentPerformanceReady,
      netWorthAvailable:netWorthReady,netWorthBasedOn:usable.length,netWorthTotalAccounts:accounts.length,
      netWorthPartial:usable.length<included.length||provisional.length>0,
      netWorthGroups,netWorthGroupAccounts:groupAccounts,netWorthNotUpdated,
      netWorthExclusions:exclusions,provisionalBalances:provisional,assets:netWorthReady?decimal(assets):null,
      liabilities:netWorthReady?decimal(liabilities):null,netWorth:netWorthReady?decimal(assets-liabilities):null,
      netWorthHistory:netWorthHistory.slice(-90),
      classifiedAccounts:profileEntries.filter(x=>x.profile.kind!=='unclassified').length,
      excludedFromNetWorth:profileEntries.filter(x=>x.profile.balanceMode==='exclude').length
    });
  }
  return Object.freeze({summarize,cents,decimal});
});
