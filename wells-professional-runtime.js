/* BonusTracker v3.4.13 — Wells consumer lifecycle repair and professional tracker runtime. */
(function(){
  'use strict';
  const VER='3.4.13';
  const oldNormalize=window.normalizeLifecycleEntry;
  const oldCollect=window.collectModalEntryData;
  const oldNormalizeNewCycle=window.normalizeNewCycleData;

  function normalizeChurnBasis(v){
    const x=String(v||'').toLowerCase().replace(/[^a-z]/g,'');
    if(['bonus','bonusreceived','bonusrecd','payout'].includes(x))return'bonus';
    if(['opened','open','accountopened'].includes(x))return'opened';
    return'closed';
  }
  function setModalChurnBasis(value){if(typeof modal==='undefined'||!modal)return;modal.churnBasis=normalizeChurnBasis(value);modal.churnDecisionSource=modal.analysis?'analyzer-reviewed':'user-confirmed';}
  window.normalizeChurnBasis=normalizeChurnBasis;
  window.setModalChurnBasis=setModalChurnBasis;

  const baseSetChurnability=window.setModalChurnability;
  if(typeof baseSetChurnability==='function')window.setModalChurnability=function(value){
    baseSetChurnability(value);
    if(typeof modal==='undefined'||!modal)return;
    if(value==='nonrepeatable'){modal.churnBasis='';modal.churnBufferDays=0;}
    else if(value==='repeatable'){modal.churnBasis=modal.churnBasis||modal.analysis?.churnBasis||'closed';if(modal.churnBufferDays===undefined||modal.churnBufferDays===null||modal.churnBufferDays==='')modal.churnBufferDays=10;}
  };
  const baseSetChurnRule=window.setModalChurnRule;
  if(typeof baseSetChurnRule==='function')window.setModalChurnRule=function(value){baseSetChurnRule(value);if(typeof modal!=='undefined'&&modal&&value)modal.churnBasis=modal.churnBasis||modal.analysis?.churnBasis||'closed';};

  function churnBasisDate(e){
    if(!e)return'';
    const b=normalizeChurnBasis(e.churnBasis||e.analysis?.churnBasis||'closed');
    return b==='bonus'?(e.bonusRecd||''):b==='opened'?(e.opened||''):(e.closed||'');
  }
  function churnBufferDaysFor(e){
    const raw=e?.churnBufferDays;
    if(raw!==undefined&&raw!==null&&raw!=='')return Math.max(0,parseInt(raw,10)||0);
    return 10;
  }
  function nextReopen(e){
    if(!e||typeof isNonRepeatableEntry==='function'&&isNonRepeatableEntry(e))return'';
    const base=churnBasisDate(e);if(!base||!e.churn)return'';
    const raw=String(e.churn)==='180'?addD(base,180):addM(base,parseInt(e.churn,10)*12);
    return churnBufferDaysFor(e)>0?addD(raw,churnBufferDaysFor(e)):raw;
  }
  function churnReadyDate(e){return nextReopen(e)}
  function daysLeft(e){const d=churnReadyDate(e);return d?Math.max(0,dB(td(),d)):null}
  window.churnBasisDate=churnBasisDate;window.churnBufferDaysFor=churnBufferDaysFor;window.nextReopen=nextReopen;window.churnReadyDate=churnReadyDate;window.daysLeft=daysLeft;

  function lifecycleRequirementLabel(e){
    const t=String([e?.dataPoint,e?.completeBonusText,e?.analyzedTC].filter(Boolean).join(' '));
    if(/qualifying electronic deposits?/i.test(t))return'Deposits';
    if(/direct deposits?|\bDD\b/i.test(t))return'Direct Deposit';
    if(/transactions?|debit card/i.test(t))return'Transactions';
    return'Requirements';
  }
  function lifecycleSteps(e){
    const safe=typeof safeCloseDate==='function'?safeCloseDate(e):'';
    const churn=churnReadyDate(e);
    const steps=[{key:'opened',label:'Opened',done:!!e?.opened,date:e?.opened||''}];
    const hasFunding=!!(Number(e?.fundedDays||0)>0||Number(e?.fundingAmount||0)>0||e?.fundedDate||e?.fundedAt||e?.fundingCompleted||e?.fundedDone);
    if(hasFunding)steps.push({key:'funded',label:'Funded',done:!!(e?.fundedDate||e?.fundedAt||e?.fundingCompleted||e?.fundedDone),date:e?.fundedDate||e?.fundedAt||''});
    steps.push({key:'req',label:lifecycleRequirementLabel(e),done:!!e?.reqMet,date:e?.reqMet||''},{key:'bonus',label:'Bonus',done:!!e?.bonusRecd,date:e?.bonusRecd||''},{key:'safe',label:'Safe Close',done:!!(e?.closed||(safe&&dB(td(),safe)<=0)),date:safe||''},{key:'closed',label:'Closed',done:!!e?.closed,date:e?.closed||'',planned:false});
    if(typeof isNonRepeatableEntry==='function'&&isNonRepeatableEntry(e))steps.push({key:'archive',label:'Archived',done:!!e?.closed,date:e?.closed||'',planned:false});
    else steps.push({key:'churn',label:'Next Eligible',done:!!(churn&&dB(td(),churn)<=0),date:churn||''});
    return steps;
  }
  function renderLifecycleStepper(e){
    const steps=lifecycleSteps(e);let h='<div class="bt-life"><div class="bt-life-title">Lifecycle</div><div class="bt-life-steps">';
    steps.forEach(st=>{const cls=st.done?'done':'todo';const sub=st.date?fD(st.date):'Pending';h+='<div class="bt-life-step '+cls+'"><i>'+esc(st.done?'✓':'•')+'</i><b>'+esc(st.label)+'</b><span>'+esc(sub)+'</span></div>';});
    return h+'</div></div>';
  }
  window.lifecycleSteps=lifecycleSteps;window.renderLifecycleStepper=renderLifecycleStepper;

  function requirementSummaryForEntry(e){
    if(!e)return'Pending';if(e.reqMet)return'Met '+fD(e.reqMet);
    const due=typeof reqDeadline==='function'?reqDeadline(e):'';
    let text=String(e.dataPoint||'').replace(/^DD\s+/i,'').trim();
    if(/Wells Fargo/i.test(e.bank||'')&&String(e.accountType||'personal').toLowerCase()!=='business'&&Number(e.bonus||0)===400)text='$1,000 qualifying electronic deposits';
    if(!text&&e.reqDays>0)text='Complete bonus requirements';if(text.length>54)text=text.slice(0,51)+'…';
    return text+(due?' · due '+fD(due):'');
  }
  window.requirementSummaryForEntry=requirementSummaryForEntry;

  function displayStatusMeta(raw){switch(raw){case'ARCHIVED':return{label:'Archived',cls:'w',icon:I.doc};case'WORKING':return{label:'Working',cls:'w',icon:I.target};case'CUSTOM TIMER':return{label:'Deadline Active',cls:'buf',icon:I.clockShield};case'REQ MET':return{label:'Bonus Pending',cls:'req',icon:I.shieldCheck};case'WAITING TO CLOSE':return{label:'Waiting to Close',cls:'buf',icon:I.clockShield};case'3-DAY BUFFER':return{label:'Safety Buffer',cls:'buf',icon:I.clockShield};case'SAFE TO CLOSE':return{label:'Safe to Close',cls:'stc',icon:I.shieldCheck};case'WAITING TO CHURN!':return{label:'Waiting for Eligibility',cls:'wt',icon:I.refresh};case'TIME TO CHURN!':return{label:'Eligible Again',cls:'ch',icon:I.alert};default:return{label:raw||'Status',cls:'w',icon:I.info}}}
  function timerStatusMeta(e){const t=nextActiveTimer(e);const kind=timerCategory(t);if(kind==='requirement')return{label:'Requirement Due',cls:'buf',icon:I.target};if(kind==='funding')return{label:'Funding Due',cls:'buf',icon:I.clockShield};if(kind==='hold')return{label:'Balance Hold',cls:'buf',icon:I.clockShield};if(kind==='payout')return{label:'Bonus Pending',cls:'req',icon:I.gift};if(kind==='openby')return{label:'Open By',cls:'buf',icon:I.calendar};return displayStatusMeta('CUSTOM TIMER')}
  function supportLine(e,countdown){const s=status(e);if(s==='ARCHIVED')return'Closed • not repeatable';const hasEarlyFee=!!(!e.closed&&e.earlyCloseFee>0&&!e.feeChecked);if(s==='WAITING TO CHURN!'){const dl=daysLeft(e);return dl!==null?dl+'d until eligible':'Waiting for eligibility date'}if(s==='TIME TO CHURN!')return'Eligible to pursue again';if(s==='CUSTOM TIMER'){const timer=nextActiveTimer(e);const d=timerCountdownDays(timer);if(timer&&d!==null){const label=String(timer.text||'deadline').replace(/\s+deadline$/i,'');if(d<0)return'Overdue: '+label;if(d===0)return'Due today: '+label;return d+'d left: '+label}return e.reqMet?'Waiting for bonus':'Deadline active'}if(s==='REQ MET'){if(e.reqMet){const d=Math.max(0,dB(e.reqMet,td()));return d>0?'Bonus pending • '+d+'d since requirements met':'Bonus pending'}return'Bonus pending'}if(s==='WAITING TO CLOSE'){const d=daysUntilSafe(e);let msg=d!==null&&d>0?d+'d until safe to close':'Waiting to close';if(hasEarlyFee)msg+=' • fee if closed early';return msg}if(s==='3-DAY BUFFER'){const d=daysUntilSafe(e);let msg=d!==null&&d>0?d+'d left in safety buffer':'Almost there';if(hasEarlyFee)msg+=' • fee if closed early';return msg}if(s==='SAFE TO CLOSE')return(e.earlyCloseFee>0||e.minHoldDays>0)?'Bonus received • close when ready':'Bonus received • ready when you are';if(s==='WORKING'){if(countdown&&countdown.lbl==='Req deadline'&&countdown.days>0)return countdown.days+'d to requirement deadline';if(e.opened){const openDays=dB(e.opened,td());if(openDays>0)return openDays+'d open'}return'In progress'}return''}
  function statusBadgeHtml(e,countdown){const raw=status(e);const meta=raw==='CUSTOM TIMER'?timerStatusMeta(e):displayStatusMeta(raw);const support=supportLine(e,countdown);return'<span class="badge '+meta.cls+'">'+meta.icon+'<span>'+esc(meta.label)+'</span></span>'+(support?'<div class="card-subline">'+esc(support)+'</div>':'')}
  window.displayStatusMeta=displayStatusMeta;window.timerStatusMeta=timerStatusMeta;window.supportLine=supportLine;window.statusBadgeHtml=statusBadgeHtml;

  function wellsConsumer400Text(x){return String([x?.analyzedTC,x?.completeBonusText,x?.eligibilityText,x?.dataPoint,x?.analysis?.churnReason,JSON.stringify(x?.analysis?.sourceSnippets||[])].filter(Boolean).join(' '))}
  function isWellsConsumer400Entry(x){const text=wellsConsumer400Text(x);return /Wells Fargo/i.test(String(x?.bank||''))&&String(x?.accountType||'personal').toLowerCase()!=='business'&&Number(x?.bonus||0)===400&&(/qualifying electronic deposits?/i.test(text)||(/\$1,?000/i.test(text)&&/90\s*(?:calendar\s*)?days/i.test(text)))}
  function repairWellsConsumer400Entry(x){
    if(!x||!isWellsConsumer400Entry(x))return x;
    x.accountType='personal';x.bonus=400;x.reqDays=90;x.requiredDaysText='90';x.dataPoint='$1,000 qualifying electronic deposits within 90 days';
    x.fundedDays=0;x.fundingAmount=0;x.fundingAmountText='';x.holdDays=0;x.depositHoldRequirement=false;x.minHoldDays=0;x.closeFeeCountdownDays='';x.earlyCloseFee=0;x.earlyTerminationFeeText='';x.closeRestrictionType='payout-only';x.closeRuleBasis='bonus';x.closeBufferDays=0;
    x.closeRuleText='Your new account must stay open through the time Wells Fargo attempts to deposit the bonus.';x.closeRuleSource='current-tc';x.closeRuleSourceSentence=x.closeRuleText;x.payoutTimingText='within 30 calendar days after all bonus requirements are met';
    x.churnable=true;x.churnability='repeatable';x.churn='1';x.churnBasis='bonus';x.churnBufferDays=0;x.churnReason='Not eligible if you received a Wells Fargo consumer checking bonus within the past 12 months.';x.churnRuleText=x.churnReason;
    x.monthlyFeeYNText='Not stated in bonus disclosure — separate Wells Fargo fee schedule applies';x.monthlyFeeAmountText='';x.avoidMonthlyFeeText='Review the Wells Fargo Consumer Account Fee and Information Schedule. Bonus requirements are separate from monthly-fee waiver requirements.';
    const open=String(x.opened||''),req=String(x.reqMet||'');
    let timers=normalizeTimerList(x.customTimers||[]).filter(t=>{const cat=timerCategory(t);if(cat==='funding'||cat==='hold'||cat==='close-review'||cat==='openby')return false;if(cat==='payout'&&open&&t.startDate===open)return false;if(cat==='payout'&&Number(t.daysRequired||0)>=90)return false;return true});
    if(!x.reqMet&&!timers.some(t=>timerCategory(t)==='requirement'))timers.push(normalizeTimer({text:'$1,000 qualifying electronic deposits deadline',startDate:open,daysRequired:90,date:open?addD(open,90):''}));
    if(x.reqMet&&!x.bonusRecd&&!timers.some(t=>timerCategory(t)==='payout'))timers.push(normalizeTimer({text:'$400 bonus payout deadline',startDate:req,daysRequired:30,date:req?addD(req,30):''}));
    x.customTimers=normalizeTimerList(timers);return x;
  }
  function payoutDaysAfterRequirementForEntry(x){const t=String(x?.payoutTimingText||x?.analysis?.payoutTiming||'');if(!/(after|once)[^.]{0,100}(requirements?|qualification)[^.]{0,100}(met|complete|satisfied)|requirements?[^.]{0,100}(met|complete|satisfied)[^.]{0,100}within/i.test(t))return 0;const m=t.match(/within\s+(\d{1,3})\s+(?:calendar\s+)?days?/i);return m?Math.max(0,parseInt(m[1],10)||0):0}
  function ensurePayoutTimerAfterRequirement(x){if(!x||!x.reqMet||x.bonusRecd||x.closed)return x;const days=payoutDaysAfterRequirementForEntry(x);if(!days)return x;let list=normalizeTimerList(x.customTimers||[]);if(!list.some(t=>timerCategory(t)==='payout'))list.push(normalizeTimer({text:(x.bonus?fM(x.bonus)+' ':'')+'bonus payout deadline',startDate:x.reqMet,daysRequired:days,date:addD(x.reqMet,days)}));x.customTimers=normalizeTimerList(list);return x}
  window.repairWellsConsumer400Entry=repairWellsConsumer400Entry;window.ensurePayoutTimerAfterRequirement=ensurePayoutTimerAfterRequirement;

  const baseMakeSuggestedTimers=window.tcV3MakeSuggestedTimers;
  function wellsSuggestedTimers(r,opened=''){
    if(!r||!(/Wells Fargo/i.test(String(r.bank||''))&&String(r.accountType||'personal').toLowerCase()!=='business'&&Number(r.bonus||0)===400&&Number(r.reqMoney||0)===1000&&Number(r.reqDays||0)===90))return typeof baseMakeSuggestedTimers==='function'?baseMakeSuggestedTimers(r,opened):[];
    const out=[];const mk=(text,startDate,daysRequired,date,source='')=>({id:typeof timerId==='function'?timerId():'tm_'+Math.random().toString(36).slice(2,8),text,startDate:startDate||'',daysRequired:Number(daysRequired||0),date:date||'',done:false,source});
    if(!opened&&r.openBy)out.push(mk('Offer open-by deadline','',0,r.openBy,r.expiration?.source||''));
    if(r.reqMet&&!r.bonusRecd)out.push(mk('$400 bonus payout deadline',r.reqMet,30,addD(r.reqMet,30),r.payoutSource||''));
    else if(!r.reqMet)out.push(mk('$1,000 qualifying electronic deposits deadline',opened,90,opened?addD(opened,90):'',r.reqSource||''));
    return out;
  }
  window.tcV3MakeSuggestedTimers=wellsSuggestedTimers;

  function currentWellsAnalysis(){try{const raw=document.getElementById('tca_raw')?.value||'';if(!raw||typeof tcV3Analyze!=='function')return null;const r=tcV3Analyze(raw,{noGlobalFallback:true});return r&&/Wells Fargo/i.test(String(r.bank||''))&&r.accountType==='personal'&&Number(r.bonus||0)===400?r:null}catch{return null}}
  function polishAnalyzerDom(){
    const r=currentWellsAnalysis();if(!r)return;
    document.querySelectorAll('.az-timer-card').forEach(card=>{if(/bonus payout watch|funding|maintain|required balance|hold|close check/i.test(card.textContent||''))card.remove()});
    const title=[...document.querySelectorAll('.az-section-title')].find(x=>/suggested mini timers/i.test(x.textContent||''));if(title)title.textContent='Suggested deadlines';
    const grid=document.querySelector('.az-review-grid');if(grid&&!document.getElementById('az_wells_future_eligibility')){const d=document.createElement('div');d.id='az_wells_future_eligibility';d.className='az-field-card verified';d.innerHTML='<div class="az-field-top"><b>Future eligibility</b><span>VERIFIED</span></div><div class="az-field-val">1 year after bonus received date</div><div class="az-proof">Auto-saved from source terms</div>';grid.appendChild(d)}
    document.querySelectorAll('.az-field-card').forEach(card=>{if(/Requirement summary/i.test(card.textContent||'')){const val=card.querySelector('.az-field-val');if(val)val.textContent='$1,000 qualifying electronic deposits within 90 days'}});
  }
  ['tcOpenPro','tcRunPro','tcV3SelectTier'].forEach(name=>{const base=window[name];if(typeof base==='function')window[name]=function(){const out=base.apply(this,arguments);setTimeout(polishAnalyzerDom,0);return out}});
  const baseApplyReviewed=window.tcApplyReviewed;if(typeof baseApplyReviewed==='function')window.tcApplyReviewed=function(){const r=currentWellsAnalysis();const out=baseApplyReviewed.apply(this,arguments);if(r&&typeof modal!=='undefined'&&modal){modal.churnable=true;modal.churnability='repeatable';modal.churn='1';modal.churnBasis='bonus';modal.churnBufferDays=0;modal.churnReason=r.churnReason||r.eligibilityText||'';modal.churnRuleText=r.churnRuleText||r.churnReason||'';modal.churnDecisionSource='current-tc';modal.analysis={...(modal.analysis||{}),churnable:true,churnability:'repeatable',churn:'1',churnBasis:'bonus',churnBufferDays:0,churnReason:modal.churnReason,churnRuleText:modal.churnRuleText};repairWellsConsumer400Entry(modal);try{R()}catch{}}return out};
  const baseCreateTimers=window.tcCreateSelectedTimers;if(typeof baseCreateTimers==='function')window.tcCreateSelectedTimers=function(){const out=baseCreateTimers.apply(this,arguments);if(typeof modal!=='undefined'&&modal){repairWellsConsumer400Entry(modal);try{R()}catch{}}return out};

  function normalizeEntry(e){
    const x=oldNormalize?oldNormalize(e):({...e});
    repairWellsConsumer400Entry(x);ensurePayoutTimerAfterRequirement(x);
    const decision=typeof churnDecisionForEntry==='function'?churnDecisionForEntry(x):(x.churnable===false?'nonrepeatable':x.churn?'repeatable':'');
    if(decision==='nonrepeatable'){x.churnBasis='';x.churnBufferDays=0;}
    else if(decision==='repeatable'){x.churnBasis=normalizeChurnBasis(x.churnBasis||x.analysis?.churnBasis||'closed');if(x.churnBufferDays===undefined||x.churnBufferDays===null||x.churnBufferDays==='')x.churnBufferDays=10;}
    try{if(typeof btBuildResolvedBankProfile==='function'){x.profile=btBuildResolvedBankProfile(x);x.profileVersion='bank-profile-v2'}}catch{}
    return x;
  }
  window.normalizeLifecycleEntry=normalizeEntry;window.normalizeLifecycleEntries=rows=>(rows||[]).map(normalizeEntry);

  if(typeof oldCollect==='function')window.collectModalEntryData=function(){
    const d=oldCollect();if(!d)return null;
    const decision=typeof churnDecisionForEntry==='function'?churnDecisionForEntry(d):(d.churnable===false?'nonrepeatable':d.churn?'repeatable':'');
    d.churnBasis=decision==='nonrepeatable'?'':normalizeChurnBasis(modal?.churnBasis||modal?.analysis?.churnBasis||d.churnBasis||'closed');
    d.churnBufferDays=decision==='nonrepeatable'?0:Math.max(0,parseInt(modal?.churnBufferDays??modal?.analysis?.churnBufferDays??d.churnBufferDays??10,10)||0);
    d.churnRuleText=modal?.churnRuleText||modal?.analysis?.churnRuleText||d.churnRuleText||'';
    repairWellsConsumer400Entry(d);ensurePayoutTimerAfterRequirement(d);try{if(typeof btBuildResolvedBankProfile==='function'){d.profile=btBuildResolvedBankProfile(d);d.profileVersion='bank-profile-v2'}}catch{}return d;
  };
  if(typeof oldNormalizeNewCycle==='function')window.normalizeNewCycleData=function(d,existing){const x=oldNormalizeNewCycle(d,existing);x.churnable=d?.churnable!==undefined?d.churnable:existing?.churnable;x.churnability=d?.churnability||existing?.churnability||'';x.churnBasis=normalizeChurnBasis(d?.churnBasis||existing?.churnBasis||d?.analysis?.churnBasis||'closed');x.churnBufferDays=d?.churnBufferDays??existing?.churnBufferDays??10;x.churnReason=d?.churnReason||existing?.churnReason||'';x.churnRuleText=d?.churnRuleText||existing?.churnRuleText||'';return normalizeEntry(x)};

  const baseFeePlan=window.monthlyFeePlanForEntry;
  window.monthlyFeePlanForEntry=function(e){const raw=String([e?.monthlyFeeYNText,e?.avoidMonthlyFeeText,e?.monthlyFeeWaiverText].filter(Boolean).join(' '));const separate=/not stated in bonus disclosure|not contained in this bonus disclosure|separate[^.]{0,80}fee schedule|consumer account fee and information schedule/i.test(raw);if(!separate)return typeof baseFeePlan==='function'?baseFeePlan(e):null;const checked=!!e?.monthlyFeeChecked;return{title:'Fee Check',sub:'Bonus disclosure points to a separate account fee schedule',chip:checked?'Checked':'Fee Schedule',cls:checked?'safe':'warn',rows:[{label:'Monthly fee',value:'Not in bonus disclosure',cls:'warn'},{label:'Action',value:/Wells Fargo/i.test(String(e?.bank||''))?'Review Wells Fargo fee schedule':'Review separate account fee schedule',cls:checked?'ok':'warn'},{label:'Status',value:checked?'Fee/waiver terms checked':'Not checked yet',cls:checked?'ok':'warn'}],notes:e?.avoidMonthlyFeeText?[e.avoidMonthlyFeeText]:[],compact:true}};

  window.renderBankProfileSummary=function(e){if(!e)return'';const items=[];const add=(label,value,cls='')=>items.push({label,value,cls});add('Opened',e.opened?fD(e.opened):'Add date',e.opened?'':'warn');if(e.closed){add('Closed',fD(e.closed),'ok');add('Bonus',e.bonusRecd?((e.bonus?fM(e.bonus)+' · ':'')+fD(e.bonusRecd)):(e.bonus?fM(e.bonus):'Not saved'),e.bonusRecd?'ok':'');if(typeof isNonRepeatableEntry==='function'&&isNonRepeatableEntry(e))add('Archive','Non-repeatable offer','ok');else{const cr=churnReadyDate(e);add('Next eligible',cr?fD(cr):'Waiting for basis date',cr?'ok':'warn')}}else{add('Bonus',e.bonusRecd?((e.bonus?fM(e.bonus)+' · ':'')+fD(e.bonusRecd)):(e.bonus?fM(e.bonus)+' pending':'Pending'),e.bonusRecd?'ok':'warn');add('Requirement',requirementSummaryForEntry(e),e.reqMet?'ok':'warn');const type=String(e.closeRestrictionType||e.analysis?.closeRestrictionType||'');const safe=typeof safeCloseDate==='function'?safeCloseDate(e):'';if(type==='payout-only')add('Earliest close',e.bonusRecd?'Bonus posted · close when ready':'After '+fM(e.bonus||0)+' posts',e.bonusRecd?'ok':'warn');else add('Earliest close',safe?fD(safe):'Review terms',safe&&daysUntilSafe(e)<=0?'ok':safe?'warn':'bad')}return '<div class="profile-summary">'+items.map(x=>'<div class="profile-summary-item '+esc(x.cls||'')+'"><span>'+esc(x.label)+'</span><b>'+esc(x.value)+'</b></div>').join('')+'</div>'};

  function futureEligibilityText(e){const decision=typeof churnDecisionForEntry==='function'?churnDecisionForEntry(e):(e?.churnable===false?'nonrepeatable':e?.churn?'repeatable':'');if(decision==='nonrepeatable')return'Non-repeatable · archives after closing';if(decision==='repeatable'){const rule=e?.churn==='180'?'180 days':e?.churn?(e.churn+' year'+(String(e.churn)==='1'?'':'s')):'Reset period missing';const b=normalizeChurnBasis(e?.churnBasis||e?.analysis?.churnBasis||'closed');return rule+' after '+(b==='bonus'?'bonus received date':b==='opened'?'account opened date':'account closed date')}return'Not saved'}
  window.btFutureEligibilityText=futureEligibilityText;
  const baseRModal=window.rModal;if(typeof baseRModal==='function')window.rModal=function(){let h=baseRModal();if(typeof modal==='undefined'||!modal)return h;const decision=typeof churnDecisionForEntry==='function'?churnDecisionForEntry(modal):(modal.churnable===false?'nonrepeatable':modal.churn?'repeatable':'');if((parseInt(modal._wizardStep,10)||1)===1){const basis=normalizeChurnBasis(modal.churnBasis||modal.analysis?.churnBasis||'closed');let repl='<div class="fg"><label>Can this bonus be earned again? *</label><select onchange="setModalChurnability(this.value);R()"><option value=""'+(!decision?' selected':'')+'>Choose one</option><option value="repeatable"'+(decision==='repeatable'?' selected':'')+'>Yes — Repeatable</option><option value="nonrepeatable"'+(decision==='nonrepeatable'?' selected':'')+'>No — Non-repeatable</option></select></div>';if(decision==='repeatable')repl+='<div class="fg"><label>Eligibility reset / churn rule *</label><select onchange="setModalChurnRule(this.value);R()"><option value=""'+(!modal.churn?' selected':'')+'>Choose reset period</option><option value="180"'+(String(modal.churn)==='180'?' selected':'')+'>180 days</option><option value="1"'+(String(modal.churn)==='1'?' selected':'')+'>1 year</option><option value="2"'+(String(modal.churn)==='2'?' selected':'')+'>2 years</option><option value="3"'+(String(modal.churn)==='3'?' selected':'')+'>3 years</option></select></div><div class="fg"><label>Eligibility clock starts from *</label><select onchange="setModalChurnBasis(this.value);R()"><option value="closed"'+(basis==='closed'?' selected':'')+'>Account closed date</option><option value="bonus"'+(basis==='bonus'?' selected':'')+'>Bonus received date</option><option value="opened"'+(basis==='opened'?' selected':'')+'>Account opened date</option></select><div class="guided-field-help">Saved now so the next-eligible date is automatic later.</div></div>';else if(decision==='nonrepeatable')repl+='<div class="fg full"><div class="guided-decision-note"><b>Archive after closing</b><span>No churn countdown or reopen date will be created.</span></div></div>';h=h.replace(/<div class="fg"><label>[\s\S]*?<\/label><select onchange="btModalSet\('churn',this\.value\)">[\s\S]*?<\/select><\/div>/,repl)}if((parseInt(modal._wizardStep,10)||1)===4){h=h.replace('<div class="guided-review-head','<div class="guided-tip"><b>Future eligibility</b><span>'+futureEligibilityText(modal)+'</span></div><div class="guided-review-head');const replaceRow=(label,value)=>{const re=new RegExp('<div><span>'+label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'<\/span><b>[\s\S]*?<\/b><\/div>');h=h.replace(re,'<div><span>'+label+'</span><b>'+esc(value)+'</b></div>')};replaceRow('Requirement',requirementSummaryForEntry(modal));replaceRow('Monthly fee',/not stated in bonus disclosure|separate[^.]{0,80}fee schedule|consumer account fee/i.test(String([modal.monthlyFeeYNText,modal.avoidMonthlyFeeText].join(' ')))?'Separate fee schedule':'Review terms');replaceRow('Earliest close',String(modal.closeRestrictionType||modal.analysis?.closeRestrictionType||'')==='payout-only'?'After '+fM(modal.bonus||0)+' posts':'Review terms');h=h.replace(/<div><span>Churn<\/span><b>[\s\S]*?<\/b><\/div>/,'<div><span>Future eligibility</span><b>'+esc(futureEligibilityText(modal))+'</b></div>');const missing=!decision||(decision==='repeatable'&&!['180','1','2','3'].includes(String(modal.churn||'')));if(missing){h=h.replace('Ready to save','Future eligibility required').replace('Review this compact summary, then save.','Choose repeatable or non-repeatable before saving.').replace(/<button type="button" class="btn-p" ([^>]*)onclick="saveEntryFromButton/, '<button type="button" class="btn-p" disabled $1onclick="saveEntryFromButton')}}return h};

  (function injectProfessionalCss(){if(document.getElementById('bt_professional_v3413_css'))return;const st=document.createElement('style');st.id='bt_professional_v3413_css';st.textContent='.guided-field-help{font-size:9px;line-height:1.35;color:#64748b;margin-top:5px;font-weight:600}.guided-decision-note{display:flex;flex-direction:column;gap:3px;padding:10px 11px;border:1px solid #bbf7d0;border-radius:12px;background:#f0fdf4;color:#166534}.guided-decision-note b{font-size:11px}.guided-decision-note span{font-size:9px;line-height:1.35;color:#3f6212}';document.head.appendChild(st)})();

  if(typeof btRegisterPostRender==='function')btRegisterPostRender('v3413-professional-labels',()=>{
    document.querySelectorAll('.sec').forEach(el=>{if(el.textContent.trim()==='Mini Countdown Timers')el.textContent='Key Deadlines'});
    document.querySelectorAll('.profile-section>summary span').forEach(el=>{if(el.textContent.trim()==='Lifecycle & Tasks')el.textContent='Lifecycle & Deadlines'});
  });

  window.btWellsProfessionalRuntimeVersion=VER;window.BT_APP_VERSION=VER;
  setTimeout(()=>{try{entries=sortE((entries||[]).map(normalizeEntry));sv(SK,entries);window.__btWellsProfessionalRepairV3413=true;R()}catch{}},120);
})();
