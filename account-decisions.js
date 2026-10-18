/* Release 3.6.32 read integrity. Pure account decisions. This file must not call status() or btLifecycleStageForEntry(). */
(function(){
  'use strict';
  function today(){
    try{if(typeof td==='function')return td()}catch{}
    try{if(typeof window.td==='function')return window.td()}catch{}
    return new Date().toISOString().slice(0,10);
  }
  function nonRepeatable(e){
    try{return typeof isNonRepeatableEntry==='function'&&!!isNonRepeatableEntry(e)}catch{return false}
  }
  function closeCore(){return window.BTCloseRules||null}
  function ruleDays(e){
    try{const n=closeCore()?.ruleDays?.(e);if(Number.isFinite(n))return n}catch{}
    return parseInt(e?.minHoldDays||e?.closeFeeCountdownDays||0,10)||0;
  }
  function baseDate(e){
    try{const d=closeCore()?.baseDate?.(e);if(d)return d}catch{}
    return e?.bonusRecd||e?.opened||'';
  }
  function daysUntilSafe(e){
    try{const n=closeCore()?.daysUntilSafe?.(e,today());if(n!==undefined)return n}catch{}
    try{if(typeof window.daysUntilSafe==='function'&&window.daysUntilSafe!==daysUntilSafe)return window.daysUntilSafe(e)}catch{}
    return null;
  }
  function inBuffer(e){
    try{return !!closeCore()?.isInBuffer?.(e,today())}catch{return false}
  }
  function closeType(e){
    const stored=String(e?.closeRestrictionType||e?.analysis?.closeRestrictionType||'');
    if(stored==='explicit-clawback'||stored==='manual-review'||stored==='review')return stored;
    try{const t=closeCore()?.typeForEntry?.(e);if(t)return t}catch{}
    return stored;
  }
  function closureUnresolved(e){
    if(!e)return true;
    if(e.closeTimerClearedWithoutFeeVerification)return true;
    const basis=String(e.closeRuleBasis||e.financialRules?.closure?.basis||'').toLowerCase();
    if(basis==='reqmet'&&!e.reqMet)return true;
    try{
      const financial=window.BTFinancialRules?.validate?.(e);
      if(financial&&financial.mode!=='legacy'){
        if(!financial.ok)return true;
        const c=financial.rules?.closure;
        if(c&&(c.restrictionType==='manual-review'||c.earlyCloseFee===null||c.basis==='reqmet'&&!e.reqMet))return true;
      }
    }catch{}
    const type=closeType(e);
    if(type==='review'||type==='manual-review')return true;
    if(type==='explicit-clawback'){
      const days=ruleDays(e);
      if(!(days>0)||!baseDate(e))return true;
      const left=daysUntilSafe(e);
      if(left===null||left>0)return true;
    }
    if(e.earlyCloseFee===null)return true;
    return false;
  }
  function qualification(e){
    if(e?.reqMet)return{status:'recorded',date:e.reqMet,blockers:[],unresolved:[],evidence:[{field:'reqMet',value:e.reqMet}],summary:'Requirements recorded '+e.reqMet};
    if(e?.bonusRecd)return{status:'unrecorded',date:null,blockers:[],unresolved:['requirements-completion-date'],evidence:[{field:'bonusRecd',value:e.bonusRecd}],summary:'Bonus received — requirements completion date not recorded.'};
    return{status:'open',date:null,blockers:[],unresolved:[],evidence:[],summary:''};
  }
  function repeatDecision(e){
    let gate=null;
    try{gate=window.BTEligibilityGate?.validate?.(e)||null}catch{}
    const saved=Array.isArray(e?.eligibilityRules)?e.eligibilityRules:[];
    const validated=Array.isArray(gate?.rules)?gate.rules:[];
    const rules=validated.length>=saved.length?validated:saved;
    let reached=false,ready='',legacy='';
    try{reached=typeof window.btVerifiedApplicationReached==='function'&&!!window.btVerifiedApplicationReached(e)}catch{}
    try{ready=typeof window.btApplicationReadyDate==='function'?window.btApplicationReadyDate(e)||'':''}catch{}
    try{legacy=typeof window.btLegacyChurnFallbackDate==='function'?window.btLegacyChurnFallbackDate(e)||'':''}catch{}
    const blockers=rules.map(r=>({code:'eligibility-restriction',basis:r?.basis||'',evidence:r?.evidenceText||''}));
    const unresolved=[];
    let status='open';
    if(e?.closed&&nonRepeatable(e))status='archived';
    else if(!e?.closed)status='not-closed';
    else if(reached)status='eligible';
    else if(legacy){status='unverified';unresolved.push('A legacy cooldown estimate is not a verified application date.');}
    else status='unresolved';
    if(rules.length>1&&!reached)unresolved.push('Multiple eligibility restrictions remain in force.');
    return{status,blockers,unresolved,evidence:rules,dates:{applicationReady:ready,legacyEstimate:legacy}};
  }
  function legacyStatus(e){
    if(!e||!e.bank)return'';
    if(e.closed){
      if(nonRepeatable(e))return'ARCHIVED';
      let reached=false;
      try{reached=typeof window.btVerifiedApplicationReached==='function'&&!!window.btVerifiedApplicationReached(e)}catch{}
      return reached?'TIME TO CHURN!':'WAITING TO CHURN!';
    }
    const active=typeof nextActiveTimer==='function'?nextActiveTimer(e):null;
    if(e.bonusRecd){
      const days=ruleDays(e),hold=days>0&&!!baseDate(e);
      if(hold){
        if(inBuffer(e))return'3-DAY BUFFER';
        const left=daysUntilSafe(e);
        if(left!==null&&left>0)return'WAITING TO CLOSE';
      }
      if(closureUnresolved(e))return'BONUS RECEIVED';
      return'SAFE TO CLOSE';
    }
    if(e.reqMet)return active?'CUSTOM TIMER':'REQ MET';
    return active?'CUSTOM TIMER':'WORKING';
  }
  function closeDecision(e,legacy){
    const unresolved=[];
    if(closureUnresolved(e))unresolved.push(e?.earlyCloseFee===null?'Early-close fee is not verified.':'Closure is not verified.');
    if(e?.bonusRecd&&!e?.reqMet)unresolved.push('Requirements completion date was not recorded.');
    const status=legacy==='SAFE TO CLOSE'?'ready':legacy==='WAITING TO CLOSE'||legacy==='3-DAY BUFFER'?'hold':legacy==='BONUS RECEIVED'?'received-not-ready':legacy==='ARCHIVED'?'archived':'not-ready';
    return{status,blockers:unresolved.map(x=>({message:x})),unresolved,evidence:[{field:'earlyCloseFee',value:e?.earlyCloseFee},{field:'closeRestrictionType',value:closeType(e)}],dates:{safe:typeof safeCloseDate==='function'?safeCloseDate(e):''}};
  }
  function fingerprint(e){
    if(!e||typeof e!=='object')return'';
    return JSON.stringify([e.reqMet,e.bonusRecd,e.earlyCloseFee,e.closeBufferDays,e.closed,e.opened]);
  }
  function btEvaluateAccount(e){
    const before=fingerprint(e);
    const legacy=legacyStatus(e);
    const result={
      qualification:qualification(e),
      close:closeDecision(e,legacy),
      repeat:repeatDecision(e),
      legacyStatus:legacy
    };
    if(before!==fingerprint(e))throw new Error('Account decision evaluation changed a saved fact.');
    return result;
  }
  function btHistoricalIntegrityFindings(rows){
    return (Array.isArray(rows)?rows:[]).map(e=>{
      if(!e||typeof e!=='object')return null;
      const issues=[];
      if(e.bonusRecd&&e.reqMet&&e.reqMet===e.bonusRecd){
        const history=Array.isArray(e.history)?e.history:[];
        const separate=history.some(h=>h&&(h.field==='reqMet'||/req(uirement)?s?\s*met/i.test(String(h.type||h.kind||h.label||'')))&&h.value&&h.value!==e.bonusRecd);
        if(!separate)issues.push({code:'req-met-matches-payout',field:'reqMet',detail:'The requirements date matches the bonus received date and no separate confirmation was found. This can be a real same-day event or an older automatic copy. It was not changed.',proposed:null});
      }
      const structured=e.financialRules&&e.financialRules.closure?e.financialRules.closure.earlyCloseFee:undefined;
      if(structured===null&&e.earlyCloseFee===0)issues.push({code:'unverified-fee-stored-as-zero',field:'earlyCloseFee',detail:'Structured terms say the early-close fee is unknown, but the legacy field is $0. $0 was not treated as verified and the stored value was not rewritten.',proposed:null});
      return issues.length?{id:e.id||'',bank:e.bank||'',issues}:null;
    }).filter(Boolean);
  }
  window.btEvaluateAccount=btEvaluateAccount;
  window.btHistoricalIntegrityFindings=btHistoricalIntegrityFindings;
  window.btAccountDecisionsVersion='3.6.32';
})();
