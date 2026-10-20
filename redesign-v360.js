/* BonusTracker 3.6.61 presentation helpers. Pure views; canonical rules are read-only. */
(function(){
'use strict';
const scopeKey='bt3628_audience_session',noticeKey='bt360_notice_session';
const readyExtrasState=new Map();
const accountSections=new Map();
let legacyArchiveOpen=false;
let audience='all', archivePane='waiting', selectedHeroMonth=null, lastHeroYear=null, noticePrefs={deadlines:false,payouts:false,eligible:false}, selectedStage='';
try{const saved=sessionStorage.getItem(scopeKey);if(['all','personal','business'].includes(saved))audience=saved}catch{}
try{const v=JSON.parse(sessionStorage.getItem(noticeKey)||'{}');for(const k of Object.keys(noticePrefs))noticePrefs[k]=v[k]===true}catch{}
const safe=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const arg=v=>JSON.stringify(String(v??'')).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const stage=e=>{try{return lifecycleViewForEntry(e)}catch{return {code:'IN_PROGRESS',label:'In progress'}}};
const amount=v=>fM(Number(v||0)), date=v=>v?fD(v):'Needs review';
const eligibleInfo=e=>{
 if(!e)return null;
 const gate=window.BTEligibilityGate;
 const verifiedProjected=gate?.safeEligibilityDate?.(e,addD,addM)||'';
 const eligible=verifiedProjected||(e.closed?window.churnReadyDate?.(e)||'':'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(eligible))return null;
 try{
  const check=gate?.validate?.(e);
  if(check?.ok&&check.decision==='repeatable'&&eligible===verifiedProjected){
   const controlling=gate.controllingRule(e,addD,addM);
   const more=gate.officialEligibilityDates(e,addD,addM).filter(r=>r.conditionState==='active');
   return {eligible,controlling,more,verified:true,label:controlling?gate.periodLabel(controlling.period)+' from '+gate.anchorLabel(controlling.basis)+' + '+gate.SAFETY_BUFFER_DAYS+' days':'verified saved churn rule'};
  }
 }catch{}
 const fallback=e.closed?window.btLegacyChurnFallbackDate?.(e):'';
 if(e.closed&&fallback===eligible)return {eligible,controlling:null,more:[],verified:false,label:'from saved churn rule · not verified'};
 return {eligible,controlling:null,more:[],verified:false,label:'from saved churn rule · not verified'};
};
function accountAudience(e){
 const type=typeof entryBankType==='function'?entryBankType(e):String(e?.accountType||'personal').toLowerCase();
 return type==='B'||type==='business'?'business':'personal';
}
function scope(e){return audience==='all'||accountAudience(e)===audience}
function kindTag(e){const type=accountAudience(e);return '<span class="bt3628-kind '+type+'">'+(type==='business'?'Business':'Personal')+'</span>'}
function segments(){
 return '<div class="bt360-segments bt3628-audience-segments" role="group" aria-label="Show account types">'+
  [['all','All accounts'],['personal','Personal'],['business','Business']].map(([value,label])=>'<button type="button" aria-pressed="'+(audience===value)+'" class="'+(audience===value?'active':'')+'" onclick="BT360.setAudience(\''+value+'\')">'+label+'</button>').join('')+'</div>';
}
function setAudience(value){
 if(!['all','personal','business'].includes(value))return;
 audience=value;selectedStage='';selectedHeroMonth=null;
 if(expanded){const current=entries.find(e=>e.id===expanded);if(current&&!scope(current)){expanded=null;window.bt360ArchiveDetailId=null}}
 try{sessionStorage.setItem(scopeKey,audience)}catch{}
 if(typeof window.btRadarAudienceChanged==='function')window.btRadarAudienceChanged(value);
 R();
}
function setStage(v){selectedStage=selectedStage===v?'':v;expanded=null;R()}
function resetStage(){selectedStage=''}
function infoRow(label,value,detail){return '<div class="bt360-info-row'+(String(value).length>80?' bt360-info-long':'')+'"><span>'+safe(label)+'</span><div><b>'+safe(value)+'</b>'+(detail?'<small>'+safe(detail)+'</small>':'')+'</div></div>'}
function panel(title,html,right){return '<section class="bt360-panel"><div class="bt360-panel-title"><h3>'+safe(title)+'</h3>'+(right||'')+'</div><div class="bt360-panel-body">'+html+'</div></section>'}
const pills=[
 ['ACTION_NEEDED','Action needed'],['IN_PROGRESS','In progress'],['REQUIREMENTS_MET','Requirements met'],
 ['AWAITING_BONUS','Awaiting'],['BONUS_RECEIVED','Bonus received'],['HOLD_OPEN','Hold open'],['READY_TO_CLOSE','Ready to close']
];
function stages(rows){
 const counts={};rows.filter(e=>!e.closed&&scope(e)).forEach(e=>{const code=stage(e).code;counts[code]=(counts[code]||0)+1});
 return '<div class="bt360-stage-scroller" role="group" aria-label="Filter by stage">'+pills.filter(([code])=>counts[code]>0).map(([code,label])=>'<button type="button" class="bt360-stage stage-'+code.toLowerCase()+(selectedStage===code?' active':'')+'" aria-pressed="'+(selectedStage===code)+'" onclick="BT360.setStage(\''+code+'\')">'+(counts[code]||0)+' '+label+'</button>').join('')+'</div>';
}
const HERO_MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const HERO_LETTERS=['J','F','M','A','M','J','J','A','S','O','N','D'];
function heroMonthData(rows,year){
 // Reuse the Tax eligibility/date gates. In particular, future recorded
 // receipts and unearned/zero bonuses must not inflate either view.
 const yr=Number(year);
 const eligible=taxReceiptRows(rows).filter(e=>scope(e)&&taxReady(e)&&taxYearOf(e)===yr&&e.bonusRecd<=td());
 return HERO_MONTHS.map((name,i)=>{
  const accounts=eligible.filter(e=>Number(String(e.bonusRecd).slice(5,7))===i+1)
     .sort((a,b)=>String(a.bonusRecd).localeCompare(String(b.bonusRecd))||String(a.bank).localeCompare(String(b.bank)));
  return {name,index:i,total:accounts.reduce((sum,e)=>sum+Number(e.bonus),0),accounts};
 });
}
function toggleHeroMonth(month){
 if(!Number.isInteger(month)||month<0||month>11)return;
 selectedHeroMonth=selectedHeroMonth===month?null:month;
 R();
 requestAnimationFrame(()=>document.querySelector('.bt367-month-hit[data-month="'+month+'"]')?.focus({preventScroll:true}));
}
function closeHeroMonth(){
 const previous=selectedHeroMonth;selectedHeroMonth=null;R();
 if(previous!==null)requestAnimationFrame(()=>document.querySelector('.bt367-month-hit[data-month="'+previous+'"]')?.focus({preventScroll:true}));
}
function clearHeroMonth(){selectedHeroMonth=null}
function openHeroBonus(id){
 const entry=entries.find(e=>e.id===id);
 if(!entry)return;
 selectedHeroMonth=null;
 if(entry.closed){openArchived(id);return}
 openAccountFromActionCenter(id);
}
function hero(rows,year,metrics){
 if(lastHeroYear!==Number(year)){selectedHeroMonth=null;lastHeroYear=Number(year)}
 const subset=rows.filter(scope);
 const monthRows=heroMonthData(rows,year);
 const received=monthRows.flatMap(x=>x.accounts);
 const total=monthRows.reduce((sum,x)=>sum+x.total,0);
 const progress=subset.filter(e=>!e.closed&&!e.bonusRecd).reduce((n,e)=>{const s=stage(e).code;return s==='AWAITING_BONUS'||s==='REQUIREMENTS_MET'?n:n+Number(e.bonus||0)},0);
 const awaiting=subset.filter(e=>!e.closed&&!e.bonusRecd&&['AWAITING_BONUS','REQUIREMENTS_MET'].includes(stage(e).code)).reduce((n,e)=>n+Number(e.bonus||0),0);
 const peak=Math.max(1,...monthRows.map(x=>x.total));
 const today=new Date(),isCurrentYear=Number(year)===today.getFullYear();
 const bars=monthRows.map(x=>{
  const selected=selectedHeroMonth===x.index,current=isCurrentYear&&today.getMonth()===x.index;
  const percent=x.total>0?Math.max(3,Math.round(x.total/peak*100)):0;
  const fill=x.total>0?'<span class="bt367-month-fill" style="height:'+percent+'%"></span>':'<span class="bt367-month-baseline" aria-hidden="true"></span>';
  return '<button type="button" class="bt367-month-hit'+(selected?' selected':'')+(current?' current':'')+'" data-month="'+x.index+'" aria-pressed="'+selected+'" aria-label="'+x.name+': '+safe(amount(x.total))+', '+x.accounts.length+' '+(x.accounts.length===1?'bonus':'bonuses')+'" onclick="BT360.toggleHeroMonth('+x.index+')"><span class="bt367-month-track">'+(selected?'<span class="bt367-month-value">'+safe(amount(x.total))+'</span>':'')+fill+'</span><span class="bt367-month-letter">'+HERO_LETTERS[x.index]+'</span></button>';
 }).join('');
 let detail='';
 if(selectedHeroMonth!==null){
  const x=monthRows[selectedHeroMonth];
  const rowsHtml=x.accounts.length?x.accounts.map(e=>
   '<button type="button" class="bt367-month-row" onclick="BT360.openHeroBonus('+arg(e._taxParentId||e.id)+')">'
   +bankLogo(e.bank,true)+'<span class="bt360-grow"><b>'+safe(e.bank)+'</b><small>'+safe(e.accountName||e.accountNickname||e.productName||e.acct||(accountAudience(e)==='business'?'Business account':'Personal account'))+' · '+safe(date(e.bonusRecd))+'</small>'+(audience==='all'?kindTag(e):'')+'</span><strong>'+safe(amount(e.bonus))+'</strong></button>'
  ).join(''):'<p class="bt367-month-empty">No bonuses</p>';
  detail='<section class="bt367-month-detail" aria-label="'+x.name+' '+year+' collected bonuses"><div class="bt367-month-detail-head"><b>'+x.name+' '+year+' · '+amount(x.total)+' collected · '+x.accounts.length+' '+(x.accounts.length===1?'bonus':'bonuses')+'</b><button type="button" aria-label="Close month details" onclick="BT360.closeHeroMonth()">×</button></div><div class="bt367-month-list">'+rowsHtml+'</div></section>';
 }
 return '<section class="bt360-hero"><div class="bt360-hero-top"><div class="bt360-kicker">COLLECTED IN '+year+'</div><button id="bt-cloud-open" class="cloud-status-button bt360-backup" onclick="btOpenCloudBackup()"><span class="bt360-cloud-icon" aria-hidden="true">✓</span><span class="cloud-dashboard-summary">'+(window.BTICloudBackup?.isLocalOnly?.()?'iCloud backup':'Cloud backup')+'</span></button></div><strong class="bt360-hero-amount">'+amount(total)+'</strong><p>'+amount(progress)+' in progress · '+amount(awaiting)+' awaiting</p><div class="bt367-month-chart" role="group" aria-label="Collected by month in '+year+'">'+bars+'</div>'+detail+'</section>';
}
function attentionStatus(x){
 const code=String(x.stageCode||'IN_PROGRESS');
 const labels={ACTION_NEEDED:'Action needed',IN_PROGRESS:'In progress',REQUIREMENTS_MET:'Requirements met',AWAITING_BONUS:'Awaiting bonus',BONUS_RECEIVED:'Bonus received',HOLD_OPEN:'Hold open',READY_TO_CLOSE:'Ready to close',COOLDOWN:'Cooldown',ELIGIBLE:'Eligible again',ARCHIVED:'Archived'};
 return {code,label:labels[code]||String(x.stageLabel||'Review account')};
}
function attentionDateNote(x){
 const c=x?.dateContext||{};
 if(c.confirmed&&attentionDateDays(x)!==null){
  const prefix=['AWAITING_BONUS','REQUIREMENTS_MET'].includes(x.stageCode)?'Expected by ':x.stageCode==='HOLD_OPEN'?'Hold until ':['COOLDOWN','ELIGIBLE'].includes(x.stageCode)?'Review from ':'Due ';
  return prefix+date(c.date);
 }
 if(x.stageCode==='AWAITING_BONUS'||x.stageCode==='REQUIREMENTS_MET')return 'Payout date not confirmed';
 if(x.stageCode==='HOLD_OPEN'||x.stageCode==='BONUS_RECEIVED'||x.stageCode==='READY_TO_CLOSE')return 'Review close date';
 if(x.stageCode==='COOLDOWN'||x.stageCode==='ELIGIBLE')return 'Review eligibility date';
 if(x.stageCode==='IN_PROGRESS'||x.stageCode==='ACTION_NEEDED')return 'Requirement date not confirmed';
 return 'Date not confirmed';
}
function attentionChip(x){
 const stage=attentionStatus(x);
 const theme=['BONUS_RECEIVED','READY_TO_CLOSE','ELIGIBLE'].includes(stage.code)?'positive':['IN_PROGRESS','REQUIREMENTS_MET'].includes(stage.code)?'progress':'warning';
 return '<span class="bt360-chip bt3613-attention-stage '+theme+'">'+safe(stage.label)+'</span>';
}
function attentionUrgency(x){
 // Only real requirement/deposit deadlines qualify as urgent;
 // payout estimates and speculative churn dates are not deadlines.
 if(!['ACTION_NEEDED','IN_PROGRESS'].includes(x.stageCode))return null;
 return attentionDateDays(x);
}
function attentionDateDays(x){
 const c=x?.dateContext||{},dt=c.confirmed?String(c.date||''):'';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(dt)||!isRealDateString(dt))return null;
 const days=dB(td(),dt);return Number.isFinite(days)?days:null;
}
function dashboardQueueFor(x,entry){
 if(x.stageCode==='ELIGIBLE')return 'opportunities';
 if(x.stageCode==='COOLDOWN'&&entry?.closed){
  const info=eligibleInfo(entry),days=info?.verified?dB(td(),info.eligible):null;
  // The same canonical record is already rendered in Eligible soon.
  if(Number.isFinite(days)&&days>0&&days<=60)return 'upcoming';
 }
 const days=attentionDateDays(x);
 if(['AWAITING_BONUS','HOLD_OPEN'].includes(x.stageCode)&&days!==null&&days>0)return 'waiting';
 return 'needs';
}
function actionBadge(x,featured=false){
 const due=attentionUrgency(x);
 if(featured&&due!==null&&due<=30){
  const label=(due<0?'Overdue ': 'Due ')+date(x.dateContext.date);
  return '<span class="bt360-chip bt3719-due '+(due<=7?'urgent':'soon')+'">'+safe(label)+'</span>';
 }
 return attentionChip(x);
}
function attentionCardProgress(entry){
 if(!entry||entry.reqMet)return '';
 const tasks=Array.isArray(entry.checklist)?entry.checklist.filter(t=>t&&String(t.text||'').trim()):[];
 if(tasks.length){
  const done=tasks.filter(t=>t.done).length;
  const pct=Math.max(0,Math.min(100,Math.round(done/tasks.length*100)));
  return '<div class="bt3719-progress"><div class="bt3719-progress-label"><span>Recorded so far</span><b>'+done+' of '+tasks.length+' tasks</b></div>'
   +'<div class="bt360-track" role="progressbar" aria-label="Recorded checklist completion" aria-valuemin="0" aria-valuemax="'+tasks.length+'" aria-valuenow="'+done+'"><i style="width:'+pct+'%"></i></div></div>';
 }
 const financial=entry.financialRules?.requirements||[];
 const requirement=financial.find(r=>['direct-deposit','new-money'].includes(r?.kind)&&Number.isFinite(Number(r.amount))&&Number(r.amount)>0);
 if(!requirement)return '';
 // There is no account-linked payment evidence in the Tracker. Zero means
 // recorded in this Tracker, not that no deposit reached the bank.
 const target=Number(requirement.amount);
 return '<div class="bt3719-progress"><div class="bt3719-progress-label"><span>Recorded so far</span><b>$0 of '+safe(amount(target))+' · 0 recorded</b></div>'
  +'<div class="bt360-track" role="progressbar" aria-label="Recorded requirement deposits" aria-valuemin="0" aria-valuemax="'+target+'" aria-valuenow="0"><i style="width:0%"></i></div></div>';
}
function dashboardAttentionOrder(a,b){
 // Only display ordering changes. The canonical actions and their dates
 // come directly from smart-attention.js and remain untouched.
 const rank=x=>{
  const days=attentionUrgency(x);
  if(days!==null&&days<=14)return days<=0?-3:-2;
  if(x.stageCode==='ACTION_NEEDED')return -1;
  if(x.stageCode==='READY_TO_CLOSE')return 0;
  if(x.stageCode==='ELIGIBLE')return 1;
  if(x.stageCode==='AWAITING_BONUS')return 2;
  if(x.stageCode==='IN_PROGRESS')return 3;
  return 4;
 };
 const delta=rank(a)-rank(b);
 if(delta)return delta;
 const ad=attentionUrgency(a),bd=attentionUrgency(b);
 if(ad!==null||bd!==null)return (ad??999999)-(bd??999999);
 return (a.pri??99)-(b.pri??99)||(a.days??999999)-(b.days??999999);
}
function attentionAccountMeta(x,entry){
 const kind=entry?(accountAudience(entry)==='business'?'Business':'Personal'):'';
 const context=x?.dateContext?.confirmed&&x.dateContext.date&&x.stageCode==='ELIGIBLE'
  ?'Eligible since '+date(x.dateContext.date):attentionDateNote(x);
 return [kind,context].filter(Boolean).join(' · ');
}
let selectedAttentionId=null,accountListOpen=false;
function toggleAttention(id){
 if(!entries.some(e=>e.id===id))return;
 selectedAttentionId=selectedAttentionId===id?null:id;
 R();
 requestAnimationFrame(()=>{[...document.querySelectorAll('[data-attention-toggle]')].find(el=>el.dataset.attentionToggle===String(id))?.focus({preventScroll:true});});
}
function toggleAccountList(){
 accountListOpen=!accountListOpen;selectedStage='';search='';expanded=null;R();
 focusAccountSearch(accountListOpen);
}
function focusAccountSearch(open){
 requestAnimationFrame(()=>{
  const target=document.querySelector(open?'#tracker-search':'.bt3641-directory button');
  target?.focus({preventScroll:true});
  if(open)target?.scrollIntoView({block:'nearest',behavior:'auto'});
 });
}
function openAccountSearch(preserveStage=false){
 accountListOpen=true;if(!preserveStage)selectedStage='';search='';expanded=null;R();focusAccountSearch(true);
}
function closeAccountSearch(){
 accountListOpen=false;selectedStage='';search='';expanded=null;R();focusAccountSearch(false);
}
function tasks(rows){
 let suggestions=[];try{suggestions=window.getAttentionSuggestions?.()||[]}catch{}
 suggestions=suggestions.filter(x=>rows.some(e=>e.id===x.entryId&&scope(e))).slice().sort(dashboardAttentionOrder);
 const groups={needs:[],waiting:[],opportunities:[]};
 suggestions.forEach(x=>{const group=dashboardQueueFor(x,rows.find(e=>e.id===x.entryId));if(groups[group])groups[group].push(x)});
 groups.waiting.sort((a,b)=>(attentionDateDays(a)??999999)-(attentionDateDays(b)??999999)||String(a.bank).localeCompare(String(b.bank)));
 const titles={needs:'Needs you',waiting:'Waiting',opportunities:'Opportunities'};
 return Object.entries(groups).map(([key,list])=>{
 const count=list.length,noun=key==='needs'?(count===1?'task':'tasks'):(count===1?'account':'accounts');
 const heading='<div class="bt360-panel-title bt3719-section-title"><h3>'+titles[key]+'</h3><span class="bt360-count">'+count+' '+noun+'</span></div>';
 if(!count)return key==='needs'?'<section class="bt3719-needs bt3651-queue" data-queue="needs">'+heading+'<div class="bt360-empty">No immediate tasks for '+(audience==='all'?'your':audience)+' accounts.</div></section>':'';
 let html='<section class="bt3719-needs bt3651-queue" data-queue="'+key+'">'+heading+'<div class="bt360-list bt3719-attention-list bt3641-attention-stack">';
 list.forEach((x,index)=>{
  const item=rows.find(e=>e.id===x.entryId),selected=selectedAttentionId===x.entryId;
  const label=key==='waiting'?(x.stageCode==='HOLD_OPEN'?'Keep account open':'Waiting for bonus payment'):x.task?.title||x.stageLabel||'Review account';
  const title=safe(label),target='bt-attention-actions-'+key+'-'+index;
  const meta=selected&&attentionUrgency(x)!==null&&attentionUrgency(x)<=30?(accountAudience(item)==='business'?'Business':'Personal'):attentionAccountMeta(x,item);
  html+='<article class="bt3641-attention-item'+(selected?' bt360-featured is-selected':'')+'" data-attention-id="'+safe(x.entryId)+'">'
   +'<button type="button" class="bt360-list-row bt3641-attention-toggle" data-attention-toggle="'+safe(x.entryId)+'" aria-expanded="'+selected+'" aria-controls="'+target+'" onclick="BT360.toggleAttention('+arg(x.entryId)+')">'
   +bankLogo(x.bank,true)+'<span class="bt360-grow bt3729-needs-copy"><b class="bt3729-bank-name">'+safe(x.bank||'Bank')+'</b><small class="bt3729-task-title">'+title+'</small><small class="bt3729-task-meta">'+safe(meta)+'</small></span>'
   +'<span class="bt3719-task-right">'+(item?.bonus?'<strong>'+safe(amount(item.bonus))+'</strong>':'')+actionBadge(x,selected)+'</span></button>'
   +'<div id="'+target+'" class="bt3641-attention-body"'+(selected?'':' hidden')+'>';
  if(['ACTION_NEEDED','IN_PROGRESS'].includes(x.stageCode))html+=attentionCardProgress(item);
  if(x.task?.activityKind==='direct-deposit')html+='<button type="button" class="bt360-secondary bt3643-datapoints" onclick="openTaskDatapoints('+arg(x.entryId)+')">DD datapoints ›</button>';
  const primary=key==='opportunities'?'View offers':x.task?.cta||'Open task';
  const command=key==='opportunities'?'BT360.viewOffers('+arg(x.bank)+')':'runNextAccountAction('+arg(x.entryId)+')';
  html+='<div class="bt360-actions"><button type="button" class="bt360-primary" onclick="'+command+'">'+safe(primary)+'</button><button type="button" class="bt360-secondary" onclick="openAccountFromActionCenter('+arg(x.entryId)+')">Details</button></div></div></article>';
 });
 return html+'</div></section>';
 }).join('');
}
function eligibleSoon(rows){
 const next=rows.filter(e=>e.closed&&scope(e)).map(e=>({e,info:eligibleInfo(e)}))
  .filter(x=>x.info?.verified).map(x=>({...x,days:dB(td(),x.info.eligible)}))
  .filter(x=>x.days>0&&x.days<=60).sort((a,b)=>a.days-b.days);
 if(!next.length)return'';
 const heading='<div class="bt360-panel-title bt3719-section-title"><h3>Eligible soon</h3><span class="bt360-subtitle">next 60 days</span><button class="bt360-link" onclick="BT360.goArchive(\'waiting\')">Waiting to churn</button></div>';
 const list='<div class="bt360-list bt3719-soon-list">'+next.map(x=>
  '<button class="bt360-list-row" onclick="BT360.goArchive(\'waiting\')">'+bankLogo(x.e.bank,true)
  +'<span class="bt360-grow"><b>'+safe(x.e.bank)+'</b><small>'+safe(date(x.info.eligible))+' · '+safe(x.info.label)+'</small>'+(audience==='all'?kindTag(x.e):'')+'</span>'
  +'<span class="bt360-chip">'+x.days+' days</span></button>').join('')+'</div>';
 return '<section class="bt3719-soon">'+heading+list+'</section>';
}
function home(rows,year,metrics){if(!usageData&&!usageLoading&&window.BTBonusAuth?.connected?.())setTimeout(()=>refreshUsage(),0);return segments()+usageBanner()+hero(rows,year,metrics)+stages(rows)+tasks(rows)+eligibleSoon(rows)}
function compactRow(e){
 const s=stage(e),checks=Array.isArray(e.checklist)?e.checklist.filter(x=>x&&String(x.text||'').trim()):[];
 const done=checks.filter(x=>x.done).length;
 const next=checks.find(x=>!x.done)?.text||s.support||s.label;
 return '<div class="card bt366-compact-account" data-bt-entry-id="'+safe(e.id)+'"><button type="button" class="card-h bt366-compact-row" onclick="openAccountFromActionCenter('+arg(e.id)+')">'
  +bankLogo(e.bank,true)+'<span class="bt360-grow"><b>'+safe(e.bank)+'</b>'+(audience==='all'?kindTag(e):'')+'<small>'+safe(next)+'</small>'
  +(checks.length?'<span class="bt366-compact-track"><i style="width:'+Math.round(done/checks.length*100)+'%"></i></span><small>'+done+' of '+checks.length+' tasks</small>':'')
  +'</span><span class="bt366-compact-right"><strong>'+amount(e.bonus)+'</strong><em class="bt360-chip">'+safe(s.label)+'</em></span></button></div>';
}
function primaryAction(e){
 const code=stage(e).code,id=arg(e.id),checks=Array.isArray(e.checklist)?e.checklist:[];
 if(code==='IN_PROGRESS'||code==='ACTION_NEEDED'){
  if(checks.some(x=>x&&!x.done))return {label:'Open next task',command:'BT360.openNextTask('+id+')'};
  return {label:'Record deposit',command:'openReqMet('+id+')'};
 }
 if(code==='REQUIREMENTS_MET'||code==='AWAITING_BONUS')return {label:'Confirm received',command:'openRcv('+id+')'};
 if(code==='HOLD_OPEN'||code==='BONUS_RECEIVED')return {label:'View hold',command:'BT360.showHold()'};
 if(code==='READY_TO_CLOSE')return {label:'Mark account closed',command:'startCloseFlow('+id+',\'actual\')'};
 if(code==='COOLDOWN'||code==='ELIGIBLE')return {label:'View eligibility',command:'BT360.showEligibility()'};
 return {label:'Review account',command:'openBankActions('+id+')'};
}
function openNextTask(id){
 const current=entries.find(e=>e.id===id);
 if(!current)return;
 if(expanded!==id){expanded=id;tab='tracker';R()}
 requestAnimationFrame(()=>{
  revealAccountSection('requirements');
  const panel=[...document.querySelectorAll('.bt360-detail-card .bt360-panel')].find(x=>x.querySelector('h3')?.textContent==='Requirements');
  const next=[...(panel?.querySelectorAll('[role="checkbox"]')||[])].find(x=>x.getAttribute('aria-checked')==='false');
  (next||panel)?.scrollIntoView({block:'center',behavior:'smooth'});
  next?.focus({preventScroll:true});
 });
}
function showHold(){document.querySelector('[data-bt-hold]')?.scrollIntoView({behavior:'smooth',block:'center'})}
function showEligibility(){revealAccountSection('eligibility');document.querySelector('[data-bt-eligibility]')?.scrollIntoView({behavior:'smooth',block:'center'})}
function detailHead(e){
 const s=stage(e),enrolled=e.offerEnrollmentDate||e.couponEnrollmentDate||'';
 return '<div class="bt360-detail-header"><div class="bt360-detail-bar"><button onclick="BT360.back()" aria-label="Back to accounts">‹</button><span>'+safe(accountAudience(e)==='business'?'Business':'Personal')+' · '+safe(s.label)+'</span><button onclick="openBankActions('+arg(e.id)+')" aria-label="More account actions">•••</button></div><div class="bt360-detail-identity">'+bankLogo(e.bank,true)+'<div class="bt360-grow"><h2>'+safe(e.bank)+'</h2><p>'+safe(accountAudience(e)==='business'?'Business account':'Personal account')+'</p><small class="bt366-detail-id">ID '+safe(typeof getEntryDisplayId==='function'?getEntryDisplayId(e):e.id)+'</small></div><strong>'+amount(e.bonus)+'</strong></div></div>';
}
function setAccountSectionOpen(id,key,value){accountSections.set(String(id)+'|'+key,!!value)}
function revealAccountSection(key){
 const node=[...document.querySelectorAll('.bt3640-section')].find(n=>n.dataset.section===key);
 if(node){node.open=true;setAccountSectionOpen(node.dataset.entryId,key,true);}
 return node;
}
function accountSection(e,key,title,html,meta='',actions='',defaultOpen=false){
 const open=accountSections.get(String(e.id)+'|'+key)??defaultOpen;
 return '<details class="bt360-panel bt3640-section" data-entry-id="'+safe(e.id)+'" data-section="'+safe(key)+'"'+(open?' open':'')+' ontoggle="BT360.setAccountSectionOpen('+arg(e.id)+','+arg(key)+',this.open)"><summary class="bt360-panel-title"><h3>'+safe(title)+'</h3><span class="bt3640-section-meta">'+safe(meta)+'</span><span class="bt3640-chevron" aria-hidden="true">⌄</span></summary><div class="bt360-panel-body">'+(actions?'<div class="bt3640-section-actions">'+actions+'</div>':'')+html+'</div></details>';
}
function accountDates(e){
 return '<section class="bt3640-dates" aria-label="Recorded account dates"><div class="bt3640-key-title"><h3>Key dates</h3><button type="button" class="bt360-link" aria-label="Edit account dates" onclick="openEdit('+arg(e.id)+')">Edit</button></div><dl>'+[['opened','Opened'],['reqMet','Requirements met'],['bonusRecd','Bonus paid'],['closed','Closed']].map(([key,label])=>'<div><dt>'+label+'</dt><dd class="'+(archiveDateValid(e[key])?'':'is-missing')+'">'+safe(archiveDateValid(e[key])?date(e[key]):e[key]?'Needs review':'Not recorded')+'</dd></div>').join('')+'</dl></section>';
}
function cloudStatusText(state){
 if(['protected','success'].includes(state?.tone))return 'Cloud verified';
 if(state?.tone==='off')return 'Cloud off';
 if(state?.tone==='danger')return 'Backup needs attention';
 return 'Backup pending';
}
function accountSaveStatus(e){
 let saved=false;try{const stored=JSON.parse(localStorage.getItem(SK)||'[]').find(row=>row.id===e.id);saved=!!stored&&JSON.stringify(stored)===JSON.stringify(e);}catch{}
 if(window.BTICloudBackup?.isLocalOnly?.())return '<div class="bt3640-save-status" aria-label="Record storage status"><span data-local-save="'+saved+'">'+(saved?'Saved on device':'Local save needs review')+'</span></div>';
 const state=window.BTCloudBackup?.protection?.();
 return '<div class="bt3640-save-status" aria-label="Record storage status"><span data-local-save="'+saved+'">'+(saved?'Saved on device':'Local save needs review')+'</span><button type="button" onclick="btOpenCloudBackup()" data-account-cloud data-state="'+safe(state?.tone||'warning')+'" title="'+safe(state?.detail||'Cloud protection has not been verified.')+'">'+cloudStatusText(state)+'</button></div>';
}

/* The detail screen is a read-only projection of saved terms; it never records progress. */
function detailRequirementDate(e,r){
 return typeof btRequirementDeadlineContext==='function'?btRequirementDeadlineContext(e,r).date:'';
}
function requirementTitle(r){
 const kind=r?.kind||'',value=Number(r?.amount),money=Number.isFinite(value)&&value>0?amount(value):'';
 const raw=String(r?.text||'').trim();
 if(kind==='direct-deposit'){
  const total=/total|cumulat|aggregat|combin/i.test(raw)||(!r.count&&!r.recurrence);
  if(money)return total?'Direct deposits totaling '+money:'Direct deposits of '+money+(r.count?' · '+r.count+' required':'');
  return 'Qualifying direct deposits'+(r.count?' · '+r.count+' required':'');
 }
 if(kind==='new-money')return 'Deposit '+(money||'new money');
 if(kind==='balance-hold')return 'Maintain '+(money||'required balance');
 if(kind==='transactions')return 'Qualifying transactions'+(r.count?' · '+r.count+' required':'');
 if(kind==='enrollment')return 'Enrollment requirement';
 if(kind==='relationship')return 'Linked account requirement';
 return raw||'Complete offer requirement';
}
function requirementRows(e){
 const list=Array.isArray(e.financialRules?.requirements)?e.financialRules.requirements:[];
 const done=!!e.reqMet,legacy=!list.length?String(e.completeBonusText||'').trim():'';
 let rows=list.map((r,i)=>{
  const due=detailRequirementDate(e,r),value=Number(r.amount);
  const isMoney=['direct-deposit','new-money'].includes(r.kind)&&Number.isFinite(value)&&value>0;
  const heading=requirementTitle(r)+(due?' · due '+date(due):'');
  const stat=isMoney?(done?'Confirmed · transaction amounts not recorded':amount(0)+' of '+amount(value)+' · 0 recorded'):(done?'Requirement confirmed':due?'Due '+date(due):'Review saved offer terms');
  const meter=isMoney?'<div class="bt3611-req-track" role="progressbar" aria-label="Recorded requirement amount" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i style="width:0%"></i></div>':'';
  return '<div class="bt360-check bt3611-requirement '+(done?'done':'')+'"><button type="button" role="checkbox" aria-label="Confirm '+safe(requirementTitle(r))+'" aria-checked="'+done+'" onclick="openReqMet('+arg(e.id)+')">'+(done?'✓':'')+'</button><div class="bt3611-req-body"><b>'+safe(heading)+'</b>'+meter+'<small>'+safe(stat)+'</small><details class="bt3611-evidence"><summary>Requirement details</summary><p>'+safe(r.text||'')+'</p></details></div></div>';
 }).join('');
 if(!list.length&&(legacy||Number(e.reqDays)>0)){
  const due=typeof reqDeadline==='function'?reqDeadline(e):'';
  rows='<div class="bt360-check bt3611-requirement '+(done?'done':'')+'"><button role="checkbox" type="button" aria-label="Confirm saved requirements" aria-checked="'+done+'" onclick="openReqMet('+arg(e.id)+')">'+(done?'✓':'')+'</button><div class="bt3611-req-body"><b>Complete bonus requirements'+(due?' · due '+safe(date(due)):'')+'</b><small>'+safe(done?'Requirement confirmed':legacy||'Review the saved requirement deadline')+'</small></div></div>';
 }
 const tasks=Array.isArray(e.checklist)?e.checklist:[];
 rows+=tasks.map((c,i)=>'<div class="bt360-check bt3611-task '+(c.done?'done':'')+'"><button type="button" role="checkbox" aria-label="'+safe(c.text||'Task')+'" aria-checked="'+!!c.done+'" onclick="toggleCk('+arg(e.id)+','+i+')">'+(c.done?'✓':'')+'</button><button type="button" class="bt366-row-edit" onclick="runBankAction('+arg(e.id)+',\'checklist\')"><b>'+safe(c.text||'Task')+'</b><small>'+(c.done?'Done':'Checklist task')+'</small></button></div>').join('');
 return {html:rows,count:list.length+tasks.length+(!list.length&&(legacy||Number(e.reqDays)>0)?1:0)};
}
function timerShortTitle(t){
 const label=String(t.text||'Timer').toLowerCase();
 if(/90|ninety/.test(label)&&/bonus|tier/.test(label))return 'Day 90 bonus tier';
 if(/payout|bonus watch|bonus pending/.test(label))return 'Bonus pending';
 if(/requirement|qualifying|direct deposit|deposit deadline/.test(label))return 'Requirement due';
 if(/close|hold|balance/.test(label))return 'Close review';
 if(/funding|fund new money/.test(label))return 'Funding due';
 return String(t.text||'Reminder').trim().replace(/[:.].*$/,'').slice(0,65)||'Reminder';
}
function timerFriendlyDate(t,e){
 if(!t.date)return 'Date not set · saved reminder';
 if(t.startDate&&Number(t.daysRequired)>0){
  const basis=t.startDate===e?.opened?'opening':'saved start';
  return date(t.date)+' · '+Number(t.daysRequired)+' days after '+basis;
 }
 return date(t.date)+' · saved reminder';
}
function timerChip(t){
 if(t.done)return 'Done';
 if(!t.date)return 'Set date';
 const days=dB(td(),t.date);
 return days<0?'Overdue '+Math.abs(days)+'d':days===0?'Today':days+' days';
}
function timerSvg(kind){
 const paths={
  date:'<circle cx="12" cy="13" r="8"/><path d="M12 13V9m0 4 3 2M9 2h6M12 5V3"/>',
  payout:'<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16M9 14h6"/>',
  close:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
 };
 return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[kind]||paths.date)+'</svg>';
}
function payoutReminderRow(e){
 if(e.bonusRecd)return '';
 const payout=e.financialRules?.payout;
 const wording=String(payout?.text||e.payoutTimingText||'').trim();
 if(!wording)return '';
 const time=payout?.timing,amount=Number(time?.value);
 const units={'calendar-days':'days','business-days':'business days','months':'months','statement-cycles':'statement cycles'};
 const interval=time&&Number.isInteger(amount)&&amount>0?amount+' '+(units[time.unit]||String(time.unit||'days')):'';
 const subtitle=interval&&time?.basis==='reqmet'?'Expected within '+interval+' after requirements':wording.replace(/\s+/g,' ').slice(0,145);
 const base=time?.basis==='reqmet'?e.reqMet:time?.basis==='opened'?e.opened:'';
 const projected=base&&time?.unit==='calendar-days'&&Number.isInteger(amount)&&amount>0?addD(base,amount):'';
 const chip=projected?date(projected):base?'Timing in terms':'After qualification';
 return '<details class="bt3611-timer-row bt3613-payout" data-source="saved-payout"><summary><span class="bt3611-timer-icon" aria-hidden="true">'+timerSvg('payout')+'</span><span class="bt3611-timer-body"><b>Bonus pending</b><small>'+safe(subtitle)+'</small></span><span class="bt360-chip">'+safe(chip)+'</span></summary><div class="bt3611-timer-full">'+safe(wording)+'<p>From saved payout terms · not a recorded payment</p></div></details>';
}
// The enrolled structured rule is authoritative over a legacy day counter.
// If its clock is not calculable (business days, cycles, unknown start), do
// not substitute an apparently exact date from an unrelated legacy field.
function firstUnmetRequirementDate(e){
 if(e.reqMet||e.bonusRecd||e.closed)return '';
 return typeof reqDeadline==='function'?(reqDeadline(e)||''):'';
}
function requirementCountdown(e){
 const due=firstUnmetRequirementDate(e);
 if(!due)return '';
 const days=dB(td(),due);
 return days<0?'Overdue '+Math.abs(days)+' days':days===0?'Due today':days+' days left';
}
function derivedRequirementTimers(e,timers){
 if(e.reqMet||e.bonusRecd||e.closed)return '';
 const requirements=Array.isArray(e.financialRules?.requirements)?e.financialRules.requirements:[];
 const dueDates=new Set();
 return requirements.map(rule=>{
  const due=detailRequirementDate(e,rule);
  if(!due||dueDates.has(due))return '';
  // A saved manual reminder already represents this deadline: do not double-display it.
  if(timers.some(t=>String(t.date||'')===due&&/requirement|deposit|qualify|funding/i.test(String(t.text||''))))return '';
  dueDates.add(due);
  const heading=requirementTitle(rule);
  const elapsed=dB(td(),due),chip=elapsed<0?'Overdue '+Math.abs(elapsed)+'d':elapsed===0?'Today':elapsed+' days';
  return '<details class="bt3611-timer-row bt3621-derived" data-source="saved-requirement"><summary><span class="bt3611-timer-icon" aria-hidden="true">'+timerSvg('date')+'</span><span class="bt3611-timer-body"><b>Requirement due</b><small>'+safe(date(due))+' · from saved offer terms</small></span><span class="bt360-chip '+(elapsed<0?'warning':'')+'">'+safe(chip)+'</span></summary><div class="bt3611-timer-full">'+safe(heading)+(rule.text?'<p>'+safe(rule.text)+'</p>':'')+'<p>Derived from saved requirements · not an added reminder</p></div></details>';
 }).join('');
}
function timerRows(e){
 const timers=Array.isArray(e.customTimers)?e.customTimers:[];
 const rows=timers.map(t=>{
  const title=timerShortTitle(t),detail=String(t.text||'Timer'),kind=/payout|bonus/i.test(title)?'payout':/close|hold/i.test(title)?'close':'date';
  return '<details class="bt3611-timer-row"><summary><span class="bt3611-timer-icon" aria-hidden="true">'+timerSvg(kind)+'</span><span class="bt3611-timer-body"><b>'+safe(title)+'</b><small>'+safe(timerFriendlyDate(t,e))+'</small></span><span class="bt360-chip '+(!t.date?'warning':'')+'">'+safe(timerChip(t))+'</span></summary><div class="bt3611-timer-full">'+safe(detail)+(t.startDate&&t.daysRequired?'<p>Started '+safe(date(t.startDate))+' · '+Number(t.daysRequired)+' days · due '+safe(date(t.date))+'</p>':'')+'<button class="bt360-link" type="button" onclick="openTimerEditor('+arg(e.id)+','+arg(t.id)+')">Edit timer</button></div></details>';
 }).join('');
 const hasPayout=timers.some(t=>/payout|bonus watch|bonus pending/i.test(String(t.text||'')));
 return rows+derivedRequirementTimers(e,timers)+(!hasPayout?payoutReminderRow(e):'');
}
function waiverCondition(c){
 if(c?.operator&&Array.isArray(c.conditions))return c.conditions.map(waiverCondition).join(c.operator==='all'?' + ':' · ');
 const money=Number.isFinite(Number(c?.amount))&&c?.amount!==undefined?amount(c.amount):'';
 const raw=String(c?.text||'');
 if(c?.kind==='direct-deposit')return (money?money+'+ ':'')+( /electronic/i.test(raw)?'electronic deposits':'direct deposits');
 if(c?.kind==='balance-hold'){
  let type=/average/i.test(c.metric||'')?'avg balance':/beginning/i.test(c.metric||'')?'beginning-day balance':'daily balance';
  return (money||'Required')+' '+type;
 }
 if(c?.kind==='relationship')return 'linked checking';
 if(c?.kind==='transactions')return (c.count||'Qualifying')+' transactions';
 return raw.replace(/^(?:maintain|receive|keep|have|make)\s+/i,'').replace(/[.]$/,'')||'Other condition';
}
// Closed / cooling-down accounts display retained historical facts. The
// projection never writes a record or changes canonical churn/close decisions.
// Offer-specific evidence wins; last-known bank profiles are clearly labeled.
function lastSavedCooldownFeeRecord(entry){
 if(!entry?.closed)return {record:entry,historical:false,source:''};
 const sameFamily=(v)=>{
  if(!v||!v.bank)return false;
  if(typeof entryBankIdentity==='function'){
   try{return entryBankIdentity(v).key===entryBankIdentity(entry).key}catch{}
  }
  return String(v.bank).toLowerCase()===String(entry.bank).toLowerCase()
   &&String(v.accountType||'personal')===String(entry.accountType||'personal');
 };
 const buckets=typeof loadTermsArchive==='function'?loadTermsArchive():{};
 const saved=[];
 Object.values(buckets||{}).forEach(b=>{
  if(!b||typeof b!=='object')return;
  if(b.current)saved.push(b.current);
  if(Array.isArray(b.versions))saved.push(...b.versions);
 });
 const matching=saved.filter(sameFamily);
 const sameCycle=matching.filter(x=>!!String(entry.id||'').trim()
  &&String(x.entryId||x.id||'')===String(entry.id)
  &&(!entry.opened||!x.opened||String(x.opened)===String(entry.opened)))
  .sort((a,b)=>String(b.termsVerifiedAt||b.capturedAt||'').localeCompare(String(a.termsVerifiedAt||a.capturedAt||'')))[0]||null;
 const lastKnown=matching.sort((a,b)=>
  String(b.opened||'').localeCompare(String(a.opened||''))
  ||String(b.termsVerifiedAt||b.capturedAt||'').localeCompare(String(a.termsVerifiedAt||a.capturedAt||'')))[0]||null;
 const possibleProfile=typeof profileReqForBank==='function'?profileReqForBank(entry):null;
 const profile=sameFamily(possibleProfile)?possibleProfile:null;
 const record={...entry};
 const keys=['monthlyFeeAmountText','monthlyFeeYNText','monthlyFeeWaiverText','avoidMonthlyFeeText',
  'monthlyFeeNoMonthlyServiceFee','earlyTerminationFeeText','closeRuleText',
  'feeScheduleRaw','feeScheduleSourceUrl','promoSourceUrl'];
 let source='';
 for(const key of keys){
  const existing=record[key];
  if(existing!==undefined&&existing!==null&&existing!==''&&existing!==false)continue;
  for(const [candidate,label] of [[sameCycle,'saved enrolled terms'],[lastKnown,'last saved bank terms'],[profile,'last saved bank profile']]){
   if(!candidate)continue;
   const value=candidate[key];
   if(value===undefined||value===null||value===''||value===false)continue;
   record[key]=value;
   if(!source)source=label;
   break;
  }
 }
 // Structured rules must always come from this enrollment; a new offer's
 // closure or churn rules cannot be applied to a different cycle.
 if(!record.financialRules&&sameCycle?.financialRules)record.financialRules=sameCycle.financialRules;
 if(Number(record.earlyCloseFee||0)===0&&Number(sameCycle?.earlyCloseFee)>0)
  record.earlyCloseFee=Number(sameCycle.earlyCloseFee);
 return {record,historical:true,source:source||'saved account terms'};
}
function feeSnapshot(e){
 const historicalProjection=lastSavedCooldownFeeRecord(e);
 e=historicalProjection.record;
 // Read-only view of each enrolled record, including pre-financialRules imports.
 // A current bank product page is not evidence of a historical account's terms.
 const primary=e.financialRules?.accounts?.find(a=>a?.role==='primary')||null;
 const fee=primary?.fee,closure=e.financialRules?.closure||{};
 const original=(...items)=>items.map(x=>String(x??'').trim()).find(Boolean)||'';
 const monthlyRaw=original(e.monthlyFeeAmountText,e.analysis?.monthlyFeeAmountText,e.monthlyFeeYNText,e.analysis?.monthlyFeeYNText);
 const monthlyQuote=original(fee?.evidence?.quote,monthlyRaw);
 // Some legacy imports stored a required share/savings charge in the
 // generic monthly-fee field. Honor the explicit checking product amount.
 const checkingNoFee=!fee&&/\b(?:personal\s+)?checking\s*:\s*\$0\s*(?:monthly|maintenance|service)?/i.test(String(e.monthlyFeeYNText||''));
 let monthly='Not confirmed',monthlyKnown=false;
 if(checkingNoFee){monthly='$0';monthlyKnown=true}
 else if(typeof fee?.amount==='number'&&Number.isFinite(fee.amount)&&fee.amount>=0){
  monthly=amount(fee.amount);monthlyKnown=true;
 }else{
  // These are *fee amount* fields. Do not mistake a $500 waiver threshold
  // for a $500 account maintenance fee.
  const explicit=monthlyRaw.match(/^\s*\$\s*[\d,]+(?:\.\d{1,2})?\s*(?:(?:\/\s*month|monthly|per month).*)?$/i)
   ||monthlyRaw.match(/(?:monthly|maintenance|service)\s*(?:fee|charge)[\s:\-]*(?:of\s*)?(\$\s*[\d,]+(?:\.\d{1,2})?)/i)
   ||monthlyRaw.match(/^\s*(?:yes[,:\s]*)?(\$\s*[\d,]+(?:\.\d{1,2})?)\s*(?:monthly|fee|per month)/i);
  const found=explicit?.[1]||explicit?.[0]?.match(/\$\s*[\d,]+(?:\.\d{1,2})?/)?.[0];
  if(found){monthly=found.replace(/\s/g,'');monthlyKnown=true}
  else if(/^(?:no|none|fee[- ]?free|\$0(?:\.00)?|no monthly (?:service )?fee)$/i.test(monthlyRaw)
    ||(e.monthlyFeeNoMonthlyServiceFee===true&&/no (?:monthly|service|maintenance) fee|\$0/i.test(monthlyQuote))){
   monthly='$0';monthlyKnown=true;
  }
 }
 const waiver=fee?.waiver;
 let summary='',waiverSource='';
 if(waiver?.conditions?.length){
  summary=(waiver.operator==='all'?'ALL':waiver.operator==='any'?'ANY':'')+(waiver.operator==='all'||waiver.operator==='any'?': ':'')+waiver.conditions.map(waiverCondition).join(waiver.operator==='all'?' + ':' · ');
  waiverSource=original(waiver?.evidence?.quote);
 }else{
  const text=original(e.monthlyFeeWaiverText,e.analysis?.monthlyFeeWaiverText,e.avoidMonthlyFeeText,e.analysis?.avoidMonthlyFeeText);
  if(text){
   const operator=/\s+or\s+|\bany (?:one|of)\b/i.test(text)?'ANY':/\s+and\s+|\ball of\b/i.test(text)?'ALL':'';
   summary=(operator?operator+': ':'')+text.replace(/^(?:the\s+)?(?:monthly\s+)?(?:fee|maintenance fee)[^.]{0,35}?(?:waived|avoided)[^.]{0,25}?(?:if|with|when)\s+/i,'')
    .replace(/\s+or\s+/gi,' · ').replace(/\s+and\s+/gi,' + ').replace(/[.]$/,'');
   waiverSource=text;
  }
 }
 const companions=(Array.isArray(e.financialRules?.accounts)?e.financialRules.accounts:[])
  .filter(a=>a?.role!=='primary'&&a?.required===true).map(a=>{
   const f=a.fee,label=String(a.label||'Companion account');
   const charge=typeof f?.amount==='number'&&Number.isFinite(f.amount)?amount(f.amount):'Fee not confirmed';
   const minimum=typeof a.minimumBalance?.amount==='number'?' · membership minimum '+amount(a.minimumBalance.amount):'';
   const waivers=f?.waiver?.conditions?.length?' · waiver '+(f.waiver.operator==='all'?'ALL: ':f.waiver.operator==='any'?'ANY: ':'')+f.waiver.conditions.map(waiverCondition).join(f.waiver.operator==='all'?' + ':' · '):'';
   return label+': '+charge+minimum+waivers;
  });
 if(checkingNoFee&&!companions.length){
  const share=String(e.monthlyFeeYNText||'').match(/(?:required\s+)?(?:share\s+savings|savings)\s*:\s*(\$\s*[\d,.]+\s*\/\s*month)[^.;]*/i);
  if(share)companions.push('Share Savings: '+share[1].replace(/\s+/g,' ')+' · '+String(e.monthlyFeeWaiverText||'').trim());
 }
 const terms=[monthlyQuote,waiverSource,e.monthlyFeeWaiverText,e.avoidMonthlyFeeText,fee?.evidence?.quote,e.feeScheduleRaw]
  .map(v=>String(v||'').trim()).filter(Boolean);
 const quote=original(closure.feeEvidence?.quote,e.earlyTerminationFeeText,e.analysis?.earlyTerminationFeeText,
   e.closeRuleText,e.analysis?.closeRuleText);
 const savedCloseTerms=[closure.feeEvidence?.quote,e.earlyTerminationFeeText,e.analysis?.earlyTerminationFeeText,e.closeRuleText,e.analysis?.closeRuleText]
  .map(v=>String(v||'').trim()).filter(Boolean);
 let closeMain='Not confirmed',closeNote='No explicit early-close fee evidence',closeKnown=false,noEarlyCloseFee=false;
 const legacyFee=original(e.earlyTerminationFeeText,e.analysis?.earlyTerminationFeeText,e.closeRuleText,e.analysis?.closeRuleText);
 const isNoFee=v=>/no (?:early[- ]?)?(?:account[- ]?)?(?:clos(?:e|ing|ure)|terminat(?:ion|ing)) fee|(?:early[- ]?)?(?:closing|termination) fee\s*(?::|is)?\s*(?:none|\$0\b|waived)/i.test(v);
 const hasConditionalWindow=v=>/\b(?:after|only if|unless|until|before|within|first \d+)\b/i.test(v);
 const clawbackEvidence=[...savedCloseTerms,e.financialRules?.closure?.text,e.notes].filter(Boolean).join(' ');
 const explicitClawback=/\b(?:clawback|forfeit|forfeiture|deduct|repay|return)\b.{0,80}\bbonus\b|\bbonus\b.{0,80}\b(?:clawback|forfeit|deduct|repay|return)\b|\b\d+\s*(?:day|month|year)s?\s+clawback\b/i.test(clawbackEvidence);
 const positiveLegacy=Number(e.earlyCloseFee)>0&&Number.isFinite(Number(e.earlyCloseFee));
 const appearsBonusClawback=explicitClawback&&positiveLegacy&&Number(e.earlyCloseFee)===Number(e.bonus)
  &&!/(?:early[- ]?|account[- ]?)?(?:clos(?:ing|ure)|terminat(?:ion|ing))\s+fee\s*(?:is|of|:)?\s*\$|(?:clos(?:ing|ure))\s+\$\s*[\d,]+\s+fee/i.test(savedCloseTerms.join(' '));
 const typedFee=typeof closure.earlyCloseFee==='number'&&Number.isFinite(closure.earlyCloseFee)?closure.earlyCloseFee:null;
 if(typedFee!==null&&typedFee>0&&closure.feeEvidence?.quote){
  closeMain=amount(typedFee)+' early-close fee';closeNote='Saved structured fee evidence';closeKnown=true;
 }else if(typedFee===0&&isNoFee(closure.feeEvidence?.quote||'')&&!hasConditionalWindow(closure.feeEvidence.quote)){
  closeMain='No early-closing fee';closeNote='Confirmed in saved fee schedule';closeKnown=true;noEarlyCloseFee=true;
 }else if(appearsBonusClawback){
  closeMain='Not separately stated';closeNote='Saved bonus clawback: up to '+amount(Number(e.earlyCloseFee))+' · not a bank service fee';closeKnown=false;
 }else if(positiveLegacy){
  closeMain=amount(Number(e.earlyCloseFee))+' early-close fee';
  closeNote=legacyFee?'From saved legacy terms · confirm applicable window':'Saved amount · fee window not verified';
  closeKnown=!!legacyFee;
 }else if(legacyFee){
  // Old imports may have exact fee text without a structured rule. Accept
  // only amounts explicitly tied to closing, never promotion dollar amounts.
  const match=legacyFee.match(/(?:early[- ]?|account[- ]?)?(?:clos(?:ing|ure)|terminat(?:ion|ing))\s+fee\s*(?:is|of|:)?\s*(\$\s*[\d,]+(?:\.\d{1,2})?)/i)
   ||legacyFee.match(/(?:early[- ]?|account[- ]?)?(?:clos(?:e|ing|ure)|terminat(?:ion|ing))[^.;\n]{0,45}?(\$\s*[\d,]+(?:\.\d{1,2})?)\s*fee/i)
   ||legacyFee.match(/(\$\s*[\d,]+(?:\.\d{1,2})?)\s*(?:early[- ]?|account[- ]?)?(?:clos(?:ing|ure)|terminat(?:ion|ing))\s+fee/i)
   ||legacyFee.match(/(\$\s*[\d,]+(?:\.\d{1,2})?)\s*(?:early\s+)?fee\s+if\s+(?:the\s+)?(?:account\s+)?clos(?:ed|ing)/i);
  if(match){closeMain=match[1].replace(/\s/g,'')+' early-close fee';closeNote='From saved legacy fee terms · review fee window';closeKnown=true}
  else if(isNoFee(legacyFee)&&!hasConditionalWindow(legacyFee)){closeMain='No early-closing fee';closeNote='Confirmed by saved no-fee terms';closeKnown=true;noEarlyCloseFee=true}
  else if(isNoFee(legacyFee)){closeNote='Saved no-fee wording is conditional · review closing date'}
 }
 if(explicitClawback&&!appearsBonusClawback)closeNote+=' · Bonus clawback is separate';
 if(historicalProjection.historical){
  if(monthly==='Not confirmed')monthly='Not listed in saved terms';
  if(closeMain==='Not confirmed')closeMain='Not listed in saved terms';
  if(closeNote==='No explicit early-close fee evidence')closeNote='Historical offer · no separate charge recorded';
 }
 const closeTerms=[...new Set(savedCloseTerms)].join('\n\n');
 const source=String(e.feeScheduleSourceUrl||'').trim();
 return {monthly,monthlyKnown,companions,summary:summary||'Waiver conditions not confirmed',terms:[...new Set(terms)].join('\n\n'),
  closeMain,closeNote,closeKnown,noEarlyCloseFee,closeTerms,historical:historicalProjection.historical,historicalSource:historicalProjection.source,source:/^https:\/\/[^<>"'\s]+$/i.test(source)?source:'',explicitClawback};
}
function feeDetail(e){
 const x=feeSnapshot(e);
 const monthlyExtra=x.monthly==='$0'?'No monthly maintenance fee in saved terms':(x.summary==='Waiver conditions not confirmed'?(x.historical?'No waiver conditions recorded':x.summary):'Waived if '+x.summary);
 return '<div class="bt3613-fees">'
  +(x.historical?'<p class="bt3617-historical-note">Last saved · '+safe(x.historicalSource)+' · for historical reference</p>':'')
  +'<div class="bt3613-fee-line"><span>Monthly fee</span><div><b class="'+(x.monthlyKnown||x.historical?'':'bt3611-amber')+'">'+safe(x.monthly)+'</b><small class="bt3613-waiver-clamp">'+safe(monthlyExtra)+'</small>'
  +(x.companions.length?'<small class="bt3614-companion">Required companion: '+safe(x.companions.join(' | '))+'</small>':'')
  +(x.terms?'<details class="bt3611-full-terms"><summary>View saved fee terms</summary><p>'+safe(x.terms)+'</p></details>':'')
  +(x.source?'<a class="bt360-link bt3614-fee-source" href="'+safe(x.source)+'" target="_blank" rel="noopener noreferrer">Fee schedule ↗</a>':'')
  +'</div></div>'
  +'<div class="bt3613-fee-line"><span>Early close fee</span><div><b class="'+(x.closeKnown||x.historical?'':'bt3611-amber')+'">'+safe(x.closeMain)+'</b><small>'+safe(x.closeNote)+'</small>'
  +(x.closeTerms?'<details class="bt3611-full-terms"><summary>View saved close terms</summary><p>'+safe(x.closeTerms)+'</p></details>':'')
  +'</div></div></div>';
}
function closeDateInfo(e){
 const close=e.financialRules?.closure,source=String(close?.evidence?.quote||e.closeRuleText||e.earlyTerminationFeeText||'').trim();
 const basis=String(close?.basis||e.closeRuleBasis||'').toLowerCase();
 const ruleDays=Number(close?.minHoldDays??e.minHoldDays??0);
 if(close?.restrictionType==='manual-review'||e.closeRestrictionType==='manual-review')return {value:'Close rule unverified',note:'Check early-close restrictions',action:true};
 if(!source)return {value:'Close terms missing',note:'No supported hold or fee rule saved',action:true};
 if(basis==='bonus'&&!e.bonusRecd)return {value:'After bonus posts',note:ruleDays?ruleDays+'-day hold starts at payout':'Close timing starts at payout',action:false};
 if(basis==='reqmet'&&!e.reqMet)return {value:'After requirements',note:ruleDays?ruleDays+'-day hold starts after qualification':'Close timing starts after qualification',action:false};
 const computed=typeof safeCloseDate==='function'?safeCloseDate(e):'';
 if(!computed)return {value:'Date not calculable',note:'Review the saved close rule',action:true};
 const basisLabel=basis==='bonus'?'payout':basis==='reqmet'?'requirements':basis==='opened'?'opening':'saved rule';
 const delay=ruleDays>0?ruleDays+' days from '+basisLabel:'From saved close restrictions';
 const feeKnown=close?.earlyCloseFee!==null&&close?.earlyCloseFee!==undefined&&!!close?.feeEvidence?.quote;
 return {value:date(computed),note:delay+(feeKnown?' · fee terms saved':' · confirm fees'),action:!feeKnown&&!Number(e.earlyCloseFee)};
}
function savedCooldownChurnExcerpt(e){
 const current=String(e?.churnRuleText||e?.eligibilityEvidenceText||e?.eligibilityText||e?.churnReason||'').trim();
 let text=current;
 if(!text&&typeof profileReqForBank==='function'){
  try{
   const profile=profileReqForBank(e);
   text=String(profile?.churnRuleText||profile?.eligibilityEvidenceText||profile?.eligibilityText||'').trim();
  }catch{}
 }
 text=text.replace(/\s+/g,' ');
 return text.length>155?text.slice(0,152)+'…':text;
}
function eligibilityDateInfo(e,info){
 const gate=window.BTEligibilityGate;
 let validation=null;try{validation=gate?.validate?.(e)}catch{}
 if(validation?.ok&&validation.decision==='nonrepeatable')return {value:'Not repeatable',note:'Offer permits one bonus only',action:false};
 if(info?.verified&&info.eligible){
  const controlling=info.controlling;
  const p=controlling?.period?gate.periodLabel(controlling.period):'Saved eligibility rules';
  const basis=controlling?.basis?gate.anchorLabel(controlling.basis):'eligibility start';
  return {value:date(info.eligible),note:p+' from '+basis+' + 2 days',action:false};
 }
 if(info?.eligible)return {value:date(info.eligible),note:'Last saved churn estimate · not verified for a new bonus',action:false};
 if(validation?.ok&&validation.decision==='repeatable'){
  const rules=validation.rules||[];
  const pending=rules.find(r=>!r.anchorDate&&['account-closed','account-ownership-ended','bonus-received'].includes(r.basis));
  if(pending){
   const anchor=pending.basis==='bonus-received'?'bonus payment':'account closure';
   return {value:'After '+anchor,note:gate.periodLabel(pending.period)+' after '+anchor+' + 2 days',action:false};
  }
  return {value:'Date not calculable',note:'Eligibility clock needs a start date',action:true};
 }
 if(e?.closed)return {value:'No confirmed date',note:savedCooldownChurnExcerpt(e)||'Last saved offer · eligibility date not recorded',action:false};
 return {value:'Eligibility rule missing',note:'No verified repeatability restriction',action:true};
}
function dateActionRow(e,label,info,kind){
 const x=info||{value:'Date unavailable',note:'Rule needs verification',action:true};
 return '<div class="bt3613-date-row"><span>'+safe(label)+'</span><div><b>'+safe(x.value)+'</b><small>'+safe(x.note)+'</small>'+(x.action?'<button type="button" class="bt3611-set-rule" onclick="BT360.openRuleEditor('+arg(e.id)+','+arg(kind)+')">Set rule</button>':'')+'</div></div>';
}
function openRuleEditor(id,kind){
 if(typeof openEdit!=='function')return;
 openEdit(id);
 requestAnimationFrame(()=>{
  const root=document.querySelector('.modal');if(!root)return;
  const selector=kind==='close'?'[oninput*="closeFeeCountdownDays"], [name*="close"], #close-rule-basis':'#elig-clock, #future_churn_rule, .eligibility-tools';
  const target=root.querySelector(selector)||root.querySelector('input,select');
  target?.scrollIntoView({block:'center'});target?.focus?.({preventScroll:true});
 });
}
function openActivity(id){
 const e=entries.find(x=>x.id===id);if(!e)return;
 document.querySelector('.bt3611-activity-overlay')?.remove();
 const html=[typeof renderEntryHistory==='function'?renderEntryHistory(e):'',typeof renderAnalyzerHistory==='function'?renderAnalyzerHistory(e):'',typeof renderOfferHistory==='function'?renderOfferHistory(e):'',typeof renderAnalyzedTermsCard==='function'?renderAnalyzedTermsCard(e):''].filter(Boolean).join('');
 const overlay=document.createElement('div');
 overlay.className='bt3611-activity-overlay';
 overlay.innerHTML='<section class="bt3611-activity-sheet" role="dialog" aria-modal="true" aria-label="Activity"><header><h2>Activity</h2><button type="button" onclick="BT360.closeActivity()" aria-label="Close activity">×</button></header><div class="bt3611-activity-body">'+(html||'<p class="bt360-muted">No recorded activity yet.</p>')+'</div></section>';
 overlay.addEventListener('click',event=>{if(event.target===overlay)closeActivity()});
 document.body.appendChild(overlay);overlay.querySelector('button')?.focus();
}
function closeActivity(){document.querySelector('.bt3611-activity-overlay')?.remove()}
function setReadyExtrasOpen(id,value){readyExtrasState.set(id,!!value)}

// Closing checklist is a read-only projection of the same enrolled fee evidence
// used by Fees & waivers. A hold countdown is never proof that a positive or
// conditional early-close charge has expired.
// A posted bonus alone cannot establish that it is safe from repayment.
// Only saved closure evidence matching the documented restriction can do so.
function retentionEvidenceCleared(e,holdMet){
 if(!e?.bonusRecd)return false;
 const closure=e.financialRules?.closure||{};
 const type=String(closure.restrictionType||e.closeRestrictionType||'');
 const evidence=String(closure.evidence?.quote||e.closeRuleSourceSentence||e.closeRuleText||'').trim();
 if(!evidence)return false;
 if(type==='payout-only')return /\b(?:until|through|after|once|when|before)\b.{0,90}\bbonus\b/i.test(evidence)
  &&!/\b(?:clawback|repay|repayment|forfeit|forfeiture)\b/i.test(evidence);
 if(type==='minimum-open')return !!holdMet&&/\b(?:keep|remain|open|minimum|hold|maintain)\b/i.test(evidence);
 if(type==='none')return /\b(?:no|without|not subject to)\b.{0,60}\b(?:clawback|repayment|forfeiture)\b/i.test(evidence);
 return false;
}
function closeCheckPresentation(e){
 const financial=e.financialRules?.closure;
 const hold=typeof safeCloseDate==='function'?safeCloseDate(e):'';
 const remaining=hold?dB(td(),hold):null;
 const hasHold=Number(e.minHoldDays)>0;
 const holdMet=hasHold&&Number.isFinite(remaining)&&remaining<=0;
 const closure=e.financialRules?.closure;
 const paidPayoutOnly=!hasHold&&!!e.bonusRecd&&closure?.restrictionType==='payout-only'
  &&closure?.minHoldDays===0&&/\b(?:until|through|after|once|when|before)\b.{0,90}\bbonus\b/i.test(String(closure?.evidence?.quote||''))
  &&/\bbonus\b/i.test(String(e.closeRuleText||closure?.text||''));
 const fee=feeSnapshot(e);
 const zeroFeeConfirmed=fee.closeKnown&&fee.noEarlyCloseFee;
 const retentionSaved=retentionEvidenceCleared(e,holdMet);
 return [
  {ok:holdMet||paidPayoutOnly,label:'Minimum hold met',detail:hasHold?(holdMet?'Open '+Number(e.minHoldDays)+' days · cleared '+date(hold):'Hold until '+(hold?date(hold):'Needs review')):paidPayoutOnly?'No separate fixed hold · payout-only condition satisfied':'No documented minimum hold · Needs review'},
  {ok:zeroFeeConfirmed,label:'Early close fee window cleared',detail:zeroFeeConfirmed?'Explicit no-fee terms saved':fee.closeKnown?fee.closeMain+' · verify the applicable fee window before closing':fee.closeNote+' · Needs review'},
  {ok:retentionSaved,label:'Bonus kept after closing',detail:retentionSaved?'Bonus received · saved restriction evidence supports closing':'Confirm bonus repayment restrictions in saved terms'},
  {ok:false,label:'Close with $0 balance',detail:'Confirm account balance with the bank before closing'}
 ];
}
// Document presence and saved-rule validation describe different kinds of evidence.
// Neither proves that a public offer is current or that this account qualifies.
function sourceEvidenceStatus(e){
 const present=v=>typeof v==='string'&&!!v.trim();
 const linked=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password}catch{return false}};
 const promotion=present(e.tcSourceRaw),fees=present(e.feeScheduleRaw);
 const promotionLinked=linked(e.promoSourceUrl),feesLinked=linked(e.feeScheduleSourceUrl);
 const checked=String(e.termsVerifiedAt||'');
 const validDate=archiveDateValid(checked)&&checked<=td();
 let validation;try{validation=window.BTFinancialRules?.validate?.(e)}catch{}
 const rules=validation?.ok&&validation.mode==='structured'?'matched':validation?.mode==='invalid'?'review':'unavailable';
 const complete=promotion&&fees&&promotionLinked&&feesLinked&&validDate;
 const label=!promotion?'Original terms missing':!complete?'Evidence incomplete':rules==='review'?'Rules need review':'Sources saved';
 return {label,promotion,fees,complete,rules,rows:[
  ['Promotion',promotion?(promotionLinked?'Text & link saved':'Text saved · link missing'):present(e.analysis?.rawText)?'Review text only':'Not saved'],
  ['Fee schedule',fees?(feesLinked?'Text & link saved':'Text saved · link missing'):'Not saved'],
  ['Recorded check',validDate?date(checked):checked?'Date needs review':'Not recorded'],
  ['Saved rules',rules==='matched'?'Match saved quotations':rules==='review'?'Need review':'No validated rule package']
 ]};
}
function sourceEvidencePanel(e){
 const status=sourceEvidenceStatus(e),raw=String(e.tcSourceRaw||''),review=String(e.analysis?.rawText||''),fees=String(e.feeScheduleRaw||'');
 const text=(label,value)=>value.trim()?'<details class="bt3640-source-text"><summary>'+label+'</summary><pre>'+safe(value)+'</pre></details>':'';
 return accountSection(e,'terms','Saved terms','<dl class="bt3653-evidence" aria-label="Saved source evidence">'+status.rows.map(([label,value])=>'<div><dt>'+safe(label)+'</dt><dd>'+safe(value)+'</dd></div>').join('')+'</dl><p class="bt360-muted">Saved evidence describes this record. Current offer availability and personal eligibility require a separate check.</p>'+text('Read original promotion',raw)+(!raw.trim()?text('Read saved review text',review):'')+text('Read fee schedule',fees)+'<button type="button" class="bt360-source bt3613-source" onclick="BT360.showTerms('+arg(e.bank)+')">View saved sources in Archive ›</button>',status.label);
}
function detailPanels(e){
 const code=stage(e).code,ready=code==='READY_TO_CLOSE',closed=!!e.closed;
 const at=closed?4:ready?4:code==='HOLD_OPEN'||code==='BONUS_RECEIVED'?3:code==='REQUIREMENTS_MET'||code==='AWAITING_BONUS'?2:1;
 const labels=['Opened','Tasks','Payout','Hold','Close'];
 const due=firstUnmetRequirementDate(e);
 const stageSummary=ready?'Review closing checks before closing':due?'Requirements due '+date(due):code==='IN_PROGRESS'?'Complete offer requirements':stage(e).label;
 const stageChip=ready?'Ready to close':due?requirementCountdown(e):stage(e).label;
 let h='<div class="bt360-steps '+(ready?'bt3611-ready':'')+'" aria-label="Account lifecycle"><div class="bt3611-step-bars">'+labels.map((name,i)=>'<span class="'+(i<at?'done ':'')+(at===i?'current':'')+'"'+(at===i?' aria-current="step"':'')+'>'+name+'</span>').join('')+'</div><div class="bt3611-stage-summary"><b>'+safe(stageSummary)+'</b><em class="bt360-chip '+(ready?'positive':'warning')+'">'+safe(stageChip)+'</em></div></div>';
 if(!ready)h+=accountDates(e);
 const hasExtraWork=Array.isArray(e.checklist)&&e.checklist.length>0;
 const savedWorkStart=h.length;
 if(!closed&&(!ready||hasExtraWork)){
  const req=requirementRows(e);
  h+=accountSection(e,'requirements','Requirements',(!req.count?'<p class="bt360-muted">No requirements saved.</p>':req.html)+'<div class="bt360-panel-actions"><button type="button" class="bt360-link" onclick="runBankAction('+arg(e.id)+',\'checklist\')">+ Add task</button></div>',e.reqMet?'Confirmed':req.count+' saved',(Array.isArray(e.financialRules?.requirements)&&e.financialRules.requirements.length>0||!!String(e.completeBonusText||'').trim()||Number(e.reqDays)>0)?'<button type="button" class="bt360-link bt3621-confirm-all" onclick="openReqMet('+arg(e.id)+')">'+(e.reqMet?'Review confirmation':hasExtraWork?'Confirm requirements':'Confirm all')+'</button>':'',true);
  // Mockup order: Requirements, Fees & waivers, Timers. Read-only panel;
  // no fee, timer, task or lifecycle handler is replaced.
  if(!ready)h+=accountSection(e,'fees','Fees & waivers',feeDetail(e),'Review saved fees');
  const rows=timerRows(e);
  h+=accountSection(e,'timers','Timers',rows||'<p class="bt360-muted">No saved deadlines.</p>','Dates & reminders','<button type="button" class="bt360-link bt3613-add-timer" onclick="runBankAction('+arg(e.id)+',\'timer\')">+ Add</button>');
 }
 const readyWork=ready?h.slice(savedWorkStart):'';
 if(ready)h=h.slice(0,savedWorkStart);
 // Closed records retain saved historical fee presentation, while open
 // in-progress accounts already showed their fee card before Timers.
 if(closed&&!ready)h+=accountSection(e,'fees','Fees & waivers',feeDetail(e),'Saved fees');
 if(!closed&&(e.dataPoint||e.completeBonusText||e.notes))h+='<details class="bt366-offer-notes"><summary>Offer notes</summary><p>'+safe([e.dataPoint,e.completeBonusText,e.notes].filter(Boolean).join('\n\n'))+'</p></details>';
 if(ready||code==='HOLD_OPEN'||code==='BONUS_RECEIVED'){
  const items=closeCheckPresentation(e);
  h+='<div data-bt-hold>'+panel(ready?'Close checks':'Hold & close checks',items.map(item=>'<div class="bt360-check '+(item.ok?'done':'unknown')+'"><span class="bt3611-check-icon">'+(item.ok?'✓':'')+'</span><div><b>'+safe(item.label)+'</b><small>'+safe(item.detail)+'</small></div></div>').join(''))+'</div>';
 }
 if(ready)h+=accountDates(e)+accountSection(e,'fees','Fees & waivers',feeDetail(e),'Review saved fees');
 if(ready){
  const phoneRow=getPhoneBook().find(row=>{try{return bankIdentity(row.bank).family===bankIdentity(e.bank).family}catch{return row.bank===e.bank}});
  const phone=phoneRow?.[accountAudience(e)]||'';
  h+='<section class="bt3611-call"><b>CALL TO CLOSE</b><p>'+safe(accountAudience(e)==='business'?'Business banking line':'Personal banking line')+' · saved for '+safe(e.bank)+'</p>'+(phone?'<a class="bt360-primary bt360-call" href="tel:'+safe(phone.replace(/[^+\d]/g,''))+'">☎ '+safe(phone)+'</a>':'<button type="button" class="bt360-primary" onclick="BT360.openPhoneForClose('+arg(e.bank)+','+arg(accountAudience(e))+')">Add bank phone number</button>')+'<small>Shown only when an account is ready to close.</small></section>';
 }
 const eligibility=eligibleInfo(e);
 const title=ready?'After closing':closed?'Eligibility':'Key dates';
 h+='<div data-bt-eligibility>'+accountSection(e,'eligibility',title==='Key dates'?'Closing & eligibility':title,'<div class="bt3613-dates">'+(!closed&&!ready?dateActionRow(e,'Safe to close',closeDateInfo(e),'close'):'')+dateActionRow(e,'Eligible again',eligibilityDateInfo(e,eligibility),'eligibility')+(eligibility?.more?.length?eligibility.more.filter(r=>r.id!==eligibility.controlling?.id&&r.eligibleDate).map(r=>infoRow('Also checked',date(r.eligibleDate),r.label||'Saved eligibility rule')).join(''):'')+'</div>','Rules & dates')+'</div>';
 h+=sourceEvidencePanel(e);
 const issues=archiveHistoryIssues(e);
 h+=accountSection(e,'history','History',(issues.length?'<ul class="bt3640-gaps">'+issues.map(text=>'<li>'+safe(text)+'</li>').join('')+'</ul><div class="bt360-panel-actions"><button type="button" class="bt360-link" onclick="openEdit('+arg(e.id)+')">Update account</button><button type="button" class="bt360-link" onclick="BTHistoryRepair.open()">Find saved evidence</button></div>':'<p class="bt360-muted">Core records present.</p>')+'<button type="button" class="bt360-link" onclick="BT360.openActivity('+arg(e.id)+')">View activity</button>',issues.length?issues.length+' gaps':'Core records present');
 if(ready&&readyWork)h+='<details class="bt3611-ready-extras"'+(readyExtrasState.get(e.id)?' open':'')+'><summary onclick="BT360.setReadyExtrasOpen('+arg(e.id)+',!this.parentElement.open)">Review saved tasks, fees and timers</summary>'+readyWork+'</details>';
 return h+accountSaveStatus(e);
}
function detailFooter(e){
 const primary=primaryAction(e);
 return '<div class="bt360-detail-footer'+(stage(e).code==='READY_TO_CLOSE'?' bt3611-ready-footer':'')+'" role="group" aria-label="Account actions"><button type="button" onclick="'+(stage(e).code==='READY_TO_CLOSE'?'BT360.back()':'btOpenBonusAI('+arg(e.id)+')')+'">'+(stage(e).code==='READY_TO_CLOSE'?'Keep open':'Ask AI')+'</button><button type="button" class="bt360-primary" aria-label="'+safe(primary.label+' for '+e.bank)+'" onclick="'+primary.command+'">'+safe(primary.label)+'</button></div>';
}
function showTerms(bank){archivePane='waiting';storageSearch=String(bank||'');expanded=null;tab='archive';R()}
function back(){expanded=null;window.bt360ArchiveDetailId=null;R();const el=document.querySelector('.scroll');if(el)el.scrollTop=0}
function goArchive(pane){archivePane='waiting';expanded=null;tab='archive';R()}
function archiveCountdown(info){
 if(!info?.eligible)return null;
 const remaining=dB(td(),info.eligible);
 if(!Number.isFinite(remaining))return null;
 const verified=info.verified===true;
 return {days:Math.max(0,remaining),verified,caption:remaining<=0?(verified?'Eligible now':'Estimate passed'):verified?'days left':'days · estimate'};
}
function archive(rows){
 if(window.bt360ArchiveDetailId&&expanded){return window.rTracker(rows,true)}
 let h=segments()+'<div class="bt360-page-copy">Churn history & saved terms</div><input class="sinput" type="search" id="terms-search" aria-label="Search archive banks and terms" placeholder="Search banks, dates or saved terms…" value="'+safe(storageSearch||'')+'" oninput="updateViewSearch(\'terms\',this.value,this.selectionStart)">';
 const query=String(storageSearch||'').trim().toLowerCase();
 const savedBuckets=termsDisplayBuckets();
 const savedText=e=>{const b=savedBuckets.find(x=>entryBankIdentity(x.current||x).key===entryBankIdentity(e).key);return b?[b.current,...(b.versions||[])].map(x=>[x.tcSourceRaw,x.feeScheduleRaw,x.completeBonusText,x.opened].join(' ')).join(' '):'';};
 const closed=rows.filter(e=>e.closed&&scope(e)&&(!query||[e.bank,e.opened,e.closed,e.tcSourceRaw,e.analyzedTC,savedText(e)].join(' ').toLowerCase().includes(query)));
 const indexed=closed.map(e=>({e,info:eligibleInfo(e)}));
 const ready=indexed.filter(x=>x.info?.verified&&dB(td(),x.info.eligible)<=0);
 const soon=indexed.filter(x=>x.info?.verified&&dB(td(),x.info.eligible)>0&&dB(td(),x.info.eligible)<=60);
 const cooling=indexed.filter(x=>!ready.includes(x)&&!soon.includes(x)).sort((a,b)=>(a.info?.eligible||'9999').localeCompare(b.info?.eligible||'9999'));
 h+='<div class="bt360-archive-stats"><div><b>'+ready.length+'</b><small>Eligible now</small></div><div><b>'+soon.length+'</b><small>Within 60 days</small></div><div><b>'+cooling.length+'</b><small>Cooling down</small></div></div>';
 h+='<p class="bt3727-archive-note">Unverified dates are estimates, not confirmed eligibility. Open a bank card for its dates, saved T&C and cycle history.</p>';
 const row=(x,offer)=>{
  const historic='Last saved '+(Number(x.e.bonus)>0?amount(x.e.bonus)+' bonus':'bank offer')+
   (x.e.opened?' · opened '+date(x.e.opened):'')+' · '+(savedCooldownChurnExcerpt(x.e)||'eligibility date not recorded');
  const label=x.info?date(x.info.eligible)+' · '+x.info.label:historic;
  const count=archiveCountdown(x.info);
  const action=count
   ?'<div class="bt3727-archive-actions"><button type="button" class="bt3727-countdown '+(count.verified?'is-verified':'is-estimated')+'" onclick="BT360.openArchived('+arg(x.e.id)+')" aria-label="'+safe('Review '+x.e.bank+' eligibility: '+count.days+' days; '+(count.verified?'verified saved rule':'unverified estimate'))+'"><strong>'+count.days+'</strong><small>'+safe(count.caption)+'</small></button>'+(offer?'<button type="button" class="bt3727-view-offers" onclick="BT360.viewOffers('+arg(x.e.bank)+')">View offers</button>':'')+'</div>'
   :'<button type="button" class="bt360-chip bt3727-no-date" onclick="BT360.openArchived('+arg(x.e.id)+')">Details</button>';
  const bucket=savedBuckets.find(b=>entryBankIdentity(b.current||b).key===entryBankIdentity(x.e).key);
  const versions=[...savedAccountCycles(x.e).slice(1),...(bucket?[bucket.current,...(bucket.versions||[])]:[])].filter(v=>v&&!(String(v.entryId||v.id||'')===String(x.e.id)&&v.opened===x.e.opened));
  const history=versions.length?'<details class="research-help archive-history"><summary>Previous cycles and saved terms · '+versions.length+'</summary>'+versions.map(v=>renderTermsCycle(v,true)).join('')+'</details>':'';
  return '<details class="bt-archive-bank"><summary class="bt360-list-row bt3727-archive-row">'+bankLogo(x.e.bank,true)+'<span class="bt360-grow"><b>'+safe(x.e.bank)+'</b><small>'+safe(label)+'</small><small>Dates, saved terms & history ▾</small>'+(audience==='all'?kindTag(x.e):'')+'</span>'+action+'</summary><div class="bt-archive-bank-body">'+renderTermsCycle(x.e)+history+'<button type="button" class="bt360-secondary" onclick="BT360.openArchived('+arg(x.e.id)+')">View account</button></div></details>';
 };
 h+=panel('Eligible now',ready.length?'<div class="bt360-list">'+ready.map(x=>row(x,true)).join('')+'</div>':'<p class="bt360-muted">No verified eligibility dates reached.</p>');
 h+=panel('Eligible within 60 days',soon.length?'<div class="bt360-list">'+soon.map(x=>row(x,false)).join('')+'</div>':'<p class="bt360-muted">No verified upcoming eligibility dates within 60 days.</p>');
 h+=panel('Cooling down',cooling.length?'<div class="bt360-list">'+cooling.map(x=>row(x,false)).join('')+'</div>':'<p class="bt360-muted">No accounts cooling down.</p>','<span class="bt360-subtitle">soonest first</span>');
 h+=rTermsStorage({embedded:true,excludeClosed:true});
 h+='<details class="bt360-archived-tools"'+(legacyArchiveOpen?' open':'')+' ontoggle="BT360.setArchiveToolsOpen(this.open)"><summary>Completed, non-repeatable accounts · edit and review</summary>'+window.rTracker(rows,true)+'</details>';
 return h;
}
function setArchiveToolsOpen(value){legacyArchiveOpen=!!value}
function openArchived(id){const e=entries.find(x=>x.id===id);if(!e)return;expanded=id;if(e.closed){window.bt360ArchiveDetailId=id;tab='archive'}else{tab='tracker'}R()}
function viewOffers(bank){expanded=null;tab='bonuses';if(typeof window.btRadarSearch==='function')window.btRadarSearch(bank);else R()}
const HOST_SETTINGS='bt_hosting_usage_settings_v1';
const HOST_API='https://api-production-00f74.up.railway.app/api/bonus-tracker/usage';
const validLimit=v=>Number.isFinite(Number(v))&&Number(v)>0&&Number(v)<=100000?Math.round(Number(v)*100)/100:null;
function hostSettings(){
 try{const v=JSON.parse(localStorage.getItem(HOST_SETTINGS)||'{}');return{
  allowance:validLimit(v.allowance)??5,alertAt:validLimit(v.alertAt)??4,
  lastBannerMonth:String(v.lastBannerMonth||'').slice(0,7)
 }}catch{return{allowance:5,alertAt:4,lastBannerMonth:''}}
}
function saveHostSettings(next){
 const value={...hostSettings(),...next};
 if(!validLimit(value.allowance)||!validLimit(value.alertAt)){window.btNotify?.('Enter an amount greater than $0.');return false}
 try{const write={[HOST_SETTINGS]:JSON.stringify(value)};window.BTPersistence.commit(localStorage,write);R();return true}
 catch{window.btNotify?.('Hosting preferences could not be saved.');return false}
}
let usageData=null,usageLoading=false,usageFetchedAt=0,usageError='';
function cleanCost(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null}
function fmtCost(v){return v===null?'Unavailable':'$'+v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
function fmtStorage(bytes){return bytes>0&&bytes<5000000?'Less than 0.01 GB':(bytes/1000000000).toFixed(2)+' GB'}
async function refreshUsage(force=false){
 if(window.BTICloudBackup?.isLocalOnly?.())return;
 if(usageLoading)return;
 if(!force&&Date.now()-usageFetchedAt<60*60*1000)return;
 if(!window.BTBonusAuth?.connected?.()){usageError='Sign in to Cloud protection to view hosting usage.';return}
 usageLoading=true;usageError='';if(window.bt360SettingsOpen)R();
 try{
  // Try again bypasses the backend cache (the backend allows this once a minute).
  const url=force?HOST_API+'?refresh=1':HOST_API;
  const send=async token=>fetch(url,{method:'GET',credentials:'omit',cache:'no-store',headers:{Authorization:'Bearer '+token}});
  let response=await send(await window.BTBonusAuth.token());
  if(response.status===401)response=await send(await window.BTBonusAuth.token(true));
  if(!response.ok)throw Error('Usage unavailable');
  const payload=await response.json();
  if(!payload||typeof payload!=='object'||!payload.railway||!payload.r2)throw Error('Usage unavailable');
  usageData=payload;usageFetchedAt=Date.now();
 }catch{usageError='Usage unavailable. Check your connection or try again.';usageData=null;usageFetchedAt=Date.now()}
 finally{usageLoading=false;if(window.bt360SettingsOpen||tab==='tracker')R()}
}
function setHostingAmount(which){
 if(which!=='allowance'&&which!=='alertAt')return;
 const current=hostSettings();
 const input=window.prompt(which==='allowance'?'Monthly plan allowance in USD':'Alert threshold in USD',String(current[which]));
 if(input===null)return;
 const value=validLimit(input.trim());
 if(value===null){window.btNotify?.('Enter a dollar amount between $0.01 and $100,000.');return}
 saveHostSettings({[which]:value});
}
function usageBanner(){
 if(window.BTICloudBackup?.isLocalOnly?.())return'';
 if(!usageData||usageData.railway.status!=='ok')return'';
 const projected=cleanCost(usageData.railway.projectedMonthEnd),cfg=hostSettings(),month=String(usageData.month||'');
 if(projected===null||projected<=cfg.alertAt||cfg.lastBannerMonth===month)return'';
 if(month&&saveBannerMonth(month))return'<button class="bt360-usage-banner" onclick="BT360.openSettings()">Hosting cost may exceed your plan · View ›</button>';
 return'';
}
function saveBannerMonth(month){
 try{const settings={...hostSettings(),lastBannerMonth:month};window.BTPersistence.commit(localStorage,{[HOST_SETTINGS]:JSON.stringify(settings)});return true}catch{return false}
}
const USAGE_REASONS={
 token_missing:'Add a Railway API token (account token, not project token) to the backend as RAILWAY_API_TOKEN.',
 token_unauthorized:'Railway rejected the token. Create an account token (not a project token) and replace RAILWAY_API_TOKEN.',
 workspace_not_found:'This account token cannot access a Railway workspace.',
 project_not_visible:"This token can't see the trading-journal-ai project.",
 estimate_missing:'Railway did not report a complete billing estimate.',
 measurement_missing:'Railway omitted one or more service measurements.',
 rate_limited:'Railway is limiting requests. Try again in a few minutes.',
 timeout:"Couldn't reach Railway before the request timed out. Try again.",
 railway_unreachable:"Couldn't reach Railway. Try again.",
 permission_denied:"Railway doesn't allow this token to read a required field.",
 request_blocked:"Railway's network blocked the request before checking the token. Try again later.",
 response_changed:"Railway changed its billing data format; usage can't be verified until updated."
};
// Field names come from this fixed list only; remote reason text is never rendered.
const USAGE_FIELDS=['me','project','usage','estimatedUsage','metrics'];
const PROJECTION_UNAVAILABLE='Projection not available from Railway';
function usageReason(railway,code){
 const field=Array.isArray(railway?.deniedFields)?railway.deniedFields.find(x=>USAGE_FIELDS.includes(x)):null;
 if(code==='permission_denied'&&field)return "Railway doesn't allow this token to read "+field+'.';
 return USAGE_REASONS[code]||USAGE_REASONS.response_changed;
}
const RAILWAY_USAGE_URL='https://railway.com/workspace/usage';
function usageCard(){
 const month=new Date().toLocaleDateString('en-US',{month:'long',year:'numeric'});
 const cfg=hostSettings(),railway=usageData?.railway,r2=usageData?.r2;
 const current=cleanCost(railway?.costSoFar),projected=cleanCost(railway?.projectedMonthEnd);
 const status=railway?.status,partial=status==='partial',ok=status==='ok';
 const verifiedTime=railway?.verifiedAt&&Number.isFinite(Date.parse(railway.verifiedAt))
   ?new Date(railway.verifiedAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})
   :'not verified';
 const missingLabel='Not reported by Railway';
 let content='';
 if(usageLoading)content='<p class="bt360-muted">Checking Railway and R2 usage…</p>';
 else if(!window.BTBonusAuth?.connected?.())content='<p class="bt360-muted">Sign in to Cloud protection to view hosting usage.</p><button class="bt360-link" onclick="BT360.closeSettings();btOpenCloudBackup()">Open Cloud protection</button>';
 else if(ok||partial){
   if(partial)content+=current!==null
     ?'<p class="bt360-usage-warning">Verified month-to-date cost is complete. '+(projected===null?PROJECTION_UNAVAILABLE+'.':'Railway omitted some optional details; the projection is available.')+'</p>'
     :'<p class="bt360-usage-warning">Railway provided incomplete usage data. The total is incomplete; missing values are not zero.</p>';
   if(partial&&railway.reasonCode==='permission_denied')content+='<p class="bt360-muted">'+safe(usageReason(railway,'permission_denied'))+'</p>';
   if(ok&&current!==null&&projected!==null){
     const ratio=projected/cfg.allowance,label=ratio>1?'Over plan':ratio>=0.8?'Near limit':'Within plan',tone=ratio>1?'bad':ratio>=0.8?'warning':'positive';
     content+='<div class="bt360-usage-top"><div><span>Cost so far</span><strong>Verified '+fmtCost(current)+'</strong><small>Projected '+fmtCost(projected)+' by billing period end</small></div><span class="bt360-chip '+tone+'">'+label+'</span></div>';
     content+='<div class="bt360-usage-plan"><div><span>Projected / allowance</span><b>'+fmtCost(projected)+' / '+fmtCost(cfg.allowance)+'</b></div><div class="bt360-track"><i style="width:'+Math.min(100,ratio*100)+'%"></i></div></div>';
   } else {
     const subtotal=cleanCost(railway?.knownCostSubtotal);
     content+='<div class="bt360-usage-top"><div><span>'+(current===null?'Complete cost total':'Cost so far')+'</span><strong>'+(current===null?missingLabel:'Verified '+fmtCost(current))+'</strong><small>Verified subtotal: '+(subtotal===null?missingLabel:fmtCost(subtotal))+'</small><small>'+(projected===null?PROJECTION_UNAVAILABLE:'Projected billing usage: Verified '+fmtCost(projected))+'</small></div></div>';
   }
   const services=Array.isArray(railway.services)?railway.services:[];
   if(services.length)content+='<div class="bt360-usage-services">'+services.map(x=>{
     const value=cleanCost(x.costSoFar);
     return '<div><span>'+safe(x.name)+'</span><span>'+(value===null?missingLabel:'Verified '+fmtCost(value))+' <small>'+(x.avgMemoryGb!=null?Number(x.avgMemoryGb*1024).toFixed(0)+' MB avg':'Avg RAM not reported')+'</small></span></div>';
   }).join('')+'</div>';
   if(partial&&Array.isArray(railway.missing)&&railway.missing.length){
     const names={CPU_USAGE:'CPU',MEMORY_USAGE_GB:'memory',NETWORK_TX_GB:'network egress',average_memory:'average RAM',estimatedUsage:'month-end projection'};
     const kinds={permission_denied:'not permitted for this token'};
     content+='<div class="bt360-usage-missing"><b>Missing from Railway</b>'+railway.missing.slice(0,30).map(x=>'<p>'+safe(x.service)+' · '+safe(names[x.metric]||x.metric)+' ('+safe(kinds[x.kind]||x.kind)+')</p>').join('')+'</div>';
   }
   content+='<p class="bt360-muted">Verified from Railway '+safe(verifiedTime)+' · usage before plan credit and base fee</p>';
 }else{
   const code=typeof railway?.reasonCode==='string'?railway.reasonCode:(status==='not_configured'?'token_missing':'response_changed');
   content+='<p class="bt360-usage-warning">'+safe(usageReason(railway,code))+'</p>';
 }
 if(!ok&&!partial&&usageError)content+='<p class="bt360-muted">'+safe(usageError)+'</p>';
 content+='<div class="bt360-usage-controls"><button class="bt360-link" onclick="BT360.refreshUsage(true)">Try again</button><a href="'+RAILWAY_USAGE_URL+'" target="_blank" rel="noopener noreferrer">View Railway usage ↗</a></div>';
 content+='<div class="bt360-usage-config"><button onclick="BT360.setHostingAmount(\'allowance\')">Plan allowance <b>'+fmtCost(cfg.allowance)+'</b> ✎</button><button onclick="BT360.setHostingAmount(\'alertAt\')">Alert at <b>'+fmtCost(cfg.alertAt)+'</b> ✎</button></div>';
 content+='<div class="bt360-usage-r2"><b>R2 storage</b><span>'+(r2?.status==='ok'&&typeof r2.usedBytes==='number'&&Number.isFinite(r2.usedBytes)&&r2.usedBytes>=0?fmtStorage(r2.usedBytes)+' / 10 GB free':'Usage unavailable')+'</span></div>';
 content+='<p class="bt360-muted">Last checked '+(usageData?.checkedAt?new Date(usageData.checkedAt).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):'not yet')+'</p>';
 return panel('HOSTING & USAGE · '+month,content);
}
function setNotice(key){if(!(key in noticePrefs))return;noticePrefs[key]=!noticePrefs[key];try{sessionStorage.setItem(noticeKey,JSON.stringify(noticePrefs))}catch{}R()}
function cloudSettingsCard(){
 const local=window.BTICloudBackup?.isLocalOnly?.(),status=window.BTICloudBackup?.status?.()||{};
 if(local)return panel('ICLOUD DRIVE BACKUP','<p class="bt360-muted">'+(status.verifiedAt?'Backup file checked '+safe(new Date(status.verifiedAt).toLocaleDateString())+(status.changed?' · New changes need another export':''):'Save a full backup file to iCloud Drive to protect this phone.')+'</p><div class="bt360-actions"><button type="button" class="bt360-primary" onclick="BTICloudBackup.exportFile()">Save backup file</button><button type="button" class="bt360-secondary" onclick="BTICloudBackup.openSetup()">Verify or restore</button></div><p class="bt360-muted">Manual backups only · nothing is uploaded automatically.</p>');
 const transfer=panel('MOVE TO ICLOUD DRIVE','<p class="bt360-muted">Save a full backup file to iCloud Drive, choose it in Files to verify, then switch off Railway backup safely.</p><button type="button" class="bt360-primary" onclick="BTICloudBackup.openSetup()">Move to iCloud Drive</button>');
 let cfg={};try{cfg=JSON.parse(localStorage.getItem('bt_cloud_recovery_v1')||'{}')}catch{}
 const state=window.BTCloudBackup?.protection?.()||{};
 const time=cfg.lastAt?new Date(cfg.lastAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'No verified backup yet';
 const on=cfg.enabled===true;
 return transfer+panel('CLOUD PROTECTION','<button type="button" role="switch" aria-checked="'+on+'" class="bt360-settings-row" onclick="BT360.closeSettings();btOpenCloudBackup()"><span><b>Auto-backup</b><small>Change with verified cloud controls</small></span><i class="bt360-toggle '+(on?'checked':'')+'"></i></button><p class="bt360-muted">'+safe(state.title||'Review cloud protection')+' · '+safe(time)+'</p><div class="bt360-actions"><button class="bt360-primary" onclick="BT360.backUpNow()">Back up now</button><button class="bt360-secondary" onclick="BT360.closeSettings();btOpenCloudBackup()">Restore from cloud</button></div>');
}
async function backUpNow(){
 closeSettings();
 if(window.BTICloudBackup?.isLocalOnly?.())return window.BTICloudBackup.exportFile();
 if(!window.BTBonusAuth?.connected?.()||!window.BTCloudBackup?.upload){btOpenCloudBackup();return}
 try{await window.BTCloudBackup.upload('manual');window.btNotify?.('Cloud backup uploaded and verified.',{title:'Backup verified',tone:'success'})}
 catch{btOpenCloudBackup()}
}
function settings(){
 const toggles=[['deadlines','Deadlines','3 and 1 day before'],['payouts','Payouts and close dates','When ready'],['eligible','Eligible again','7 days before and on the day']];
 const buttons=toggles.map(([k,label,description])=>'<button class="bt360-settings-row" role="switch" aria-checked="'+noticePrefs[k]+'" onclick="BT360.setNotice(\''+k+'\')"><span><b>'+label+'</b><small>'+description+'</small></span><i class="bt360-toggle '+(noticePrefs[k]?'checked':'')+'"></i></button>').join('');
 return '<div class="bt360-sheet-backdrop" onclick="BT360.closeSettings()"><section class="bt360-sheet" role="dialog" aria-modal="true" aria-label="Settings" onclick="event.stopPropagation()"><header><div><h2>Settings</h2><p>BonusTracker v3.6.54</p></div><button aria-label="Close settings" onclick="BT360.closeSettings()">×</button></header>'+
 cloudSettingsCard()+
 (window.BTICloudBackup?.isLocalOnly?.()?'':usageCard())+
 panel('Notifications',buttons+'<p class="bt360-muted">Preferences are UI-only in v3.6.32. Push delivery is not active.</p>')+
 panel('Data',(window.BTICloudBackup?.isLocalOnly?.()?'':'<button class="bt360-settings-row" onclick="BT360.closeSettings();exportBackup()">Export backup file <span>›</span></button><button class="bt360-settings-row" onclick="BT360.closeSettings();importBackup()">Restore from file <span>›</span></button>')+'<button class="bt360-settings-row" onclick="BT360.openPhonebook()">Bank phone numbers <span>›</span></button>')+
 '<button class="bt360-reset" onclick="BT360.closeSettings();resetAllData()">Reset this device <small>Two confirmations and a safety backup</small></button></section></div>';
}
let notificationPanelOpen=false;
function notifications(rows){
 let data=[];try{data=window.getAttentionSuggestions?.()||[]}catch{}
 const scoped=data.filter(x=>rows.some(e=>e.id===x.entryId&&scope(e)));
 const items=scoped.map(x=>'<button class="bt360-list-row" onclick="BT360.openNotification('+arg(x.entryId)+')">'+bankLogo(x.bank,true)+'<span class="bt360-grow"><b>'+safe(x.task?.title||x.stageLabel||'Review account')+'</b><small>' +safe(x.bank||'Bank')+' · '+safe((rows.find(e=>e.id===x.entryId)&&accountAudience(rows.find(e=>e.id===x.entryId))==='business')?'Business':'Personal')+' · '+safe(x.stageLabel||'Review')+'</small></span><span class="bt360-chip '+(x.stageCode==='READY_TO_CLOSE'?'positive':'warning')+'">'+safe(x.dateContext?.confirmed&&x.dateContext.date?date(x.dateContext.date):'Review')+'</span></button>').join('');
 return '<div class="bt360-sheet-backdrop" onclick="BT360.closeNotifications()"><section class="bt360-sheet" role="dialog" aria-modal="true" aria-label="Notification center" onclick="event.stopPropagation()"><header><div><h2>Notifications</h2><p>'+safe(audience==='all'?'All accounts':audience==='personal'?'Personal':'Business')+' · Tracker reminders</p></div><button aria-label="Close notifications" onclick="BT360.closeNotifications()">×</button></header>'+panel('Needs you',items?'<div class="bt360-list">'+items+'</div>':'<p class="bt360-muted">No current tasks needing attention.</p>')+'<p class="bt360-muted">These are tracker reminders, not push notifications. Push delivery will be enabled in a later release.</p></section></div>';
}
function openNotifications(){notificationPanelOpen=true;window.bt360SettingsOpen=false;R()}
function closeNotifications(){notificationPanelOpen=false;R()}
function openNotification(id){notificationPanelOpen=false;openAccountFromActionCenter(id)}
function openPhoneForClose(bank,accountType){
 window.bt360SettingsOpen=false;
 window.bt360PhonebookOpen=true;
 phoneSearch=String(bank||'');
 showPhoneAdd=true;
 R();
 requestAnimationFrame(()=>{
   const field=document.getElementById('ph_new_bank');
   if(field){field.value=bank;const target=document.getElementById(accountType==='business'?'ph_new_business':'ph_new_personal');target?.focus({preventScroll:true});}
 });
}
function openPhonebook(){closeSettings();window.bt360PhonebookOpen=true;R()}
function closePhonebook(){window.bt360PhonebookOpen=false;R()}
function openSettings(){window.bt360SettingsOpen=true;R();refreshUsage()}
function closeSettings(){window.bt360SettingsOpen=false;R()}
window.BT360={sourceEvidenceStatus,sourceEvidencePanel,dashboardQueueFor,toggleAttention,toggleAccountList,openAccountSearch,closeAccountSearch,get selectedAttentionId(){return selectedAttentionId},get accountListOpen(){return accountListOpen},setAccountSectionOpen,revealAccountSection,cloudStatusText,accountDates,accountSaveStatus,infoRow,feeSnapshot,closeCheckPresentation,get audience(){return audience},get selectedStage(){return selectedStage},get archivePane(){return archivePane},get notificationsOpen(){return notificationPanelOpen},scope,accountAudience,kindTag,segments,setAudience,setStage,heroMonthData,toggleHeroMonth,closeHeroMonth,clearHeroMonth,openHeroBonus,compactRow,primaryAction,openNextTask,showHold,showEligibility,resetStage,stages,hero,home,tasks,eligibleSoon,eligibleInfo,detailHead,detailPanels,detailFooter,openRuleEditor,openActivity,closeActivity,setReadyExtrasOpen,requirementRows,timerRows,feeDetail,back,archive,archiveCountdown,goArchive,showTerms,openArchived,setArchiveToolsOpen,viewOffers,settings,openSettings,closeSettings,setNotice,openPhonebook,closePhonebook,openPhoneForClose,refreshUsage,setHostingAmount,hostSettings,usageCard,backUpNow,cloudSettingsCard,notifications,openNotifications,closeNotifications,openNotification};
if(typeof R==='function')R();
})();

