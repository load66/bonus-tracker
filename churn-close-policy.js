/* BonusTracker v3.4.14 — confirmed-close-date churn clock with a universal 5-day safety buffer. */
(function(){
  'use strict';
  const VER='3.4.14';
  const SAFETY_BUFFER_DAYS=5;

  function decision(e){
    try{if(typeof window.churnDecisionForEntry==='function')return window.churnDecisionForEntry(e)}catch{}
    if(e?.churnable===false||e?.churnability==='not-repeatable')return'nonrepeatable';
    if(e?.churnable===true||e?.churnability==='repeatable'||e?.churn)return'repeatable';
    return'';
  }
  function rememberSourceBasis(e){
    if(!e||decision(e)!=='repeatable')return e;
    const prior=String(e.sourceEligibilityBasis||e.churnBasis||e.analysis?.sourceEligibilityBasis||e.analysis?.churnBasis||'').toLowerCase();
    if(!e.sourceEligibilityBasis){
      if(/bonus/.test(prior))e.sourceEligibilityBasis='bonus-received';
      else if(/open/.test(prior))e.sourceEligibilityBasis='account-opened';
      else if(/clos/.test(prior))e.sourceEligibilityBasis='account-closed';
    }
    return e;
  }
  function normalize(e){
    if(!e)return e;
    rememberSourceBasis(e);
    const d=decision(e);
    if(d==='nonrepeatable'){
      e.churnBasis='';e.churnBufferDays=0;
      if(e.analysis&&typeof e.analysis==='object'){e.analysis.churnBasis='';e.analysis.churnBufferDays=0;}
      return e;
    }
    if(d==='repeatable'){
      e.churnBasis='closed';
      e.churnBufferDays=SAFETY_BUFFER_DAYS;
      e.churnTrackingPolicy='confirmed-close-date-plus-5-day-buffer';
      if(e.analysis&&typeof e.analysis==='object'){
        if(!e.analysis.sourceEligibilityBasis)e.analysis.sourceEligibilityBasis=e.sourceEligibilityBasis||'';
        e.analysis.churnBasis='closed';
        e.analysis.churnBufferDays=SAFETY_BUFFER_DAYS;
        e.analysis.churnTrackingPolicy='confirmed-close-date-plus-5-day-buffer';
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
  function next(e){
    if(!e||decision(e)!=='repeatable'||!e.closed||!e.churn)return'';
    const base=String(e.churn)==='180'
      ?addDLocal(e.closed,180)
      :addMLocal(e.closed,(parseInt(e.churn,10)||0)*12);
    return base?addDLocal(base,SAFETY_BUFFER_DAYS):'';
  }
  function ready(e){return next(e)}
  function left(e){
    const d=ready(e);if(!d)return null;
    try{if(typeof dB==='function'&&typeof td==='function')return Math.max(0,dB(td(),d))}catch{}
    try{if(typeof window.dB==='function'&&typeof window.td==='function')return Math.max(0,window.dB(window.td(),d))}catch{}
    return null
  }
  function bufferFor(e){return decision(e)==='repeatable'?SAFETY_BUFFER_DAYS:0}
  function assignGlobals(){
    window.churnBasisDate=e=>e?.closed||'';
    window.churnBufferDaysFor=bufferFor;
    window.nextReopen=next;window.churnReadyDate=ready;window.daysLeft=left;
    window.btChurnSafetyBufferDays=SAFETY_BUFFER_DAYS;
    try{churnBasisDate=window.churnBasisDate}catch{}
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
    return rule+' + '+SAFETY_BUFFER_DAYS+'-day safety buffer after confirmed account close date';
  }
  function closeNote(){
    return '<div class="fg full"><div class="guided-decision-note"><b>Churn clock uses confirmed closure + 5-day safety buffer</b><span>Request closure with the bank, wait until the account is actually closed, then tap Close Now and record that actual close date. The saved churn period runs from that confirmed close date, and BonusTracker adds 5 extra safety days before marking the bank eligible again.</span></div></div>';
  }
  function polishModalHtml(h){
    h=String(h||'');
    h=h.replace(/<div class="fg"><label>Eligibility clock starts from \*<\/label><select[\s\S]*?<\/select><div class="guided-field-help">[\s\S]*?<\/div><\/div>/,closeNote());
    h=h.replace(/\b(180 days|[123] years?|1 year) after (?:bonus received|account opened|account closed|confirmed account close) date\b/gi,(m,rule)=>rule+' + '+SAFETY_BUFFER_DAYS+'-day safety buffer after confirmed account close date');
    return h;
  }
  function wrap(name,after){
    const base=window[name];
    if(typeof base!=='function'||base.__btCloseDate3414)return;
    const fn=function(){const out=base.apply(this,arguments);return after(out,arguments)};
    fn.__btCloseDate3414=true;window[name]=fn;
    try{globalThis[name]=fn}catch{}
  }
  function install(){
    assignGlobals();
    wrap('normalizeLifecycleEntry',out=>normalize(out));
    if(typeof window.normalizeLifecycleEntries==='function'&&!window.normalizeLifecycleEntries.__btCloseDate3414){
      const base=window.normalizeLifecycleEntries;
      const fn=function(rows){return (base(rows)||[]).map(normalize)};fn.__btCloseDate3414=true;window.normalizeLifecycleEntries=fn;
      try{normalizeLifecycleEntries=fn}catch{}
    }
    wrap('collectModalEntryData',out=>normalize(out));
    wrap('normalizeNewCycleData',out=>normalize(out));
    wrap('tcV3Analyze',out=>normalize(out));
    if(window.tcV3Analyze){window.tcUnifiedAnalyze=window.tcV3Analyze;window.tcStrictAnalyze=window.tcV3Analyze;}
    wrap('tcApplyReviewed',out=>{try{if(typeof modal!=='undefined'&&modal)normalize(modal)}catch{}return out});
    wrap('setModalChurnability',out=>{try{if(typeof modal!=='undefined'&&modal)normalize(modal)}catch{}return out});
    wrap('setModalChurnRule',out=>{try{if(typeof modal!=='undefined'&&modal)normalize(modal)}catch{}return out});
    if(typeof window.rModal==='function'&&!window.rModal.__btCloseDate3414){
      const base=window.rModal;const fn=function(){return polishModalHtml(base.apply(this,arguments))};fn.__btCloseDate3414=true;window.rModal=fn;try{rModal=fn}catch{}
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
