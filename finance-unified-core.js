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
  const four=account=>{
    const mask=String(account.mask||'');
    if(/^\\d{4}$/.test(mask))return mask;
    return String(account.name||'').match(/(?<!\\d)(\\d{4})$/)?.[1]||null;
  };
  const bankTokens=name=>new Set(canonical(name).split(' ').filter(x=>x&&
    !['bank','banking','jpmorgan','financial','national','association','the','na','inc','llc','services'].includes(x)));
  function sameInstitution(a,b){
    const first=bankTokens(a.bank),second=bankTokens(b.bank);
    return first.size>0&&[...first].some(x=>second.has(x));
  }
  function sameAccountCandidate(a,b){
    return a.source!==b.source&&a.currency===b.currency&&
      four(a)!==null&&four(a)===four(b)&&a.kind!=='unclassified'&&
      a.kind===b.kind&&sameInstitution(a,b);
  }
  const txCents=v=>{
    const match=/^(-?)(\\d+)(?:\\.(\\d{1,2}))?$/.exec(String(v??''));
    return match?(match[1]==='-'?'-':'')+match[2]+'.'+String(match[3]||'').padEnd(2,'0'):null;
  };
  function sameTransaction(a,b){
    if(a.pending!==b.pending||!Number.isFinite(a.posted)||!Number.isFinite(b.posted)||
       Math.abs(a.posted-b.posted)>2*86400||txCents(a.amount)===null||
       txCents(a.amount)!==txCents(b.amount))return false;
    const words=t=>canonical(t).split(' ').filter(x=>x.length>2&&!/^[0-9]+$/.test(x)&&
      !['transaction','payment','purchase','pos','debit','credit','pending'].includes(x));
    const aa=words(a.description||a.merchant),bb=words(b.description||b.merchant);
    return aa.length>0&&bb.length>0&&aa.some(x=>bb.includes(x));
  }
  function mergePairTransactions(primaryRows={},alternateRows={},primaryKey,otherKey){
    const merged={};
    const originals=Object.entries(primaryRows||{}).filter(([,v])=>v&&typeof v==='object');
    for(const [key,row] of originals)merged[key]={...row,originAccountKey:primaryKey};
    const secondary=Object.entries(alternateRows||{}).filter(([,v])=>v&&typeof v==='object');
    const consumed=new Set();
    for(const [id,row] of secondary){
      const found=originals.find(([k,pr])=>!consumed.has(k)&&sameTransaction(pr,row));
      if(found){consumed.add(found[0]);continue}
      merged[otherKey+':'+id]={...row,originAccountKey:otherKey};
    }
    return merged;
  }
  function combine(sources={}){
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
          detectedType:detected,kind:saved.kind&&saved.kind!=='unclassified'?saved.kind:detected});
        const kind=saved.kind&&saved.kind!=='unclassified'?saved.kind:detected;
        accountProfiles[composite]={kind,balanceMode:saved.balanceMode||'exclude',
          order:Number.isInteger(saved.order)?saved.order:499,hidden:saved.hidden===true};
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
    // Suggest by last four, type, and normalized institution aliases. Matching
    // is *never* sufficient to combine until the owner confirms the pair.
    const possibleDuplicates=[],confirmedPairs=[];
    const savedLinks=sources.plaid?.accountLinks||{};
    for(let i=0;i<accounts.length;i++)for(let j=i+1;j<accounts.length;j++){
      const a=accounts[i],b=accounts[j];
      if(!sameAccountCandidate(a,b))continue;
      const sf=a.source==='simplefin'?a:b,pl=a.source==='plaid'?a:b;
      const link=Object.values(savedLinks).find(x=>x&&x.simplefin===sf.rawKey&&
        x.plaid===pl.rawKey&&['simplefin','plaid'].includes(x.primary));
      if(link)confirmedPairs.push({simplefin:sf.key,plaid:pl.key,
        primary:link.primary==='simplefin'?sf.key:pl.key,
        secondary:link.primary==='simplefin'?pl.key:sf.key});
      else {
        possibleDuplicates.push([a.key,b.key]);
        a.possibleDuplicate=true;b.possibleDuplicate=true;
      }
    }
    const synced=Object.values(providerState).filter(x=>x.connected);
    const completedSyncs=synced.filter(x=>Number.isFinite(x.lastSuccess)&&x.lastSuccess>0);
    const lastSuccess=completedSyncs.length?Math.max(...completedSyncs.map(x=>x.lastSuccess)):null;
    return {accounts,transactions,mappings,monitoredAccounts,accountProfiles,balanceHistory,
      providerState,possibleDuplicates,confirmedPairs,connected:accounts.length>0||synced.length>0,
      configured:Object.values(providerState).some(x=>x.available),
      lastSuccess,sourceCount:synced.length,
      sourceErrors:Object.fromEntries(PROVIDERS.filter(x=>sources[x]?.error).map(x=>[x,sources[x].error]))};
  }
  function safeForSummary(unified){
    const duplicates=new Set((unified.possibleDuplicates||[]).flat());
    const hidden=new Set(unified.accounts.filter(a=>unified.accountProfiles?.[a.key]?.hidden).map(a=>a.key));
    const secondary=new Set((unified.confirmedPairs||[]).map(p=>p.secondary));
    // Never present double balances; only the explicitly chosen primary account
    // participates in assets, liabilities and cash.
    const accounts=unified.accounts.filter(a=>!duplicates.has(a.key)&&
      !hidden.has(a.key)&&!secondary.has(a.key));
    const allowed=new Set(accounts.map(a=>a.key));
    const keep=obj=>Object.fromEntries(Object.entries(obj||{}).filter(([k])=>allowed.has(k)));
    const merged={...unified.transactions},display={...unified.transactions};
    let uncertainReconciliation=false;
    for(const pair of unified.confirmedPairs||[]){
      if(hidden.has(pair.primary)||hidden.has(pair.secondary))continue;
      const primaryRows=unified.transactions?.[pair.primary]||{};
      const secondaryRows=unified.transactions?.[pair.secondary]||{};
      const primaryItems=Object.values(primaryRows);
      for(const row of Object.values(secondaryRows)){
        if(!row||typeof row!=='object')continue;
        if(primaryItems.some(x=>x&&txCents(x.amount)===txCents(row.amount)&&
          Number.isFinite(x.posted)&&Number.isFinite(row.posted)&&
          Math.abs(x.posted-row.posted)<=2*86400&&!sameTransaction(x,row))){
          // Same amount/day with different descriptions is ambiguous: show
          // unique observed activity but never claim complete reconciliation.
          uncertainReconciliation=true;
        }
      }
      merged[pair.primary]=mergePairTransactions(primaryRows,secondaryRows,pair.primary,pair.secondary);
      display[pair.primary]=merged[pair.primary];
      delete display[pair.secondary];
    }
    for(const key of hidden)delete display[key];
    return {...unified,accounts,
      transactions:keep(merged),
      listTransactions:display,
      mappings:keep(unified.mappings),
      monitoredAccounts:unified.monitoredAccounts.filter(k=>allowed.has(k)),
      accountProfiles:keep(unified.accountProfiles),balanceHistory:keep(unified.balanceHistory),
      incompleteProviders:Object.values(unified.providerState).some(s=>s.connected&&
        (s.stale||s.needsAttention||s.warningCount>0||!Number.isFinite(s.lastSuccess)||s.lastSuccess<=0))||
        Object.keys(unified.sourceErrors||{}).length>0,
      malformedActivity:accounts.some(a=>Number(a.invalidTransactionRows)>0),
      historyIncomplete:accounts.some(a=>a.source==='plaid'&&(
        a.historyComplete===false||
        ['history_still_loading','awaiting_first_sync','awaiting_provider_data','needs_attention'].includes(a.transactionSyncStatus))),
      uncertainReconciliation,excludedForReview:duplicates.size,hiddenAccounts:hidden.size,
      confirmedAccountPairs:(unified.confirmedPairs||[]).length
    };
  }
  return Object.freeze({combine,safeForSummary,detectedType,key});
});
