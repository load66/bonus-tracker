/* Read-only exact-cent reconciliation. Never mutates provider evidence or invents coverage. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.BTFinanceReconcile=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const DAY=86400;
  function cents(value){
    const m=/^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value??'').trim());
    if(!m)return null;
    try{
      const n=BigInt(m[2])*100n+BigInt((m[3]||'').padEnd(2,'0')||'0');
      return n>100000000000000n?null:m[1]==='-'?-n:n;
    }catch{return null}
  }
  function decimal(value){
    const abs=value<0n?-value:value;
    return (value<0n?'-':'')+String(abs/100n)+'.'+String(abs%100n).padStart(2,'0');
  }
  function unknown(reason){return {status:'unknown',reason,window:null,transactions:[]}}
  function signed(account,amount){
    const kind=account.kind||account.detectedType||account.accountSubtype;
    if(['mortgage','loan'].includes(kind))return amount<0n?amount:-amount;
    if(kind==='credit_card'||kind==='other_liability'){
      // Plaid's current credit/liability balance is positive when owed.
      // Do not guess the direction of a SimpleFIN credit-card liability.
      const convention=account.liabilityDebtSign||
        (account.source==='plaid'?'positive':null);
      return convention==='positive'?-amount:convention==='negative'?amount:null;
    }
    return amount;
  }
  function reconcile(account,history,transactionRows,options={}){
    if(account.currency!=='USD')return unknown('non_usd');
    if(options.historyLoading||options.historyComplete!==true)return unknown('history_incomplete');
    if(!Array.isArray(history))return unknown('snapshots_missing');
    const points=history.filter(row=>row&&row.currency==='USD'&&
      Number.isFinite(row.observedAt)&&row.observedAt>0&&cents(row.balance)!==null)
      .slice().sort((a,b)=>b.observedAt-a.observedAt);
    const newer=points[0],older=points.find(row=>newer&&newer.observedAt-row.observedAt>=DAY);
    if(!newer||!older)return unknown('snapshots_insufficient');
    const a=signed(account,cents(older.balance)),b=signed(account,cents(newer.balance));
    if(a===null||b===null)return unknown('liability_sign_unverified');
    if(!Array.isArray(transactionRows)&&(!transactionRows||typeof transactionRows!=='object'))
      return unknown('transactions_missing');
    const all=Array.isArray(transactionRows)?transactionRows:Object.values(transactionRows);
    const window={from:older.observedAt,to:newer.observedAt};
    // Try both day-boundary tolerances; a posted date can differ from the
    // financial institution's balance cutoff by one local-calendar day.
    const candidates=[];
    for(const lower of [0,-DAY])for(const upper of [0,DAY]){
      let delta=0n,posted=0,pending=0,invalid=0;
      const rows=[];
      for(const row of all){
        if(!row||!Number.isFinite(row.posted)||row.posted<=window.from+lower||
          row.posted>window.to+upper)continue;
        if(row.pending){pending++;continue}
        const n=cents(row.amount);
        if(n===null){invalid++;continue}
        delta+=n;posted++;rows.push(row);
      }
      if(invalid)continue;
      candidates.push({difference:b-(a+delta),rows,posted,pending});
    }
    if(!candidates.length)return unknown('invalid_transactions');
    const exact=candidates.find(x=>x.difference===0n);
    const best=exact||candidates.reduce((a,b)=>
      (b.difference<0n?-b.difference:b.difference)<(a.difference<0n?-a.difference:a.difference)?b:a);
    if(best.posted===0&&best.pending>0)return unknown('pending_only');
    // Require a dated transaction window without known gaps for a confident match.
    return {status:best.difference===0n?'reconciled':'off',
      difference:decimal(best.difference),differenceCents:String(best.difference),
      window,transactions:best.rows.map(row=>({...row}))};
  }
  function reconcileAll(state={},options={}){
    const profiles=state.accountProfiles||{},histories=state.balanceHistory||{},
      transactions=state.transactions||{};
    return (state.accounts||[]).filter(account=>profiles[account.key]?.balanceMode!=='exclude'&&
      profiles[account.key]?.removed!==true&&profiles[account.key]?.syncEnabled!==false)
      .map(account=>{
        const p=profiles[account.key]||{};
        const result=reconcile({...account,kind:p.kind||account.kind},
          histories[account.key],transactions[account.key],
          {historyComplete:account.source==='plaid'?account.historyComplete===true:
            (options.simplefinHistoryComplete!==false && !!transactions[account.key] &&
             !state.incompleteProviders && !state.historyIncomplete),
           historyLoading:account.transactionSyncStatus==='history_still_loading'||
             account.transactionSyncStatus==='needs_attention'||state.historyIncomplete===true});
        return {key:account.key,kind:p.kind||account.kind||'unclassified',...result};
      });
  }
  return Object.freeze({cents,decimal,signed,reconcile,reconcileAll});
});
