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
  const DEBTS=new Set(['credit_card','loan','mortgage','other_liability']);
  const ASSETS=new Set(['checking','savings','brokerage','retirement','other_asset']);
  function defaultBalanceMode(kind){
    return DEBTS.has(kind)?'liability':ASSETS.has(kind)?'asset':'exclude';
  }
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
        accountProfiles[composite]={kind,balanceMode:saved.balanceMode||defaultBalanceMode(kind),
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
  // Pair uniquely reciprocal posted movements across providers, without
  // changing raw observations or overriding user-confirmed categories.
  function matchedTransfers(transactions){
    const result=Object.fromEntries(Object.entries(transactions).map(([account,records])=>
      [account,Object.fromEntries(Object.entries(records).map(([id,row])=>[id,{...row}]))]));
    const entries=[],amounts=new Map();
    const transferWords=/\b(?:transfer|xfer)\b|\b(?:credit card|card) payment\b|\bpayment (?:thank you|to|from)\b/i;
    function strictCents(value){
      const m=/^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value??''));
      if(!m)return null;
      const n=BigInt(m[2])*100n+BigInt((m[3]||'').padEnd(2,'0')||'0');
      return m[1]==='-'?-n:n;
    }
    for(const [account,records] of Object.entries(result)){
      for(const row of Object.values(records)){
        if(!row||typeof row!=='object')continue;
        const amount=strictCents(row.amount);
        if(row.pending||row.categorySource==='user'||!Number.isFinite(row.posted)||
            amount===null||amount===0n||row.category==='bonus'||
            row.kind==='possible_bonus'||row.kind==='possible_reversal')continue;
        const signal=Array.isArray(row.signals)&&row.signals.includes('possible_transfer');
        const hinted=signal||transferWords.test(String(row.description||''));
        entries.push({account,row,amount,hinted});
        const bucket=String(amount<0n?-amount:amount);
        if(!amounts.has(bucket))amounts.set(bucket,{positive:[],negative:[]});
        amounts.get(bucket)[amount>0n?'positive':'negative'].push(entries.length-1);
      }
    }
    const partners=new Map();
    for(const bucket of amounts.values())for(const plus of bucket.positive)for(const minus of bucket.negative){
      const p=entries[plus],m=entries[minus];
      if(p.account===m.account||Math.abs(p.row.posted-m.row.posted)>3*86400||
          !(p.hinted||m.hinted))continue;
      if(!partners.has(plus))partners.set(plus,[]);
      if(!partners.has(minus))partners.set(minus,[]);
      partners.get(plus).push(minus);partners.get(minus).push(plus);
    }
    for(const [i,others] of partners){
      if(others.length!==1)continue;
      const j=others[0];
      if(j<=i||partners.get(j)?.length!==1||partners.get(j)[0]!==i)continue;
      for(const idx of [i,j]){
        const row=entries[idx].row;
        row.category='transfer';
        row.signals=[...new Set([...(Array.isArray(row.signals)?row.signals:[]),'matched_internal_transfer'])];
      }
    }
    // An automatic wording-only transfer is not a verified internal movement.
    // Keep it in the review queue unless the backend or this adapter paired it.
    for(const entry of entries){
      const row=entry.row;
      if(row.category==='transfer'&&row.categorySource!=='user'&&
          !(Array.isArray(row.signals)&&row.signals.includes('matched_internal_transfer'))){
        row.category='unreviewed';
      }
    }
    return result;
  }
  function safeForSummary(unified){
    const duplicates=new Set(unified.possibleDuplicates.flat());
    // Omitting ambiguous accounts is explicit: consumers must disclose this
    // and must not use the result to claim a complete total/net worth.
    const accounts=unified.accounts.filter(a=>!duplicates.has(a.key));
    const allowed=new Set(accounts.map(a=>a.key));
    const keep=obj=>Object.fromEntries(Object.entries(obj||{}).filter(([k])=>allowed.has(k)));
    return {...unified,accounts,transactions:matchedTransfers(keep(unified.transactions)),mappings:keep(unified.mappings),
      monitoredAccounts:unified.monitoredAccounts.filter(k=>allowed.has(k)),
      accountProfiles:keep(unified.accountProfiles),balanceHistory:keep(unified.balanceHistory),
      incompleteProviders:Object.values(unified.providerState).some(s=>s.connected&&
        (s.stale||!Number.isFinite(s.lastSuccess)||s.lastSuccess<=0)),
      excludedForReview:duplicates.size};
  }
  return Object.freeze({combine,safeForSummary,detectedType,defaultBalanceMode,key});
});
