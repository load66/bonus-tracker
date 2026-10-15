/* Evidence-backed, bank-independent rules. Pure functions; no tracker writes or new date arithmetic. */
(function(root){
  'use strict';
  const VERSION=2,clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
  const money=n=>'$'+Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
  const number=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100000000;
  const integer=n=>number(n)&&Number.isInteger(n)&&n>0;
  const kinds=new Set(['direct-deposit','new-money','balance-hold','transactions','enrollment','relationship','other']);
  const periods=new Set(['one-time','calendar-month','statement-cycle','calendar-quarter','calendar-year']);
  const units=new Set(['calendar-days','business-days','calendar-months','statement-cycles']);
  const words=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'];
  function date(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value)))return false;const d=new Date(value+'T00:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===value;}
  function validate(e){
    const rules=e?.financialRules,issues=[],warnings=[];
    const fail=(path,message)=>issues.push({path,message});
    const warn=(path,message)=>warnings.push({path,message});
    if(rules==null)return Number(e?.schemaVersion)>=3?{ok:false,mode:'invalid',issues:[{path:'financialRules',message:'Structured financial rules are missing.'}],warnings,rules:null}:{ok:true,mode:'legacy',issues,warnings,rules:null};
    if(!object(rules)||![1,VERSION].includes(rules.version))return{ok:false,mode:'invalid',issues:[{path:'financialRules.version',message:'The financial-rule version is unsupported.'}],warnings,rules:null};
    if(JSON.stringify(rules).length>60000)fail('financialRules','The financial-rule package is too large.');
    function keys(value,allowed,path){if(!object(value)){fail(path,'An object is required.');return false;}for(const k of Object.keys(value))if(!allowed.includes(k))fail(path+'.'+k,'This rule field is unsupported.');return true;}
    function evidence(value,path,expected){
      if(!keys(value,['source','quote'],path))return '';
      if(!['promotion','fee-schedule'].includes(value.source)||expected&&value.source!==expected)fail(path+'.source','Evidence must identify the applicable official source.');
      const quote=clean(value.quote),raw=clean(value.source==='fee-schedule'?e.feeScheduleRaw:e.tcSourceRaw);
      if(quote.length<8||quote.length>3000||!raw.includes(quote))fail(path+'.quote','The supporting quotation is missing from the original source text.');
      const url=value.source==='fee-schedule'?e.feeScheduleSourceUrl:e.promoSourceUrl;
      try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)throw Error();}catch{fail(path+'.source','An HTTPS official source URL is required.');}
      if(!date(e.termsVerifiedAt))fail(path+'.source','The source verification date is invalid.');
      return quote;
    }
    function supportedValue(value,quote,path,currency=false){
      if(!number(value)){fail(path,'A non-negative numeric value is required.');return;}
      const amounts=[...quote.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)].map(m=>Number(m[1].replace(/,/g,'')));
      const numbers=[...quote.matchAll(/\b\d+(?:,\d{3})*(?:\.\d+)?\b/g)].map(m=>Number(m[0].replace(/,/g,'')));
      const zero=currency&&value===0&&/no (?:monthly |maintenance |service )*(?:fee|charge)|fee.free/i.test(quote);
      if(!(currency?amounts:numbers).includes(value)&&!zero&&!(!currency&&Number.isInteger(value)&&words[value]&&new RegExp('\\b'+words[value]+'\\b','i').test(quote)))fail(path,'The numeric value is not supported by its quotation.');
    }
    function condition(value,path,expected){
      if(!keys(value,['id','kind','text','amount','count','period','metric','evidence'],path))return;
      if(!kinds.has(value.kind)||!clean(value.text))fail(path,'The condition needs a supported kind and complete wording.');
      if(value.period!==undefined&&!periods.has(value.period))fail(path+'.period','The recurring period is unsupported.');
      const quote=evidence(value.evidence,path+'.evidence',expected);
      const metrics={...(rules.version>=2?{'minimum-beginning-day-balance':/balance at the beginning of each day/i,'average-beginning-day-balance':/average beginning day balance/i}:{}),'minimum-daily-balance':/minimum daily balance/i,'average-daily-balance':/average daily balance/i,'statement-ending-balance':/statement.{0,20}(?:ending|end)|ending.{0,20}balance/i};
      if(value.kind==='balance-hold'&&(!metrics[value.metric]||!metrics[value.metric].test(quote)))fail(path+'.metric','A balance waiver must retain its exact daily, beginning-of-day or statement-ending basis.');
      if(value.metric!==undefined&&!Object.hasOwn(metrics,value.metric))fail(path+'.metric','The balance metric is unsupported.');
      if(value.amount!==undefined)supportedValue(value.amount,quote,path+'.amount',true);
      if(value.count!==undefined){if(!integer(value.count))fail(path+'.count','A positive whole count is required.');supportedValue(value.count,quote,path+'.count');}
    }
    function unitEvidence(unit,quote,path){
      const patterns={'calendar-days':/\bdays?\b/i,'business-days':/business days?/i,'calendar-months':/\bmonths?\b/i,'statement-cycles':/statement (?:cycles?|periods?)/i,'calendar-month':/calendar months?|each month|every month|monthly/i,'statement-cycle':/statement (?:cycles?|periods?)/i,'calendar-quarter':/quarters?|quarterly/i,'calendar-year':/years?|annually/i};
      if(patterns[unit]&&!patterns[unit].test(quote)||unit==='calendar-days'&&/business days?/i.test(quote))fail(path,'The time unit is not supported by the source wording.');
    }
    function waiver(value,path,depth=0){
      if(value===null)return;
      if(depth>4){fail(path,'Waiver conditions are nested too deeply.');return;}
      if(!keys(value,['operator','conditions','evidence'],path))return;
      if(!['all','any','none'].includes(value.operator)){fail(path+'.operator','Waivers must explicitly distinguish ALL conditions from ANY alternative.');return;}
      const quote=evidence(value.evidence,path+'.evidence','fee-schedule');
      if(value.operator==='none'){if(value.conditions?.length)fail(path,'A no-waiver rule cannot contain waiver conditions.');if(!/no .*waiv|waiv.*(?:not available|unavailable|not offered)/i.test(quote))fail(path,'A no-waiver claim needs explicit supporting wording.');return;}
      if(!Array.isArray(value.conditions)||!value.conditions.length||value.conditions.length>12){fail(path+'.conditions','One to twelve waiver conditions are required.');return;}
      if(value.conditions.length>1&&!new RegExp(value.operator==='any'?'\\bor\\b|either|any of|one of':'\\band\\b|both|all of','i').test(quote))fail(path+'.operator','The quotation does not establish the stated ALL/ANY relationship.');
      value.conditions.forEach((c,i)=>c?.operator!==undefined?waiver(c,path+'.conditions['+i+']',depth+1):condition(c,path+'.conditions['+i+']','fee-schedule'));
    }
    keys(rules,['version','bonus','accounts','requirements','payout','closure'],'financialRules');
    if(keys(rules.bonus,['amount','currency','text','evidence'],'bonus')){const q=evidence(rules.bonus.evidence,'bonus.evidence','promotion');supportedValue(rules.bonus.amount,q,'bonus.amount',true);if(rules.bonus.currency!=='USD'||rules.bonus.amount!==Number(e.bonus))fail('bonus','The selected bonus tier conflicts with the tracker amount or currency.');}
    const accountIds=new Set();
    if(!Array.isArray(rules.accounts)||!rules.accounts.length||rules.accounts.length>8)fail('accounts','One to eight applicable accounts are required.');
    else rules.accounts.forEach((a,i)=>{
      const p='accounts['+i+']';if(!keys(a,['id','label','role','required','fee','minimumBalance'],p))return;
      if(!/^[a-z0-9_-]{1,40}$/.test(a.id)||accountIds.has(a.id))fail(p+'.id','Account IDs must be unique and stable.');accountIds.add(a.id);
      if(!clean(a.label)||!['primary','companion'].includes(a.role)||typeof a.required!=='boolean'||a.role==='primary'&&!a.required)fail(p,'Account role, required status and product name must be explicit.');
      if(a.minimumBalance!==undefined){if(keys(a.minimumBalance,['amount','text','evidence'],p+'.minimumBalance')){const q=evidence(a.minimumBalance.evidence,p+'.minimumBalance.evidence','fee-schedule');supportedValue(a.minimumBalance.amount,q,p+'.minimumBalance.amount',true);if(!clean(a.minimumBalance.text))fail(p+'.minimumBalance.text','Minimum-balance wording is required.');}}
      if(!keys(a.fee,['amount','currency','frequency','waiver','evidence'],p+'.fee'))return;
      const q=evidence(a.fee.evidence,p+'.fee.evidence','fee-schedule');
      if(a.fee.amount===null){if(a.required)fail(p+'.fee.amount','The required account fee is unconfirmed.');else warn(p+'.fee.amount','The optional account fee is unconfirmed.');}
      else supportedValue(a.fee.amount,q,p+'.fee.amount',true);
      if(a.fee.currency!=='USD'||!['monthly','statement-cycle','quarterly','annually','none'].includes(a.fee.frequency))fail(p+'.fee','Fee currency or frequency is unsupported.');
      if(a.fee.frequency==='none'&&a.fee.amount!==0)fail(p+'.fee.frequency','A recurring charge cannot have a no-charge frequency.');
      if(!Object.hasOwn(a.fee,'waiver'))fail(p+'.fee.waiver','Waiver status must be explicit; use null when unconfirmed.');
      else waiver(a.fee.waiver,p+'.fee.waiver');
      if(a.fee.amount>0&&a.fee.waiver===null)warn(p+'.fee.waiver',a.label+': fee-waiver conditions are not confirmed.');
    });
    if(Array.isArray(rules.accounts)&&rules.accounts.filter(a=>a?.role==='primary').length!==1)fail('accounts','Exactly one primary account is required.');
    const ruleIds=new Set();
    if(!Array.isArray(rules.requirements)||!rules.requirements.length||rules.requirements.length>20)fail('requirements','One to twenty complete bonus requirements are required.');
    else rules.requirements.forEach((r,i)=>{
      const p='requirements['+i+']';if(!keys(r,['id','accountId','kind','text','amount','count','recurrence','timing','evidence'],p))return;
      if(!/^[a-z0-9_-]{1,40}$/.test(r.id)||ruleIds.has(r.id))fail(p+'.id','Requirement IDs must be unique.');ruleIds.add(r.id);
      if(!accountIds.has(r.accountId)||!kinds.has(r.kind)||!clean(r.text))fail(p,'Requirement product scope, kind and wording are required.');
      const quote=evidence(r.evidence,p+'.evidence','promotion');
      if(r.amount!==undefined)supportedValue(r.amount,quote,p+'.amount',true);
      if(r.count!==undefined){if(!integer(r.count))fail(p+'.count','A positive count is required.');supportedValue(r.count,quote,p+'.count');}
      if(r.recurrence!==undefined){if(keys(r.recurrence,['period','count'],p+'.recurrence')){if(!periods.has(r.recurrence.period)||r.recurrence.period==='one-time'||!integer(r.recurrence.count))fail(p+'.recurrence','Every recurring period and period count must be explicit.');supportedValue(r.recurrence.count,quote,p+'.recurrence.count');unitEvidence(r.recurrence.period,quote,p+'.recurrence.period');}}
      if(r.timing!==undefined){if(keys(r.timing,['basis','value','unit'],p+'.timing')){if(!['opened','reqmet','bonus','enrollment'].includes(r.timing.basis)||!integer(r.timing.value)||!units.has(r.timing.unit))fail(p+'.timing','The exact deadline anchor and unit are required.');supportedValue(r.timing.value,quote,p+'.timing.value');unitEvidence(r.timing.unit,quote,p+'.timing.unit');if(r.timing.unit!=='calendar-days'){warn(p+'.timing','An exact '+r.timing.unit+' deadline requires its applicable calendar or statement dates; no day-count approximation is used.');if(Number(e.reqDays||0)>0)fail(p+'.timing','Non-calendar deadlines cannot be projected into the calendar-day reqDays field.');}}}
    });
    if(keys(rules.payout,['text','timing','evidence'],'payout')){if(!clean(rules.payout.text))fail('payout.text','Payout conditions are required.');evidence(rules.payout.evidence,'payout.evidence','promotion');if(e.payoutTimingText&&clean(rules.payout.text)!==clean(e.payoutTimingText))fail('payout.text','Structured payout wording conflicts with the tracker wording.');if(rules.payout.timing!==undefined){const t=rules.payout.timing;if(!keys(t,['basis','value','unit'],'payout.timing')||!['opened','reqmet','bonus','qualifying-period-end'].includes(t.basis)||!integer(t.value)||!units.has(t.unit))fail('payout.timing','Payout timing must retain its exact trigger and unit.');else{supportedValue(t.value,rules.payout.evidence?.quote||'','payout.timing.value');unitEvidence(t.unit,rules.payout.evidence?.quote||'','payout.timing.unit');}}}
    if(keys(rules.closure,['restrictionType','basis','minHoldDays','earlyCloseFee','text','evidence','feeEvidence'],'closure')){
      const c=rules.closure,q=evidence(c.evidence,'closure.evidence','promotion');
      const unknownFee=rules.version>=2&&c.earlyCloseFee===null;
      const feeQuote=evidence(c.feeEvidence,'closure.feeEvidence');
      if(unknownFee){if(c.restrictionType!=='manual-review'||c.basis!=='manual')fail('closure.earlyCloseFee','An unconfirmed early-close fee must block closure through manual review.');warn('closure.earlyCloseFee','Early-close fee unconfirmed. Verify the applicable fee before closing; no zero-fee claim is made.');}
      if(!['payout-only','minimum-open','explicit-clawback','manual-review','none'].includes(c.restrictionType)||!['opened','reqmet','bonus','manual'].includes(c.basis)||!number(c.minHoldDays)||!Number.isInteger(c.minHoldDays)||(!unknownFee&&!number(c.earlyCloseFee))||!clean(c.text))fail('closure','Closure restrictions, anchor, calendar-day hold and charge must be explicit.');
      if(c.minHoldDays>0)supportedValue(c.minHoldDays,q,'closure.minHoldDays');
      if(c.earlyCloseFee>0)supportedValue(c.earlyCloseFee,feeQuote,'closure.earlyCloseFee',true);
      if(c.minHoldDays>0&&/business days?|statement (?:cycles?|periods?)|calendar months?|years?/i.test(q))fail('closure.minHoldDays','A non-calendar hold cannot be converted to calendar days. Use manual review.');
      if(c.restrictionType==='manual-review'&&c.basis!=='manual')fail('closure.basis','Unresolved closure terms must require manual review.');
      if(Number(e.minHoldDays||0)!==c.minHoldDays||(!unknownFee&&Number(e.earlyCloseFee||0)!==c.earlyCloseFee)||e.closeRuleBasis&&e.closeRuleBasis!==c.basis||e.closeRestrictionType&&e.closeRestrictionType!==c.restrictionType)fail('closure','Structured closure rules conflict with the tracker calculation fields.');
      if(c.earlyCloseFee===0&&!/no .*?(?:early|clos|terminat).*?fee|\$0|fee.free/i.test(feeQuote))fail('closure.earlyCloseFee','A zero early-close charge requires explicit fee evidence.');
    }
    return{ok:!issues.length,mode:issues.length?'invalid':'structured',issues,warnings,rules:issues.length?null:rules};
  }
  function waiverText(w){
    if(w===null)return 'Fee-waiver conditions have not been confirmed.';
    if(w.operator==='none')return 'No fee waiver is offered under these terms.';
    const parts=w.conditions.map(c=>c.operator?'('+waiverText(c)+')':clean(c.text));
    return(w.operator==='any'?'Meet any ONE of these alternatives: ':'Meet ALL of these conditions: ')+parts.join(w.operator==='any'?' OR ':' AND ');
  }
  function summarize(e){
    const v=validate(e);if(v.mode==='legacy')return {mode:'legacy',issues:[],warnings:[],feeRisk:null};
    if(!v.ok)return{mode:'invalid',issues:v.issues.map(x=>x.message),warnings:[],feeRisk:true};
    const r=v.rules,fees=r.accounts.map(a=>a.label+(a.required?'':' (optional)')+': '+(a.fee.amount===0?'No recurring maintenance fee.':a.fee.amount===null?'Fee unconfirmed.':money(a.fee.amount)+' '+a.fee.frequency+'.'));
    const waivers=r.accounts.filter(a=>a.fee.amount>0).map(a=>a.label+': '+waiverText(a.fee.waiver));
    const minimums=r.accounts.filter(a=>a.minimumBalance).map(a=>a.label+': '+a.minimumBalance.text);
    const evidence=[],seen=new Set();
    const walk=v=>{if(!object(v)&&!Array.isArray(v))return;if(v.source&&v.quote){const key=v.source+': '+v.quote;if(!seen.has(key)){seen.add(key);evidence.push(key);}}for(const child of Object.values(v))if(object(child)||Array.isArray(child))walk(child);};walk(r);
    return{mode:'structured',fees,waivers,minimums,requirements:r.requirements.map(x=>x.text),payout:r.payout.text,closure:r.closure.text+(r.closure.earlyCloseFee===null?' Early-close fee unconfirmed; manual closure review required.':''),recurring:r.requirements.some(x=>x.recurrence),feeRisk:r.accounts.some(a=>a.required&&a.fee.amount!==0),issues:[],warnings:v.warnings.map(x=>x.message),evidence};
  }
  function intentFor(question){
    const q=clean(question).toLowerCase();
    if(/compare|versus|\bvs\b|also|calculate/.test(q))return 'ai';
    if(/(?:can|could|should|may|when).{0,40}\bclose\b|safe.{0,30}(?:close|closing)|closure checks|closing this account/.test(q))return 'closure';
    if(/early.close|forfeit|termination/.test(q))return 'closure-fee';
    if(/waiv|avoid.{0,20}(?:fee|charge)/.test(q))return 'waiver';
    if(/monthly|maintenance|service.{0,8}(?:fee|charge)|how much.{0,20}(?:fee|charge)/.test(q)&&/fee|charge|cost/.test(q))return 'fees';
    if(/savings|membership|share account/.test(q))return 'companion';
    if(/direct deposit|\bdd\b|requirements|what (?:remains|do i still need)|qualif|how many.{0,20}(?:deposit|transaction)/.test(q))return 'requirements';
    if(/payout|paid|bonus.{0,20}(?:arriv|post|receive)/.test(q))return 'payout';
    if(/repeat|apply.{0,35}again|eligib/.test(q))return 'eligibility';
    return 'ai';
  }
  function answer(e,question){
    const s=summarize(e),intent=intentFor(question);if(s.mode==='legacy')return null;
    if(s.mode==='invalid')return{answer:'This account contains conflicting or incomplete financial rules. Verify them before relying on an amount or deadline.',step:'Review the source details and replace the conflicting rules with verified terms.',missing:s.issues,factIds:['financialrules'],local:true};
    if(intent==='ai'||intent==='closure'||intent==='eligibility')return null;
    let text='',step='',missing=[];
    if(intent==='fees'){text=s.fees.join('\n\n');step=s.waivers.concat(s.minimums).join('\n')||'Check the fee schedule for transaction or optional-service charges before changing the account.';}
    else if(intent==='waiver'){text=s.waivers.join('\n\n')||'These accounts have no recurring maintenance fee under the verified terms.';step='Check that your balance and activity meet the applicable waiver conditions in every required period.';}
    else if(intent==='companion'){const a=validate(e).rules.accounts.filter(a=>a.role==='companion');text=a.length?a.map(a=>a.label+(a.required?' is required.':' is optional.')+(a.minimumBalance?' '+a.minimumBalance.text:'')).join('\n\n'):'No companion account is listed in the verified rule package.';step=s.waivers.concat(s.minimums).join('\n')||'Confirm membership and account requirements before withdrawing funds.';}
    else if(intent==='requirements'){text=s.requirements.join('\n\n');step=s.recurring?'Verify qualifying activity for every specified period; one completed task does not confirm all periods.':'Verify actual qualifying activity with the bank before marking requirements complete.';missing=s.warnings;}
    else if(intent==='payout'){text=s.payout;step=e.bonusRecd?'Receipt is recorded. Review the closure checks next.':'Record receipt only after the bonus actually posts.';}
    else if(intent==='closure-fee'){text=s.closure;step='Use the tracker closure checks before closing or withdrawing a required balance.';}
    else return null;
    if(['fees','waiver','companion'].includes(intent))missing=s.warnings.filter(x=>/fee|waiv/i.test(x));
    return{answer:text,step,missing,factIds:['financialrules'],local:true};
  }
  const api=Object.freeze({VERSION,validate,summarize,answer,intentFor,waiverText});
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.BTFinancialRules=api;
})(typeof window!=='undefined'?window:globalThis);
