/* BonusTracker v3.4.74 Action Center — canonical lifecycle stages drive every user-facing action item. */
(function(){
  'use strict';
  const VER='3.4.74-action1';

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
  function milestoneActionForEntry(e){
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
  // Read-only task projection. Financial rules and user activity remain separate.
  const normalizedTask=text=>String(text||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  function activityKind(text){
    const t=String(text||'');
    if(/payout|bonus (?:payment|posts?|received)|wait for.{0,20}bonus|tier determination/i.test(t))return'payout';
    if(/clos(?:e|ure)|clawback|reapply|eligibility (?:date|review|restriction)|eligible (?:again|to reapply)/i.test(t))return'closure';
    if(/direct[ -]?deposits?|\bq?dd\b|payroll/i.test(t))return'direct-deposit';
    if(/maintain|retain|hold.{0,30}(?:balance|\$)|balance.{0,20}(?:hold|minimum)/i.test(t))return'balance-hold';
    if(/debit|transactions?|purchases?/i.test(t))return'transactions';
    if(/enroll|activate|register|coupon/i.test(t))return'enrollment';
    if(/fund(?:ing)?|deposit\s+\$|initial deposit|new (?:money|funds)/i.test(t))return'new-money';
    return'other';
  }
  function money(value){return Number.isFinite(value)&&value>0?'$'+value.toLocaleString('en-US',{maximumFractionDigits:2}):'';}
  function taskTitle(kind,amount,count,period,text,e){
    const a=money(amount),n=Number.isInteger(count)&&count>0?count:0;
    if(!a&&kind!=='other'&&text)return String(text).replace(/\s+/g,' ').trim().slice(0,100);
    if(kind==='direct-deposit')return (period&&e.reqMet?'Maintain ':'Receive ')+(a?a+' in ':'')+(period?period+' ':'')+'qualifying direct deposits';
    if(kind==='new-money')return 'Fund '+(a?a+' into ':'')+'the account';
    if(kind==='balance-hold')return 'Maintain '+(a?a+' ':'')+'required balance';
    if(kind==='transactions')return 'Complete '+(n?n+' ':'')+(/debit/i.test(text)?'debit purchases':'qualifying transactions');
    if(kind==='enrollment')return 'Complete required enrollment';
    return String(text||'Review saved requirements').replace(/\s+/g,' ').trim().slice(0,100);
  }
  function specificTask(e,next){
    const {stage}=next,base=(title,cta,target='lifecycle',detail=next.explanation)=>({title,cta,target,detail,context:next.context});
    if(next.label==='Review financial rules')return base('Verify saved offer rules','Review terms');
    if(e.closed)return base(next.context.confirmed?(stage.code==='ELIGIBLE'?'Review a new offer':'Wait for eligibility'):'Verify eligibility dates','Review eligibility');
    if(e.bonusRecd){
      if(next.kind==='close')return base('Review and close the account','Review closure','milestone');
      return base(stage.code==='HOLD_OPEN'?'Keep the account open':'Verify closure terms','Review close checks');
    }
    if(next.kind==='bonus')return base('Confirm bonus payment','Confirm received','milestone');
    const trackers=[...(Array.isArray(e.checklist)?e.checklist:[]).map((t,index)=>({...t,source:'checklist',index})),...(Array.isArray(e.customTimers)?e.customTimers:[]).map(t=>({...t,source:'timer'}))].filter(t=>t&&typeof t.text==='string');
    const valid=window.BTFinancialRules?.validate(e),structured=valid?.ok&&valid.rules?valid.rules.requirements:null;
    let candidates=[];
    if(Array.isArray(structured)){
      candidates=structured.filter(r=>!e.reqMet||r.recurrence).filter(r=>r.recurrence||!trackers.some(t=>t.done&&normalizedTask(t.text)===normalizedTask(r.text))).map(r=>{
        const compatible=trackers.filter(t=>!t.done&&activityKind(t.text)===r.kind);
        const linked=compatible.find(t=>normalizedTask(t.text)===normalizedTask(r.text))||(structured.filter(x=>x.kind===r.kind).length===1?compatible.filter(t=>t.source==='timer').sort((a,b)=>String(a.date||'9999').localeCompare(String(b.date||'9999')))[0]:null);
        return {kind:r.kind,text:r.text,amount:r.amount,count:r.count,recurring:r.recurrence,linked};
      });
    }else{
      candidates=trackers.filter(t=>!t.done&&!['payout','closure'].includes(activityKind(t.text))).map(t=>({kind:activityKind(t.text),text:t.text,linked:t}));
      // Explicit legacy funding fields are used only when funding has no saved task.
      if(!e.reqMet&&e.fundingAmount>0&&!trackers.some(t=>activityKind(t.text)==='new-money')&&!(e.fundedDate||e.fundedAt||e.fundingCompleted||e.fundedDone))candidates.push({kind:'new-money',text:e.fundingAmountText||'Saved account funding requirement',amount:e.fundingAmount});
      if(!candidates.length&&recurring(e,stage)){const recurringTask=trackers.find(t=>/monthly|each month|every month|per month/i.test(t.text)&&!['payout','closure'].includes(activityKind(t.text)));if(recurringTask)candidates.push({kind:activityKind(recurringTask.text),text:recurringTask.text});}
      if(!candidates.length&&!trackers.length&&(!e.reqMet||recurring(e,stage))){
        const lines=String(e.completeBonusText||e.dataPoint||'').split(/\n|[;]+/).filter(t=>!/^\s*(?:no |not |exclude|wait |do not)/i.test(t.replace(/^\s*\d+[.)]\s*/,'')));
        const line=lines.find(t=>['direct-deposit','new-money','balance-hold','transactions','enrollment'].includes(activityKind(t))&&!trackers.some(x=>x.done&&normalizedTask(x.text)===normalizedTask(t)));
        if(line)candidates.push({kind:activityKind(line),text:line});
      }
    }
    const order={'enrollment':0,'new-money':1,'direct-deposit':2,'transactions':3,'balance-hold':4,'other':5};
    candidates.sort((a,b)=>String(a.linked?.date||'9999').localeCompare(String(b.linked?.date||'9999'))||(order[a.kind]??9)-(order[b.kind]??9));
    const task=candidates[0];
    if(!task)return base(next.kind==='requirements'?'Confirm all bonus requirements':'Review saved requirements',next.kind==='requirements'?'Confirm requirements':'View requirements',next.kind==='requirements'?'milestone':'lifecycle');
    const period=task.recurring?({'calendar-month':'monthly','statement-cycle':'per-statement','calendar-quarter':'quarterly','calendar-year':'annual'}[task.recurring.period]||'recurring'):(/monthly|each month|every month|per month/i.test(task.text)?'monthly':'');
    // Dollar/count values for legacy records stay in exact saved text; never parse a balance from an exclusion.
    const title=taskTitle(task.kind,task.amount,task.count,period,task.text,e);
    const cta={'new-money':'Review funding','direct-deposit':'Review deposits','balance-hold':'Review balance hold','transactions':'Review transactions','enrollment':'Review enrollment'}[task.kind]||'View task';
    const result=base(title,cta,'lifecycle',task.text);
    result.timerId=task.linked?.source==='timer'?task.linked.id:'';
    result.checklistIndex=task.linked?.source==='checklist'?task.linked.index:null;
    if(task.linked?.source==='timer')result.context=dateContext(e,{...stage,timer:task.linked,kind:task.kind==='direct-deposit'?'requirement':task.kind});
    else if(task.kind==='new-money'&&!task.linked)result.context={date:'',confirmed:false,explanation:'Funding deadline needs review in the saved terms.'};
    return result;
  }
  function nextActionForEntry(e){const next=milestoneActionForEntry(e);return {...next,task:specificTask(e,next)};}
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
        task:nextAction.task,
        actionExplanation:nextAction.explanation,
        dateContext:nextAction.task?.context||nextAction.context,
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
