/* BonusTracker v3.4.29 — verified eligibility first, with safe legacy churn fallback for pre-v2 records. */
(function(){
  'use strict';
  const VER='3.4.29';
  const SAFETY_BUFFER_DAYS=5;

  function decision(e){
    try{if(typeof window.churnDecisionForEntry==='function')return window.churnDecisionForEntry(e)}catch{}
    if(e?.churnable===false||e?.churnability==='not-repeatable')return'nonrepeatable';
    if(e?.churnable===true||e?.churnability==='repeatable'||e?.churn)return'repeatable';
    return'';
  }
  function basisKey(v){
    const x=String(v||'').toLowerCase().replace(/[^a-z]/g,'');
    if(/couponenroll|offerenroll|enrollmentdate|enrolmentdate/.test(x))return'enrollment';
    if(/bonusoffer|offerreceived|receivedoffer/.test(x))return'offer';
    if(/ownershipended|accountended|stoppedhaving|nolongerhad/.test(x))return'ownership-ended';
    if(/bonus|payout/.test(x))return'bonus';
    if(/open/.test(x))return'opened';
    if(/clos/.test(x))return'closed';
    return'';
  }
  function sourceLabel(b){
    return b==='enrollment'?'offer-enrollment':
      b==='offer'?'bonus-offer-received':
      b==='ownership-ended'?'account-ownership-ended':
      b==='bonus'?'bonus-received':
      b==='opened'?'account-opened':
      b==='closed'?'account-closed':''
  }
  function verification(e){
    try{if(window.BTEligibilityGate&&typeof window.BTEligibilityGate.validate==='function')return window.BTEligibilityGate.validate(e)}catch{}
    return{ok:false,status:'unresolved',reason:'Eligibility evidence validator unavailable'};
  }
  function hasStructuredEligibilityEvidence(e){
    if(!e)return false;
    const ownRules=Array.isArray(e.eligibilityRules)?e.eligibilityRules:[];
    const analysisRules=Array.isArray(e.analysis?.eligibilityRules)?e.analysis.eligibilityRules:[];
    if(ownRules.length||analysisRules.length)return true;
    const evidenceText=String(e.eligibilityEvidenceText||e.analysis?.eligibilityEvidenceText||'').trim();
    const evidenceSource=String(e.eligibilityEvidenceSource||e.analysis?.eligibilityEvidenceSource||'').trim();
    return !!(evidenceText&&evidenceSource);
  }
  function legacyRulePeriod(e){
    if(!e)return null;
    const value=parseInt(e.churnPeriodValue||e.analysis?.churnPeriodValue||0,10)||0;
    const unit=String(e.churnPeriodUnit||e.analysis?.churnPeriodUnit||'').toLowerCase().replace(/\s+/g,'').replace(/s$/,'');
    if(value>0&&['day','month','year'].includes(unit))return{value,unit};
    const churn=String(e.churn||'').trim();
    if(churn==='180')return{value:180,unit:'day'};
    if(/^[1-9]\d*$/.test(churn))return{value:parseInt(churn,10),unit:'year'};
    return null;
  }
  function legacyFallbackReadyDate(e){
    // Legacy fallback is intentionally conservative: it applies only to a
    // previously closed, pre-structured record and always anchors to closure.
    // New structured T&C never falls through here when evidence is unresolved.
    if(!e||!e.closed||decision(e)!=='repeatable'||hasStructuredEligibilityEvidence(e))return'';
    const period=legacyRulePeriod(e);if(!period)return'';
    let official='';
    if(period.unit==='day')official=addDLocal(e.closed,period.value);
    else if(period.unit==='month')official=addMLocal(e.closed,period.value);
    else if(period.unit==='year')official=addMLocal(e.closed,period.value*12);
    return official?addDLocal(official,SAFETY_BUFFER_DAYS):'';
  }
  function sourceBasis(e){
    if(!e)return'';
    try{
      if(window.BTEligibilityGate&&typeof window.BTEligibilityGate.normalizeBasis==='function'){
        const b=window.BTEligibilityGate.normalizeBasis(e.sourceEligibilityBasis||e.analysis?.sourceEligibilityBasis||e.churnBasis||e.analysis?.churnBasis||'');
        if(window.BTEligibilityGate&&typeof window.BTEligibilityGate.legacyBasisKey==='function')return window.BTEligibilityGate.legacyBasisKey(b);
        return b==='offer-enrollment'?'enrollment':b==='bonus-offer-received'?'offer':b==='account-ownership-ended'?'ownership-ended':b==='bonus-received'?'bonus':b==='account-opened'?'opened':b==='account-closed'?'closed':'';
      }
    }catch{}
    return basisKey(e.sourceEligibilityBasis||e.analysis?.sourceEligibilityBasis||e.churnBasis||e.analysis?.churnBasis||'');
  }
  function normalize(e){
    if(!e)return e;
    try{if(window.BTEligibilityGate&&typeof window.BTEligibilityGate.stamp==='function')Object.assign(e,window.BTEligibilityGate.stamp(e))}catch{}
    const d=decision(e);
    if(d==='nonrepeatable'){
      e.churnBasis='';e.sourceEligibilityBasis='';e.churnBufferDays=0;e.churnTrackingPolicy='nonrepeatable';
      if(e.analysis&&typeof e.analysis==='object'){e.analysis.churnBasis='';e.analysis.sourceEligibilityBasis='';e.analysis.churnBufferDays=0;e.analysis.churnTrackingPolicy='nonrepeatable';}
      return e;
    }
    if(d==='repeatable'){
      const v=verification(e),rules=Array.isArray(v?.rules)?v.rules:[];
      const b=rules.length===1?(window.BTEligibilityGate?.legacyBasisKey?.(rules[0].basis)||basisKey(rules[0].basis)):sourceBasis(e);
      if(rules.length===1){
        e.churnBasis=b;
        e.sourceEligibilityBasis=b?sourceLabel(b):'';
      }else if(rules.length>1){
        e.churnBasis='multiple';
        e.sourceEligibilityBasis='multiple';
      }
      const legacyReady=!v?.ok?legacyFallbackReadyDate(e):'';
      e.churnBufferDays=(v?.ok||legacyReady)?SAFETY_BUFFER_DAYS:0;
      e.churnTrackingPolicy=v?.ok?(rules.length>1?'multi-rule-latest-date-plus-5-day-buffer':('source-'+e.sourceEligibilityBasis+'-plus-5-day-buffer')):(legacyReady?'legacy-saved-rule-plus-5-day-buffer':'source-basis-required');
      if(e.analysis&&typeof e.analysis==='object'){
        e.analysis.churnBasis=e.churnBasis;
        e.analysis.sourceEligibilityBasis=e.sourceEligibilityBasis;
        e.analysis.churnBufferDays=e.churnBufferDays;
        e.analysis.churnTrackingPolicy=e.churnTrackingPolicy;
      }
    }
    return e;
  }
  function addDLocal(date,days){
    try{if(typeof addD==='function')return addD(date,days)}catch{}
    try{if(typeof window.addD==='function')return window.addD(date,days)}catch{}
    return'';
  }
  function addMLocal(date,months){
    try{if(typeof addM==='function')return addM(date,months)}catch{}
    try{if(typeof window.addM==='function')return window.addM(date,months)}catch{}
    return'';
  }
  function basisDate(e){
    const b=sourceBasis(e);
    if(b==='enrollment')return e?.couponEnrollmentDate||e?.offerEnrollmentDate||e?.opened||'';
    return b==='offer'?(e?.bonusOfferReceived||e?.offerReceivedDate||''):b==='ownership-ended'?(e?.closed||''):b==='bonus'?(e?.bonusRecd||''):b==='opened'?(e?.opened||''):b==='closed'?(e?.closed||''):'';
  }
  function official(e){
    try{
      if(window.BTEligibilityGate&&typeof window.BTEligibilityGate.officialEligibilityDate==='function')
        return window.BTEligibilityGate.officialEligibilityDate(e,addDLocal,addMLocal);
    }catch{}
    return'';
  }
  function next(e){
    try{
      if(window.BTEligibilityGate&&typeof window.BTEligibilityGate.safeEligibilityDate==='function'){
        const verified=window.BTEligibilityGate.safeEligibilityDate(e,addDLocal,addMLocal);
        if(verified)return verified;
      }
    }catch{}
    const base=official(e);if(base)return addDLocal(base,SAFETY_BUFFER_DAYS);
    return legacyFallbackReadyDate(e);
  }
  function applicationReady(e){
    try{
      if(window.BTEligibilityGate&&typeof window.BTEligibilityGate.applicationReadyDate==='function')
        return window.BTEligibilityGate.applicationReadyDate(e,addDLocal,addMLocal);
    }catch{}
    return'';
  }
  function ready(e){return next(e)}
  function left(e){
    const d=ready(e);if(!d)return null;
    try{if(typeof dB==='function'&&typeof td==='function')return Math.max(0,dB(td(),d))}catch{}
    try{if(typeof window.dB==='function'&&typeof window.td==='function')return Math.max(0,window.dB(window.td(),d))}catch{}
    return null
  }
  function bufferFor(e){const v=verification(e);return(v.ok&&v.decision==='repeatable')||legacyFallbackReadyDate(e)?SAFETY_BUFFER_DAYS:0}
  function assignGlobals(){
    window.churnBasisDate=basisDate;
    window.churnBufferDaysFor=bufferFor;
    window.nextReopen=next;window.churnReadyDate=ready;window.daysLeft=left;
    window.btOfficialEligibilityDate=official;
    window.btApplicationReadyDate=applicationReady;
    window.btChurnSafetyBufferDays=SAFETY_BUFFER_DAYS;
    window.btEligibilityBasisFor=sourceBasis;
    window.btEligibilityVerification=verification;
    window.btLegacyChurnFallbackDate=legacyFallbackReadyDate;
    window.btHasStructuredEligibilityEvidence=hasStructuredEligibilityEvidence;
    try{churnBasisDate=basisDate}catch{}
    try{churnBufferDaysFor=window.churnBufferDaysFor}catch{}
    try{nextReopen=next}catch{}
    try{churnReadyDate=ready}catch{}
    try{daysLeft=left}catch{}
  }
  function eligibilityText(e){
    try{if(window.BTEligibilityGate&&typeof window.BTEligibilityGate.summary==='function')return window.BTEligibilityGate.summary(e)}catch{}
    const d=decision(e);
    if(d==='nonrepeatable')return'Non-repeatable · archives after closing';
    return'T&C verification required';
  }
  function polishModalHtml(h){
    h=String(h||'');
    h=h.replace(/Saved now so the next-eligible date is automatic later\./g,'Use the exact eligibility wording from the offer. BonusTracker adds a 5-day safety buffer after the saved source date.');
    h=h.replace(/After closing, the countdown will start automatically from the actual close date\./g,'Choose the eligibility start date from the offer terms; the tracker will not invent one.');
    return h;
  }
  function wrap(name,after){
    const base=window[name];
    if(typeof base!=='function'||base.__btEligibility3422)return;
    const fn=function(){const out=base.apply(this,arguments);return after(out,arguments)};
    fn.__btEligibility3422=true;window[name]=fn;
    try{globalThis[name]=fn}catch{}
  }
  function install(){
    assignGlobals();
    wrap('normalizeLifecycleEntry',out=>normalize(out));
    if(typeof window.normalizeLifecycleEntries==='function'&&!window.normalizeLifecycleEntries.__btEligibility3422){
      const base=window.normalizeLifecycleEntries;
      const fn=function(rows){return (base(rows)||[]).map(normalize)};fn.__btEligibility3422=true;window.normalizeLifecycleEntries=fn;
      try{normalizeLifecycleEntries=fn}catch{}
    }
    wrap('collectModalEntryData',out=>normalize(out));
    wrap('normalizeNewCycleData',out=>normalize(out));
    wrap('tcV3Analyze',out=>normalize(out));
    if(window.tcV3Analyze){window.tcUnifiedAnalyze=window.tcV3Analyze;window.tcStrictAnalyze=window.tcV3Analyze;}
    wrap('tcApplyReviewed',out=>{try{if(typeof modal!=='undefined'&&modal)normalize(modal)}catch{}return out});
    wrap('setModalChurnability',out=>{try{if(typeof modal!=='undefined'&&modal)normalize(modal)}catch{}return out});
    wrap('setModalChurnRule',out=>{try{if(typeof modal!=='undefined'&&modal)normalize(modal)}catch{}return out});
    wrap('setModalChurnBasis',out=>{try{if(typeof modal!=='undefined'&&modal)normalize(modal)}catch{}return out});
    if(typeof window.rModal==='function'&&!window.rModal.__btEligibility3422){
      const base=window.rModal;const fn=function(){return polishModalHtml(base.apply(this,arguments))};fn.__btEligibility3422=true;window.rModal=fn;try{rModal=fn}catch{}
    }
    window.btFutureEligibilityText=eligibilityText;
    window.btChurnCloseDatePolicyVersion=VER;
    try{
      if(typeof entries!=='undefined'&&Array.isArray(entries)){
        entries=entries.map(normalize);
        if(typeof sv==='function'&&typeof SK!=='undefined')sv(SK,entries);
      }
    }catch{}
  }
  install();setTimeout(install,300);setTimeout(install,1400);
})();
