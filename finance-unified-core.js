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
    const subtype=canonical(account.accountSubtype).replaceAll(' ','_'),type=canonical(account.accountType).replaceAll(' ','_');
    const name=canonical(account.name),bank=canonical(account.bank);
    const broker=/\b(robinhood|fidelity|schwab|vanguard|e trade|etrade|interactive brokers|webull|tastytrade|coinbase|kraken)\b/.test(bank);
    // Product evidence outranks generic investment subtype; manual saved kind wins in combine().
    if(/\b(credit card|charge card)\b/.test(name)||subtype==='credit_card'||type==='credit_card'||type==='credit')return 'credit_card';
    if(/\b(mortgage|home loan)\b/.test(name)||subtype==='mortgage')return 'mortgage';
    if(/\b(loan|line of credit)\b/.test(name)||['loan','student','auto'].includes(subtype))return 'loan';
    if(/\b(checking|cash management|cash account|spend account|current account)\b/.test(name)||
       ['checking','cash_management','cash'].includes(subtype))return 'checking';
    if(/\b(savings|money market|high yield)\b/.test(name)||
       ['savings','money_market','money_market_fund'].includes(subtype))return 'savings';
    if(/\b(roth|traditional ira|sep ira|simple ira|ira|401k|401 k|403b|retirement|pension)\b/.test(name)||
       ['retirement','ira','roth','roth_ira','401k','401_k','403b'].includes(subtype))return 'retirement';
    if(/\b(brokerage|investments?|investing|stocks?|crypto)\b/.test(name)||
       ['individual','joint','investing','investment','investments','stocks','stock','crypto','securities','trading','brokerage','hsa_investing'].includes(subtype)||
       ['investment','investments','brokerage','crypto'].includes(type))return 'brokerage';
    if(broker&&type!=='depository')return 'brokerage';
    return 'unclassified';
  }
  const investmentKind=kind=>kind==='brokerage'||kind==='retirement';
  const cashKind=kind=>kind==='checking'||kind==='savings';
  const key=(source,rawKey)=>source+':'+String(rawKey);
  const DEFAULT_TREATMENT={checking:'asset',savings:'asset',brokerage:'asset',
    retirement:'asset',other_asset:'asset',credit_card:'liability',loan:'liability',
    mortgage:'liability',other_liability:'liability'};
  function bankFamily(value){
    const t=canonical(value).replace(/\b(jp morgan|jpmorgan|chase national|national association|n a|bank|financial|services|inc|co)\b/g,' ').replace(/\s+/g,' ').trim();
    return /\bchase\b/.test(canonical(value))?'chase':t;
  }
  function last4(account){
    const raw=String(account.mask||account.last4||'');
    if(/^\d{4}$/.test(raw))return raw;
    const name=String(account.name||'');
    const matched=name.match(/(?:\*{2,}|x{2,}|•{2,}|\bending\s*(?:in)?\s*)\s*(\d{4})\b/i);
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
          detectedType:detected,kind:saved.kind&&saved.kind!=='unclassified'?saved.kind:detected,
          name:saved.displayName||account.name,originalName:account.name});
        const kind=saved.kind&&saved.kind!=='unclassified'?saved.kind:detected;
        accountProfiles[composite]={kind,balanceMode:saved.balanceMode||DEFAULT_TREATMENT[kind]||'exclude',
          order:Number.isInteger(saved.order)?saved.order:499,hidden:saved.hidden===true,
          removed:!!account.removedAt,includeSpending:saved.includeSpending??['checking','savings','credit_card'].includes(kind)};
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
      const sameName=canonical(a.name)&&canonical(a.name)===canonical(b.name);
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
    const transactions=Object.fromEntries(Object.entries(keep(unified.transactions)).map(([k,v])=>[k,Object.fromEntries(Object.entries(v).map(([id,row])=>[id,{...row,signals:[...(row.signals||[])]}]))]));
    for(const [other,primary] of secondary){
      if(!allowed.has(primary))continue;
      const target=transactions[primary]||{};
      const signature=row=>{const d=new Date((row.posted||0)*1000),m=/^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(row.amount)),value=m?(m[1]==='-'?'-':'')+String(BigInt(m[2])*100n+BigInt((m[3]||'').padEnd(2,'0')||0)):String(row.amount);return [value,
        d.getFullYear(),d.getMonth(),d.getDate(),row.pending===true,canonical(row.description||row.merchant)].join('|')};
      const known=new Map();
      for(const row of Object.values(target)){const sig=signature(row);known.set(sig,(known.get(sig)||0)+1)}
      for(const [ident,row] of Object.entries(unified.transactions[other]||{})){
        const sig=signature(row),count=known.get(sig)||0;
        if(count){known.set(sig,count-1);continue}
        target['merged:'+other+':'+ident]={...row,originalAccountKey:other};
      }
      transactions[primary]=target;
    }
    // Reconcile unique, reciprocal account movements without mutating provider
    // evidence. Pair each debit to exactly one credit in another linked account,
    // within three days, even for cents, regardless of bank or provider. Preserve user corrections.
    const transferRows=[];
    const toCents=value=>{
      const m=/^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value??'').trim());
      if(!m)return null;
      let v=BigInt(m[2])*100n+BigInt((m[3]||'').padEnd(2,'0')||'0');
      return m[1]==='-'?-v:v;
    };
    for(const [key,rows] of Object.entries(transactions)){
      for(const row of Object.values(rows)){
        const value=toCents(row.amount);
        if(row.pending||value===null||value===0n||
          !Number.isFinite(row.posted)||['user','user_rule'].includes(row.categorySource))continue;
        transferRows.push({account:key,row,value});
      }
    }
    const matches=transferRows.map((left,i)=>transferRows.flatMap((right,j)=>{
      if(i===j||left.account===right.account||left.value!==-right.value||
         Math.abs(left.row.posted-right.row.posted)>3*86400)return [];
      return [j];
    }));
    for(let i=0;i<matches.length;i++){
      if(matches[i].length!==1)continue;
      const j=matches[i][0];
      if(j<=i||matches[j].length!==1||matches[j][0]!==i)continue;
      for(const index of [i,j]){
        const row=transferRows[index].row;
        row.category='transfer';row.confidence='high';
        row.signals=[...new Set([...(row.signals||[]),'matched_internal_transfer'])];
      }
    }
    for(const [key, rows] of Object.entries(transactions)){
      if(unified.accountProfiles?.[key]?.includeSpending===false||
         investmentKind(unified.accountProfiles?.[key]?.kind)){
        transactions[key]=Object.fromEntries(Object.entries(rows).map(([i,row])=>[i,{...row,excludedFromTotals:true}]));
      }
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
  // Presentation-only classification. Source rows and their review receipts are immutable.
  function investmentActivity(row){
    if(!investmentKind(row?.accountKind||row?.account?.kind||''))return null;
    const description=String(row.description||row.merchant||'');
    if(/\bdividend\b/i.test(description))return 'Dividend';
    if(/\binterest\b/i.test(description))return 'Interest';
    if(/\b(?:buy|bought|purchase of shares)\b/i.test(description))return 'Buy';
    if(/\b(?:sell|sold)\b/i.test(description))return 'Sell';
    if(/\b(?:deposit|contribution|contribute|funding)\b/i.test(description))return 'Contribution';
    return 'Investment activity';
  }
  function transactionFeed(records,scope='cash_cards'){
    const rows=(records||[]).filter(row=>row&&!row.account?.removedAt);
    const group=kind=>investmentKind(kind)?'investment':(cashKind(kind)||kind==='credit_card'?'cash_cards':'other');
    const enriched=rows.map((row,i)=>({...row,accountKind:row.accountKind||row.account?.kind||'',
      originalIndex:i}));const used=new Set(),combined=[];
    const cents=value=>{
      const v=/^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value??''));
      if(!v)return null;let out=BigInt(v[2])*100n+BigInt((v[3]||'').padEnd(2,'0')||'0');
      return v[1]==='-'?-out:out;
    };
    // Collapse only unambiguous reciprocal account transfers; never merge
    // multiple equal payments or user-corrected merchant spending.
    const candidates=enriched.map((row,i)=>({row,i,amount:cents(row.amount)}));
    for(const x of candidates){
      if(used.has(x.i))continue;
      const eligible=x.amount!==null&&x.amount!==0n&&!x.row.pending&&
        (x.row.category==='transfer'||(x.row.signals||[]).includes('matched_internal_transfer'));
      if(!eligible){combined.push(x.row);continue}
      const others=candidates.filter(y=>y.i!==x.i&&y.row.accountKey!==x.row.accountKey&&
        !used.has(y.i)&&!y.row.pending&&y.amount===-x.amount&&
        Math.abs(y.row.posted-x.row.posted)<=3*86400&&
        (y.row.category==='transfer'||(y.row.signals||[]).includes('matched_internal_transfer')));
      if(others.length!==1){combined.push(x.row);continue}
      const counterpart=others[0],opposites=candidates.filter(y=>y.i!==counterpart.i&&
        y.row.accountKey!==counterpart.row.accountKey&&y.amount===-counterpart.amount&&
        Math.abs(y.row.posted-counterpart.row.posted)<=3*86400&&
        (y.row.category==='transfer'||(y.row.signals||[]).includes('matched_internal_transfer')));
      if(opposites.length!==1||opposites[0].i!==x.i){combined.push(x.row);continue}
      const outgoing=x.amount<0n?x.row:counterpart.row,incoming=x.amount>0n?x.row:counterpart.row;
      used.add(x.i);used.add(counterpart.i);
      combined.push({...outgoing,pairedWith:incoming,mergedTransfer:true,category:'transfer',
        merchant:(outgoing.account?.name||'Account')+' → '+(incoming.account?.name||'Account')});
    }
    const filtered=combined.filter(row=>{
      const category=String(row.category||'unreviewed');
      const movement=category==='transfer'||(row.signals||[]).includes('matched_internal_transfer');
      const inv=investmentKind(row.accountKind),linkedInv=investmentKind(row.pairedWith?.accountKind||row.pairedWith?.account?.kind||'');
      if(scope==='all')return true;
      if(scope==='investments')return inv||linkedInv;
      if(scope==='transfers')return movement;
      if(scope==='uncategorized')return category==='unreviewed'&&!movement&&!inv;
      if(scope==='pending')return row.pending===true;
      return group(row.accountKind)==='cash_cards'||group(row.pairedWith?.accountKind||'')==='cash_cards';
    });
    return filtered.sort((a,b)=>b.posted-a.posted||a.originalIndex-b.originalIndex);
  }
  return Object.freeze({combine,safeForSummary,detectedType,investmentKind,cashKind,investmentActivity,transactionFeed,key});
});
