/* BonusTracker v3.4.30 Action Center — canonical lifecycle stages drive every user-facing action item. */
(function(){
  'use strict';
  const VER='3.4.30-action1';

  function finite(v){const n=Number(v);return Number.isFinite(n)?n:null}
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
  function shouldInclude(e,stage,days){
    if(!e||!e.bank||!stage)return false;
    if(!e.closed)return stage.code!=='ARCHIVED';
    if(stage.code==='ELIGIBLE')return true;
    if(stage.code==='COOLDOWN')return Number.isFinite(days)&&days<=30;
    return false
  }
  function smart(){
    const rows=[];
    const source=[];try{if(typeof entries!=='undefined'&&Array.isArray(entries))source.push(...entries)}catch{}
    source.forEach(e=>{
      if(!e||!e.bank)return;
      const stage=stageFor(e),rawDays=stageDays(e,stage),days=Number.isFinite(rawDays)?Math.max(0,rawDays):999999;
      if(!shouldInclude(e,stage,rawDays))return;
      rows.push({
        bank:e.bank,
        entryId:e.id||'',
        dedupeKey:e.id||e.bank,
        stageCode:stage.code||'IN_PROGRESS',
        stageLabel:stage.label||'In Progress',
        action:actionVerb(stage.code),
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
  try{getAttentionSuggestions=smart}catch{}
  window.btSmartAttentionVersion=VER;
})();