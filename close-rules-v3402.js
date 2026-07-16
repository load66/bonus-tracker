/* Bonus Tracker v3.4.02 — T&C-driven close rules and stale-rule repair. */
(function(){
  'use strict';
  const VER='3.4.02';
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const fixedTypes=new Set(['explicit-clawback','minimum-open','manual-fixed']);
  const autoCloseTimerRe=/(?:close check after payout|close hold|early-close safety|safe to close)/i;

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
  function sentences(v){return String(v||'').replace(/\r/g,'\n').split(/(?<=[.!?])\s+|\n+|;/).map(clean).filter(Boolean)}
  function durationDays(v){
    const map={thirty:30,sixty:60,ninety:90,thirtieth:30,sixtieth:60,ninetieth:90,'one hundred eighty':180};
    let m=String(v||'').match(/\b(\d{1,3})\s*(?:calendar\s*)?(days?|months?)\b/i),n=0,unit='';
    if(m){n=parseInt(m[1],10)||0;unit=m[2]||''}
    if(!n){m=String(v||'').match(/\b(thirty|sixty|ninety|thirtieth|sixtieth|ninetieth|one\s+hundred\s+eighty)\s*(?:\(\s*(\d{1,3})\s*\))?\s*(?:calendar\s*)?(days?|months?)\b/i);if(m){n=parseInt(m[2],10)||map[clean(m[1]).toLowerCase()]||0;unit=m[3]||''}}
    if(n&&/month/i.test(unit))n*=30;
    return n>0&&n<=730?n:0;
  }
  function moneyAmount(v){
    const m=String(v||'').match(/\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/);
    if(!m)return 0;
    const n=parseFloat(m[1].replace(/,/g,''));
    return Number.isFinite(n)&&n>0?n:0;
  }
  function hasMonthlyFeeWording(v){
    return /(?:monthly|per month|each month)[^.]{0,70}(?:fee|charge)|(?:monthly service fee|monthly maintenance fee|monthly account fee)/i.test(String(v||''));
  }
  function explicitRuleText(eOrText){
    const text=typeof eOrText==='string'?eOrText:String([eOrText?.closeRuleText,eOrText?.earlyTerminationFeeText].filter(Boolean).join(' '));
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
  function isChaseBiz(e){
    const bank=clean(e?.bank).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    const identity=clean([bank,e?.accountType,e?.acct,e?.accountName,e?.productName,e?.analysis?.acct].filter(Boolean).join(' ')).toLowerCase();
    const detail=clean([e?.analyzedTC,e?.completeBonusText,e?.eligibilityText,e?.notes,e?.raw,e?.normalizedRaw].filter(Boolean).join(' ')).toLowerCase();
    if(!/\b(?:jpmorgan\s+)?chase\b/.test(identity+' '+detail))return false;
    if(/\b(?:total checking|secure banking|first checking|private client checking|platinum business|performance business)\b/.test(identity))return false;
    return /\b(?:chase biz|chase business|business complete|business checking)\b/.test(identity+' '+detail);
  }
  function typeFor(e){
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
  function fixed(e){return fixedTypes.has(typeFor(e))}
  function basisForText(text){
    if(/after[^.]{0,80}(?:bonus|reward|payout|payment)|(?:bonus|reward|payout|payment)[^.]{0,80}(?:posted|received|paid)/i.test(text))return'bonus';
    if(/after[^.]{0,80}(?:requirement|qualification)|(?:requirement|qualification)[^.]{0,80}(?:met|completed|satisfied)/i.test(text))return'reqmet';
    return'opened';
  }
  function sanitize(e){
    if(!e||typeof e!=='object')return e;
    const x=e;
    let type=typeFor(x);
    const proof=explicitRuleText(x);
    let n=parseInt(x.minHoldDays||x.closeFeeCountdownDays||0,10)||0;
    const staleChase=/day 91|do not close within 90 days|safer future chase business offer eligibility|90 days from (?:requirement|bonus)/i.test(String(x.closeRuleText||''))||x.profileRuleOverride==='chase-business-day91'||x.closeRuleSource==='verified-bank-rule';
    if(isChaseBiz(x)){x.fundedDays=parseInt(x.fundedDays,10)||30;x.holdDays=parseInt(x.holdDays,10)||60;if(staleChase&&!proof)type=payoutText([x.closeRuleText,x.analyzedTC,x.completeBonusText].filter(Boolean).join(' '))?'payout-only':'none'}
    const isFixed=fixedTypes.has(type)&&n>0&&n<=730&&(sourceIsManual(x)||!!proof);
    if(!isFixed){
      n=0;x.minHoldDays=0;x.closeFeeCountdownDays='';x.closeRuleBasis='bonus';x.closeBufferDays=0;
      if(type!=='payout-only'&&type!=='review')type=payoutText([x.closeRuleText,x.analyzedTC,x.completeBonusText].filter(Boolean).join(' '))?'payout-only':'none';
      if(staleChase)x.closeRuleText=type==='payout-only'?'Keep the account open and unrestricted until the bonus posts.':'';
      x.closeRuleSource=x.closeRuleSource==='verified-bank-rule'?'current-tc-only':(x.closeRuleSource||'current-tc-only');
      x.profileRuleOverride='';
      x.customTimers=(Array.isArray(x.customTimers)?x.customTimers:[]).filter(t=>!autoCloseTimerRe.test(String(t?.text||'')));
    }else{
      x.minHoldDays=n;x.closeFeeCountdownDays=String(n);x.closeRuleText=proof||x.closeRuleText||'';x.closeRuleBasis=x.closeRuleBasis||basisForText(x.closeRuleText);x.closeBufferDays=Number.isFinite(parseInt(x.closeBufferDays,10))&&parseInt(x.closeBufferDays,10)>=0?parseInt(x.closeBufferDays,10):5;
    }
    x.closeRestrictionType=type;
    if(x.analysis&&typeof x.analysis==='object'){
      x.analysis.closeRestrictionType=type;x.analysis.closeRuleDays=isFixed?n:0;x.analysis.minHoldDays=isFixed?n:0;x.analysis.closeRuleBasis=x.closeRuleBasis;x.analysis.closeBufferDays=x.closeBufferDays;x.analysis.closeRuleText=x.closeRuleText||'';
    }
    return x;
  }

  const oldNormalize=typeof window.normalizeLifecycleEntry==='function'?window.normalizeLifecycleEntry:null;
  function normalizePatched(e){
    const x=oldNormalize?oldNormalize(e):({...e});
    sanitize(x);
    try{if(typeof window.btBuildResolvedBankProfile==='function'){x.profile=window.btBuildResolvedBankProfile(x);x.profileVersion='bank-profile-v2'}}catch{}
    return x;
  }
  window.normalizeCloseRestrictionType=normalizeType;
  window.closeRestrictionTypeFor=typeFor;
  window.isFixedCloseRestriction=fixed;
  window.explicitFixedCloseRuleText=explicitRuleText;
  window.normalizeLifecycleEntry=normalizePatched;
  try{normalizeLifecycleEntry=normalizePatched}catch{}

  const zeroPolicy=()=>null;
  window.knownClosePolicy=zeroPolicy;try{knownClosePolicy=zeroPolicy}catch{}
  window.applyKnownClosePolicy=e=>sanitize(e);try{applyKnownClosePolicy=window.applyKnownClosePolicy}catch{}
  function ruleDays(e){const n=parseInt(e?.minHoldDays||e?.closeFeeCountdownDays||0,10)||0;return fixed(e)&&n>0&&n<=730?n:0}
  window.closeRuleDaysFor=ruleDays;try{closeRuleDaysFor=ruleDays}catch{}
  function basis(e){return typeof window.normalizeCloseRuleBasis==='function'?window.normalizeCloseRuleBasis(e?.closeRuleBasis||basisForText(e?.closeRuleText||'')):(e?.closeRuleBasis||'opened')}
  window.closeRuleBasisFor=basis;try{closeRuleBasisFor=basis}catch{}
  function baseDate(e){const b=basis(e);return b==='bonus'?e?.bonusRecd||'':b==='reqmet'?e?.reqMet||'':b==='manual'?'':e?.opened||''}
  window.closeBasisDate=baseDate;try{closeBasisDate=baseDate}catch{}
  function rawDate(e){const d=ruleDays(e);return d?(baseDate(e)&&addD(baseDate(e),d)):e?.bonusRecd||null}
  function safeDate(e){const d=ruleDays(e);const buffer=d?(parseInt(e?.closeBufferDays,10)||0):0;return d?(baseDate(e)&&addD(baseDate(e),d+buffer)):e?.bonusRecd||null}
  window.rawSafeDate=rawDate;window.safeCloseDate=safeDate;try{rawSafeDate=rawDate;safeCloseDate=safeDate}catch{}
  function daysSafe(e){const s=safeDate(e);return s?Math.max(0,dB(td(),s)):null}
  window.daysUntilSafe=daysSafe;try{daysUntilSafe=daysSafe}catch{}
  function inBuffer(e){if(!e?.opened||ruleDays(e)<=0||e.closed)return false;const raw=rawDate(e),safe=safeDate(e);return !!(raw&&safe&&dB(td(),raw)<=0&&dB(td(),safe)>0)}
  window.isInBuffer=inBuffer;try{isInBuffer=inBuffer}catch{}

  function statusPatched(e){
    if(!e||!e.bank)return'';
    if(e.closed)return daysLeft(e)===0?'TIME TO CHURN!':'WAITING TO CHURN!';
    const hasBonus=!!e.bonusRecd,hasReq=!!e.reqMet,hold=ruleDays(e)>0&&!!baseDate(e);
    if(hasBonus){if(hold){if(inBuffer(e))return'3-DAY BUFFER';const d=daysSafe(e);if(d!==null&&d>0)return'WAITING TO CLOSE'}return'SAFE TO CLOSE'}
    const active=typeof nextActiveTimer==='function'?nextActiveTimer(e):null;
    if(hasReq)return active?'CUSTOM TIMER':'REQ MET';
    if(active)return'CUSTOM TIMER';
    return'WORKING';
  }
  window.status=statusPatched;try{status=statusPatched}catch{}

  function readiness(e,closeDate=''){
    const items=[];const add=(ok,label,detail='',level='warn')=>items.push({ok:!!ok,label,detail,level});
    if(!e||!e.bank)return{label:'Manual Review',cls:'warn',items:[],warnings:['Entry missing']};
    if(e.closed)return{label:'Closed / Waiting to Churn',cls:'done',items:[{ok:true,label:'Closed date saved',detail:fD(e.closed)}],warnings:[]};
    const safe=safeDate(e),target=closeDate||td(),days=ruleDays(e),b=basis(e),base=baseDate(e);
    add(!!e.reqMet,'Requirement met date saved',e.reqMet?fD(e.reqMet):'Save Req Met before closing','danger');
    add(!!e.bonusRecd,'Bonus received',e.bonusRecd?fD(e.bonusRecd):'Do not close before the bonus posts','danger');
    if(days){add(!!base,'Close-rule start date available',base?fD(base):'Missing','danger');add(!!safe&&dB(target,safe)<=0,'Hold period + buffer complete',safe?'Safe close: '+fD(safe):'Cannot calculate','danger')}
    else add(true,'No fixed post-bonus hold',typeFor(e)==='payout-only'?'Close after bonus posts':'No countdown found');
    add(!!e.churn,'Churn rule saved',e.churn?(e.churn==='180'?'180 days':e.churn+' year'):'Needed for future churn','warn');
    const hasFee=/(yes|\$|monthly|service fee|maintenance fee)/i.test(String(e.monthlyFeeYNText||'')+' '+String(e.avoidMonthlyFeeText||''));
    add(!hasFee||!!e.monthlyFeeChecked,'Monthly fee checked',hasFee?(e.monthlyFeeChecked?'Confirmed':'Check next statement before close'):'No monthly fee risk','warn');
    const warnings=items.filter(x=>!x.ok).map(x=>x.label+(x.detail?': '+x.detail:''));
    const blockers=items.filter(x=>!x.ok&&x.level==='danger'),cautions=items.filter(x=>!x.ok&&x.level!=='danger');
    return{label:blockers.length?'Do Not Close Yet':cautions.length?'Ready — Review Fee':'Safe to Close',cls:blockers.length?'danger':cautions.length?'warn':'safe',items,warnings,safeDate:safe,rawDate:rawDate(e),basis:b};
  }
  window.closeReadiness=readiness;try{closeReadiness=readiness}catch{}

  function closePlan(e){
    if(!e?.bank)return null;const ready=readiness(e),rows=[];
    if(e.closed){rows.push({label:'Closed',value:fD(e.closed),cls:'ok'});const cr=churnReadyDate(e);if(cr)rows.push({label:'Churn ready',value:fD(cr)});return{title:'Close Check',sub:'Closure saved',chip:ready.label,cls:ready.cls,rows,notes:[],compact:true}}
    const safe=safeDate(e),days=ruleDays(e),buffer=days?(parseInt(e.closeBufferDays,10)||0):0;
    rows.push({label:'Earliest close',value:safe?fD(safe):(e.bonusRecd?'Close after bonus posts':'Wait for bonus'),cls:safe&&daysSafe(e)<=0?'ok':safe?'warn':'bad'});
    rows.push({label:'Rule',value:days?`${days} days from ${closeRuleBasisLabel(basis(e)).toLowerCase()}${buffer?' + '+buffer+' day safety':''}`:(typeFor(e)==='payout-only'?'Close after bonus posts':'No fixed post-bonus hold'),cls:days?'':'ok'});
    rows.push({label:'Final check',value:e.bonusRecd?'Bonus posted · no pending activity':'Wait for bonus to post',cls:e.bonusRecd?'':'bad'});
    return{title:'Close Check',sub:'One clear source of truth',chip:ready.label,cls:ready.cls,rows,notes:[],compact:true};
  }
  window.closePlanForEntry=closePlan;try{closePlanForEntry=closePlan}catch{}

  const oldProfileSummary=window.renderBankProfileSummary;
  window.renderBankProfileSummary=function(e){
    if(!e)return oldProfileSummary?oldProfileSummary(e):'';
    const escFn=typeof window.esc==='function'?window.esc:(x=>String(x));
    const items=[];const add=(label,value,cls='')=>items.push({label,value,cls});
    add('Opened',e.opened?fD(e.opened):'Add date',e.opened?'':'warn');
    if(e.closed){add('Closed',fD(e.closed),'ok');add('Bonus',e.bonusRecd?((e.bonus?fM(e.bonus)+' · ':'')+fD(e.bonusRecd)):(e.bonus?fM(e.bonus):'Not saved'),e.bonusRecd?'ok':'');const cr=churnReadyDate(e);add('Churn ready',cr?fD(cr):'Not calculated',cr?'':'warn')}
    else{add('Bonus',e.bonusRecd?((e.bonus?fM(e.bonus)+' · ':'')+fD(e.bonusRecd)):(e.bonus?fM(e.bonus)+' pending':'Pending'),e.bonusRecd?'ok':'warn');add('Requirement',e.reqMet?'Met '+fD(e.reqMet):'Pending',e.reqMet?'ok':'warn');const s=safeDate(e);add('Earliest close',s?fD(s):'Review terms',s&&daysSafe(e)<=0?'ok':s?'warn':'bad')}
    return '<div class="profile-summary">'+items.map(x=>'<div class="profile-summary-item '+escFn(x.cls||'')+'"><span>'+escFn(x.label)+'</span><b>'+escFn(x.value)+'</b></div>').join('')+'</div>';
  };
  try{renderBankProfileSummary=window.renderBankProfileSummary}catch{}

  const analyzerCore=window.tcV3Analyze;
  function sanitizeAnalysis(r,raw){
    if(!r)return r;const lines=sentences(raw),proof=lines.find(s=>!isLookback(s)&&!!explicitRuleText(s));const payout=payoutText(raw);
    if(proof){
      const n=durationDays(proof);
      if(n){
        r.closeRuleDays=n;r.minHoldDays=n;r.closeRuleText=proof;r.closeRuleBasis=basisForText(proof);
        r.closeBufferDays=Number.isFinite(parseInt(r.closeBufferDays,10))?parseInt(r.closeBufferDays,10):5;
        r.closeRestrictionType=/deduct|reverse|reclaim|clawback|forfeit|fee|penalty|charge/i.test(proof)?'explicit-clawback':'minimum-open';
        const earlyFee=moneyAmount(proof);
        if(earlyFee){r.earlyCloseFee=earlyFee;r.earlyTerminationFee=earlyFee;r.earlyTerminationFeeText='$'+earlyFee.toLocaleString();}
        if(!hasMonthlyFeeWording(raw)){
          r.fee=0;r.monthlyFee=null;r.monthlyFeeYNText='';r.monthlyFeeAmountText='';
          r.waivers=[];
          if(r.fieldSources){delete r.fieldSources['Monthly fee'];delete r.fieldSources['Fee waiver'];}
          r.sourceSnippets=(Array.isArray(r.sourceSnippets)?r.sourceSnippets:[]).filter(x=>!/monthly fee|fee waiver/i.test(String(x?.field||'')));
        }
      }
    }
    else{const had=!!(parseInt(r.closeRuleDays||r.minHoldDays||0,10));r.closeRuleDays=0;r.minHoldDays=0;r.closeBufferDays=0;r.closeRuleBasis='bonus';r.closeRuleText=payout||'';r.closeRestrictionType=payout?'payout-only':'none';if(had){r.reviewFlags=Array.isArray(r.reviewFlags)?r.reviewFlags:[];const msg='A fixed close countdown was removed because no source sentence connected a duration to closing or keeping the account open.';if(!r.reviewFlags.includes(msg))r.reviewFlags.push(msg)}}
    if(isChaseBiz({...r,raw})&&!proof){r.closeRuleDays=0;r.minHoldDays=0;r.closeBufferDays=0;r.closeRuleBasis='bonus';r.closeRestrictionType='payout-only';r.closeRuleText='Keep the account open and unrestricted until the bonus posts.'}
    r.suggestedTimers=(Array.isArray(r.suggestedTimers)?r.suggestedTimers:[]).filter(t=>!autoCloseTimerRe.test(String(t?.text||'')));
    r.actionPlan=String(r.actionPlan||'').split('\n').filter(line=>!/close safety|close check after payout/i.test(line)).join('\n');
    r.reviewFlags=(Array.isArray(r.reviewFlags)?r.reviewFlags:[]).filter(x=>!(r.closeRestrictionType==='payout-only'&&/close rule wording needs manual review/i.test(String(x))));
    if(proof){
      r.fieldSources=r.fieldSources||{};
      r.fieldSources['Early close / payout risk']={field:'Early close / payout risk',value:r.closeRuleText,source:proof,confidence:'high',kind:'extracted'};
      r.sourceSnippets=Array.isArray(r.sourceSnippets)?r.sourceSnippets:[];
      if(!r.sourceSnippets.some(x=>x?.field==='Early close / payout risk'&&x?.source===proof))r.sourceSnippets.push(r.fieldSources['Early close / payout risk']);
    }
    r.closeRuleGuardVersion=VER;return r;
  }
  if(typeof analyzerCore==='function'){
    window.tcV3Analyze=function(raw,opts){return sanitizeAnalysis(analyzerCore(raw,opts),raw)};
    window.tcUnifiedAnalyze=window.tcV3Analyze;window.tcStrictAnalyze=window.tcV3Analyze;window.tcV3EngineVersion=VER;
  }

  const oldApply=window.tcApplyReviewed;
  if(typeof oldApply==='function')window.tcApplyReviewed=function(){const out=oldApply.apply(this,arguments);setTimeout(()=>{try{if(typeof modal!=='undefined'&&modal){sanitize(modal);modal.closeRestrictionType=typeFor(modal)}if(typeof R==='function')R()}catch{}},0);return out};

  function clearTimer(e){if(!e)return e;e.minHoldDays=0;e.closeFeeCountdownDays='';e.earlyCloseFee=0;e.earlyTerminationFeeText='';e.closeRuleBasis='bonus';e.closeBufferDays=0;e.closeRestrictionType=payoutText([e.closeRuleText,e.analyzedTC].filter(Boolean).join(' '))?'payout-only':'none';if(e.closeRestrictionType==='none')e.closeRuleText='';e.closeRuleSource='manual';e.profileRuleOverride='';e.feeChecked=true;return sanitize(e)}
  window.feeCheckSkip=function(){if(!window.feeCheckPrompt&&typeof feeCheckPrompt==='undefined')return;const p=typeof feeCheckPrompt!=='undefined'?feeCheckPrompt:window.feeCheckPrompt;if(!p)return;const id=p.entryId;entries=entries.map(e=>e.id===id?normalizePatched(clearTimer({...e})):e);entries=sortE(entries);sv(SK,entries);feeCheckPrompt=null;startCloseFlow(id)};
  window.feeCheckRemoveTimer=function(){const p=typeof feeCheckPrompt!=='undefined'?feeCheckPrompt:window.feeCheckPrompt;if(!p)return;const id=p.entryId,current=entries.find(e=>e.id===id);entries=entries.map(e=>e.id===id?normalizePatched(clearTimer({...e})):e);entries=sortE(entries);sv(SK,entries);feeCheckPrompt=null;cfm={title:'Timer Removed',msg:(current?current.bank+' ':'')+'early-close timer removed. This bank is now marked Safe to Close.',green:true,action:()=>{cfm=null;R()}};R()};
  window.feeCheckSave=function(){
    const p=typeof feeCheckPrompt!=='undefined'?feeCheckPrompt:window.feeCheckPrompt;if(!p)return;
    const id=p.entryId,months=Math.max(1,parseInt(p.months,10)||6),feeAmt=Math.max(0,parseFloat(p.feeAmount)||0);
    entries=entries.map(e=>{
      if(e.id!==id)return e;
      const x={...e};
      const end=x.opened?addM(x.opened,months):'';
      const days=x.opened&&end?dB(x.opened,end):months*30;
      x.minHoldDays=days;x.closeFeeCountdownDays=String(days);x.closeRuleBasis='opened';x.closeBufferDays=5;
      x.closeRestrictionType='manual-fixed';x.closeRuleSource='manual';x.profileRuleOverride='';
      x.earlyCloseFee=feeAmt;x.earlyTerminationFee=feeAmt;x.earlyTerminationFeeText=feeAmt?'$'+feeAmt.toLocaleString():'';
      x.closeRuleText=`Manual early-close hold: keep the account open for ${months} month${months===1?'':'s'} from the opened date${feeAmt?' to avoid a $'+feeAmt.toLocaleString()+' fee':''}.`;
      x.feeChecked=false;
      x.fieldSources=(x.fieldSources&&typeof x.fieldSources==='object')?x.fieldSources:{};
      const meta={kind:'manual',confidence:'verified',source:'Set manually in the Early Closure Fee timer.',updatedAt:new Date().toISOString()};
      x.fieldSources.closeFeeCountdownDays=meta;x.fieldSources.closeRuleText=meta;x.fieldSources.closeRuleBasis=meta;
      return normalizePatched(x);
    });
    entries=sortE(entries);sv(SK,entries);feeCheckPrompt=null;
    const e=entries.find(x=>x.id===id),dsc=e?daysSafe(e):null;
    if(e&&dsc!==null&&dsc<=0){cfm={title:'Already Safe',msg:e.bank+' hold period has already passed. Continue to close this account now?',green:true,confirmLabel:'Continue',action:()=>{cfm=null;startCloseFlow(id)}};R();return;}
    R();
  };

  function migrate(){
    try{if(typeof entries!=='undefined'&&Array.isArray(entries)){entries=entries.map(normalizePatched);sv(SK,entries)}}catch{}
    try{window.BT_APP_VERSION=VER}catch{}
  }
  window.btRunFullRegressionTests=function(){
    const results=[];const test=(name,fn)=>{try{const ok=!!fn();results.push({name,ok,detail:ok?'pass':'failed'})}catch(err){results.push({name,ok:false,detail:err?.message||String(err)})}};
    const chase={bank:'Chase Biz',accountType:'business',opened:'2026-05-07',bonusRecd:'2026-07-14',reqMet:'2026-05-29',minHoldDays:90,closeFeeCountdownDays:'90',closeRuleBasis:'bonus',closeBufferDays:5,closeRuleText:'Keep the account open until the bonus posts.',closeRestrictionType:'payout-only',monthlyFeeYNText:'$15 monthly fee',avoidMonthlyFeeText:'$2,000 minimum balance'};
    test('Chase stale countdown clears',()=>{const x=normalizePatched(chase);return x.minHoldDays===0&&ruleDays(x)===0&&safeDate(x)==='2026-07-14'&&statusPatched(x)==='SAFE TO CLOSE'});
    test('Eligibility lookback ignored',()=>{const x=normalizePatched({bank:'Example',opened:'2026-01-01',bonusRecd:'2026-02-01',minHoldDays:90,closeRuleText:'Not eligible if an account was closed within the previous 90 days.'});return ruleDays(x)===0&&safeDate(x)==='2026-02-01'});
    test('Explicit fee remains fixed',()=>{const x=normalizePatched({bank:'Example',opened:'2026-01-01',bonusRecd:'2026-02-01',minHoldDays:90,closeRuleText:'A $25 fee applies if the account is closed within 90 days of opening.'});return ruleDays(x)===90&&safeDate(x)==='2026-04-06'});
    test('Requirement window is not close hold',()=>{const r=window.tcV3Analyze('Example Bank $300 bonus. Complete 5 qualifying transactions within 90 days. Bonus paid within 15 days after requirements are met. Keep the account open until the bonus posts.');return r.closeRuleDays===0&&r.closeRestrictionType==='payout-only'});
    test('Weird termination wording parsed',()=>{const r=window.tcV3Analyze('Example Bank promotional reward. If you terminate the account before the ninetieth calendar day following account opening, a $25 charge will be deducted.');return r.closeRuleDays===90&&r.closeRestrictionType==='explicit-clawback'&&r.earlyCloseFee===25&&r.fee===0});
    test('Manual close timer remains authoritative',()=>{const x=normalizePatched({bank:'Example',opened:'2026-01-01',bonusRecd:'2026-02-01',minHoldDays:180,closeFeeCountdownDays:'180',closeRestrictionType:'manual-fixed',closeRuleSource:'manual',closeRuleBasis:'opened',closeBufferDays:5,closeRuleText:'Manual early-close hold: keep open for 6 months.'});return ruleDays(x)===180&&safeDate(x)==='2026-07-05'});
    test('Monthly fee remains separate from close fee',()=>{const r=window.tcV3Analyze('Example Bank $300 bonus. $12 monthly service fee. A $25 fee applies if the account is closed within 90 days of opening.');return r.closeRuleDays===90&&r.fee===12&&r.earlyCloseFee===25});
    const passed=results.filter(x=>x.ok).length,report={version:VER,passed,total:results.length,ok:passed===results.length,results,ranAt:new Date().toISOString()};window.__btFullRegressionReport=report;try{localStorage.setItem('bt_last_regression_v1',JSON.stringify(report))}catch{}return report;
  };

  migrate();
  setTimeout(()=>{try{migrate();const rep=window.btRunFullRegressionTests();if(!rep.ok)console.warn('Close-rule regression warnings',rep);if(typeof R==='function')R()}catch(err){console.error('Close-rule v3.4.02 init failed',err)}},0);
})();
