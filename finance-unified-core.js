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
    const bank=canonical(account.bank);
    const broker=/\b(robinhood|fidelity|schwab|vanguard|e trade|etrade|interactive brokers|webull|tastytrade|coinbase|kraken)\b/.test(bank);
    const retirement=/\b(?:roth|traditional|ira|401\s*k|401k|retirement)\b/.test(name)||/(?:^|_)(?:roth_?ira|ira|401k|retirement)(?:$|_)/.test(subtype);
    const deposit=/\b(?:checking|current account|cash management|cash account|spend account)\b/.test(name)
      ||['checking','cash_management','cash'].includes(subtype);
    const savings=/\b(?:savings|money market|high yield)\b/.test(name)
      ||['savings','money_market'].includes(subtype);
    if(/\b(?:credit card|charge card)\b/.test(name)||['credit_card','credit'].includes(subtype))return 'credit_card';
    if(deposit)return 'checking';
    if(savings)return 'savings';
    if(retirement)return 'retirement';
    const investments=new Set(['individual','joint','investing','investment','investments','stocks','stock','crypto','securities','trading','brokerage']);
    if(investments.has(subtype)||investments.has(type))return 'brokerage';
    const aliases={depository:'',credit:'credit_card',credit_card:'credit_card',investment:'brokerage',student:'loan',auto:'loan',mortgage:'mortgage',loan:'loan',brokerage:'brokerage',retirement:'retirement','401k':'retirement',ira:'retirement',checking:'checking',savings:'savings',money_market:'savings'};
    if(TYPES.has(subtype))return subtype;
    if(Object.hasOwn(aliases,subtype)&&aliases[subtype])return aliases[subtype];
    if(TYPES.has(type))return type;
    if(Object.hasOwn(aliases,type)&&aliases[type])return aliases[type];
    for(const [pattern,kind] of [[/\b(checking|current account)\b/,'checking'],[/\b(savings|money market|high yield)\b/,'savings'],[/\b(credit card|charge card)\b/,'credit_card'],[/\b(mortgage)\b/,'mortgage'],[/\b(401k|ira|roth|retirement)\b/,'retirement'],[/\b(brokerage|investment)\b/,'brokerage'],[/\b(loan)\b/,'loan']]){
      if(pattern.test(name))return kind;
    }
    // Brokerage brands are investment accounts unless product metadata identifies
    // an actual deposit or credit product; never classify a generic broker as Other.
    if(/\b(?:paypal|venmo|onepay|one pay|x money)\b/.test(bank)&&
       !/\b(?:credit|card|loan|invest|stock|crypto)\b/.test(name)&&
       !['credit','investment','loan'].includes(type))return 'checking';
    if(broker&&!/\b(checking|savings|cash management|credit card|mortgage|loan)\b/.test(name)
        && !['depository','credit'].includes(type))return 'brokerage';
    return 'unclassified';
  }
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
    const accounts=[],transactions={},mappings={},monitoredAccounts=[],accountProfiles={},balanceHistory={},evidenceReviews={},missingAccounts=[],flags=[],providerState={};
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
        accountProfiles[composite]={kind,syncEnabled:saved.syncEnabled!==false,
          // An old auto-generated unclassified exclusion is not a user opt-out.
          // Preserve explicit saved selections made for a recognized account type.
          balanceMode:(saved.kind&&saved.kind!=='unclassified')
            ?(saved.balanceMode||DEFAULT_TREATMENT[kind]||'exclude')
            :(DEFAULT_TREATMENT[kind]||saved.balanceMode||'exclude'),
          order:Number.isInteger(saved.order)?saved.order:499,hidden:saved.hidden===true,
          removed:!!account.removedAt,includeSpending:saved.includeSpending??['checking','savings','credit_card'].includes(kind)};
        if((state.monitoredAccounts||[]).includes(account.key))monitoredAccounts.push(composite);
        if(state.mappings?.[account.key])mappings[composite]=state.mappings[account.key];
        if(state.evidenceReviews?.[account.key])evidenceReviews[composite]=state.evidenceReviews[account.key];
        if((state.missingAccounts||[]).includes(account.key))missingAccounts.push(composite);
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
    return {accounts,transactions,mappings,monitoredAccounts,accountProfiles,balanceHistory,evidenceReviews,missingAccounts,
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
      if(pair.some(key=>unified.accountProfiles?.[key]?.syncEnabled===false||unified.accountProfiles?.[key]?.hidden))continue;
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
    const hidden=new Set(unified.accounts.filter(a=>unified.accountProfiles?.[a.key]?.hidden||
      unified.accountProfiles?.[a.key]?.syncEnabled===false).map(a=>a.key));
    const accounts=unified.accounts.filter(a=>!duplicates.has(a.key)&&!secondary.has(a.key)&&!hidden.has(a.key));
    const allowed=new Set(accounts.map(a=>a.key));
    const keep=obj=>Object.fromEntries(Object.entries(obj||{}).filter(([k])=>allowed.has(k)));
    // A confirmed duplicate uses one primary account and one balance; unique
    // secondary-provider rows remain visible with their original source keys.
    // Fingerprints require same amount, same local day, and normalized bank text.
    const Transfer=typeof window!=='undefined'?window.BTFinanceTransfer:typeof require==='function'?require('./finance-transfer-core.js'):null;
    const banks=new Map(unified.accounts.map(account=>[account.key,account.bank||'']));
    // Provider rows do not carry their account's bank. Add it to the read-only
    // unified projection so a generic Plaid "Payment" at X Money can be held
    // neutral while SimpleFIN's opposite leg arrives on a later sync.
    const transactions=Object.fromEntries(Object.entries(keep(unified.transactions)).map(([k,v])=>
      [k,Object.fromEntries(Object.entries(v).map(([id,row])=>{
        const enriched={...row,bank:banks.get(k)||'',signals:[...(row.signals||[])]};
        return [id,Transfer?Transfer.effective(enriched):enriched];
      }))]));
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
    // Rebuild cross-provider pairings on every projection. Plaid and SimpleFIN
    // may arrive days apart; no extra sync, persistent provider mutation, or
    // assumption based on a merchant name is needed. Match each direction
    // uniquely by exact cents and at most three days. Preserve manual reviews.
    const transferRows=[];
    const nonTransfers=new Set(['groceries','dining','shopping','housing','utilities',
      'transportation','health','entertainment','fees','taxes','travel','subscription','loan']);
    const toCents=value=>{
      const m=/^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value??'').trim());
      if(!m)return null;
      let v=BigInt(m[2])*100n+BigInt((m[3]||'').padEnd(2,'0')||'0');
      return m[1]==='-'?-v:v;
    };
    for(const [key,rows] of Object.entries(transactions)){
      for(const row of Object.values(rows)){
        const value=toCents(row.amount);
        const description=[row.merchant,row.description].filter(Boolean).join(' ');
        const payroll=/\b(?:schreiber(?:\s+foods)?|payroll|paycheck|salary|wages?|employer\s+direct\s+deposit)\b/i.test(description);
        if(row.pending||value===null||value===0n||
          !Number.isFinite(row.posted)||['user','user_rule'].includes(row.categorySource)||
          ['bonus','refund','verification'].includes(row.category)||
          (row.signals||[]).some(x=>['paycheck','possible_direct_deposit','possible_bonus','possible_refund'].includes(x))||
          payroll)continue;
        // Equal-valued unrelated purchases and deposits are not proof of a
        // self-transfer. Preserve known household expenses and ordinary income.
        const directMovement=/\b(?:internal\s+(?:sweep|transfer|move)|outgoing\s+ach|ach\s+transfer|to\s+(?:bank|checking|savings))\b/i.test(description);
        if(value<0n&&nonTransfers.has(row.category)&&!directMovement)continue;
        // Ordinary income can be a competing candidate, preventing a false
        // unique match, but must never itself be auto-classified as transfer.
        const matchable=!(value>0n&&row.category==='income'&&!(row.signals||[]).some(signal=>
          ['possible_transfer','transfer','plaid_transfer','investment_transfer'].includes(signal)));
        transferRows.push({account:key,row,value,matchable});
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
      if(j<=i||matches[j].length!==1||matches[j][0]!==i||
        !transferRows[i].matchable||!transferRows[j].matchable)continue;
      const pairId=['internal',transferRows[i].account,transferRows[j].account,
        String(transferRows[i].row.id),String(transferRows[j].row.id)].join(':');
      const investments=key=>['brokerage','retirement'].includes(unified.accountProfiles?.[key]?.kind);
      const investmentMove=investments(transferRows[i].account)||investments(transferRows[j].account);
      for(const index of [i,j]){
        const other=index===i?j:i;
        const row=transferRows[index].row;
        row.category='transfer';row.confidence='high';
        row.transferPairId=pairId;row.transferOtherAccountKey=transferRows[other].account;
        row.signals=[...new Set([...(row.signals||[]),'matched_internal_transfer',
          ...(investmentMove?['investment_transfer']:[])])];
      }
    }
    for(const [key, rows] of Object.entries(transactions)){
      if(unified.accountProfiles?.[key]?.includeSpending===false||
         ['brokerage','retirement'].includes(unified.accountProfiles?.[key]?.kind)){
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
      excludedForReview:duplicates.size,
      hiddenAccounts:unified.accounts.filter(a=>unified.accountProfiles?.[a.key]?.hidden).length,
      notSyncingAccounts:unified.accounts.filter(a=>unified.accountProfiles?.[a.key]?.syncEnabled===false).length,
      confirmedDuplicates:secondary.size};
  }
  return Object.freeze({combine,safeForSummary,detectedType,key});
});
