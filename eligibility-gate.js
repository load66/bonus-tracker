/* BonusTracker churn eligibility evidence gate v1.3.0 — conditional eligibility rules plus coupon/offer-enrollment cooldown anchors. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.BTEligibilityGate=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION='1.3.0';
  const SAFETY_BUFFER_DAYS=5;
  const NUMBER_WORDS={
    one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,
    thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,
    'twenty-one':21,'twenty-two':22,'twenty-three':23,'twenty-four':24,'twenty-five':25,'twenty-six':26,
    'twenty-seven':27,'twenty-eight':28,'twenty-nine':29,thirty:30,'thirty-one':31,'thirty-two':32,
    'thirty-three':33,'thirty-four':34,'thirty-five':35,'thirty-six':36
  };

  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const normalizeWord=v=>clean(v).toLowerCase().replace(/\s+/g,'-');
  function toNumber(v){
    if(/^\d+$/.test(String(v||'').trim()))return parseInt(v,10);
    return NUMBER_WORDS[normalizeWord(v)]||0;
  }
  function normalizeUnit(v){
    const x=clean(v).toLowerCase();
    if(/^days?$/.test(x))return'days';
    if(/^months?$/.test(x))return'months';
    if(/^years?$/.test(x))return'years';
    return'';
  }
  function normalizeBasis(v){
    const raw=clean(v).toLowerCase(),x=raw.replace(/[^a-z]/g,'');
    if(/couponenroll|offerenroll|enrollmentdate|enrolmentdate/.test(x))return'offer-enrollment';
    if(/bonusoffer|offerreceived|receivedoffer/.test(x))return'bonus-offer-received';
    if(/ownershipended|accountended|stoppedhaving|nolongerhad/.test(x))return'account-ownership-ended';
    if(/bonus|payout/.test(x))return'bonus-received';
    if(/open/.test(x))return'account-opened';
    if(/clos/.test(x))return'account-closed';
    return'';
  }
  function normalizeCondition(v){
    if(!v)return null;
    const raw=typeof v==='string'?v:(v.type||v.kind||'');
    const x=clean(raw).toLowerCase().replace(/[^a-z]/g,'');
    if(/negativebalance/.test(x))return{type:'closed-with-negative-balance',expected:v?.expected!==false};
    return null;
  }
  function legacyBasisKey(basis){
    return basis==='offer-enrollment'?'enrollment':
      basis==='bonus-offer-received'?'offer':
      basis==='account-ownership-ended'?'ownership-ended':
      basis==='bonus-received'?'bonus':
      basis==='account-opened'?'opened':
      basis==='account-closed'?'closed':'';
  }
  function decision(e){
    if(!e)return'';
    if(e.churnable===false||String(e.churnability||'').toLowerCase()==='not-repeatable'||String(e.lifecycleState||'')==='archived-nonrepeatable')return'nonrepeatable';
    if(e.churnable===true||/^(repeatable|churnable)$/i.test(String(e.churnability||''))||e.churn||e.churnPeriodValue||Array.isArray(e.eligibilityRules)&&e.eligibilityRules.length)return'repeatable';
    return'';
  }
  function periodFromValue(value,unit,source='exact'){
    const n=parseInt(value,10),u=normalizeUnit(unit);
    return n>0&&u?{value:n,unit:u,source}:null;
  }
  function periodFromEntry(e){
    if(!e)return null;
    const exact=periodFromValue(e.churnPeriodValue??e.analysis?.churnPeriodValue,e.churnPeriodUnit||e.analysis?.churnPeriodUnit||'','exact');
    if(exact)return exact;
    const legacy=String(e.churn||e.analysis?.churn||'').trim();
    if(legacy==='180')return{value:180,unit:'days',source:'legacy'};
    if(/^\d+$/.test(legacy)&&parseInt(legacy,10)>0)return{value:parseInt(legacy,10),unit:'years',source:'legacy'};
    return null;
  }
  function periodFromRule(r){
    return periodFromValue(r?.periodValue??r?.churnPeriodValue,r?.periodUnit||r?.churnPeriodUnit||'','exact');
  }
  function extractDurations(text){
    const s=clean(text).toLowerCase().replace(/(twenty|thirty)\s+(one|two|three|four|five|six|seven|eight|nine)/g,'$1-$2');
    const out=[];
    const re=/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|twenty-(?:one|two|three|four|five|six|seven|eight|nine)|thirty|thirty-(?:one|two|three|four|five|six))\s+(?:calendar\s+)?(days?|months?|years?)\b/gi;
    let m;
    while((m=re.exec(s))){
      const value=toNumber(m[1]),unit=normalizeUnit(m[2]);
      if(value&&unit)out.push({value,unit,text:m[0],index:m.index});
    }
    return out;
  }
  function equivalentPeriod(a,b){
    if(!a||!b)return false;
    if(a.unit===b.unit)return Number(a.value)===Number(b.value);
    if((a.unit==='months'||a.unit==='years')&&(b.unit==='months'||b.unit==='years')){
      const am=a.unit==='years'?a.value*12:a.value;
      const bm=b.unit==='years'?b.value*12:b.value;
      return am===bm;
    }
    return false;
  }
  function stripAbbreviationDots(text){
    return String(text||'').replace(/\b(?:[A-Za-z]\.){2,}/g,m=>m.replace(/\./g,''));
  }
  function splitEvidence(text){
    const protectedText=String(text||'').replace(/\b(?:[A-Za-z]\.){2,}/g,m=>m.replace(/\./g,'\uE000'));
    return protectedText.split(/(?:\n+|(?<=[.!?])\s+|;\s+)/).map(x=>clean(x.replace(/\uE000/g,'.'))).filter(Boolean);
  }
  function eligibilityContext(s){
    return /not eligible|ineligible|not available|cannot|can't|may not|must not|have not|has not|new (?:[^.]{0,40})?customers? only|new (?:[^.]{0,40})?accounts? only|previously received|received [^.]{0,80}bonus|only one [^.]{0,180}bonus|bonus [^.]{0,100}every|to be eligible[^.]{0,220}(?:cannot|must not|have not|has not)/i.test(s);
  }
  function basisContext(s,basis){
    const t=stripAbbreviationDots(clean(s));
    if(basis==='offer-enrollment')return /\b(?:coupon|offer)\s+enroll(?:ment|ed|ing)?\b|\benrollment\s+date\b|\blast\s+coupon\s+enrollment\s+date\b/i.test(t);
    if(basis==='bonus-offer-received')return /\breceiv(?:e|ed|ing)\b[^.;]{0,120}\bbonus\s+offers?\b|\bbonus\s+offers?\b[^.;]{0,120}\breceiv(?:e|ed|ing)\b/i.test(t);
    if(basis==='bonus-received'){
      if(/\bbonus\s+offers?\b/i.test(t))return false;
      if(basisContext(t,'offer-enrollment')&&/\bonly\s+one\b[^.;]{0,180}\bbonus\b[^.;]{0,100}\bevery\b/i.test(t))return false;
      return /(?:receiv(?:e|ed|ing)|paid|payment|payout|earn(?:ed|ing)?)\b[^.;]{0,100}\bbonus\b|\bbonus\b[^.;]{0,100}\b(?:receiv(?:e|ed|ing)|paid|payment|payout|earn(?:ed|ing)?)\b/i.test(t);
    }
    if(basis==='account-ownership-ended')return /\b(?:had|have|owned|owner(?:s)?)\b[^.;]{0,140}\b(?:account|checking|savings)\b|\b(?:account|checking|savings)\b[^.;]{0,140}\b(?:had|have|owned|owner(?:s)?)\b/i.test(t);
    if(basis==='account-opened')return /\b(?:opened|opening)\b[^.;]{0,50}\b(?:an?\s+|the\s+|your\s+)?(?:account|checking|savings)\b|\b(?:account|checking|savings)\b[^.;]{0,50}\b(?:was\s+)?opened\b|\b(?:after|from|since|of|within)\s+(?:the\s+)?(?:account|checking|savings)\s+opening\b/i.test(t);
    if(basis==='account-closed')return /\b(?:closed|closing|closure)\b[^.;]{0,120}\b(?:account|accounts?|checking|savings)\b|\b(?:account|accounts?|checking|savings)\b[^.;]{0,120}\b(?:closed|closing|closure)\b/i.test(t);
    return false;
  }
  function inferConditionForDuration(sentence,basis,period){
    if(basis!=='account-closed')return null;
    const t=stripAbbreviationDots(clean(sentence)).toLowerCase();
    const d=extractDurations(t).find(x=>equivalentPeriod(x,period));
    if(!d)return null;
    const before=t.slice(Math.max(0,d.index-100),d.index);
    if(/closed\s+with\s+(?:a\s+)?negative\s+balance|negative\s+balance[^.;]{0,60}closed/.test(before))return{type:'closed-with-negative-balance',expected:true};
    return null;
  }
  function matchingTimedSentence(text,basis,period){
    return splitEvidence(text).find(s=>eligibilityContext(s)&&basisContext(s,basis)&&extractDurations(s).some(x=>equivalentPeriod(x,period)))||'';
  }
  function discoverTimedRestrictions(text){
    const out=[],seen=new Set(),bases=['offer-enrollment','bonus-offer-received','bonus-received','account-ownership-ended','account-opened','account-closed'];
    splitEvidence(text).forEach(sentence=>{
      const eligible=eligibilityContext(sentence);
      if(!eligible)return;
      bases.forEach(basis=>{
        if(!basisContext(sentence,basis))return;
        extractDurations(sentence).forEach(period=>{
          const timedLookback=/past|previous|preceding|prior|previously|last\s+\d|within|every\b|from\s+the\s+last/i.test(sentence);
          if(!timedLookback)return;
          const condition=inferConditionForDuration(sentence,basis,period);
          const key=basis+'|'+period.value+'|'+period.unit+'|'+(condition?.type||'always');
          if(seen.has(key))return;seen.add(key);
          out.push({basis,period:{value:period.value,unit:period.unit,source:'discovered'},condition,evidenceSentence:sentence});
        });
      });
    });
    return out;
  }
  function nonRepeatableSentence(text){
    return splitEvidence(text).find(s=>{
      if(/once per lifetime|one[- ]time bonus only|not repeatable|lifetime[- ]?like/i.test(s))return true;
      if(extractDurations(s).length)return false;
      return /(?:not eligible|ineligible|not available|cannot|can't|may not)[^.;]{0,180}(?:ever|previously)[^.;]{0,120}(?:received|earned)[^.;]{0,100}bonus|(?:ever|previously)[^.;]{0,120}(?:received|earned)[^.;]{0,100}bonus[^.;]{0,120}(?:not eligible|ineligible|not available)/i.test(s);
    })||'';
  }
  function evidenceText(e){
    return clean(e?.eligibilityEvidenceText||e?.analysis?.eligibilityEvidenceText||e?.churnRuleText||e?.analysis?.churnRuleText||e?.eligibilityText||e?.analysis?.eligibilityText||'');
  }
  function rawTerms(e){
    const ruleText=Array.isArray(e?.eligibilityRules)?e.eligibilityRules.map(r=>r?.evidenceText||r?.eligibilityEvidenceText||'').filter(Boolean):[];
    return clean([
      e?.tcSourceRaw,e?.analysis?.rawText,e?.analysis?.sourceText,evidenceText(e),
      e?.eligibilityText,e?.analysis?.eligibilityText,e?.churnRuleText,e?.churnReason,
      e?.currentCustomerEvidenceText,e?.analysis?.currentCustomerEvidenceText,...ruleText
    ].filter(Boolean).join('\n'));
  }
  function evidenceSource(e){
    const explicit=clean(e?.eligibilityEvidenceSource||e?.analysis?.eligibilityEvidenceSource||e?.eligibilitySourceUrl||e?.analysis?.eligibilitySourceUrl||'');
    if(explicit)return explicit;
    if(clean(e?.tcSourceId||e?.analysis?.sourceId||''))return'saved-tc';
    if(clean(e?.tcSourceRaw||e?.analysis?.rawText||''))return'saved-tc';
    const d=clean(e?.churnDecisionSource||e?.analysis?.churnDecisionSource||'').toLowerCase();
    if(/current-tc|official|verified-json|analyzer-reviewed/.test(d))return d;
    return'';
  }
  function currentCustomerRestriction(text){
    const sentence=splitEvidence(clean(text)).find(s=>{
      const q=stripAbbreviationDots(s);
      return /new [^.]{0,80}(?:customer|checking|savings|account)[^.]{0,80}only/i.test(q)||
        /(?:not eligible|ineligible|not available|cannot|can't|may not)[^.]{0,160}(?:current|existing)[^.]{0,100}(?:customer|owner|account|checking|savings)/i.test(q)||
        /(?:current|existing)[^.]{0,100}(?:customer|owner|account|checking|savings)[^.]{0,160}(?:not eligible|ineligible|not available|cannot|can't|may not)/i.test(q)
    })||'';
    return{excluded:!!sentence,sentence};
  }
  function basisDate(e,basis,rule){
    if(rule?.anchorDate)return clean(rule.anchorDate);
    if(basis==='offer-enrollment'){
      const explicit=clean(e?.couponEnrollmentDate||e?.offerEnrollmentDate);
      if(explicit)return explicit;
      if(rule?.anchorFallback==='account-opened'||rule?.anchorFallbackBasis==='account-opened')return clean(e?.opened);
      return'';
    }
    if(basis==='bonus-received')return clean(e?.bonusRecd);
    if(basis==='bonus-offer-received')return clean(e?.bonusOfferReceived||e?.offerReceivedDate);
    if(basis==='account-opened')return clean(e?.opened);
    if(basis==='account-closed'||basis==='account-ownership-ended')return clean(e?.closed);
    return'';
  }
  function ruleConditionState(e,rule){
    const c=normalizeCondition(rule?.condition);
    if(!c)return'active';
    if(c.type==='closed-with-negative-balance'){
      if(typeof e?.closedWithNegativeBalance!=='boolean')return'unknown';
      return e.closedWithNegativeBalance===c.expected?'active':'inactive';
    }
    return'unknown';
  }
  function normalizeRule(r,e,index){
    const fallbackSource=evidenceSource(e);
    return{
      id:clean(r?.id)||('rule-'+(index+1)),
      basis:normalizeBasis(r?.basis||r?.sourceEligibilityBasis||r?.churnBasis||''),
      period:periodFromRule(r),
      evidenceText:clean(r?.evidenceText||r?.eligibilityEvidenceText||''),
      evidenceSource:clean(r?.evidenceSource||r?.eligibilityEvidenceSource||fallbackSource),
      scope:clean(r?.scope||r?.eligibilityScope||''),
      anchorDate:clean(r?.anchorDate||r?.eligibilityAnchorDate||''),
      anchorFallback:clean(r?.anchorFallback||r?.anchorFallbackBasis||''),
      condition:normalizeCondition(r?.condition||r?.appliesWhen)
    };
  }
  function normalizedRules(e){
    const raw=Array.isArray(e?.eligibilityRules)?e.eligibilityRules.filter(r=>r&&typeof r==='object'):[];
    if(raw.length)return raw.map((r,i)=>normalizeRule(r,e,i));
    const p=periodFromEntry(e),basis=normalizeBasis(e?.sourceEligibilityBasis||e?.churnBasis||e?.analysis?.sourceEligibilityBasis||e?.analysis?.churnBasis||'');
    if(!p&&!basis&&!evidenceText(e))return[];
    return [{
      id:'rule-1',
      basis,
      period:p,
      evidenceText:evidenceText(e),
      evidenceSource:evidenceSource(e),
      scope:clean(e?.eligibilityScope||e?.analysis?.eligibilityScope||'')
    }];
  }
  function validateRule(rule,index){
    if(!rule.basis)return{ok:false,status:'unresolved',reason:'Eligibility rule '+(index+1)+' is missing its clock anchor.'};
    if(!rule.period)return{ok:false,status:'unresolved',reason:'Eligibility rule '+(index+1)+' is missing its exact cooldown length and unit.'};
    if(!rule.evidenceText)return{ok:false,status:'unresolved',reason:'Eligibility rule '+(index+1)+' is missing exact T&C evidence.'};
    if(!rule.evidenceSource)return{ok:false,status:'unresolved',reason:'Eligibility rule '+(index+1)+' is not tied to a saved T&C source.'};
    const sentence=matchingTimedSentence(rule.evidenceText,rule.basis,rule.period);
    if(!sentence)return{ok:false,status:'conflict',reason:'Eligibility rule '+(index+1)+' does not match its saved T&C wording.'};
    const requiredCondition=inferConditionForDuration(sentence,rule.basis,rule.period);
    const savedCondition=normalizeCondition(rule.condition);
    if(requiredCondition&&!savedCondition)return{ok:false,status:'incomplete',reason:'Eligibility rule '+(index+1)+' is conditional in the T&C but the condition is missing from the rule.'};
    if(requiredCondition&&savedCondition?.type!==requiredCondition.type)return{ok:false,status:'conflict',reason:'Eligibility rule '+(index+1)+' has the wrong condition for the saved T&C wording.'};
    if(!requiredCondition&&savedCondition)return{ok:false,status:'conflict',reason:'Eligibility rule '+(index+1)+' adds a condition that the saved T&C wording does not support.'};
    return{ok:true,status:'verified',rule:{...rule,condition:savedCondition,evidenceSentence:sentence}};
  }
  function validate(e){
    const d=decision(e),scope=rawTerms(e),current=currentCustomerRestriction(scope);
    if(!d)return{ok:false,status:'unresolved',decision:'',reason:'T&C does not establish whether this bonus is repeatable.',currentCustomerExcluded:current.excluded,currentCustomerSentence:current.sentence};
    if(d==='nonrepeatable'){
      const evidence=evidenceText(e),source=evidenceSource(e),sentence=nonRepeatableSentence(evidence);
      if(!evidence)return{ok:false,status:'unresolved',decision:d,reason:'Exact non-repeatable wording from the T&C is missing.',evidenceText:'',evidenceSource:source,currentCustomerExcluded:current.excluded,currentCustomerSentence:current.sentence};
      if(!source)return{ok:false,status:'unresolved',decision:d,reason:'The non-repeatable wording is not tied to a saved T&C source.',evidenceText:evidence,evidenceSource:'',currentCustomerExcluded:current.excluded,currentCustomerSentence:current.sentence};
      if(!sentence)return{ok:false,status:'conflict',decision:d,reason:'The saved T&C wording does not prove that the bonus is non-repeatable.',evidenceText:evidence,evidenceSource:source,currentCustomerExcluded:current.excluded,currentCustomerSentence:current.sentence};
      return{ok:true,status:'verified',decision:d,rules:[],evidenceSentence:sentence,evidenceText:evidence,evidenceSource:source,currentCustomerExcluded:current.excluded,currentCustomerSentence:current.sentence,mustCloseBeforeReapply:false};
    }
    const rules=normalizedRules(e);
    if(!rules.length)return{ok:false,status:'unresolved',decision:d,reason:'No churn eligibility restriction was saved from the T&C.',currentCustomerExcluded:current.excluded,currentCustomerSentence:current.sentence};
    const checked=rules.map(validateRule);
    const bad=checked.find(x=>!x.ok);
    if(bad)return{ok:false,status:bad.status,decision:d,reason:bad.reason,rules:checked.map(x=>x.rule).filter(Boolean),currentCustomerExcluded:current.excluded,currentCustomerSentence:current.sentence};
    const verifiedRules=checked.map(x=>x.rule);
    const sourceText=clean(e?.tcSourceRaw||e?.analysis?.rawText||'');
    if(sourceText){
      const discovered=discoverTimedRestrictions(sourceText);
      const missing=discovered.find(d=>!verifiedRules.some(r=>{
        if(r.basis!==d.basis||!equivalentPeriod(r.period,d.period))return false;
        const a=normalizeCondition(r.condition),b=normalizeCondition(d.condition);
        return (a?.type||'')===(b?.type||'');
      }));
      if(missing)return{
        ok:false,status:'incomplete',decision:d,
        reason:'The T&C contains an additional '+periodLabel(missing.period)+' '+anchorLabel(missing.basis)+' eligibility restriction that is missing from eligibilityRules.',
        rules:verifiedRules,currentCustomerExcluded:current.excluded,currentCustomerSentence:current.sentence
      };
    }
    const single=verifiedRules.length===1?verifiedRules[0]:null;
    return{
      ok:true,status:'verified',decision:d,rules:verifiedRules,
      basis:single?.basis||'',period:single?.period||null,
      evidenceSentence:single?.evidenceSentence||'',evidenceText:single?.evidenceText||evidenceText(e),
      evidenceSource:single?.evidenceSource||evidenceSource(e),
      currentCustomerExcluded:current.excluded,currentCustomerSentence:current.sentence,mustCloseBeforeReapply:current.excluded
    };
  }
  function applyPeriod(date,period,addD,addM){
    if(!date||!period)return'';
    if(period.unit==='days')return addD(date,period.value);
    if(period.unit==='months')return addM(date,period.value);
    if(period.unit==='years')return addM(date,period.value*12);
    return'';
  }
  function officialEligibilityDates(e,addD,addM){
    const v=validate(e);if(!v.ok||v.decision!=='repeatable')return[];
    return v.rules.map(rule=>{
      const conditionState=ruleConditionState(e,rule);
      const anchorDate=conditionState==='active'?basisDate(e,rule.basis,rule):'';
      const eligibleDate=conditionState==='active'&&anchorDate?applyPeriod(anchorDate,rule.period,addD,addM):'';
      return{...rule,conditionState,anchorDate,eligibleDate};
    });
  }
  function officialEligibilityDate(e,addD,addM){
    const rows=officialEligibilityDates(e,addD,addM);
    if(!rows.length||rows.some(r=>r.conditionState==='unknown'))return'';
    const active=rows.filter(r=>r.conditionState==='active');
    if(!active.length||active.some(r=>!r.eligibleDate))return'';
    return active.map(r=>r.eligibleDate).sort().at(-1)||'';
  }
  function controllingRule(e,addD,addM){
    const rows=officialEligibilityDates(e,addD,addM).filter(r=>r.conditionState==='active'&&r.eligibleDate);
    if(!rows.length)return null;
    return rows.sort((a,b)=>b.eligibleDate.localeCompare(a.eligibleDate))[0]||null;
  }
  function safeEligibilityDate(e,addD,addM){
    const official=officialEligibilityDate(e,addD,addM);
    return official?addD(official,SAFETY_BUFFER_DAYS):'';
  }
  function applicationReadyDate(e,addD,addM){
    const v=validate(e);if(!v.ok||v.decision!=='repeatable')return'';
    const safe=safeEligibilityDate(e,addD,addM);if(!safe)return'';
    if(!v.mustCloseBeforeReapply)return safe;
    const closed=clean(e?.closed);if(!closed)return'';
    return closed>safe?closed:safe;
  }
  function periodLabel(period){
    if(!period)return'';
    return period.value+' '+period.unit.replace(/s$/,'')+(period.value===1?'':'s');
  }
  function anchorLabel(basis){
    return basis==='offer-enrollment'?'coupon/offer enrollment':
      basis==='bonus-received'?'bonus payout received':
      basis==='bonus-offer-received'?'bonus offer received':
      basis==='account-opened'?'account opened':
      basis==='account-ownership-ended'?'account ownership ended':
      basis==='account-closed'?'account closed':'';
  }
  function summary(e){
    const v=validate(e);
    if(!v.ok)return'T&C verification required — '+v.reason;
    if(v.decision==='nonrepeatable')return'Non-repeatable — source T&C verified';
    let s=v.rules.length===1
      ?periodLabel(v.rules[0].period)+' after '+anchorLabel(v.rules[0].basis)
      :(v.rules.length+' eligibility rules · all must clear');
    s+=' + '+SAFETY_BUFFER_DAYS+'-day safety buffer';
    if(v.mustCloseBeforeReapply)s+=' · account must also be closed before reapplying';
    return s;
  }
  function stamp(e){
    const out={...(e||{})},v=validate(out);
    out.eligibilityVerified=!!v.ok;
    out.eligibilityVerificationStatus=v.status;
    out.eligibilityVerificationReason=v.reason||'';
    if(v.ok&&v.decision==='repeatable'){
      out.eligibilityRules=v.rules.map(r=>({
        id:r.id,basis:r.basis,periodValue:r.period.value,periodUnit:r.period.unit,
        evidenceText:r.evidenceText,evidenceSource:r.evidenceSource,scope:r.scope||'',anchorDate:r.anchorDate||'',
        anchorFallback:r.anchorFallback||'',condition:r.condition||null
      }));
      if(v.rules.length===1){
        const r=v.rules[0];
        out.sourceEligibilityBasis=r.basis;
        out.churnBasis=legacyBasisKey(r.basis);
        out.churnPeriodValue=r.period.value;out.churnPeriodUnit=r.period.unit;
        out.eligibilityEvidenceText=r.evidenceText;out.eligibilityAnchorEvidenceText=r.evidenceSentence;
        out.eligibilityEvidenceSource=r.evidenceSource;
      }else if(v.rules.length>1){
        out.sourceEligibilityBasis='multiple';
        out.churnBasis='multiple';
        out.churnPeriodValue=0;
        out.churnPeriodUnit='';
      }
    }else if(v.ok&&v.decision==='nonrepeatable'){
      out.eligibilityEvidenceSource=v.evidenceSource||out.eligibilityEvidenceSource||'';
      if(v.evidenceText)out.eligibilityEvidenceText=v.evidenceText;
      if(v.evidenceSentence)out.eligibilityAnchorEvidenceText=v.evidenceSentence;
    }
    if(v.currentCustomerSentence)out.currentCustomerEvidenceText=v.currentCustomerSentence;
    out.currentCustomerExcluded=!!v.currentCustomerExcluded;
    out.mustCloseBeforeReapply=!!v.mustCloseBeforeReapply;
    out.reapplicationAction=v.decision==='nonrepeatable'?'do-not-churn':v.ok?(v.mustCloseBeforeReapply?'close-before-reapply':'cooldown-only'):'review-required';
    if(v.ok)out.eligibilityVerifiedAt=out.eligibilityVerifiedAt||new Date().toISOString();
    return out;
  }

  return{
    VERSION,SAFETY_BUFFER_DAYS,normalizeBasis,normalizeUnit,normalizeCondition,legacyBasisKey,decision,periodFromEntry,periodFromRule,extractDurations,equivalentPeriod,
    evidenceText,evidenceSource,rawTerms,currentCustomerRestriction,discoverTimedRestrictions,ruleConditionState,normalizedRules,validate,stamp,officialEligibilityDates,
    officialEligibilityDate,controllingRule,safeEligibilityDate,applicationReadyDate,periodLabel,anchorLabel,summary
  };
});
