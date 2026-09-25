/* BonusTracker churn eligibility evidence gate v1.0.0 — fail closed unless source T&C supports the repeatability, clock basis, and exact cooldown. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.BTEligibilityGate=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION='1.0.0';
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
    const x=clean(v).toLowerCase().replace(/[^a-z]/g,'');
    if(/bonus|payout/.test(x))return'bonus-received';
    if(/open/.test(x))return'account-opened';
    if(/clos/.test(x))return'account-closed';
    return'';
  }
  function decision(e){
    if(!e)return'';
    if(e.churnable===false||String(e.churnability||'').toLowerCase()==='not-repeatable'||String(e.lifecycleState||'')==='archived-nonrepeatable')return'nonrepeatable';
    if(e.churnable===true||/^(repeatable|churnable)$/i.test(String(e.churnability||''))||e.churn||e.churnPeriodValue)return'repeatable';
    return'';
  }
  function periodFromEntry(e){
    if(!e)return null;
    const value=parseInt(e.churnPeriodValue??e.analysis?.churnPeriodValue,10);
    const unit=normalizeUnit(e.churnPeriodUnit||e.analysis?.churnPeriodUnit||'');
    if(value>0&&unit)return{value,unit,source:'exact'};
    const legacy=String(e.churn||e.analysis?.churn||'').trim();
    if(legacy==='180')return{value:180,unit:'days',source:'legacy'};
    if(/^\d+$/.test(legacy)&&parseInt(legacy,10)>0)return{value:parseInt(legacy,10),unit:'years',source:'legacy'};
    return null;
  }
  function extractDurations(text){
    const s=clean(text).toLowerCase().replace(/(twenty|thirty)\s+(one|two|three|four|five|six|seven|eight|nine)/g,'$1-$2');
    const out=[];
    const re=/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|twenty-(?:one|two|three|four|five|six|seven|eight|nine)|thirty|thirty-(?:one|two|three|four|five|six))\s+(?:calendar\s+)?(days?|months?|years?)\b/gi;
    let m;
    while((m=re.exec(s))){
      const value=toNumber(m[1]),unit=normalizeUnit(m[2]);
      if(value&&unit)out.push({value,unit,text:m[0]});
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
  function splitEvidence(text){
    return String(text||'').split(/(?:\n+|(?<=[.!?])\s+|;\s+)/).map(clean).filter(Boolean);
  }
  function eligibilityContext(s){
    return /not eligible|ineligible|not available|cannot|can't|may not|must not|have not|has not|new (?:[^.]{0,40})?customers? only|new (?:[^.]{0,40})?accounts? only|previously received|received [^.]{0,80}bonus|past|previous|preceding|within/i.test(s);
  }
  function basisContext(s,basis){
    if(basis==='bonus-received')return /(?:receiv(?:e|ed|ing)|paid|payment|payout|earn(?:ed|ing)?)\b[^.;]{0,100}\bbonus\b|\bbonus\b[^.;]{0,100}\b(?:receiv(?:e|ed|ing)|paid|payment|payout|earn(?:ed|ing)?)\b/i.test(s);
    if(basis==='account-opened')return /\b(?:opened|opening)\b[^.;]{0,100}\b(?:account|checking|savings)\b|\b(?:account|checking|savings)\b[^.;]{0,100}\b(?:opened|opening)\b/i.test(s);
    if(basis==='account-closed')return /\b(?:closed|closing|closure)\b[^.;]{0,100}\b(?:account|checking|savings)\b|\b(?:account|checking|savings)\b[^.;]{0,100}\b(?:closed|closing|closure)\b/i.test(s);
    return false;
  }
  function matchingTimedSentence(text,basis,period){
    const lines=splitEvidence(text);
    return lines.find(s=>{
      if(!eligibilityContext(s)||!basisContext(s,basis))return false;
      return extractDurations(s).some(x=>equivalentPeriod(x,period));
    })||'';
  }
  function nonRepeatableSentence(text){
    return splitEvidence(text).find(s=>{
      if(/once per lifetime|one[- ]time bonus only|not repeatable|lifetime[- ]?like/i.test(s))return true;
      if(extractDurations(s).length)return false;
      return /(?:not eligible|ineligible|not available|cannot|can't|may not)[^.;]{0,180}(?:ever|previously)[^.;]{0,120}(?:received|earned)[^.;]{0,100}bonus|(?:ever|previously)[^.;]{0,120}(?:received|earned)[^.;]{0,100}bonus[^.;]{0,120}(?:not eligible|ineligible|not available)/i.test(s);
    })||'';
  }
  function evidenceText(e){
    return clean(
      e?.eligibilityEvidenceText||
      e?.analysis?.eligibilityEvidenceText||
      e?.churnRuleText||
      e?.analysis?.churnRuleText||
      e?.eligibilityText||
      e?.analysis?.eligibilityText||
      ''
    );
  }
  function rawTerms(e){
    return clean([
      e?.tcSourceRaw,e?.analysis?.rawText,e?.analysis?.sourceText,
      e?.eligibilityEvidenceText,e?.analysis?.eligibilityEvidenceText,
      e?.eligibilityText,e?.analysis?.eligibilityText,e?.churnRuleText,e?.churnReason,e?.currentCustomerEvidenceText,e?.analysis?.currentCustomerEvidenceText
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
    const scope=clean(text);
    const lines=splitEvidence(scope);
    const sentence=lines.find(s=>
      /new [^.]{0,80}(?:customer|checking|savings|account)[^.]{0,80}only/i.test(s)||
      /(?:not eligible|ineligible|not available|cannot|can't|may not)[^.]{0,160}(?:current|existing)[^.]{0,100}(?:customer|owner|account|checking|savings)/i.test(s)||
      /(?:current|existing)[^.]{0,100}(?:customer|owner|account|checking|savings)[^.]{0,160}(?:not eligible|ineligible|not available|cannot|can't|may not)/i.test(s)
    )||'';
    return{excluded:!!sentence,sentence};
  }
  function basisDate(e,basis){
    return basis==='bonus-received'?clean(e?.bonusRecd):basis==='account-opened'?clean(e?.opened):basis==='account-closed'?clean(e?.closed):'';
  }
  function validate(e){
    const d=decision(e);
    const evidence=evidenceText(e);
    const source=evidenceSource(e);
    const scope=rawTerms(e)||evidence;
    const current=currentCustomerRestriction(scope);
    if(!d)return{ok:false,status:'unresolved',decision:'',reason:'T&C does not establish whether this bonus is repeatable.',evidenceText:evidence,evidenceSource:source,currentCustomerExcluded:current.excluded,currentCustomerSentence:current.sentence};
    if(!evidence)return{ok:false,status:'unresolved',decision:d,reason:'Exact churn eligibility wording from the T&C is missing.',evidenceText:'',evidenceSource:source,currentCustomerExcluded:current.excluded,currentCustomerSentence:current.sentence};
    if(!source)return{ok:false,status:'unresolved',decision:d,reason:'The churn wording is not tied to a saved T&C source.',evidenceText:evidence,evidenceSource:'',currentCustomerExcluded:current.excluded,currentCustomerSentence:current.sentence};
    if(d==='nonrepeatable'){
      const sentence=nonRepeatableSentence(evidence);
      if(!sentence)return{ok:false,status:'conflict',decision:d,reason:'The saved T&C wording does not prove that the bonus is non-repeatable.',evidenceText:evidence,evidenceSource:source,currentCustomerExcluded:current.excluded,currentCustomerSentence:current.sentence};
      return{ok:true,status:'verified',decision:d,basis:'',period:null,evidenceSentence:sentence,evidenceText:evidence,evidenceSource:source,currentCustomerExcluded:current.excluded,currentCustomerSentence:current.sentence,mustCloseBeforeReapply:false};
    }
    const basis=normalizeBasis(e?.sourceEligibilityBasis||e?.churnBasis||e?.analysis?.sourceEligibilityBasis||e?.analysis?.churnBasis||'');
    if(!basis)return{ok:false,status:'unresolved',decision:d,reason:'The T&C churn clock must identify bonus received, account opened, or account closed as the anchor.',evidenceText:evidence,evidenceSource:source,currentCustomerExcluded:current.excluded,currentCustomerSentence:current.sentence};
    const period=periodFromEntry(e);
    if(!period)return{ok:false,status:'unresolved',decision:d,basis,reason:'The exact cooldown length and unit are missing.',evidenceText:evidence,evidenceSource:source,currentCustomerExcluded:current.excluded,currentCustomerSentence:current.sentence};
    const sentence=matchingTimedSentence(evidence,basis,period);
    if(!sentence)return{ok:false,status:'conflict',decision:d,basis,period,reason:'The selected churn basis or cooldown does not match the saved T&C wording.',evidenceText:evidence,evidenceSource:source,currentCustomerExcluded:current.excluded,currentCustomerSentence:current.sentence};
    return{ok:true,status:'verified',decision:d,basis,period,evidenceSentence:sentence,evidenceText:evidence,evidenceSource:source,currentCustomerExcluded:current.excluded,currentCustomerSentence:current.sentence,mustCloseBeforeReapply:current.excluded};
  }
  function applyPeriod(date,period,addD,addM){
    if(!date||!period)return'';
    if(period.unit==='days')return addD(date,period.value);
    if(period.unit==='months')return addM(date,period.value);
    if(period.unit==='years')return addM(date,period.value*12);
    return'';
  }
  function officialEligibilityDate(e,addD,addM){
    const v=validate(e);if(!v.ok||v.decision!=='repeatable')return'';
    const start=basisDate(e,v.basis);if(!start)return'';
    return applyPeriod(start,v.period,addD,addM);
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
    return basis==='bonus-received'?'bonus received':basis==='account-opened'?'account opened':basis==='account-closed'?'account closed':'';
  }
  function summary(e){
    const v=validate(e);
    if(!v.ok)return'T&C verification required — '+v.reason;
    if(v.decision==='nonrepeatable')return'Non-repeatable — source T&C verified';
    let s=periodLabel(v.period)+' after '+anchorLabel(v.basis)+' + '+SAFETY_BUFFER_DAYS+'-day safety buffer';
    if(v.mustCloseBeforeReapply)s+=' · account must also be closed before reapplying';
    return s;
  }
  function stamp(e){
    const out={...(e||{})};
    const v=validate(out);
    out.eligibilityVerified=!!v.ok;
    out.eligibilityVerificationStatus=v.status;
    out.eligibilityVerificationReason=v.reason||'';
    out.eligibilityEvidenceSource=v.evidenceSource||out.eligibilityEvidenceSource||'';
    if(v.evidenceText)out.eligibilityEvidenceText=v.evidenceText;
    if(v.evidenceSentence)out.eligibilityAnchorEvidenceText=v.evidenceSentence;
    if(v.currentCustomerSentence)out.currentCustomerEvidenceText=v.currentCustomerSentence;
    if(v.period){out.churnPeriodValue=v.period.value;out.churnPeriodUnit=v.period.unit;}
    out.currentCustomerExcluded=!!v.currentCustomerExcluded;
    out.mustCloseBeforeReapply=!!v.mustCloseBeforeReapply;
    out.reapplicationAction=v.decision==='nonrepeatable'?'do-not-churn':v.ok?(v.mustCloseBeforeReapply?'close-before-reapply':'cooldown-only'):'review-required';
    if(v.ok)out.eligibilityVerifiedAt=out.eligibilityVerifiedAt||new Date().toISOString();
    return out;
  }

  return{
    VERSION,SAFETY_BUFFER_DAYS,normalizeBasis,normalizeUnit,decision,periodFromEntry,extractDurations,equivalentPeriod,
    evidenceText,evidenceSource,rawTerms,currentCustomerRestriction,validate,stamp,officialEligibilityDate,safeEligibilityDate,
    applicationReadyDate,periodLabel,anchorLabel,summary
  };
});
