/*
 * Bonus Tracker Professional Workflow Upgrade
 * version: 3.4.01
 * purpose: unified field sources, guided editor, repeat-cycle workflow,
 *          safer validation, update handling, mobile polish, and full regression hooks.
 */
(function(){
  'use strict';
  const VER='3.4.01';
  const PROFILE_SCHEMA='bank-profile-v2';
  const SOURCE_PRIORITY={manual:500,'verified-bank-rule':450,'current-tc':400,extracted:380,'user-rule':340,learned:250,'prior-cycle':200,profile:150,generated:100,unknown:0};
  const html=v=>{try{return esc(String(v??''))}catch{const d=document.createElement('div');d.textContent=String(v??'');return d.innerHTML}};
  const clean=v=>String(v??'').replace(/\\n/g,'\n').replace(/\r/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
  const short=(v,n=120)=>{const t=clean(v).replace(/\s+/g,' ');return t.length>n?t.slice(0,n-1).trim()+'…':t};
  const isoNow=()=>new Date().toISOString();

  function sourceKind(meta, fallback='saved-entry'){
    const k=String(meta?.kind||meta?.sourceKind||fallback||'unknown').toLowerCase();
    if(k.includes('manual'))return'manual';
    if(k.includes('verified'))return'verified-bank-rule';
    if(k.includes('current')||k.includes('direct')||k.includes('extract'))return'current-tc';
    if(k.includes('user-rule'))return'user-rule';
    if(k.includes('learn'))return'learned';
    if(k.includes('prior'))return'prior-cycle';
    if(k.includes('profile'))return'profile';
    if(k.includes('generated'))return'generated';
    return fallback||'unknown';
  }
  function sourceMeta(e,key,fallback='saved-entry'){
    const raw=(e?.fieldSources&&e.fieldSources[key])||(e?.resolvedFieldSources&&e.resolvedFieldSources[key])||null;
    const kind=sourceKind(raw,fallback);
    return {kind,priority:SOURCE_PRIORITY[kind]??50,confidence:String(raw?.confidence||''),source:short(raw?.source||'',260),updatedAt:raw?.updatedAt||raw?.appliedAt||''};
  }
  function resolvedField(e,key,value,fallback='saved-entry'){
    return {value:value??'',source:sourceMeta(e,key,fallback)};
  }
  function feeSummary(e){
    let s={};
    try{s=deriveMonthlyFeeStructure(e)||{}}catch{}
    let noFee=false;try{noFee=!!noMonthlyFeeDetected(e)}catch{noFee=!!s.monthlyFeeNoMonthlyServiceFee}
    let amount='';try{amount=compactMonthlyFeeAmount(e)}catch{amount=s.monthlyFeeAmountText||''}
    let waiver='';try{waiver=compactWaiverSummary(e)}catch{waiver=s.monthlyFeeWaiverText||s.monthlyFeeWaiverAmountText||''}
    return {noFee,amount:noFee?'$0':amount,waiver:short(waiver,110),checked:!!e?.monthlyFeeChecked};
  }
  function buildResolvedBankProfile(e){
    if(!e||typeof e!=='object')return null;
    const known=typeof knownClosePolicy==='function'?knownClosePolicy(e):null;
    const fee=feeSummary(e);
    const closeDays=typeof closeRuleDaysFor==='function'?closeRuleDaysFor(e):(parseInt(e.minHoldDays,10)||0);
    const closeBasis=typeof closeRuleBasisFor==='function'?closeRuleBasisFor(e):(e.closeRuleBasis||'opened');
    const closeBuffer=typeof closeBufferDaysFor==='function'?closeBufferDaysFor(e):(parseInt(e.closeBufferDays,10)||5);
    const safe=typeof safeCloseDate==='function'?safeCloseDate(e):'';
    const closeSource=known?'verified-bank-rule':sourceKind(e.fieldSources?.closeRuleText||e.fieldSources?.closeFeeCountdownDays,e.closeRuleSource||'saved-entry');
    return {
      schema:PROFILE_SCHEMA,
      version:VER,
      resolvedAt:isoNow(),
      identity:{bank:resolvedField(e,'bank',e.bank,'manual'),accountType:resolvedField(e,'accountType',e.accountType||'personal','saved-entry')},
      offer:{
        bonus:resolvedField(e,'bonus',Number(e.bonus||0),'saved-entry'),
        promoCode:resolvedField(e,'promoCodeText',e.promoCodeText||'','saved-entry'),
        requirement:resolvedField(e,'dataPoint',e.dataPoint||e.completeBonusText||'','saved-entry'),
        requirementDays:resolvedField(e,'requiredDaysText',Number(e.reqDays||0),'saved-entry'),
        fundingAmount:resolvedField(e,'fundingAmountText',e.fundingAmountText||e.fundingAmount||'','saved-entry'),
        fundingDays:resolvedField(e,'fundedDays',Number(e.fundedDays||0),'saved-entry'),
        payout:resolvedField(e,'payoutTimingText',e.payoutTimingText||'','saved-entry')
      },
      dates:{opened:e.opened||'',requirementMet:e.reqMet||'',bonusReceived:e.bonusRecd||'',closed:e.closed||''},
      fee:{...fee,source:sourceMeta(e,'monthlyFeeYNText','saved-entry'),waiverSource:sourceMeta(e,'avoidMonthlyFeeText','saved-entry')},
      close:{days:closeDays,basis:closeBasis,buffer:closeBuffer,text:known?.text||e.closeRuleText||'',safeDate:safe||'',source:{kind:closeSource,priority:SOURCE_PRIORITY[closeSource]??50}},
      churn:{rule:e.churn||'',eligibility:short(e.eligibilityText||'',240)},
      warnings:[]
    };
  }
  window.btBuildResolvedBankProfile=buildResolvedBankProfile;

  const oldNormalize=typeof normalizeLifecycleEntry==='function'?normalizeLifecycleEntry:null;
  if(oldNormalize){
    normalizeLifecycleEntry=function(e){
      const x=oldNormalize(e);
      x.fieldSources=(x.fieldSources&&typeof x.fieldSources==='object')?x.fieldSources:{};
      x.profile=buildResolvedBankProfile(x);
      x.profileVersion=PROFILE_SCHEMA;
      return x;
    };
    window.normalizeLifecycleEntry=normalizeLifecycleEntry;
  }

  function markManual(key,value){
    if(typeof modal==='undefined'||!modal)return;
    modal[key]=value;
    modal.fieldSources=(modal.fieldSources&&typeof modal.fieldSources==='object')?modal.fieldSources:{};
    modal.fieldSources[key]={kind:'manual',confidence:'verified',source:'Edited by user in the guided editor.',updatedAt:isoNow()};
  }
  window.btModalSet=function(key,value,type='text'){
    let v=value;
    if(type==='number')v=parseInt(value,10)||0;
    if(type==='bool')v=String(value)==='true'||value===true||value==='yes';
    markManual(key,v);
    if(key==='fundingAmountText')modal.fundingAmount=typeof parseCloseFeeAmount==='function'?parseCloseFeeAmount(v):(parseInt(String(v).replace(/[$,]/g,''),10)||0);
    if(key==='requiredDaysText')modal.reqDays=typeof parseRequirementDaysText==='function'?parseRequirementDaysText(v):(parseInt(v,10)||0);
    if(key==='closeFeeCountdownDays')modal.minHoldDays=parseInt(v,10)||0;
    if(key==='earlyTerminationFeeText')modal.earlyCloseFee=typeof parseCloseFeeAmount==='function'?parseCloseFeeAmount(v):(parseInt(String(v).replace(/[$,]/g,''),10)||0);
  };
  window.btWizardStep=function(step){if(typeof modal!=='undefined'&&modal){modal._wizardStep=Math.max(1,Math.min(4,parseInt(step,10)||1));R();}};

  function input(label,key,value,opts={}){
    const type=opts.type||'text';
    const cls=opts.full?' fg full':' fg';
    const val=type==='number'?(value||''):(value||'');
    return `<div class="${cls.trim()}"><label>${html(label)}</label><input type="${type}" ${type==='number'?'inputmode="numeric" min="0"':''} value="${html(val)}" placeholder="${html(opts.placeholder||'')}" oninput="btModalSet('${key}',this.value,'${type==='number'?'number':'text'}')"></div>`;
  }
  function dateInput(label,key,value){return `<div class="fg"><label>${html(label)}</label><div class="date-wrap"><input type="date" value="${html(value||'')}" oninput="btModalSet('${key}',this.value)"><button class="date-clr" type="button" onclick="btModalSet('${key}','');this.previousElementSibling.value=''">×</button></div></div>`;}
  function textarea(label,key,value,placeholder='',rows=3){return `<div class="fg full"><label>${html(label)}</label><textarea rows="${rows}" placeholder="${html(placeholder)}" oninput="btModalSet('${key}',this.value)">${html(value||'')}</textarea></div>`;}
  function select(label,key,value,items){return `<div class="fg"><label>${html(label)}</label><select onchange="btModalSet('${key}',this.value)">${items.map(x=>`<option value="${html(x[0])}"${String(value||'')===String(x[0])?' selected':''}>${html(x[1])}</option>`).join('')}</select></div>`;}
  function wizardHeader(e,step){
    const steps=['Basics','Requirements','Fees & Close','Review'];
    return `<div class="m-bar"></div><div class="m-hdr"><div><h2>${e._startingNewCycle?'Start New Cycle':(e._edit?'Edit Bank':'Add Bank')}</h2><div class="guided-sub">Step ${step} of 4 · ${steps[step-1]}</div></div>${e._edit?`<span class="m-id">${html(e.id||'')}</span>`:''}</div><div class="guided-progress">${steps.map((s,i)=>`<button type="button" class="${i+1===step?'on':i+1<step?'done':''}" onclick="btWizardStep(${i+1})"><i>${i+1<step?'✓':i+1}</i><span>${html(s)}</span></button>`).join('')}</div>`;
  }
  function wizardBasics(e){
    let h='<div class="guided-tip"><b>Start simple.</b><span>Add the bank and the offer. Paste the T&C whenever you have it—the analyzer will fill only reviewed fields.</span></div>';
    h+='<div class="guided-grid">';
    h+=input('Bank name *','bank',e.bank,{placeholder:'e.g. Chase Business'});
    h+=select('Account type','accountType',e.accountType||'personal',[['personal','Personal'],['business','Business']]);
    h+=input('Bonus amount $','bonus',e.bonus,{type:'number',placeholder:'400'});
    h+=select('Churn rule','churn',e.churn||'',[['','Not saved'],['180','180 days'],['1','1 year'],['2','2 years'],['3','3 years']]);
    h+=dateInput('Opened','opened',e.opened);
    h+=dateInput('Requirement met','reqMet',e.reqMet);
    h+=dateInput('Bonus received','bonusRecd',e.bonusRecd);
    if(e._edit&&!e._startingNewCycle)h+=dateInput('Closed','closed',e.closed);
    h+='</div>';
    h+=`<button type="button" class="tc-btn guided-analyze" onclick="showInlineAZ=!showInlineAZ;R()">🧠 ${showInlineAZ?'Hide T&C Analyzer':'Paste T&C and Review'}</button>`;
    if(showInlineAZ)h+=`<div class="az-area"><textarea id="inline_tc" placeholder="Paste the complete promotion terms here..."></textarea><button class="az-go" type="button" onclick="event.preventDefault();runInlineAnalyze()">Analyze Terms</button></div>`;
    return h;
  }
  function wizardRequirements(e){
    let h='<div class="guided-tip"><b>What earns the bonus?</b><span>Keep this in plain English. Exact dates can be tracked with the built-in timers.</span></div><div class="guided-grid">';
    h+=input('Main requirement','dataPoint',e.dataPoint,{full:true,placeholder:'e.g. $5,000 new money or $1,000 direct deposit'});
    h+=input('Days to complete','requiredDaysText',e.requiredDaysText||(e.reqDays||''),{type:'number',placeholder:'90'});
    h+=input('Funding deadline days','fundedDays',e.fundedDays,{type:'number',placeholder:'30'});
    h+=input('Funding amount / target tier','fundingAmountText',e.fundingAmountText||(e.fundingAmount?fM(e.fundingAmount):''),{placeholder:'$5,000'});
    h+=input('Promo code','promoCodeText',e.promoCodeText,{placeholder:'Leave blank if none'});
    h+=input('Open-by / expiration','expirationDateText',e.expirationDateText,{placeholder:'May 31, 2026'});
    h+=input('Payout timing','payoutTimingText',e.payoutTimingText,{full:true,placeholder:'Within 15 days after requirements are met'});
    h+=textarea('How to complete the bonus','completeBonusText',e.completeBonusText,'Short, plain-English steps',3);
    h+='</div>';
    return h;
  }
  function wizardFeesClose(e){
    let h='<div class="guided-tip"><b>Protect the bonus.</b><span>Only save a fixed close countdown when the terms clearly connect a number of days to keeping the account open.</span></div><div class="guided-grid">';
    h+=input('Monthly fee','monthlyFeeYNText',e.monthlyFeeYNText,{placeholder:'No fee or $15 monthly'});
    h+=input('How to avoid the fee','avoidMonthlyFeeText',e.avoidMonthlyFeeText,{full:true,placeholder:'$2,000 balance or eligible relationship'});
    h+=`<div class="fg"><label>Fee timing checked</label><select onchange="btModalSet('monthlyFeeChecked',this.value==='yes','bool')"><option value="no"${!e.monthlyFeeChecked?' selected':''}>Not yet</option><option value="yes"${e.monthlyFeeChecked?' selected':''}>Yes</option></select></div>`;
    h+=input('Close hold days','closeFeeCountdownDays',e.closeFeeCountdownDays||e.minHoldDays||'',{type:'number',placeholder:'Only when terms say a fixed hold'});
    h+=select('Close rule starts from','closeRuleBasis',e.closeRuleBasis||'opened',[['opened','Opened date'],['bonus','Bonus received date'],['reqmet','Requirement met date'],['manual','Manual review']]);
    h+=input('Safety buffer days','closeBufferDays',e.closeBufferDays??5,{type:'number',placeholder:'5'});
    h+=input('Early-close fee','earlyTerminationFeeText',e.earlyTerminationFeeText,{placeholder:'None or $25'});
    h+=input('Close rule wording','closeRuleText',e.closeRuleText,{full:true,placeholder:'Exact close/keep-open wording'});
    h+=textarea('Eligibility / churn notes','eligibilityText',e.eligibilityText,'Who qualifies again and when',2);
    h+=textarea('Your notes','notes',e.notes,'Personal reminders—never overwritten by analyzer',3);
    h+='</div>';
    if(e.analyzedTC)h+=`<details class="guided-details"><summary>Analyzer summary</summary><div class="guided-readonly">${html(short(e.analyzedTC,1400)).replace(/\n/g,'<br>')}</div></details>`;
    return h;
  }
  function validationIssues(d){
    const issues=[];
    if(!String(d?.bank||'').trim())issues.push({level:'error',text:'Add the bank name.'});
    if((Number(d?.bonus)||0)<0)issues.push({level:'error',text:'Bonus amount cannot be negative.'});
    const pairs=[['opened','reqMet','Requirement met cannot be before opened.'],['opened','bonusRecd','Bonus received cannot be before opened.'],['opened','closed','Closed cannot be before opened.'],['reqMet','bonusRecd','Bonus received is earlier than requirement met—verify the dates.']];
    pairs.forEach(([a,b,msg])=>{if(d?.[a]&&d?.[b]&&dB(d[a],d[b])<0)issues.push({level:a==='reqMet'?'warn':'error',text:msg})});
    if(d?.closed&&d?.closed>td())issues.push({level:'error',text:'Actual closed date cannot be in the future.'});
    if(d?.bonusRecd&&!d?.reqMet)issues.push({level:'warn',text:'Requirement met date is blank. The tracker can still save, but history will be less precise.'});
    const hold=parseInt(d?.minHoldDays||d?.closeFeeCountdownDays||0,10)||0;
    if(hold>0&&!/(close|closed|remain open|keep[^.]{0,30}open|early termination|forfeit|clawback)/i.test(String(d?.closeRuleText||''))&&!knownClosePolicy(d))issues.push({level:'warn',text:'Close hold days have no matching close wording. Verify before saving.'});
    const identity=String([d?.bank,d?.accountType].join(' '));
    const terms=String([d?.analyzedTC,d?.completeBonusText,d?.eligibilityText].join(' '));
    if(/business|biz/i.test(identity)&&/chase total checking|consumer checking|personal checking/i.test(terms)&&!/business complete/i.test(terms))issues.push({level:'warn',text:'Personal-account wording appears inside this business entry. Re-analyze the current offer.'});
    return issues;
  }
  window.btValidationIssues=validationIssues;
  function wizardReview(e){
    const normalized={...e,minHoldDays:parseInt(e.closeFeeCountdownDays||e.minHoldDays||0,10)||0,closeBufferDays:parseInt(e.closeBufferDays,10)||0};
    const issues=validationIssues(normalized);
    const profile=buildResolvedBankProfile(normalized);
    const errorCount=issues.filter(x=>x.level==='error').length;
    let h=`<div class="guided-review-head ${errorCount?'bad':'good'}"><b>${errorCount?'Fix '+errorCount+' item'+(errorCount!==1?'s':''):'Ready to save'}</b><span>${errorCount?'Required items are highlighted below.':'Review this compact summary, then save.'}</span></div>`;
    h+='<div class="guided-summary">';
    const rows=[['Bank',e.bank||'Missing'],['Account',String(e.accountType||'personal').replace(/^./,c=>c.toUpperCase())],['Bonus',e.bonus?fM(e.bonus):'Not saved'],['Opened',e.opened?fD(e.opened):'Not saved'],['Requirement',short(e.dataPoint||e.completeBonusText||'Not saved',90)],['Monthly fee',profile?.fee?.noFee?'No monthly fee':(profile?.fee?.amount||'Review terms')],['Earliest close',profile?.close?.safeDate?fD(profile.close.safeDate):'Manual review'],['Churn',e.churn?(e.churn==='180'?'180 days':e.churn+' year'+(e.churn==='1'?'':'s')):'Not saved']];
    rows.forEach(r=>h+=`<div><span>${html(r[0])}</span><b>${html(r[1])}</b></div>`);h+='</div>';
    if(issues.length)h+=`<div class="guided-issues">${issues.map(x=>`<div class="${x.level}"><i>${x.level==='error'?'!':'•'}</i><span>${html(x.text)}</span></div>`).join('')}</div>`;
    h+=`<details class="guided-details"><summary>Source details</summary><div class="guided-source-grid"><div><b>Close rule</b><span>${html(profile?.close?.source?.kind||'manual review')}</span></div><div><b>Analyzer</b><span>${e.analysis?'Reviewed T&C saved':'No current analysis saved'}</span></div><div><b>Manual edits</b><span>${Object.values(e.fieldSources||{}).filter(x=>sourceKind(x)==='manual').length} field(s)</span></div></div></details>`;
    return h;
  }

  const oldRModal=typeof rModal==='function'?rModal:null;
  rModal=function(){
    const e=modal;if(!e)return'';
    const step=Math.max(1,Math.min(4,parseInt(e._wizardStep,10)||1));
    let h='<div class="ov" onclick="closeModal()"><div class="modal guided-modal" onclick="event.stopPropagation()">';
    h+=wizardHeader(e,step);
    h+='<div class="guided-body">'+(step===1?wizardBasics(e):step===2?wizardRequirements(e):step===3?wizardFeesClose(e):wizardReview(e))+'</div>';
    h+='<div class="guided-actions">';
    if(step>1)h+='<button type="button" class="btn-s" onclick="btWizardStep('+(step-1)+')">Back</button>';
    if(step<4)h+='<button type="button" class="btn-p" onclick="btWizardStep('+(step+1)+')">Continue</button>';
    else{
      const errors=validationIssues(e).some(x=>x.level==='error');
      h+=`<button type="button" class="btn-p" ${errors?'disabled':''} onclick="saveEntryFromButton(this,event)">💾 ${e._startingNewCycle?'Start New Cycle':(e._edit?'Save Changes':'Add Bank')}</button>`;
    }
    h+='<button type="button" class="btn-s" onclick="closeModal()">Cancel</button>';
    h+='</div>';
    if(e._edit&&!e._startingNewCycle)h+='<details class="guided-danger"><summary>Advanced entry actions</summary><button class="btn-d" type="button" onclick="clearFields()">Clear all fields</button></details>';
    h+='</div></div>';return h;
  };
  window.rModal=rModal;

  const oldOpenAdd=typeof openAdd==='function'?openAdd:null;
  if(oldOpenAdd){openAdd=function(){oldOpenAdd();if(modal)modal._wizardStep=1;};window.openAdd=openAdd;}
  const oldOpenEdit=typeof openEdit==='function'?openEdit:null;
  if(oldOpenEdit){openEdit=function(id){oldOpenEdit(id);if(modal)modal._wizardStep=1;};window.openEdit=openEdit;}

  window.startNewCycle=function(id){
    const old=(entries||[]).find(x=>x.id===id);if(!old)return;
    const archive=typeof archivedCycleSnapshot==='function'?archivedCycleSnapshot(old):{bank:old.bank,opened:old.opened,closed:old.closed,bonusRecd:old.bonusRecd,bonus:old.bonus,archivedAt:td()};
    const priorSources={};
    ['monthlyFeeYNText','avoidMonthlyFeeText','monthlyFeeAmountText','monthlyFeeWaiverText','monthlyFeeWaiverAmountText','churn','dataPoint'].forEach(k=>{if(old[k])priorSources[k]={kind:'prior-cycle',confidence:'review',source:'Copied from the previous saved cycle. Verify against the new T&C.',updatedAt:isoNow()}});
    modal={
      id:old.id,_edit:true,_startingNewCycle:true,_wizardStep:1,bank:old.bank||'',accountType:old.accountType||'personal',churn:old.churn||'',phoneNum:old.phoneNum||'',
      bonus:0,opened:'',closed:'',bonusRecd:'',reqMet:'',promoCodeText:'',expirationDateText:'',requiredDaysText:'',reqDays:0,fundedDays:0,fundingAmount:0,fundingAmountText:'',payoutTimingText:'',completeBonusText:'',eligibilityText:'',
      dataPoint:old.dataPoint||'',monthlyFeeYNText:old.monthlyFeeYNText||'',avoidMonthlyFeeText:old.avoidMonthlyFeeText||'',monthlyFeeAmountText:old.monthlyFeeAmountText||'',monthlyFeeWaiverText:old.monthlyFeeWaiverText||'',monthlyFeeWaiverAmountText:old.monthlyFeeWaiverAmountText||'',monthlyFeeFrequency:old.monthlyFeeFrequency||'',monthlyFeeWaiverType:old.monthlyFeeWaiverType||'',monthlyFeeChecked:false,
      minHoldDays:0,closeFeeCountdownDays:'',closeRuleBasis:'opened',closeBufferDays:5,closeRuleText:'',earlyTerminationFeeText:'',earlyCloseFee:0,notes:'',analyzedTC:'',analysis:null,analyzerHistory:[],history:normalizeEntryHistoryList(old.history),checklist:[],customTimers:[],fieldSources:priorSources,previousCycles:[archive,...(Array.isArray(old.previousCycles)?old.previousCycles:[])].slice(0,12)
    };
    try{applyKnownClosePolicy(modal)}catch{}
    showInlineAZ=false;inlineResult=null;expanded=id;R();
  };

  const oldCollect=typeof collectModalEntryData==='function'?collectModalEntryData:null;
  if(oldCollect){
    collectModalEntryData=function(){
      const d=oldCollect();if(!d)return null;
      d.fieldSources=(modal?.fieldSources&&typeof modal.fieldSources==='object')?modal.fieldSources:{};
      d.previousCycles=Array.isArray(modal?.previousCycles)?modal.previousCycles.slice(0,12):(Array.isArray(d.previousCycles)?d.previousCycles:[]);
      d.profile=buildResolvedBankProfile(d);d.profileVersion=PROFILE_SCHEMA;
      const issues=validationIssues(d);const errors=issues.filter(x=>x.level==='error');
      if(errors.length){btNotify(errors[0].text,'error',4200);return null;}
      if(issues.some(x=>x.level==='warn'))d.validationWarnings=issues.filter(x=>x.level==='warn').map(x=>x.text).slice(0,12);else d.validationWarnings=[];
      return d;
    };
    window.collectModalEntryData=collectModalEntryData;
  }

  const oldProfileSummary=typeof renderBankProfileSummary==='function'?renderBankProfileSummary:null;
  renderBankProfileSummary=function(e){
    const p=e?.profile?.schema===PROFILE_SCHEMA?e.profile:buildResolvedBankProfile(e);if(!p)return oldProfileSummary?oldProfileSummary(e):'';
    const items=[];const add=(label,value,cls='')=>items.push({label,value,cls});
    add('Opened',p.dates.opened?fD(p.dates.opened):'Add date',p.dates.opened?'':'warn');
    if(p.dates.closed){
      add('Closed',fD(p.dates.closed),'ok');
      add('Bonus',p.dates.bonusReceived?((p.offer.bonus.value?fM(p.offer.bonus.value)+' · ':'')+fD(p.dates.bonusReceived)):(p.offer.bonus.value?fM(p.offer.bonus.value):'Not saved'),p.dates.bonusReceived?'ok':'');
      const cr=churnReadyDate(e);add('Churn ready',cr?fD(cr):'Not calculated',cr?'':'warn');
    }else{
      add('Bonus',p.dates.bonusReceived?((p.offer.bonus.value?fM(p.offer.bonus.value)+' · ':'')+fD(p.dates.bonusReceived)):(p.offer.bonus.value?fM(p.offer.bonus.value)+' pending':'Pending'),p.dates.bonusReceived?'ok':'warn');
      add('Requirement',p.dates.requirementMet?'Met '+fD(p.dates.requirementMet):'Pending',p.dates.requirementMet?'ok':'warn');
      add('Earliest close',p.close.safeDate?fD(p.close.safeDate):'Review terms',p.close.safeDate&&daysUntilSafe(e)<=0?'ok':p.close.safeDate?'warn':'bad');
    }
    return '<div class="profile-summary">'+items.map(x=>'<div class="profile-summary-item '+html(x.cls||'')+'"><span>'+html(x.label)+'</span><b>'+html(x.value)+'</b></div>').join('')+'</div>';
  };
  window.renderBankProfileSummary=renderBankProfileSummary;

  const oldFeePlan=typeof monthlyFeePlanForEntry==='function'?monthlyFeePlanForEntry:null;
  monthlyFeePlanForEntry=function(e){
    const p=e?.profile?.schema===PROFILE_SCHEMA?e.profile:buildResolvedBankProfile(e);if(!p)return oldFeePlan?oldFeePlan(e):null;
    const has=!!(p.fee.noFee||p.fee.amount||p.fee.waiver||e?.monthlyFeeYNText||e?.avoidMonthlyFeeText);if(!has)return null;
    const rows=[];rows.push({label:'Fee',value:p.fee.noFee?'No monthly fee':(p.fee.amount?p.fee.amount+' / month':'Review terms'),cls:p.fee.noFee?'ok':p.fee.amount?'':'warn'});
    if(!p.fee.noFee)rows.push({label:'Waiver',value:p.fee.waiver||'Not saved clearly',cls:p.fee.waiver?'':'warn'});
    if(!p.fee.noFee)rows.push({label:'Before close',value:p.fee.checked?'Checked':'Check next statement',cls:p.fee.checked?'ok':'warn'});
    return{title:'Fee Check',sub:p.fee.noFee?'No action needed':'Simple monthly-fee reminder',chip:p.fee.noFee?'No Fee':p.fee.checked?'Checked':'Watch Fee',cls:p.fee.noFee||p.fee.checked?'safe':'warn',rows,notes:[],compact:true};
  };
  window.monthlyFeePlanForEntry=monthlyFeePlanForEntry;

  const oldClosePlan=typeof closePlanForEntry==='function'?closePlanForEntry:null;
  closePlanForEntry=function(e){
    const p=e?.profile?.schema===PROFILE_SCHEMA?e.profile:buildResolvedBankProfile(e);if(!p)return oldClosePlan?oldClosePlan(e):null;
    const ready=closeReadiness(e);const rows=[];
    if(e.closed){rows.push({label:'Closed',value:fD(e.closed),cls:'ok'});const cr=churnReadyDate(e);if(cr)rows.push({label:'Churn ready',value:fD(cr)});return{title:'Close Check',sub:'Closure saved',chip:ready.label,cls:ready.cls,rows,notes:[],compact:true};}
    rows.push({label:'Earliest close',value:p.close.safeDate?fD(p.close.safeDate):'Review terms',cls:p.close.safeDate&&daysUntilSafe(e)<=0?'ok':p.close.safeDate?'warn':'bad'});
    rows.push({label:'Rule',value:p.close.days?`${p.close.days} days from ${closeRuleBasisLabel(p.close.basis).toLowerCase()}${p.close.buffer?' + '+p.close.buffer+' day safety':''}`:'Manual review',cls:p.close.days?'':'warn'});
    rows.push({label:'Final check',value:e.bonusRecd?'Bonus posted · no pending activity':'Wait for bonus to post',cls:e.bonusRecd?'':'bad'});
    return{title:'Close Check',sub:'One clear source of truth',chip:ready.label,cls:ready.cls,rows,notes:[],compact:true};
  };
  window.closePlanForEntry=closePlanForEntry;

  function btNotify(message,type='info',duration=3000){
    const host=document.getElementById('bt_toast_host')||(()=>{const x=document.createElement('div');x.id='bt_toast_host';x.className='bt-toast-host';document.body.appendChild(x);return x})();
    const t=document.createElement('div');t.className='bt-toast '+type;t.innerHTML=`<span>${type==='success'?'✓':type==='error'?'!':'i'}</span><b>${html(message)}</b>`;host.appendChild(t);
    requestAnimationFrame(()=>t.classList.add('show'));setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),220)},duration);
  }
  window.btNotify=btNotify;
  window.alert=function(msg){btNotify(String(msg||''),/failed|error|invalid|required|could not/i.test(String(msg))?'error':/saved|complete|copied|added|updated/i.test(String(msg))?'success':'info',4200);};

  let updateReady=false;
  window.btApplyUpdate=function(){
    if(!navigator.serviceWorker)return location.reload();
    navigator.serviceWorker.getRegistration().then(reg=>{if(reg?.waiting)reg.waiting.postMessage({type:'SKIP_WAITING'});else location.reload()}).catch(()=>location.reload());
  };
  function initUpdateFlow(){
    if(!('serviceWorker' in navigator))return;
    navigator.serviceWorker.getRegistration().then(reg=>{
      if(!reg)return;
      if(reg.waiting){updateReady=true;renderUpdateBanner();}
      reg.addEventListener('updatefound',()=>{const w=reg.installing;if(!w)return;w.addEventListener('statechange',()=>{if(w.state==='installed'&&navigator.serviceWorker.controller){updateReady=true;renderUpdateBanner();}})});
    }).catch(()=>{});
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(sessionStorage.getItem('bt_reloading'))return;sessionStorage.setItem('bt_reloading','1');location.reload()});
  }
  function renderUpdateBanner(){
    document.querySelector('.bt-update-banner')?.remove();if(!updateReady)return;
    const d=document.createElement('div');d.className='bt-update-banner';d.innerHTML='<div><b>Update ready</b><span>Your tracker data will stay saved.</span></div><button onclick="btApplyUpdate()">Update Now</button><button class="later" onclick="this.parentElement.remove()">Later</button>';document.body.appendChild(d);
  }

  const oldRunBankAction=window.runBankAction;
  if(typeof oldRunBankAction==='function')window.runBankAction=function(id,action){if(action==='newcycle'){window.__btBankActionPrompt=null;startNewCycle(id);return}return oldRunBankAction(id,action)};
  const oldRBankActions=window.rBankActions;
  if(typeof oldRBankActions==='function')window.rBankActions=function(){
    const htmlOut=oldRBankActions();
    if(!window.__btBankActionPrompt)return htmlOut;
    const e=(entries||[]).find(x=>x.id===window.__btBankActionPrompt);if(!e||!e.closed)return htmlOut;
    return htmlOut.replace('<div class="bt-ba-list">','<div class="bt-ba-list">'+bankActionSheetButton(e.id,'newcycle','↻','Start New Cycle','Reuse the bank profile and reset cycle dates'));
  };

  function injectStartCycleAction(){
    const id=window.__btBankActionPrompt;if(!id)return;
    const e=(entries||[]).find(x=>x.id===id);if(!e||!e.closed)return;
    const list=document.querySelector('.bt-ba-list');if(!list||list.querySelector('[data-bt-newcycle]'))return;
    const b=document.createElement('button');b.className='bt-ba-mini';b.dataset.btNewcycle='1';b.innerHTML='<span class="ico">↻</span><span><b>Start New Cycle</b><small>Reuse the bank profile and reset cycle dates</small></span>';
    b.addEventListener('click',ev=>{ev.stopPropagation();window.__btBankActionPrompt=null;startNewCycle(id)});list.prepend(b);
  }
  const oldR=typeof R==='function'?R:null;
  if(oldR){
    R=function(){oldR();document.body.classList.toggle('bt-entry-expanded',!!expanded);document.body.classList.toggle('bt-modal-open',!!modal||!!closePrompt||!!overwritePrompt||!!matchPickerPrompt||!!replacementPickerPrompt||!!feeCheckPrompt||!!timerEditModal||!!dpEditor);renderUpdateBanner();injectStartCycleAction();};window.R=R;
  }

  window.btRunFullRegressionTests=function(){
    const results=[];const test=(name,fn)=>{try{const ok=!!fn();results.push({name,ok,detail:ok?'pass':'failed'})}catch(err){results.push({name,ok:false,detail:err?.message||String(err)})}};
    const chase={bank:'Chase Biz',accountType:'business',opened:'2026-05-07',bonusRecd:'2026-07-14',reqMet:'2026-05-29',minHoldDays:90,closeRuleBasis:'reqmet',closeBufferDays:5,closeRuleText:'stale requirement wording',monthlyFeeYNText:'$15 monthly fee',avoidMonthlyFeeText:'$2,000 minimum daily ending balance'};
    test('Chase Business close source uses opening',()=>{const x=normalizeLifecycleEntry(chase);return closeRuleBasisFor(x)==='opened'&&safeCloseDate(x)==='2026-08-06'});
    test('Unknown bank does not inherit Chase',()=>!knownClosePolicy({bank:'Sample Community Bank',accountType:'business'}));
    test('Future actual close blocked',()=>validationIssues({bank:'Test',opened:'2026-01-01',closed:'2099-01-01'}).some(x=>x.level==='error'));
    test('Requirement before opening blocked',()=>validationIssues({bank:'Test',opened:'2026-06-01',reqMet:'2026-05-01'}).some(x=>x.level==='error'));
    test('Profile schema built',()=>buildResolvedBankProfile(chase)?.schema===PROFILE_SCHEMA);
    test('Fee summary stays compact',()=>monthlyFeePlanForEntry(chase)?.rows?.every(x=>String(x.value).length<150));
    test('Start-cycle reset model',()=>{const old={...chase,id:'x',closed:'2026-08-10',bonus:400};const a=archivedCycleSnapshot(old);return !!a&&a.closed==='2026-08-10'});
    const pass=results.filter(x=>x.ok).length;const report={version:VER,passed:pass,total:results.length,ok:pass===results.length,results,ranAt:isoNow()};window.__btFullRegressionReport=report;try{localStorage.setItem('bt_last_regression_v1',JSON.stringify(report))}catch{}return report;
  };

  window.btProfessionalUpgradeVersion=VER;
  setTimeout(()=>{try{
    entries=(entries||[]).map(normalizeLifecycleEntry);sv(SK,entries);
    initUpdateFlow();const rep=window.btRunFullRegressionTests();if(!rep.ok)console.warn('Bonus Tracker regression warnings',rep);R();
  }catch(err){console.error('Professional upgrade init failed',err)}},0);
})();

