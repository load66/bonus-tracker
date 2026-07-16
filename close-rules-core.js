/* Bonus Tracker Close Rules Core v3.4.03 — single source of truth for T&C close timing. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.BTCloseRules=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION='3.4.03';
  const FIXED_TYPES=new Set(['explicit-clawback','minimum-open','manual-fixed']);
  const AUTO_CLOSE_TIMER_RE=/(?:close check after payout|close hold|early-close safety|safe to close)/i;
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const sentences=v=>String(v||'').replace(/\r/g,'\n').split(/(?<=[.!?])\s+|\n+|;/).map(clean).filter(Boolean);
  const isoAddDays=(iso,n)=>{if(!iso)return'';const d=new Date(iso+'T00:00:00Z');if(Number.isNaN(d.getTime()))return'';d.setUTCDate(d.getUTCDate()+Number(n||0));return d.toISOString().slice(0,10)};
  const isoDiff=(a,b)=>{if(!a||!b)return null;const x=new Date(a+'T00:00:00Z'),y=new Date(b+'T00:00:00Z');if(Number.isNaN(x.getTime())||Number.isNaN(y.getTime()))return null;return Math.floor((y-x)/86400000)};

  function normalizeType(v){
    const s=String(v||'').toLowerCase().replace(/[^a-z-]/g,'').trim();
    if(['explicit-clawback','clawback','early-close-fee','penalty'].includes(s))return'explicit-clawback';
    if(['minimum-open','minimumopen','fixed-hold','fixedhold'].includes(s))return'minimum-open';
    if(['manual-fixed','manualfixed'].includes(s))return'manual-fixed';
    if(['payout-only','payoutonly','until-payout','untilpayout'].includes(s))return'payout-only';
    if(['review','manual-review','manualreview'].includes(s))return'review';
    return'none';
  }
  function sourceIsManual(e){
    const fs=e?.fieldSources||{};
    return /manual/i.test(String(e?.closeRuleSource||''))||[fs.closeFeeCountdownDays,fs.minHoldDays,fs.closeRuleText].some(x=>/manual/i.test(String(x?.kind||x?.sourceKind||'')));
  }
  function isLookback(v){
    const s=String(v||'');
    return /(?:not eligible|ineligible|offer (?:is )?not available|eligibility|previously|prior|past|existing)[^.]{0,150}(?:closed?|closing)|(?:closed?|closing)[^.]{0,100}(?:within the (?:past|previous)|during the (?:past|previous)|last \d|previous \d)/i.test(s)
      && !/(?:deduct|reverse|reclaim|clawback|forfeit|early termination fee|early close fee|must remain open|keep[^.]{0,45}open|maintain[^.]{0,45}open)/i.test(s);
  }
  function durationDays(v){
    const map={thirty:30,sixty:60,ninety:90,thirtieth:30,sixtieth:60,ninetieth:90,'one hundred eighty':180};
    let m=String(v||'').match(/\b(\d{1,3})\s*(?:calendar\s*)?(days?|months?)\b/i),n=0,unit='';
    if(m){n=parseInt(m[1],10)||0;unit=m[2]||''}
    if(!n){m=String(v||'').match(/\b(thirty|sixty|ninety|thirtieth|sixtieth|ninetieth|one\s+hundred\s+eighty)\s*(?:\(\s*(\d{1,3})\s*\))?\s*(?:calendar\s*)?(days?|months?)\b/i);if(m){n=parseInt(m[2],10)||map[clean(m[1]).toLowerCase()]||0;unit=m[3]||''}}
    if(n&&/month/i.test(unit))n*=30;
    return n>0&&n<=730?n:0;
  }
  function moneyAmount(v){
    const m=String(v||'').match(/\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/);if(!m)return 0;
    const n=parseFloat(m[1].replace(/,/g,''));return Number.isFinite(n)&&n>0?n:0;
  }
  function hasMonthlyFeeWording(v){
    return /(?:monthly|per month|each month)[^.]{0,70}(?:fee|charge)|(?:monthly service fee|monthly maintenance fee|monthly account fee)/i.test(String(v||''));
  }
  function explicitRuleText(eOrText){
    const text=typeof eOrText==='string'?eOrText:String([eOrText?.closeRuleText,eOrText?.earlyTerminationFeeText,eOrText?.closeRuleSourceSentence].filter(Boolean).join(' '));
    const duration=String.raw`(?:\d{1,3}|thirty|sixty|ninety|thirtieth|sixtieth|ninetieth|one\s+hundred\s+eighty)\s*(?:\(\s*\d{1,3}\s*\))?\s*(?:calendar\s*)?(?:days?|months?)`;
    const patterns=[
      new RegExp(String.raw`(?:closed?|closing|close|terminate|terminated|termination|early\s+(?:close|closing|termination))[^.]{0,150}(?:within|before|less\s+than|during\s+the\s+first)\s*(?:the\s+)?${duration}`,'i'),
      new RegExp(String.raw`(?:remain|keep|maintain)[^.]{0,80}open[^.]{0,120}(?:for|through|until)\s*(?:the\s+)?${duration}`,'i'),
      new RegExp(String.raw`(?:fee|penalty|charge)[^.]{0,110}(?:if|when)[^.]{0,110}closed?[^.]{0,110}${duration}`,'i'),
      new RegExp(String.raw`${duration}[^.]{0,120}(?:from|after)\s+(?:account\s+opening|opened\s+date|opening\s+date)[^.]{0,120}(?:close|closed|fee|penalty|forfeit)`,'i')
    ];
    return sentences(text).find(s=>!isLookback(s)&&patterns.some(re=>re.test(s)))||'';
  }
  function payoutText(v){
    return sentences(v).find(s=>/(?:remain open|keep[^.]{0,45}open|good standing|unrestricted)[^.]{0,120}(?:until|through)[^.]{0,80}(?:bonus|reward|payout|payment|credit)|(?:bonus|reward|payout|payment|credit)[^.]{0,90}(?:post|posts|posted|paid|credited|received)/i.test(s))||'';
  }
  function basisForText(text){
    if(/after[^.]{0,80}(?:bonus|reward|payout|payment)|(?:bonus|reward|payout|payment)[^.]{0,80}(?:posted|received|paid)/i.test(text))return'bonus';
    if(/after[^.]{0,80}(?:requirement|qualification)|(?:requirement|qualification)[^.]{0,80}(?:met|completed|satisfied)/i.test(text))return'reqmet';
    return'opened';
  }
  function isChaseBiz(e){
    const bank=clean(e?.bank).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const identity=clean([bank,e?.accountType,e?.acct,e?.accountName,e?.productName,e?.analysis?.acct].filter(Boolean).join(' ')).toLowerCase();
    const detail=clean([e?.analyzedTC,e?.completeBonusText,e?.eligibilityText,e?.notes,e?.raw,e?.normalizedRaw].filter(Boolean).join(' ')).toLowerCase();
    if(!/\b(?:jpmorgan\s+)?chase\b/.test(identity+' '+detail))return false;
    if(/\b(?:total checking|secure banking|first checking|private client checking|platinum business|performance business)\b/.test(identity))return false;
    return /\b(?:chase biz|chase business|business complete|business checking)\b/.test(identity+' '+detail);
  }
  function typeForEntry(e){
    if(!e)return'none';
    const saved=normalizeType(e.closeRestrictionType||e.analysis?.closeRestrictionType);
    if(saved==='payout-only'||saved==='review')return saved;
    const n=parseInt(e.minHoldDays||e.closeFeeCountdownDays||0,10)||0;
    const proof=explicitRuleText(e);
    if(n>0&&sourceIsManual(e))return'manual-fixed';
    if(n>0&&proof)return /deduct|reverse|reclaim|clawback|forfeit|fee|penalty|charge/i.test(proof)?'explicit-clawback':'minimum-open';
    const p=payoutText([e.closeRuleText,e.earlyTerminationFeeText,e.analyzedTC,e.completeBonusText].filter(Boolean).join(' '));
    return p?'payout-only':'none';
  }
  function isFixed(e){return FIXED_TYPES.has(typeForEntry(e))}
  function ruleDays(e){const n=parseInt(e?.minHoldDays||e?.closeFeeCountdownDays||0,10)||0;return isFixed(e)&&n>0&&n<=730?n:0}
  function basisFor(e){return String(e?.closeRuleBasis||basisForText(e?.closeRuleText||'')||'opened')}
  function baseDate(e){const b=basisFor(e);return b==='bonus'?e?.bonusRecd||'':b==='reqmet'?e?.reqMet||'':b==='manual'?'':e?.opened||''}
  function rawSafeDate(e){const d=ruleDays(e);return d?(baseDate(e)&&isoAddDays(baseDate(e),d)):e?.bonusRecd||null}
  function safeCloseDate(e){const d=ruleDays(e);const buffer=d?(parseInt(e?.closeBufferDays,10)||0):0;return d?(baseDate(e)&&isoAddDays(baseDate(e),d+buffer)):e?.bonusRecd||null}
  function daysUntilSafe(e,today){const s=safeCloseDate(e),t=today||new Date().toISOString().slice(0,10);if(!s)return null;const d=isoDiff(t,s);return d===null?null:Math.max(0,d)}
  function isInBuffer(e,today){if(!e?.opened||ruleDays(e)<=0||e.closed)return false;const raw=rawSafeDate(e),safe=safeCloseDate(e),t=today||new Date().toISOString().slice(0,10);if(!raw||!safe)return false;return isoDiff(t,raw)<=0&&isoDiff(t,safe)>0}
  function sourceSentence(e){return clean(e?.closeRuleSourceSentence||explicitRuleText(e)||payoutText([e?.closeRuleText,e?.analyzedTC,e?.completeBonusText].filter(Boolean).join(' '))||e?.closeRuleText||'')}

  function sanitizeEntry(e){
    if(!e||typeof e!=='object')return e;
    const x=e;
    let type=typeForEntry(x);
    const proof=explicitRuleText(x);
    let n=parseInt(x.minHoldDays||x.closeFeeCountdownDays||0,10)||0;
    const stale=/day 91|do not close within 90 days|safer future chase business offer eligibility|90 days from (?:requirement|bonus)/i.test(String(x.closeRuleText||''))||x.profileRuleOverride==='chase-business-day91'||x.closeRuleSource==='verified-bank-rule';
    if(isChaseBiz(x)){x.fundedDays=parseInt(x.fundedDays,10)||30;x.holdDays=parseInt(x.holdDays,10)||60;if(stale&&!proof)type=payoutText([x.closeRuleText,x.analyzedTC,x.completeBonusText].filter(Boolean).join(' '))?'payout-only':'none'}
    const fixed=FIXED_TYPES.has(type)&&n>0&&n<=730&&(sourceIsManual(x)||!!proof);
    if(!fixed){
      n=0;x.minHoldDays=0;x.closeFeeCountdownDays='';x.closeRuleBasis='bonus';x.closeBufferDays=0;
      if(type!=='payout-only'&&type!=='review')type=payoutText([x.closeRuleText,x.analyzedTC,x.completeBonusText].filter(Boolean).join(' '))?'payout-only':'none';
      if(stale)x.closeRuleText=type==='payout-only'?'Keep the account open and unrestricted until the bonus posts.':'';
      x.closeRuleSource=x.closeRuleSource==='verified-bank-rule'?'current-tc-only':(x.closeRuleSource||'current-tc-only');
      x.profileRuleOverride='';
      x.customTimers=(Array.isArray(x.customTimers)?x.customTimers:[]).filter(t=>!AUTO_CLOSE_TIMER_RE.test(String(t?.text||'')));
    }else{
      x.minHoldDays=n;x.closeFeeCountdownDays=String(n);x.closeRuleText=proof||x.closeRuleText||'';x.closeRuleBasis=x.closeRuleBasis||basisForText(x.closeRuleText);x.closeBufferDays=Number.isFinite(parseInt(x.closeBufferDays,10))&&parseInt(x.closeBufferDays,10)>=0?parseInt(x.closeBufferDays,10):5;
    }
    x.closeRestrictionType=type;
    x.closeRuleSourceSentence=proof||payoutText([x.closeRuleText,x.analyzedTC,x.completeBonusText].filter(Boolean).join(' '))||x.closeRuleSourceSentence||'';
    if(x.analysis&&typeof x.analysis==='object'){
      x.analysis.closeRestrictionType=type;x.analysis.closeRuleDays=fixed?n:0;x.analysis.minHoldDays=fixed?n:0;x.analysis.closeRuleBasis=x.closeRuleBasis;x.analysis.closeBufferDays=x.closeBufferDays;x.analysis.closeRuleText=x.closeRuleText||'';x.analysis.closeRuleSourceSentence=x.closeRuleSourceSentence||'';
    }
    return x;
  }

  function analyzeText(raw){
    const proof=explicitRuleText(raw),payout=payoutText(raw);
    if(proof){
      const days=durationDays(proof);
      return{basis:basisForText(proof),days,text:proof,sourceSentence:proof,confidence:'high',type:/deduct|reverse|reclaim|clawback|forfeit|fee|penalty|charge/i.test(proof)?'explicit-clawback':'minimum-open',earlyCloseFee:moneyAmount(proof)};
    }
    return{basis:'bonus',days:0,text:payout||'',sourceSentence:payout||'',confidence:payout?'high':'low',type:payout?'payout-only':'none',earlyCloseFee:0};
  }
  function sanitizeAnalysis(r,raw){
    if(!r)return r;
    const cr=analyzeText(raw||r.raw||r.normalizedRaw||'');
    r.closeRuleDays=cr.days;r.minHoldDays=cr.days;r.closeRuleBasis=cr.basis;r.closeBufferDays=cr.days?(Number.isFinite(parseInt(r.closeBufferDays,10))?parseInt(r.closeBufferDays,10):5):0;
    r.closeRuleText=cr.text;r.closeRuleSourceSentence=cr.sourceSentence;r.closeRuleConfidence=cr.confidence;r.closeRestrictionType=cr.type;
    if(cr.earlyCloseFee){r.earlyCloseFee=cr.earlyCloseFee;r.earlyTerminationFee=cr.earlyCloseFee;r.earlyTerminationFeeText='$'+cr.earlyCloseFee.toLocaleString()}
    r.suggestedTimers=(Array.isArray(r.suggestedTimers)?r.suggestedTimers:[]).filter(t=>!AUTO_CLOSE_TIMER_RE.test(String(t?.text||'')));
    r.actionPlan=String(r.actionPlan||'').split('\n').filter(line=>!/close safety|close check after payout/i.test(line)).join('\n');
    r.reviewFlags=(Array.isArray(r.reviewFlags)?r.reviewFlags:[]).filter(x=>!(cr.type==='payout-only'&&/close rule wording needs manual review/i.test(String(x))));
    if(cr.sourceSentence){
      r.fieldSources=r.fieldSources||{};
      r.fieldSources['Early close / payout risk']={field:'Early close / payout risk',value:cr.text,source:cr.sourceSentence,confidence:cr.confidence,kind:'extracted'};
      r.sourceSnippets=Array.isArray(r.sourceSnippets)?r.sourceSnippets:[];
      const i=r.sourceSnippets.findIndex(x=>x?.field==='Early close / payout risk');
      const row=r.fieldSources['Early close / payout risk'];if(i>=0)r.sourceSnippets[i]=row;else r.sourceSnippets.push(row);
    }
    r.closeRuleGuardVersion=VERSION;
    return r;
  }

  function runSelfTests(){
    const results=[];const test=(name,fn)=>{try{const ok=!!fn();results.push({name,ok,detail:ok?'pass':'failed'})}catch(err){results.push({name,ok:false,detail:err?.message||String(err)})}};
    const chase={bank:'Chase Biz',accountType:'business',opened:'2026-05-07',bonusRecd:'2026-07-14',reqMet:'2026-05-29',minHoldDays:90,closeFeeCountdownDays:'90',closeRuleBasis:'bonus',closeBufferDays:5,closeRuleText:'Keep the account open until the bonus posts.',closeRestrictionType:'payout-only',monthlyFeeYNText:'$15 monthly fee'};
    test('Chase stale countdown clears',()=>{const x=sanitizeEntry({...chase});return x.minHoldDays===0&&ruleDays(x)===0&&safeCloseDate(x)==='2026-07-14'});
    test('Eligibility lookback ignored',()=>{const x=sanitizeEntry({bank:'Example',opened:'2026-01-01',bonusRecd:'2026-02-01',minHoldDays:90,closeRuleText:'Not eligible if an account was closed within the previous 90 days.'});return ruleDays(x)===0&&safeCloseDate(x)==='2026-02-01'});
    test('Explicit fee remains fixed',()=>{const x=sanitizeEntry({bank:'Example',opened:'2026-01-01',bonusRecd:'2026-02-01',minHoldDays:90,closeRuleText:'A $25 fee applies if the account is closed within 90 days of opening.'});return ruleDays(x)===90&&safeCloseDate(x)==='2026-04-06'});
    test('Requirement window is not close hold',()=>{const r=analyzeText('Complete 5 qualifying transactions within 90 days. Bonus paid within 15 days after requirements are met. Keep the account open until the bonus posts.');return r.days===0&&r.type==='payout-only'});
    test('Weird termination wording parsed',()=>{const r=analyzeText('If you terminate the account before the ninetieth calendar day following account opening, a $25 charge will be deducted.');return r.days===90&&r.type==='explicit-clawback'&&r.earlyCloseFee===25});
    test('Manual close timer remains authoritative',()=>{const x=sanitizeEntry({bank:'Example',opened:'2026-01-01',bonusRecd:'2026-02-01',minHoldDays:180,closeFeeCountdownDays:'180',closeRestrictionType:'manual-fixed',closeRuleSource:'manual',closeRuleBasis:'opened',closeBufferDays:5,closeRuleText:'Manual early-close hold: keep the account open for 6 months.'});return ruleDays(x)===180&&safeCloseDate(x)==='2026-07-05'});
    test('Payout-only source sentence retained',()=>{const x=sanitizeEntry({bank:'Example',bonusRecd:'2026-02-01',closeRuleText:'Keep the account open until the bonus posts.'});return x.closeRuleSourceSentence==='Keep the account open until the bonus posts.'});
    const passed=results.filter(x=>x.ok).length;return{version:VERSION,passed,total:results.length,ok:passed===results.length,results};
  }

  return{VERSION,FIXED_TYPES,AUTO_CLOSE_TIMER_RE,clean,sentences,normalizeType,isLookback,durationDays,moneyAmount,hasMonthlyFeeWording,explicitRuleText,payoutText,basisForText,isChaseBiz,typeForEntry,isFixed,ruleDays,basisFor,baseDate,rawSafeDate,safeCloseDate,daysUntilSafe,isInBuffer,sourceSentence,sanitizeEntry,analyzeText,sanitizeAnalysis,runSelfTests};
});
