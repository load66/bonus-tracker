/* BonusTracker v3.4.19 — T&C-evidence-gated eligibility clock with exact cooldown units and a 5-day safety buffer. */
(function(){
  'use strict';
  const VER='3.4.19';
  const SAFETY_BUFFER_DAYS=5;

  function decision(e){
    try{if(typeof window.churnDecisionForEntry==='function')return window.churnDecisionForEntry(e)}catch{}
    if(e?.churnable===false||e?.churnability==='not-repeatable')return'nonrepeatable';
    if(e?.churnable===true||e?.churnability==='repeatable'||e?.churn)return'repeatable';
    return'';
  }
  function basisKey(v){
    const x=String(v||'').toLowerCase().replace(/[^a-z]/g,'');
    if(/bonus|payout/.test(x))return'bonus';
    if(/open/.test(x))return'opened';
    if(/clos/.test(x))return'closed';
    return'';
  }
  function sourceLabel(b){return b==='bonus'?'bonus-received':b==='opened'?'account-opened':b==='closed'?'account-closed':''}
  function verification(e){
    try{if(window.BTEligibilityGate&&typeof window.BTEligibilityGate.validate==='function')return window.BTEligibilityGate.validate(e)}catch{}
    return{ok:false,status:'unresolved',reason:'Eligibility evidence validator unavailable'};
  }
  function sourceBasis(e){
    if(!e)return'';
    try{
      if(window.BTEligibilityGate&&typeof window.BTEligibilityGate.normalizeBasis==='function'){
        const b=window.BTEligibilityGate.normalizeBasis(e.sourceEligibilityBasis||e.analysis?.sourceEligibilityBasis||e.churnBasis||e.analysis?.churnBasis||'');
        return b==='bonus-received'?'bonus':b==='account-opened'?'opened':b==='account-closed'?'closed':'';
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
      const b=sourceBasis(e);
      e.churnBasis=b;
      e.sourceEligibilityBasis=b?sourceLabel(b):'';
      e.churnBufferDays=b?SAFETY_BUFFER_DAYS:0;
      e.churnTrackingPolicy=b?'source-'+e.sourceEligibilityBasis+'-plus-5-day-buffer':'source-basis-required';
      if(e.analysis&&typeof e.analysis==='object'){
        e.analysis.churnBasis=b;
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
    return b==='bonus'?(e?.bonusRecd||''):b==='opened'?(e?.opened||''):b==='closed'?(e?.closed||''):'';
  }
  function official(e){
    const v=verification(e);if(!v.ok||v.decision!=='repeatable')return'';
    const start=basisDate(e);if(!start)return'';
    const p=v.period;
    if(!p)return'';
    if(p.unit==='days')return addDLocal(start,p.value);
    if(p.unit==='months')return addMLocal(start,p.value);
    if(p.unit==='years')return addMLocal(start,p.value*12);
    return'';
  }
  function next(e){
    const base=official(e);return base?addDLocal(base,SAFETY_BUFFER_DAYS):'';
  }
  function applicationReady(e){
    const v=verification(e);if(!v.ok||v.decision!=='repeatable')return'';
    const safe=next(e);if(!safe)return'';
    if(!v.mustCloseBeforeReapply)return safe;
    const closed=String(e?.closed||'');if(!closed)return'';
    return closed>safe?closed:safe;
  }
  function ready(e){return next(e)}
  function left(e){
    const d=ready(e);if(!d)return null;
    try{if(typeof dB==='function'&&typeof td==='function')return Math.max(0,dB(td(),d))}catch{}
    try{if(typeof window.dB==='function'&&typeof window.td==='function')return Math.max(0,window.dB(window.td(),d))}catch{}
    return null
  }
  function bufferFor(e){const v=verification(e);return v.ok&&v.decision==='repeatable'?SAFETY_BUFFER_DAYS:0}
  function assignGlobals(){
    window.churnBasisDate=basisDate;
    window.churnBufferDaysFor=bufferFor;
    window.nextReopen=next;window.churnReadyDate=ready;window.daysLeft=left;
    window.btOfficialEligibilityDate=official;
    window.btApplicationReadyDate=applicationReady;
    window.btChurnSafetyBufferDays=SAFETY_BUFFER_DAYS;
    window.btEligibilityBasisFor=sourceBasis;
    window.btEligibilityVerification=verification;
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
    if(typeof base!=='function'||base.__btEligibility3419)return;
    const fn=function(){const out=base.apply(this,arguments);return after(out,arguments)};
    fn.__btEligibility3419=true;window[name]=fn;
    try{globalThis[name]=fn}catch{}
  }
  function install(){
    assignGlobals();
    wrap('normalizeLifecycleEntry',out=>normalize(out));
    if(typeof window.normalizeLifecycleEntries==='function'&&!window.normalizeLifecycleEntries.__btEligibility3419){
      const base=window.normalizeLifecycleEntries;
      const fn=function(rows){return (base(rows)||[]).map(normalize)};fn.__btEligibility3419=true;window.normalizeLifecycleEntries=fn;
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
    if(typeof window.rModal==='function'&&!window.rModal.__btEligibility3419){
      const base=window.rModal;const fn=function(){return polishModalHtml(base.apply(this,arguments))};fn.__btEligibility3419=true;window.rModal=fn;try{rModal=fn}catch{}
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
