/* BonusTracker churn eligibility evidence gate v1.1.0 — all applicable T&C restrictions must verify and clear. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.BTEligibilityGate=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION='1.1.0';
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
    return splitEvidence(text).find(s=>eligibilityContext(s)&&basisContext(s,basis)&&extractDurations(s).some(x=>equivalentPeriod(x,period)))||'';
  }
  function lookbackRestrictionContext(s){
    return /not eligible|ineligible|not available|cannot|can't|may not|must not|do not qualify|does not qualify|aren't eligible|isn't eligible/i.test(s)
      && /past|previous|preceding|prior|previously|last\s+\d|before\s+(?:opening|applying)|prior\s+to/i.test(s);
  }
  function discoverTimedRestrictions(text){
    const out=[],seen=new Set(),bases=['bonus-received','account-opened','account-closed'];
    splitEvidence(text).forEach(sentence=>{
      if(!lookbackRestrictionContext(sentence))return;
      bases.forEach(basis=>{
        if(!basisContext(sentence,basis))return;
        extractDurations(sentence).forEach(period=>{
          const key=basis+'|'+period.value+'|'+period.unit;
          if(seen.has(key))return;seen.add(key);
          out.push({basis,period:{value:period.value,unit:period.unit,source:'discovered'},evidenceSentence:sentence});
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
    const sentence=splitEvidence(clean(text)).find(s=>
      /new [^.]{0,80}(?:customer|checking|savings|account)[^.]{0,80}only/i.test(s)||
      /(?:not eligible|ineligible|not available|cannot|can't|may not)[^.]{0,160}(?:current|existing)[^.]{0,100}(?:customer|owner|account|checking|savings)/i.test(s)||
      /(?:current|existing)[^.]{0,100}(?:customer|owner|account|checking|savings)[^.]{0,160}(?:not eligible|ineligible|not available|cannot|can't|may not)/i.test(s)
    )||'';
    return{excluded:!!sentence,sentence};
  }
  function basisDate(e,basis){
    return basis==='bonus-received'?clean(e?.bonusRecd):basis==='account-opened'?clean(e?.opened):basis==='account-closed'?clean(e?.closed):'';
  }
  function normalizeRule(r,e,index){
    const fallbackSource=evidenceSource(e);
    return{
      id:clean(r?.id)||('rule-'+(index+1)),
      basis:normalizeBasis(r?.basis||r?.sourceEligibilityBasis||r?.churnBasis||''),
      period:periodFromRule(r),
      evidenceText:clean(r?.evidenceText||r?.eligibilityEvidenceText||''),
      evidenceSource:clean(r?.evidenceSource||r?.eligibilityEvidenceSource||fallbackSource),
      scope:clean(r?.scope||r?.eligibilityScope||'')
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
    return{ok:true,status:'verified',rule:{...rule,evidenceSentence:sentence}};
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
      const missing=discovered.find(d=>!verifiedRules.some(r=>r.basis===d.basis&&equivalentPeriod(r.period,d.period)));
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
      const anchorDate=basisDate(e,rule.basis);
      const eligibleDate=anchorDate?applyPeriod(anchorDate,rule.period,addD,addM):'';
      return{...rule,anchorDate,eligibleDate};
    });
  }
  function officialEligibilityDate(e,addD,addM){
    const rows=officialEligibilityDates(e,addD,addM);
    if(!rows.length||rows.some(r=>!r.eligibleDate))return'';
    return rows.map(r=>r.eligibleDate).sort().at(-1)||'';
  }
  function controllingRule(e,addD,addM){
    const rows=officialEligibilityDates(e,addD,addM).filter(r=>r.eligibleDate);
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
    return basis==='bonus-received'?'bonus received':basis==='account-opened'?'account opened':basis==='account-closed'?'account closed':'';
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
        evidenceText:r.evidenceText,evidenceSource:r.evidenceSource,scope:r.scope||''
      }));
      if(v.rules.length===1){
        const r=v.rules[0];
        out.sourceEligibilityBasis=r.basis;
        out.churnBasis=r.basis==='bonus-received'?'bonus':r.basis==='account-opened'?'opened':'closed';
        out.churnPeriodValue=r.period.value;out.churnPeriodUnit=r.period.unit;
        out.eligibilityEvidenceText=r.evidenceText;out.eligibilityAnchorEvidenceText=r.evidenceSentence;
        out.eligibilityEvidenceSource=r.evidenceSource;
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
    VERSION,SAFETY_BUFFER_DAYS,normalizeBasis,normalizeUnit,decision,periodFromEntry,periodFromRule,extractDurations,equivalentPeriod,
    evidenceText,evidenceSource,rawTerms,currentCustomerRestriction,discoverTimedRestrictions,normalizedRules,validate,stamp,officialEligibilityDates,
    officialEligibilityDate,controllingRule,safeEligibilityDate,applicationReadyDate,periodLabel,anchorLabel,summary
  };
});