/* v3.4.00 analyzer hardening: clause scoping, conflict detection, and strict close proof */
(function(){
  'use strict';
  const core=window.tcV3Analyze;if(typeof core!=='function')return;
  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const uniq=a=>Array.from(new Set((a||[]).filter(Boolean)));
  const sentences=raw=>String(raw||'').replace(/\r/g,'\n').split(/(?<=[.!?])\s+|\n+|;+/).map(clean).filter(x=>x.length>8);
  const money=s=>(String(s||'').match(/\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/g)||[]).map(x=>parseFloat(x.replace(/[$,\s]/g,''))).filter(Number.isFinite);
  const days=s=>(String(s||'').match(/\b(\d{1,3})\s*(?:calendar\s+|business\s+)?days?\b/ig)||[]).map(x=>parseInt(x,10)).filter(n=>n>0&&n<=730);
  const addFlag=(r,msg)=>{r.reviewFlags=Array.isArray(r.reviewFlags)?r.reviewFlags:[];if(!r.reviewFlags.includes(msg))r.reviewFlags.push(msg)};
  const setSource=(r,label,source,confidence='medium',kind='extracted')=>{if(!source)return;r.fieldSources=r.fieldSources||{};r.fieldSources[label]={field:label,source,confidence,kind};r.sourceSnippets=Array.isArray(r.sourceSnippets)?r.sourceSnippets:[];const i=r.sourceSnippets.findIndex(x=>x.field===label);const row={field:label,source,confidence,kind};if(i>=0)r.sourceSnippets[i]=row;else r.sourceSnippets.push(row)};
  window.tcV3Analyze=function(raw,opts){
    const r=core(raw,opts);if(!r)return r;
    const list=sentences(raw);const type=String(r.accountType||'').toLowerCase();
    const feeLines=list.filter(s=>/(monthly|maintenance|service|account)\s+(?:service\s+)?(?:fee|charge)|\bfee\s+of\s+\$/i.test(s));
    const reqLines=list.filter(s=>/(direct deposit|qualifying deposit|new money|deposit at least|maintain|transactions?|eligible external transfer|external transfer activity|qualifying credits?|ach credits?|electronic credits?|relationship deposits?)/i.test(s)&&!/(monthly|maintenance|service)\s+(?:fee|charge)|waiv|avoid fee/i.test(s));
    const closeLines=list.filter(s=>/(close|closed|closing|remain open|keep[^.]{0,35}open|early termination|forfeit|clawback|good standing)/i.test(s));
    const businessLines=list.filter(s=>/business|commercial|merchant|small business|llc|sole proprietor|ein/i.test(s));
    const personalLines=list.filter(s=>/personal|consumer|individual|total checking|secure banking|private client checking/i.test(s));

    if(type==='business'&&personalLines.length&&businessLines.length){
      const feeSource=String(r.fieldSources?.['Monthly fee']?.source||'');
      const waiverSource=String(r.fieldSources?.['Fee waiver']?.source||r.avoidMonthlyFeeText||'');
      if(/total checking|personal|consumer|private client checking/i.test(feeSource+' '+waiverSource)&&!/business/i.test(feeSource+' '+waiverSource)){
        addFlag(r,'Monthly-fee wording appears to come from a personal account option. Verify the exact business product before applying.');
        if(r.fieldSources?.['Monthly fee'])r.fieldSources['Monthly fee'].confidence='low';
        if(r.fieldSources?.['Fee waiver'])r.fieldSources['Fee waiver'].confidence='low';
      }
    }

    const rawText=String(raw||'');
    const bonusPatterns=[
      /(?:earn|receive|get|qualify for|eligible for)[^$\n.]{0,55}\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)[^\n.]{0,70}(?:bonus|reward|relationship credit|promotional credit|account credit|cash credit)/i,
      /\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)[^\n.]{0,45}(?:bonus|reward|relationship credit|promotional credit|account credit|cash credit)/i,
      /(?:bonus|reward|relationship credit|promotional credit|account credit|cash credit)[^$\n.]{0,35}(?:of|for|worth|equals?)?\s*\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i
    ];
    let explicitBonus=0,explicitBonusSource='';
    for(const pat of bonusPatterns){const m=rawText.match(pat);if(m){explicitBonus=parseFloat(m[1].replace(/,/g,''))||0;explicitBonusSource=(list.find(x=>x.includes(m[0]))||m[0]);break}}
    if(explicitBonus){r.bonus=explicitBonus;r.selectedBonus=explicitBonus;setSource(r,'Bonus',explicitBonusSource,'high','extracted')}

    if(reqLines.length){
      const reqSource=String(r.fieldSources?.['Requirement amount']?.source||r.reqSource||'');
      if(reqSource&&/(monthly|maintenance|service)\s+(?:fee|charge)|waiv|avoid fee/i.test(reqSource)){
        r.reqMoney=0;addFlag(r,'Requirement amount was too close to monthly-fee wording and was cleared for review.');
      }
      const candidateAmounts=uniq(reqLines.flatMap(money)).filter(n=>n>=1);
      if(!r.reqMoney){
        for(const line of reqLines){
          const m=line.match(/(?:totaling|totalling|at least|minimum|aggregate|cumulative|combined|sum of)[^$]{0,30}\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i)||line.match(/\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)[^\n.]{0,45}(?:total|in eligible|in qualifying|external transfer|direct deposit)/i);
          if(m){r.reqMoney=parseFloat(m[1].replace(/,/g,''))||0;r.reqSource=line;setSource(r,'Requirement amount',line,'high','extracted');break}
        }
      }
      if(!r.reqDays){
        for(const line of reqLines){const ds=days(line);if(ds.length){r.reqDays=ds[0];setSource(r,'Requirement days',line,'high','extracted');break}}
      }
      if(candidateAmounts.length>1&&!r.tiered){
        const excludingBonus=candidateAmounts.filter(n=>n!==explicitBonus);
        if(excludingBonus.length>1)addFlag(r,'Multiple requirement amounts were found. Verify whether the offer has tiers or separate funding and direct-deposit requirements.');
      }
    }

    const eligibilityLookback=s=>/(not eligible|ineligible|eligibility|previously|prior|past) [^.]{0,90}(closed|close)|closed [^.]{0,60}(within|in the past|during the previous)/i.test(s)&&!/(deduct|reverse|forfeit|clawback|early termination fee|must remain open|keep the account open)/i.test(s);
    const explicitClose=closeLines.filter(s=>!eligibilityLookback(s)).map(s=>({s,ds:days(s)})).filter(x=>x.ds.length);
    if(explicitClose.length){
      const best=explicitClose.sort((a,b)=>{
        const score=x=>(/remain open|keep[^.]{0,35}open|close within|closed within|early termination|forfeit|clawback/i.test(x.s)?10:0)+(/after opening|from opening|after account opening/i.test(x.s)?4:0)+(/after bonus|after payout|after payment/i.test(x.s)?4:0);
        return score(b)-score(a)
      })[0];
      const n=best.ds[0];
      r.closeRuleDays=n;r.minHoldDays=n;r.closeRuleText=best.s;
      r.closeRuleBasis=/after[^.]{0,40}(bonus|payout|payment)|bonus[^.]{0,40}(paid|posted|received)/i.test(best.s)?'bonus':/after[^.]{0,40}(requirement|qualif)|requirements?[^.]{0,30}(met|complete)/i.test(best.s)?'reqmet':'opened';
      r.closeRuleConfidence='high';r.closeRestrictionType=/(deduct|reverse|forfeit|clawback|fee|penalty)/i.test(best.s)?'explicit-clawback':'minimum-open';setSource(r,'Early close / payout risk',best.s,'high','extracted');
    }else if(r.closeRuleDays||r.minHoldDays){
      const existing=String(r.closeRuleText||r.fieldSources?.['Early close / payout risk']?.source||'');
      if(!/(close|closed|remain open|keep[^.]{0,35}open|early termination|forfeit|clawback)/i.test(existing)){
        r.closeRuleDays=0;r.minHoldDays=0;r.closeRuleText='';r.closeRuleConfidence='low';r.closeRestrictionType='none';addFlag(r,'A fixed close countdown was removed because no source sentence connected the days to closing or keeping the account open.');
      }
    }

    const feeAmounts=uniq(feeLines.flatMap(money)).filter(n=>n>=0&&n<1000);
    if(feeAmounts.length>1)addFlag(r,'Multiple monthly-fee amounts were found. Verify the selected account option before applying the fee.');
    if(feeLines.length===1&&feeAmounts.length===1){
      r.fee=feeAmounts[0];r.monthlyFeeYNText=feeAmounts[0]===0?'No monthly fee':`Yes — $${feeAmounts[0].toLocaleString()} monthly fee`;setSource(r,'Monthly fee',feeLines[0],'high','extracted');
    }

    const bonusLines=list.filter(s=>/(bonus|cash reward|promotional credit|welcome reward|account credit)/i.test(s)&&/\$/.test(s));
    const bonusAmounts=uniq(bonusLines.flatMap(money)).filter(n=>n>=25);
    if(bonusAmounts.length>1&&!r.tiered)addFlag(r,'Multiple bonus-like dollar amounts were found. Confirm the selected bonus and any referral or tier amounts.');

    r.analysisDiagnostics={version:'3.4.01',sentences:list.length,feeCandidates:feeLines.length,requirementCandidates:reqLines.length,closeCandidates:closeLines.length,explicitCloseCandidates:explicitClose.length,accountType:type||'unknown'};
    r.reviewFlags=uniq(r.reviewFlags).slice(0,20);
    window.__tcV3AnalysisResult=r;window.__tcCurrentAnalysisResult=r;return r;
  };
  window.tcUnifiedAnalyze=window.tcV3Analyze;window.tcStrictAnalyze=window.tcV3Analyze;window.tcV3EngineVersion='3.4.01';
})();
