/*
 * BonusTracker v3.4.13 — professional tracker normalization and display layer.
 * Fixes analyzer-generated timer clutter, payout-only summaries, dynamic lifecycle steps,
 * and source-accurate churn-date bases without changing legacy entries that have no explicit basis.
 */
(function(){
  'use strict';
  const VER='3.4.13';
  const ENTRY_KEY='bt_e_v4';
  const MIGRATION_KEY='bt_professional_schema_v3413';
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const lower=v=>clean(v).toLowerCase();
  const isoToday=()=>{try{return td()}catch{return new Date().toISOString().slice(0,10)}};
  const addDays=(d,n)=>{try{return addD(d,n)}catch{const x=new Date(d+'T00:00:00');x.setDate(x.getDate()+Number(n||0));return x.toISOString().slice(0,10)}};
  const addMonths=(d,n)=>{try{return addM(d,n)}catch{const x=new Date(d+'T00:00:00');x.setMonth(x.getMonth()+Number(n||0));return x.toISOString().slice(0,10)}};
  const fmtDate=d=>{try{return fD(d)}catch{return d||'—'}};
  const fmtMoney=n=>{try{return fM(Number(n||0))}catch{return '$'+Number(n||0).toLocaleString()}};
  const html=v=>{try{return esc(String(v??''))}catch{return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}};

  function accountTypeOf(e){
    const v=lower(e?.accountType);
    if(v==='business'||v==='biz'||/business|commercial/.test(v))return'business';
    if(v==='personal'||v==='consumer'||v==='individual')return'personal';
    const text=lower([e?.acct,e?.analysis?.acct,e?.analyzedTC].filter(Boolean).join(' '));
    return /business checking|commercial/.test(text)?'business':'personal';
  }
  function isWellsPersonal(e){
    if(!e||!/\bwells fargo\b/i.test(String(e.bank||e.analysis?.bank||'')))return false;
    if(accountTypeOf(e)!=='personal')return false;
    const text=[e.acct,e.dataPoint,e.completeBonusText,e.eligibilityText,e.analyzedTC,e.analysis?.raw,e.analysis?.normalizedRaw,e.analysis?.eligibilityText].filter(Boolean).join(' ');
    return Number(e.bonus||e.analysis?.bonus||0)===400 && (
      /consumer checking|qualifying electronic deposits|\$\s*1,?000[^.]{0,80}90/i.test(text)
      || looksLikeWellsBusinessLeak(e)
    );
  }
  function looksLikeWellsBusinessLeak(e){
    const timers=Array.isArray(e?.customTimers)?e.customTimers:[];
    const joined=timers.map(t=>String(t?.text||'')).join(' | ');
    return Number(e?.fundedDays||0)===30
      || Number(e?.holdDays||0)===60
      || Number(e?.fundingAmount||0)===2500
      || /deposit new money\s*\/\s*funding deadline|maintain required balance\s*\/\s*hold check/i.test(joined);
  }
  function timerIdSafe(){try{return timerId()}catch{return 'tm_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7)}}
  function timerCat(text){
    const s=lower(text);
    if(/promo|expiration|open[- ]?by/.test(s))return'openby';
    if(/close review|close check|safe close/.test(s))return'close-review';
    if(/payout|bonus payment|bonus watch/.test(s))return'payout';
    if(/maintain|required balance|hold check|hold deadline/.test(s))return'hold';
    if(/funding|deposit new money|new money/.test(s))return'funding';
    if(/direct deposit|electronic deposit|qualifying deposit|requirement|\bdd\b/.test(s))return'requirement';
    return'action';
  }
  function timerDueDate(t){
    if(t?.date)return t.date;
    if(t?.startDate&&Number(t?.daysRequired||0)>0)return addDays(t.startDate,Number(t.daysRequired));
    return'';
  }
  function timerDaysLeft(t){
    try{if(typeof timerCountdownDays==='function')return timerCountdownDays(t)}catch{}
    const due=timerDueDate(t);if(!due)return null;
    try{return dB(isoToday(),due)}catch{return Math.ceil((new Date(due+'T00:00:00')-new Date(isoToday()+'T00:00:00'))/864e5)};
  }
  function isGeneratedWellsTimer(t){
    const s=lower(t?.text);
    return /deposit new money|funding deadline|maintain required balance|hold check|bonus requirement deadline|bonus payout watch|close check after payout|qualifying electronic deposits/.test(s);
  }
  function exactWellsTimers(e){
    const keep=(Array.isArray(e.customTimers)?e.customTimers:[]).filter(t=>!isGeneratedWellsTimer(t));
    if(e.bonusRecd)return keep;
    if(e.reqMet){
      const due=addDays(e.reqMet,30);
      keep.push({id:timerIdSafe(),text:'$400 bonus payout watch',startDate:e.reqMet,date:due,daysRequired:30,done:false,source:'Wells Fargo: bonus within 30 calendar days after all requirements are met'});
    }else if(e.opened){
      const due=addDays(e.opened,90);
      keep.push({id:timerIdSafe(),text:'$1,000 qualifying electronic deposits due',startDate:e.opened,date:due,daysRequired:90,done:false,source:'Wells Fargo: $1,000+ qualifying electronic deposits within 90 calendar days of opening'});
    }
    return keep;
  }
  function repairWellsPersonal(e){
    if(!isWellsPersonal(e))return e;
    const x={...e};
    x.bank='Wells Fargo';
    x.acct='Wells Fargo consumer checking';
    x.accountType='personal';
    x.bonus=400;
    x.reqMoney=1000;x.reqIsTotal=true;x.reqDays=90;x.count=0;
    x.requiredDaysText='90 calendar days';
    x.dataPoint='$1,000+ total qualifying electronic deposits within 90 days';
    x.fundedDays=0;x.fundingAmount=0;x.fundingAmountText='';x.holdDays=0;x.minHoldDays=0;x.depositHoldRequirement=false;
    x.closeFeeCountdownDays='';x.earlyCloseFee=0;x.earlyTerminationFeeText='';
    x.payoutTimingText='Within 30 calendar days after all bonus requirements are met';
    x.closeRestrictionType='payout-only';x.closeRuleBasis='bonus';x.closeBufferDays=0;
    x.closeRuleText='The new account must stay open through the time Wells Fargo attempts to deposit the bonus.';
    x.closeRuleSource='current-tc';x.closeRuleSourceSentence=x.closeRuleText;
    x.churnable=true;x.churnability='repeatable';x.churn='1';x.churnBasis='bonus-received';x.churnBufferDays=0;
    x.churnReason='Eligibility looks back 12 months from when a prior Wells Fargo consumer checking bonus was received.';
    x.churnRuleText='12 months from the prior Wells Fargo consumer checking bonus received date';
    x.monthlyFeeUnknown=true;
    x.monthlyFeeYNText='Not stated in bonus disclosure — review the selected checking account fee schedule';
    x.avoidMonthlyFeeText='Monthly service fee and waiver options are separate from the bonus requirements and must be checked for the selected checking product.';
    x.customTimers=exactWellsTimers(x);
    x.profile=null;
    x.wellsPersonalRepairVersion=VER;
    if(x.analysis&&typeof x.analysis==='object'&&typeof window.tcV3ApplyWellsPersonalRule==='function'){
      try{x.analysis=window.tcV3ApplyWellsPersonalRule({...x.analysis},x.analysis.raw||x.analysis.normalizedRaw||x.analyzedTC||'')||x.analysis}catch{}
    }
    return x;
  }

  /* Churn timing should follow the eligibility wording when a source-derived basis is saved. */
  const legacyNext=typeof window.nextReopen==='function'?window.nextReopen:null;
  const legacyReady=typeof window.churnReadyDate==='function'?window.churnReadyDate:null;
  const legacyDays=typeof window.daysLeft==='function'?window.daysLeft:null;
  function inferredBasis(e){
    const explicit=lower(e?.churnBasis);
    if(/bonus/.test(explicit)&&/receiv/.test(explicit))return'bonus-received';
    if(/open|enroll/.test(explicit))return'opened';
    if(/clos/.test(explicit))return'closed';
    const txt=[e?.churnRuleText,e?.churnReason,e?.eligibilityText,e?.analysis?.eligibilityText].filter(Boolean).join(' ');
    if(/received[^.]{0,100}bonus[^.]{0,100}(?:past|last|within)\s+\d+\s+months|bonus[^.]{0,100}received[^.]{0,100}(?:past|last|within)\s+\d+\s+months/i.test(txt))return'bonus-received';
    if(/offer enrollment date|from enrollment|enrolled/i.test(txt))return'opened';
    if(/closed[^.]{0,100}(?:past|last|within)\s+\d+\s+(?:months|days|years)/i.test(txt))return'closed';
    return'';
  }
  function explicitBaseDate(e){
    const b=inferredBasis(e);
    if(b==='bonus-received')return e?.bonusRecd||'';
    if(b==='opened')return e?.opened||'';
    if(b==='closed')return e?.closed||'';
    return'';
  }
  function professionalNextReopen(e){
    if(!e||!e.churn)return'';
    try{if(typeof isNonRepeatableEntry==='function'&&isNonRepeatableEntry(e))return''}catch{}
    const basis=inferredBasis(e);
    if(!basis)return legacyNext?legacyNext(e):'';
    const base=explicitBaseDate(e);if(!base)return'';
    return String(e.churn)==='180'?addDays(base,180):addMonths(base,(parseInt(e.churn,10)||0)*12);
  }
  function professionalChurnReady(e){
    const basis=inferredBasis(e);
    if(!basis)return legacyReady?legacyReady(e):professionalNextReopen(e);
    const raw=professionalNextReopen(e);if(!raw)return'';
    const buffer=Math.max(0,parseInt(e?.churnBufferDays,10)||0);
    return buffer?addDays(raw,buffer):raw;
  }
  function professionalDaysLeft(e){
    const basis=inferredBasis(e);
    if(!basis)return legacyDays?legacyDays(e):null;
    const ready=professionalChurnReady(e);if(!ready)return null;
    try{return Math.max(0,dB(isoToday(),ready))}catch{return 0}
  }
  try{nextReopen=professionalNextReopen}catch{}window.nextReopen=professionalNextReopen;
  try{churnReadyDate=professionalChurnReady}catch{}window.churnReadyDate=professionalChurnReady;
  try{daysLeft=professionalDaysLeft}catch{}window.daysLeft=professionalDaysLeft;

  /* Final analyzer guard: current pasted terms always beat saved Wells business history. */
  function installFinalAnalyzer(){
    const base=window.tcV3Analyze;
    if(typeof base!=='function'||base.__btProfessional3413)return;
    const fn=function(raw,opts){
      let r=base(raw,opts);
      if(typeof window.tcV3ApplyWellsPersonalRule==='function')r=window.tcV3ApplyWellsPersonalRule(r,raw)||r;
      return r;
    };
    fn.__btProfessional3413=true;
    window.tcV3Analyze=fn;window.tcUnifiedAnalyze=fn;window.tcStrictAnalyze=fn;
  }
  installFinalAnalyzer();setTimeout(installFinalAnalyzer,800);setTimeout(installFinalAnalyzer,1900);

  function activeTimer(e){try{return typeof nextActiveTimer==='function'?nextActiveTimer(e):null}catch{return null}}
  function timerLabel(t){
    switch(timerCat(t?.text)){
      case'requirement':return /direct deposit|electronic deposit|\bdd\b/i.test(String(t?.text||''))?'DD Due':'Requirement Due';
      case'funding':return'Funding Due';
      case'hold':return'Balance Hold';
      case'payout':return'Payout Watch';
      case'openby':return'Open By';
      case'close-review':return'Close Review';
      default:return'Action Due';
    }
  }
  function compactTimerText(e,t){
    if(!t)return'';
    if(isWellsPersonal(e)&&timerCat(t.text)==='requirement')return'$1,000 qualifying deposits';
    if(isWellsPersonal(e)&&timerCat(t.text)==='payout')return'$400 bonus payout';
    return clean(t.text).replace(/\s+deadline$/i,'').replace(/\s+due$/i,'').slice(0,58);
  }
  function timerSupport(e,t){
    if(!t)return'';
    const d=timerDaysLeft(t),due=timerDueDate(t),what=compactTimerText(e,t);
    if(d!==null&&d<0)return'Overdue · '+what+(due?' · '+fmtDate(due):'');
    if(d===0)return'Due today · '+what;
    if(d!==null)return d+'d left · '+what+(due?' · due '+fmtDate(due):'');
    return what;
  }
  const proStatusBadge=function(e,countdown){
    let s='';try{s=status(e)}catch{}
    let meta;try{meta=displayStatusMeta(s)}catch{meta={label:s||'Status',cls:'w',icon:''}}
    let support='';
    if(s==='CUSTOM TIMER'){
      const t=activeTimer(e);meta={...meta,label:timerLabel(t)};support=timerSupport(e,t);
    }else{try{support=typeof supportLine==='function'?supportLine(e,countdown):''}catch{}}
    return '<span class="badge '+html(meta.cls||'w')+'">'+(meta.icon||'')+'<span>'+html(meta.label||'Status')+'</span></span>'+(support?'<div class="card-subline">'+html(support)+'</div>':'');
  };
  try{statusBadgeHtml=proStatusBadge}catch{}window.statusBadgeHtml=proStatusBadge;

  function requirementDisplay(e){
    if(e?.reqMet)return'Met '+fmtDate(e.reqMet);
    const t=activeTimer(e);
    if(t&&timerCat(t.text)==='requirement'){
      const due=timerDueDate(t);
      if(isWellsPersonal(e))return'$1,000 deposits'+(due?' · due '+fmtDate(due):'');
      return 'Due'+(due?' '+fmtDate(due):'');
    }
    return'Pending';
  }
  function payoutOnly(e){return lower(e?.closeRestrictionType)==='payout-only'||/stay open|remain open|keep.*open/i.test(String(e?.closeRuleText||''))&&/bonus|deposit/i.test(String(e?.closeRuleText||''))}
  const proProfileSummary=function(e){
    if(!e)return'';const items=[];const add=(label,value,cls='')=>items.push({label,value,cls});
    add('Opened',e.opened?fmtDate(e.opened):'Add date',e.opened?'':'warn');
    if(e.closed){
      add('Closed',fmtDate(e.closed),'ok');
      add('Bonus',e.bonusRecd?((e.bonus?fmtMoney(e.bonus)+' · ':'')+fmtDate(e.bonusRecd)):(e.bonus?fmtMoney(e.bonus):'Not saved'),e.bonusRecd?'ok':'');
      let nr='';try{nr=professionalChurnReady(e)}catch{}
      let archived=false;try{archived=typeof isNonRepeatableEntry==='function'&&isNonRepeatableEntry(e)}catch{}
      add(archived?'Archive':'Churn ready',archived?'Non-repeatable':(nr?fmtDate(nr):'Pending basis date'),archived||nr?'ok':'warn');
    }else{
      add('Bonus',e.bonusRecd?((e.bonus?fmtMoney(e.bonus)+' · ':'')+fmtDate(e.bonusRecd)):(e.bonus?fmtMoney(e.bonus)+' pending':'Pending'),e.bonusRecd?'ok':'warn');
      add('Requirement',requirementDisplay(e),e.reqMet?'ok':'warn');
      let safe='';try{safe=safeCloseDate(e)}catch{}
      let closeValue=safe?fmtDate(safe):(payoutOnly(e)?'After '+(e.bonus?fmtMoney(e.bonus)+' ':'')+'posts':'Review close terms');
      add('Earliest close',closeValue,safe&&typeof daysUntilSafe==='function'&&daysUntilSafe(e)<=0?'ok':safe?'warn':payoutOnly(e)?'warn':'bad');
    }
    return '<div class="profile-summary">'+items.map(x=>'<div class="profile-summary-item '+html(x.cls||'')+'"><span>'+html(x.label)+'</span><b>'+html(x.value)+'</b></div>').join('')+'</div>';
  };
  try{renderBankProfileSummary=proProfileSummary}catch{}window.renderBankProfileSummary=proProfileSummary;

  const oldFeePlan=typeof window.monthlyFeePlanForEntry==='function'?window.monthlyFeePlanForEntry:null;
  const proFeePlan=function(e){
    if(isWellsPersonal(e)||e?.monthlyFeeUnknown){
      return{title:'Fee Check',sub:'Fee schedule is separate from this bonus',chip:'Review Fee',cls:'warn',rows:[
        {label:'Monthly fee',value:'Not stated in bonus disclosure',cls:'warn'},
        {label:'Action',value:'Check the selected account fee schedule',cls:'warn'},
        {label:'Bonus impact',value:'Fee-waiver actions are separate from bonus requirements',cls:'ok'}
      ],notes:[],compact:true};
    }
    return oldFeePlan?oldFeePlan(e):null;
  };
  try{monthlyFeePlanForEntry=proFeePlan}catch{}window.monthlyFeePlanForEntry=proFeePlan;

  const oldClosePlan=typeof window.closePlanForEntry==='function'?window.closePlanForEntry:null;
  const proClosePlan=function(e){
    const out=oldClosePlan?oldClosePlan(e):null;if(!out||e?.closed)return out;
    if(payoutOnly(e)){
      const amount=e?.bonus?fmtMoney(e.bonus):'bonus';
      const earliest=(out.rows||[]).find(x=>lower(x.label)==='earliest close');
      const rule=(out.rows||[]).find(x=>lower(x.label)==='rule');
      const final=(out.rows||[]).find(x=>lower(x.label)==='final check');
      if(earliest&&!e.bonusRecd){earliest.value='After '+amount+' posts';earliest.cls='warn'}
      if(rule&&/manual review|no fixed post-bonus hold|close after bonus posts/i.test(String(rule.value||''))){rule.value='Keep open through bonus deposit';rule.cls='ok'}
      if(final&&!e.bonusRecd){final.value='Wait for '+amount+' bonus to post';final.cls='bad'}
      out.sub='Payout-only close rule';
      out.proof=e.closeRuleSourceSentence||e.closeRuleText||out.proof||'';
    }
    return out;
  };
  try{closePlanForEntry=proClosePlan}catch{}window.closePlanForEntry=proClosePlan;

  function hasFundingStep(e){
    if(Number(e?.fundedDays||0)>0||Number(e?.fundingAmount||0)>0)return true;
    return (Array.isArray(e?.customTimers)?e.customTimers:[]).some(t=>timerCat(t?.text)==='funding');
  }
  function proLifecycleSteps(e){
    let safe='';try{safe=safeCloseDate(e)}catch{}
    let churn='';try{churn=professionalChurnReady(e)}catch{}
    const reqTimer=(Array.isArray(e?.customTimers)?e.customTimers:[]).find(t=>!t.done&&timerCat(t.text)==='requirement');
    const steps=[{key:'opened',label:'Opened',done:!!e?.opened,date:e?.opened||''}];
    if(hasFundingStep(e))steps.push({key:'funded',label:'Funded',done:!!(e?.fundedDate||e?.fundedAt||e?.fundingCompleted||e?.fundedDone),date:e?.fundedDate||e?.fundedAt||''});
    steps.push({key:'req',label:isWellsPersonal(e)?'DD $1K':'Req Met',done:!!e?.reqMet,date:e?.reqMet||timerDueDate(reqTimer)||''});
    steps.push({key:'bonus',label:'Bonus',done:!!e?.bonusRecd,date:e?.bonusRecd||''});
    let safeDone=false;try{safeDone=!!(e?.closed||(safe&&dB(isoToday(),safe)<=0))}catch{}
    steps.push({key:'safe',label:'Safe Close',done:safeDone,date:safe||''});
    steps.push({key:'closed',label:'Closed',done:!!e?.closed,date:e?.closed||''});
    let archived=false;try{archived=typeof isNonRepeatableEntry==='function'&&isNonRepeatableEntry(e)}catch{}
    if(archived)steps.push({key:'archive',label:'Archive',done:!!e?.closed,date:e?.closed||''});
    else if(e?.churn)steps.push({key:'churn',label:'Churn',done:!!(e?.closed&&churn&&dB(isoToday(),churn)<=0),date:churn||''});
    return steps;
  }
  const proLifecycleRender=function(e){
    if(!e||!e.bank)return'';const steps=proLifecycleSteps(e);
    let h='<div class="bt-life"><div class="bt-life-title">Lifecycle</div><div class="bt-life-steps">';
    steps.forEach(st=>{const cls=st.done?'done':st.date?'planned':'todo';const sub=st.date?fmtDate(st.date):'Pending';h+='<div class="bt-life-step '+cls+'"><i>'+html(st.done?'✓':'•')+'</i><b>'+html(st.label)+'</b><span>'+html(sub)+'</span></div>'});
    return h+'</div></div>';
  };
  try{lifecycleSteps=proLifecycleSteps}catch{}window.lifecycleSteps=proLifecycleSteps;
  try{renderLifecycleStepper=proLifecycleRender}catch{}window.renderLifecycleStepper=proLifecycleRender;

  function migrateSavedEntries(){
    try{
      if(typeof entries==='undefined'||!Array.isArray(entries))return false;
      let changed=false;
      entries=entries.map(e=>{
        if(!isWellsPersonal(e)||(!looksLikeWellsBusinessLeak(e)&&e.wellsPersonalRepairVersion===VER))return e;
        changed=true;return repairWellsPersonal(e);
      });
      if(changed){localStorage.setItem(ENTRY_KEY,JSON.stringify(entries));try{if(typeof R==='function')R()}catch{}}
      localStorage.setItem(MIGRATION_KEY,VER);
      return changed;
    }catch(err){console.error('Professional tracker migration failed',err);return false}
  }
  migrateSavedEntries();setTimeout(migrateSavedEntries,250);setTimeout(migrateSavedEntries,2100);

  window.btProfessionalRepairWellsPersonal=repairWellsPersonal;
  window.btProfessionalIsWellsPersonal=isWellsPersonal;
  window.btProfessionalTimerLabel=timerLabel;
  window.btProfessionalVersion=VER;
  window.BT_APP_VERSION=VER;
  window.btReleaseVersion=VER;
})();
