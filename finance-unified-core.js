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
    const name=canonical(account.rawName||account.name);
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
  const DEFAULT_TREATMENT={checking:'asset',savings:'asset',brokerage:'asset',
    retirement:'asset',other_asset:'asset',credit_card:'liability',loan:'liability',
    mortgage:'liability',other_liability:'liability'};
  function bankFamily(value){
    const t=canonical(value).replace(/\\b(jp morgan|jpmorgan|chase national|national association|n a|bank|financial|services|inc|co)\\b/g,' ').replace(/\\s+/g,' ').trim();
    return /\\bchase\\b/.test(canonical(value))?'chase':t;
  }
  function last4(account){
    const raw=String(account.mask||account.last4||'');
    if(/^\\d{4}$/.test(raw))return raw;
    const name=String(account.rawName||account.name||'');
    const matched=name.match(/(?:\\*{2,}|x{2,}|•{2,}|\\bending\\s*(?:in)?\\s*)\\s*(\\d{4})\\b/i);
    return matched?matched[1]:null;
  }
  function sameInstitution(a,b){
    const left=bankFamily(a.bank),right=bankFamily(b.bank);
    return !!left&&!!right&&(left===right||left.includes(right)||right.includes(left));
  }
  function combine(sources={},preferences={}){
    const accounts=[],transactions={},mappings={},monitoredAccounts=[],accountProfiles={},balanceHistory={},flags=[],providerState={};
    for(const source of PROVIDERS){
      const state=sources[source];
      if(!state||!state.connected){providerState[source]={connected:false,available:!!state,stale:false};continue}
      providerState[source]={connected:true,available:true,stale:!!state.stale,lastSuccess:state.lastSuccess||null,
        nextSyncAt:state.nextSyncAt||null,accountCount:(state.accounts||[]).length,
        warningCount:Array.isArray(state.warnings)?state.warnings.length:0,
        needsAttention:state.status==='attention'};
      const accountKeys=new Set();
      for(const account of state.accounts||[]){
        if(!account||typeof account.key!=='string'||!account.key)continue;
        const composite=key(source,account.key);
        if(accountKeys.has(composite))continue;
        accountKeys.add(composite);
        const saved=state.accountProfiles?.[account.key]||{};
        const detected=detectedType(account);
        accounts.push({...account,key:composite,rawKey:account.key,source,sourceLabel:LABELS[source],
          rawName:account.name,name:preferences.accountAliases?.[composite]?.name||account.name,
          detectedType:detected,kind:saved.kind&&saved.kind!=='unclassified'?saved.kind:detected});
        const kind=saved.kind&&saved.kind!=='unclassified'?saved.kind:detected;
        accountProfiles[composite]={kind,balanceMode:saved.balanceMode||DEFAULT_TREATMENT[kind]||'exclude',
          order:Number.isInteger(saved.order)?saved.order:499,hidden:saved.hidden===true};
        if((state.monitoredAccounts||[]).includes(account.key))monitoredAccounts.push(composite);
        if(state.mappings?.[account.key])mappings[composite]=state.mappings[account.key];
        if(Array.isArray(state.balanceHistory?.[account.key]))balanceHistory[composite]=state.balanceHistory[account.key];
        if(state.transactions?.[account.key]&&typeof state.transactions[account.key]==='object'){
          transactions[composite]={};
          for(const [txnKey,row] of Object.entries(state.transactions[account.key])){
            if(!row||typeof row!=='object')continue;
            const identity=row.id||txnKey;
            const meta=preferences.transactionMeta?.[source+':'+account.key+':'+String(identity)]||{};
            transactions[composite][String(txnKey)]={...row,id:identity,source,accountKey:composite,
              merchant:meta.name||row.merchant,note:meta.note||'',
              excludedFromTotals:meta.exclude===true,markedRecurring:meta.markRecurring===true};
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
      const sameName=canonical(a.rawName||a.name)&&canonical(a.rawName||a.name)===canonical(b.rawName||b.name);
      const masked=last4(a)&&last4(a)===last4(b)&&
        a.kind&&b.kind&&a.kind===b.kind&&a.kind!=='unclassified'&&sameInstitution(a,b);
      if(masked||(sameBank&&sameName)){
        possibleDuplicates.push([a.key,b.key]);
        a.possibleDuplicate=true;b.possibleDuplicate=true;
        if(masked){a.confirmableDuplicate=true;b.confirmableDuplicate=true;}
      }
    }
    const synced=Object.values(providerState).filter(x=>x.connected);
    const completedSyncs=synced.filter(x=>Number.isFinite(x.lastSuccess)&&x.lastSuccess>0);
    const lastSuccess=completedSyncs.length?Math.max(...completedSyncs.map(x=>x.lastSuccess)):null;
    return {accounts,transactions,mappings,monitoredAccounts,accountProfiles,balanceHistory,
      duplicateDecisions:preferences.duplicates||{},
      providerState,possibleDuplicates,connected:accounts.length>0||synced.length>0,
      configured:Object.values(providerState).some(x=>x.available),
      lastSuccess,sourceCount:synced.length,
      sourceErrors:Object.fromEntries(PROVIDERS.filter(x=>sources[x]?.error).map(x=>[x,sources[x].error]))};
  }
  function safeForSummary(unified){
    const duplicates=new Set();
    const secondary=new Map();
    for(const pair of unified.possibleDuplicates||[]){
      const id=pair.slice().sort((a,b)=>a.startsWith('simplefin:')?-1:b.startsWith('simplefin:')?1:0).join('|');
      const decision=unified.duplicateDecisions?.[id];
      if(decision?.separate===true){
        // Explicitly confirmed distinct accounts both belong in totals.
      }else if(decision&&pair.includes(decision.primary)){
        secondary.set(pair.find(k=>k!==decision.primary),decision.primary);
      }else pair.forEach(k=>duplicates.add(k));
    }
    // Omitting ambiguous accounts is explicit: consumers must disclose this
    // and must not use the result to claim a complete total/net worth.
    const hidden=new Set(unified.accounts.filter(a=>unified.accountProfiles?.[a.key]?.hidden).map(a=>a.key));
    const accounts=unified.accounts.filter(a=>!duplicates.has(a.key)&&!secondary.has(a.key)&&!hidden.has(a.key));
    const allowed=new Set(accounts.map(a=>a.key));
    const keep=obj=>Object.fromEntries(Object.entries(obj||{}).filter(([k])=>allowed.has(k)));
    // A confirmed duplicate uses one primary account and one balance; unique
    // secondary-provider rows remain visible with their original source keys.
    // Fingerprints require same amount, same local day, and normalized bank text.
    const transactions=keep(unified.transactions);
    for(const [other,primary] of secondary){
      if(!allowed.has(primary))continue;
      const target=transactions[primary]||{};
      const signature=row=>[String(row.amount),Math.floor((row.posted||0)/86400),
        canonical(row.description||row.merchant)].join('|');
      const known=new Set(Object.values(target).map(signature));
      for(const [ident,row] of Object.entries(unified.transactions[other]||{})){
        const sig=signature(row);
        if(known.has(sig))continue;
        known.add(sig);
        target['merged:'+other+':'+ident]={...row,originalAccountKey:other};
      }
      transactions[primary]=target;
    }
    return {...unified,accounts,transactions,mappings:keep(unified.mappings),
      monitoredAccounts:unified.monitoredAccounts.filter(k=>allowed.has(k)),
      accountProfiles:keep(unified.accountProfiles),balanceHistory:keep(unified.balanceHistory),
      incompleteProviders:Object.values(unified.providerState).some(s=>s.connected&&
        (s.stale||s.needsAttention||s.warningCount>0||!Number.isFinite(s.lastSuccess)||s.lastSuccess<=0))||
        Object.keys(unified.sourceErrors||{}).length>0,
      malformedActivity:accounts.some(a=>Number(a.invalidTransactionRows)>0),
      historyIncomplete:accounts.some(a=>a.source==='plaid'&&(
        a.historyComplete===false||
        ['history_still_loading','awaiting_first_sync','awaiting_provider_data','needs_attention'].includes(a.transactionSyncStatus))),
      excludedForReview:duplicates.size,hiddenAccounts:hidden.size,confirmedDuplicates:secondary.size};
  }
  return Object.freeze({combine,safeForSummary,detectedType,key});
});
