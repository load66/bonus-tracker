/* BonusTracker v3.3.96 — T&C close-rule guard and stale-rule repair. */
(function(){
  'use strict';

  const VER='3.3.96';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const split=v=>String(v||'').replace(/\r/g,'\n').split(/(?<=[.!?])\s+|\n+|;/).map(clean).filter(Boolean);
  const closeWords=/(?:\bclose(?:d|s|ing)?\b|early\s+(?:close|closing|termination)|remain\s+open|keep[^.]{0,45}\bopen\b|maintain[^.]{0,45}\bopen\b|fee[^.]{0,80}(?:if|when)[^.]{0,80}\bclosed?\b|forfeit|clawback|reclaim|reverse|deduct)/i;
  const durationWords=/\b(?:\d{1,3}|thirty|sixty|ninety|one\s+hundred\s+eighty)\s*(?:\(\s*\d{1,3}\s*\))?\s*(?:calendar\s*)?(?:days?|months?)\b/i;
  const fixedRelation=/(?:within|before|less\s+than|for\s+at\s+least|for|until\s+day|through\s+day|after|from|account\s+opening|opened\s+date|opening\s+date)/i;
  const payoutWords=/(?:bonus|cash\s+reward|reward|payout|payment|credit)[^.]{0,90}(?:post|posts|posted|paid|payment|credited|received)|(?:remain\s+open|keep[^.]{0,45}\bopen\b|good\s+standing|unrestricted)[^.]{0,100}(?:until|through)[^.]{0,80}(?:bonus|reward|payout|payment|credit)/i;
  const falseCloseLine=/(?:close\s+safety|close\s+hold|early-close\s+safety|close\s+check\s+after\s+payout\s+buffer|do\s+not\s+close\s+within\s+90\s+days|close\s+on\s+day\s+91|90\s+days\s+from\s+requirement|day\s+91\s+from\s+opened)/i;

  function isChaseBusinessComplete(v){
    const text=clean([
      v&&v.bank,v&&v.acct,v&&v.accountName,v&&v.productName,v&&v.accountType,
      v&&v.raw,v&&v.normalizedRaw,v&&v.analyzedTC,v&&v.completeBonusText,v&&v.eligibilityText
    ].filter(Boolean).join(' '));
    return /\b(?:jpmorgan\s+)?chase\b/i.test(text)&&/\b(?:business\s+complete|business\s+checking|chase\s+business|business)\b/i.test(text)&&!/\b(?:total\s+checking|secure\s+banking|private\s+client)\b/i.test(text);
  }

  function sourceText(r){
    const snippets=(r&&Array.isArray(r.sourceSnippets)?r.sourceSnippets:[])
      .filter(x=>/early\s+close|close\s*\/\s*hold|payout\s+risk|close\s+rule/i.test(String(x&&x.field||'')))
      .map(x=>x&&x.source||'');
    return clean([r&&r.closeRuleText,r&&r.closeRuleSource,r&&r.earlyTerminationFeeText,...snippets].filter(Boolean).join(' '));
  }

  function explicitFixedRule(text){
    return split(text).find(s=>closeWords.test(s)&&durationWords.test(s)&&fixedRelation.test(s))||'';
  }

  function stripFalseCloseText(value){
    if(!value)return value||'';
    return String(value).replace(/\r/g,'\n').split('\n').filter(line=>!falseCloseLine.test(line)).join('\n').replace(/\n{3,}/g,'\n\n').trim();
  }

  function removeCloseArtifacts(r){
    r.profileFallbacks=(Array.isArray(r.profileFallbacks)?r.profileFallbacks:[]).filter(x=>!/close|hold period/i.test(String(x&&x.field||'')));
    r.sourceSnippets=(Array.isArray(r.sourceSnippets)?r.sourceSnippets:[]).filter(x=>!/close hold|close rule|early close/i.test(String(x&&x.field||''))||!/profile-fallback|known-bank-profile/i.test(String(x&&x.confidence||'')+' '+String(x&&x.kind||'')));
    if(r.fieldSources)Object.keys(r.fieldSources).forEach(k=>{if(/close hold|close rule/i.test(k))delete r.fieldSources[k]});
    if(r.fieldConfidence)Object.keys(r.fieldConfidence).forEach(k=>{if(/close hold|close rule/i.test(k))delete r.fieldConfidence[k]});
    r.suggestedTimers=(Array.isArray(r.suggestedTimers)?r.suggestedTimers:[]).filter(t=>!/(?:close hold|early-close safety|close check after payout buffer|safe close)/i.test(String(t&&t.text||'')));
    r.actionPlan=String(r.actionPlan||'').split('\n').filter(line=>!falseCloseLine.test(line)&&!/close safety:/i.test(line)).join('\n').trim();
    r.reviewFlags=(Array.isArray(r.reviewFlags)?r.reviewFlags:[]).filter(x=>!/day 91|90 days from requirement|verified.*close|close rule wording needs manual review|close hold/i.test(String(x||'')));
  }

  function sanitizeResult(r,raw){
    if(!r||typeof r!=='object')return r;
    const src=sourceText(r);
    const explicit=explicitFixedRule(src);
    const chase=isChaseBusinessComplete({...r,raw:raw||r.raw});
    const payoutOnly=payoutWords.test(clean([src,r.early,r.payout,r.payoutText,raw].filter(Boolean).join(' ')));

    if(chase||!explicit){
      const hadFalseRule=!!(parseInt(r.closeRuleDays||r.minHoldDays||0,10)||falseCloseLine.test(src)||r.profileRuleOverride);
      r.closeRuleDays=0;
      r.minHoldDays=0;
      r.closeRuleBasis='bonus';
      r.closeBufferDays=0;
      r.earlyCloseFee=chase?0:(r.earlyCloseFee||0);
      r.closeRuleText=payoutOnly||chase
        ?'Keep the account open and unrestricted until the bonus posts. No fixed post-bonus hold was found in the pasted T&C.'
        :'';
      r.closeRuleConfidence=payoutOnly?'high':'low';
      r.closeRuleSource='analyzer-payout-only';
      r.clearFixedCloseRule=true;
      delete r.profileRuleOverride;
      removeCloseArtifacts(r);
      if(hadFalseRule||chase){
        r.reviewFlags=r.reviewFlags||[];
        const note='Close timing corrected: requirement windows and balance-hold periods are not post-bonus close holds.';
        if(!r.reviewFlags.includes(note))r.reviewFlags.push(note);
      }
    }else{
      const m=explicit.match(/(\d{1,3})\s*(?:calendar\s*)?(days?|months?)/i);
      let days=m?parseInt(m[1],10)||0:0;
      if(m&&/month/i.test(m[2]))days*=30;
      if(days>0&&days<=730){
        r.closeRuleDays=days;
        r.minHoldDays=days;
        r.closeRuleText=explicit;
        r.closeRuleBasis=/after[^.]{0,80}(?:bonus|reward|payout|payment)|(?:bonus|reward|payout|payment)[^.]{0,80}(?:posted|received|paid)/i.test(explicit)?'bonus':/after[^.]{0,80}(?:requirement|qualification)|(?:requirement|qualification)[^.]{0,80}(?:met|completed|satisfied)/i.test(explicit)?'reqmet':'opened';
        r.clearFixedCloseRule=false;
      }
    }
    r.closeRuleGuardVersion=VER;
    return r;
  }

  function sanitizeEntry(e){
    if(!e||typeof e!=='object')return false;
    const chase=isChaseBusinessComplete(e);
    const src=clean([e.closeRuleText,e.earlyTerminationFeeText,e.analyzedTC].filter(Boolean).join(' '));
    const explicit=explicitFixedRule(e.closeRuleText||e.earlyTerminationFeeText||'');
    const falseSaved=chase||falseCloseLine.test(src)||((parseInt(e.minHoldDays||e.closeFeeCountdownDays||0,10)>0)&&!explicit&&payoutWords.test(src));
    if(!falseSaved)return false;

    e.minHoldDays=0;
    e.closeFeeCountdownDays='';
    e.closeRuleBasis='bonus';
    e.closeBufferDays=0;
    e.closeRuleText='Keep the account open and unrestricted until the bonus posts. No fixed post-bonus hold was found in the pasted T&C.';
    e.closeRuleSource='analyzer-payout-only';
    e.profileRuleOverride='';
    e.analyzedTC=stripFalseCloseText(e.analyzedTC);
    e.notes=stripFalseCloseText(e.notes);
    e.customTimers=(Array.isArray(e.customTimers)?e.customTimers:[]).filter(t=>!/(?:close hold|early-close safety|close check after payout buffer|safe close)/i.test(String(t&&t.text||'')));
    return true;
  }

  function payoutOnlyEntry(e){
    return !!e&&String(e.closeRuleSource||'')==='analyzer-payout-only';
  }

  function installAnalyzerGuard(){
    if(window.__btCloseRuleAnalyzerGuard)return;
    const base=window.tcV3Analyze;
    if(typeof base!=='function')return;
    const wrapped=function(raw,opts){return sanitizeResult(base(raw,opts),raw)};
    window.tcV3Analyze=wrapped;
    window.tcUnifiedAnalyze=wrapped;
    window.tcStrictAnalyze=wrapped;
    window.__btCloseRuleAnalyzerGuard=true;
  }

  function installAppGuards(){
    if(window.__btCloseRuleAppGuard)return;
    const oldKnown=window.knownClosePolicy;
    const oldInfer=window.inferCloseHoldDaysFromEntry;
    const oldPlan=window.closePlanForEntry;

    if(typeof oldKnown==='function')window.knownClosePolicy=function(e){
      if(isChaseBusinessComplete(e))return null;
      return oldKnown(e);
    };
    if(typeof window.applyKnownClosePolicy==='function')window.applyKnownClosePolicy=function(e){
      if(!e||isChaseBusinessComplete(e))return e;
      const p=window.knownClosePolicy&&window.knownClosePolicy(e);
      if(!p)return e;
      e.minHoldDays=p.days;e.closeFeeCountdownDays=String(p.days);e.closeRuleBasis=p.basis;e.closeBufferDays=p.buffer;e.closeRuleText=p.text;
      return e;
    };
    if(typeof oldInfer==='function')window.inferCloseHoldDaysFromEntry=function(e){
      if(payoutOnlyEntry(e)||isChaseBusinessComplete(e))return 0;
      const txt=clean([e&&e.closeRuleText,e&&e.earlyTerminationFeeText].filter(Boolean).join(' '));
      return explicitFixedRule(txt)?oldInfer(e):0;
    };
    if(typeof oldPlan==='function')window.closePlanForEntry=function(e){
      const plan=oldPlan(e);
      if(!plan||!payoutOnlyEntry(e))return plan;
      plan.rows=(plan.rows||[]).filter(r=>!/^(?:Close rule|Earliest close|Early-close rule)$/i.test(String(r&&r.label||'')));
      plan.rows.splice(Math.min(3,plan.rows.length),0,{label:'Close rule',value:e.bonusRecd?'Close after bonus posts':'Wait for bonus to post',cls:e.bonusRecd?'ok':'bad'});
      if(e.bonusRecd)plan.rows.splice(Math.min(4,plan.rows.length),0,{label:'Earliest close',value:typeof window.fD==='function'?window.fD(e.bonusRecd):e.bonusRecd,cls:'ok'});
      plan.notes=(plan.notes||[]).filter(n=>!/manual review|fixed early-close countdown/i.test(String(n||'')));
      plan.notes.unshift('No fixed post-bonus hold was found in the analyzed T&C.');
      return plan;
    };
    window.__btCloseRuleAppGuard=true;
  }

  function installApplyRepair(){
    if(window.__btCloseRuleApplyGuard||typeof window.tcApplyReviewed!=='function')return;
    const base=window.tcApplyReviewed;
    window.tcApplyReviewed=function(){
      const raw=document.getElementById('tca_raw')?.value||'';
      let result=null;
      try{result=window.tcV3Analyze?window.tcV3Analyze(raw):null}catch{}
      const out=base.apply(this,arguments);
      if(result&&result.clearFixedCloseRule){
        let m=null;
        try{m=window.modal||modal||null}catch{m=window.modal||null}
        if(m){sanitizeEntry(m);m.closeRuleText=result.closeRuleText;m.closeRuleSource='analyzer-payout-only';}
        try{window.R&&window.R()}catch{}
      }
      return out;
    };
    window.__btCloseRuleApplyGuard=true;
  }

  function migrateSavedEntries(){
    let changed=false;
    try{
      if(typeof entries!=='undefined'&&Array.isArray(entries))entries.forEach(e=>{if(sanitizeEntry(e))changed=true});
      if(changed&&typeof sv==='function'&&typeof SK!=='undefined')sv(SK,entries);
      if(changed&&typeof R==='function')R();
    }catch{}
    return changed;
  }

  function install(){
    try{window.BT_APP_VERSION=VER}catch{}
    installAnalyzerGuard();
    installAppGuards();
    installApplyRepair();
    migrateSavedEntries();
  }

  window.tcCloseRuleGuardSanitize=sanitizeResult;
  window.tcCloseRuleGuardRepairEntry=sanitizeEntry;
  install();
  setTimeout(install,80);
  setTimeout(install,500);
  setTimeout(install,1400);
})();
