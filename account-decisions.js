/* Release 3.6.34 read integrity. Pure account decisions. This file must not call status() or btLifecycleStageForEntry(). */
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
    try{if(typeof closeCore()?.baseDate==='function')return closeCore().baseDate(e)||''}catch{}
    return e?.closeRuleBasis==='reqmet'?e?.reqMet||'':e?.closeRuleBasis==='opened'?e?.opened||'':e?.bonusRecd||'';
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
    // Legacy fee-only review flags are not retention restrictions.
    try{const type=closeCore()?.typeForEntry?.(e);if(type)return type}catch{}
    return String(e?.closeRestrictionType||'none');
  }
  function closureUnresolved(e){
    if(!e)return true;
    const structured=e.financialRules?.closure;
    const financial=window.BTFinancialRules?.validate?.(e);
    if(financial&&financial.mode!=='legacy'&&!financial.ok)return true;
    const typed=closeType(e);
    const calendar=window.BTFinancialRules?.closeHoldInfo?.(e)||null;
    if(window.BTFinancialRules?.retentionNeedsReview?.(e)&&!calendar)return true;
    if((typed==='review'||typed==='manual-review')&&!calendar)return true;
    if(!e.bonusRecd||!closeCore()?.validDate?.(e.bonusRecd))return true;
    const basis=String(structured?.basis||e.closeRuleBasis||'').toLowerCase();
    if(basis==='reqmet'&&!closeCore()?.validDate?.(e.reqMet))return true;
    if(calendar){
      if(today()<calendar.reviewOn)return true;
      return !/\b(?:bonus|reward|remain open|keep[^.]{0,35}open|must[^.]{0,35}open|retention)\b/i.test(String([structured?.text,structured?.evidence?.quote].join(' ')));
    }
    const days=ruleDays(e);
    const declaredHold=Number(structured?.minHoldDays||0);
    if(days>0||declaredHold>0){
      if(!(days>0)||!baseDate(e))return true;
      if(daysUntilSafe(e)!==0)return true;
    }
    // Service fees are not evidence of forfeiture. A payout-only clause
    // must establish actual open-until-payout terms; an otherwise unrestricted
    // cycle needs affirmative bonus-retention evidence before "ready".
    const evidence=String([structured?.evidence?.quote,e.closeRuleText,e.closeRuleSourceSentence].filter(Boolean).join(' '));
    if(typed==='payout-only')return !/(?:remain|stay|keep)[^.]{0,100}open[^.]{0,150}(?:until|through|after|once|when)[^.]{0,100}(?:bonus|reward|payout|payment|credit)|(?:until|through|after|once|when)[^.]{0,100}(?:bonus|reward|payout|payment|credit)[^.]{0,130}(?:posts?|paid|received|deposited)/i.test(evidence);
    if(typed==='none')return !/(?:no|without|not subject to)[^.]{0,90}(?:bonus|reward)[^.]{0,50}(?:clawback|repayment|forfeiture|reversal)|(?:no|without|not subject to)[^.]{0,90}(?:clawback|repayment|forfeiture|reversal)/i.test(evidence);
    return false;
  }
  function qualification(e){
    if(e?.reqMet)return{status:'recorded',date:e.reqMet,blockers:[],unresolved:[],evidence:[{field:'reqMet',value:e.reqMet}],summary:'Requirements recorded '+e.reqMet};
    if(e?.bonusRecd)return{status:'unrecorded',date:null,blockers:[],unresolved:['requirements-completion-date'],evidence:[{field:'bonusRecd',value:e.bonusRecd}],summary:'Bonus received — requirements completion date not recorded.'};
    return{status:'open',date:null,blockers:[],unresolved:[],evidence:[],summary:''};
  }
  function repeatDecision(e){
    let gate=null;
    const policy=window.btEligibilityPolicyEntry?.(e)||e;
    try{gate=window.BTEligibilityGate?.recorded?.(policy)||null}catch{}
    const saved=Array.isArray(e?.eligibilityRules)?e.eligibilityRules:[];
    const validated=Array.isArray(gate?.rules)?gate.rules:[];
    const rules=gate?.ok?validated:saved;
    let reached=false,ready='',legacy='';
    try{reached=typeof window.btRecordedApplicationReached==='function'&&!!window.btRecordedApplicationReached(e)}catch{}
    try{ready=typeof window.btApplicationReadyDate==='function'?window.btApplicationReadyDate(e)||'':''}catch{}
    try{legacy=typeof window.btLegacyChurnFallbackDate==='function'?window.btLegacyChurnFallbackDate(e)||'':''}catch{}
    let blockers=rules.map(r=>({code:'eligibility-restriction',basis:r?.basis||'',evidence:r?.evidenceText||''}));
    const unresolved=[];
    let status='open';
    if(e?.closed&&nonRepeatable(e))status='archived';
    else if(!e?.closed)status='not-closed';
    else if(reached)status='eligible';
    else if(legacy){status='cooldown';}
    else status='unresolved';
    if(rules.length>1&&!reached)unresolved.push('Multiple eligibility restrictions remain in force.');
    if(status==='eligible')blockers=[];
    return{status,blockers,unresolved,evidence:rules,dates:{applicationReady:ready,legacyEstimate:legacy}};
  }
  function legacyStatus(e){
    if(!e||!e.bank)return'';
    if(e.closed){
      if(nonRepeatable(e))return'ARCHIVED';
      let reached=false;
      try{reached=typeof window.btRecordedApplicationReached==='function'&&!!window.btRecordedApplicationReached(e)}catch{}
      return reached?'TIME TO CHURN!':'WAITING TO CHURN!';
    }
    const active=typeof nextActiveTimer==='function'?nextActiveTimer(e):null;
    if(e.bonusRecd){
      const calendar=window.BTFinancialRules?.closeHoldInfo(e);
      if(calendar){
        // A hold anniversary is not evidence of a posted bonus.
        if(today()<calendar.reviewOn)return'WAITING TO CLOSE';
        return closureUnresolved(e)?'BONUS RECEIVED':'SAFE TO CLOSE';
      }
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
    if(closureUnresolved(e))unresolved.push('Bonus-retention or holding terms require review.');
    const notes=e?.bonusRecd&&!e?.reqMet?['Requirements completion date was not recorded; this is not evidence of the exact date.']:[];
    const status=legacy==='SAFE TO CLOSE'?'ready':legacy==='WAITING TO CLOSE'||legacy==='3-DAY BUFFER'?'hold':legacy==='BONUS RECEIVED'?'received-not-ready':legacy==='ARCHIVED'?'archived':'not-ready';
    return{status,blockers:unresolved.map(x=>({message:x})),unresolved,notes,evidence:[{field:'closeRuleText',value:e?.closeRuleText||''},{field:'closeRestrictionType',value:closeType(e)}],dates:{safe:typeof safeCloseDate==='function'?safeCloseDate(e):''}};
  }
  function fingerprint(e){
    if(!e||typeof e!=='object')return'';
    return JSON.stringify([e.reqMet,e.bonusRecd,e.closeBufferDays,e.closed,e.opened,e.closeRuleText]);
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
      // Legacy fee fields are retained in saved history but no longer require a repair prompt.
      return issues.length?{id:e.id||'',bank:e.bank||'',issues}:null;
    }).filter(Boolean);
  }
  window.btEvaluateAccount=btEvaluateAccount;
  window.btHistoricalIntegrityFindings=btHistoricalIntegrityFindings;
  window.btAccountDecisionsVersion='3.6.34';
})();
