/* Pure, read-only account-unification adapter. Keeps the original provider records intact. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.BTFinanceUnified=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const PROVIDERS=['simplefin','plaid'];
  const LABELS={simplefin:'SimpleFIN',plaid:'Plaid'};
  const TYPES=new Set(['checking','savings','credit_card','brokerage','retirement','loan','mortgage','other_asset','other_liability']);
  const canonical=value=>String(value||'').toLowerCase().normalize('NFKC').replace(/[^a-z0-9]+/g,' ').trim();
  function detectedType(account){
    const subtype=canonical(account.accountSubtype).replaceAll(' ','_');
    const type=canonical(account.accountType).replaceAll(' ','_');
    const name=canonical(account.name);
    const aliases={depository:'',credit:'credit_card',credit_card:'credit_card',investment:'brokerage',student:'loan',auto:'loan',mortgage:'mortgage',loan:'loan',brokerage:'brokerage',retirement:'retirement','401k':'retirement',ira:'retirement',checking:'checking',savings:'savings',money_market:'savings'};
    if(TYPES.has(subtype))return subtype;
    if(Object.hasOwn(aliases,subtype)&&aliases[subtype])return aliases[subtype];
    if(TYPES.has(type))return type;
    if(Object.hasOwn(aliases,type)&&aliases[type])return aliases[type];
    for(const [pattern,kind] of [[/\b(checking|current account)\b/,'checking'],[/\b(savings|money market|high yield)\b/,'savings'],[/\b(credit card|charge card)\b/,'credit_card'],[/\b(mortgage)\b/,'mortgage'],[/\b(401k|ira|roth|retirement)\b/,'retirement'],[/\b(brokerage|investment)\b/,'brokerage'],[/\b(loan)\b/,'loan']]){
      if(pattern.test(name))return kind;
    }
    return 'unclassified';
  }
  const key=(source,rawKey)=>source+':'+String(rawKey);
  function combine(sources={}){
    const accounts=[],transactions={},mappings={},monitoredAccounts=[],accountProfiles={},balanceHistory={},flags=[],providerState={};
    for(const source of PROVIDERS){
      const state=sources[source];
      if(!state||!state.connected){providerState[source]={connected:false,available:!!state,stale:false};continue}
      providerState[source]={connected:true,available:true,stale:!!state.stale,lastSuccess:state.lastSuccess||null,
        nextSyncAt:state.nextSyncAt||null,accountCount:(state.accounts||[]).length};
      const accountKeys=new Set();
      for(const account of state.accounts||[]){
        if(!account||typeof account.key!=='string'||!account.key)continue;
        const composite=key(source,account.key);
        if(accountKeys.has(composite))continue;
        accountKeys.add(composite);
        const saved=state.accountProfiles?.[account.key]||{};
        const detected=detectedType(account);
        accounts.push({...account,key:composite,rawKey:account.key,source,sourceLabel:LABELS[source],
          detectedType:detected,kind:saved.kind&&saved.kind!=='unclassified'?saved.kind:detected});
        const kind=saved.kind&&saved.kind!=='unclassified'?saved.kind:detected;
        accountProfiles[composite]={kind,balanceMode:saved.balanceMode||'exclude',
          order:Number.isInteger(saved.order)?saved.order:499};
        if((state.monitoredAccounts||[]).includes(account.key))monitoredAccounts.push(composite);
        if(state.mappings?.[account.key])mappings[composite]=state.mappings[account.key];
        if(Array.isArray(state.balanceHistory?.[account.key]))balanceHistory[composite]=state.balanceHistory[account.key];
        if(state.transactions?.[account.key]&&typeof state.transactions[account.key]==='object'){
          transactions[composite]={};
          for(const [txnKey,row] of Object.entries(state.transactions[account.key])){
            if(!row||typeof row!=='object')continue;
            const identity=row.id||txnKey;
            transactions[composite][String(txnKey)]={...row,id:identity,source,accountKey:composite};
          }
        }
      }
    }
    // Provider account IDs are intentionally opaque and cannot be compared across
    // institutions. Never silently declare similar accounts identical.
    // Suspected overlap is a reconciliation warning, not a reason to add both to totals.
    const possibleDuplicates=[];
    for(let i=0;i<accounts.length;i++)for(let j=i+1;j<accounts.length;j++){
      const a=accounts[i],b=accounts[j];
      if(a.source===b.source||a.currency!==b.currency)continue;
      const sameBank=canonical(a.bank)&&canonical(a.bank)===canonical(b.bank);
      const sameName=canonical(a.name)&&canonical(a.name)===canonical(b.name);
      if(sameBank&&sameName){
        possibleDuplicates.push([a.key,b.key]);
        a.possibleDuplicate=true;b.possibleDuplicate=true;
      }
    }
    const synced=Object.values(providerState).filter(x=>x.connected);
    const completedSyncs=synced.filter(x=>Number.isFinite(x.lastSuccess)&&x.lastSuccess>0);
    const lastSuccess=completedSyncs.length?Math.max(...completedSyncs.map(x=>x.lastSuccess)):null;
    return {accounts,transactions,mappings,monitoredAccounts,accountProfiles,balanceHistory,
      providerState,possibleDuplicates,connected:accounts.length>0||synced.length>0,
      configured:Object.values(providerState).some(x=>x.available),
      lastSuccess,sourceCount:synced.length,
      sourceErrors:Object.fromEntries(PROVIDERS.filter(x=>sources[x]?.error).map(x=>[x,sources[x].error]))};
  }
  function safeForSummary(unified){
    const duplicates=new Set(unified.possibleDuplicates.flat());
    // Omitting ambiguous accounts is explicit: consumers must disclose this
    // and must not use the result to claim a complete total/net worth.
    const accounts=unified.accounts.filter(a=>!duplicates.has(a.key));
    const allowed=new Set(accounts.map(a=>a.key));
    const keep=obj=>Object.fromEntries(Object.entries(obj||{}).filter(([k])=>allowed.has(k)));
    return {...unified,accounts,transactions:keep(unified.transactions),mappings:keep(unified.mappings),
      monitoredAccounts:unified.monitoredAccounts.filter(k=>allowed.has(k)),
      accountProfiles:keep(unified.accountProfiles),balanceHistory:keep(unified.balanceHistory),
      incompleteProviders:Object.values(unified.providerState).some(s=>s.connected&&
        (s.stale||!Number.isFinite(s.lastSuccess)||s.lastSuccess<=0)),
      excludedForReview:duplicates.size};
  }
  return Object.freeze({combine,safeForSummary,detectedType,key});
});
