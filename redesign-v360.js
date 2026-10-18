/* BonusTracker 3.6.3 presentation helpers. Pure views; canonical rules are read-only. */
(function(){
'use strict';
const scopeKey='bt360_audience_session',noticeKey='bt360_notice_session';
let legacyArchiveOpen=false;
let audience='personal', archivePane='waiting', noticePrefs={deadlines:false,payouts:false,eligible:false}, selectedStage='';
try{audience=sessionStorage.getItem(scopeKey)==='business'?'business':'personal'}catch{}
try{const v=JSON.parse(sessionStorage.getItem(noticeKey)||'{}');for(const k of Object.keys(noticePrefs))noticePrefs[k]=v[k]===true}catch{}
const safe=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const arg=v=>JSON.stringify(String(v??'')).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const stage=e=>{try{return lifecycleViewForEntry(e)}catch{return {code:'IN_PROGRESS',label:'In progress'}}};
const amount=v=>fM(Number(v||0)), date=v=>v?fD(v):'Needs review';
const eligibleInfo=e=>{
 const gate=window.BTEligibilityGate;
 if(!gate)return null;
 try{
   const validation=gate.validate(e);
   if(!validation.ok||validation.decision!=='repeatable')return null;
   const eligible=gate.applicationReadyDate(e,addD,addM);
   const controlling=gate.controllingRule(e,addD,addM);
   if(!eligible||!controlling)return null;
   const more=gate.officialEligibilityDates(e,addD,addM).filter(r=>r.conditionState==='active');
   const label=gate.periodLabel(controlling.period)+' from '+gate.anchorLabel(controlling.basis)+' + '+gate.SAFETY_BUFFER_DAYS+' days';
   return {eligible,controlling,label,more};
 }catch{return null}
};
function scope(e){const type=typeof entryBankType==='function'?entryBankType(e):String(e?.accountType||'personal').toLowerCase();return (type==='B'||type==='business'?'business':'personal')===audience}
function segments(){return '<div class="bt360-segments" role="group" aria-label="Account type"><button type="button" aria-pressed="'+(audience==='personal')+'" class="'+(audience==='personal'?'active':'')+'" onclick="BT360.setAudience(\'personal\')">Personal</button><button type="button" aria-pressed="'+(audience==='business')+'" class="'+(audience==='business'?'active':'')+'" onclick="BT360.setAudience(\'business\')">Business</button></div>'}
function setAudience(v){if(v!=='business'&&v!=='personal')return;audience=v;selectedStage='';try{sessionStorage.setItem(scopeKey,audience)}catch{};R()}
function setStage(v){selectedStage=selectedStage===v?'':v;expanded=null;R()}
function resetStage(){selectedStage=''}
function infoRow(label,value,detail){return '<div class="bt360-info-row"><span>'+safe(label)+'</span><div><b>'+safe(value)+'</b>'+(detail?'<small>'+safe(detail)+'</small>':'')+'</div></div>'}
function panel(title,html,right){return '<section class="bt360-panel"><div class="bt360-panel-title"><h3>'+safe(title)+'</h3>'+(right||'')+'</div><div class="bt360-panel-body">'+html+'</div></section>'}
const pills=[
 ['ACTION_NEEDED','Action needed'],['IN_PROGRESS','In progress'],['REQUIREMENTS_MET','Requirements met'],
 ['AWAITING_BONUS','Awaiting'],['BONUS_RECEIVED','Bonus received'],['HOLD_OPEN','Hold open'],['READY_TO_CLOSE','Ready to close']
];
function stages(rows){
 const counts={};rows.filter(e=>!e.closed&&scope(e)).forEach(e=>{const code=stage(e).code;counts[code]=(counts[code]||0)+1});
 return '<div class="bt360-stage-scroller" role="group" aria-label="Filter by stage">'+pills.filter(([code])=>counts[code]>0).map(([code,label])=>'<button type="button" class="bt360-stage stage-'+code.toLowerCase()+(selectedStage===code?' active':'')+'" aria-pressed="'+(selectedStage===code)+'" onclick="BT360.setStage(\''+code+'\')">'+(counts[code]||0)+' '+label+'</button>').join('')+'</div>';
}
function hero(rows,year,metrics){
 const subset=rows.filter(scope);
 const received=subset.filter(e=>e.bonusRecd&&String(e.bonusRecd).slice(0,4)===String(year));
 const total=received.reduce((n,e)=>n+Number(e.bonus||0),0);
 const progress=subset.filter(e=>!e.closed&&!e.bonusRecd).reduce((n,e)=>{const s=stage(e).code;return s==='AWAITING_BONUS'||s==='REQUIREMENTS_MET'?n:n+Number(e.bonus||0)},0);
 const awaiting=subset.filter(e=>!e.closed&&!e.bonusRecd&&['AWAITING_BONUS','REQUIREMENTS_MET'].includes(stage(e).code)).reduce((n,e)=>n+Number(e.bonus||0),0);
 const months=Array.from({length:12},(_,i)=>received.filter(e=>Number(String(e.bonusRecd).slice(5,7))===i+1).reduce((n,e)=>n+Number(e.bonus||0),0));
 const peak=Math.max(...months,1);
 const bars=months.map((n,i)=>'<span class="'+(i===new Date().getMonth()?'current':'')+'" style="height:'+Math.max(5,Math.round(n/peak*100))+'%" title="'+safe(new Date(2020,i,1).toLocaleString('en-US',{month:'short'}))+' · '+safe(amount(n))+'"></span>').join('');
 return '<section class="bt360-hero"><div class="bt360-hero-top"><div class="bt360-kicker">COLLECTED IN '+year+'</div><button id="bt-cloud-open" class="cloud-status-button bt360-backup" onclick="btOpenCloudBackup()">Cloud protection · Review</button></div><strong class="bt360-hero-amount">'+amount(total)+'</strong><p>'+amount(progress)+' in progress · '+amount(awaiting)+' awaiting</p><div class="bt360-monthbars" aria-label="Collected by month in '+year+'">'+bars+'</div><div class="bt360-monthlegend"><span>Jan</span><span>Collected by month</span><span>Dec</span></div></section>';
}
function tasks(rows){
 let suggestions=[];try{suggestions=window.getAttentionSuggestions?.()||[]}catch{}
 suggestions=suggestions.filter(x=>rows.some(e=>e.id===x.entryId&&scope(e)));
 const top=suggestions[0];
 const id=x=>arg(x.entryId);
 const title=x=>safe(x.task?.title||x.stageLabel||'Review account');
 const name=x=>safe(x.bank||'Bank');
 const chip=x=>{const d=x.dateContext;return d?.confirmed&&d.date?'<span class="bt360-chip warning">'+safe(date(d.date))+'</span>':'<span class="bt360-chip warning">Needs review</span>'};
 let html='';
 if(top){const entry=rows.find(e=>e.id===top.entryId);
 html+='<div class="bt360-featured"><div class="bt360-feature-head">'+bankLogo(top.bank,true)+'<div class="bt360-grow"><b>'+title(top)+'</b><p>'+name(top)+(entry?.bonus?' · '+amount(entry.bonus)+' bonus':'')+'</p></div>'+chip(top)+'</div>';
 if(entry?.checklist?.length){const done=entry.checklist.filter(t=>t.done).length;html+='<div class="bt360-task-progress"><span>Recorded tasks</span><b>'+done+' of '+entry.checklist.length+'</b><div class="bt360-track"><i style="width:'+Math.round(done/entry.checklist.length*100)+'%"></i></div></div>'}
 html+='<div class="bt360-actions"><button class="bt360-primary" onclick="runNextAccountAction('+id(top)+')">Open task</button><button class="bt360-secondary" onclick="openAccountFromActionCenter('+id(top)+')">Details</button></div></div>'}
 if(suggestions.length>1){html+='<div class="bt360-list">';suggestions.slice(1,9).forEach(x=>{html+='<button class="bt360-list-row" onclick="openAccountFromActionCenter('+id(x)+')">'+bankLogo(x.bank,true)+'<span class="bt360-grow"><b>'+title(x)+'</b><small>'+name(x)+'</small></span><span class="bt360-chip '+(x.stageCode==='READY_TO_CLOSE'?'positive':'warning')+'">'+safe(x.stageLabel||'Review')+'</span></button>'});html+='</div>'}
 if(!suggestions.length)html='<div class="bt360-empty">No immediate tasks for '+audience+' accounts.</div>';
 return panel('Needs you',html,'<span class="bt360-count">'+suggestions.length+' '+(suggestions.length===1?'task':'tasks')+'</span>');
}
function eligibleSoon(rows){
 const next=rows.filter(e=>e.closed&&scope(e)).map(e=>({e,info:eligibleInfo(e)})).filter(x=>x.info).map(x=>({...x,days:dB(td(),x.info.eligible)})).filter(x=>x.days>0&&x.days<=60).sort((a,b)=>a.days-b.days);
 if(!next.length)return'';
 let h='<div class="bt360-list">'+next.map(x=>'<button class="bt360-list-row" onclick="BT360.goArchive(\'waiting\')">'+bankLogo(x.e.bank,true)+'<span class="bt360-grow"><b>'+safe(x.e.bank)+'</b><small>'+safe(date(x.info.eligible))+' · '+safe(x.info.label)+'</small></span><span class="bt360-chip">'+x.days+' days</span></button>').join('')+'</div>';
 return panel('Eligible soon',h,'<span class="bt360-subtitle">next 60 days</span><button class="bt360-link" onclick="BT360.goArchive(\'waiting\')">Waiting to churn</button>');
}
function home(rows,year,metrics){if(!usageData&&!usageLoading&&window.BTBonusAuth?.connected?.())setTimeout(()=>refreshUsage(),0);return segments()+usageBanner()+hero(rows,year,metrics)+stages(rows)+tasks(rows)+eligibleSoon(rows)}
function detailHead(e){
 const s=stage(e),enrolled=e.offerEnrollmentDate||e.couponEnrollmentDate||'';
 return '<div class="bt360-detail-header"><div class="bt360-detail-bar"><button onclick="BT360.back()" aria-label="Back to accounts">‹</button><span>'+safe(audience==='business'?'Business':'Personal')+' · '+safe(s.label)+'</span><button onclick="openBankActions('+arg(e.id)+')" aria-label="More account actions">•••</button></div><div class="bt360-detail-identity">'+bankLogo(e.bank,true)+'<div class="bt360-grow"><h2>'+safe(e.bank)+'</h2><p>Opened '+safe(date(e.opened))+(enrolled?' · enrolled '+safe(date(enrolled)):'')+'</p></div><strong>'+amount(e.bonus)+'</strong></div></div>'
}
function detailPanels(e){
 const s=stage(e),ready=s.code==='READY_TO_CLOSE';
 const milestones=[['Opened',!!e.opened],['Tasks',!!e.reqMet],['Payout',!!e.bonusRecd],['Hold',!!(e.bonusRecd&&(ready||e.closed))],['Close',!!e.closed]];
 let h='<div class="bt360-steps" aria-label="Account lifecycle">'+milestones.map(([label,done])=>'<span class="'+(done?'done':'')+'">'+label+'</span>').join('')+'</div>';
 if(ready){
 const check=closeReadiness(e);
 h+=panel('Close checks',check.items.map(item=>'<div class="bt360-check '+(item.ok?'done':item.level==='danger'?'danger':'unknown')+'"><span>'+(item.ok?'✓':'!')+'</span><div><b>'+safe(item.label)+'</b><small>'+safe(item.detail||'Needs review')+'</small></div></div>').join(''));
 const bankPhone=getPhoneBook().find(row=>{try{return bankIdentity(row.bank).family===bankIdentity(e.bank).family}catch{return row.bank===e.bank}});
 const phone=bankPhone?.[audience]||'';
 if(phone)h+=panel('CALL TO CLOSE','<p class="bt360-muted">'+safe(audience==='business'?'Business':'Personal')+' banking line · saved for '+safe(e.bank)+'</p><a class="bt360-primary bt360-call" href="tel:'+safe(phone.replace(/[^+\d]/g,''))+'">☎ '+safe(phone)+'</a><small class="bt360-muted">Shown only when ready to close.</small>');
 const ei=eligibleInfo(e);h+=panel('After closing',infoRow('Eligible again',ei?date(ei.eligible):'Needs review',ei?.label||'Eligibility terms not verified')+(ei?.more?.length>1?ei.more.map(r=>infoRow('Also checked',date(r.eligibleDate),r.period?.value+' '+r.period?.unit+' from '+window.BTEligibilityGate.anchorLabel(r.basis))).join(''):''));
 }else{
 const checks=Array.isArray(e.checklist)?e.checklist:[];
 h+=panel('Requirements',(!checks.length?'<p class="bt360-muted">'+safe(e.dataPoint||e.completeBonusText||'Check your saved requirements.')+'</p>':checks.map((c,i)=>'<div class="bt360-check '+(c.done?'done':'')+'"><button type="button" role="checkbox" aria-label="'+safe(c.text)+'" aria-checked="'+!!c.done+'" onclick="toggleCk('+arg(e.id)+','+i+')">'+(c.done?'✓':'')+'</button><div><b>'+safe(c.text)+'</b><small>'+(c.done?'Recorded':'Not yet confirmed')+'</small></div></div>').join(''))+'<button class="bt360-link" onclick="openReqMet('+arg(e.id)+')">Confirm all</button>');
 const fee=e.monthlyFeeAmountText||e.monthlyFeeYNText||'',waiver=e.monthlyFeeWaiverText||e.avoidMonthlyFeeText||'';
 h+=panel('Fees & waivers',infoRow('Monthly fee',fee||'Needs review')+infoRow('Waived if',waiver||'Needs review')+infoRow('This month','Needs review','No verified current-month fee evidence')+infoRow('Early close fee',e.earlyTerminationFeeText||'Needs review'));
 const timers=Array.isArray(e.customTimers)?e.customTimers:[];
 h+=panel('Timers',(!timers.length?'<p class="bt360-muted">No custom timers set.</p>':timers.map(t=>'<div class="bt360-check '+(t.done?'done':'')+'"><span>◷</span><div><b>'+safe(t.text||'Timer')+'</b><small>'+safe(timerMetaLine(t))+'</small></div></div>').join('')),'<button class="bt360-link" onclick="runBankAction('+arg(e.id)+',\'timer\')">+ Add</button>');
 const ei=eligibleInfo(e),safeClose=typeof safeCloseDate==='function'?safeCloseDate(e):'';
 h+=panel('Key dates',infoRow('Safe to close',safeClose?date(safeClose):'Needs review')+infoRow('Eligible again',ei?date(ei.eligible):'Needs review',ei?.label||'No verified rule/anchor'));
 }
 h+='<button class="bt360-source" onclick="BT360.showTerms('+arg(e.bank)+')">'+(e.termsVerifiedAt?'Official terms verified '+safe(date(String(e.termsVerifiedAt).slice(0,10))):'Terms need review')+' · View saved source ›</button>';
 let action='Record deposit',command='openBankActions('+arg(e.id)+')';
 if(!e.reqMet){action='Confirm requirements';command='openReqMet('+arg(e.id)+')'}
 else if(!e.bonusRecd){action='Confirm received';command='openRcv('+arg(e.id)+')'}
 else if(ready){action='Mark account closed';command='startCloseFlow('+arg(e.id)+',\'actual\')'}
 else {action='Review close checks';command='openBankActions('+arg(e.id)+')'}
 h+='<div class="bt360-detail-footer"><button onclick="btOpenBonusAI('+arg(e.id)+')">Ask AI</button><button class="bt360-primary" aria-label="'+safe(action+' for '+e.bank)+'" onclick="'+command+'">'+action+'</button></div>';
 return h
}
function showTerms(bank){archivePane='saved';storageSearch=String(bank||'');expanded=null;tab='archive';R()}
function back(){expanded=null;window.bt360ArchiveDetailId=null;R();const el=document.querySelector('.scroll');if(el)el.scrollTop=0}
function goArchive(pane){archivePane=pane==='saved'?'saved':'waiting';expanded=null;tab='archive';R()}
function archive(rows){
 if(window.bt360ArchiveDetailId&&expanded){return window.rTracker(rows,true)}
 let h=segments()+'<div class="bt360-segments bt360-archive-switch"><button aria-pressed="'+(archivePane==='waiting')+'" class="'+(archivePane==='waiting'?'active':'')+'" onclick="BT360.goArchive(\'waiting\')">Waiting to churn</button><button aria-pressed="'+(archivePane==='saved')+'" class="'+(archivePane==='saved'?'active':'')+'" onclick="BT360.goArchive(\'saved\')">Saved terms</button></div>';
 if(archivePane==='saved')return h+rTermsStorage();
 const closed=rows.filter(e=>e.closed&&scope(e));
 const indexed=closed.map(e=>({e,info:eligibleInfo(e)}));
 const ready=indexed.filter(x=>x.info&&dB(td(),x.info.eligible)<=0);
 const soon=indexed.filter(x=>x.info&&dB(td(),x.info.eligible)>0&&dB(td(),x.info.eligible)<=60);
 const cooling=indexed.filter(x=>!x.info||dB(td(),x.info.eligible)>0).sort((a,b)=>(a.info?.eligible||'9999').localeCompare(b.info?.eligible||'9999'));
 h+='<div class="bt360-archive-stats"><div><b>'+ready.length+'</b><small>Eligible now</small></div><div><b>'+soon.length+'</b><small>Within 60 days</small></div><div><b>'+cooling.length+'</b><small>Cooling down</small></div></div>';
 const row=(x,offer)=>'<div class="bt360-list-row">'+bankLogo(x.e.bank,true)+'<span class="bt360-grow"><b>'+safe(x.e.bank)+'</b><small>'+(x.info?safe(date(x.info.eligible)+' · '+x.info.label):'Needs review · verify eligibility rules')+'</small></span>'+(offer?'<button class="bt360-chip positive" onclick="BT360.viewOffers('+arg(x.e.bank)+')">View offers</button>':'<button class="bt360-chip" onclick="BT360.openArchived('+arg(x.e.id)+')">'+(x.info?Math.max(0,dB(td(),x.info.eligible))+' days':'Review')+'</button>')+'</div>';
 h+=panel('Eligible now',ready.length?'<div class="bt360-list">'+ready.map(x=>row(x,true)).join('')+'</div>':'<p class="bt360-muted">No verified eligibility dates reached.</p>');
 h+=panel('Cooling down',cooling.length?'<div class="bt360-list">'+cooling.map(x=>row(x,false)).join('')+'</div>':'<p class="bt360-muted">No accounts cooling down.</p>','<span class="bt360-subtitle">soonest first</span>');
 h+='<details class="bt360-archived-tools"'+(legacyArchiveOpen?' open':'')+' ontoggle="BT360.setArchiveToolsOpen(this.open)"><summary>Completed, non-repeatable accounts · edit and review</summary>'+window.rTracker(rows,true)+'</details>';
 return h;
}
function setArchiveToolsOpen(value){legacyArchiveOpen=!!value}
function openArchived(id){const e=entries.find(x=>x.id===id);if(!e)return;expanded=id;if(isArchivedTrackerEntry(e)){window.bt360ArchiveDetailId=id;tab='archive'}else{tab='tracker'}R()}
function viewOffers(bank){expanded=null;tab='bonuses';R();const v=document.getElementById('radar-search');if(v&&typeof window.btRadarSearch==='function')window.btRadarSearch(bank)}
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
async function refreshUsage(force=false){
 if(usageLoading)return;
 if(!force&&Date.now()-usageFetchedAt<60*60*1000)return;
 if(!window.BTBonusAuth?.connected?.()){usageError='Sign in to Cloud protection to view hosting usage.';return}
 usageLoading=true;usageError='';if(window.bt360SettingsOpen)R();
 try{
  const send=async token=>fetch(HOST_API,{method:'GET',credentials:'omit',cache:'no-store',headers:{Authorization:'Bearer '+token}});
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
 if(!usageData||usageData.railway.status!=='ok')return'';
 const projected=cleanCost(usageData.railway.projectedMonthEnd),cfg=hostSettings(),month=String(usageData.month||'');
 if(projected===null||projected<=cfg.alertAt||cfg.lastBannerMonth===month)return'';
 if(month&&saveBannerMonth(month))return'<button class="bt360-usage-banner" onclick="BT360.openSettings()">Hosting cost may exceed your plan · View ›</button>';
 return'';
}
function saveBannerMonth(month){
 try{const settings={...hostSettings(),lastBannerMonth:month};window.BTPersistence.commit(localStorage,{[HOST_SETTINGS]:JSON.stringify(settings)});return true}catch{return false}
}
function usageCard(){
 const month=new Date().toLocaleDateString('en-US',{month:'long',year:'numeric'});
 const cfg=hostSettings(),railway=usageData?.railway,r2=usageData?.r2;
 const current=cleanCost(railway?.costSoFar),projected=cleanCost(railway?.projectedMonthEnd);
 let content='';
 if(usageLoading)content='<p class="bt360-muted">Checking Railway and R2 usage…</p>';
 else if(!window.BTBonusAuth?.connected?.())content='<p class="bt360-muted">Sign in to Cloud protection to view hosting usage.</p><button class="bt360-link" onclick="BT360.closeSettings();btOpenCloudBackup()">Open Cloud protection</button>';
 else if(railway?.status==='not_configured')content='<p class="bt360-usage-warning">Add a Railway API token to see usage.</p><p class="bt360-muted">Create a read-only API token under Railway account settings. Add it to the backend service as RAILWAY_API_TOKEN, then redeploy. Never paste it into BonusTracker.</p>';
 else if(!railway||railway.status!=='ok'||current===null||projected===null)content='<p class="bt360-usage-warning">Railway usage unavailable. Costs cannot be verified.</p><button class="bt360-link" onclick="BT360.refreshUsage(true)">Try again</button>';
 else {
  const ratio=projected/cfg.allowance,label=ratio>1?'Over plan':ratio>=0.8?'Near limit':'Within plan',tone=ratio>1?'bad':ratio>=0.8?'warning':'positive';
  content='<div class="bt360-usage-top"><div><span>Cost so far</span><strong>'+fmtCost(current)+'</strong><small>about '+fmtCost(projected)+' by month end</small></div><span class="bt360-chip '+tone+'">'+label+'</span></div>';
  content+='<div class="bt360-usage-plan"><div><span>Projected / allowance</span><b>'+fmtCost(projected)+' / '+fmtCost(cfg.allowance)+'</b></div><div class="bt360-track"><i style="width:'+Math.min(100,ratio*100)+'%;background:'+(ratio>1?'#FF8A8A':ratio>=0.8?'#FFB86B':'#5BE3B0')+'"></i></div></div>';
  const services=Array.isArray(railway.services)?railway.services:[];
  content+='<div class="bt360-usage-services">'+services.map(x=>'<div><span>'+safe(x.name)+'</span><span>'+fmtCost(cleanCost(x.costSoFar))+' <small>'+(x.avgMemoryGb!=null?Number(x.avgMemoryGb*1024).toFixed(0)+' MB avg':'Memory unavailable')+'</small></span></div>').join('')+'</div>';
 }
 if(!content)content='<p class="bt360-muted">Usage information is not available.</p>';
 content+='<div class="bt360-usage-config"><button onclick="BT360.setHostingAmount(\'allowance\')">Plan allowance <b>'+fmtCost(cfg.allowance)+'</b> ✎</button><button onclick="BT360.setHostingAmount(\'alertAt\')">Alert at <b>'+fmtCost(cfg.alertAt)+'</b> ✎</button></div>';
 content+='<div class="bt360-usage-r2"><b>R2 storage</b><span>'+(r2?.status==='ok'&&typeof r2.usedBytes==='number'?Number(r2.usedBytes/1000000000).toFixed(2)+' GB / 10 GB free':'Usage unavailable')+'</span></div>';
 content+='<p class="bt360-muted">Updated '+(usageData?.checkedAt?new Date(usageData.checkedAt).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):'not yet')+' · estimates from Railway and Cloudflare</p>';
 return panel('HOSTING & USAGE · '+month,content);
}
function setNotice(key){if(!(key in noticePrefs))return;noticePrefs[key]=!noticePrefs[key];try{sessionStorage.setItem(noticeKey,JSON.stringify(noticePrefs))}catch{}R()}
function cloudSettingsCard(){
 let cfg={};try{cfg=JSON.parse(localStorage.getItem('bt_cloud_recovery_v1')||'{}')}catch{}
 const state=window.BTCloudBackup?.protection?.()||{};
 const time=cfg.lastAt?new Date(cfg.lastAt).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'No verified backup yet';
 const on=cfg.enabled===true;
 return panel('CLOUD PROTECTION','<button type="button" role="switch" aria-checked="'+on+'" class="bt360-settings-row" onclick="BT360.closeSettings();btOpenCloudBackup()"><span><b>Auto-backup</b><small>Change with verified cloud controls</small></span><i class="bt360-toggle '+(on?'checked':'')+'"></i></button><p class="bt360-muted">'+safe(state.title||'Review cloud protection')+' · '+safe(time)+'</p><div class="bt360-actions"><button class="bt360-primary" onclick="BT360.backUpNow()">Back up now</button><button class="bt360-secondary" onclick="BT360.closeSettings();btOpenCloudBackup()">Restore from cloud</button></div>');
}
async function backUpNow(){
 closeSettings();
 if(!window.BTBonusAuth?.connected?.()||!window.BTCloudBackup?.upload){btOpenCloudBackup();return}
 try{await window.BTCloudBackup.upload('manual');window.btNotify?.('Cloud backup uploaded and verified.',{title:'Backup verified',tone:'success'})}
 catch{btOpenCloudBackup()}
}
function settings(){
 const toggles=[['deadlines','Deadlines','3 and 1 day before'],['payouts','Payouts and close dates','When ready'],['eligible','Eligible again','7 days before and on the day']];
 const buttons=toggles.map(([k,label,description])=>'<button class="bt360-settings-row" role="switch" aria-checked="'+noticePrefs[k]+'" onclick="BT360.setNotice(\''+k+'\')"><span><b>'+label+'</b><small>'+description+'</small></span><i class="bt360-toggle '+(noticePrefs[k]?'checked':'')+'"></i></button>').join('');
 return '<div class="bt360-sheet-backdrop" onclick="BT360.closeSettings()"><section class="bt360-sheet" role="dialog" aria-modal="true" aria-label="Settings" onclick="event.stopPropagation()"><header><div><h2>Settings</h2><p>BonusTracker v3.6.3</p></div><button aria-label="Close settings" onclick="BT360.closeSettings()">×</button></header>'+
 cloudSettingsCard()+
 usageCard()+
 panel('Notifications',buttons+'<p class="bt360-muted">Preferences are UI-only in v3.6.3. Push delivery is not active.</p>')+
 panel('Data','<button class="bt360-settings-row" onclick="BT360.closeSettings();exportBackup()">Export backup file <span>›</span></button><button class="bt360-settings-row" onclick="BT360.closeSettings();importBackup()">Restore from file <span>›</span></button><button class="bt360-settings-row" onclick="BT360.openPhonebook()">Bank phone numbers <span>›</span></button>')+
 '<button class="bt360-reset" onclick="BT360.closeSettings();resetAllData()">Reset this device <small>Two confirmations and a safety backup</small></button></section></div>';
}
let notificationPanelOpen=false;
function notifications(rows){
 let data=[];try{data=window.getAttentionSuggestions?.()||[]}catch{}
 const scoped=data.filter(x=>rows.some(e=>e.id===x.entryId&&scope(e)));
 const items=scoped.map(x=>'<button class="bt360-list-row" onclick="BT360.openNotification('+arg(x.entryId)+')">'+bankLogo(x.bank,true)+'<span class="bt360-grow"><b>'+safe(x.task?.title||x.stageLabel||'Review account')+'</b><small>'+safe(x.bank||'Bank')+' · '+safe(x.stageLabel||'Review')+'</small></span><span class="bt360-chip '+(x.stageCode==='READY_TO_CLOSE'?'positive':'warning')+'">'+safe(x.dateContext?.confirmed&&x.dateContext.date?date(x.dateContext.date):'Review')+'</span></button>').join('');
 return '<div class="bt360-sheet-backdrop" onclick="BT360.closeNotifications()"><section class="bt360-sheet" role="dialog" aria-modal="true" aria-label="Notification center" onclick="event.stopPropagation()"><header><div><h2>Notifications</h2><p>'+safe(audience==='personal'?'Personal':'Business')+' · Tracker reminders</p></div><button aria-label="Close notifications" onclick="BT360.closeNotifications()">×</button></header>'+panel('Needs you',items?'<div class="bt360-list">'+items+'</div>':'<p class="bt360-muted">No current tasks needing attention.</p>')+'<p class="bt360-muted">These are tracker reminders, not push notifications. Push delivery will be enabled in a later release.</p></section></div>';
}
function openNotifications(){notificationPanelOpen=true;window.bt360SettingsOpen=false;R()}
function closeNotifications(){notificationPanelOpen=false;R()}
function openNotification(id){notificationPanelOpen=false;openAccountFromActionCenter(id)}
function openPhonebook(){closeSettings();window.bt360PhonebookOpen=true;R()}
function closePhonebook(){window.bt360PhonebookOpen=false;R()}
function openSettings(){window.bt360SettingsOpen=true;R();refreshUsage()}
function closeSettings(){window.bt360SettingsOpen=false;R()}
window.BT360={get audience(){return audience},get selectedStage(){return selectedStage},get archivePane(){return archivePane},get notificationsOpen(){return notificationPanelOpen},scope,segments,setAudience,setStage,resetStage,stages,hero,home,tasks,eligibleSoon,eligibleInfo,detailHead,detailPanels,back,archive,goArchive,showTerms,openArchived,setArchiveToolsOpen,viewOffers,settings,openSettings,closeSettings,setNotice,openPhonebook,closePhonebook,refreshUsage,setHostingAmount,hostSettings,usageCard,backUpNow,cloudSettingsCard,notifications,openNotifications,closeNotifications,openNotification};
if(typeof R==='function')R();
})();
