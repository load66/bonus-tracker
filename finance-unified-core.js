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
    const name=canonical(account.name),bank=canonical(account.bank);
    const combined=name+' '+subtype.replaceAll('_',' ');
    // Explicit provider metadata and product names are stronger than brand.
    if(type==='credit'||type==='credit_card'||subtype==='credit_card'||/\b(credit card|charge card)\b/.test(name))return 'credit_card';
    if(type==='loan'||['loan','mortgage','student','auto'].includes(subtype)||/\b(mortgage|vehicle loan|auto loan)\b/.test(name))
      return /mortgage/.test(combined)?'mortgage':'loan';
    if(/\b(checking|current account|spend account)\b/.test(combined)||subtype==='checking')return 'checking';
    if(/\b(savings|money market|high yield|cash management)\b/.test(combined)||
       ['savings','money_market','cash_management'].includes(subtype))return subtype==='cash_management'?'checking':'savings';
    if(/\b(roth\s*ira|traditional\s*ira|retirement|401\s*k|401k|403b|pension|sep\s*ira)\b/.test(combined)
        ||['ira','roth_ira','401k','retirement','401a','403b'].includes(subtype))return 'retirement';
    if(/\b(hsa)\b/.test(combined)&&/\b(invest|brokerage|stock)\b/.test(combined))return 'brokerage';
    const investments=new Set(['individual','joint','investing','investment','investments','stocks','stock',
      'crypto','securities','trading','brokerage']);
    if(investments.has(subtype)||investments.has(type)||/\b(brokerage|stocks|investing|investments|crypto)\b/.test(combined))
      return 'brokerage';
    const broker=/\b(robinhood|fidelity|schwab|vanguard|e trade|etrade|webull|coinbase|kraken|interactive brokers)\b/.test(bank);
    if(broker&&type!=='depository'&&type!=='credit'&&!/\b(cash|checking|savings|card|loan|mortgage)\b/.test(name))
      return 'brokerage';
    if(/\b(paypal|venmo|cash app|wallet)\b/.test(combined)&&/\b(balance|wallet|cash)\b/.test(name+' '+type+' '+subtype))return 'other_asset';
    if(type==='depository')return /saving|money market/.test(name)?'savings':'checking';
    if(TYPES.has(subtype))return subtype;
    if(TYPES.has(type))return type;
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
    const accounts=[],transactions={},mappings={},monitoredAccounts=[],accountProfiles={},balanceHistory={},flags=[],providerState={};
    for(const source of PROVIDERS){
      const state=sources[source];
      if(!state||!state.connected){providerState[source]={connected:false,available:!!state,stale:false};continue}
      providerState[source]={connected:true,available:true,stale:!!state.stale,lastSuccess:state.lastSuccess||null,
        nextSyncAt:state.nextSyncAt||null,accountCount:(state.accounts||[]).length,
        warningCount:Array.isArray(state.warnings)?state.warnings.filter(w=>
          !/date range|capped|partial data|history (?:may be|is) incomplete/i.test(String(w))).length:0,
        needsAttention:state.status==='attention'&&(
          source!=='simplefin'||Boolean(state.providerHealth)||
          (state.accounts||[]).some(a=>a.institutionStatus==='needs_attention')||
          Boolean(state.error)||Boolean((state.missingAccounts||[]).length))};
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
        const autoLegacyExclusion=saved.balanceMode==='exclude'&&saved.balanceModeUserSet!==true&&
          (!saved.kind||saved.kind==='unclassified')&&Boolean(DEFAULT_TREATMENT[kind]);
        accountProfiles[composite]={kind,
          balanceMode:autoLegacyExclusion?DEFAULT_TREATMENT[kind]:
            (saved.balanceMode||DEFAULT_TREATMENT[kind]||'exclude'),
          balanceModeUserSet:saved.balanceModeUserSet===true,
          order:Number.isInteger(saved.order)?saved.order:499,hidden:saved.hidden===true,
          removed:!!account.removedAt,includeSpending:!INVESTMENT_TYPES.has(kind)&&
            (saved.includeSpending??['checking','credit_card','savings'].includes(kind))};
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
    // Reconcile reciprocal movements across any two distinct linked accounts,
    // including same-bank and cross-provider pairs of non-round exact amounts.
    // Never mutate provider evidence or confirmed user categories.
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
      if(unified.accountProfiles?.[key]?.includeSpending===false){
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
  const INVESTMENT_TYPES=new Set(['brokerage','retirement']);
  function ledgerRows(rows,options={}){
    const scope=options.scope||'cash_cards',search=String(options.search||'').toLowerCase().trim();
    const candidates=(rows||[]).filter(row=>{
      if(!row||!row.account)return false;
      const kind=row.account.kind||row.account.detectedType||'unclassified';
      const investment=INVESTMENT_TYPES.has(kind);
      const transfer=row.category==='transfer'||(row.signals||[]).some(v=>['matched_internal_transfer','investment_transfer','card_payment'].includes(v));
      if(scope==='cash_cards'&&investment)return false;
      if(scope==='investments'&&!investment)return false;
      if(scope==='transfers'&&!transfer)return false;
      if(scope==='uncategorized'&&row.category!=='unreviewed')return false;
      if(scope==='pending'&&!row.pending)return false;
      if(search&&!['merchant','description','note','amount'].some(k=>String(row[k]||'').toLowerCase().includes(search))
       &&!String(row.account.name||'').toLowerCase().includes(search))return false;
      if(options.account&&row.accountKey!==options.account)return false;
      if(options.category&&row.category!==options.category)return false;
      if(options.status&&Boolean(row.pending)!==(options.status==='pending'))return false;
      if(Number.isFinite(options.from)&&row.posted<options.from)return false;
      if(Number.isFinite(options.to)&&row.posted>options.to)return false;
      const magnitude=Math.abs(Number(row.amount));
      if(options.min!==undefined&&options.min!==''&&magnitude<Number(options.min))return false;
      if(options.max!==undefined&&options.max!==''&&magnitude>Number(options.max))return false;
      return true;
    }).sort((a,b)=>b.posted-a.posted);
    const byAmount=new Map();
    for(let index=0;index<candidates.length;index++){
      const row=candidates[index];
      if(row.pending||!(row.signals||[]).includes('matched_internal_transfer'))continue;
      const amt=String(row.amount),m=/^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(amt);
      if(!m)continue;
      const cents=(m[1]==='-'?-1n:1n)*(BigInt(m[2])*100n+BigInt((m[3]||'').padEnd(2,'0')||'0'));
      if(!cents)continue;
      const amount=cents<0n?-cents:cents,k=String(amount);
      if(!byAmount.has(k))byAmount.set(k,[]);
      byAmount.get(k).push({index,cents});
    }
    const suppress=new Set(),linked=new Map();
    for(const members of byAmount.values()){
      const proposed=new Map();
      for(const a of members){
        const from=candidates[a.index];
        const targets=members.filter(b=>b.index!==a.index&&a.cents===-b.cents&&
          from.accountKey!==candidates[b.index].accountKey&&
          Math.abs(from.posted-candidates[b.index].posted)<=3*86400);
        proposed.set(a.index,targets.map(v=>v.index));
      }
      for(const a of members){
        const matches=proposed.get(a.index)||[];
        if(matches.length!==1)continue;
        const b=matches[0];
        if((proposed.get(b)||[]).length!==1||(proposed.get(b)||[])[0]!==a.index)continue;
        if(suppress.has(a.index)||suppress.has(b))continue;
        const left=candidates[a.index],right=candidates[b];
        const preferred=Number(left.amount)<0?a.index:b;
        const other=preferred===a.index?b:a.index;
        suppress.add(other);linked.set(preferred,candidates[other]);
      }
    }
    return candidates.flatMap((row,i)=>{
      if(suppress.has(i))return [];
      const paired=linked.get(i);
      if(!paired)return [row];
      return [{...row,pairedSide:paired,transferSides:[row,paired],transferSummary:
        (Number(row.amount)<0?row.account:paired.account).name+' → '+
        (Number(row.amount)<0?paired.account:row.account).name}];
    });
  }
  return Object.freeze({combine,safeForSummary,detectedType,ledgerRows,key});
});
