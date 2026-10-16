/* Observed financial activity only. No income, spending, cash-flow or net-worth claims.
 * Pure and deterministic so it can be tested without access to private accounts.
 */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.BTFinanceOverview=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const DAY=86400;
  const MAX_DAYS=90;
  function cents(value){
    const m=/^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value??'').trim());
    if(!m)return null;
    try{
      const amount=BigInt(m[2])*100n+BigInt((m[3]||'').padEnd(2,'0')||'0');
      if(amount>100000000000000n)return null;
      return m[1]==='-'?-amount:amount;
    }catch{return null;}
  }
  function decimal(value){
    const neg=value<0n,abs=neg?-value:value;
    return (neg?'-':'')+String(abs/100n)+'.'+String(abs%100n).padStart(2,'0');
  }
  function summarize(state={},options={}){
    const now=Number.isFinite(options.now)?Math.floor(options.now):Math.floor(Date.now()/1000);
    const days=Number.isInteger(options.days)&&options.days>=1&&options.days<=MAX_DAYS?options.days:30;
    const accounts=Array.isArray(state.accounts)?state.accounts:[];
    const monitored=Array.isArray(state.monitoredAccounts)?state.monitoredAccounts:[];
    const mappings=state.mappings&&typeof state.mappings==='object'?state.mappings:{};
    const selected=new Set([...monitored,...Object.keys(mappings)]);
    const usd=accounts.filter(a=>a&&a.currency==='USD'&&selected.has(a.key));
    const available=new Set(usd.map(a=>a.key));
    const history=state.transactions&&typeof state.transactions==='object'?state.transactions:{};
    const cutoff=now-days*DAY;
    let credits=0n,debits=0n,observations=0,candidates=0,unusable=0;
    let sourceAccounts=0;
    for(const account of usd){
      const records=history[account.key];
      if(!records||typeof records!=='object'||Array.isArray(records))continue;
      sourceAccounts++;
      for(const row of Object.values(records)){
        if(!row||typeof row!=='object'||!Number.isFinite(row.posted)||row.posted<cutoff||row.posted>now+300)continue;
        const n=cents(row.amount);
        if(n===null){unusable++;continue;}
        observations++;
        if(n>0n)credits+=n;
        else if(n<0n)debits-=n;
        if(row.kind==='possible_bonus'||row.kind==='possible_reversal')candidates++;
      }
    }
    // Aggregating brokerage, debt and deposit balances without account types is unsound.
    // Likewise, observed gross credits/debits are NOT verified income or expenses:
    // transfers may appear on both sides of a linked account pair.
    return Object.freeze({
      days,currency:'USD',connectedAccounts:accounts.length,selectedAccounts:selected.size,
      usdAccounts:usd.length,otherCurrencyAccounts:accounts.filter(a=>a&&selected.has(a.key)&&a.currency!=='USD').length,
      missingAccounts:[...selected].filter(k=>!accounts.some(a=>a&&a.key===k)).length,
      sourceAccounts,observations,candidates,unusable,
      hasSync:Number.isFinite(state.lastSuccess)&&state.lastSuccess>0,
      hasActivity:observations>0,
      lastSync:Number.isFinite(state.lastSuccess)?state.lastSuccess:null,
      credits:observations?decimal(credits):null,
      debits:observations?decimal(debits):null,
      net:observations?decimal(credits-debits):null
    });
  }
  return Object.freeze({summarize});
});
