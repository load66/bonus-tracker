/* BonusTracker 3.6.67 presentation helpers. Pure views; canonical rules are read-only. */
(function(){
'use strict';
const scopeKey='bt3628_audience_session',noticeKey='bt360_notice_session';
const readyExtrasState=new Map();
const accountSections=new Map();
let legacyArchiveOpen=false;
let audience='all', archivePane='waiting', selectedHeroMonth=null, lastHeroYear=null, noticePrefs={deadlines:true,payouts:true,eligible:true}, selectedStage='';
try{const saved=sessionStorage.getItem(scopeKey);if(['all','personal','business'].includes(saved))audience=saved}catch{}
try{const v=JSON.parse(sessionStorage.getItem(noticeKey)||'{}');for(const k of Object.keys(noticePrefs))if(Object.prototype.hasOwnProperty.call(v,k))noticePrefs[k]=v[k]===true}catch{}
const safe=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const arg=v=>JSON.stringify(String(v??'')).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const stage=e=>{try{return lifecycleViewForEntry(e)}catch{return {code:'IN_PROGRESS',label:'In progress'}}};
const amount=v=>fM(Number(v||0)), date=v=>v?fD(v):'Needs review';
const eligibleInfo=e=>{
 if(!e)return null;
 const gate=window.BTEligibilityGate;
 const policy=window.btEligibilityPolicyEntry?.(e)||e;
 const recordedProjected=gate?.recordedSafeEligibilityDate?.(policy,addD,addM)||'';
 const eligible=recordedProjected||(e.closed?window.churnReadyDate?.(e)||'':'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(eligible))return null;
 try{
  const check=gate?.recorded?.(policy);
  if(check?.ok&&check.decision==='repeatable'&&eligible===recordedProjected){
   const controlling=gate.recordedControllingRule(policy,addD,addM);
   const more=gate.recordedEligibilityDates(policy,addD,addM).filter(r=>r.conditionState==='active');
   return {eligible,controlling,more,recorded:true,label:controlling?gate.periodLabel(controlling.period)+' from '+gate.anchorLabel(controlling.basis)+' + '+gate.SAFETY_BUFFER_DAYS+' days':'saved waiting period'};
  }
 }catch{}
 const fallback=e.closed?window.btLegacyChurnFallbackDate?.(e):'';
 if(e.closed&&fallback===eligible)return {eligible,controlling:null,more:[],recorded:true,label:'from saved waiting period'};
 return {eligible,controlling:null,more:[],recorded:true,label:'from saved waiting period'};
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
const dashboardLabels={ACTION_NEEDED:'Action needed',IN_PROGRESS:'In progress',REQUIREMENTS_MET:'Steps completed',AWAITING_BONUS:'Waiting for bonus',BONUS_RECEIVED:'Bonus received',HOLD_OPEN:'Keep open',READY_TO_CLOSE:'Ready to close',COOLDOWN:'Waiting period',ELIGIBLE:'Review new offer',ARCHIVED:'Archived'};
const pills=['ACTION_NEEDED','IN_PROGRESS','REQUIREMENTS_MET','AWAITING_BONUS','BONUS_RECEIVED','HOLD_OPEN','READY_TO_CLOSE'].map(code=>[code,dashboardLabels[code]]);
// A presentation projection only: never rewrite the canonical lifecycle or dates.
// A paid account cannot advertise readiness while its next action still needs review.
function dashboardStage(entry,suggestion){
 const raw=suggestion?{code:suggestion.stageCode,label:suggestion.stageLabel}:stage(entry);
 let code=raw.code;
 if(code==='READY_TO_CLOSE'){
  let kind=suggestion?.actionKind;
  if(!kind){try{kind=window.btNextActionForEntry?.(entry)?.kind}catch{}}
  if(kind!=='close')code='BONUS_RECEIVED';
 }
 return {...raw,code,label:dashboardLabels[code]||raw.label||'Review account'};
}
function stages(rows){
 const counts={};rows.filter(e=>!e.closed&&scope(e)).forEach(e=>{const code=dashboardStage(e).code;counts[code]=(counts[code]||0)+1});
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
 const entry=typeof entries!=='undefined'?entries.find(e=>e.id===x.entryId):null;
 return dashboardStage(entry,x);
}
function attentionDateNote(x){
 const c=x?.dateContext||{};
 const entry=typeof entries!=='undefined'?entries.find(e=>e.id===x.entryId):null;
 const arrival=window.BTFinancialRules?.arrivalLabel?.(window.BTFinancialRules?.estimatedArrival?.(entry));
 if(arrival&&['AWAITING_BONUS','REQUIREMENTS_MET'].includes(x.stageCode))return arrival;
 const days=attentionDateDays(x),paid=['BONUS_RECEIVED','READY_TO_CLOSE'].includes(x.stageCode);
 const type=x.task?.activityKind;
 const deadline={'direct-deposit':'Deposit deadline','new-money':'Funding deadline','balance-hold':'Balance review','transactions':'Purchase deadline','enrollment':'Sign-up deadline'}[type]||'Requirement deadline';
 if(c.confirmed&&days!==null){
  const prefix=['AWAITING_BONUS','REQUIREMENTS_MET'].includes(x.stageCode)?'Expected by ':x.stageCode==='HOLD_OPEN'?'Keep open until ':paid?'Closing review: ':['COOLDOWN','ELIGIBLE'].includes(x.stageCode)?'New offer review: ':deadline+': ';
  const urgent=attentionUrgency(x);
  const late=urgent!==null&&urgent<0?' · '+Math.abs(urgent)+' day'+(urgent===-1?'':'s')+' overdue':urgent===0?' · Today':'';
  return prefix+date(c.date)+late;
 }
 if(['AWAITING_BONUS','REQUIREMENTS_MET'].includes(x.stageCode))return 'Payment date not saved';
 if(x.stageCode==='HOLD_OPEN'||paid)return 'Check closing date';
 if(['COOLDOWN','ELIGIBLE'].includes(x.stageCode))return 'Check next offer date';
 return 'Check '+deadline.toLowerCase();
}
function dashboardTaskTitle(x,entry,queue){
 if(x.task?.title==='Verify saved offer rules')return 'Check saved offer details';
 if(['ELIGIBLE','COOLDOWN'].includes(x.stageCode))return x.stageCode==='ELIGIBLE'?'Review a new offer':'Wait before applying again';
 if(x.stageCode==='HOLD_OPEN')return 'Keep this account open';
 if(entry?.bonusRecd||['BONUS_RECEIVED','READY_TO_CLOSE'].includes(x.stageCode))return dashboardStage(entry,x).code==='READY_TO_CLOSE'?'Close account when ready':'Check when you can close';
 if(['AWAITING_BONUS','REQUIREMENTS_MET'].includes(x.stageCode))return queue==='waiting'?'Watch for bonus payment':'Check bonus payment';
 const title=String(x.task?.title||x.stageLabel||'Check account details');
 const simple={'Verify saved offer rules':'Check saved offer details','Confirm all bonus requirements':'Check bonus requirements','Review saved requirements':'Check bonus requirements','Confirm bonus payment':'Record bonus when paid'};
 return simple[title]||title.replace(/^Receive (\$[\d,.]+) in monthly qualifying direct deposits$/,'Get $1 in qualifying direct deposits each month');
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
  const info=eligibleInfo(entry),days=info?.recorded?dB(td(),info.eligible):null;
  // The same canonical record is already rendered in Eligible soon.
  if(Number.isFinite(days)&&days>0&&days<=60)return 'upcoming';
 }
 if(['AWAITING_BONUS','REQUIREMENTS_MET'].includes(x.stageCode)&&entry&&!entry.closed&&!entry.bonusRecd){
  const arrival=window.BTFinancialRules?.estimatedArrival?.(entry);
  if(arrival)return dB(td(),arrival.end)>=0?'waiting':'needs';
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
 if(!entry||entry.reqMet||entry.bonusRecd||entry.closed)return '';
 const p=requirementProgress(entry);
 if(!p.total)return '';
 return '<span class="bt3719-progress"><span class="bt3719-progress-label"><b>'+p.done+' of '+p.total+' '+(p.total===1?'step':'steps')+' checked</b></span>'
  +'<span class="bt360-track" role="progressbar" aria-label="Recorded requirement and task checks" aria-valuemin="0" aria-valuemax="'+p.total+'" aria-valuenow="'+p.done+'"><i style="width:'+p.percent+'%"></i></span></span>';
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
 const context=attentionDateNote(x);
 return [kind,context].filter(Boolean).join(' · ');
}
// Dashboard account cards are navigation surfaces, not expandable action
// menus. Bank-specific actions live in the shared account detail footer.
let selectedAttentionId=null,accountListOpen=false;
function toggleAttention(id){
 if(!entries.some(e=>e.id===id))return;
 selectedAttentionId=null;
 openAccountFromActionCenter(id);
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
 list.forEach(x=>{
  const item=rows.find(e=>e.id===x.entryId);
  const label=dashboardTaskTitle(x,item,key);
  const title=safe(label),meta=attentionAccountMeta(x,item);
  html+='<article class="bt3641-attention-item" data-attention-id="'+safe(x.entryId)+'">'
   +'<button type="button" class="bt360-list-row bt3641-attention-toggle bt3812-bank-detail-link" data-attention-link="'+safe(x.entryId)+'" aria-label="Open '+safe(x.bank||'bank')+' details" onclick="openAccountFromActionCenter('+arg(x.entryId)+')">'
   +bankLogo(x.bank,true)+'<span class="bt360-grow bt3729-needs-copy"><b class="bt3729-bank-name">'+safe(x.bank||'Bank')+'</b><small class="bt3729-task-title">'+title+'</small><small class="bt3729-task-meta'+(attentionUrgency(x)!==null&&attentionUrgency(x)<0?' is-overdue':'')+'">'+safe(meta)+'</small>'+monthlyFeeBadge(item)+'</span>'
   +'<span class="bt3719-task-right">'+(item?.bonus?'<strong>'+safe(amount(item.bonus))+'</strong>':'')+actionBadge(x,false)+'</span>'
   +(['ACTION_NEEDED','IN_PROGRESS'].includes(x.stageCode)?attentionCardProgress(item):'')+'</button></article>';
 });
 return html+'</div></section>';
 }).join('');
}
function eligibleSoon(rows){
 const next=rows.filter(e=>e.closed&&scope(e)).map(e=>({e,info:eligibleInfo(e)}))
  .filter(x=>x.info?.recorded).map(x=>({...x,days:dB(td(),x.info.eligible)}))
  .filter(x=>x.days>0&&x.days<=60).sort((a,b)=>a.days-b.days);
 if(!next.length)return'';
 const heading='<div class="bt360-panel-title bt3719-section-title"><h3>Reopening reviews soon</h3><span class="bt360-subtitle">next 60 days</span><button class="bt360-link" onclick="BT360.goArchive(\'waiting\')">View waiting accounts</button></div>';
 const list='<div class="bt360-list bt3719-soon-list">'+next.map(x=>
  '<button class="bt360-list-row" onclick="BT360.goArchive(\'waiting\')">'+bankLogo(x.e.bank,true)
  +'<span class="bt360-grow"><b>'+safe(x.e.bank)+'</b><small>'+safe(date(x.info.eligible))+' · '+safe(x.info.label)+'</small>'+(audience==='all'?kindTag(x.e):'')+'</span>'
  +'<span class="bt360-chip">'+x.days+' days</span></button>').join('')+'</div>';
 return '<section class="bt3719-soon">'+heading+list+'</section>';
}
function home(rows,year,metrics){if(!usageData&&!usageLoading&&window.BTBonusAuth?.connected?.())setTimeout(()=>refreshUsage(),0);return segments()+usageBanner()+hero(rows,year,metrics)+stages(rows)+tasks(rows)+eligibleSoon(rows)}
// Read-only, bank-independent projection. Never infer a waiver from bonus progress.
function accountFeeWarnings(e){
 if(!e||e.closed)return [];
 const x=feeSnapshot(e),rows=[],rules=e.financialRules;
 const add=(label,detail)=>rows.push({label,detail});
 const validMoney=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
 let validation=null;
 if(rules){try{validation=window.BTFinancialRules?.validate?.(e)}catch{}}
 const issues=validation?.issues||[];
 const supported=path=>!!validation&&!issues.some(i=>i.path==='financialRules'||i.path==='financialRules.version'||i.path===path||i.path.startsWith(path+'.')||i.path.startsWith(path+'['));
 const frequencyEvidence={monthly:/monthly|per month|each month|every month|\/month/i,'statement-cycle':/statement (?:cycle|period)/i,quarterly:/quarterly|per quarter|each quarter/i,annually:/annually|annual|per year|each year/i};
 const frequencies={monthly:'/month','statement-cycle':'/statement',quarterly:'/quarter',annually:'/year'};
 const feeLabels={monthly:'Monthly fee','statement-cycle':'Fee per statement',quarterly:'Quarterly fee',annually:'Annual fee'};
 if(rules){
  const accounts=Array.isArray(rules.accounts)?rules.accounts:[];
  if(accounts.filter(a=>a?.role==='primary').length!==1)add('Check monthly fee','Primary account fee information is incomplete. Review saved fee terms.');
  accounts.forEach((a,i)=>{
   if(!a||!(a.role==='primary'||a.required===true))return;
   const fee=a.fee,name=a.role==='primary'?'':String(a.label||'Required account')+': ';
   if(!fee||!validMoney(fee.amount)||!supported('accounts['+i+']')||!['USD'].includes(fee.currency)||!(fee.frequency==='none'&&fee.amount===0||frequencies[fee.frequency])){
    add(name+'Check fee','Fee amount, frequency or supporting evidence needs review in Details.');return;
   }
   if(fee.amount>0&&!frequencyEvidence[fee.frequency]?.test(String(fee.evidence?.quote||''))){add(name+'Check fee','Saved fee frequency conflicts with its supporting wording. Review fee terms.');return;}
   if(fee.amount>0)add(a.role==='primary'?feeLabels[fee.frequency]+': '+amount(fee.amount):name+amount(fee.amount)+frequencies[fee.frequency],
    String(fee.evidence?.quote||'')+' '+(fee.waiver?.evidence?.quote||'Waiver terms not confirmed.')+' Check each applicable fee period; bonus completion does not prove a waiver.');
  });
 }else{
  const n=x.monthlyKnown?Number(String(x.monthly).replace(/[$,\s]/g,'')):null;
  if(n>0)add('Monthly fee: '+x.monthly,'Saved monthly fee. '+x.summary+'. Review the waiver for each fee period.');
  if(n===null||!Number.isFinite(n))add('Check monthly fee','Monthly fee is not confirmed in saved terms.');
  // Legacy required-account summaries retain only an amount immediately after
  // the product separator, never a membership or waiver balance threshold.
  x.companions.forEach(text=>{
   const m=text.match(/^([^:]+):\s*\$\s*([\d,]+(?:\.\d{1,2})?)(.*)$/);
   if(!m){add('Required account: check fee',text);return;}
   const value=Number(m[2].replace(/,/g,''));
   if(value<=0)return;
   const period=/\/\s*(?:month|mo)\b|monthly/i.test(m[3])?'/month':
    /\/\s*(?:year|yr)\b|annually/i.test(m[3])?'/year':' fee · check period';
   add(m[1].trim()+': '+amount(value)+period,text);
  });
 }
 return rows;
}
function monthlyFeeBadge(e){
 if(!e||e.closed)return '';
 const labels=accountFeeWarnings(e);
 if(!labels.length)return '';
 return '<span class="bt-account-fee-badges" style="display:flex;flex-wrap:wrap;gap:5px;grid-column:1/-1;justify-self:start;min-width:0;max-width:100%;margin-top:6px;">'+labels.map(x=>
  '<span class="bt-monthly-fee-badge" title="'+safe(x.detail)+'" aria-label="'+safe(x.label+'. '+x.detail)+'" style="display:inline-flex;align-items:center;flex:0 0 auto;width:fit-content;max-width:100%;box-sizing:border-box;padding:3px 7px;border:1px solid #826035;border-radius:999px;background:#332515;color:#ffd294;font-size:11px;font-weight:700;line-height:1.35;white-space:normal;overflow-wrap:normal;word-break:normal;text-align:left;">'+safe(x.label)+'</span>'
 ).join('')+'</span>';
}
function compactRow(e){
 const s=dashboardStage(e),progress=requirementProgress(e);
 const arrival=!e.closed&&!e.bonusRecd?window.BTFinancialRules?.arrivalLabel?.(window.BTFinancialRules?.estimatedArrival?.(e)):'';
 // The recorded lifecycle takes precedence over any stale task/timer.
 const next=e.closed?'Closed':e.bonusRecd?dashboardTaskTitle({stageCode:s.code,actionKind:s.code==='READY_TO_CLOSE'?'close':'review'},e,'needs'):
  e.reqMet?'Waiting for bonus':
  (progress.next||(progress.total?'All checked · confirm completion':'')||s.support||s.label);
 const shownStage=e.closed?'Closed':e.bonusRecd?(['READY_TO_CLOSE','HOLD_OPEN','BONUS_RECEIVED'].includes(s.code)?s.label:'Bonus received'):e.reqMet?'Waiting for bonus':s.label;
 return '<div class="card bt366-compact-account" data-bt-entry-id="'+safe(e.id)+'"><button type="button" class="card-h bt366-compact-row" onclick="openAccountFromActionCenter('+arg(e.id)+')">'
  +bankLogo(e.bank,true)+'<span class="bt360-grow"><b>'+safe(e.bank)+'</b>'+(audience==='all'?kindTag(e):'')+monthlyFeeBadge(e)+'<small>'+safe(next)+'</small>'+(arrival?'<small class="bt3684-arrival-compact">'+safe(arrival)+'</small>':'')
  +(progress.total&&!e.closed&&!e.bonusRecd&&!e.reqMet?'<span class="bt366-compact-track" role="progressbar" aria-label="Recorded requirement and task checks" aria-valuemin="0" aria-valuemax="'+progress.total+'" aria-valuenow="'+progress.done+'"><i style="width:'+progress.percent+'%"></i></span><small>'+progress.done+' of '+progress.total+' '+(progress.total===1?'step':'steps')+' checked</small>':'')
  +'</span><span class="bt366-compact-right"><strong>'+amount(e.bonus)+'</strong><em class="bt360-chip">'+safe(shownStage)+'</em></span></button></div>';
}
function primaryAction(e){
 const id=arg(e.id);
 // The recorded milestone, not a stale task/fee warning, selects the next action.
 if(e.closed)return {label:'Back to accounts',command:'BT360.back()'};
 if(e.bonusRecd)return {label:'Record closure',command:'startCloseFlow('+id+',\'actual\')'};
 if(e.reqMet)return {label:'Record bonus payment',command:'openRcv('+id+')'};
 // User confirmation records the whole milestone. Task checkboxes help with
 // progress but are optional and must never automatically mark requirements met.
 return {label:'Mark requirements done',command:'openReqMet('+id+')'};
}
function openNextTask(id){
 const current=entries.find(e=>e.id===id);
 if(!current)return;
 if(expanded!==id){expanded=id;tab='tracker';R()}
 requestAnimationFrame(()=>{
  const box=document.querySelector('.bt3810-requirements');
  const next=box?.querySelector('[role="checkbox"][aria-checked="false"]');
  (next||box)?.scrollIntoView({block:'center',behavior:'smooth'});
  next?.focus({preventScroll:true});
 });
}
function showHold(){document.querySelector('.bt3810-fees,.bt3810-status')?.scrollIntoView({behavior:'smooth',block:'center'})}
function showEligibility(){document.querySelector('.bt3810-cycle')?.scrollIntoView({behavior:'smooth',block:'center'})}
function detailHead(e){
 const label=e.closed?'Closed':e.bonusRecd?'Bonus received':e.reqMet?'Waiting for bonus':'In progress';
 return '<div class="bt360-detail-header"><div class="bt360-detail-bar">'
  +'<button onclick="BT360.back()" aria-label="Back to accounts">‹</button><span>'+safe(label)+'</span>'
  +'<button onclick="openBankActions('+arg(e.id)+')" aria-label="More account actions">•••</button></div>'
  +'<div class="bt360-detail-identity">'+bankLogo(e.bank,true)
  +'<div class="bt360-grow"><h2>'+safe(e.bank)+'</h2><p>'+safe(accountAudience(e)==='business'?'Business':'Personal')+' account</p></div>'
  +'<strong>'+amount(e.bonus)+'</strong></div></div>';
}
function setAccountSectionOpen(id,key,value){accountSections.set(String(id)+'|'+key,!!value)}
function revealAccountSection(key){
 const node=[...document.querySelectorAll('.bt3640-section')].find(n=>n.dataset.section===key);
 if(node){const extras=node.closest('.bt3686-account-extras');if(extras){extras.open=true;setAccountSectionOpen(node.dataset.entryId,'extras',true);}node.open=true;setAccountSectionOpen(node.dataset.entryId,key,true);}
 return node;
}
function accountSection(e,key,title,html,meta='',actions='',defaultOpen=false){
 const open=accountSections.get(String(e.id)+'|'+key)??defaultOpen;
 return '<details class="bt360-panel bt3640-section" data-entry-id="'+safe(e.id)+'" data-section="'+safe(key)+'"'+(open?' open':'')+' ontoggle="BT360.setAccountSectionOpen('+arg(e.id)+','+arg(key)+',this.open)"><summary class="bt360-panel-title"><h3>'+safe(title)+'</h3><span class="bt3640-section-meta">'+safe(meta)+'</span><span class="bt3640-chevron" aria-hidden="true">⌄</span></summary><div class="bt360-panel-body">'+(actions?'<div class="bt3640-section-actions">'+actions+'</div>':'')+html+'</div></details>';
}
// The active account view has no closing date until a real closure is recorded.
// Historical/closed records retain the date in this same shared date projection.
function recordedAccountDateRows(e){
 const rows=[['opened','Opened'],['reqMet','Requirements met'],['bonusRecd','Bonus paid']];
 if(e?.closed)rows.push(['closed','Closed']);
 return rows;
}
function accountDates(e){
 return '<section class="bt3640-dates" aria-label="Recorded account dates"><div class="bt3640-key-title"><h3>Key dates</h3><button type="button" class="bt360-link" aria-label="Edit account dates" onclick="openEdit('+arg(e.id)+')">Edit</button></div><dl>'+recordedAccountDateRows(e).map(([key,label])=>'<div><dt>'+label+'</dt><dd class="'+(archiveDateValid(e[key])?'':'is-missing')+'">'+safe(archiveDateValid(e[key])?date(e[key]):e[key]?'Needs review':'Not recorded')+'</dd></div>').join('')+'</dl></section>';
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
function requirementTitle(r,e,balance){
 const kind=r?.kind||'',value=Number(r?.amount),money=Number.isFinite(value)&&value>0?amount(value):'';
 const raw=String(r?.text||'').trim();
 if(kind==='direct-deposit'){
  const total=/total|cumulat|aggregat|combin/i.test(raw)||(!r.count&&!r.recurrence);
  if(money)return total?'Direct deposits totaling '+money:'Direct deposits of '+money+(r.count?' · '+r.count+' required':'');
  return 'Qualifying direct deposits'+(r.count?' · '+r.count+' required':'');
 }
 if(kind==='new-money')return 'Deposit '+(money||'new money');
 if(kind==='balance-hold'){
  const period=balance===undefined&&e?window.BTFinancialRules?.balanceMeasurementWindow?.(e,r):balance;
  return period?'Keep '+(money?'a '+money:'the required')+' average balance':'Qualifying balance '+(money||'required');
 }
 if(kind==='transactions')return 'Qualifying transactions'+(r.count?' · '+r.count+' required':'');
 if(kind==='enrollment')return 'Enrollment requirement';
 if(kind==='relationship')return 'Linked account requirement';
 return raw||'Complete offer requirement';
}

function depositLedgerHtml(e,readonly=false){
 const p=typeof depositProgress==='function'?depositProgress(e):{rows:[],totalCents:0,confirmedCents:0,recordedCount:0,confirmedCount:0,targetCents:0,percent:0};
 const hasDD=Array.isArray(e?.financialRules?.requirements)&&e.financialRules.requirements.some(r=>r?.kind==='direct-deposit')||
  /direct[ -]?deposits?|\bpayroll\b|\bq?dd\b/i.test([e?.completeBonusText,e?.dataPoint,...(e?.checklist||[]).map(x=>x.text)].join(' '));
 if(!hasDD&&!p.recordedCount)return'';
 if(e.reqMet&&!p.recordedCount)return'';
 const dollars=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:n%100===0?0:2,maximumFractionDigits:2}).format(n/100);
 const add=(!readonly&&e.opened)?'<button type="button" class="bt360-link bt3686-deposit-add" onclick="openDepositRecord('+arg(e.id)+')">+ Add deposit</button>':'';
 if(!p.recordedCount){
  return '<div class="bt3681-deposit-ledger bt3686-deposit-empty" aria-label="Direct deposit history">'+
    '<span><b>Direct deposits</b><small>'+safe(e.opened?'No deposits tracked yet':'Add the opening date to track deposits')+'</small></span>'+
    (e.opened?add:!readonly?'<button type="button" class="bt360-link" onclick="openEdit('+arg(e.id)+')">Add opening date</button>':'')+'</div>';
 }
 let h='<div class="bt3681-deposit-ledger bt3686-deposit-active" aria-label="Recorded direct deposits"><div class="bt3681-ledger-head"><b>Direct deposits</b>'+add+'</div>'+
  '<p class="bt3681-ledger-total">'+dollars(p.totalCents)+' recorded · '+dollars(p.confirmedCents)+' confirmed by you</p>';
 if(p.targetCents){
  h+='<div class="bt3681-ledger-track" role="progressbar" aria-label="User-confirmed counted deposit amount" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+p.percent+'"><i style="width:'+p.percent+'%"></i></div>'+
   '<small>'+dollars(p.confirmedCents)+' of '+dollars(p.targetCents)+' confirmed · '+p.percent+'% tracked</small>';
 }else h+='<small>Check your bank offer for which deposits qualify.</small>';
 h+='<details class="bt3686-deposit-help"><summary>How does this work?</summary><p>Only confirm a deposit if your bank counted it. Adding deposits does not mark the bonus requirements or payment complete.</p></details>';
 h+='<div class="bt3681-ledger-rows">'+p.rows.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(x=>
  '<div class="bt3681-ledger-row"><span><b>'+safe(dollars(x.amountCents))+'</b><small>'+safe(date(x.date))+' · '+safe(x.method)+' · '+(x.bankConfirmed?'Counted (you confirmed)':'Not confirmed')+'</small>'+(x.note?'<small>'+safe(x.note)+'</small>':'')+'</span>'+
  (!readonly?'<span class="bt3681-ledger-actions"><button type="button" class="bt360-link" onclick="openDepositRecord('+arg(e.id)+','+arg(x.id)+')">Edit</button><button type="button" class="bt360-link" onclick="voidDepositRecord('+arg(e.id)+','+arg(x.id)+')">Void</button></span>':'')+'</div>').join('')+'</div>';
 return h+'</div>';
}
// Store user confirmations in the existing checklist, keyed to the exact saved rule.
// Changed rules never inherit confirmation from a different source version.
function requirementRecord(e,r){
 return (Array.isArray(e.checklist)?e.checklist:[]).find(c=>c&&c.structuredRequirementId===r.id&&c.structuredRequirementSource===JSON.stringify(r))||null;
}
// One read-only count for details, compact cards and the attention panel.
function requirementProgress(e){
 const list=Array.isArray(e?.financialRules?.requirements)?e.financialRules.requirements:[];
 const linked=new Set(list.map(r=>requirementRecord(e,r)).filter(Boolean));
 const extra=(Array.isArray(e?.checklist)?e.checklist:[]).filter(c=>c&&String(c.text||'').trim()&&!linked.has(c));
 const fallback=!list.length&&(String(e?.completeBonusText||'').trim()||Number(e?.reqDays)>0)?1:0;
 const pending=e?.reqMet?[]:list.filter(r=>!requirementRecord(e,r)?.done);
 const total=list.length+extra.length+fallback;
 const done=(e?.reqMet?list.length+fallback:list.length-pending.length)+extra.filter(c=>c.done).length;
 const next=pending.length?requirementTitle(pending[0],e):!e?.reqMet&&fallback?'Complete bonus requirements':extra.find(c=>!c.done)?.text||'';
 return {total,done,remaining:total-done,percent:total?Math.round(done/total*100):0,next};
}
function toggleRequirement(id,ruleId){
 const current=entries.find(e=>e.id===id);
 if(!current||current.closed||current.reqMet||current.bonusRecd)return false;
 const rule=current.financialRules?.requirements?.find(r=>r.id===ruleId);
 if(!rule||!String(rule.id||'').trim())return false;
 const next=entries.map(e=>{
  if(e.id!==id)return e;
  const copy={...e,checklist:(e.checklist||[]).map(c=>({...c}))};
  let record=requirementRecord(copy,rule);
  if(!record){record={id:btMakeLegacyInlineId('ck',id,copy.checklist.length),text:requirementTitle(rule,e),done:false,structuredRequirementId:rule.id,structuredRequirementSource:JSON.stringify(rule)};copy.checklist.push(record)}
  record.done=!record.done;
  appendEntryHistory(copy,record.done?'checklist_completed':'checklist_reopened',record.text);
  return copy;
 });
 if(!saveEntriesStrict(next))return false;
 entries=next;expanded=id;R();return true;
}
function requirementRows(e){
 const list=Array.isArray(e.financialRules?.requirements)?e.financialRules.requirements:[];
 const done=!!e.reqMet,legacy=!list.length?String(e.completeBonusText||'').trim():'';
 let rows='';
 if(done){
  const completionDate=archiveDateValid(e.reqMet)?date(e.reqMet):'Saved date needs correction';
  rows='<div class="bt360-check bt3611-requirement bt3686-complete done">'+
   '<button type="button" role="checkbox" aria-label="Edit requirements completion date" aria-checked="true" onclick="openReqMet('+arg(e.id)+')">✓</button>'+
   '<div class="bt3611-req-body"><b>Requirements completed</b><small>Saved on '+safe(completionDate)+'</small></div></div>';
  if(list.length||legacy){
   const descriptions=list.length?list.map(r=>'<li>'+safe(requirementTitle(r,e))+(r.text&&r.text!==requirementTitle(r,e)?'<small>'+safe(r.text)+'</small>':'')+'</li>').join(''):'<li>'+safe(legacy)+'</li>';
   rows+='<details class="bt3686-saved-reqs"><summary>See saved requirements</summary><ul>'+descriptions+'</ul></details>';
  }
 }else{
  rows=list.map(r=>{
   const due=detailRequirementDate(e,r),balance=window.BTFinancialRules?.balanceMeasurementWindow?.(e,r),name=requirementTitle(r,e,balance);
   const checked=!!requirementRecord(e,r)?.done;
   const target=balance?new Date(balance.start+'T00:00:00Z'):null;
   if(target)target.setUTCDate(target.getUTCDate()-4);
   const fundTarget=target?target.toISOString().slice(0,10):'';
   const isObservedFunding=r.kind==='new-money'&&/\b(?:observed|displayed)\b/i.test(String(r.text||''))&&Number(e.fundingAmount)>=Number(r.amount)&&Number(r.amount)>0;
   const note=balance?'Days '+balance.firstDay+'–'+balance.lastDay+' after opening · '+(balance.lastDay-balance.firstDay+1)+' days':isObservedFunding?(checked?'':'Confirm when your opening deposit has arrived'):due?'Due '+date(due):checked?'':'Not checked yet';
   const balanceInfo=balance?'<small class="bt3695-balance-period"><b>'+safe(date(balance.start))+' – '+safe(date(balance.end))+'</b></small><small>The bank uses your average balance across the accounts that qualify for this offer.</small><small>Suggested: have the money arrive by '+safe(date(fundTarget))+' to allow extra time for transfers.</small>':'';
   return '<div class="bt360-check bt3611-requirement '+(checked?'done':'')+'"><button type="button" role="checkbox" aria-label="'+safe(name)+'" aria-checked="'+checked+'" onclick="BT360.toggleRequirement('+arg(e.id)+','+arg(r.id)+')">'+(checked?'✓':'')+'</button>'+
    '<div class="bt3611-req-body"><b>'+safe(name)+'</b>'+(checked?'<small>Confirmed by you</small>':'')+(note?'<small>'+safe(note)+'</small>':'')+balanceInfo+
    (r.text?'<details class="bt3611-evidence"><summary>Offer details</summary><p>'+safe(r.text)+'</p></details>':'')+'</div></div>';
  }).join('');
  if(!list.length&&(legacy||Number(e.reqDays)>0)){
   const due=typeof reqDeadline==='function'?reqDeadline(e):'';
   rows='<div class="bt360-check bt3611-requirement"><button type="button" role="checkbox" aria-label="Mark all requirements completed" aria-checked="false" onclick="openReqMet('+arg(e.id)+')"></button>'+
    '<div class="bt3611-req-body"><b>Complete bonus requirements</b><small>'+safe(due?'Due '+date(due):legacy||'Not completed yet')+'</small></div></div>';
  }
 }
 const linked=new Set(list.map(r=>requirementRecord(e,r)).filter(Boolean));
 const tasks=Array.isArray(e.checklist)?e.checklist:[];
 rows+=tasks.map((c,i)=>linked.has(c)?'':'<div class="bt360-check bt3611-task '+(c.done?'done':'')+'"><button type="button" role="checkbox" aria-label="'+safe(c.text||'Task')+'" aria-checked="'+!!c.done+'" onclick="toggleCk('+arg(e.id)+','+i+')">'+(c.done?'✓':'')+'</button><button type="button" class="bt366-row-edit" onclick="runBankAction('+arg(e.id)+',\'checklist\')"><b>'+safe(c.text||'Task')+'</b><small>'+(c.done?'Done':'Checklist task')+'</small></button></div>').join('');
 const progress=requirementProgress(e);
 return {html:rows,count:progress.total,remaining:progress.remaining};
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
 if(e.bonusRecd||e.closed)return '';
 const engine=window.BTFinancialRules;
 const estimate=engine?.estimatedArrival?.(e),label=engine?.arrivalLabel?.(estimate);
 if(label)return '<p class="bt3684-arrival" data-source="'+(engine?.arrivalSource?.(e)?'matched-offer-payout':'saved-payout')+'">'+safe(label)+'</p>';
 const payout=e.financialRules?.payout;
 const rule=payout?.window||payout?.timing||engine?.payoutWindowFromText?.(payout?.evidence?.quote||payout?.text||e.payoutTimingText);
 let help=rule?'The saved payout rule needs additional dates or calendar details before a range can be calculated.':'The saved offer is missing its payment timing. Add the original payout terms to calculate a date range.';
 if((e.financialRules||Number(e.schemaVersion)>=3)&&!engine?.validate?.(e)?.ok)help='The saved offer rules need correction before a date range can be calculated.';
 else if(rule?.basis==='reqmet'&&!e.reqMet)help='Finish the requirements and record the completion date to see your date range.';
 else if(rule?.basis==='opened'&&!archiveDateValid(e.opened))help='Add your account opening date to see your date range.';
 else if(rule?.basis==='enrollment'&&!e.offerEnrollmentDate&&!e.couponEnrollmentDate)help='Add your offer enrollment date to see your date range.';
 return '<section class="bt3684-arrival bt3686-arrival-help" aria-label="Estimated bonus arrival"><b>Estimated bonus arrival</b><p>'+safe(help)+'</p></section>';
}
// The enrolled structured rule is authoritative over a legacy day counter.
// If its clock is not calculable (business days, cycles, unknown start), do
// not substitute an apparently exact date from an unrelated legacy field.
function firstUnmetRequirementDate(e){
 if(e.reqMet||e.bonusRecd||e.closed)return '';
 return typeof reqDeadline==='function'?(reqDeadline(e)||''):'';
}
function requirementCountdown(e){
 const due=e.reqMet?'':firstUnmetRequirementDate(e);
 if(!due)return '';
 const days=dB(td(),due);
 return days<0?'Overdue '+Math.abs(days)+' days':days===0?'Due today':days+' days left';
}
function derivedRequirementTimers(e,timers){
 if(e.reqMet||e.bonusRecd||e.closed)return '';
 const requirements=Array.isArray(e.financialRules?.requirements)?e.financialRules.requirements:[];
 const dueDates=new Set();
 const rows=requirements.map(rule=>{
  const due=detailRequirementDate(e,rule);
  if(!due||dueDates.has(due))return '';
  // A saved manual reminder already represents this deadline: do not double-display it.
  if(timers.some(t=>String(t.date||'')===due&&/requirement|deposit|qualify|funding/i.test(String(t.text||''))))return '';
  dueDates.add(due);
  const heading=requirementTitle(rule,e);
  const elapsed=dB(td(),due),chip=elapsed<0?'Overdue '+Math.abs(elapsed)+'d':elapsed===0?'Today':elapsed+' days';
  return '<details class="bt3611-timer-row bt3621-derived" data-source="saved-requirement"><summary><span class="bt3611-timer-icon" aria-hidden="true">'+timerSvg('date')+'</span><span class="bt3611-timer-body"><b>Requirement due</b><small>'+safe(date(due))+' · from saved offer terms</small></span><span class="bt360-chip '+(elapsed<0?'warning':'')+'">'+safe(chip)+'</span></summary><div class="bt3611-timer-full">'+safe(heading)+(rule.text?'<p>'+safe(rule.text)+'</p>':'')+'<p>Derived from saved requirements · not an added reminder</p></div></details>';
 }).join('');
 const balance= requirements.map(rule=>{
   const w=window.BTFinancialRules?.balanceMeasurementWindow?.(e,rule);
   if(!w)return '';
   const recommended=new Date(w.start+'T00:00:00Z');recommended.setUTCDate(recommended.getUTCDate()-4);
   const target=recommended.toISOString().slice(0,10);
   return '<details class="bt3611-timer-row bt3621-derived" data-source="official-balance-window"><summary><span class="bt3611-timer-icon" aria-hidden="true">'+timerSvg('date')+'</span><span class="bt3611-timer-body"><b>Keep your balance</b><small>Days '+w.firstDay+'–'+w.lastDay+' · '+safe(date(w.start))+' – '+safe(date(w.end))+'</small></span><span class="bt360-chip">'+(w.lastDay-w.firstDay+1)+' days</span></summary><div class="bt3611-timer-full">Keep an average balance of '+safe(amount(rule.amount))+' across your qualifying accounts from day '+w.firstDay+' through day '+w.lastDay+' after opening. Check this requirement when you have finished the full period.</div></details>'+
   '<details class="bt3611-timer-row bt3621-derived" data-source="funding-plan"><summary><span class="bt3611-timer-icon" aria-hidden="true">'+timerSvg('date')+'</span><span class="bt3611-timer-body"><b>Suggested deposit date</b><small>'+safe(date(target))+' · extra time for transfers</small></span><span class="bt360-chip">Suggested</span></summary><div class="bt3611-timer-full">Try to have the money arrive by '+safe(date(target))+'. The bank starts counting your balance on '+safe(date(w.start))+'. This suggested date allows extra time for transfers; weekends and holidays can cause delays.</div></details>';
 }).join('');
 return rows+balance;
}
// Saved one-off qualification reminders belong to the previous cycle once
// requirements or payout are recorded. This is presentation-only: never
// delete or complete the user's timer, and preserve ongoing fee reminders.
function pastCycleReminder(e,t){
 if(!e?.reqMet&&!e?.bonusRecd&&!e?.closed)return false;
 const kind=String(t?.kind||'').toLowerCase();
 const label=timerShortTitle(t);
 const words=String(t?.text||'').toLowerCase();
 const feeOrHold=/monthly|recurring|service fee|maintenance fee|fee review|waiver|hold|closing|close review|minimum balance/.test(words)
  ||/^(?:fee|monthly-fee|hold|close|close-review)$/.test(kind);
 if(feeOrHold)return false;
 if(e.bonusRecd||e.closed){
  if(kind==='payout'||label==='Bonus pending'||/bonus (?:payment|payout|watch|pending)/.test(words))return true;
 }
 return /^(?:requirement|qualifying-deposit|deposit-deadline|funding-deadline|bonus-tier)$/.test(kind)
  ||['Requirement due','Funding due','Day 90 bonus tier'].includes(label)
  ||/\b(?:qualifying deposits?|direct deposit deadline|deposit requirement|requirement deadline|bonus requirement|funding deadline)\b/.test(words);
}
function pastCycleReminderHistory(e){
 const past=(Array.isArray(e.customTimers)?e.customTimers:[]).filter(t=>pastCycleReminder(e,t));
 if(!past.length)return '';
 return '<details class="bt389-past-reminders"><summary>Previous cycle reminders ('+past.length+')</summary>'
  +past.map(t=>'<div class="bt389-history-row"><span>'+safe(String(t.text||'Saved reminder'))+' · '+safe(t.date?date(t.date):'No date')+'</span>'
   +'<button type="button" class="bt360-link" onclick="openTimerEditor('+arg(e.id)+','+arg(t.id)+')">Edit</button></div>').join('')
  +'</details>';
}
function timerRows(e){
 const timers=(Array.isArray(e.customTimers)?e.customTimers:[]).filter(t=>!pastCycleReminder(e,t));
 const rows=timers.map(t=>{
  const title=timerShortTitle(t),detail=String(t.text||'Timer'),kind=/payout|bonus/i.test(title)?'payout':/close|hold/i.test(title)?'close':'date';
  return '<details class="bt3611-timer-row"><summary><span class="bt3611-timer-icon" aria-hidden="true">'+timerSvg(kind)+'</span><span class="bt3611-timer-body"><b>'+safe(title)+'</b><small>'+safe(timerFriendlyDate(t,e))+'</small></span><span class="bt360-chip '+(!t.date?'warning':'')+'">'+safe(timerChip(t))+'</span></summary><div class="bt3611-timer-full">'+safe(detail)+(t.startDate&&t.daysRequired?'<p>Started '+safe(date(t.startDate))+' · '+Number(t.daysRequired)+' days · due '+safe(date(t.date))+'</p>':'')+'<button class="bt360-link" type="button" onclick="openTimerEditor('+arg(e.id)+','+arg(t.id)+')">Edit timer</button></div></details>';
 }).join('');
 return rows+derivedRequirementTimers(e,timers);
}
function waiverCondition(c){
 if(c?.operator&&Array.isArray(c.conditions))return c.conditions.map(waiverCondition).join(c.operator==='all'?' + ':' · ');
 const money=Number.isFinite(Number(c?.amount))&&c?.amount!==undefined?amount(c.amount):'';
 const raw=String(c?.text||'');
 if(c?.kind==='direct-deposit')return (money?money+'+ ':'')+( /electronic/i.test(raw)?'electronic deposits':'direct deposits');
 if(c?.kind==='balance-hold'){
  let type=/average/i.test(c.metric||'')?'average balance':/beginning/i.test(c.metric||'')?'balance at the start of each day':'daily balance';
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
 return {record,historical:true,source:source||'saved account terms'};
}
function feeSnapshot(e){
 const historicalProjection=lastSavedCooldownFeeRecord(e);
 e=historicalProjection.record;
 // Read-only view of each enrolled record, including pre-financialRules imports.
 // A current bank product page is not evidence of a historical account's terms.
 const primary=e.financialRules?.accounts?.find(a=>a?.role==='primary')||null;
 const fee=primary?.fee;
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
  summary=(waiver.operator==='all'?'Meet all':waiver.operator==='any'?'Meet any one':'')+(waiver.operator==='all'||waiver.operator==='any'?': ':'')+waiver.conditions.map(waiverCondition).join(waiver.operator==='all'?' + ':' · ');
  waiverSource=original(waiver?.evidence?.quote);
 }else{
  const text=original(e.monthlyFeeWaiverText,e.analysis?.monthlyFeeWaiverText,e.avoidMonthlyFeeText,e.analysis?.avoidMonthlyFeeText);
  if(text){
   const operator=/\s+or\s+|\bany (?:one|of)\b/i.test(text)?'ANY':/\s+and\s+|\ball of\b/i.test(text)?'ALL':'';
   summary=(operator==='ALL'?'Meet all: ':operator==='ANY'?'Meet any one: ':'')+text.replace(/^(?:the\s+)?(?:monthly\s+)?(?:fee|maintenance fee)[^.]{0,35}?(?:waived|avoided)[^.]{0,25}?(?:if|with|when)\s+/i,'')
    .replace(/\s+or\s+/gi,' · ').replace(/\s+and\s+/gi,' + ').replace(/[.]$/,'');
   waiverSource=text;
  }
 }
 const companions=(Array.isArray(e.financialRules?.accounts)?e.financialRules.accounts:[])
  .filter(a=>a?.role!=='primary'&&a?.required===true).map(a=>{
   const f=a.fee,label=String(a.label||'Companion account');
   const charge=typeof f?.amount==='number'&&Number.isFinite(f.amount)?amount(f.amount):'Fee not confirmed';
   const minimum=typeof a.minimumBalance?.amount==='number'?' · membership minimum '+amount(a.minimumBalance.amount):'';
   const waivers=f?.waiver?.conditions?.length?' · avoid fee: '+(f.waiver.operator==='all'?'meet all: ':f.waiver.operator==='any'?'meet any one: ':'')+f.waiver.conditions.map(waiverCondition).join(f.waiver.operator==='all'?' + ':' · '):'';
   return label+': '+charge+minimum+waivers;
  });
 if(checkingNoFee&&!companions.length){
  const share=String(e.monthlyFeeYNText||'').match(/(?:required\s+)?(?:share\s+savings|savings)\s*:\s*(\$\s*[\d,.]+\s*\/\s*month)[^.;]*/i);
  if(share)companions.push('Share Savings: '+share[1].replace(/\s+/g,' ')+' · '+String(e.monthlyFeeWaiverText||'').trim());
 }
 const terms=[monthlyQuote,waiverSource,e.monthlyFeeWaiverText,e.avoidMonthlyFeeText,fee?.evidence?.quote,e.feeScheduleRaw]
  .map(v=>String(v||'').trim()).filter(Boolean);
 if(historicalProjection.historical&&monthly==='Not confirmed')monthly='Not listed in saved terms';
 const source=String(e.feeScheduleSourceUrl||'').trim();
 return {monthly,monthlyKnown,companions,summary:summary||'Waiver conditions not confirmed',terms:[...new Set(terms)].join('\n\n'),
  historical:historicalProjection.historical,historicalSource:historicalProjection.source,source:/^https:\/\/[^<>"'\s]+$/i.test(source)?source:''};
}
function feeDetail(e){
 const x=feeSnapshot(e);
 const monthlyExtra=x.monthly==='$0'?'No monthly account fee in saved terms':(x.summary==='Waiver conditions not confirmed'?(x.historical?'No waiver conditions recorded':x.summary):'How to avoid this fee: '+x.summary);
 return '<div class="bt3613-fees">'
  +(x.historical?'<p class="bt3617-historical-note">Last saved · '+safe(x.historicalSource)+' · for historical reference</p>':'')
  +'<div class="bt3613-fee-line"><span>Monthly fee</span><div><b class="'+(x.monthlyKnown||x.historical?'':'bt3611-amber')+'">'+safe(x.monthly)+'</b><small class="bt3613-waiver-clamp">'+safe(monthlyExtra)+'</small>'
  +(x.companions.length?'<small class="bt3614-companion">Also required: '+safe(x.companions.join(' | '))+'</small>':'')
  +(x.terms?'<details class="bt3611-full-terms"><summary>View saved fee terms</summary><p>'+safe(x.terms)+'</p></details>':'')
  +(x.source?'<a class="bt360-link bt3614-fee-source" href="'+safe(x.source)+'" target="_blank" rel="noopener noreferrer">Fee schedule ↗</a>':'')
  +'</div></div>'
  +'</div>';
}
function closeDateInfo(e){
 const calendarHold=window.BTFinancialRules?.closeHoldInfo(e);
 if(calendarHold)return {value:date(calendarHold.reviewOn),note:calendarHold.months+' calendar months from opening · hold through '+date(calendarHold.holdUntil),action:false};
 const close=e.financialRules?.closure,rawSource=String(close?.evidence?.quote||e.closeRuleText||'').trim();
 const source=/(?:remain|keep|stay|maintain)[^.]{0,75}\bopen\b|(?:bonus|reward)[^.]{0,100}(?:forfeit|repay|clawback|reclaim|deduct|reverse)|(?:forfeit|repay|clawback|reclaim|deduct|reverse)[^.]{0,100}(?:bonus|reward)/i.test(rawSource)?rawSource:'';
 const basis=String(close?.basis||e.closeRuleBasis||'').toLowerCase();
 const ruleDays=Number(close?.minHoldDays??e.minHoldDays??0);
 if(window.BTFinancialRules?.retentionNeedsReview?.(e))return {value:'Closing rule needs review',note:'Check bonus-retention restrictions',action:true};
 if(!source)return {value:'Close terms missing',note:'Save the keep-open or bonus-retention restriction',action:true};
 if(basis==='bonus'&&!e.bonusRecd)return {value:'After bonus arrives',note:ruleDays?ruleDays+'-day hold starts at payout':'Close timing starts at payout',action:false};
 if(basis==='reqmet'&&!e.reqMet)return {value:'After requirements',note:ruleDays?ruleDays+'-day hold starts after qualification':'Close timing starts after qualification',action:false};
 const computed=typeof safeCloseDate==='function'?safeCloseDate(e):'';
 if(!computed)return {value:'Date not available yet',note:'Review the saved close rule',action:true};
 const basisLabel=basis==='bonus'?'payout':basis==='reqmet'?'requirements':basis==='opened'?'opening':'saved rule';
 const delay=ruleDays>0?ruleDays+' days from '+basisLabel:'From saved close restrictions';
 return {value:date(computed),note:delay,action:false};
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
 const policy=window.btEligibilityPolicyEntry?.(e)||e;
 let recorded=null;try{recorded=gate?.recorded?.(policy)}catch{}
 if(recorded?.ok&&recorded.decision==='nonrepeatable')return {value:'Not repeatable',note:'Offer permits one bonus only',action:false};
 if(info?.recorded&&info.eligible){
  const controlling=info.controlling;
  const p=controlling?.period?gate.periodLabel(controlling.period):'Saved eligibility rules';
  const basis=controlling?.basis?gate.anchorLabel(controlling.basis):'eligibility start';
  return {value:date(info.eligible),note:p+' from '+basis+' · app adds 2 extra days',action:false};
 }
 if(info?.eligible)return {value:date(info.eligible),note:'Using the saved waiting period',action:false};
 if(recorded?.ok&&recorded.decision==='repeatable'){
  const rules=recorded.rules||[];
  const pending=rules.find(r=>!r.anchorDate&&['account-closed','account-ownership-ended','bonus-received'].includes(r.basis));
  if(pending){
   const clocks=rules.filter(r=>['account-closed','account-ownership-ended','bonus-received'].includes(r.basis));
   const hasBonus=clocks.some(r=>r.basis==='bonus-received');
   const hasClosure=clocks.some(r=>r.basis==='account-closed'||r.basis==='account-ownership-ended');
   const anchor=hasBonus&&hasClosure?'bonus payment and account closure':hasBonus?'bonus payment':'account closure';
   const proof=clocks.map(r=>gate.periodLabel(r.period)+' after '+(r.basis==='bonus-received'?'bonus payment':'account closure')).join(' · ');
   return {value:'After '+anchor,note:proof+' · all waiting periods must finish, plus 2 extra days',action:false};
  }
  return {value:'Date not available yet',note:'Record the date that starts the waiting period',action:true};
 }
 if(e?.closed)return {value:'Add eligibility rule',note:savedCooldownChurnExcerpt(e)||'Add the bank’s waiting period and starting event',action:true};
 return {value:'Add eligibility rule',note:'Add the repeat-bonus rule to plan your next cycle',action:true};
}
function dateActionRow(e,label,info,kind){
 const x=info||{value:'Date unavailable',note:'Add the bank’s eligibility rule',action:true};
 return '<div class="bt3613-date-row"><span>'+safe(label)+'</span><div><b>'+safe(x.value)+'</b><small>'+safe(x.note)+'</small>'+(x.action?'<button type="button" class="bt3611-set-rule" onclick="BT360.openRuleEditor('+arg(e.id)+','+arg(kind)+')">Review rule</button>':'')+'</div></div>';
}
function openRuleEditor(id,kind){
 if(typeof openEdit!=='function')return;
 openEdit(id);
 if(kind==='close'&&typeof window.btWizardStep==='function')window.btWizardStep(3);
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

// Closing checklist is a read-only projection of documented retention rules.
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
 const calendarHold=window.BTFinancialRules?.closeHoldInfo(e);
 if(calendarHold){
  const met=dB(td(),calendarHold.reviewOn)<=0;
  return [
    {ok:met,label:'12-month retention period',detail:(met?'Hold completed · ':'Hold through ')+date(calendarHold.holdUntil)+' · closure review '+date(calendarHold.reviewOn)},
    {ok:met&&!!e.bonusRecd,label:'Bonus retention check',detail:!e.bonusRecd?'Wait for actual bonus payment':met?'Required hold elapsed · review repayment terms':'Do not close before the hold expires'},
    {ok:false,label:'Closing balance',detail:'Confirm pending charges, transfers and final balance with the bank'}
  ];
 }
 const financial=e.financialRules?.closure;
 const hold=typeof safeCloseDate==='function'?safeCloseDate(e):'';
 const remaining=hold?dB(td(),hold):null;
 const hasHold=Number(e.minHoldDays)>0;
 const holdMet=hasHold&&Number.isFinite(remaining)&&remaining<=0;
 const closure=e.financialRules?.closure;
 const paidPayoutOnly=!hasHold&&!!e.bonusRecd&&closure?.restrictionType==='payout-only'
  &&closure?.minHoldDays===0&&/\b(?:until|through|after|once|when|before)\b.{0,90}\bbonus\b/i.test(String(closure?.evidence?.quote||''))
  &&/\bbonus\b/i.test(String(e.closeRuleText||closure?.text||''));
 const retentionSaved=retentionEvidenceCleared(e,holdMet);
 return [
  {ok:holdMet||paidPayoutOnly,label:'Minimum hold met',detail:hasHold?(holdMet?'Open '+Number(e.minHoldDays)+' days · cleared '+date(hold):'Hold until '+(hold?date(hold):'Needs review')):paidPayoutOnly?'No separate fixed hold · payout-only condition satisfied':'No documented minimum hold · Needs review'},
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
 const arrivalSource=window.BTFinancialRules?.arrivalSource?.(e);
 const text=(label,value)=>value.trim()?'<details class="bt3640-source-text"><summary>'+label+'</summary><pre>'+safe(value)+'</pre></details>':'';
 return accountSection(e,'terms','Saved terms','<dl class="bt3653-evidence" aria-label="Saved source evidence">'+status.rows.map(([label,value])=>'<div><dt>'+safe(label)+'</dt><dd>'+safe(value)+'</dd></div>').join('')+'</dl><p class="bt360-muted">Saved evidence describes this record. Current offer availability and personal eligibility require a separate check.</p>'+text('Read original promotion',raw)+(!raw.trim()?text('Read saved review text',review):'')+text('Read fee schedule',fees)+(arrivalSource?text('Read matched offer payout rule',arrivalSource.quote+'\nOfficial source: '+arrivalSource.sourceUrl+'\nChecked: '+arrivalSource.verifiedAt+'\nThis reference does not replace saved terms or confirm qualification.'):'')+'<button type="button" class="bt360-source bt3613-source" onclick="BT360.showTerms('+arg(e.bank)+')">View saved sources in Archive ›</button>',status.label);
}
// One section order for every bank. Lifecycle changes content/actions, never the layout.
// Unknown retention is omitted; closing dates are review dates, not a safety promise.
function closingPanel(e){
 const closing=closeDateInfo(e);
 const rows=[];
 if(!e.bonusRecd)rows.push({label:'Bonus payment',detail:'Wait until the bonus is in your account.'});
 rows.push({label:'Before you close',detail:'Check pending payments and transfers. Confirm the final balance with the bank.'});
 return '<div data-bt-hold>'+accountSection(e,'closing','Closing the account',
  '<div class="bt3613-dates">'+dateActionRow(e,'Review date',closing,'close')+'</div>'
  +'<div class="bt388-close-notes">'+rows.map(row=>'<div class="bt388-close-note"><b>'+safe(row.label)+'</b><p>'+safe(row.detail)+'</p></div>').join('')+'</div>'
  +(e.bonusRecd&&!e.closed?'<div class="bt389-record-closure"><button type="button" class="bt360-link" onclick="startCloseFlow('+arg(e.id)+',\'actual\')">Already closed at the bank? Save closure date</button></div>':''),
  e.closed?'Closed '+date(e.closed):'Check before closing','',!e.closed&&!!e.bonusRecd)+'</div>';
}
function nextCyclePanel(e){
 const complete=!!e.bonusRecd,closed=!!e.closed;
 const projected=eligibilityDateInfo(e,eligibleInfo(e));
 const info=!complete&&!closed&&projected.value==='Add eligibility rule'
  ?{value:'After this bonus',note:'Complete the current bonus before reviewing the next offer',action:false}
  :projected;
 const intro=complete?'<p class="bt389-cycle-status">Bonus received '+safe(date(e.bonusRecd))+' · '+(closed?'Account closed '+safe(date(e.closed)):'Account still open')+'</p>':'';
 const label=complete||closed?'Next bonus review':'Future bonus review';
 return accountSection(e,'eligibility','Next bonus cycle',intro+
  '<div class="bt3613-dates">'+dateActionRow(e,label,info,'eligibility')+'</div>',
  info.value==='Not repeatable'?'One-time offer':info.action?'Rule review needed':info.value,'',complete||closed);
}
// Simple, stage-driven presentation. This is read-only: old notes, offer terms,
// reports, timers, archive history, eligibility evidence and fee rules stay saved.
function simpleDates(e){
 const rows=recordedAccountDateRows(e);
 return '<section class="bt3810-card bt3810-dates'+(e.closed?'':' bt3810-dates--open')+'" aria-label="Recorded account dates"><h3>Key dates</h3><dl>'
  +rows.map(([key,label])=>'<div><dt>'+label+'</dt><dd class="'+(archiveDateValid(e[key])?'':'is-missing')+'">'
   +safe(archiveDateValid(e[key])?date(e[key]):e[key]?'Needs review':'—')+'</dd></div>').join('')
  +'</dl></section>';
}
function simpleRequirements(e){
 if(e.reqMet||e.bonusRecd||e.closed)return '';
 const list=Array.isArray(e.financialRules?.requirements)?e.financialRules.requirements:[];
 const checks=Array.isArray(e.checklist)?e.checklist:[];
 const progress=requirementProgress(e);
 const linked=new Set(list.map(r=>requirementRecord(e,r)).filter(Boolean));
 const shownDates=new Set();
 const rows=list.map(r=>{
  // Recurring offers keep their exact schedule and conditions visible.
  const label=r.recurrence&&String(r.text||'').trim()?String(r.text).replace(/\s+/g,' ').trim():requirementTitle(r,e),checked=!!requirementRecord(e,r)?.done;
  const due=checked?'':detailRequirementDate(e,r);
  const balance=window.BTFinancialRules?.balanceMeasurementWindow?.(e,r);
  const when=balance?date(balance.start)+' – '+date(balance.end)+' · Days '+balance.firstDay+'–'+balance.lastDay:due?'Due '+date(due):'';
  if(balance){shownDates.add(balance.start);shownDates.add(balance.end)}else if(due)shownDates.add(due);
  return '<div class="bt3810-task"><button type="button" role="checkbox" aria-label="'+safe(label)+'" aria-checked="'+checked+'" onclick="BT360.toggleRequirement('+arg(e.id)+','+arg(r.id)+')">'+(checked?'✓':'')+'</button>'
   +'<span><b>'+safe(label)+'</b>'+(when?'<small>'+safe(when)+'</small>':'')+'</span></div>';
 }).join('');
 const extras=checks.map((c,i)=>({c,i})).filter(({c})=>c&&String(c.text||'').trim()&&!linked.has(c))
  .map(({c,i})=>'<div class="bt3810-task"><button type="button" role="checkbox" aria-label="'+safe(c.text||'Task')+'" aria-checked="'+!!c.done+'" onclick="toggleCk('+arg(e.id)+','+i+')">'+(c.done?'✓':'')+'</button><span><b>'+safe(c.text||'Task')+'</b></span></div>').join('');
 let nextDate='';
 try{
  const next=window.btNextActionForEntry?.(e),context=next?.task?.context;
  const valid=context?.confirmed&&archiveDateValid(context.date);
  if(valid&&!shownDates.has(context.date)){
   const note=attentionDateNote({entryId:e.id,stageCode:next.stage?.code||'IN_PROGRESS',task:next.task,dateContext:context});
   nextDate='<p class="bt3818-task-date">'+safe(note)+'</p>';
  }
 }catch{}
 const fallback=!rows&&!extras?'<p class="bt3810-muted">'+(e.completeBonusText?'Complete the saved bonus requirements.':'Add your bonus requirements to start tracking.')+'</p>':'';
 const hasDeposit=list.some(r=>r?.kind==='direct-deposit')||/direct[ -]?deposits?|\bpayroll\b|\bq?dd\b/i.test(String(e.completeBonusText||''));
 const progressDD=typeof depositProgress==='function'?depositProgress(e):null;
 const cents=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:Number(n)%100===0?0:2,maximumFractionDigits:2}).format(Number(n||0)/100);
 const deposit=hasDeposit||progressDD?.recordedCount?
  '<div class="bt3810-deposit"><span>'+(progressDD?.recordedCount?cents(progressDD.totalCents)+' recorded · '+cents(progressDD.confirmedCents)+' confirmed':'')+'</span>'
  +'<button type="button" class="bt360-link" onclick="openDepositRecord('+arg(e.id)+')">Add deposit</button></div>':'';
 return '<section class="bt3810-card bt3810-requirements" aria-label="Requirements"><div class="bt3810-heading"><h3>Requirements</h3>'
  +(progress.total?'<span>'+progress.done+' of '+progress.total+' checked</span>':'')+'</div>'+nextDate+rows+extras+fallback+deposit
  +(progressDD?.recordedCount?'<details class="bt3810-recorded-deposits"'+(accountSections.get(String(e.id)+'|deposits')?' open':'')+' ontoggle="BT360.setAccountSectionOpen('+arg(e.id)+',\'deposits\',this.open)"><summary>View recorded deposits</summary>'+depositLedgerHtml(e)+'</details>':'')
  +'<button type="button" class="bt360-link bt3810-add-task" onclick="runBankAction('+arg(e.id)+',\'checklist\')">+ Add task</button></section>';
}
function simpleFees(e){
 if(e.closed)return '';
 const x=feeSnapshot(e);
 const monthly=x.monthlyKnown?x.monthly:'Not confirmed';
 return '<section class="bt3810-card bt3810-fees"><h3>Fees</h3><div class="bt3810-pair"><span>Monthly fee</span><b>'+safe(monthly)+'</b></div>'
  +(x.monthly!=='$0'&&x.summary&&x.summary!=='Waiver conditions not confirmed'?'<div class="bt3810-fee-note">Avoid fee: '+safe(x.summary)+'</div>':'')
  +x.companions.map(text=>'<div class="bt3810-fee-note">'+safe(text)+'</div>').join('')
  +'</section>';
}
function simpleNextCycle(e){
 if(!e.bonusRecd&&!e.closed)return '';
 const info=eligibleInfo(e);
 const policy=window.btEligibilityPolicyEntry?.(e)||e;
 const check=window.BTEligibilityGate?.recorded?.(policy);
 const nonrepeatable=check?.ok&&check.decision==='nonrepeatable';
 const value=nonrepeatable?'One-time bonus':info?.recorded&&info.eligible?date(info.eligible):'Add eligibility rule';
 return '<section class="bt3810-cycle bt3810-card"><div class="bt3810-pair"><span>Next bonus</span><b>'+safe(value)+'</b></div></section>';
}
function simpleState(e){
 const paid=!!e.bonusRecd,closed=!!e.closed,complete=!!e.reqMet;
 const name=closed?'Closed':paid?'Bonus received':complete?'Waiting for bonus':'In progress';
 const next=closed?'Account history is saved.':paid?'Record the closure date after the bank confirms the account is closed.':
  complete?'Record your bonus when it appears in your account.':'Complete the requirements to earn this bonus.';
 return '<section class="bt3810-card bt3810-status"><div class="bt3810-heading"><h3>'+safe(name)+'</h3></div><p>'+safe(next)+'</p></section>';
}
function detailPanels(e){
 // No expandable saved terms, history, redundant reminders or technical rule
 // panels on the everyday screen; the complete data remains in storage/Archive.
 let html='<div class="bt3810-detail">'+simpleState(e);
 if(!e.reqMet&&!e.bonusRecd&&!e.closed)html+=simpleRequirements(e);
 if(!e.closed&&!e.bonusRecd){
  const arrival=window.BTFinancialRules?.arrivalLabel?.(window.BTFinancialRules?.estimatedArrival?.(e));
  if(arrival)html+='<section class="bt3810-card bt3810-arrival"><div class="bt3810-pair"><span>Bonus payment</span><b>'+safe(arrival)+'</b></div></section>';
 }
 html+=simpleDates(e);
 html+=simpleFees(e);
 if(!e.closed&&e.bonusRecd){
  const calendar=window.BTFinancialRules?.closeHoldInfo?.(e);
  const hold=calendar?.reviewOn||(typeof safeCloseDate==='function'?safeCloseDate(e):'');
  const future=archiveDateValid(hold)&&hold>td();
  html+='<p class="bt3810-closing-note">'+(future?'Review closing restrictions through '+safe(date(hold))+'. ':'')
   +'Before closing, check fees, pending transfers, and your account balance. Recording closure only updates this tracker.</p>';
 }
 // Future eligibility belongs in Archive, not the current bank detail.
 return html+'</div>';
}
function detailFooter(e){
 const primary=primaryAction(e),secondary='openEdit('+arg(e.id)+')';
 return '<div class="bt360-detail-footer bt3810-footer" role="group" aria-label="Account actions">'
  +'<button type="button" onclick="'+secondary+'">Edit</button>'
  +'<button type="button" class="bt360-primary" aria-label="'+safe(primary.label+' for '+e.bank)+'" onclick="'+primary.command+'">'+safe(primary.label)+'</button></div>';
}
function showTerms(bank){archivePane='waiting';storageSearch=String(bank||'');expanded=null;tab='archive';R()}
function back(){expanded=null;window.bt360ArchiveDetailId=null;R();const el=document.querySelector('.scroll');if(el)el.scrollTop=0}
function goArchive(pane){archivePane='waiting';expanded=null;tab='archive';R()}
function archiveCountdown(info){
 if(!info?.eligible)return null;
 const remaining=dB(td(),info.eligible);
 if(!Number.isFinite(remaining))return null;
 const recorded=info.recorded===true;
 return {days:Math.max(0,remaining),recorded,caption:remaining<=0?'Review offer':'days left'};
}
function archive(rows){
 if(window.bt360ArchiveDetailId&&expanded){return window.rTracker(rows,true)}
 let h=segments()+'<div class="bt360-page-copy">Past accounts & saved terms</div><input class="sinput" type="search" id="terms-search" aria-label="Search archive banks and terms" placeholder="Search banks, dates or saved terms…" value="'+safe(storageSearch||'')+'" oninput="updateViewSearch(\'terms\',this.value,this.selectionStart)">';
 const query=String(storageSearch||'').trim().toLowerCase();
 const savedBuckets=termsDisplayBuckets();
 const savedText=e=>{const b=savedBuckets.find(x=>entryBankIdentity(x.current||x).key===entryBankIdentity(e).key);return b?[b.current,...(b.versions||[])].map(x=>[x.tcSourceRaw,x.feeScheduleRaw,x.completeBonusText,x.opened].join(' ')).join(' '):'';};
 const closed=rows.filter(e=>e.closed&&scope(e)&&(!query||[e.bank,e.opened,e.closed,e.tcSourceRaw,e.analyzedTC,savedText(e)].join(' ').toLowerCase().includes(query)));
 const indexed=closed.map(e=>({e,info:eligibleInfo(e)}));
 const ready=indexed.filter(x=>x.info?.recorded&&dB(td(),x.info.eligible)<=0);
 const soon=indexed.filter(x=>x.info?.recorded&&dB(td(),x.info.eligible)>0&&dB(td(),x.info.eligible)<=60);
 const cooling=indexed.filter(x=>!ready.includes(x)&&!soon.includes(x)).sort((a,b)=>(a.info?.eligible||'9999').localeCompare(b.info?.eligible||'9999'));
 window.BTBankBonusFeed?.ensureAutomaticChurnScan?.();
 h+=churnReviewMarkup(rows);
 h+='<div class="bt360-archive-stats"><div><b>'+ready.length+'</b><small>Ready for review</small></div><div><b>'+soon.length+'</b><small>Within 60 days</small></div><div><b>'+cooling.length+'</b><small>Still waiting</small></div></div>';
 h+='<p class="bt3727-archive-note">Review dates use the latest eligibility rule recorded for each bank. Check the current offer for rule changes before applying again.</p>';
 const row=(x,offer)=>{
  const historic='Last saved '+(Number(x.e.bonus)>0?amount(x.e.bonus)+' bonus':'bank offer')+
   (x.e.opened?' · opened '+date(x.e.opened):'')+' · '+(savedCooldownChurnExcerpt(x.e)||'eligibility date not recorded');
  const label=x.info?date(x.info.eligible)+' · '+x.info.label:historic;
  const count=archiveCountdown(x.info);
  const action=count
   ?'<div class="bt3727-archive-actions"><button type="button" class="bt3727-countdown is-recorded" onclick="BT360.openArchived('+arg(x.e.id)+')" aria-label="'+safe('Review '+x.e.bank+' eligibility in '+count.days+' days using the saved rule')+'"><strong>'+count.days+'</strong><small>'+safe(count.caption)+'</small></button>'+(offer?'<button type="button" class="bt3727-view-offers" onclick="BT360.viewOffers('+arg(x.e.bank)+')">View offers</button>':'')+'</div>'
   :'<button type="button" class="bt360-chip bt3727-no-date" onclick="BT360.openArchived('+arg(x.e.id)+')">Details</button>';
  const bucket=savedBuckets.find(b=>entryBankIdentity(b.current||b).key===entryBankIdentity(x.e).key);
  const versions=[...savedAccountCycles(x.e).slice(1),...(bucket?[bucket.current,...(bucket.versions||[])]:[])].filter(v=>v&&!(String(v.entryId||v.id||'')===String(x.e.id)&&v.opened===x.e.opened));
  const history=versions.length?'<details class="research-help archive-history"><summary>Previous accounts and saved terms · '+versions.length+'</summary>'+versions.map(v=>renderTermsCycle(v,true)).join('')+'</details>':'';
  return '<details class="bt-archive-bank"><summary class="bt360-list-row bt3727-archive-row">'+bankLogo(x.e.bank,true)+'<span class="bt360-grow"><b>'+safe(x.e.bank)+'</b><small>'+safe(label)+'</small><small>Dates, saved terms & history ▾</small>'+(audience==='all'?kindTag(x.e):'')+'</span>'+action+'</summary><div class="bt-archive-bank-body">'+renderTermsCycle(x.e)+history+'<button type="button" class="bt360-secondary" onclick="BT360.openArchived('+arg(x.e.id)+')">View account</button></div></details>';
 };
 h+=panel('Ready for review',ready.length?'<div class="bt360-list">'+ready.map(x=>row(x,true)).join('')+'</div>':'<p class="bt360-muted">No saved waiting periods have finished.</p>');
 h+=panel('Review within 60 days',soon.length?'<div class="bt360-list">'+soon.map(x=>row(x,false)).join('')+'</div>':'<p class="bt360-muted">No saved waiting periods finish in the next 60 days.</p>');
 h+=panel('Still waiting',cooling.length?'<div class="bt360-list">'+cooling.map(x=>row(x,false)).join('')+'</div>':'<p class="bt360-muted">No accounts in the waiting period.</p>','<span class="bt360-subtitle">soonest first</span>');
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

function validReminderDate(v){
 const date=String(v||'');
 return typeof archiveDateValid==='function'&&archiveDateValid(date)&&Number.isFinite(dB(td(),date))?date:'';
}
// Read-only and de-duplicated by bank cycle, reminder category and ID.
// Reminders never confer new-offer eligibility or alter financial records.
function upcomingReminders(rows){
 const results=[],seen=new Set();
 const push=(e,kind,title,detail,due,priority)=>{
  const id=String(e.id)+'|'+kind;if(seen.has(id))return;
  seen.add(id);results.push({entryId:e.id,bank:e.bank,kind,title,detail,due:due||'',
   days:due?dB(td(),due):null,priority});
 };
 rows.filter(e=>e?.id&&scope(e)).forEach(e=>{
  const code=stage(e).code;
  if(!e.closed){
   if(noticePrefs.deadlines&&!e.bonusRecd&&['ACTION_NEEDED','IN_PROGRESS'].includes(code)){
    let next;try{next=window.btNextActionForEntry?.(e)}catch{}
    const current=next?.task?.context?.confirmed?validReminderDate(next.task.context.date):'';
    const legacy=!e.reqMet&&typeof reqDeadline==='function'?validReminderDate(reqDeadline(e)):'';
    const due=current||legacy,days=due?dB(td(),due):null;
    if(days!==null&&days<=7)push(e,'requirement',days<0?'Review overdue requirement':days===0?'Requirement due today':'Requirement due soon',
      'Saved requirement deadline · verify qualifying activity',due,days<0?0:1);
    else if(code==='ACTION_NEEDED'&&!due)push(e,'terms','Review requirement or terms',
      'Action needed; exact deadline is not confirmed','',2);
   }
   if(noticePrefs.payouts&&e.reqMet&&!e.bonusRecd){
    const due=(Array.isArray(e.customTimers)?e.customTimers:[]).filter(t=>t&&!t.done&&
      (t.kind==='payout'||/\bbonus (?:payment|payout|expected|pending)\b/i.test(String(t.text||''))))
      .map(t=>validReminderDate(t.date)).filter(Boolean).sort()[0];
    if(due&&dB(td(),due)<=7)push(e,'payout',dB(td(),due)<0?'Review delayed bonus':'Review expected payout',
      'Saved payout reminder; no payment is assumed',due,dB(td(),due)<0?0:2);
   }
   if(noticePrefs.payouts&&code==='READY_TO_CLOSE')push(e,'close','Review closing checks',
     'Confirm actual holds, fees and pending transactions before closing','',1);
   if(noticePrefs.payouts&&code==='HOLD_OPEN'){
    const due=(Array.isArray(e.customTimers)?e.customTimers:[]).filter(t=>t&&!t.done&&
      (['hold','close-review'].includes(t.kind)||/\b(?:hold|close review)\b/i.test(String(t.text||''))))
      .map(t=>validReminderDate(t.date)).filter(Boolean).sort()[0];
    if(due&&dB(td(),due)<=7)push(e,'hold','Review saved hold period',
      'Do not close until all bank-specific restrictions are checked',due,2);
   }
   if(noticePrefs.deadlines){
    const due=(Array.isArray(e.customTimers)?e.customTimers:[]).filter(t=>t&&!t.done&&
      /\b(?:monthly|maintenance|service) fee\b|\bfee (?:check|review|due)\b/i.test(String(t.text||'')))
      .map(t=>validReminderDate(t.date)).filter(Boolean).sort()[0];
    if(due&&dB(td(),due)<=7)push(e,'fee','Review scheduled fee',
      'Saved fee-check date; verify waiver terms',due,2);
   }
  }
 });
 // No overdue or soon-to-expire cooldown alert without a current offer.
 if(noticePrefs.eligible){
  const found=window.BTBankBonusFeed?.automaticChurnMatches?.(rows)||[];
  found.forEach(x=>{
   const e=rows.find(e=>e.closed&&e.bank===x.bank&&accountAudience(e)===x.audience);
   if(e&&scope(e))push(e,'offer','Potential new signup bonus',
    'Fresh official offer evidence found; personal eligibility not confirmed','',2);
  });
 }
 return results.sort((a,b)=>a.priority-b.priority||(a.days??999)-(b.days??999)||
   String(a.bank).localeCompare(String(b.bank))||a.kind.localeCompare(b.kind));
}
function churnReviewPlan(rows){
 const offers=window.BTBankBonusFeed?.automaticChurnMatches?.(rows)||[];
 return offers.filter(x=>rows.some(e=>e.closed&&e.bank===x.bank&&accountAudience(e)===x.audience&&scope(e)));
}
function churnReviewMarkup(rows){
 // No verified offer means no UI card. Never nag for unknown rules or dates.
 const matches=churnReviewPlan(rows);
 if(!matches.length)return'';
 const cards=matches.slice(0,3).map(x=>
  '<article class="bt3682-plan-row"><span class="bt3682-plan-copy"><b>'+safe(x.bank)+'</b>'+
  '<small>'+safe(Number.isFinite(x.bonus)?amount(x.bonus)+' potential signup bonus':'Potential signup bonus')+'</small>'+
  '<small>Current official reward, fees and location checked · personal eligibility not guaranteed</small></span>'+
  '<span class="bt3682-plan-actions"><a class="bt360-primary bt3683-offer-link" href="'+safe(x.officialUrl)+'" target="_blank" rel="noopener noreferrer">Offer ↗</a></span></article>'
 ).join('');
 return '<section class="bt3682-plan bt3683-auto-offers" aria-label="Automated signup bonus matches"><header><h3>New bonus matches</h3><small>'+matches.length+' automatically screened</small></header>'+
  '<p>Matched to saved waiting periods and recently checked official sources. The bank must still confirm your eligibility.</p>'+
  '<div class="bt3682-plan-list">'+cards+'</div>'+
  (matches.length>3?'<small>Showing the three highest-ranked source-verified matches.</small>':'')+
  '</section>';
}
function settings(){
 const toggles=[['deadlines','Requirements and fee checks','Saved due dates and overdue'],['payouts','Payouts and closing','Dates and verified close checks'],['eligible','New bonus matches','Only when a current offer is source-verified']];
 const buttons=toggles.map(([k,label,description])=>'<button class="bt360-settings-row" role="switch" aria-checked="'+noticePrefs[k]+'" onclick="BT360.setNotice(\''+k+'\')"><span><b>'+label+'</b><small>'+description+'</small></span><i class="bt360-toggle '+(noticePrefs[k]?'checked':'')+'"></i></button>').join('');
 return '<div class="bt360-sheet-backdrop" onclick="BT360.closeSettings()"><section class="bt360-sheet" role="dialog" aria-modal="true" aria-label="Settings" onclick="event.stopPropagation()"><header><div><h2>Settings</h2><p>BonusTracker v'+safe(window.BT_APP_VERSION||'3.6.82')+'</p></div><button aria-label="Close settings" onclick="BT360.closeSettings()">×</button></header>'+
 cloudSettingsCard()+
 (window.BTICloudBackup?.isLocalOnly?.()?'':usageCard())+
 panel('Notifications',buttons+'<p class="bt360-muted">These preferences control in-app reminders for this session. No push notifications are sent.</p>')+
 panel('Data',(window.BTICloudBackup?.isLocalOnly?.()?'':'<button class="bt360-settings-row" onclick="BT360.closeSettings();exportBackup()">Export backup file <span>›</span></button><button class="bt360-settings-row" onclick="BT360.closeSettings();importBackup()">Restore from file <span>›</span></button>')+'<button class="bt360-settings-row" onclick="BT360.openPhonebook()">Bank phone numbers <span>›</span></button>')+
 '<button class="bt360-reset" onclick="BT360.closeSettings();resetAllData()">Reset this device <small>Two confirmations and a safety backup</small></button></section></div>';
}
let notificationPanelOpen=false;
function notifications(rows){
 const alerts=upcomingReminders(rows);
 const cards=alerts.map(x=>{
  const period=x.days===null?'Review':x.days<0?Math.abs(x.days)+'d overdue':x.days===0?'Today':'In '+x.days+'d';
  return '<button type="button" class="bt360-list-row bt3682-alert-row" onclick="BT360.openNotification('+arg(x.entryId)+','+arg(x.kind)+')">'+
    '<span class="bt3682-alert-icon" aria-hidden="true">'+(x.kind==='offer'?'↗':x.kind==='fee'?'$':x.kind==='payout'?'✓':'!')+'</span>'+
    '<span class="bt360-grow"><b>'+safe(x.title)+'</b><small>'+safe(x.bank)+' · '+safe(x.detail)+'</small></span>'+
    '<span class="bt360-chip">'+safe(period)+'</span></button>';
 }).join('');
 return '<div class="bt360-sheet-backdrop" onclick="BT360.closeNotifications()"><section class="bt360-sheet bt3682-reminders" role="dialog" aria-modal="true" aria-label="Notification center" onclick="event.stopPropagation()">'+
 '<header><div><h2>Reminders</h2><p>'+safe(audience==='all'?'All accounts':audience==='personal'?'Personal':'Business')+' · '+alerts.length+' currently actionable</p></div>'+
 '<button aria-label="Close notifications" onclick="BT360.closeNotifications()">×</button></header>'+
 panel('Upcoming and due',cards?'<div class="bt360-list bt3682-alert-list">'+cards+'</div>':'<p class="bt360-muted">No upcoming reminders in the selected categories.</p>')+
 '<p class="bt360-muted">Calculated from saved dates when you open BonusTracker. No background or push delivery. Dates are not bank confirmation.</p>'+
 '</section></div>';
}
function openNotifications(){notificationPanelOpen=true;window.bt360SettingsOpen=false;window.BTBankBonusFeed?.ensureAutomaticChurnScan?.();R()}
function closeNotifications(){notificationPanelOpen=false;R()}
function openNotification(id,kind){notificationPanelOpen=false;const e=entries.find(x=>x.id===id);if(!e)return;if(kind==='offer'){viewOffers(e.bank);return;}if(e.closed)openArchived(id);else openAccountFromActionCenter(id)}
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
window.BT360={dashboardStage,dashboardTaskTitle,attentionDateNote,accountFeeWarnings,monthlyFeeBadge,requirementProgress,attentionCardProgress,toggleRequirement,requirementRecord,sourceEvidenceStatus,sourceEvidencePanel,dashboardQueueFor,toggleAttention,toggleAccountList,openAccountSearch,closeAccountSearch,get selectedAttentionId(){return selectedAttentionId},get accountListOpen(){return accountListOpen},setAccountSectionOpen,revealAccountSection,cloudStatusText,accountDates,accountSaveStatus,infoRow,feeSnapshot,closeCheckPresentation,get audience(){return audience},get selectedStage(){return selectedStage},get archivePane(){return archivePane},get notificationsOpen(){return notificationPanelOpen},scope,accountAudience,kindTag,segments,setAudience,setStage,heroMonthData,toggleHeroMonth,closeHeroMonth,clearHeroMonth,openHeroBonus,compactRow,primaryAction,openNextTask,showHold,showEligibility,resetStage,stages,hero,home,tasks,eligibleSoon,eligibleInfo,upcomingReminders,churnReviewPlan,churnReviewMarkup,detailHead,detailPanels,detailFooter,openRuleEditor,openActivity,closeActivity,setReadyExtrasOpen,requirementRows,timerRows,feeDetail,back,archive,archiveCountdown,goArchive,showTerms,openArchived,setArchiveToolsOpen,viewOffers,settings,openSettings,closeSettings,setNotice,openPhonebook,closePhonebook,openPhoneForClose,refreshUsage,setHostingAmount,hostSettings,usageCard,backUpNow,cloudSettingsCard,notifications,openNotifications,closeNotifications,openNotification};
if(typeof R==='function')R();
})();
