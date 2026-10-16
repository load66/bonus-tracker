/* Read-only candidate progress; never infers qualifying deposits or completes a bank bonus.
 * Official, evidence-backed financial rules and exactly scoped accounts are required
 * before a transaction is associated with a specific requirement.
 */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.BTBonusRequirementProgress=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const MAX_CENTS=100000000000000n;
  function cents(raw){
    const m=/^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(raw??'').trim());
    if(!m)return null;
    try{
      const v=BigInt(m[2])*100n+BigInt((m[3]||'').padEnd(2,'0')||'0');
      if(v>MAX_CENTS)return null;
      return m[1]==='-'?-v:v;
    }catch{return null;}
  }
  function decimal(v){
    const sign=v<0n?'-':'',n=v<0n?-v:v;
    return sign+String(n/100n)+'.'+String(n%100n).padStart(2,'0');
  }
  function evaluate(entry,group,validate){
    const base={mode:'manual',requirements:[],scopeVerified:false,notice:'Verify the promotion terms before using transaction candidates for requirement progress.'};
    if(!entry||!group||typeof validate!=='function')return base;
    let result;
    try{result=validate(entry)}catch{return base;}
    if(result?.mode!=='structured'||result.ok!==true||!result.rules)return base;
    const rules=result.rules;
    const products=Array.isArray(rules.accounts)?rules.accounts:[];
    const linked=Array.isArray(group.linkedAccounts)?group.linkedAccounts:[];
    const candidatesByProduct=new Map();
    for(const product of products){
      // A product is attributable only when exactly one eligible connected
      // account was explicitly assigned to that product from verified terms.
      let accountKeys=linked.filter(a=>a.productId===product.id).map(a=>a.key);
      // Preserve safe legacy one-product promotions without modifying old links.
      if(products.length===1&&linked.length===1&&!linked[0].productId)accountKeys=[linked[0].key];
      if(accountKeys.length===1&&!group.missingAccounts&&!group.unsupportedCurrency)
        candidatesByProduct.set(product.id,accountKeys[0]);
    }
    const scoped=candidatesByProduct.size>0;
    const requirements=(rules.requirements||[]).map(r=>{
      const source=candidatesByProduct.get(r.accountId);
      const applicable=Boolean(source)&&r.kind==='direct-deposit';
      const candidates=applicable?(group.activity||[]).filter(a=>a.accountKey===source
        &&a.type==='directDeposit'&&a.reviewStatus!=='dismissed'):[];
      const reviewed=candidates.filter(a=>a.reviewStatus==='reviewed'&&a.requirementId===r.id);
      const aggregate=rows=>rows.reduce((n,a)=>{
        const x=cents(a.amount);
        return x!==null&&x>0n?n+x:n;
      },0n);
      const perMonth=new Set(reviewed.map(a=>Number.isFinite(a.posted)?new Date(a.posted*1000).toISOString().slice(0,7):'').filter(Boolean));
      return {
        id:r.id,kind:r.kind,text:r.text,applicable,
        manual:!applicable,recurrence:r.recurrence?.period||'one-time',
        targetAmount:typeof r.amount==='number'?String(r.amount):null,
        targetCount:Number.isInteger(r.count)?r.count:null,
        periodCount:Number.isInteger(r.recurrence?.count)?r.recurrence.count:null,
        candidateCount:candidates.length,
        candidateAmount:applicable?decimal(aggregate(candidates)):null,
        reviewedCount:reviewed.length,
        reviewedAmount:applicable?decimal(aggregate(reviewed)):null,
        reviewedCalendarMonths:applicable?perMonth.size:0,
        // Candidate values are never approved requirement completion.
        verifiedMet:false
      };
    });
    return {
      mode:'structured',scopeVerified:scoped,requirements,
      notice:scoped
        ?'Only candidates from explicitly matched products are counted. Confirm payroll source, amount, timing, recurring periods, companion accounts, waiver rules and bank acceptance before marking requirements complete.'
        :'Deposit progress needs an unambiguous checking or savings product match from verified promotion rules. Candidate credits alone are not qualifying-deposit proof.'
    };
  }
  return Object.freeze({evaluate,cents,decimal});
});
