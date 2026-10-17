/* Read-only, exact-product bonus requirement observations. Never marks a milestone. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.BTBonusRequirementProgress=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const MAX_CENTS=100000000000000n,DAY=86400;
  function cents(raw){
    const m=/^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(raw??'').trim());
    if(!m)return null;
    try{const v=BigInt(m[2])*100n+BigInt((m[3]||'').padEnd(2,'0')||'0');
      return v>MAX_CENTS?null:m[1]==='-'?-v:v;}catch{return null;}
  }
  function decimal(value){const n=value<0n?-value:value;return (value<0n?'-':'')+String(n/100n)+'.'+String(n%100n).padStart(2,'0');}
  const sum=rows=>decimal(rows.reduce((v,r)=>{const n=cents(r.amount);return n!==null&&n>0n?v+n:v;},0n));
  function metricFor(rule){
    const wording=String(rule.evidence?.quote||rule.text||'').toLowerCase();
    for(const [name,re] of [
      ['minimum-beginning-day-balance',/balance at the beginning of each day/],
      ['average-beginning-day-balance',/average beginning day balance/],
      ['minimum-daily-balance',/minimum daily balance/],
      ['average-daily-balance',/average daily balance/],
      ['statement-ending-balance',/statement.{0,20}(?:ending|end)|ending.{0,20}balance/]
    ])if(re.test(wording))return name;
    return null;
  }
  function day(at){if(!Number.isFinite(at))return null;return new Date(at*1000).toISOString().slice(0,10);}
  function balanceCandidate(points,metric,amount,entry,rule,now){
    const observed=(Array.isArray(points)?points:[]).filter(p=>p&&Number.isFinite(p.at)&&
      day(p.at)>=entry.opened&&p.balance!==undefined&&cents(p.balance)!==null)
      .sort((a,b)=>a.at-b.at);
    const daily=new Map();
    for(const p of observed)daily.set(day(p.at),cents(p.balance));
    const vals=[...daily.values()],target=cents(amount);
    const min=vals.length?vals.reduce((a,b)=>a<b?a:b):null;
    const avg=vals.length?vals.reduce((a,b)=>a+b,0n)/BigInt(vals.length):null;
    let observedBalance=null;
    if(metric==='minimum-daily-balance'||metric==='minimum-beginning-day-balance')observedBalance=min;
    if(metric==='average-daily-balance'||metric==='average-beginning-day-balance')observedBalance=avg;
    // A statement-ending value requires an actual statement closing date and
    // an observation from that close; a generic daily snapshot is not one.
    if(metric==='statement-ending-balance')observedBalance=null;
    let holdEnd=null;
    if(rule.timing?.basis==='opened'&&rule.timing.unit==='calendar-days'&&
      Number.isInteger(rule.timing.value)&&rule.timing.value>0&&/^\d{4}-\d{2}-\d{2}$/.test(entry.opened)){
      const d=new Date(entry.opened+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+rule.timing.value);
      holdEnd=d.toISOString().slice(0,10);
    }
    // Apply the exact metric. A single low daily balance does not breach an
    // average-daily threshold, and an ordinary snapshot is not a statement end.
    const breached=observedBalance!==null&&target!==null&&observedBalance<target;
    const onTrack=observedBalance!==null&&target!==null&&observedBalance>=target;
    return {metric,observedDays:vals.length,observedBalance:observedBalance===null?null:decimal(observedBalance),
      targetBalance:target===null?null:decimal(target),holdEnd,
      status:breached?'at risk':onTrack?'on track':'needs review',
      // Snapshots are NOT a complete daily or statement ledger.
      coverageComplete:false,verifiedMet:false,
      safeToMove:holdEnd?'Safe to move money on '+holdEnd+' (after verifying the full hold and bank terms)':'Hold end requires exact verified dates'};
  }
  function isTransfer(row){
    return row.category==='transfer'||(row.signals||[]).some(x=>['matched_internal_transfer','possible_transfer','investment_transfer','plaid_transfer','card_payment'].includes(x));
  }
  function newMoney(row){return cents(row.amount)>0n&&row.externalBankConfirmed===true&&!isTransfer(row)&&row.kind!=='possible_bonus';}
  function debitPurchase(row){
    const channel=String(row.paymentChannel||'').toLowerCase();
    return cents(row.amount)<0n&&!isTransfer(row)&&row.category!=='fees'&&
      ((row.transactionType==='debit_card')||(row.signals||[]).includes('debit_card_purchase')||
      (['in store','online'].includes(channel)&&
        /^(FOOD_AND_DRINK|GENERAL_MERCHANDISE|TRANSPORTATION|SHOPS|RECREATION)_/.test(row.plaidCategoryDetailed)));
  }
  function evaluate(entry,group,validate,now=Math.floor(Date.now()/1000)){
    const base={mode:'manual',requirements:[],scopeVerified:false,notice:'Verify the promotion terms before using transaction candidates for requirement progress.'};
    if(!entry||!group||typeof validate!=='function')return base;
    let result;try{result=validate(entry)}catch{return base;}
    if(result?.mode!=='structured'||result.ok!==true||!result.rules)return base;
    const rules=result.rules,products=Array.isArray(rules.accounts)?rules.accounts:[],
      linked=Array.isArray(group.linkedAccounts)?group.linkedAccounts:[],sources=new Map();
    for(const product of products){
      let keys=linked.filter(a=>a.productId===product.id).map(a=>a.key);
      if(products.length===1&&linked.length===1&&!linked[0].productId)keys=[linked[0].key];
      if(keys.length===1&&!group.missingAccounts&&!group.unsupportedCurrency)sources.set(product.id,keys[0]);
    }
    const requirements=(rules.requirements||[]).map(r=>{
      const source=sources.get(r.accountId),kind=r.kind,eligible=Boolean(source),
        applicable=eligible&&['direct-deposit','new-money','transactions'].includes(kind)||
        eligible&&kind==='balance-hold'&&!!metricFor(r)&&Array.isArray(group.balanceHistory?.[source]);
      const positive=(group.activity||[]).filter(a=>a.accountKey===source&&a.type==='directDeposit'&&a.reviewStatus!=='dismissed');
      const raw=(group.rawActivity||[]).filter(a=>a.accountKey===source&&a.posted<=now+300);
      const candidates=kind==='direct-deposit'?positive:kind==='new-money'?raw.filter(newMoney):kind==='transactions'?raw.filter(debitPurchase):[];
      const reviewed=kind==='direct-deposit'?positive.filter(a=>a.reviewStatus==='reviewed'&&a.requirementId===r.id):[];
      const months=new Set(reviewed.map(a=>day(a.posted)?.slice(0,7)).filter(Boolean));
      const balance=kind==='balance-hold'&&applicable?balanceCandidate(group.balanceHistory?.[source],metricFor(r),r.amount,entry,r,now):null;
      return {id:r.id,kind,text:r.text,applicable,manual:!applicable,
        recurrence:r.recurrence?.period||'one-time',
        targetAmount:typeof r.amount==='number'?String(r.amount):null,
        targetCount:Number.isInteger(r.count)?r.count:null,
        periodCount:Number.isInteger(r.recurrence?.count)?r.recurrence.count:null,
        candidateCount:applicable?candidates.length:0,
        candidateAmount:applicable?sum(candidates):null,
        reviewedCount:applicable?reviewed.length:0,
        reviewedAmount:applicable?sum(reviewed):null,reviewedCalendarMonths:applicable?months.size:0,
        balance,verifiedMet:false};
    });
    return {mode:'structured',scopeVerified:sources.size>0,requirements,
      notice:sources.size?
        'Confirm deposit origin, bank acceptance, complete daily/statement history, purchase network, thresholds and timing before completing any requirement; candidates are observations only.':
        'Unambiguous account-to-product mapping and verified promotion terms are required; never infer qualification from credits alone.'};
  }
  return Object.freeze({evaluate,cents,decimal,metricFor,newMoney,debitPurchase,balanceCandidate});
});
