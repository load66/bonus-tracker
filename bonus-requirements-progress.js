/* Read-only, source-scoped candidate progress. No writes to tracker milestones. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.BTBonusRequirementProgress=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const MAX_CENTS=100000000000000n, DAY=86400000;
  const METRICS=['minimum-daily-balance','average-daily-balance',
    'minimum-beginning-day-balance','average-beginning-day-balance',
    'statement-ending-balance'];
  function cents(raw){
    const m=/^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(raw??'').trim());
    if(!m)return null;
    try{
      const v=BigInt(m[2])*100n+BigInt((m[3]||'').padEnd(2,'0')||'0');
      return v>MAX_CENTS?null:m[1]==='-'?-v:v;
    }catch{return null;}
  }
  function decimal(v){
    const sign=v<0n?'-':'',n=v<0n?-v:v;
    return sign+String(n/100n)+'.'+String(n%100n).padStart(2,'0');
  }
  function day(ts){
    return Number.isFinite(ts)&&ts>0?new Date(ts*1000).toISOString().slice(0,10):null;
  }
  function holdEnd(entry,rule){
    if(rule.timing?.basis!=='opened'||rule.timing?.unit!=='calendar-days'||
        !Number.isInteger(rule.timing.value)||rule.timing.value<1||
        !/^\d{4}-\d{2}-\d{2}$/.test(entry?.opened||''))return null;
    const start=Date.parse(entry.opened+'T00:00:00Z');
    if(!Number.isFinite(start))return null;
    return new Date(start+rule.timing.value*DAY).toISOString().slice(0,10);
  }
  function metricFor(rule){
    if(METRICS.includes(rule.metric))return rule.metric;
    const quote=String(rule.evidence?.quote||rule.text||'');
    const patterns=[
      ['minimum-beginning-day-balance',/minimum.{0,25}balance at the beginning of each day/i],
      ['average-beginning-day-balance',/average beginning day balance/i],
      ['minimum-daily-balance',/minimum daily balance/i],
      ['average-daily-balance',/average daily balance/i],
      ['statement-ending-balance',/statement.{0,25}(?:ending|end).{0,25}balance|ending.{0,25}balance/i]
    ];
    const detected=patterns.filter(([_,re])=>re.test(quote)).map(([name])=>name);
    return detected.length===1?detected[0]:null;
  }
  function sum(rows){
    return rows.reduce((n,a)=>{const x=cents(a.amount);return x!==null&&x>0n?n+x:n;},0n);
  }
  function balanceCandidate(entry,rule,history){
    const metric=metricFor(rule),target=cents(rule.amount);
    const end=holdEnd(entry,rule);
    const base={metric,holdEndDate:end,safeMoveDate:end,
      status:'manual review',coverageDays:0,coverageComplete:false,
      observedValue:null,verifiedMet:false};
    if(!metric||target===null||!end||!Array.isArray(history)||!history.length)return base;
    const observations=new Map(),start=entry.opened;
    for(const point of history){
      if(!point||point.currency!=='USD')continue;
      const at=point.at||point.observedAt;
      const dt=day(at);
      if(!dt||dt<start||dt>end)continue;
      if(metric.includes('beginning')&&point.beginningOfDay!==true)continue;
      if(metric==='statement-ending-balance'&&point.statementEnding!==true)continue;
      const value=cents(point.balance);
      if(value===null)continue;
      if(!observations.has(dt)||at>observations.get(dt).at)observations.set(dt,{value,at});
    }
    const values=[...observations.values()].map(x=>x.value);
    if(!values.length)return base;
    // A provider's periodic balance snapshots cannot prove *daily* minimum or
    // average balances. Even complete point counts remain candidate-only.
    const measured=metric.startsWith('minimum')||metric==='statement-ending-balance'
      ?values.reduce((a,b)=>a<b?a:b):values.reduce((a,b)=>a+b,0n)/BigInt(values.length);
    const covered=observations.size;
    const total=Math.round((Date.parse(end+'T00:00:00Z')-
       Date.parse(start+'T00:00:00Z'))/DAY)+1;
    return {...base,coverageDays:covered,coverageComplete:covered>=total,
      observedValue:decimal(measured),status:measured<target?'at risk':'on track'};
  }
  function externalMoneyCandidate(row,source,accounts){
    const v=cents(row.amount);
    if(v===null||v<=0n||row.pending)return false;
    const flags=Array.isArray(row.signals)?row.signals:[];
    if(row.category==='refund'||row.category==='bonus'||row.kind==='possible_bonus'||
       flags.some(x=>['possible_refund','possible_bonus','investment_transfer'].includes(x)))return false;
    if(row.externalOriginVerified===true)return true;
    const other=accounts.get(row.transferOtherAccountKey);
    const current=accounts.get(source);
    if(other&&current){
      const normalize=name=>String(name||'').toLowerCase().replace(/\b(bank|national|association|n a|inc|financial|services)\b/g,'').replace(/[^a-z0-9]/g,'');
      return !!normalize(other.bank)&&!!normalize(current.bank)&&normalize(other.bank)!==normalize(current.bank);
    }
    // ACH alone does not establish that the source is outside this institution.
    return false;
  }
  function debitPurchase(row){
    const v=cents(row.amount);
    if(v===null||v>=0n||row.pending)return false;
    const flags=Array.isArray(row.signals)?row.signals:[];
    if(flags.some(x=>['matched_internal_transfer','investment_transfer','card_payment'].includes(x))||
       ['transfer','fees','verification','loan','housing'].includes(row.category))return false;
    // Provider categories such as "shopping" are not evidence of debit-card rail.
    return flags.includes('debit_card_purchase')||row.paymentMethod==='debit_card'||
      /^(?:pos|debit_purchase)$/i.test(row.transactionCode||'');
  }
  function evaluate(entry,group,validate,financialState={}){
    const base={mode:'manual',requirements:[],scopeVerified:false,
      notice:'Verify the promotion terms before using transaction candidates for requirement progress.'};
    if(!entry||!group||typeof validate!=='function')return base;
    let result;try{result=validate(entry)}catch{return base;}
    if(result?.mode!=='structured'||result.ok!==true||!result.rules)return base;
    const rules=result.rules,products=Array.isArray(rules.accounts)?rules.accounts:[];
    const linked=Array.isArray(group.linkedAccounts)?group.linkedAccounts:[];
    const byProduct=new Map(),accounts=new Map((financialState.accounts||[]).map(a=>[a.key,a]));
    for(const product of products){
      let keys=linked.filter(a=>a.productId===product.id).map(a=>a.key);
      if(products.length===1&&linked.length===1&&!linked[0].productId)keys=[linked[0].key];
      if(keys.length===1&&!group.missingAccounts&&!group.unsupportedCurrency)byProduct.set(product.id,keys[0]);
    }
    const requirements=(rules.requirements||[]).map(r=>{
      const source=byProduct.get(r.accountId),kind=r.kind;
      const isDeposit=kind==='direct-deposit',isBalance=kind==='balance-hold';
      const isNewMoney=kind==='new-money',isPurchase=kind==='transactions';
      const history=(financialState.balanceHistory||{})[source]||[];
      const balance=isBalance?balanceCandidate(entry,r,history):null;
      const applicable=!!source&&(isDeposit||(isBalance&&balance?.metric&&balance?.holdEndDate)
        ||isNewMoney||isPurchase);
      const activity=Array.isArray(group.activity)?group.activity:[];
      const observations=Array.isArray(group.observations)?group.observations:[];
      const candidates=!applicable?[]:isDeposit
        ?activity.filter(a=>a.accountKey===source&&a.type==='directDeposit'&&a.reviewStatus!=='dismissed')
        :observations.filter(a=>a.accountKey===source&&(isNewMoney
          ?externalMoneyCandidate(a,source,accounts):isPurchase?debitPurchase(a):false));
      const reviewed=isDeposit?candidates.filter(a=>a.reviewStatus==='reviewed'&&a.requirementId===r.id):[];
      const months=new Set(reviewed.map(a=>day(a.posted)?.slice(0,7)).filter(Boolean));
      return {
        id:r.id,kind,text:r.text,applicable:!!applicable,manual:!applicable,
        recurrence:r.recurrence?.period||'one-time',
        targetAmount:typeof r.amount==='number'?String(r.amount):null,
        targetCount:Number.isInteger(r.count)?r.count:null,
        periodCount:Number.isInteger(r.recurrence?.count)?r.recurrence.count:null,
        candidateCount:candidates.length,candidateAmount:applicable?decimal(sum(candidates)):null,
        reviewedCount:reviewed.length,reviewedAmount:applicable?decimal(sum(reviewed)):null,
        reviewedCalendarMonths:months.size,
        candidateStatus:balance?balance.status:(candidates.length?'review pending':'not observed'),
        balance:balance||null,
        // Only the existing explicit bonus lifecycle dialog may confirm a milestone.
        verifiedMet:false
      };
    });
    const scoped=byProduct.size>0;
    return {mode:'structured',scopeVerified:scoped,requirements,
      notice:scoped
        ?'Candidate activity is not a qualifying requirement. Confirm funding origin, payment rail, daily or statement balance coverage, timing and bank acceptance before completing the requirement.'
        :'Candidate progress needs an exact checking/savings product match to verified promotion rules. No account has been inferred from its name.'};
  }
  return Object.freeze({evaluate,cents,decimal,metricFor,holdEnd,balanceCandidate,
    externalMoneyCandidate,debitPurchase});
});