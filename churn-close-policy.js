/* BonusTracker v3.4.17 — source-accurate eligibility clock with a 5-day safety buffer. */
(function(){
  'use strict';
  const VER='3.4.17';
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
  function sourceBasis(e){
    if(!e)return'';
    return basisKey(e.sourceEligibilityBasis||e.analysis?.sourceEligibilityBasis||e.churnBasis||e.analysis?.churnBasis||'');
  }
  function normalize(e){
    if(!e)return e;
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
  function next(e){
    if(!e||decision(e)!=='repeatable'||!e.churn)return'';
    const start=basisDate(e);if(!start)return'';
    const base=String(e.churn)==='180'
      ?addDLocal(start,180)
      :addMLocal(start,(parseInt(e.churn,10)||0)*12);
    return base?addDLocal(base,SAFETY_BUFFER_DAYS):'';
  }
  function ready(e){return next(e)}
  function left(e){
    const d=ready(e);if(!d)return null;
    try{if(typeof dB==='function'&&typeof td==='function')return Math.max(0,dB(td(),d))}catch{}
    try{if(typeof window.dB==='function'&&typeof window.td==='function')return Math.max(0,window.dB(window.td(),d))}catch{}
    return null
  }
  function bufferFor(e){return decision(e)==='repeatable'&&!!sourceBasis(e)?SAFETY_BUFFER_DAYS:0}
  function assignGlobals(){
    window.churnBasisDate=basisDate;
    window.churnBufferDaysFor=bufferFor;
    window.nextReopen=next;window.churnReadyDate=ready;window.daysLeft=left;
    window.btChurnSafetyBufferDays=SAFETY_BUFFER_DAYS;
    window.btEligibilityBasisFor=sourceBasis;
    try{churnBasisDate=basisDate}catch{}
    try{churnBufferDaysFor=window.churnBufferDaysFor}catch{}
    try{nextReopen=next}catch{}
    try{churnReadyDate=ready}catch{}
    try{daysLeft=left}catch{}
  }
  function eligibilityText(e){
    const d=decision(e);
    if(d==='nonrepeatable')return'Non-repeatable · archives after closing';
    if(d!=='repeatable')return'Not saved';
    const rule=String(e?.churn)==='180'?'180 days':e?.churn?(e.churn+' year'+(String(e.churn)==='1'?'':'s')):'Reset period missing';
    const b=sourceBasis(e);
    if(!b)return rule+' · eligibility start date needs review';
    const label=b==='bonus'?'bonus received date':b==='opened'?'account opened date':'account closed date';
    return rule+' + '+SAFETY_BUFFER_DAYS+'-day safety buffer after '+label;
  }
  function polishModalHtml(h){
    h=String(h||'');
    h=h.replace(/Saved now so the next-eligible date is automatic later\./g,'Use the exact eligibility wording from the offer. BonusTracker adds a 5-day safety buffer after the saved source date.');
    h=h.replace(/After closing, the countdown will start automatically from the actual close date\./g,'Choose the eligibility start date from the offer terms; the tracker will not invent one.');
    return h;
  }
  function wrap(name,after){
    const base=window[name];
    if(typeof base!=='function'||base.__btEligibility3417)return;
    const fn=function(){const out=base.apply(this,arguments);return after(out,arguments)};
    fn.__btEligibility3417=true;window[name]=fn;
    try{globalThis[name]=fn}catch{}
  }
  function install(){
    assignGlobals();
    wrap('normalizeLifecycleEntry',out=>normalize(out));
    if(typeof window.normalizeLifecycleEntries==='function'&&!window.normalizeLifecycleEntries.__btEligibility3417){
      const base=window.normalizeLifecycleEntries;
      const fn=function(rows){return (base(rows)||[]).map(normalize)};fn.__btEligibility3417=true;window.normalizeLifecycleEntries=fn;
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
    if(typeof window.rModal==='function'&&!window.rModal.__btEligibility3417){
      const base=window.rModal;const fn=function(){return polishModalHtml(base.apply(this,arguments))};fn.__btEligibility3417=true;window.rModal=fn;try{rModal=fn}catch{}
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
