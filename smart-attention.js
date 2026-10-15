/* BonusTracker v3.4.69 Action Center — canonical lifecycle stages drive every user-facing action item. */
(function(){
  'use strict';
  const VER='3.4.69-action1';

  function finite(v){if(v==null||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
  function daysTo(date){
    if(!date)return null;
    try{if(typeof dB==='function'&&typeof td==='function')return dB(td(),date)}catch{}
    const due=new Date(String(date)+'T00:00:00'),now=new Date();
    if(isNaN(due))return null;
    return Math.floor((due-now)/864e5)
  }
  function fallbackStage(e){
    let raw='';try{raw=typeof status==='function'?String(status(e)||''):''}catch{}
    if(e?.closed){
      if(raw==='ARCHIVED')return{code:'ARCHIVED',label:'Archived',support:'Completed · non-repeatable offer'};
      let d=null;try{d=typeof daysLeft==='function'?daysLeft(e):null}catch{}
      return finite(d)!==null&&d<=0
        ?{code:'ELIGIBLE',label:'Eligible',support:'Eligible to reapply'}
        :{code:'COOLDOWN',label:'Cooldown',support:finite(d)!=null?d+'d until eligible':'Waiting for eligibility date'};
    }
    if(raw==='SAFE TO CLOSE')return{code:'READY_TO_CLOSE',label:'Ready to Close',support:'All close restrictions cleared'};
    if(raw==='WAITING TO CLOSE'||raw==='3-DAY BUFFER')return{code:'HOLD_OPEN',label:'Hold Open',support:'Keep account open until close rules clear'};
    if(e?.bonusRecd)return{code:'BONUS_RECEIVED',label:'Bonus Received',support:'Review close eligibility'};
    if(e?.reqMet)return{code:'AWAITING_BONUS',label:'Awaiting Bonus',support:'Requirements complete · waiting for payout'};
    return{code:'IN_PROGRESS',label:'In Progress',support:'Complete bonus requirements'}
  }
  function stageFor(e){
    try{if(typeof window.btLifecycleStageForEntry==='function')return window.btLifecycleStageForEntry(e)}catch{}
    return fallbackStage(e)
  }
  function stageDays(e,stage){
    if(stage?.timer?.date){
      try{if(typeof timerCountdownDays==='function'){const d=timerCountdownDays(stage.timer);if(Number.isFinite(d))return d}}catch{}
      const d=daysTo(stage.timer.date);if(d!==null)return d
    }
    if(stage?.code==='HOLD_OPEN'){
      try{const d=daysUntilSafe(e);if(Number.isFinite(d))return d}catch{}
    }
    if(stage?.code==='COOLDOWN'){
      try{const d=daysLeft(e);if(Number.isFinite(d))return d}catch{}
    }
    if((stage?.code==='IN_PROGRESS'||stage?.code==='ACTION_NEEDED')&&!e?.reqMet){
      try{const due=reqDeadline(e);const d=daysTo(due);if(d!==null)return d}catch{}
    }
    return null
  }
  function priority(code){
    return code==='ACTION_NEEDED'?0:
      code==='READY_TO_CLOSE'?1:
      code==='ELIGIBLE'?2:
      code==='AWAITING_BONUS'?3:
      code==='REQUIREMENTS_MET'?3.2:
      code==='HOLD_OPEN'?4:
      code==='BONUS_RECEIVED'?4.2:
      code==='IN_PROGRESS'?5:
      code==='COOLDOWN'?6:99
  }
  function actionVerb(code){
    return code==='ACTION_NEEDED'?'Act now':
      code==='READY_TO_CLOSE'?'Close account':
      code==='ELIGIBLE'?'Review opportunity':
      code==='AWAITING_BONUS'?'Watch payout':
      code==='REQUIREMENTS_MET'?'Confirm payout timing':
      code==='HOLD_OPEN'?'Keep open':
      code==='BONUS_RECEIVED'?'Review close rules':
      code==='COOLDOWN'?'Wait for eligibility':'Complete next requirement'
  }
  function recurring(e,stage){
    if(window.BTFinancialRules?.summarize(e).recurring)return true;
    return /monthly|each month|every month|per month|recurring|ongoing/i.test([e.completeBonusText,e.requiredDaysText,stage?.timer?.text].filter(Boolean).join(' '));
  }
  function dateText(value){try{return typeof fD==='function'?fD(value):String(value)}catch{return String(value)}}
  function dateContext(e,stage){
    const unknown=detail=>({date:'',confirmed:false,explanation:'Date not confirmed · '+detail});
    const result=(date,explanation)=>date?{date,confirmed:true,explanation}:unknown(explanation);
    const gate=window.BTEligibilityGate;
    if(e.closed){
      const ready=typeof churnReadyDate==='function'?churnReadyDate(e):'';
      if(!gate)return unknown('review saved eligibility terms');
      const validation=gate.validate(e);
      if(!validation.ok)return {date:ready||'',confirmed:false,explanation:ready?'Saved legacy countdown · '+dateText(ready)+' · current offer terms need review':'Date not confirmed · '+validation.reason};
      const official=gate.officialEligibilityDate(e,addD,addM);
      const rule=gate.controllingRule(e,addD,addM);
      if(!official||!ready||!rule)return unknown('eligibility anchor or condition is missing');
      return result(ready,gate.anchorLabel(rule.basis)+' '+dateText(rule.anchorDate)+' + '+gate.periodLabel(rule.period)+' → official '+dateText(official)+' · safe reapply '+dateText(ready)+' (includes eligibility safety buffer)');
    }
    if(e.bonusRecd){
      const core=window.BTCloseRules;
      const proof=core?.sourceSentence(e)||e.closeRuleText||e.earlyTerminationFeeText||'';
      if(!proof.trim())return unknown('close-rule wording is missing');
      if(/business days?|statement (?:period|cycle)|\bmonths?\b|\byears?\b/i.test(proof))return unknown('review the exact calendar or statement-based close rule');
      const date=typeof safeCloseDate==='function'?safeCloseDate(e):'';
      const raw=typeof rawSafeDate==='function'?rawSafeDate(e):'';
      const days=typeof closeRuleDaysFor==='function'?closeRuleDaysFor(e):0;
      if(!date)return unknown('close-rule start date is missing');
      if(!days&&core?.typeForEntry(e)==='review')return unknown('close terms require review');
      if(!days)return result(date,'Bonus received '+dateText(e.bonusRecd)+' · '+String(proof).replace(/\s+/g,' ').slice(0,180));
      const anchor=closeBasisDate(e),basis=closeRuleBasisLabel(closeRuleBasisFor(e));
      const buffer=closeBufferDaysFor(e);
      return result(date,basis+' '+dateText(anchor)+' + '+days+' days → hold ends '+dateText(raw)+(buffer?' · safety '+buffer+' days → '+dateText(date):''));
    }
    const timer=stage.timer;
    if(timer?.startDate&&timer?.daysRequired&&/business days?|statement (?:period|cycle)|\bmonths?\b|\byears?\b/i.test([timer.text,stage.kind==='requirement'?e.requiredDaysText:''].filter(Boolean).join(' ')))return unknown('the saved timer needs an exact calendar or statement date');
    if(timer?.date)return result(timer.date,(timer.startDate&&timer.daysRequired?dateText(timer.startDate)+' + '+timer.daysRequired+' calendar days':'Saved '+(stage.kind||'custom')+' timer')+' → '+dateText(timer.date));
    if(e.reqMet)return unknown('payout deadline is not saved; review the payout wording');
    const date=typeof reqDeadline==='function'?reqDeadline(e):'';
    return result(date,date?'Opened '+dateText(e.opened)+' + '+e.reqDays+' calendar days → '+dateText(date):'requirement deadline or opening date is missing')
  }
  function nextActionForEntry(e){
    const stage=stageFor(e),context=dateContext(e,stage);
    const financial=window.BTFinancialRules?.validate(e);
    if(financial&&!financial.ok){
      const issues=financial.issues.map(x=>x.message).join('; ');
      return {stage,context:{date:'',confirmed:false,explanation:'Financial rules need review · '+issues},kind:'review',label:'Review financial rules',explanation:'The saved financial rules are incomplete or inconsistent. Review the original promotion and fee terms before relying on a completion or closure recommendation. '+issues};
    }
    let kind='review',label='Review account';
    if(!e.closed&&!e.bonusRecd){
      if(e.reqMet&&!recurring(e,stage)){kind='bonus';label='Confirm bonus received'}
      else if(recurring(e,stage))label='Review recurring requirements';
      else if(!stage.timer||stage.kind==='requirement'){kind='requirements';label='Confirm requirements completed'}
      else label='Review '+(stage.kind||'next')+' requirement';
    }else if(!e.closed&&e.bonusRecd){
      const readiness=typeof closeReadiness==='function'?closeReadiness(e):null;
      const eligibility=window.BTEligibilityGate?.validate(e);
      if(stage.code==='READY_TO_CLOSE'&&readiness?.cls==='safe'&&eligibility?.ok&&context.confirmed){kind='close';label='Review & record closure'}
      else label='Review close checks';
    }else if(stage.code==='ELIGIBLE')label='Review current offer';
    else if(!context.date)label='Review eligibility terms';
    let explanation='Review the saved requirements and dates before recording another milestone.';
    if(e.closed)explanation='This account is recorded as closed. Review current official terms before considering another application.';
    else if(recurring(e,stage))explanation='This offer has recurring requirements. A completed deposit or task does not confirm every required period.';
    else if(kind==='requirements'){
      const remaining=Array.isArray(e.checklist)?e.checklist.filter(t=>t&&!t.done).length:0;
      const requirement=String(e.dataPoint||'').trim();
      explanation=(requirement?'Saved requirement: '+requirement.slice(0,300)+'. ':'')+(remaining?remaining+' checklist task'+(remaining===1?' remains':'s remain')+'. ':'')+'Confirm completion only after checking qualifying activity with the bank.';
    }else if(kind==='bonus')explanation='Requirements are marked complete; payment is not recorded yet. '+(e.payoutTimingText?'Saved payout wording: '+String(e.payoutTimingText).slice(0,400):'Payout timing is not confirmed in the saved record.')+' Record receipt after the bonus posts.';
    else if(kind==='close')explanation='The saved close checks are satisfied. Confirm current fees, pending transactions and companion accounts with the bank before closing; record the actual closure date afterward.';
    else if(e.bonusRecd)explanation='The bonus is recorded as received. Review the saved keep-open restrictions and fee checks before recording closure.';
    if(!context.confirmed)explanation+=' The next date is not confirmed; review its terms and start date.';
    return {stage,context,kind,label,explanation}
  }
  function shouldInclude(e,stage,days){
    if(!e||!e.bank||!stage)return false;
    if(!e.closed)return stage.code!=='ARCHIVED';
    if(stage.code==='ELIGIBLE')return true;
    if(stage.code==='COOLDOWN')return !Number.isFinite(days)||days<=30;
    return false
  }
  function smart(){
    const rows=[];
    const source=[];try{if(typeof entries!=='undefined'&&Array.isArray(entries))source.push(...entries)}catch{}
    source.forEach(e=>{
      if(!e||!e.bank)return;
      const nextAction=nextActionForEntry(e),stage=nextAction.stage,rawDays=stageDays(e,stage),days=Number.isFinite(rawDays)?Math.max(0,rawDays):999999;
      if(!shouldInclude(e,stage,rawDays))return;
      rows.push({
        bank:e.bank,
        entryId:e.id||'',
        dedupeKey:e.id||e.bank,
        stageCode:stage.code||'IN_PROGRESS',
        stageLabel:stage.label||'In Progress',
        action:actionVerb(stage.code),
        actionKind:nextAction.kind,
        actionLabel:nextAction.label,
        actionExplanation:nextAction.explanation,
        dateContext:nextAction.context,
        rsn:String(stage.support||'Review this account').trim(),
        bonus:Number(e.bonus||0),
        showBonus:Number(e.bonus||0)>0,
        days,
        pri:priority(stage.code),
        category:String(stage.code||'').toLowerCase().replace(/_/g,'-')
      })
    });
    rows.sort((a,b)=>(a.pri-b.pri)||(a.days-b.days)||(b.bonus-a.bonus)||String(a.bank).localeCompare(String(b.bank)));
    return rows
  }

  window.getAttentionSuggestions=smart;
  window.btNextActionForEntry=nextActionForEntry;
  window.btActionDateContext=dateContext;
  // Refresh on local-day changes, but never rebuild a form being edited.
  let renderedDay=typeof td==='function'?td():'';
  function refreshDay(){
    const today=typeof td==='function'?td():'';
    if(!today||today===renderedDay||typeof R!=='function')return false;
    const editing=typeof document!=='undefined'&&(/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName||'')||document.activeElement?.isContentEditable);
    let busy=false;
    try{busy=!!(modal||cfm||reqPrompt||rcvPrompt||closePrompt||timerEditModal||ddPrompt||overwritePrompt||matchPickerPrompt||replacementPickerPrompt||feeCheckPrompt||dpEditor||timerChoicePrompt||window.__btBankActionPrompt)}catch{}
    const openEditor=typeof document!=='undefined'&&document.querySelector('.inline-form');
    if(editing||busy||openEditor||(typeof document!=='undefined'&&document.getElementById('bt_confirm_overlay')))return false;
    R();renderedDay=today;return true;
  }
  window.btRefreshActionDay=refreshDay;
  if(typeof document!=='undefined'){
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshDay()});
    document.addEventListener('focusout',()=>setTimeout(refreshDay,0));
    window.addEventListener?.('focus',refreshDay);
    const dayTimer=setInterval(refreshDay,60000);
    if(typeof dayTimer?.unref==='function')dayTimer.unref();
    if(typeof window.btRegisterPostRender==='function')window.btRegisterPostRender('action-center-day',()=>{renderedDay=td()});
  }
  try{getAttentionSuggestions=smart}catch{}
  window.btSmartAttentionVersion=VER;
})();
