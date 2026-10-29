/* Evidence-backed, bank-independent rules and exact payout ranges. Pure functions; no tracker writes. */
(function(root){
  'use strict';
  const VERSION=3,clean=v=>String(v??'').replace(/\s+/g,' ').trim();
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
    if(!object(rules)||![1,2,VERSION].includes(rules.version))return{ok:false,mode:'invalid',issues:[{path:'financialRules.version',message:'The financial-rule version is unsupported.'}],warnings,rules:null};
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
    if(keys(rules.payout,['text','timing','evidence',...(rules.version>=3?['window']:[])],'payout')){if(!clean(rules.payout.text))fail('payout.text','Payout conditions are required.');evidence(rules.payout.evidence,'payout.evidence','promotion');if(e.payoutTimingText&&clean(rules.payout.text)!==clean(e.payoutTimingText))fail('payout.text','Structured payout wording conflicts with the tracker wording.');if(rules.payout.timing!==undefined){const t=rules.payout.timing;if(!keys(t,['basis','value','unit'],'payout.timing')||!['opened','reqmet','bonus','qualifying-period-end'].includes(t.basis)||!integer(t.value)||!units.has(t.unit))fail('payout.timing','Payout timing must retain its exact trigger and unit.');else{supportedValue(t.value,rules.payout.evidence?.quote||'','payout.timing.value');unitEvidence(t.unit,rules.payout.evidence?.quote||'','payout.timing.unit');}}}
    if(rules.version>=3&&rules.payout?.window!==undefined){
      const w=rules.payout.window;
      if(keys(w,['basis','unit','min','max'],'payout.window')){
        if(!['opened','reqmet','enrollment','qualifying-period-end'].includes(w.basis)||!units.has(w.unit)||!Number.isInteger(w.min)||w.min<0||!integer(w.max)||w.min>w.max)fail('payout.window','An ordered payout window with an exact trigger and unit is required.');
        const supported=payoutWindowFromText(rules.payout.evidence?.quote);
        if(!supported||['basis','unit','min','max'].some(k=>supported[k]!==w[k]))fail('payout.window','The original quotation must explicitly support the payout window and its trigger.');
        const t=rules.payout.timing;
        if(t&&(t.basis!==w.basis||t.unit!==w.unit||t.value!==w.max))fail('payout.window','Payout timing conflicts with the arrival window.');
      }
    }
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
      function explicitZeroEarlyCloseFee(quote){
      return clean(quote).split(/(?:\n+|(?<=[.!?])\s+|;\s+)/).some(sentence=>{
        if(!/(?:early[\s-]*(?:clos|terminat)|account[\s-]*(?:clos|terminat)|clos(?:e|ing|ure)|terminat)/i.test(sentence))return false;
        return /(?:\bno\b|\bwithout\b|\bwaived\b|\bzero\b)[^.]{0,80}\bfee\b|\$\s*0\b|fee[\s-]*free/i.test(sentence);
      });
    }
      if(c.earlyCloseFee===0&&!explicitZeroEarlyCloseFee(feeQuote))fail('closure.earlyCloseFee','A zero early-close charge requires explicit fee evidence.');
    }
    return{ok:!issues.length,mode:issues.length?'invalid':'structured',issues,warnings,rules:issues.length?null:rules};
  }
  // Strict read-only adaptation of saved payout wording. No bank-name defaults.
  function payoutWindowFromText(text){
    const s=clean(text).toLowerCase().replace(/[–—]/g,'-');
    const n='(\\d{1,4})(?:st|nd|rd|th)?';
    const u='(business days?|calendar days?|days?|calendar months?|months?|statement cycles?)';
    const intervals=s.match(new RegExp('(?:between (?:the )?'+n+' (?:and|to) (?:the )?'+n+' '+u+'|'+n+'\\s*-\\s*'+n+' '+u+'|(?:within|up to) '+n+' '+u+')','g'));
    if(intervals?.length!==1)return null;
    const range=s.match(new RegExp('between (?:the )?'+n+' (?:and|to) (?:the )?'+n+' '+u))||s.match(new RegExp(n+'\\s*-\\s*'+n+' '+u));
    const within=!range&&s.match(new RegExp('(?:within|up to) '+n+' '+u));
    if(!range&&!within)return null;
    const unitText=range?range[3]:within[2];
    const unit=/business/.test(unitText)?'business-days':/month/.test(unitText)?'calendar-months':/statement/.test(unitText)?'statement-cycles':'calendar-days';
    const anchors=[];
    if(/(?:after|from|of|following) (?:the )?(?:account )?open(?:ing|ed)|after (?:you )?open(?:ing)? (?:the |your |a )?(?:new )?account/.test(s))anchors.push('opened');
    if(/after you have (?:completed|met|satisfied) all requirements|after (?:all (?:of )?)?(?:(?:the|its|their|your) )?requirements (?:are |have been )?(?:met|completed|satisfied)|after (?:meeting|completing|satisfying) (?:all (?:of )?)?(?:(?:the|its|their|your) )?requirements|of (?:meeting|completing|satisfying) (?:all (?:of )?)?(?:(?:the|its|their|your) )?requirements/.test(s))anchors.push('reqmet');
    if(/(?:after|from|of|following) (?:offer |coupon )?enrollment/.test(s))anchors.push('enrollment');
    if(/(?:after|following) (?:the )?(?:qualification|qualifying|requirement|deposit) period (?:ends|has ended)|after (?:the )?end of (?:the )?(?:qualification|qualifying|requirement|deposit) period/.test(s))anchors.push('qualifying-period-end');
    if(anchors.length!==1)return null;
    const min=range?Number(range[1]):0,max=Number(range?range[2]:within[1]);
    if(max<min||max<=0)return null;
    return {basis:anchors[0],unit,min,max};
  }
  function shiftPayoutDate(base,value,unit){
    if(!date(base)||!Number.isInteger(value)||value<0)return '';
    const d=new Date(base+'T00:00:00Z');
    if(unit==='calendar-days')d.setUTCDate(d.getUTCDate()+value);
    else if(unit==='calendar-months'){
      const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+value);
      const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));
    }else return ''; // Business/statement calendars require exact bank dates.
    if(isNaN(d))return '';
    const result=d.toISOString().slice(0,10);return date(result)?result:'';
  }
  // Scope a long source quotation to its actual payment clause, not deposit deadlines.
  // The saved typed trigger remains authoritative only when its source proves it.
  function savedPayoutWindow(rules){
    const p=rules.payout,q=clean(p.evidence?.quote);
    let w=p.window||payoutWindowFromText(q);
    if(!w){
      const clauses=q.split(/(?<=[.!?])\s+/).filter(s=>/deposit (?:the |your )?(?:bonus|reward)|(?:bonus|reward) (?:will be |is |will |shall be )?(?:paid|deposited|credited|posted)/i.test(s));
      const windows=clauses.map(payoutWindowFromText);
      if(windows.length!==1||!windows[0])return null;
      w=windows[0];
    }
    const t=p.timing;
    if(t&&t.basis==='qualifying-period-end'&&w.basis==='reqmet'){
      // Some tiered offers determine the reward at a fixed enrollment-period end.
      // Early completion must never move that clock forward.
      const req=rules.requirements,days=[...q.matchAll(/at day (\d+),? (?:the )?(?:bonus )?tier will be determined/gi)].map(m=>Number(m[1]));
      if(days.length!==1||!req?.length||req.some(r=>r.timing?.basis!=='enrollment'||r.timing.unit!=='calendar-days'||r.timing.value!==days[0]))return null;
      if(!new RegExp('during the '+days[0]+' days from (?:coupon |offer )?enrollment','i').test(q))return null;
      w={...w,basis:'qualifying-period-end'};
    }
    if(t&&(t.basis!==w.basis||t.unit!==w.unit||t.value!==w.max))return null;
    return w;
  }
  // Public offer evidence is an immutable enrollment-version record, not a bank default.
  // Recovery requires the whole legacy fingerprint; saved source/rules always win.
  const legacyOfferEvidence=Object.freeze({
    id:'citi-regular-325-edd-20260414-20261026',version:1,
    sourceUrl:'https://banking.citi.com/cbol/OM/checking/enhanced-direct-deposit-offer/default.htm?venue=Extra1',
    verifiedAt:'2026-10-29',enrollFrom:'2026-04-14',enrollThrough:'2026-10-26',
    quote:'You’ll receive the bonus as a credit to your eligible, Regular Checking Account between the 90th and 120th calendar day after account opening, provided you keep your account open and in good standing.'
  });
  function matchedLegacyOffer(e){
    if(!e||e.financialRules||Number(e.schemaVersion)>=3||e.tcSourceRaw||e.analyzedTC||e.analysis)return null;
    if(!/^(?:citi|citibank|citi bank)$/i.test(clean(e.bank))||e.accountType!=='personal'||Number(e.bonus)!==325||Number(e.reqDays)!==90)return null;
    if(!date(e.opened)||e.opened<legacyOfferEvidence.enrollFrom||e.opened>legacyOfferEvidence.enrollThrough)return null;
    if(!/^(?:October 26, 2026|2026-10-26)$/i.test(clean(e.expirationDateText)))return null;
    if(!/^Opened through Citi \$325 Enhanced Direct Deposit offer link$/i.test(clean(e.promoCodeText)))return null;
    if(!/^Open an eligible Citi checking account and receive at least 2 Enhanced Direct Deposits totaling \$3,000 or more within 90 calendar days of account opening\.$/i.test(clean(e.completeBonusText)))return null;
    if(clean(e.payoutTimingText)!=='Bonus expected after requirements are completed; keep the account open and in good standing until the bonus posts.')return null;
    // Never override a saved numeric clock, even if its wording is unsupported.
    if(/\d.{0,15}(?:days?|months?|cycles?)/i.test(clean(e.payoutTimingText)))return null;
    if(e.promoSourceUrl){try{const u=new URL(e.promoSourceUrl);if(u.protocol!=='https:'||u.username||u.password||u.hostname!=='banking.citi.com'||u.pathname!=='/cbol/OM/checking/enhanced-direct-deposit-offer/default.htm')return null;}catch{return null;}}
    return legacyOfferEvidence;
  }
  function arrivalRule(e){
    if(!e)return null;
    if(e.financialRules||Number(e.schemaVersion)>=3){
      const v=validate(e);return v.ok&&v.rules?savedPayoutWindow(v.rules):null;
    }
    const saved=payoutWindowFromText(e.payoutTimingText);if(saved)return saved;
    const offer=matchedLegacyOffer(e);return offer?payoutWindowFromText(offer.quote):null;
  }
  function arrivalSource(e){
    if(!e||e.closed||e.bonusRecd)return null;
    if(payoutWindowFromText(e?.payoutTimingText))return null;
    const offer=matchedLegacyOffer(e);return offer?{...offer}:null;
  }
  function estimatedArrival(e){
    if(!e||e.closed||e.bonusRecd)return null;
    const w=arrivalRule(e);if(!w)return null;
    let base=w.basis==='opened'?e.opened:w.basis==='reqmet'?e.reqMet:w.basis==='enrollment'?(e.offerEnrollmentDate||e.couponEnrollmentDate):'';
    if(w.basis==='enrollment'&&e.offerEnrollmentDate&&e.couponEnrollmentDate&&e.offerEnrollmentDate!==e.couponEnrollmentDate)return null;
    if(w.basis==='qualifying-period-end'){
      const req=e.financialRules?.requirements;
      if(req?.length){
        // Every requirement's exact deadline must be known; a DD checkbox is not an anchor.
        const ends=req.map(r=>{
          const t=r.timing;if(!t||!['opened','enrollment'].includes(t.basis))return '';
          if(t.basis==='enrollment'&&e.offerEnrollmentDate&&e.couponEnrollmentDate&&e.offerEnrollmentDate!==e.couponEnrollmentDate)return '';
          const b=t.basis==='opened'?e.opened:(e.offerEnrollmentDate||e.couponEnrollmentDate);
          return shiftPayoutDate(b,t.value,t.unit);
        });
        if(ends.some(x=>!x))return null;
        base=ends.sort().at(-1);
      }else return null;
    }
    if(!date(base)||w.basis==='reqmet'&&date(e.opened)&&base<e.opened)return null;
    const start=shiftPayoutDate(base,w.min,w.unit),end=shiftPayoutDate(base,w.max,w.unit);
    return start&&end?{start,end,basis:w.basis,anchor:base}:null;
  }
  function arrivalLabel(range){
    if(!range||!date(range.start)||!date(range.end))return '';
    const fmt=(d,year)=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',...(year?{year:'numeric'}:{}),timeZone:'UTC'}).format(new Date(d+'T00:00:00Z'));
    const crossYear=range.start.slice(0,4)!==range.end.slice(0,4);
    return 'Estimated bonus arrival: '+fmt(range.start,crossYear)+'–'+fmt(range.end,true);
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
    else if(intent==='payout'){text=[arrivalLabel(estimatedArrival(e)),s.payout].filter(Boolean).join('\n\n');step=e.bonusRecd?'Receipt is recorded. Review the closure checks next.':'Record receipt only after the bonus actually posts.';}
    else if(intent==='closure-fee'){text=s.closure;step='Use the tracker closure checks before closing or withdrawing a required balance.';}
    else return null;
    if(['fees','waiver','companion'].includes(intent))missing=s.warnings.filter(x=>/fee|waiv/i.test(x));
    return{answer:text,step,missing,factIds:['financialrules'],local:true};
  }
  const api=Object.freeze({VERSION,validate,summarize,answer,intentFor,waiverText,estimatedArrival,arrivalLabel,payoutWindowFromText,arrivalRule,arrivalSource});
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.BTFinancialRules=api;
})(typeof window!=='undefined'?window:globalThis);
