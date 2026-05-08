/* ✅ Version 2.0 Newest update: Removed Profile tab + added Data Health and safer backup/close guardrails. */
const SK='bt_e_v4',TK='bt_t_v4',DD_KEY='bt_dd_methods',REQ_KEY='bt_bank_reqs',BK_KEY='bt_last_backup',PHONE_KEY='bt_phone_book_v1',DP_USER_KEY='bt_user_datapoints_v1',COMMUNITY_DP_KEY='bt_community_datapoints_v1',COMMUNITY_DP_SEED_KEY='bt_community_datapoints_seed_v2',PROFILE_EVT_KEY='bt_profile_events_v1';

const APP_VERSION='3.3.62';
try{window.BT_APP_VERSION=APP_VERSION}catch{}
const OFFER_HIST_KEY='bt_offer_history_v1';

const ld=(k,d)=>{
  try{
    const v=localStorage.getItem(k);
    return v?JSON.parse(v):d
  }
  catch{
    return d
  }
  
};

const sv=(k,v)=>{
  try{
    localStorage.setItem(k,JSON.stringify(v))
  }
  catch{}
  
};

const td=()=>new Date().toISOString().split('T')[0];

const dB=(a,b)=>Math.floor((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/864e5);

const addM=(d,m)=>{
  const dt=new Date(d+'T00:00:00');
  dt.setMonth(dt.getMonth()+m);
  return dt.toISOString().split('T')[0]
};

const addD=(d,n)=>{
  const dt=new Date(d+'T00:00:00');
  dt.setDate(dt.getDate()+n);
  return dt.toISOString().split('T')[0]
};

const fD=d=>{
  if(!d)return'\u2014';
  return new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
};

const fM=n=>'$'+(n||0).toLocaleString();

const esc=s=>{
  const d=document.createElement('div');
  d.textContent=s;
  return d.innerHTML
};

function dpId(){
  return 'udp_'+Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-6)
}

function normalizeUserDatapoint(row){
  const x=(row&&typeof row==='object')?{
    ...row
  }
  :{};
  const bank=String(x.bank||'').trim();
  const method=String(x.method||x.text||'').trim();
  const note=String(x.note||x.notes||'').trim();
  const createdAt=x.createdAt||x.date||td();
  const updatedAt=x.updatedAt||createdAt;
  const lastConfirmedAt=x.lastConfirmedAt||x.date||createdAt;
  return{
    id:String(x.id||dpId()),bank,method,note,createdAt,updatedAt,lastConfirmedAt,entryId:String(x.entryId||''),source:'user-confirmed'
  }
  
}

function loadUserDatapoints(){
  const direct=ld(DP_USER_KEY,null);
  if(Array.isArray(direct)&&direct.length)return direct.map(normalizeUserDatapoint).filter(x=>x.bank&&x.method);
  const legacy=ld(DD_KEY,[]);
  if(Array.isArray(legacy)&&legacy.length){
    const migrated=legacy.map(normalizeUserDatapoint).filter(x=>x.bank&&x.method);
    sv(DP_USER_KEY,migrated);
    return migrated
  }
  return[]
}

function saveUserDatapoints(rows){
  const clean=(rows||[]).map(normalizeUserDatapoint).filter(x=>x.bank&&x.method);
  sv(DP_USER_KEY,clean);
  try{
    localStorage.setItem(DD_KEY,JSON.stringify(clean.map(x=>({id:x.id,bank:x.bank,method:x.method,bonus:0,date:x.lastConfirmedAt||x.updatedAt||x.createdAt,note:x.note||'',entryId:x.entryId||''}))))
  }
  catch{}
  
}

function loadDD(){
  return loadUserDatapoints().map(x=>({id:x.id,bank:x.bank,method:x.method,bonus:0,date:x.lastConfirmedAt||x.updatedAt||x.createdAt,note:x.note||'',entryId:x.entryId||''}))
}

function saveDD(rows){
  saveUserDatapoints((rows||[]).map(r=>({id:r.id,bank:r.bank,method:r.method,note:r.note||r.notes||'',date:r.date||td(),entryId:r.entryId||''})))
}

function addDD(bank,method,bonus,date,meta={}){
  const bankName=String(bank||'').trim();
  const methodName=String(method||'').trim();
  if(!bankName||!methodName)return;
  const rows=loadUserDatapoints();
  const sig=(bankName+'|'+methodName).toLowerCase();
  const idx=rows.findIndex(r=>(String(r.bank||'').trim()+'|'+String(r.method||'').trim()).toLowerCase()===sig);
  if(idx>=0){
    rows[idx].note=String(meta.note||rows[idx].note||'').trim();
    rows[idx].lastConfirmedAt=date||rows[idx].lastConfirmedAt||td();
    rows[idx].updatedAt=td();
    if(meta.entryId)rows[idx].entryId=meta.entryId
  }
  else{
    rows.unshift(normalizeUserDatapoint({bank:bankName,method:methodName,note:meta.note||'',date:date||td(),entryId:meta.entryId||''}))
  }
  saveUserDatapoints(rows)
}

function loadReqs(){
  return ld(REQ_KEY,{})
}
function saveReqs(r){
  sv(REQ_KEY,r)
}
function reqStorageKey(bank,data={}){
  const row=(data&&typeof data==='object')?{bank,...data}:{bank};
  try{return entryBankIdentity(row).key.toLowerCase()}catch{return String(bank||'').toLowerCase()}
}
function saveReq(bank,data){
  const r=loadReqs();
  const row={bank,...(data||{})};
  row.accountType=normalizeAccountType(row.accountType)||inferAccountTypeForEntry(row)||'personal';
  row.updated=td();
  r[reqStorageKey(bank,row)]=row;
  saveReqs(r)
}

function loadOfferHistory(){
  return ld(OFFER_HIST_KEY,{})
}
function saveOfferHistory(rows){
  sv(OFFER_HIST_KEY,rows||{})
}
function offerHistoryKey(entry){
  try{return entryBankIdentity((entry&&typeof entry==='object')?entry:{bank:entry}).key}catch{return bankKey((entry&&entry.bank)||entry||'')}
}
function offerTextSig(v){
  return String(v||'').toLowerCase().replace(/\$|,/g,'').replace(/\s+/g,' ').trim()
}
function offerSignature(snap){
  return [offerTextSig(snap.bank),offerTextSig(snap.bonusTierText||snap.bonus||''),offerTextSig(snap.reqDays||''),offerTextSig(snap.minHoldDays||''),offerTextSig(snap.fundedDays||''),offerTextSig(snap.promoCodeText||''),offerTextSig(snap.completeBonusText||'').slice(0,220)].join('|')
}
function offerSnapshotFromEntry(e,source){
  if(!e||!e.bank)return null;
  const analyzed=String(e.analyzedTC||'');
  const snap={id:'ofr_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,6),bank:e.bank,accountType:normalizeAccountType(e.accountType)||inferAccountTypeForEntry(e)||'personal',entryId:e.id||'',source:source||'entry',savedAt:td(),opened:e.opened||'',closed:e.closed||'',bonusRecd:e.bonusRecd||'',bonus:e.bonus||0,churn:e.churn||'',reqDays:e.reqDays||0,minHoldDays:e.minHoldDays||0,earlyCloseFee:e.earlyCloseFee||0,fundedDays:e.fundedDays||0,fundingAmount:e.fundingAmount||0,fundingAmountText:e.fundingAmountText||'',payoutTimingText:e.payoutTimingText||'',monthlyFeeYNText:e.monthlyFeeYNText||'',promoCodeText:e.promoCodeText||'',avoidMonthlyFeeText:e.avoidMonthlyFeeText||'',completeBonusText:e.completeBonusText||'',eligibilityText:e.eligibilityText||'',expirationDateText:e.expirationDateText||'',requiredDaysText:e.requiredDaysText||'',notes:String(e.notes||'').slice(0,600),analyzedPreview:analyzed.slice(0,900)};
  const tier=analyzed.match(/Bonus:\s*([^*]{0,240})/i);
  if(tier)snap.bonusTierText=tier[1].trim();
  snap.signature=offerSignature(snap);
  return snap
}
function saveOfferVersionFromEntry(e,source){
  const snap=offerSnapshotFromEntry(e,source||'entry');
  if(!snap)return false;
  const all=loadOfferHistory();
  const key=offerHistoryKey(snap);
  const list=Array.isArray(all[key])?all[key]:[];
  const exists=list.find(x=>x.signature===snap.signature);
  if(exists)Object.assign(exists,{...snap,id:exists.id,savedAt:td()});
  else list.unshift(snap);
  all[key]=list.sort((a,b)=>(b.savedAt||'').localeCompare(a.savedAt||'')).slice(0,12);
  saveOfferHistory(all);
  return true
}
function offerHistoryForBank(bank){
  const all=loadOfferHistory();
  const key=offerHistoryKey(bank);
  return Array.isArray(all[key])?all[key]:[]
}
function archivedCycleSnapshot(e){
  if(!e)return null;
  return{bank:e.bank||'',id:e.id||'',archivedAt:td(),opened:e.opened||'',reqMet:e.reqMet||'',bonusRecd:e.bonusRecd||'',closed:e.closed||'',bonus:e.bonus||0,churn:e.churn||'',notes:String(e.notes||'').slice(0,900),analyzedPreview:String(e.analyzedTC||'').slice(0,900),timerSummary:normalizeTimerList(e.customTimers||[]).map(t=>({text:t.text||'',date:t.date||'',daysRequired:t.daysRequired||0,done:!!t.done})).slice(0,8)}
}
function closePlanForEntry(e){
  if(!e||!e.bank)return[];
  const lines=[];
  const active=sortCustomTimers(normalizeTimerList(e.customTimers||[]).filter(t=>!t.done&&t.date&&!isDeletedTimer(e,t)));
  if(!e.bonusRecd){
    lines.push('Do not close yet — keep the account open and unrestricted until the bonus posts.');
    if(active.length){const t=active[0],d=timerCountdownDays(t);lines.push('Next checkpoint: '+(t.text||'mini timer')+(d!==null?' in '+d+'d':'')+(t.date?' · due '+fD(t.date):'')+'.');}
    if(e.minHoldDays>0&&e.opened)lines.push('Hold/safe-close target with buffer: '+fD(safeCloseDate(e))+'.');
    else lines.push('No fixed early-close fee countdown is set; treat this as payout-risk only unless terms say otherwise.');
    return lines;
  }
  lines.push('Bonus received on '+fD(e.bonusRecd)+'. Keep open a few extra days before closing.');
  if(e.minHoldDays>0&&e.opened){const s=safeCloseDate(e);lines.push(daysUntilSafe(e)>0?'Do not close before '+fD(s)+' because the hold/buffer is still running.':'Hold/buffer period appears complete; safe-close date was '+fD(s)+'.');}
  lines.push('Before closing: confirm no pending transactions, no upcoming monthly fee issue, and export/backup the entry.');
  lines.push('Close only if you no longer need the account and the bonus is fully posted/settled.');
  return lines
}
function renderClosePlan(e){
  const lines=closePlanForEntry(e);
  if(!lines.length)return'';
  return '<div class="tc-box"><div class="tc-label">Close plan</div><div class="tc-body">'+lines.map(x=>'* '+esc(x)).join('\n')+'</div></div>'
}
function renderOfferHistory(e){
  const hist=offerHistoryForBank(e);
  if(!hist.length)return'';
  const rows=hist.slice(0,4).map((x,i)=>{const parts=[];if(x.bonusTierText)parts.push(x.bonusTierText.replace(/\s+/g,' '));else if(x.bonus)parts.push(fM(x.bonus));if(x.reqDays)parts.push(x.reqDays+'d req');if(x.minHoldDays)parts.push(x.minHoldDays+'d hold');if(x.opened)parts.push('opened '+fD(x.opened));return '* '+(i===0?'Current/latest: ':'History: ')+esc(parts.join(' · ')||'Saved profile version')+(x.source?' — '+esc(x.source):'');});
  return '<div class="tc-box"><div class="tc-label">Offer history</div><div class="tc-body">'+rows.join('\n')+'</div></div>'
}

function loadProfileEvents(){
  return ld(PROFILE_EVT_KEY,[]).map(x=>({id:String(x.id||('evt_'+Math.random().toString(36).slice(2,8))),bank:String(x.bank||'').trim(),entryId:String(x.entryId||''),type:String(x.type||'').trim(),date:String(x.date||''),label:String(x.label||'').trim(),createdAt:String(x.createdAt||td())})).filter(x=>x.bank&&x.type)
}

function saveProfileEvents(rows){
  sv(PROFILE_EVT_KEY,(rows||[]).map(x=>({id:String(x.id||('evt_'+Math.random().toString(36).slice(2,8))),bank:String(x.bank||'').trim(),entryId:String(x.entryId||''),type:String(x.type||'').trim(),date:String(x.date||''),label:String(x.label||'').trim(),createdAt:String(x.createdAt||td())})).filter(x=>x.bank&&x.type))
}

function setProfileEvent(bank,entryId,type,date,label){
  if(!bank||!entryId||!type)return;
  let rows=loadProfileEvents().filter(x=>!(x.entryId===String(entryId)&&x.type===type));
  if(date)rows.unshift({id:'evt_'+Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-5),bank:String(bank).trim(),entryId:String(entryId),type,date,label:String(label||'').trim(),createdAt:td()});
  saveProfileEvents(rows)
}

function syncProfileEventsFromEntry(e){
  if(!e||!e.id||!e.bank)return;
  setProfileEvent(e.bank,e.id,'opened',e.opened,'Account opened');
  setProfileEvent(e.bank,e.id,'reqMet',e.reqMet,'Requirements met');
  setProfileEvent(e.bank,e.id,'bonusReceived',e.bonusRecd,(e.bonus||0)?('Bonus received · '+fM(e.bonus)):'Bonus received');
  setProfileEvent(e.bank,e.id,'closed',e.closed,'Account closed')
}

function getProfileEventsForBank(bank){
  const key=bankKey(bank);
  return loadProfileEvents().filter(x=>bankKey(x.bank)===key).sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.createdAt||'').localeCompare(a.createdAt||''))
}

function entryReqSnapshot(e){
  if(!e||!e.bank)return null;
  const snap={
    bank:e.bank,
    accountType:normalizeAccountType(e.accountType)||inferAccountTypeForEntry(e)||'personal'
  };
  ['bonus','notes','dataPoint','fundedDays','fundingAmount','fundingAmountText','payoutTimingText','churn','reqDays','monthlyFeeYNText','promoCodeText','avoidMonthlyFeeText','completeBonusText','earlyTerminationFeeText','eligibilityText','expirationDateText','requiredDaysText','minHoldDays','earlyCloseFee'].forEach(k=>{const v=e[k];if(v!==undefined&&v!==null&&v!=='')snap[k]=v});
  return snap
}

function refreshSavedReqFromEntry(e){
  const snap=entryReqSnapshot(e);
  if(!snap||!snap.bank)return;
  const current=profileReqForBank(snap)||{};
  saveReq(snap.bank,{...current,...snap,lastProfileRefreshAt:td(),sourceEntryId:e.id||''});
  saveOfferVersionFromEntry(e,'saved-entry-profile')
}

function bankMemoryFor(bank){
  if(!bank)return null;
  const carrier=(bank&&typeof bank==='object')?bank:{bank};
  const bankName=carrier.bank||bank;
  const matches=sortMatchChoices(bankName,getBankMatches(carrier));
  const req=profileReqForBank(carrier)||{};
  const wantedKey=entryBankIdentity(carrier).key;
  const worked=loadUserDatapoints().filter(x=>bankKey(x.bank)===wantedKey&&!profileMethodFailed((x.note||'')+' '+(x.method||'')));
  const methodCount={};
  worked.forEach(x=>{const key=String(x.method||'').trim();if(key)methodCount[key]=(methodCount[key]||0)+1});
  const bestMethod=Object.entries(methodCount).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0]||matches.find(x=>x.dataPoint)?.dataPoint||req.dataPoint||'';
  const latest=[...matches].sort((a,b)=>(profileTimelineDate(b)||'').localeCompare(profileTimelineDate(a)||''))[0]||null;
  const latestSuccess=[...matches].filter(e=>taxReady(e)).sort((a,b)=>(profileTimelineDate(b)||'').localeCompare(profileTimelineDate(a)||''))[0]||latest;
  return{
    churn:latestSuccess?.churn||latest?.churn||'',bonus:latestSuccess?.bonus||req.bonus||0,dataPoint:bestMethod,reqDays:latestSuccess?.reqDays||latest?.reqDays||req.reqDays||0,minHoldDays:latestSuccess?.minHoldDays||latest?.minHoldDays||req.minHoldDays||0,earlyCloseFee:latestSuccess?.earlyCloseFee||latest?.earlyCloseFee||req.earlyCloseFee||0,monthlyFeeYNText:latestSuccess?.monthlyFeeYNText||latest?.monthlyFeeYNText||req.monthlyFeeYNText||'',promoCodeText:latestSuccess?.promoCodeText||latest?.promoCodeText||req.promoCodeText||'',avoidMonthlyFeeText:latestSuccess?.avoidMonthlyFeeText||latest?.avoidMonthlyFeeText||req.avoidMonthlyFeeText||'',completeBonusText:latestSuccess?.completeBonusText||latest?.completeBonusText||req.completeBonusText||'',earlyTerminationFeeText:latestSuccess?.earlyTerminationFeeText||latest?.earlyTerminationFeeText||req.earlyTerminationFeeText||'',eligibilityText:latestSuccess?.eligibilityText||latest?.eligibilityText||req.eligibilityText||'',expirationDateText:latestSuccess?.expirationDateText||latest?.expirationDateText||req.expirationDateText||'',requiredDaysText:latestSuccess?.requiredDaysText||latest?.requiredDaysText||req.requiredDaysText||''
  }
  
}

function applyModalBankMemory(){
  if(!modal||modal._edit)return;
  syncModalAccountTypeFromBank();
  const mem=bankMemoryFor(modal||'');
  if(!mem)return;
  ['churn','dataPoint','monthlyFeeYNText','promoCodeText','avoidMonthlyFeeText','completeBonusText','earlyTerminationFeeText','eligibilityText','expirationDateText','requiredDaysText'].forEach(k=>{if(!modal[k]&&mem[k])modal[k]=mem[k]});
  if(!(modal.reqDays>0)&&mem.reqDays)modal.reqDays=mem.reqDays;
  if(!(modal.minHoldDays>0)&&mem.minHoldDays)modal.minHoldDays=mem.minHoldDays;
  if(!(modal.earlyCloseFee>0)&&mem.earlyCloseFee)modal.earlyCloseFee=mem.earlyCloseFee;
  if(!(modal.bonus>0)&&mem.bonus)modal.bonus=mem.bonus;
  R()
}

function profileIntelligence(group){
  const entries=(group?.entries||[]);
  const completed=entries.filter(e=>isEarnedBonus(e));
  const avg=(arr)=>arr.length?Math.round(arr.reduce((s,v)=>s+v,0)/arr.length):null;
  const toReceive=completed.filter(e=>e.opened&&e.bonusRecd).map(e=>Math.max(0,dB(e.opened,e.bonusRecd)));
  const receiveToClose=completed.filter(e=>e.bonusRecd&&e.closed).map(e=>Math.max(0,dB(e.bonusRecd,e.closed)));
  const methodStats={};
  loadUserDatapoints().filter(x=>bankKey(x.bank)===group.key&&!profileMethodFailed((x.note||'')+' '+(x.method||''))).forEach(x=>{const k=String(x.method||'').trim();if(k)methodStats[k]=(methodStats[k]||0)+1});
  const bestMethod=Object.entries(methodStats).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0]||'';
  const churnCounts={};
  entries.forEach(e=>{if(e.churn)churnCounts[e.churn]=(churnCounts[e.churn]||0)+1});
  const topChurn=Object.entries(churnCounts).sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
  const latestRuleEntry=[...entries].sort((a,b)=>(profileTimelineDate(b)||'').localeCompare(profileTimelineDate(a)||''))[0]||null;
  const lastChurn=latestRuleEntry?.churn||'';
  const lastReceived=[...entries].filter(e=>e.bonusRecd).sort((a,b)=>(b.bonusRecd||'').localeCompare(a.bonusRecd||''))[0]||null;
  return{
    bestMethod,avgToReceive:avg(toReceive),avgReceiveToClose:avg(receiveToClose),topChurn,lastChurn,successCount:completed.length,lastSuccess:completed.sort((a,b)=>(profileTimelineDate(b)||'').localeCompare(profileTimelineDate(a)||''))[0]||null,lastReceived,lastEntry:latestRuleEntry
  }
  
}

function getLastBk(){
  try{
    return localStorage.getItem(BK_KEY)||''
  }
  catch{
    return''
  }
  
}
function setLastBk(){
  try{
    localStorage.setItem(BK_KEY,td())
  }
  catch{}
  
}
function daysSinceBk(){
  const lb=getLastBk();
  return lb?Math.max(0,dB(lb,td())):999
}

const BANK_BRANDS={
  'chase':{
    bg:'#0C4DA2',fg:'#fff',abbr:'CH',icon:'🏦'
  },'chase biz':{
    bg:'#0C4DA2',fg:'#fff',abbr:'CB',icon:'🏢'
  },'bank of america':{
    bg:'#C41230',fg:'#fff',abbr:'BA',icon:'🏦'
  },'wells fargo':{
    bg:'#D71E28',fg:'#fff',abbr:'WF',icon:'🏦'
  },'u.s. bank':{
    bg:'#0D2C54',fg:'#fff',abbr:'US',icon:'🏦'
  },'u.s. bank biz':{
    bg:'#0D2C54',fg:'#fff',abbr:'UB',icon:'🏢'
  },'citi':{
    bg:'#003DA5',fg:'#fff',abbr:'CI',icon:'🏦'
  },'citibank':{
    bg:'#003DA5',fg:'#fff',abbr:'CI',icon:'🏦'
  },'pnc':{
    bg:'#F58220',fg:'#fff',abbr:'PN',icon:'🏦'
  },'simmons bank':{
    bg:'#1B365D',fg:'#fff',abbr:'SM',icon:'🏦'
  },'equity bank':{
    bg:'#004C2F',fg:'#fff',abbr:'EQ',icon:'🏦'
  },'regions':{
    bg:'#007A33',fg:'#fff',abbr:'RG',icon:'🏦'
  },'bmo':{
    bg:'#0075BE',fg:'#fff',abbr:'BM',icon:'🏦'
  },'capital one':{
    bg:'#004879',fg:'#fff',abbr:'C1',icon:'🏦'
  },'td bank':{
    bg:'#34A853',fg:'#fff',abbr:'TD',icon:'🏦'
  },'huntington':{
    bg:'#005F3B',fg:'#fff',abbr:'HN',icon:'🏦'
  },'fifth third':{
    bg:'#003D4C',fg:'#fff',abbr:'5T',icon:'🏦'
  },'central bank':{
    bg:'#1A3A6B',fg:'#fff',abbr:'CB',icon:'🏦'
  },'community america':{
    bg:'#0054A6',fg:'#fff',abbr:'CA',icon:'🏦'
  },'ally':{
    bg:'#6B2D8B',fg:'#fff',abbr:'AL',icon:'🏦'
  },'ally bank':{
    bg:'#6B2D8B',fg:'#fff',abbr:'AL',icon:'🏦'
  },'citizens':{
    bg:'#006747',fg:'#fff',abbr:'CZ',icon:'🏦'
  },'comerica':{
    bg:'#00703C',fg:'#fff',abbr:'CM',icon:'🏦'
  },'e-trade':{
    bg:'#6633CC',fg:'#fff',abbr:'ET',icon:'📈'
  },'keybank':{
    bg:'#C4122E',fg:'#fff',abbr:'KB',icon:'🏦'
  },'m&t bank':{
    bg:'#003366',fg:'#fff',abbr:'MT',icon:'🏦'
  },'navy federal':{
    bg:'#003B71',fg:'#fff',abbr:'NF',icon:'⚓'
  },'santander':{
    bg:'#EC0000',fg:'#fff',abbr:'SN',icon:'🏦'
  },'truist':{
    bg:'#5C068C',fg:'#fff',abbr:'TR',icon:'🏦'
  },'vantage cu':{
    bg:'#005A9C',fg:'#fff',abbr:'VT',icon:'🏦'
  },'schwab':{
    bg:'#00A0DF',fg:'#fff',abbr:'SC',icon:'📈'
  },'discover':{
    bg:'#FF6000',fg:'#fff',abbr:'DS',icon:'🏦'
  },'sofi':{
    bg:'#62D2A2',fg:'#fff',abbr:'SF',icon:'🏦'
  },'marcus':{
    bg:'#003DA5',fg:'#fff',abbr:'GS',icon:'🏦'
  },'us bank':{
    bg:'#0D2C54',fg:'#fff',abbr:'US',icon:'🏦'
  },'us bank biz':{
    bg:'#0D2C54',fg:'#fff',abbr:'UB',icon:'🏢'
  }
  
};

function getBrand(name){
  const n=(name||'').toLowerCase().trim();
  if(BANK_BRANDS[n])return BANK_BRANDS[n];
  for(const[k,v]of Object.entries(BANK_BRANDS)){
    if(n.includes(k)||k.includes(n))return v
  }
  let h=0;
  for(let i=0;i<n.length;i++){
    h=n.charCodeAt(i)+((h<<5)-h)
  }
  const hue=Math.abs(h)%360;
  const a=(name||'X').toUpperCase().replace(/[^A-Z]/g,'');
  return{
    bg:`hsl(${hue},55%,38%)`,fg:'#fff',abbr:(a[0]||'?')+(a[1]||''),icon:'🏦'
  }
  
}

function bankLogo(name,sm){
  const b=getBrand(name);
  const cls=sm?'blogo sm':'blogo';
  return`<div class="${cls}" style="background:${b.bg};color:${b.fg}"><span>${esc(b.abbr)}</span></div>`
}

function churnTagHtml(bank,churn){
  const map={
    1:'1YR',2:'2YR',3:'3YR',180:'180D'
  };
  const label=map[churn]||String(churn||'').toUpperCase();
  const cls=String(churn)==='180'?'c180':('c'+String(churn||'1'));
  return '<span class="card-mini-chip '+cls+'">'+esc(label)+'</span>'
}

function nextReopen(e){
  if(!e.closed||!e.churn)return'';
  return e.churn==='180'?addD(e.closed,180):addM(e.closed,parseInt(e.churn)*12)
}

function daysLeft(e){
  const nr=nextReopen(e);
  if(!nr)return null;
  const diff=dB(td(),nr);
  return Math.max(0,diff+10)
}

function elapsed(e){
  return e.bonusRecd?Math.max(0,dB(e.bonusRecd,td())):null
}

const BUFFER_DAYS=3;

function rawSafeDate(e){
  return(e.opened&&e.minHoldDays>0)?addD(e.opened,e.minHoldDays):null
}

function safeCloseDate(e){
  return(e.opened&&e.minHoldDays>0)?addD(e.opened,e.minHoldDays+BUFFER_DAYS):null
}

function daysUntilSafe(e){
  const s=safeCloseDate(e);
  return s?Math.max(0,dB(td(),s)):null
}

function closeFeeCountdownMeta(e){
  const d=daysUntilSafe(e);
  if(d===null)return{
    cls:'amber',text:'Set date'
  };
  if(d<=0)return{
    cls:'green',text:'Safe'
  };
  return{
    cls:d<=14?'red':d<=30?'amber':'blue',text:d+'d'
  }
  
}

function isInBuffer(e){
  if(!e.opened||e.minHoldDays<=0||e.closed||e.feeChecked)return false;
  const raw=rawSafeDate(e);
  const buff=safeCloseDate(e);
  if(!raw||!buff)return false;
  return dB(td(),raw)<=0&&dB(td(),buff)>0
}

function holdProg(e){
  return(e.opened&&e.minHoldDays>0)?Math.min(1,Math.max(0,dB(e.opened,td()))/(e.minHoldDays+BUFFER_DAYS)):null
}

function reqDeadline(e){
  return(e.opened&&e.reqDays>0)?addD(e.opened,e.reqDays):null
}

function daysToDeadline(e){
  const d=reqDeadline(e);
  return d?dB(td(),d):null
}

function nextActiveTimer(e){
  const timers=sortCustomTimers(normalizeTimerList(e?.customTimers||[]).filter(t=>!t.done&&t.date&&!isDeletedTimer(e,t)));
  return timers[0]||null
}

function status(e){

  if(!e||!e.bank)return'';

  if(e.closed){
    return daysLeft(e)===0?'TIME TO CHURN!':'WAITING TO CHURN!';

  }

  const activeTimer=nextActiveTimer(e);
  const hasReqMet=!!e.reqMet;
  const hasBonus=!!e.bonusRecd;
  const hasHold=!!(e.minHoldDays>0&&e.opened&&!e.feeChecked);
  const safeDays=hasHold?daysUntilSafe(e):null;

  // A received bonus moves the bank into the close/hold phase. It should never
  // keep showing the old requirement deadline after this point.
  if(hasBonus){
    if(e.plannedClose){
      const d=dB(td(),e.plannedClose);
      if(d>0)return'PLANNED CLOSE';
    }
    if(hasHold){
      if(isInBuffer(e))return'3-DAY BUFFER';
      if(safeDays!==null&&safeDays>0)return'WAITING TO CLOSE';
    }
    return'SAFE TO CLOSE';
  }

  // Requirements met is its own phase. Requirement countdowns stop here.
  if(hasReqMet){
    if(activeTimer)return'CUSTOM TIMER';
    return'REQ MET';
  }

  if(activeTimer)return'CUSTOM TIMER';

  return'WORKING';

}

function sPri(s){
  return s==='TIME TO CHURN!'?0.6:s==='CUSTOM TIMER'?0.8:s==='SAFE TO CLOSE'?1:s==='3-DAY BUFFER'?1.1:s==='WAITING TO CLOSE'?1.2:s==='PLANNED CLOSE'?1.3:s==='WORKING'?2:s==='REQ MET'?2.2:s==='WAITING TO CHURN!'?3:s==='BONUS RECEIVED'?3.2:99
}

function sortE(a){
  return[...a].sort((x,y)=>{const px=sPri(status(x)),py=sPri(status(y));if(px!==py)return px-py;return(daysLeft(x)??999999)-(daysLeft(y)??999999)})
}

function taxReady(e){
  return !!(e&&e.bonusRecd&&e.closed&&(e.bonus||0)>0)
}

function taxYearOf(e){
  return e&&e.bonusRecd?new Date(e.bonusRecd+'T00:00:00').getFullYear():null
}

function taxEntriesForYear(yr){
  return entries.filter(e=>taxReady(e)&&taxYearOf(e)===yr&&e.bonusRecd<=td())
}

function isEarnedBonus(e){
  return !!(e&&e.bonusRecd&&(e.bonus||0)>0)
}

function isCompleted(e){
  return taxReady(e)
}

function completedYrTotal(yr){
  return taxEntriesForYear(yr).reduce((s,e)=>s+(e.bonus||0),0)
}

function genId(bank,taken){
  const used=taken instanceof Set?taken:new Set();
  const bankName=(bank&&typeof bank==='object')?(bank.bank||''):bank;
  const prefix=bankCode(bankName)+'-'+bankTypeCode(bank)+'-';
  let max=0;
  entries.forEach(e=>{const id=String(e&&e.id||'').toUpperCase();if(!isOfficialEntryId(id))return;if(id.startsWith(prefix)){const num=parseInt(id.slice(prefix.length),10);if(!isNaN(num))max=Math.max(max,num)}});
  let next=max+1;
  let candidate=prefix+String(next).padStart(2,'0');
  while(used.has(candidate)){
    next++;
    candidate=prefix+String(next).padStart(2,'0')
  }
  return candidate
}

function effortScore(e){
  if(!e.bonus)return null;
  let h=1;
  const n=(e.notes||'').toLowerCase();
  if(n.includes('debit'))h++;
  if(n.includes('dd')||n.includes('direct'))h++;
  if(n.includes('balance'))h++;
  if(n.includes('branch'))h+=2;
  if(e.minHoldDays>=180)h++;
  if(e.earlyCloseFee>0)h++;
  const sc=Math.round(e.bonus/h);
  return{
    score:sc,level:sc>=200?'easy':sc>=100?'med':'hard',label:sc>=200?'Easy':sc>=100?'Medium':'Hard'
  }
  
}

function getCountdown(e){

  const s=status(e);

  if(s==='CUSTOM TIMER'){
    const timer=nextActiveTimer(e);
    if(timer){
      const d=timerCountdownDays(timer);
      if(d!==null)return{
        lbl:timer.text||'Countdown active',days:d,date:timer.date,cls:d<=7?'red':d<=21?'amber':'blue',icon:'\u23F0'
      }

    }

  }

  // Requirement deadline is only relevant before requirements are marked met.
  if(s==='WORKING'&&!e.reqMet&&!e.bonusRecd&&e.opened&&e.reqDays>0){
    const d=daysToDeadline(e);
    if(d!==null)return{
      lbl:'Req deadline',days:d,date:reqDeadline(e),cls:d<0?'red':d<=7?'red':d<=21?'amber':'blue',icon:'\u23F0'
    }

  }

  if((s==='PLANNED CLOSE'||s==='SAFE TO CLOSE'||s==='3-DAY BUFFER'||s==='WAITING TO CLOSE')&&e.bonusRecd&&e.plannedClose){
    const d=dB(td(),e.plannedClose);
    if(d>0)return{
      lbl:'Close account',days:d,date:e.plannedClose,cls:d<=3?'red':d<=7?'amber':'green',icon:'\uD83D\uDD12'
    };
    return{
      lbl:'Ready to close!',days:0,date:e.plannedClose,cls:'green',icon:'\u2705'
    }

  }

  if(s==='WAITING TO CLOSE'){
    const d=daysUntilSafe(e);
    if(d!==null&&d>0)return{
      lbl:'Safe to close',days:d,date:safeCloseDate(e),cls:d<=14?'red':d<=30?'amber':'blue',icon:'\uD83D\uDEE1\uFE0F'
    }

  }

  if(s==='3-DAY BUFFER'){
    const d=daysUntilSafe(e);
    return{
      lbl:'\uD83D\uDEE1 Buffer '+d+'d remaining',days:d,date:safeCloseDate(e),cls:'amber',icon:'\uD83D\uDEE1\uFE0F'
    }

  }

  if(s==='REQ MET')return{
    lbl:'Waiting for bonus',days:e.reqMet?Math.max(0,dB(e.reqMet,td())):0,date:e.reqMet||'',cls:'blue',icon:'\u2705'
  };

  if(s==='SAFE TO CLOSE')return{
    lbl:'Safe to close!',days:0,date:'',cls:'green',icon:'\u2705'
  };

  if(s==='WAITING TO CHURN!'){
    const dl=daysLeft(e);
    const nr=nextReopen(e);
    if(dl>0)return{
      lbl:'Churn ready',days:dl,date:nr,cls:dl<=30?'amber':'blue',icon:'\uD83D\uDD04'
    }

  }

  if(s==='TIME TO CHURN!')return{
    lbl:'Ready now!',days:0,date:'',cls:'green',icon:'\uD83D\uDD25'
  };

  return null
}

function getUrg(e){
  const s=status(e);
  if(s==='TIME TO CHURN!')return'red';
  if(s==='CUSTOM TIMER'){
    const timer=nextActiveTimer(e);
    const d=timerCountdownDays(timer);
    if(d!==null&&d<=7)return'red';
    return'yellow'
  }
  if(s==='SAFE TO CLOSE')return'green';
  if(s==='3-DAY BUFFER')return'yellow';
  if(s==='WAITING TO CLOSE'){
    const d=daysUntilSafe(e);
    if(d!==null&&d<=7)return'red';
    if(d!==null&&d<=30)return'yellow';
    return'blue'
  }
  if(s==='PLANNED CLOSE'){
    const d=e.plannedClose?dB(td(),e.plannedClose):null;
    if(d!==null&&d<=3)return'red';
    if(d!==null&&d<=14)return'yellow';
    return'green'
  }
  if(s==='REQ MET'){
    const d=e.reqMet?dB(e.reqMet,td()):0;
    return d>=30?'yellow':'blue'
  }
  if(s==='WAITING TO CHURN!'){
    const dl=daysLeft(e);
    if(dl!==null&&dl<=30)return'yellow'
  }
  if(s==='WORKING')return'blue';
  return'green'
}

function getAttentionSuggestions(){
  const sug=[];
  const push=(e,rsn,pri,days,opts={})=>{
    if(!e||!e.bank||!rsn)return;
    const d=Number.isFinite(days)?Math.max(0,days):999999;
    sug.push({
      bank:e.bank,
      entryId:e.id||'',
      dedupeKey:opts.dedupeKey||(e.id||e.bank),
      rsn,
      bonus:e.bonus||0,
      showBonus:opts.showBonus!==undefined?!!opts.showBonus:!e.closed&&(e.bonus||0)>0,
      pri,
      days:d,
      category:opts.category||''
    });
  };

  entries.forEach(e=>{
    if(!e||!e.bank||e.closed)return;

    // Mini timers are real requirement deadlines. Always consider the next
    // active timer so Needs Attention matches the card countdown instead of
    // falling back to the later 90-day requirement deadline.
    const activeTimers=sortCustomTimers(normalizeTimerList(e.customTimers||[]).filter(t=>!t.done&&t.date&&!isDeletedTimer(e,t)));
    if(activeTimers.length){
      const next=activeTimers[0];
      const d=timerCountdownDays(next);
      if(d!==null){
        const abs=Math.abs(d);
        if(d<0)push(e,'Timer overdue: '+next.text,0,abs,{category:'timer'});
        else if(d===0)push(e,'Timer due today: '+next.text,0.05,0,{category:'timer'});
        else if(d<=3)push(e,d+'d left: '+next.text,0.1,d,{category:'timer'});
        else if(d<=7)push(e,d+'d left: '+next.text,0.2,d,{category:'timer'});
        else if(d<=14)push(e,d+'d left: '+next.text,0.35,d,{category:'timer'});
        else if(d<=30)push(e,d+'d left: '+next.text,1.6,d,{category:'timer'});
        else if(d<=60)push(e,d+'d left: '+next.text,2.4,d,{category:'timer'});
        else push(e,d+'d left: '+next.text,3.4,d,{category:'timer'});
      }
    }

    const st=status(e);

    if(st==='SAFE TO CLOSE'){
      push(e,'Safe to close now.',0.6,0,{category:'close'});
      return;
    }

    // Requirement deadlines are the highest normal priority because missing the
    // requirement can lose the bonus. Sort them by true days remaining.
    if(!e.reqMet&&!e.bonusRecd&&e.opened&&e.reqDays>0){
      const d=daysToDeadline(e);
      if(d!==null){
        if(d<0)push(e,'Requirement deadline passed.',0.4,Math.abs(d),{category:'requirement'});
        else if(d===0)push(e,'Requirement deadline is today.',0.5,0,{category:'requirement'});
        else if(d<=14)push(e,d+'d to requirement deadline.',1.2,d,{category:'requirement'});
        else if(d<=30)push(e,d+'d to requirement deadline.',2.0,d,{category:'requirement'});
        else push(e,d+'d to requirement deadline.',3.0,d,{category:'requirement'});
        return;
      }
    }

    if(e.bonusRecd&&e.plannedClose){
      const d=dB(td(),e.plannedClose);
      push(e,d<=0?'Planned close is due.':d+'d to planned close.',d<=0?0.7:2.4,Math.abs(d),{category:'planned-close'});
      return;
    }

    if(st==='3-DAY BUFFER'){
      const d=daysUntilSafe(e);
      if(d!==null)push(e,d+'d left in close buffer.',1.4,Math.abs(d),{category:'close'});
      return;
    }

    // Close countdowns are action items, but they come after requirement
    // deadlines unless they are due/overdue.
    if(e.opened&&e.minHoldDays>0&&!e.feeChecked){
      const d=daysUntilSafe(e);
      if(d!==null){
        if(d<=0)push(e,'Safe to close now.',0.6,0,{category:'close'});
        else if(d<=14)push(e,d+'d until safe to close.',2.2,d,{category:'close'});
        else if(d<=60)push(e,d+'d until safe to close.',4.0,d,{category:'close'});
        else push(e,d+'d until safe to close.',5.0,d,{category:'close'});
        return;
      }
    }

    // Waiting-for-bonus is not urgent right away. Only surface it after it has
    // been waiting long enough to deserve follow-up.
    if(st==='REQ MET'){
      const d=e.reqMet?Math.max(0,dB(e.reqMet,td())):0;
      if(d>=30)push(e,'Waiting bonus — '+d+'d since req met.',6.0,d,{category:'waiting-bonus'});
      return;
    }

    if(e.bonusRecd){
      const el=elapsed(e);
      push(e,el!==null?el+'d since bonus received — review close timing.':'Bonus received — review close timing.',6.2,el===null?999999:el,{category:'bonus-received'});
      return;
    }

    // Data-quality item: an open entry without an opened date cannot calculate
    // requirement or close deadlines.
    if(!e.opened){
      push(e,'Missing opened date — deadlines cannot be calculated.',7.0,999999,{category:'data-quality'});
      return;
    }

    // If it is open but has no requirement deadline, keep it lower priority.
    if(e.opened&&!e.reqDays){
      const od=dB(e.opened,td());
      push(e,od>0?od+'d open — review bonus requirements.':'Open — review bonus requirements.',7.5,od<0?0:od,{category:'review'});
    }
  });

  const bestByEntry=new Map();
  sug.forEach(s=>{
    const key=s.dedupeKey||s.entryId||s.bank;
    const prev=bestByEntry.get(key);
    if(!prev||s.pri<prev.pri||(s.pri===prev.pri&&s.days<prev.days))bestByEntry.set(key,s);
  });

  return Array.from(bestByEntry.values()).sort((a,b)=>a.pri-b.pri||a.days-b.days||(b.bonus||0)-(a.bonus||0)||a.bank.localeCompare(b.bank))
}

function getChurnSuggestions(){
  const sug=[];
  entries.forEach(e=>{if(!e||!e.bank||!e.closed||!e.churn)return;const dl=daysLeft(e);if(dl===null)return;sug.push({bank:e.bank,rsn:dl<=0?'Ready to churn now.':dl+'d until churn.',bonus:e.bonus||0,showBonus:false,days:Math.max(0,dl)})});
  return sug.sort((a,b)=>a.days-b.days||(b.bonus||0)-(a.bonus||0)||a.bank.localeCompare(b.bank))
}

function chartData(){
  const ms=[];
  for(let m=0;m<12;m++){
    const l=['J','F','M','A','M','J','J','A','S','O','N','D'][m];
    const t=entries.filter(e=>isCompleted(e)&&new Date(e.closed+'T00:00:00').getFullYear()===dashYear&&new Date(e.closed+'T00:00:00').getMonth()===m).reduce((s,e)=>s+(e.bonus||0),0);
    ms.push({l,t})
  }
  return ms
}


/* Bank Identity v3.3.42
   Centralized bank matching. Display names can vary, but duplicate/churn
   matching uses canonical bank family + personal/business type. */
const BANK_IDENTITY_VERSION='3.3.62';
function normBankText(v){return String(v||'').toLowerCase().replace(/[®™℠]/g,'').replace(/&/g,' and ').replace(/\*/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()}
function bankAliasGroups(){return[
  ['chase','CHA',['chase','jpmorgan chase','jp morgan chase','jpmorgan','jp morgan','jpm']],
  ['bank of america','BOA',['bank of america','bofa','boa','merrill']],
  ['u.s. bank','USB',['u s bank','us bank','u s bancorp','us bancorp','usb','bank smartly','smartly checking']],
  ['wells fargo','WFB',['wells fargo','wf bank']],
  ['capital one','CAP',['capital one','cap one','c1 bank']],
  ['citibank','CIT',['citibank','citi bank','citi']],
  ['pnc bank','PNC',['pnc','pnc bank','virtual wallet','performance select']],
  ['regions bank','REG',['regions','regions bank','lifegreen','life green']],
  ['equity bank','EQU',['equity bank','equity bancshares','bloom bonus']],
  ['busey bank','BUS',['busey','busey bank','foundation checking','pillar banking','levelup']],
  ['academy bank','ACA',['academy bank','academy']],
  ['bmo','BMO',['bmo','bmo bank','bank of montreal']],
  ['fifth third','FTH',['fifth third','fifth third bank','53 bank','5 3 bank','5/3 bank']],
  ['td bank','TDB',['td bank','td checking']],
  ['huntington bank','HUN',['huntington','huntington bank']],
  ['central bank','CEN',['central bank']],
  ['community america','CAC',['community america','communityamerica','cacu','community america credit union']],
  ['ally bank','ALY',['ally','ally bank']],
  ['citizens bank','CTZ',['citizens','citizens bank']],
  ['comerica bank','COM',['comerica','comerica bank']],
  ['morgan stanley private bank','MSP',['morgan stanley private bank','morgan stanley','etrade','e trade','e trade bank','max rate checking']],
  ['keybank','KEY',['keybank','key bank']],
  ['m&t bank','MTB',['m t bank','mt bank','m and t bank','mandt bank','m t']],
  ['navy federal','NFC',['navy federal','navy federal credit union','nfcu']],
  ['santander bank','SAN',['santander','santander bank']],
  ['truist','TRU',['truist','truist bank','bb and t','bbt','suntrust']],
  ['vantage credit union','VAN',['vantage cu','vantage credit union','vantage']],
  ['schwab','SCH',['schwab','charles schwab','schwab bank']],
  ['discover bank','DSC',['discover','discover bank']],
  ['sofi','SOF',['sofi','sofi bank']],
  ['marcus','MAR',['marcus','goldman sachs','marcus by goldman sachs']],
  ['simmons bank','SIM',['simmons bank','simmons']],
  ['first national bank','FNB',['first national bank','fnb']]
]}
function aliasMatchFamily(n){
  n=normBankText(n);
  if(!n)return'';
  for(const [family,,aliases] of bankAliasGroups()){
    for(const a of aliases){
      const aa=normBankText(a);
      if(!aa)continue;
      if(n===aa||n.includes(' '+aa+' ')||n.startsWith(aa+' ')||n.endsWith(' '+aa)||n.includes(aa))return family;
    }
  }
  return'';
}
function normalizeAccountType(v){
  const s=String(v||'').toLowerCase().trim();
  if(['business','biz','b','commercial'].includes(s))return'business';
  if(['personal','consumer','individual','p'].includes(s))return'personal';
  return'';
}
function detectAccountTypeFromText(v){
  const n=normBankText(v);
  // Future-proof default: only mark Business when the text clearly says business.
  // Everything else defaults to Personal so there is no Unknown lane.
  if(!n)return'personal';
  if(/\b(biz|business|commercial|merchant|treasury|sboffer|llc|pllc|ein|dba|sole prop|sole proprietor|business complete|business advantage|performance business|enhanced business|basic business|business checking|small business)\b/i.test(n))return'business';
  return'personal';
}
function inferAccountTypeForEntry(e){
  const explicit=normalizeAccountType(e&&e.accountType);
  if(explicit)return explicit;
  const id=String((e&&e.id)||'').toUpperCase();
  const m=id.match(/^[A-Z0-9]{3}-([PB])-\d{2}$/);
  if(m)return m[1]==='B'?'business':'personal';
  const text=[e&&e.bank,e&&e.acct,e&&e.accountName,e&&e.analyzedTC,e&&e.completeBonusText,e&&e.eligibilityText,e&&e.notes].filter(Boolean).join(' ');
  return detectAccountTypeFromText(text);
}
function accountTypeCode(v){
  const t=(v&&typeof v==='object')?inferAccountTypeForEntry(v):(normalizeAccountType(v)||detectAccountTypeFromText(v));
  return t==='business'?'B':'P';
}
function accountTypeLabel(v){
  const t=(v&&typeof v==='object')?inferAccountTypeForEntry(v):(normalizeAccountType(v)||detectAccountTypeFromText(v));
  return t==='business'?'Business':'Personal';
}
function accountTypeChipHtml(e){
  const t=inferAccountTypeForEntry(e);
  const cls=t==='business'?'c2':'c1';
  const label=t==='business'?'BUSINESS':'PERSONAL';
  return '<span class="card-mini-chip acct-type-chip '+cls+'">'+label+'</span>'
}
function normalizeEntryAccountTypeRow(e){
  if(!e||typeof e!=='object')return e;
  const current=normalizeAccountType(e.accountType);
  if(current)return{...e,accountType:current};
  return{...e,accountType:inferAccountTypeForEntry(e)||'personal'};
}
function migrateEntryAccountTypes(rows){
  let changed=false;
  const next=(rows||[]).map(e=>{const before=e&&e.accountType;const row=normalizeEntryAccountTypeRow(e);if((row&&row.accountType)!==before)changed=true;return row});
  if(changed)try{sv(SK,next)}catch{}
  return next;
}
function syncModalAccountTypeFromBank(){
  if(!modal)return;
  const cur=normalizeAccountType(modal.accountType);
  if(cur)return;
  modal.accountType=detectAccountTypeFromText([modal.bank,modal.analyzedTC,modal.completeBonusText,modal.eligibilityText].filter(Boolean).join(' '));
}
function bankTypeInfo(name){
  const n=normBankText(name);
  const biz=/\b(biz|business|commercial|merchant|treasury|sboffer|llc|pllc|inc|corp|corporation|company|sole prop|sole proprietor|ein|business complete|business advantage|performance business|enhanced business|basic business|business checking|small business)\b/i.test(n);
  if(biz)return{type:'B',explicit:true,reason:'business'};
  const personal=/\b(personal|consumer|individual|household|total checking|safebalance|advantage plus|advantage relationship|smartly|virtual wallet|life green|lifegreen|bloom|foundation checking|pillar banking|max rate|maxrate|everyday checking|college checking|sapphire checking|premier plus checking|checking and savings combo)\b/i.test(n);
  if(personal)return{type:'P',explicit:true,reason:'personal'};
  return{type:'P',explicit:false,reason:'default-personal'};
}
function bankTypeCode(name){
  if(name&&typeof name==='object'){
    const explicit=normalizeAccountType(name.accountType);
    if(explicit==='business')return'B';
    if(explicit==='personal')return'P';
    const info=bankTypeInfo(name.bank||'');
    if(info.explicit)return info.type;
    const id=String(name.id||'').toUpperCase();
    const m=id.match(/^[A-Z0-9]{3}-([PB])-\d{2}$/);
    return m?m[1]:info.type;
  }
  return bankTypeInfo(name).type
}
function normalizeBankFamily(name){
  let n=normBankText(name);
  const direct=aliasMatchFamily(n);
  if(direct)return direct;
  n=n.replace(/\b(biz|business|commercial|merchant|small business|personal|consumer|checking|savings|account|accounts|bonus|promo|offer|banking|bank)\b/g,' ')
     .replace(/\b(essentials|preferred|complete|advantage|everyday|premier|plus|basic|elite|select|smartly|total|relationship|fundamentals|enhanced|performance|virtual|wallet)\b/g,' ')
     .replace(/\s+/g,' ').trim();
  const second=aliasMatchFamily(n);
  return second||n;
}
function bankCode(name){
  const family=normalizeBankFamily(name);
  const found=bankAliasGroups().find(g=>g[0]===family);
  if(found)return found[1];
  const overrides={'u.s bank':'USB','u.s. bank':'USB','bank of america':'BOA','wells fargo':'WFB','capital one':'CAP','fifth third':'FTH','pnc bank':'PNC','regions bank':'REG'};
  if(overrides[family])return overrides[family];
  const words=family.replace(/[^a-z0-9 ]/g,'').split(' ').filter(Boolean).filter(w=>!['bank','credit','union','financial','federal'].includes(w));
  if(!words.length)return'BNK';
  if(words.length===1)return words[0].slice(0,3).toUpperCase().padEnd(3,'X');
  return (words[0][0]+(words[1]?.[0]||'')+(words[2]?.[0]||words[1]?.[1]||'')).toUpperCase().padEnd(3,'X').slice(0,3);
}
function bankIdentity(name){const family=normalizeBankFamily(name);const typeInfo=bankTypeInfo(name);return{family,code:bankCode(name),type:typeInfo.type,typeExplicit:typeInfo.explicit,key:bankCode(name)+'|'+typeInfo.type,display:String(name||'').trim()}}
function bankKey(name){return bankIdentity(name).key}
function entryBankType(e){
  const explicit=normalizeAccountType(e&&e.accountType);
  if(explicit==='business')return'B';
  if(explicit==='personal')return'P';
  const id=String((e&&e.id)||'').toUpperCase();
  const m=id.match(/^[A-Z0-9]{3}-([PB])-\d{2}$/);
  const nameInfo=bankTypeInfo((e&&e.bank)||e||'');
  if(nameInfo.explicit)return nameInfo.type;
  return m?m[1]:nameInfo.type;
}
function entryBankIdentity(e){const bank=(e&&e.bank)||e||'';const idt=bankIdentity(bank);idt.type=entryBankType(e);idt.key=idt.code+'|'+idt.type;return idt}
function entryBankKey(e){return entryBankIdentity(e).key}
function isOfficialEntryId(id){return /^[A-Z0-9]{3}-[PB]-\d{2}$/i.test(String(id||'').trim())}
function makeDraftId(bank){const bankName=(bank&&typeof bank==='object')?(bank.bank||''):bank;return 'DRAFT-'+bankCode(bankName)+'-'+bankTypeCode(bank)+'-'+Math.random().toString(36).slice(2,6).toUpperCase()}
function officialIdSet(){return new Set(entries.map(e=>e&&e.id).filter(isOfficialEntryId).map(id=>String(id).toUpperCase()))}
function assignEntryIdForCreate(entry){const next=normalizeEntryAccountTypeRow({...entry});next.id=next.opened?genId(next,officialIdSet()):makeDraftId(next);return next}
function promoteDraftEntryId(entry,oldId){const next=normalizeEntryAccountTypeRow({...entry});if(next.opened&&!isOfficialEntryId(next.id)){next.id=genId(next,officialIdSet());if(oldId&&oldId!==next.id)remapEntryReferences(oldId,next.id,next.bank)}return next}
function remapEntryReferences(oldId,newId,bank){if(!oldId||!newId||oldId===newId)return;saveProfileEvents(loadProfileEvents().map(x=>x.entryId===oldId&&bankKey(x.bank)===bankKey(bank)?{...x,entryId:newId}:x));saveUserDatapoints(loadUserDatapoints().map(x=>x.entryId===oldId&&bankKey(x.bank)===bankKey(bank)?{...x,entryId:newId}:x));const reqs=loadReqs();let changed=false;Object.keys(reqs||{}).forEach(k=>{const row=reqs[k];if(row&&row.sourceEntryId===oldId&&bankKey(row.bank||k)===bankKey(bank)){reqs[k]={...row,sourceEntryId:newId};changed=true}});if(changed)saveReqs(reqs)}
function getEntryDisplayId(e){if(!e)return'';if(isOfficialEntryId(e.id))return e.id;return e.opened?'Pending ID refresh':'Pending open date'}
/* Duplicate handling is driven by canonical bank family + personal/business type.
   If the typed name is ambiguous and both personal/business records exist, the
   app shows a picker instead of silently creating or replacing the wrong bank. */
function getBankMatches(bankInput){
  const bankName=(bankInput&&typeof bankInput==='object')?(bankInput.bank||''):bankInput;
  if(!bankName)return[];
  const wanted=(bankInput&&typeof bankInput==='object')?entryBankIdentity(bankInput):bankIdentity(bankName);
  const explicitType=bankInput&&typeof bankInput==='object'&&['personal','business'].includes(normalizeAccountType(bankInput.accountType));
  const sameFamily=entries.filter(e=>e&&e.bank&&entryBankIdentity(e).family===wanted.family);
  if(!sameFamily.length)return[];
  if(wanted.typeExplicit||explicitType)return sameFamily.filter(e=>entryBankType(e)===wanted.type);
  const sameType=sameFamily.filter(e=>entryBankType(e)===wanted.type);
  const types=new Set(sameFamily.map(entryBankType));
  if(types.size>1)return sameFamily;
  return sameType.length?sameType:sameFamily;
}
function isActiveEntry(e){return!!(e&&e.bank&&!e.closed)}
function entryRecencyDate(e){return e?.closed||e?.opened||''}
function findExistingByBank(bankName){
  const matches=getBankMatches({bank:bankName});
  if(!matches.length)return null;
  const active=matches.find(isActiveEntry);
  if(active)return active;
  return [...matches].sort((a,b)=>entryRecencyDate(b).localeCompare(entryRecencyDate(a)))[0]||null;
}
function makeDuplicatePrompt(newData,existingEntry,source='manual'){
  return{newData,existingEntry,mode:isActiveEntry(existingEntry)?'active':'history',source};
}
function entryTypeLabel(x){const t=(x&&typeof x==='object')?entryBankType(x):bankTypeCode(x);return t==='B'?'Business':'Personal'}
function sortMatchChoices(bankName,matches){
  const wanted=bankIdentity(bankName);
  return[...matches].sort((a,b)=>{
    const ai=entryBankIdentity(a),bi=entryBankIdentity(b);
    const aExact=ai.key===wanted.key?0:1;
    const bExact=bi.key===wanted.key?0:1;
    if(aExact!==bExact)return aExact-bExact;
    const aActive=isActiveEntry(a)?0:1;
    const bActive=isActiveEntry(b)?0:1;
    if(aActive!==bActive)return aActive-bActive;
    return entryRecencyDate(b).localeCompare(entryRecencyDate(a));
  });
}
function handleDuplicateFlow(newData,source='manual'){
  const bank=(newData&&newData.bank)||'';
  const matches=sortMatchChoices(bank,getBankMatches(newData));
  if(!matches.length)return false;
  if(matches.length>1){matchPickerPrompt={newData,matches,source,identity:bankIdentity(bank)};return true;}
  overwritePrompt=makeDuplicatePrompt(newData,matches[0],source);return true;
}
function dpSignature(bank,method){return bankKey(bank)+'|'+String(method||'').trim().toLowerCase()}
function syncExistingDatapointsToDB(){const rows=loadUserDatapoints();const seen=new Set(rows.map(r=>dpSignature(r.bank,r.method)));let changed=false;entries.forEach(e=>{if(!e||!e.bank||!e.dataPoint)return;const sig=dpSignature(e.bank,e.dataPoint);if(seen.has(sig))return;rows.push(normalizeUserDatapoint({bank:e.bank,method:e.dataPoint,note:'Imported from tracker history',date:e.closed||e.bonusRecd||e.opened||td(),entryId:e.id||''}));seen.add(sig);changed=true});if(changed)saveUserDatapoints(rows)}
function normalizeCommunityDatapoint(row,i){const x=(row&&typeof row==='object')?{...row}:{};return{id:String(x.id||('cdp_'+(i||0)+'_'+Math.random().toString(36).slice(2,6))),bank:String(x.bank||'').trim(),method:String(x.method||'').trim(),result:String(x.result||x.note||'').trim(),link:String(x.link||'').trim()}}
function communitySig(x){return normalizeBankFamily(x.bank)+'|'+String(x.method||'').trim().toLowerCase()}
function defaultCommunityRows(){return DATA_POINTS.map(([bank,method,result,link],i)=>normalizeCommunityDatapoint({id:'cdp_'+i,bank,method,result,link},i))}
function loadCommunityDatapoints(){const saved=ld(COMMUNITY_DP_KEY,null);let rows=Array.isArray(saved)?saved.map(normalizeCommunityDatapoint).filter(x=>x.bank&&x.method):[];const seedVer=(()=>{try{return localStorage.getItem(COMMUNITY_DP_SEED_KEY)||''}catch{return''}})();if(seedVer!=='doc_v2'){const defaults=defaultCommunityRows();const defaultSigs=new Set(defaults.map(communitySig));const legacySigs=new Set(LEGACY_COMMUNITY_DEFAULTS.map(([bank,method])=>communitySig({bank,method})));rows=rows.filter(x=>!(legacySigs.has(communitySig(x))&&!defaultSigs.has(communitySig(x))));const seen=new Set(rows.map(communitySig));defaults.forEach(item=>{const sig=communitySig(item);if(!seen.has(sig)){rows.push(item);seen.add(sig)}});rows.sort((a,b)=>a.bank.localeCompare(b.bank)||a.method.localeCompare(b.method));sv(COMMUNITY_DP_KEY,rows);try{localStorage.setItem(COMMUNITY_DP_SEED_KEY,'doc_v2')}catch{}}if(!rows.length&&!Array.isArray(saved)){rows=defaultCommunityRows();sv(COMMUNITY_DP_KEY,rows);try{localStorage.setItem(COMMUNITY_DP_SEED_KEY,'doc_v2')}catch{}}return rows}
function saveCommunityDatapoints(rows){sv(COMMUNITY_DP_KEY,(rows||[]).map(normalizeCommunityDatapoint).filter(x=>x.bank&&x.method));try{localStorage.setItem(COMMUNITY_DP_SEED_KEY,'doc_v2')}catch{}}
function getCommunityDatapoints(){return loadCommunityDatapoints()}
function buildDatapointGroups(){const user=loadUserDatapoints();const community=getCommunityDatapoints();const map=new Map();const ensure=(bank)=>{const key=bankKey(bank||'Unknown Bank');if(!map.has(key))map.set(key,{key,bank:bank||'Unknown Bank',user:[],community:[],entryCount:0});const cur=map.get(key);if((cur.bank||'').length<(bank||'').length)cur.bank=bank;return cur;};entries.forEach(e=>{if(e&&e.bank){const g=ensure(e.bank);g.entryCount++;}});user.forEach(item=>ensure(item.bank).user.push(item));community.forEach(item=>ensure(item.bank).community.push(item));let groups=Array.from(map.values()).map(g=>({...g,user:g.user.sort((a,b)=>(b.lastConfirmedAt||'').localeCompare(a.lastConfirmedAt||'')||a.method.localeCompare(b.method)),community:g.community.sort((a,b)=>a.method.localeCompare(b.method))}));const q=dpSearch.trim().toLowerCase();if(q){groups=groups.filter(g=>{if((g.bank||'').toLowerCase().includes(q))return true;if(g.user.some(x=>(x.method||'').toLowerCase().includes(q)||(x.note||'').toLowerCase().includes(q)))return true;if(g.community.some(x=>(x.method||'').toLowerCase().includes(q)||(x.result||'').toLowerCase().includes(q)))return true;return false;})}return groups.sort((a,b)=>{const aScore=(a.user.length?0:1)+(a.community.length?0:2);const bScore=(b.user.length?0:1)+(b.community.length?0:2);return aScore-bScore||b.user.length-a.user.length||b.community.length-a.community.length||a.bank.localeCompare(b.bank)})}
function toggleDPBank(key){dpExpandedBankKey=dpExpandedBankKey===key?'':key;R()}
function addUserDPForBank(bankEnc){const bank=decodeURIComponent(bankEnc||'');if(!bank)return;dpEditor={type:'user',mode:'new',id:'',bank,method:'',note:'',lastConfirmedAt:td()};dpExpandedBankKey=bankKey(bank);R()}
function addCommunityDPForBank(bankEnc){const bank=decodeURIComponent(bankEnc||'');if(!bank)return;dpEditor={type:'community',mode:'new',id:'',bank,method:'',result:'',link:''};dpExpandedBankKey=bankKey(bank);R()}
function openUserDPEditor(id){const item=loadUserDatapoints().find(r=>r.id===id);if(!item)return;dpEditor={type:'user',mode:'edit',id:item.id,bank:item.bank,method:item.method,note:item.note||'',lastConfirmedAt:item.lastConfirmedAt||td()};R()}
function openCommunityDPEditor(id){const item=loadCommunityDatapoints().find(r=>r.id===id);if(!item)return;dpEditor={type:'community',mode:'edit',id:item.id,bank:item.bank,method:item.method,result:item.result||'',link:item.link||''};R()}
function closeDPEditor(){dpEditor=null;R()}
function saveDPEditor(){if(!dpEditor)return;const bank=String(dpEditor.bank||'').trim();const method=String(dpEditor.method||'').trim();if(!bank||!method){alert('Bank and datapoint method are required');return}if(dpEditor.type==='user'){const rows=loadUserDatapoints();if(dpEditor.mode==='edit'&&dpEditor.id){const idx=rows.findIndex(r=>r.id===dpEditor.id);if(idx>=0)rows[idx]={...rows[idx],bank,method,note:String(dpEditor.note||'').trim(),lastConfirmedAt:dpEditor.lastConfirmedAt||td(),updatedAt:td()}}else{rows.unshift(normalizeUserDatapoint({bank,method,note:String(dpEditor.note||'').trim(),date:dpEditor.lastConfirmedAt||td()}))}saveUserDatapoints(rows);dpExpandedBankKey=bankKey(bank);dpEditor=null;R();return}const rows=loadCommunityDatapoints();if(dpEditor.mode==='edit'&&dpEditor.id){const idx=rows.findIndex(r=>r.id===dpEditor.id);if(idx>=0)rows[idx]={...rows[idx],bank,method,result:String(dpEditor.result||'').trim(),link:String(dpEditor.link||'').trim()}}else{rows.unshift(normalizeCommunityDatapoint({bank,method,result:String(dpEditor.result||'').trim(),link:String(dpEditor.link||'').trim()}))}saveCommunityDatapoints(rows);dpExpandedBankKey=bankKey(bank);dpEditor=null;R()}
function deleteUserDP(id){const rows=loadUserDatapoints();const item=rows.find(r=>r.id===id);if(!item)return;cfm={title:'Delete datapoint',msg:'Remove '+item.method+' from '+item.bank+'?',action:()=>{saveUserDatapoints(rows.filter(r=>r.id!==id));if(dpEditor&&dpEditor.id===id)dpEditor=null;cfm=null;R()}};R()}
function deleteCommunityDP(id){const rows=loadCommunityDatapoints();const item=rows.find(r=>r.id===id);if(!item)return;cfm={title:'Delete community datapoint',msg:'Remove '+item.method+' from '+item.bank+'?',action:()=>{saveCommunityDatapoints(rows.filter(r=>r.id!==id));if(dpEditor&&dpEditor.id===id)dpEditor=null;cfm=null;R()}};R()}
function deleteDPBankGroup(groupKey,bankEnc){const bank=decodeURIComponent(bankEnc||'');if(!groupKey)return;const entryMatches=entries.filter(e=>bankKey(e.bank)===groupKey);const entryIds=new Set(entryMatches.map(e=>e.id));const userRows=loadUserDatapoints();const communityRows=loadCommunityDatapoints();const userMatches=userRows.filter(r=>bankKey(r.bank)===groupKey);const communityMatches=communityRows.filter(r=>bankKey(r.bank)===groupKey);const reqs=loadReqs();const reqKeys=Object.keys(reqs||{}).filter(k=>bankKey(((reqs[k]||{}).bank)||k)===groupKey);const parts=[];if(entryMatches.length)parts.push(entryMatches.length+' tracker '+(entryMatches.length===1?'entry':'entries'));if(userMatches.length)parts.push(userMatches.length+' confirmed datapoint'+(userMatches.length===1?'':'s'));if(communityMatches.length)parts.push(communityMatches.length+' community datapoint'+(communityMatches.length===1?'':'s'));if(reqKeys.length)parts.push(reqKeys.length+' saved requirement'+(reqKeys.length===1?'':'s'));const detail=parts.length?parts.join(', '):'this empty bank shell';cfm={title:'Delete bank',msg:'Delete the entire '+bank+' bank group?\n\nThis will remove '+detail+'.\n\nThis cannot be undone.',action:()=>{entries=entries.filter(e=>bankKey(e.bank)!==groupKey);sv(SK,entries);saveUserDatapoints(userRows.filter(r=>bankKey(r.bank)!==groupKey));saveCommunityDatapoints(communityRows.filter(r=>bankKey(r.bank)!==groupKey));if(reqKeys.length){const next={...reqs};reqKeys.forEach(k=>delete next[k]);saveReqs(next)}if(dpEditor&&bankKey(dpEditor.bank)===groupKey)dpEditor=null;if(modal&&bankKey(modal.bank)===groupKey)modal=null;if(expanded&&entryIds.has(expanded))expanded=null;if(undoState&&bankKey(undoState.bank)===groupKey)undoState=null;dpExpandedBankKey='';cfm=null;R()}};R()}
function rDpEditor(){const d=dpEditor;if(!d)return'';let h='<div class="ov" onclick="closeDPEditor()"><div class="modal" onclick="event.stopPropagation()">';h+='<div class="m-bar"></div><div class="m-hdr"><h2>'+(d.type==='user'?(d.mode==='edit'?'Edit Confirmed Datapoint':'New Confirmed Datapoint'):(d.mode==='edit'?'Edit Community Datapoint':'New Community Datapoint'))+'</h2><span class="m-id">'+esc(d.bank||'')+'</span></div>';h+='<div class="fg"><label>Bank</label><input value="'+esc(d.bank||'')+'" oninput="dpEditor.bank=this.value"></div>';h+='<div class="fg"><label>Method / datapoint</label><input value="'+esc(d.method||'')+'" oninput="dpEditor.method=this.value" placeholder="e.g. Fidelity ACH works"></div>';if(d.type==='user'){h+='<div class="fg"><label>Notes</label><textarea rows="4" oninput="dpEditor.note=this.value" placeholder="Optional note for your future self or future autofill logic">'+esc(d.note||'')+'</textarea></div>';h+='<div class="fg"><label>Last confirmed</label><input type="date" value="'+esc(d.lastConfirmedAt||'')+'" oninput="dpEditor.lastConfirmedAt=this.value"></div>';}else{h+='<div class="fg"><label>Community note / result</label><textarea rows="4" oninput="dpEditor.result=this.value" placeholder="e.g. Works as DD, ACH may fail, Safe anytime">'+esc(d.result||'')+'</textarea></div>';h+='<div class="fg"><label>Source link</label><input value="'+esc(d.link||'')+'" oninput="dpEditor.link=this.value" placeholder="Optional source URL"></div>';}h+='<button class="btn-p" onclick="saveDPEditor()">Save</button>';h+='<button class="btn-s" onclick="closeDPEditor()">Cancel</button>';if(d.mode==='edit'){h+='<button class="btn-d" onclick="'+(d.type==='user'?'deleteUserDP(\''+d.id+'\')':'deleteCommunityDP(\''+d.id+'\')')+'">Delete</button>';}h+='</div></div>';return h}

/* -----------------------------
   SMARTER T&C ANALYZER HELPERS
   ----------------------------- */
function normalizeTCText(text){
  return (text||'')
    .replace(/\u00A0/g,' ')
    .replace(/[“”]/g,'"')
    .replace(/[‘’]/g,"'")
    .replace(/[‐‑–—]/g,'-')
    .replace(/[•●▪◦]/g,' • ')
    .replace(/\t/g,' ')
    .replace(/\r/g,'\n')
    .replace(/[ ]{2,}/g,' ')
    .replace(/\n{3,}/g,'\n\n')
    .trim();
}
function tcWordToNumber(tok){
  const words={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
  const v=(tok||'').toString().trim().toLowerCase();
  if(/^\d+$/.test(v))return parseInt(v,10);
  return words[v]||null;
}
function tcFmtMoney(v){if(v===null||v===undefined||v==='')return'';return'$'+String(v).replace(/,/g,'');}
function tcUnique(arr){return [...new Set(arr.filter(Boolean))];}
function tcKeywordScore(segment, positives=[], negatives=[]){
  const s=(segment||'').toLowerCase();
  let score=0;
  positives.forEach(k=>{if(s.includes(k))score+=3});
  negatives.forEach(k=>{if(s.includes(k))score-=4});
  if(/[:•-]/.test(segment))score+=1;
  if(segment.length<220)score+=1;
  return score;
}
function tcSegments(text){
  const normalized=normalizeTCText(text);
  const raw=[];
  normalized.split(/\n+/).forEach(line=>{
    const trimmed=line.trim();
    if(!trimmed)return;
    raw.push(trimmed);
    trimmed.split(/(?<=[.;])\s+(?=[A-Z0-9$])/).forEach(part=>{const p=part.trim();if(p&&p!==trimmed)raw.push(p)});
    trimmed.split(/\s+•\s+/).forEach(part=>{const p=part.trim();if(p&&p!==trimmed)raw.push(p)});
  });
  return tcUnique(raw).filter(x=>x.length>2);
}
function tcPickBest(segments, defs, positives=[], negatives=[]){
  const hits=[];
  segments.forEach((seg,idx)=>{
    defs.forEach(def=>{
      const m=seg.match(def.re);
      if(!m)return;
      const value=def.get?def.get(m,seg):m[1];
      if(value===undefined||value===null||value==='')return;
      const score=(def.base||0)+tcKeywordScore(seg,positives,negatives)+(Math.max(0,20-idx)*0.05);
      hits.push({value,seg,score});
    });
  });
  hits.sort((a,b)=>b.score-a.score);
  return hits[0]||null;
}
function tcFindKnownBank(text){
  const lower=normalizeTCText(text).toLowerCase();
  const known=tcUnique([
    ...Object.keys(BANK_BRANDS||{}),
    ...((TEMPLATES||[]).map(x=>(x.bank||'').toLowerCase())),
    ...((RULES||[]).map(x=>((x&&x[0])||'').toLowerCase()))
  ]).filter(Boolean).sort((a,b)=>b.length-a.length);
  for(const name of known){if(name&&lower.includes(name))return name.replace(/\b\w/g,c=>c.toUpperCase())}
  return '';
}
function buildTrackerNotes(r,t){
  const n=[];
  if(r.conflicts&&r.conflicts.length){n.push('* Review needed: '+r.conflicts.join(' | '));n.push('')}
  if(r.bonusAmount)n.push('* Bonus: '+r.bonusAmount+(r.bonusTiers?' (Tiers: '+r.bonusTiers+')':''));
  if(r.acctType)n.push('* Account: '+r.acctType);
  if(r.openWindow)n.push('* Open between: '+r.openWindow);
  if(r.promoCode)n.push('* Promo code: '+r.promoCode);
  if(r.creditCheck)n.push('* Subject to credit approval');
  n.push('');
  n.push('REQUIREMENTS:');
  let step=1;
  if(r.requiresOnlineBanking){n.push('* Step '+step+': Enroll in online/mobile banking');step++}
  if(r.requiresEstatements){n.push('* Step '+step+': Enroll in eStatements');step++}
  if(r.ddAmount){let ddStr='* Step '+step+': Direct deposit '+r.ddAmount;if(r.ddCount)ddStr+=' ('+r.ddCount+' or more deposits)';if(r.ddPerCycle)ddStr+=' per statement cycle';if(r.ddMonthly)ddStr+=' per month';if(r.timeline)ddStr+=' within '+r.timeline;n.push(ddStr);step++}
  if(r.debitTxns){n.push('* Step '+step+': Complete '+r.debitTxns+' debit card transactions');step++}
  if(r.activateDebit){n.push('* Step '+step+': Activate debit card and make at least 1 transaction');step++}
  if(r.maintainDays){n.push('* Step '+step+': Maintain balance for '+r.maintainDays+' consecutive days');step++}
  if(r.cycles)n.push('* Complete within '+r.cycles);
  if(r.ddMustBe.length||r.ddExcluded.length){n.push('');n.push('DIRECT DEPOSIT RULES:');if(r.ddMustBe.length)n.push('* DD must be from: '+r.ddMustBe.join(', '));if(r.ddExcluded.length)n.push('* Does NOT count: '+r.ddExcluded.join(', '))}
  if(r.hasInvestingBonus||r.savingsBonus||r.bundledBonus){n.push('');n.push('ADDITIONAL BONUSES:');if(r.hasInvestingBonus)n.push('* Guided Investing: Fund '+(r.investMin||'minimum')+(r.maintainDays?', maintain for '+r.maintainDays+' days':''));if(r.savingsBonus)n.push('* Savings bonus: '+r.savingsBonus);if(r.bundledBonus)n.push('* Bundled bonus: Extra '+r.bundledBonus+' for completing both')}
  n.push('');
  n.push('FEES & TIMING:');
  if(r.monthlyFee)n.push('* Monthly fee: '+r.monthlyFee);
  if(r.feeWaiver)n.push('* Fee waiver: '+r.feeWaiver);
  if(r.minBalance)n.push('* Min opening deposit: '+r.minBalance);
  if(r.bonusPostTime)n.push('* Bonus posts: '+r.bonusPostTime);
  if(r.earlyCloseDays)n.push('* Min hold: '+r.earlyCloseDays+' days before closing');
  if(r.earlyCloseFee)n.push('* Early close penalty: '+r.earlyCloseFee);
  if(!r.earlyCloseFee&&!r.earlyCloseDays)n.push('* Early close fee: Not mentioned');
  if(r.ccFunding)n.push('* Credit card funding: Available');
  if(r.pullType)n.push('* Credit check: '+r.pullType);
  n.push('');
  n.push('CHURN & TAX:');
  if(r.churnRule==='Once per lifetime')n.push('* Churn cooldown: Once per lifetime');
  else if(r.churnRule)n.push('* Churn cooldown: '+r.churnRule+(r.churnMonths?' ('+r.churnMonths+' months)':''));
  else n.push('* Churn rule: Check fine print');
  if(r.taxForm)n.push('* Tax: '+r.taxForm);
  if(t.includes('limit one'))n.push('* Limit one bonus per account/member');
  if(t.includes('cannot be combined')||t.includes('not be combined'))n.push('* Cannot be combined with other offers');
  if(t.includes('open and in good standing'))n.push('* Account must be open and in good standing at payout');
  return n.filter(x=>x!==undefined).join('\n');
}
function buildChecklistFromAnalysis(r){
  const checklist=[];
  if(r.promoCode)checklist.push('Use promo code '+r.promoCode);
  if(r.requiresEstatements)checklist.push('Enroll in eStatements');
  if(r.requiresOnlineBanking)checklist.push('Enroll in online banking');
  if(r.ddAmount)checklist.push('Set up DD of '+r.ddAmount);
  if(r.debitTxns)checklist.push(r.debitTxns+' debit transactions');
  if(r.activateDebit)checklist.push('Activate debit card');
  if(r.timeline)checklist.push('Complete within '+r.timeline);
  if(r.earlyCloseDays)checklist.push('Hold account '+r.earlyCloseDays+' days');
  return checklist;
}

/* -----------------------------
   SMARTER T&C ANALYZER HELPERS
   ----------------------------- */
function normalizeTCText(text){
  return(text||'')
    .replace(/\u00A0/g,' ')
    .replace(/[“”]/g,'"')
    .replace(/[‘’]/g,"'")
    .replace(/[•●▪◦‣]/g,' • ')
    .replace(/[–—]/g,'-')
    .replace(/\r/g,'\n')
    .replace(/\t/g,' ')
    .replace(/\n[ \t]+/g,'\n')
    .replace(/[ ]{2,}/g,' ')
    .replace(/\n{3,}/g,'\n\n')
    .trim()
}
function tcParseWordNumber(token){
  if(token===undefined||token===null)return null;
  const raw=String(token).toLowerCase().trim().replace(/[^a-z0-9-]/g,'');
  if(/^\d+$/.test(raw))return parseInt(raw,10);
  const map={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,twenty:20,twentyfour:24,'twenty-four':24,thirty:30,sixty:60,ninety:90,onehundred:100,'one-hundred':100};
  return map[raw]??null
}
function tcMoney(v){if(v===undefined||v===null||v==='')return'';return'$'+String(v).replace(/[^\d.]/g,'').replace(/\B(?=(\d{3})+(?!\d))/g,',')}
function tcSegments(text){
  const normalized=normalizeTCText(text);
  const rawLines=normalized.split(/\n+/).map(s=>s.trim()).filter(Boolean);
  const out=[];const seen=new Set();
  const pushSeg=s=>{const seg=(s||'').trim();if(seg.length<3||seen.has(seg))return;seen.add(seg);out.push(seg)};
  rawLines.forEach(line=>{
    const cleaned=line.replace(/^[\-*•]+\s*/,'').trim();
    if(!cleaned)return;
    pushSeg(cleaned);
    cleaned.split(/(?<=[.!?;:])\s+(?=[A-Z0-9$])/).forEach(pushSeg)
  });
  return out
}
function tcScoreSegment(segment,keywords=[],negativeKeywords=[]){
  const s=(segment||'').toLowerCase();
  let score=0;
  keywords.forEach(k=>{if(s.includes(k))score+=4});
  negativeKeywords.forEach(k=>{if(s.includes(k))score-=5});
  if(/bonus|qualify|requirement|eligibility|fee|direct deposit|transaction|maintain|new money|good standing/.test(s))score+=1;
  return score
}
function tcPickBest(segments,patterns,opts={}){
  const hits=[];
  segments.forEach((segment,idx)=>{
    patterns.forEach((cfg,pIndex)=>{
      const m=segment.match(cfg.pattern);
      if(!m)return;
      let value=cfg.value?cfg.value(m,segment):m[1];
      if(value===undefined||value===null||value==='')return;
      const score=(cfg.base||0)+tcScoreSegment(segment,opts.keywords||[],opts.negativeKeywords||[])-Math.min(idx,20)*0.05-pIndex*0.01;
      hits.push({value,segment,score,match:m[0]})
    })
  });
  hits.sort((a,b)=>b.score-a.score);
  return hits[0]||null
}
function tcCollectDollars(segments,keywords=[],negativeKeywords=[],requireBonusContext=false){
  const vals=[];const seen=new Set();
  segments.forEach(seg=>{
    const low=seg.toLowerCase();
    if(keywords.length&&!keywords.some(k=>low.includes(k)))return;
    if(negativeKeywords.some(k=>low.includes(k)))return;
    if(requireBonusContext&&!/(bonus|credit|incentive)/i.test(seg))return;
    for(const m of seg.matchAll(/\$([\d,]+(?:\.\d+)?)/g)){
      const val=tcMoney(m[1]);
      if(!seen.has(val)){seen.add(val);vals.push(val)}
    }
  });
  return vals
}
function tcBestDays(segments,keywords=[]){
  const hit=tcPickBest(segments,[
    {pattern:/within\s+(\d+)\s+days?/i,value:m=>parseInt(m[1],10),base:18},
    {pattern:/for\s+(\d+)\s+days?/i,value:m=>parseInt(m[1],10),base:16},
    {pattern:/(\d+)\s+days?\s+after/i,value:m=>parseInt(m[1],10),base:17},
    {pattern:/first\s+(\d+)\s+days?/i,value:m=>parseInt(m[1],10),base:14}
  ],{keywords,negativeKeywords:['calendar day of the month']});
  return hit?hit.value:null
}
function tcBestCount(segments,keywords=[]){
  const hit=tcPickBest(segments,[
    {pattern:/(\d+)\s+(?:qualifying\s+)?transactions?/i,value:m=>parseInt(m[1],10),base:18},
    {pattern:/complete\s+(\w+)\s+(?:qualifying\s+)?transactions?/i,value:m=>tcParseWordNumber(m[1]),base:16},
    {pattern:/(\d+)\s+(?:or\s+more\s+)?(?:qualifying\s+)?direct\s+deposits?/i,value:m=>parseInt(m[1],10),base:18},
    {pattern:/at\s+least\s+(\w+)\s+direct/i,value:m=>tcParseWordNumber(m[1]),base:16}
  ],{keywords});
  return hit?hit.value:null
}
function tcKnownBankName(text){
  const low=(text||'').toLowerCase();
  const canonMap={};
  Object.keys(BANK_BRANDS||{}).forEach(k=>{canonMap[k.toLowerCase()]=k});
  (((typeof TEMPLATES!=='undefined'&&TEMPLATES)||[])).forEach(x=>{if(x&&x.bank)canonMap[x.bank.toLowerCase()]=x.bank});
  (((typeof RULES!=='undefined'&&RULES)||[])).forEach(x=>{if(x&&x[0])canonMap[x[0].toLowerCase()]=x[0]});
  const matches=Object.keys(canonMap).filter(name=>name&&low.includes(name)).sort((a,b)=>b.length-a.length);
  if(matches[0]){const hit=canonMap[matches[0]];if(/^u\.?s\.? bank$/i.test(hit))return 'U.S. Bank';if(/^u\.?s\.? bank biz$/i.test(hit))return 'U.S. Bank Biz';return hit.split(' ').map(w=>w?w[0].toUpperCase()+w.slice(1):w).join(' ')}
  if(low.includes('u.s. bank'))return 'U.S. Bank';
  const m=text.match(/(?:new\s+)?([A-Z][\w&.\-\s]{2,40}?)\s+(?:business\s+checking|checking|savings|account)/);
  return m?m[1].trim():''
}
function tcInferChurnRule(months){if(!months)return'';return months<=6?'180 days':months<=12?'1 year':months<=24?'2 years':'3 years'}

function tcPushUnique(arr, value){
  if(!arr) return;
  if(value===undefined || value===null || value==='') return;
  if(!arr.includes(value)) arr.push(value);
}

function tcFindFirstSegment(segments, regex){
  return (segments||[]).find(s => regex.test(s)) || '';
}

function tcAddEvidence(r, label, segment, weight=4){
  if(!r.evidence) r.evidence=[];
  if(!segment) return;
  const entry = `${label}: ${segment}`;
  if(!r.evidence.includes(entry)) r.evidence.push(entry);
  r.hybridScore = (r.hybridScore || 0) + weight;
}

const HYBRID_PROMO_PATTERNS = [
  {
    id:'ach-either-or',
    label:'ACH either/or',
    test:(t)=>/at least one direct deposit or direct debit/i.test(t) && /(ach|automated clearing house)/i.test(t),
    apply:(r,ctx)=>{
      tcPushUnique(r.offerTags,'ACH either/or');
      tcPushUnique(r.qualifyingPaths,'1 ACH direct deposit OR 1 ACH direct debit');
      r.achDirectDebitAllowed = true;
      tcAddEvidence(r,'ACH either/or', tcFindFirstSegment(ctx.segments,/direct deposit or direct debit/i), 8);
    }
  },
  {
    id:'direct-deposit',
    label:'Direct deposit',
    test:(t)=>/direct deposit/i.test(t),
    apply:(r,ctx)=>{
      tcPushUnique(r.offerTags,'Direct deposit');
      tcAddEvidence(r,'Direct deposit', tcFindFirstSegment(ctx.segments,/direct deposit/i), 4);
    }
  },
  {
    id:'new-money-hold',
    label:'New money + hold',
    test:(t)=>/new money/i.test(t) || (/maintain/i.test(t) && /balance/i.test(t)),
    apply:(r,ctx)=>{
      tcPushUnique(r.offerTags,'New money / hold');
      tcAddEvidence(r,'Funding / hold', tcFindFirstSegment(ctx.segments,/new money|maintain.*balance|balance.*maintain/i), 6);
    }
  },
  {
    id:'multi-cycle',
    label:'Statement cycles',
    test:(t)=>/statement cycle/i.test(t),
    apply:(r,ctx)=>{
      tcPushUnique(r.offerTags,'Statement-cycle rules');
      tcAddEvidence(r,'Statement cycle', tcFindFirstSegment(ctx.segments,/statement cycle/i), 5);
    }
  },
  {
    id:'debit-spend',
    label:'Debit / purchase activity',
    test:(t)=>/debit card|purchases?|transactions?/i.test(t),
    apply:(r,ctx)=>{
      tcPushUnique(r.offerTags,'Debit / spend activity');
      tcAddEvidence(r,'Debit / activity', tcFindFirstSegment(ctx.segments,/debit card|purchases?|transactions?/i), 4);
    }
  },
  {
    id:'business',
    label:'Business checking',
    test:(t)=>/business checking|business account|small business/i.test(t),
    apply:(r,ctx)=>{
      tcPushUnique(r.offerTags,'Business bonus');
      tcAddEvidence(r,'Business', tcFindFirstSegment(ctx.segments,/business checking|business account|small business/i), 5);
    }
  },
  {
    id:'bundle',
    label:'Bundle / multiple products',
    test:(t)=>/checking and savings|checking \+ savings|bundle|bundled|roundup/i.test(t),
    apply:(r,ctx)=>{
      tcPushUnique(r.offerTags,'Bundled / multi-product');
      tcAddEvidence(r,'Bundle', tcFindFirstSegment(ctx.segments,/checking and savings|bundle|bundled|roundup/i), 5);
    }
  },
  {
    id:'positive-balance-gate',
    label:'Positive balance / active gate',
    test:(t)=>/positive balance|active and .* bonus payment|good standing/i.test(t),
    apply:(r,ctx)=>{
      tcPushUnique(r.offerTags,'Positive balance / active gate');
      tcAddEvidence(r,'Balance gate', tcFindFirstSegment(ctx.segments,/positive balance|active and .* bonus payment|good standing/i), 5);
    }
  },
  {
    id:'fee-waiver',
    label:'Fee waiver logic',
    test:(t)=>/waive|waived|monthly maintenance fee|service fee/i.test(t),
    apply:(r,ctx)=>{
      tcPushUnique(r.offerTags,'Fee waiver logic');
      tcAddEvidence(r,'Fee waiver', tcFindFirstSegment(ctx.segments,/waive|waived|monthly maintenance fee|service fee/i), 3);
    }
  }
];

function tcApplyHybridPatterns(r, normalized, segments){
  if(!r.offerTags) r.offerTags=[];
  if(!r.evidence) r.evidence=[];
  r.hybridScore = r.hybridScore || 0;
  const t = normalized.toLowerCase();

  HYBRID_PROMO_PATTERNS.forEach(p=>{
    try{
      if(p.test(t, segments, r)) p.apply(r, {t, segments, r});
    }catch(_err){}
  });

  if(r.bonusAmount) r.hybridScore += 10;
  if(r.timeline || r.timelineDays) r.hybridScore += 6;
  if(r.earlyCloseFee || r.earlyCloseDays) r.hybridScore += 4;
  if(r.churnMonths || r.priorBonusIneligible) r.hybridScore += 4;
  if(r.statementCycleCutoff) r.hybridScore += 4;
  if(r.minDaysOpen || r.mustBePositiveAtQualEnd || r.mustBePositiveAtPayout) r.hybridScore += 6;
  if(r.openBy || r.openWindow) r.hybridScore += 3;
  if(r.monthlyFee) r.hybridScore += 2;

  if(r.hybridScore >= 40) r.hybridConfidence='High';
  else if(r.hybridScore >= 24) r.hybridConfidence='Medium';
  else r.hybridConfidence='Low';

  if(!r.reviewFlags) r.reviewFlags=[];
  if(!r.bonusAmount) tcPushUnique(r.reviewFlags, 'Bonus amount not clearly extracted.');
  if(!r.timeline && !r.timelineDays) tcPushUnique(r.reviewFlags, 'Qualification deadline not clearly extracted.');
  if(r.qualifyingPaths?.length===0 && !r.ddAmount && !r.newMoneyAmount && !r.activityCount && !r.debitTxns) {
    tcPushUnique(r.reviewFlags, 'Qualification path is unclear — review manually.');
  }
  if(r.ddAmount && r.newMoneyAmount) tcPushUnique(r.reviewFlags, 'Contains both direct-deposit and funding/new-money rules.');
}

function tcSplitOfferSections(text){
  const normalized = normalizeTCText(text);
  const parts = normalized
    .split(/(?:^|\n)(?=\d+\s*[A-Z])/m)
    .map(s => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [normalized];
}

function tcChoosePrimaryOffer(results){
  if(!results.length) return null;
  const checking = results.find(r =>
    /checking/i.test(r?.acctType || '') ||
    /checking/i.test(r?.sectionTitle || '') ||
    /checking/i.test(r?.rawSection || '')
  );
  if(checking) return checking;
  return [...results].sort((a,b)=>{
    const av = parseFloat(String(a?.bonusAmount || '').replace(/[^\d.]/g,'')) || 0;
    const bv = parseFloat(String(b?.bonusAmount || '').replace(/[^\d.]/g,'')) || 0;
    return bv-av;
  })[0] || null;
}

function analyzeTC(text){
  if(!text||text.length<20)return null;
  const sections = tcSplitOfferSections(text);
  const results = sections
    .map(sec => analyzeTCSection(sec))
    .filter(Boolean);
  if(!results.length) return null;
  const primary = tcChoosePrimaryOffer(results);
  if(!primary) return null;
  primary.allOffers = results.map(r => ({
    sectionTitle: r.sectionTitle || r.acctType || r.bankName || 'Offer',
    bonusAmount: r.bonusAmount || '',
    acctType: r.acctType || '',
    notesForTracker: r.notesForTracker || ''
  }));
  return primary;
}

function analyzeTCSection(text){

  if(!text||text.length<20)return null;

  // Normalize pasted T&C first so regex works on cleaner text.
  const normalized=normalizeTCText(text);
  const t=normalized.toLowerCase();
  const segments=tcSegments(normalized);
  const r={};
  const review=[];

  r.rawSection=normalized;
  const titleHit=normalized.match(/^\d+\s*([^\n:]+)(?::|$)/m);
  if(titleHit) r.sectionTitle=titleHit[1].trim();

  r.qualifyingPaths=[];
  r.ddExamples=[];
  r.directDebitExamples=[];
  r.eligibilityNotes=[];
  r.payoutConditions=[];
  r.restrictionNotes=[];
  r.offerTags=[];
  r.evidence=[];
  r.hybridScore=0;
  r.hybridConfidence='Low';

  /* ---------- core promo fields ---------- */
  r.bankName=tcKnownBankName(normalized)||undefined;
  const bonusHit=tcPickBest(segments,[
    {pattern:/(?:bonus|credit|incentive|cash\s+bonus)\s+(?:of\s+)?\$([\d,]+)/i,value:m=>tcMoney(m[1]),base:22},
    {pattern:/\$([\d,]+)\s+(?:cash\s+)?(?:bonus|credit|incentive)/i,value:m=>tcMoney(m[1]),base:21},
    {pattern:/(?:earn|receive|get)\s+(?:a\s+)?\$([\d,]+)/i,value:m=>tcMoney(m[1]),base:18},
    {pattern:/\$([\d,]+)\s+(?:will\s+be\s+)?(?:credited|deposited|paid)/i,value:m=>tcMoney(m[1]),base:15}
  ],{keywords:['bonus','credit','incentive','earn','receive'],negativeKeywords:['monthly fee','maintenance fee','opening deposit','minimum opening deposit','maintain','new money','termination fee']});
  if(bonusHit)r.bonusAmount=bonusHit.value;
  const bonusTierSet=new Set();
  segments.forEach(seg=>{for(const m of seg.matchAll(/(?:bonus|credit|incentive)[^$]{0,24}\$([\d,]+)|\$([\d,]+)\s+(?:cash\s+)?(?:bonus|credit|incentive)/gi)){const amt=tcMoney(m[1]||m[2]);if(amt)bonusTierSet.add(amt)}});
  let bonusTiers=[...bonusTierSet];
  if(r.bonusAmount){const base=parseFloat(String(r.bonusAmount).replace(/[^\d.]/g,''))||0;if(base>0)bonusTiers=bonusTiers.filter(v=>{const amt=parseFloat(String(v).replace(/[^\d.]/g,''))||0;return !amt||amt<=Math.max(base*3,1500)})}
  if(bonusTiers.length>1)r.bonusTiers=bonusTiers.join(' / ');

  const promoHit=tcPickBest(segments,[
    {pattern:/promo(?:tional)?\s+code\s*[:\s]*["']?([A-Z0-9-]{4,})["']?/i,value:m=>m[1],base:20},
    {pattern:/promo(?:tional)?\s+code.*?\b([A-Z0-9-]{4,})\b/i,value:m=>m[1],base:18},
    {pattern:/(?:use|enter|apply)\s+(?:the\s+)?(?:promo\s+)?code.*?\b([A-Z0-9-]{4,})\b/i,value:m=>m[1],base:17}
  ],{keywords:['promo code','code','campaign','variant'],negativeKeywords:['1099','tax']});
  if(promoHit)r.promoCode=promoHit.value;

  // Offer section / open-by / qualifying-period signals
  const openByHit=tcPickBest(segments,[
    {pattern:/open .* by ([A-Z][a-z]+ \d{1,2}, \d{4})/i,value:m=>m[1].trim(),base:24},
    {pattern:/by ([A-Z][a-z]+ \d{1,2}, \d{4}) to qualify/i,value:m=>m[1].trim(),base:20}
  ],{keywords:['open','by','qualify']});
  if(openByHit)r.openBy=openByHit.value;

  const qualPeriodHit=tcPickBest(segments,[
    {pattern:/within (\d+)\s+calendar\s+days? of account opening/i,value:m=>parseInt(m[1],10),base:24},
    {pattern:/all requirements must be completed within the (\d+)-day/i,value:m=>parseInt(m[1],10),base:22},
    {pattern:/within (\d+)\s+calendar\s+days?/i,value:m=>parseInt(m[1],10),base:14}
  ],{keywords:['qualifying period','calendar days','account opening']});
  if(qualPeriodHit){
    r.qualifyingPeriodDays=qualPeriodHit.value;
    r.timelineDays=r.timelineDays||qualPeriodHit.value;
    r.timeline=r.timeline||(`${qualPeriodHit.value} days`);
  }

  // ACH either/or path (important for offers like Guaranty)
  if(/at least one direct deposit or direct debit/i.test(t) && /(automated clearing house|ach)/i.test(t)){
    r.qualifyingPaths.push('1 ACH direct deposit OR 1 ACH direct debit');
    r.achDirectDebitAllowed=true;
    r.ddOrDebitCount=1;
  }
  if(/paycheck/i.test(t))r.ddExamples.push('Paycheck');
  if(/pension/i.test(t))r.ddExamples.push('Pension');
  if(/government benefits?/i.test(t))r.ddExamples.push('Government benefits');
  if(/car payment/i.test(t))r.directDebitExamples.push('Car payment');
  if(/mortgage/i.test(t))r.directDebitExamples.push('Mortgage');
  if(/rent payment|\brent\b/i.test(t))r.directDebitExamples.push('Rent');
  if(/household bill/i.test(t))r.directDebitExamples.push('Household bill');

  /* ---------- opening deposit / funding / balance / activity ---------- */
  const openingDepositHit=tcPickBest(segments,[
    {pattern:/minimum\s+opening\s+deposit\s*:?\s*\$([\d,]+)/i,value:m=>tcMoney(m[1]),base:24},
    {pattern:/open(?:ing)?\s+deposit\s*:?\s*\$([\d,]+)/i,value:m=>tcMoney(m[1]),base:18}
  ],{keywords:['opening deposit','open account'],negativeKeywords:['new money','maintain','direct deposit']});
  if(openingDepositHit)r.minOpeningDeposit=openingDepositHit.value;

  const newMoneyHit=tcPickBest(segments,[
    {pattern:/(?:deposit|fund)\s+at\s+least\s+\$([\d,]+)/i,value:m=>tcMoney(m[1]),base:18},
    {pattern:/\$([\d,]+)\s*(?:->|for)\s*(?:for\s+)?\$?[\d,]+\s+bonus/i,value:m=>tcMoney(m[1]),base:16},
    {pattern:/deposit\s+\$([\d,]+)\s+of\s+new\s+money/i,value:m=>tcMoney(m[1]),base:22},
    {pattern:/\$([\d,]+)\s+of\s+new\s+money/i,value:m=>tcMoney(m[1]),base:20},
    {pattern:/maintain\s+at\s+least\s+\$([\d,]+)/i,value:m=>tcMoney(m[1]),base:10}
  ],{keywords:['new money','deposit','fund','bonus qualifications'],negativeKeywords:['opening deposit','monthly fee','termination fee','direct deposit']});
  if(newMoneyHit)r.newMoneyAmount=newMoneyHit.value;
  r.newMoneyDays=tcBestDays(segments.filter(s=>/(new money|deposit|fund)/i.test(s)),['new money','deposit','fund']);

  const maintainBalanceHit=tcPickBest(segments,[
    {pattern:/maintain\s+(?:at\s+least\s+)?\$([\d,]+)/i,value:m=>tcMoney(m[1]),base:24},
    {pattern:/maintain\s+that\s+balance/i,value:()=>r.newMoneyAmount||'',base:16},
    {pattern:/balance\s+requirement.*?\$([\d,]+)/i,value:m=>tcMoney(m[1]),base:18}
  ],{keywords:['maintain','balance requirement','balance'],negativeKeywords:['monthly fee','opening deposit','termination fee']});
  if(maintainBalanceHit&&maintainBalanceHit.value)r.maintainBalance=maintainBalanceHit.value;
  r.maintainDays=tcBestDays(segments.filter(s=>/(maintain|balance)/i.test(s)),['maintain','balance']);

  const activityCount=tcBestCount(segments.filter(s=>/(transaction|purchase|activity|debit card|bill pay|wire|ach|zelle|mobile deposit)/i.test(s)),['transaction','activity','purchase']);
  if(activityCount)r.activityCount=activityCount;
  r.activityDays=tcBestDays(segments.filter(s=>/(transaction|purchase|activity|debit card|bill pay|wire|ach|zelle|mobile deposit)/i.test(s)),['transaction','activity']);
  const qualTypes=[];
  if(t.includes('debit card purchases'))qualTypes.push('Debit card purchases');
  if(t.includes('ach credits')||t.includes('ach debits')||t.includes('ach credits/debits'))qualTypes.push('ACH credits/debits');
  else if(t.includes('ach'))qualTypes.push('ACH');
  if(t.includes('wires'))qualTypes.push('Wires');
  if(t.includes('bill pay'))qualTypes.push('Bill pay');
  if(t.includes('mobile deposits'))qualTypes.push('Mobile deposits');
  if(t.includes('zelle'))qualTypes.push('Zelle');
  if(qualTypes.length)r.qualifyingTxnTypes=qualTypes;

  /* ---------- legacy direct deposit / debit extraction ---------- */
  const ddHit=tcPickBest(segments,[
    {pattern:/direct\s+deposits?\s+(?:totaling|of|that\s+total)\s+(?:at\s+least\s+)?\$([\d,]+)/i,value:m=>tcMoney(m[1]),base:22},
    {pattern:/\$([\d,]+)\s+(?:or\s+more\s+)?in\s+(?:qualifying\s+)?direct\s+deposit/i,value:m=>tcMoney(m[1]),base:18},
    {pattern:/direct\s+deposit\s+of\s+(?:at\s+least\s+)?\$([\d,]+)/i,value:m=>tcMoney(m[1]),base:18}
  ],{keywords:['direct deposit','payroll'],negativeKeywords:['new money','opening deposit','termination fee']});
  if(ddHit)r.ddAmount=ddHit.value;
  const ddCount=tcBestCount(segments.filter(s=>/direct\s+deposit/i.test(s)),['direct deposit']);
  if(ddCount)r.ddCount=ddCount;
  const ddSegments=segments.filter(s=>/direct\s+deposit|payroll/i.test(s));
  if(ddSegments.some(s=>/per statement cycle|per cycle/i.test(s)))r.ddPerCycle=true;
  if(ddSegments.some(s=>/per month|monthly/i.test(s)))r.ddMonthly=true;

  const debitHit=tcPickBest(segments,[
    {pattern:/(\d+)\s+(?:or\s+more\s+)?(?:qualifying\s+)?debit\s+(?:card\s+)?(?:transactions?|purchases?)/i,value:m=>parseInt(m[1],10),base:18},
    {pattern:/debit\s+(?:card\s+)?(?:transactions?|purchases?)\s+(?:totaling|of)\s+(\d+)/i,value:m=>parseInt(m[1],10),base:14},
    {pattern:/(?:make|complete)\s+(\d+)\s+(?:qualifying\s+)?(?:debit|card|purchase)/i,value:m=>parseInt(m[1],10),base:16}
  ],{keywords:['debit','purchase','card'],negativeKeywords:['fee']});
  if(debitHit)r.debitTxns=String(debitHit.value);
  if(t.includes('activate')&&(t.includes('debit card')||t.includes('debit')))r.activateDebit=true;

  /* ---------- generic time / cycle / code ---------- */
  const timelineHit=tcPickBest(segments,[
    {pattern:/within\s+(\d+)\s+days?\s+(?:of|after|from)\s+(?:account\s+)?open/i,value:m=>parseInt(m[1],10),base:18},
    {pattern:/first\s+(\d+)\s+days/i,value:m=>parseInt(m[1],10),base:14},
    {pattern:/within\s+(\d+)\s+days/i,value:m=>parseInt(m[1],10),base:12}
  ],{keywords:['within','days','open'],negativeKeywords:['calendar day of the month']});
  if(timelineHit){r.timeline=timelineHit.value+' days';r.timelineDays=timelineHit.value}
  const cycleHit=tcPickBest(segments,[
    {pattern:/(?:first|within)\s+(\d+)\s+(?:\(\d+\)\s+)?statement\s+cycles?/i,value:m=>m[1]+' statement cycles',base:20},
    {pattern:/(\d+)\s+statement\s+cycles?/i,value:m=>m[1]+' statement cycles',base:16}
  ],{keywords:['statement cycle']});
  if(cycleHit)r.cycles=cycleHit.value;

  /* ---------- fee logic ---------- */
  const monthlyFeeNone=/no monthly fee|no monthly maintenance|\$0 monthly|no service fee/.test(t);
  const monthlyFeeHit=tcPickBest(segments,[
    {pattern:/monthly\s+(?:maintenance\s+|service\s+)?fee\s+(?:of\s+)?\$([\d.]+)/i,value:m=>'$'+m[1],base:22},
    {pattern:/\$([\d.]+)\s+monthly\s+(?:maintenance|service)\s+fee/i,value:m=>'$'+m[1],base:18},
    {pattern:/\$([\d.]+)\s+(?:per\s+)?month\s+(?:service|maintenance)?/i,value:m=>'$'+m[1],base:14}
  ],{keywords:['monthly fee','maintenance fee','service fee'],negativeKeywords:['termination fee','early close']});
  if(monthlyFeeNone)r.monthlyFee='$0 (No fee)';else if(monthlyFeeHit)r.monthlyFee=monthlyFeeHit.value;else if(/fees could reduce earnings/i.test(t))r.monthlyFee='Not clearly stated in pasted T&C';
  const waiverHit=tcPickBest(segments,[
    {pattern:/(?:waived?|avoid|no\s+fee)\s+(?:if|when|by|with).*?\$([\d,]+)/i,value:m=>tcMoney(m[1])+' balance or DD',base:18},
    {pattern:/(?:maintain|average|minimum)\s+(?:daily\s+)?balance\s+(?:of\s+)?\$([\d,]+).*?(?:waive|avoid|no\s+fee)/i,value:m=>tcMoney(m[1])+' balance or DD',base:20},
    {pattern:/direct\s+deposit\s+(?:of\s+)?\$([\d,]+).*?(?:waive|avoid)/i,value:m=>tcMoney(m[1])+' balance or DD',base:18}
  ],{keywords:['waive','avoid','fee']});
  if(waiverHit)r.feeWaiver=waiverHit.value;

  const closeDaysHit=tcPickBest(segments,[
    {pattern:/(?:closed?|termination|closing)\s+(?:the\s+)?(?:account\s+)?within\s+(?:the\s+)?(?:first\s+)?(\d+)\s+days/i,value:m=>parseInt(m[1],10),base:20},
    {pattern:/(\d+)\s+days?\s+(?:of|after|from)\s+(?:account\s+)?open.*?(?:close|terminat)/i,value:m=>parseInt(m[1],10),base:18},
    {pattern:/close.*?(?:less\s+than|within|before)\s+(\d+)\s+days/i,value:m=>parseInt(m[1],10),base:18}
  ],{keywords:['close','termination','early close'],negativeKeywords:['bonus posts','calendar day of the month']});
  if(closeDaysHit)r.earlyCloseDays=closeDaysHit.value;
  const noEarlyFee=/no early termination|no termination fee/.test(t);
  const closeFeeHit=tcPickBest(segments,[
    {pattern:/(?:early\s+)?(?:termination|close|closing)\s+fee\s+(?:of\s+)?\$([\d.]+)/i,value:m=>'$'+m[1],base:22},
    {pattern:/\$([\d,]+)\s+(?:early\s+)?(?:termination|close)/i,value:m=>tcMoney(m[1]),base:18},
    {pattern:/(?:deduct|collect|charge|clawback|forfeit).*?\$([\d,]+).*?(?:bonus|incentive)/i,value:m=>tcMoney(m[1]),base:20}
  ],{keywords:['termination fee','close fee','clawback','forfeit','penalty'],negativeKeywords:['monthly fee']});
  if(noEarlyFee)r.earlyCloseFee='None';else if(closeFeeHit)r.earlyCloseFee=closeFeeHit.value;else if(/collect the bonus|forfeit the bonus|bonus will be reversed|bonus may be collected/.test(t))r.earlyCloseFee='Bonus clawback';

  /* ---------- churn / eligibility ---------- */
  if(/one per lifetime|once per lifetime/.test(t))r.churnRule='Once per lifetime';
  const churnHit=tcPickBest(segments,[
    {pattern:/(?:not\s+)?(?:eligible|qualify|available).*?(?:within|past|last|preceding)\s+(?:the\s+)?(\d+)\s+months?/i,value:m=>parseInt(m[1],10),base:22},
    {pattern:/(?:had|owned|closed|open).*?(?:account|checking).*?(?:within|past|last)\s+(?:the\s+)?(\d+)\s+months?/i,value:m=>parseInt(m[1],10),base:20},
    {pattern:/(\d+)\s+months?\s+(?:prior|before|from\s+(?:last|previous))/i,value:m=>parseInt(m[1],10),base:16}
  ],{keywords:['eligible','customer','within','months','had one'],negativeKeywords:['bonus posts','calendar']});
  if(churnHit)r.churnMonths=churnHit.value;
  if(!r.churnMonths){if(t.includes('six months')||t.includes('6 months'))r.churnMonths=6;else if(t.includes('twelve months')||t.includes('12 months'))r.churnMonths=12;else if(t.includes('24 months')||t.includes('twenty-four'))r.churnMonths=24;else if(t.includes('36 months')||t.includes('three years'))r.churnMonths=36}
  if(!r.churnRule&&r.churnMonths)r.churnRule=tcInferChurnRule(r.churnMonths);
  if(/limit\s*:?\s*one\s+bonus\s+per\s+(?:business|entity|customer|account|member)|limit one bonus/.test(t))r.limitOneBonus=true;
  if(/account must.*remain open|remain open/.test(t))r.mustRemainOpen=true;
  if(/good standing/.test(t))r.requiresGoodStanding=true;
  if(/missouri resident/i.test(t))r.residency='Missouri residents only';
  if(/current .* consumer checking accountholders .* not eligible/i.test(t))r.currentCustomerIneligible=true;
  if(/paid to the primary owner/i.test(t))r.primaryOwnerOnly=true;
  if(/previously received a new account bonus .* not eligible/i.test(t)){
    r.priorBonusIneligible=true;
    r.eligibilityNotes.push('Previous new-account bonus recipients are not eligible');
  }

  /* ---------- payout / tax ---------- */
  const bonusPostHit=tcPickBest(segments,[
    {pattern:/(\d+)\s+days?\s+following\s+the\s+last\s+calendar\s+day\s+of\s+the\s+month\s+after\s+you\s+have\s+met\s+the\s+qualifications/i,value:m=>m[1]+' days following the last calendar day of the month after qualifications are met',base:30},
    {pattern:/(?:bonus|credit).*?(?:credited?|deposited?|paid?|posted?).*?(?:within|after|by)\s+(\d+)\s+days?/i,value:m=>'Within '+m[1]+' days of qualifying',base:20},
    {pattern:/within\s+(\d+)\s+days?\s+of\s+(?:meeting|completing|qualifying)/i,value:m=>'Within '+m[1]+' days of qualifying',base:18}
  ],{keywords:['bonus','paid','posted','credited','qualifications'],negativeKeywords:['opening']});
  if(bonusPostHit)r.bonusPostTime=bonusPostHit.value;
  const payoutHoldHit=tcPickBest(segments,[
    {pattern:/open for at least (\d+)\s+calendar\s+days/i,value:m=>parseInt(m[1],10),base:24},
    {pattern:/account must also be open for at least (\d+)/i,value:m=>parseInt(m[1],10),base:22}
  ],{keywords:['open','at least','calendar days']});
  if(payoutHoldHit)r.minDaysOpen=payoutHoldHit.value;
  if(/positive balance at the end of the .*qualifying period/i.test(t))r.mustBePositiveAtQualEnd=true;
  if(/active and has a positive balance at the time of the bonus payment/i.test(t)){
    r.accountActiveAtPayout=true;
    r.mustBePositiveAtPayout=true;
  }
  if(/1099-int/.test(t))r.taxForm='1099-INT (Interest)';else if(/1099-misc/.test(t))r.taxForm='1099-MISC (Income)';else if(/reported.*income|bonus is taxable|taxable/.test(t))r.taxForm='Taxable income';

  /* ---------- exclusions / restrictions ---------- */
  const excluded=[];
  const exclusionSegments=segments.filter(s=>/not count|does not count|exclude|excluded|do not qualify|not qualify/i.test(s));
  if(exclusionSegments.some(s=>/person-to-person|p2p|zelle/i.test(s)))excluded.push('Zelle/P2P transfers');
  if(exclusionSegments.some(s=>/micro-deposit|micro deposit/i.test(s)))excluded.push('Micro-deposits (<$1)');
  if(exclusionSegments.some(s=>/venmo/i.test(s)))excluded.push('Venmo');
  if(exclusionSegments.some(s=>/paypal/i.test(s)))excluded.push('PayPal');
  if(exclusionSegments.some(s=>/transfer/i.test(s)))excluded.push('Internal transfers');
  if(segments.some(s=>/existing\s+u\.s\.\s*bank\s+accounts?|already at\s+u\.s\.\s*bank/i.test(s)))excluded.push('Transfers from existing U.S. Bank accounts');
  if(exclusionSegments.some(s=>/external\s+bank/i.test(s)))excluded.push('External bank ACH');
  r.ddExcluded=excluded;
  const ddReqs=[];
  if(/employer/.test(t))ddReqs.push('employer');
  if(/government/.test(t)&&!/not government/.test(t))ddReqs.push('government agency');
  if(/payroll/.test(t))ddReqs.push('payroll');
  r.ddMustBe=ddReqs;
  if(/transactions?\s+must\s+post|posted and settled|not pending/.test(t))r.transactionsMustPost=true;
  if(/last business day of the statement cycle/i.test(t))r.statementCycleCutoff='Must post and settle by the last business day of the statement cycle';
  if(/balance drops below requirement.*disqualif/.test(t))r.balanceDropDisqualifies=true;
  if(/modify or withdraw offer anytime|withdraw offer anytime/.test(t))r.offerMutable=true;

  /* ---------- account / window / setup ---------- */
  const acctHit=tcPickBest(segments,[
    {pattern:/(business essentials(?:®)?(?: checking)?)/i,value:m=>m[1].replace(/®/g,'').trim(),base:24},
    {pattern:/(?:open|new)\s+(?:a\s+)?(?:new\s+)?([\w\s&.\-]+?)\s+(?:checking|savings|account)/i,value:m=>m[1].trim(),base:14}
  ],{keywords:['checking','savings','account','business']});
  if(acctHit)r.acctType=acctHit.value;
  const dateMatch=normalized.match(/between\s+([\w\s,]+?\d{4})\s+and\s+([\w\s,]+?\d{4})/i);
  if(dateMatch)r.openWindow=dateMatch[1].trim()+' - '+dateMatch[2].trim();
  else if(/q2\s*2026|apr.?-?jun.?\s*2026|apr.*jun.*2026/i.test(t))r.openWindow='Q2 2026 (Apr-Jun 2026)';
  if(/enroll in online banking|mobile app|digital banking/.test(t))r.requiresOnlineBanking=true;
  if(/estatement|electronic statement/.test(t))r.requiresEstatements=true;

  /* ---------- bonus variants ---------- */
  if(/guided investing|investment account/.test(t)){r.hasInvestingBonus=true;const gi=tcPickBest(segments,[{pattern:/(?:fund|deposit|invest)\s+(?:the\s+)?(?:account\s+)?(?:with\s+)?(?:a\s+)?(?:minimum\s+)?\$([\d,]+)/i,value:m=>tcMoney(m[1]),base:18}],{keywords:['invest','guided investing','investment']});if(gi)r.investMin=gi.value}
  if(/bundled bonus|bundled|extra bonus|additional bonus/.test(t)){const bb=tcPickBest(segments,[{pattern:/\$([\d,]+)\s+(?:bundled|extra|additional)/i,value:m=>tcMoney(m[1]),base:16},{pattern:/(?:bundled|extra|additional).*?\$([\d,]+)/i,value:m=>tcMoney(m[1]),base:14}],{keywords:['bundled','extra','additional']});if(bb)r.bundledBonus=bb.value}
  if(/savings bonus|savings account.*bonus/.test(t)){const sb=tcPickBest(segments,[{pattern:/savings.*?\$([\d,]+)\s+bonus/i,value:m=>tcMoney(m[1]),base:16},{pattern:/\$([\d,]+)\s+savings\s+bonus/i,value:m=>tcMoney(m[1]),base:16}],{keywords:['savings','bonus']});if(sb)r.savingsBonus=sb.value}
  if(/credit card/.test(t)&&(t.includes('fund')||t.includes('opening deposit')))r.ccFunding=true;
  if(/hard pull|hard inquiry/.test(t))r.pullType='Hard pull';else if(/soft pull|soft inquiry/.test(t))r.pullType='Soft pull';
  if(/credit approval|subject to credit/.test(t))r.creditCheck=true;

  /* ---------- basic review flags ---------- */
  if(monthlyFeeNone&&waiverHit)review.push('Monthly fee language has both no-fee and waiver terms — review manually.');
  if(r.ddAmount&&r.newMoneyAmount)review.push('Promo has both direct deposit and funding-style requirements — check notes summary.');
  if(r.bonusTiers&&!r.bonusAmount)review.push('Tiered bonus detected — confirm which tier you want to track.');
  if(review.length)r.reviewFlags=review;

  tcApplyHybridPatterns(r, normalized, segments);
  /* ---------- tracker-ready notes ---------- */
  const n=[];

  n.push('SIMPLE TERMS:');
  if(r.bonusAmount)n.push(`* Bonus: ${r.bonusAmount}`);
  if(r.acctType)n.push(`* Account: ${r.acctType}`);
  if(r.openBy)n.push(`* Open by: ${r.openBy}`);
  else if(r.openWindow)n.push(`* Open window: ${r.openWindow}`);
  n.push(`* Monthly fee: ${r.monthlyFee || 'Not clearly stated in pasted T&C'}`);
  if(r.feeWaiver)n.push(`* Fee waiver: ${r.feeWaiver}`);
  if(r.bonusPostTime){let bp=`* Bonus posts: ${r.bonusPostTime}`; if(r.mustRemainOpen || r.requiresGoodStanding) bp += ' (account must remain open' + (r.requiresGoodStanding ? ' and in good standing' : '') + ')'; n.push(bp);}
  if(r.earlyCloseFee || r.earlyCloseDays)n.push(`* Early close fee: ${r.earlyCloseFee || 'Fee applies'}${r.earlyCloseDays ? ` if closed within ${r.earlyCloseDays} days` : ''}`);
  else n.push('* Early close fee: Not mentioned');
  if(r.residency)n.push(`* Availability: ${r.residency}`);

  n.push('');
  n.push('HOW TO EARN THE BONUS:');
  let step=1;
  const hasDetailedDaySteps = !!(r.newMoneyDays || r.maintainDays || r.activityDays);
  if(r.minOpeningDeposit)n.push(`* ${step++}. Open the account with ${r.minOpeningDeposit}`);
  else n.push(`* ${step++}. Open the required account`);

  if(r.qualifyingPaths?.length){
    r.qualifyingPaths.forEach(path=>n.push(`* ${step++}. ${path}`));
  }else{
    if(r.ddAmount){
      let ddStr=`* ${step++}. Make direct deposit${r.ddAmount ? ' of ' + r.ddAmount : ''}`;
      if(r.ddCount)ddStr+=` (${r.ddCount}+ deposits)`;
      if(r.ddPerCycle)ddStr+=' per statement cycle';
      if(r.ddMonthly)ddStr+=' per month';
      n.push(ddStr);
    }
    if(r.newMoneyAmount){
      let nm=`* ${step++}. Deposit ${r.newMoneyAmount} of new money`;
      if(r.newMoneyDays)nm+=` within ${r.newMoneyDays} days`;
      n.push(nm);
    }
    if(r.maintainBalance || r.maintainDays){
      let mb=`* ${step++}. Maintain ${r.maintainBalance || 'the required balance'}`;
      if(r.maintainDays)mb+=` for ${r.maintainDays} days`;
      n.push(mb);
    }
    if(r.activityCount){
      let act=`* ${step++}. Complete ${r.activityCount} qualifying transactions`;
      if(r.activityDays)act+=` within ${r.activityDays} days`;
      n.push(act);
    }
    if(r.debitTxns)n.push(`* ${step++}. Complete ${r.debitTxns} debit card transactions`);
  }

  if(r.timeline && !hasDetailedDaySteps)n.push(`* ${step++}. Finish requirements within ${r.timeline}`);
  if(r.statementCycleCutoff)n.push(`* ${step++}. Transactions must post/settle by the statement-cycle cutoff`);
  if(r.mustRemainOpen && !r.accountActiveAtPayout)n.push(`* ${step++}. Keep the account open until bonus payout`);
  if(r.requiresGoodStanding && !r.accountActiveAtPayout)n.push(`* ${step++}. Keep the account in good standing`);
  if(r.minDaysOpen)n.push(`* ${step++}. Keep the account open at least ${r.minDaysOpen} days`);
  if(r.mustBePositiveAtQualEnd)n.push(`* ${step++}. Have a positive balance at the end of the qualifying period`);
  if(r.accountActiveAtPayout)n.push(`* ${step++}. Keep the account active until bonus payout`);
  if(r.mustBePositiveAtPayout)n.push(`* ${step++}. Have a positive balance when the bonus is paid`);

  n.push('');
  n.push('WHAT COUNTS / WHAT DOES NOT:');
  if(r.qualifyingTxnTypes?.length)n.push(`* Qualifying transactions: ${r.qualifyingTxnTypes.join(', ')}`);
  if(r.ddExamples?.length)n.push(`* Direct deposit examples: ${r.ddExamples.join(', ')}`);
  if(r.directDebitExamples?.length)n.push(`* ACH debit examples: ${r.directDebitExamples.join(', ')}`);
  if(r.ddExcluded?.length)n.push(`* Does not count: ${r.ddExcluded.join(', ')}`);
  if(!r.ddExamples?.length && !r.directDebitExamples?.length && !r.ddExcluded?.length)n.push('* Not clearly stated');

  n.push('');
  n.push('ELIGIBILITY / CHURN:');
  if(r.currentCustomerIneligible)n.push('* Current business checking customers are not eligible');
  if(r.churnMonths)n.push(`* Prior closure restriction: ${r.churnMonths} months`);
  if(r.priorBonusIneligible)n.push('* Previous bonus recipients are not eligible');
  if(r.limitOneBonus)n.push(`* Limit one bonus per ${/business/i.test(r.acctType||r.bankName||r.sectionTitle||'') ? 'business/entity' : 'customer/account'}`);
  if(r.primaryOwnerOnly)n.push('* Bonus paid to primary owner');
  if(/cannot be combined|not be combined/.test(t))n.push('* Cannot be combined with other offers');
  if(r.taxForm)n.push(`* Tax form / tax note: ${r.taxForm}`);
  if(!r.currentCustomerIneligible && !r.churnMonths && !r.priorBonusIneligible && !r.limitOneBonus)n.push('* No clear restriction extracted');

  if(r.reviewFlags?.length){
    n.push('');
    n.push('REVIEW / WEIRD WORDING:');
    r.reviewFlags.forEach(x=>n.push(`* ${x}`));
  }

  if(r.allOffers?.length>1){
    n.push('');
    n.push('OTHER OFFERS FOUND IN SAME PASTE:');
    r.allOffers.forEach((offer,idx)=>{
      const label=offer.sectionTitle || offer.acctType || `Offer ${idx+1}`;
      const amt=offer.bonusAmount ? ` — ${offer.bonusAmount}` : '';
      n.push(`* ${label}${amt}`);
    });
  }

  if(r.hybridConfidence==='Low'){
    n.push('');
    n.push('ANALYZER NOTE:');
    n.push('* Confidence is low on this one. Double-check the pasted terms manually.');
  }

  r.notesForTracker=n.filter(Boolean).join('\n');

  /* ---------- checklist ---------- */
  r.checklist=[];
  if(r.promoCode)r.checklist.push('Use promo code '+r.promoCode);
  if(r.requiresEstatements)r.checklist.push('Enroll in eStatements');
  if(r.requiresOnlineBanking)r.checklist.push('Enroll in online banking');
  if(r.ddAmount)r.checklist.push('Set up DD of '+r.ddAmount+(r.ddCount?' ('+r.ddCount+')':''));
  if(r.newMoneyAmount)r.checklist.push('Deposit '+r.newMoneyAmount+' new money');
  if(r.maintainBalance&&r.maintainDays)r.checklist.push('Maintain '+r.maintainBalance+' for '+r.maintainDays+' days');
  else if(r.maintainDays)r.checklist.push('Maintain balance for '+r.maintainDays+' days');
  if(r.activityCount)r.checklist.push('Complete '+r.activityCount+' qualifying transactions');
  if(r.debitTxns)r.checklist.push(r.debitTxns+' debit transactions');
  if(r.activateDebit)r.checklist.push('Activate debit card');
  if(r.timeline&&!r.newMoneyDays&&!r.activityDays&&!r.ddAmount)r.checklist.push('Complete within '+r.timeline);
  if(r.newMoneyDays)r.checklist.push('Fund within '+r.newMoneyDays+' days');
  if(r.earlyCloseDays)r.checklist.push('Hold account '+r.earlyCloseDays+' days');

  return Object.keys(r).length>1?r:null
}
const DEF=[];
const TEMPLATES=[{bank:"Chase",bonus:300,churn:"2",notes:"$1,000 DD within 90 days. $12/mo waived w/ $500 DD.",minHoldDays:90,earlyCloseFee:0,dataPoint:"Fidelity/Robinhood ACH works",reqDays:90},{bank:"Chase Biz",bonus:500,churn:"2",notes:"$2,000 deposit within 20 biz days.",minHoldDays:0,earlyCloseFee:0,dataPoint:"$2,000 deposit",reqDays:60},{bank:"Bank of America",bonus:300,churn:"1",notes:"$2,000+ DD within 90 days. $12/mo waived w/ $250 DD.",minHoldDays:0,earlyCloseFee:0,dataPoint:"Fidelity ACH works",reqDays:90},{bank:"Wells Fargo",bonus:325,churn:"1",notes:"$1,000+ DD within 90 days. $10/mo waived w/ $500 DD.",minHoldDays:0,earlyCloseFee:0,dataPoint:"Employer DD recommended",reqDays:90},{bank:"U.S. Bank",bonus:450,churn:"1",notes:"$8,000+ DD within 90 days. No early close fee.",minHoldDays:0,earlyCloseFee:0,dataPoint:"Robinhood/Fidelity ACH works",reqDays:90},{bank:"Citi",bonus:300,churn:"1",notes:"Tiered DD. $12/mo fee.",minHoldDays:0,earlyCloseFee:0,dataPoint:"ACH generally works",reqDays:90},{bank:"PNC",bonus:400,churn:"2",notes:"$5,000 DD. $7-25/mo by tier.",minHoldDays:0,earlyCloseFee:0,dataPoint:"Fidelity ACH works",reqDays:60},{bank:"Simmons Bank",bonus:450,churn:"1",notes:"$150x3 cycles. $1k DD + 7 debit txns. $0 fee. MO avail.",minHoldDays:0,earlyCloseFee:0,dataPoint:"$1k DD + 7 debit txns",reqDays:120},{bank:"Equity Bank",bonus:400,churn:"180",notes:"Checking+savings. $1k DD + debit. $400 clawback <180d.",minHoldDays:180,earlyCloseFee:400,dataPoint:"$1k DD + activate debit",reqDays:45},{bank:"Regions",bonus:450,churn:"1",notes:"$1k DD + 10 debit. $25 fee <180d. MO avail.",minHoldDays:180,earlyCloseFee:25,dataPoint:"$1k DD + 10 debit txns",reqDays:90},{bank:"BMO",bonus:600,churn:"1",notes:"$5k+ DD within 90d. CC funding avail.",minHoldDays:0,earlyCloseFee:0,dataPoint:"ACH works + CC funding",reqDays:90},{bank:"Capital One",bonus:250,churn:"1",notes:"2x$500 DD. $0 fee. NOT churnable anymore.",minHoldDays:0,earlyCloseFee:0,dataPoint:"No longer churnable",reqDays:75}];
const PHONE_DEFAULTS=[["Ally Bank","1-877-247-2559","1-877-247-2559"],["Bank of America","1-800-432-1000","1-888-287-4637"],["BMO (US)","1-888-340-2265","1-888-340-2265"],["Capital One","1-877-383-4802","1-888-755-2172"],["Central Bank","1-800-876-5500","1-800-876-5500"],["Chase","1-800-935-9935","1-800-242-7338"],["Citibank","1-800-374-9700","1-800-945-4000"],["Citizens","1-888-500-1478","1-888-307-4568"],["Comerica","1-800-266-3742","1-800-266-3742"],["Community America CU","816-656-4700","816-656-4700"],["E-Trade","1-800-387-2331","1-800-387-2331"],["Equity Bank","1-844-611-0777","1-844-611-0777"],["Fifth Third","1-800-972-3030","1-877-534-2264"],["Huntington","1-800-480-2265","1-800-480-2001"],["KeyBank","1-800-539-2968","1-888-539-4249"],["M&T Bank","1-800-724-2440","1-800-724-6070"],["Navy Federal","1-888-842-6328","1-888-842-6328"],["PNC","1-888-762-2265","1-877-287-2654"],["Regions","1-800-734-4667","1-800-787-3905"],["Santander","1-877-768-2265","1-800-493-8219"],["Simmons Bank","1-866-246-2400","1-866-246-2400"],["TD Bank","1-888-751-9000","1-800-450-7318"],["Truist","1-844-487-8478","1-877-495-1044"],["U.S. Bank","1-800-872-2657","1-800-673-3555"],["Vantage CU","314-298-0055","314-298-0055"],["Wells Fargo","1-800-869-3557","1-800-225-5935"]];
function normalizePhoneRow(row){const x=Array.isArray(row)?{bank:row[0],personal:row[1],business:row[2],custom:false}:(row&&typeof row==='object'?row:{});return{bank:String(x.bank||'').trim(),personal:String(x.personal||'').trim(),business:String(x.business||'').trim(),custom:!!x.custom}}
function phoneKey(name){return String(name||'').trim().toLowerCase()}
function defaultPhoneRows(){return PHONE_DEFAULTS.map(r=>normalizePhoneRow(r))}
function loadPhoneEdits(){return ld(PHONE_KEY,[]).map(normalizePhoneRow).filter(r=>r.bank)}
function savePhoneEdits(rows){sv(PHONE_KEY,(rows||[]).map(normalizePhoneRow).filter(r=>r.bank))}
function getPhoneBook(){const map=new Map();defaultPhoneRows().forEach(r=>map.set(phoneKey(r.bank),{...r,custom:false}));loadPhoneEdits().forEach(r=>{const key=phoneKey(r.bank);if(map.has(key))map.set(key,{...map.get(key),...r});else map.set(key,{...r,custom:true})});return Array.from(map.values()).sort((a,b)=>a.bank.localeCompare(b.bank))}
function hasDefaultPhone(bank){return defaultPhoneRows().some(r=>phoneKey(r.bank)===phoneKey(bank))}
function upsertPhoneEdit(row){const clean=normalizePhoneRow(row);if(!clean.bank)return;const rows=loadPhoneEdits();const key=phoneKey(clean.bank);const idx=rows.findIndex(r=>phoneKey(r.bank)===key);if(idx>=0)rows[idx]={...rows[idx],...clean};else rows.push(clean);savePhoneEdits(rows)}
function removePhoneEdit(bank){savePhoneEdits(loadPhoneEdits().filter(r=>phoneKey(r.bank)!==phoneKey(bank)))}
function savePhoneTabRow(bankEnc,idx,custom){const bank=decodeURIComponent(bankEnc);const p=document.getElementById('ph_p_'+idx);const b=document.getElementById('ph_b_'+idx);upsertPhoneEdit({bank,personal:p?p.value:'',business:b?b.value:'',custom:!!custom});R()}
function resetPhoneTabRow(bankEnc){const bank=decodeURIComponent(bankEnc);removePhoneEdit(bank);R()}
function deletePhoneTabRow(bankEnc){const bank=decodeURIComponent(bankEnc);removePhoneEdit(bank);R()}
function addPhoneTabRow(){const bank=(document.getElementById('ph_new_bank')||{}).value?.trim?.()||'';const personal=(document.getElementById('ph_new_personal')||{}).value?.trim?.()||'';const business=(document.getElementById('ph_new_business')||{}).value?.trim?.()||'';if(!bank){alert('Bank name required');return}upsertPhoneEdit({bank,personal,business,custom:!hasDefaultPhone(bank)});showPhoneAdd=false;phoneSearch='';R()}
const RULES=[["Chase","2yr",24,true,true,"None","$12/mo waived $500 DD","2yr from enrollment; 90d close rule"],["Bank of America","1yr",12,true,true,"None","$12/mo waived $250 DD","Tiered $100-$500"],["Wells Fargo","1yr",12,true,true,"None","$10/mo waived $500 DD",""],["U.S. Bank","1yr",12,true,true,"None","$6.95/mo waived $1k DD","No early close fee"],["Citi","1yr",12,true,true,"None","$12/mo waived $1k DD","Offer-specific"],["Simmons Bank","1yr",12,true,true,"None","$0 (Simply Checking)","$150x3 cycles. MO/AR/KS/OK/TN/TX"],["Equity Bank","180d",6,true,true,"$400 clawback","$10/mo waived $2k bal","Must open checking+savings. MO/KS/AR/OK"],["Regions","1yr",12,true,true,"$25 <180d","$8/mo waived $500 DD","10 debit txns. MO available"],["PNC","2yr",24,true,true,"None","$7-25/mo by tier","Tiered $100-$400"],["Central Bank","2yr",24,true,true,"None","$0 free checking","MO/KS/OK/IL"],["Community America","1yr",12,true,true,"None","$0 free checking","KC metro. Guided Investing bonus"],["TD Bank","3yr",36,false,false,"None","$15-25/mo","Many once-per-lifetime"],["Huntington","1yr",12,true,false,"None","$0 (Asterisk Free)","24mo rolling limit"],["BMO","1yr",12,true,true,"None","$5-25/mo","CC funding avail. Nationwide"],["Fifth Third","2yr",24,true,true,"None","$11/mo waived $500 DD","AL/FL/GA/IL/IN/KY/MI/NC/OH/TN"],["Capital One","1yr",12,false,true,"None","$0 free","Not churnable anymore"]];
const LEGACY_COMMUNITY_DEFAULTS=[["Chase","Fidelity ACH"],["Chase","Robinhood ACH"],["Chase","Schwab ACH"],["Bank of America","Fidelity ACH"],["Bank of America","Robinhood ACH"],["U.S. Bank","Robinhood ACH"],["U.S. Bank","Fidelity ACH"],["U.S. Bank","No early close fee"],["Wells Fargo","Employer DD only"],["Citi","ACH transfers"],["PNC","Fidelity ACH"],["Simmons Bank","$1k DD + 7 debit"],["Equity Bank","$1k DD + debit activation"],["Equity Bank","$400 clawback <180d"],["Regions","$1k DD + 10 debit txns"],["Capital One","Not churnable (2025+)"],["BMO","ACH works + CC funding"]];
const DATA_POINTS=[
["Chase","Current personal bonus uses qualifying direct deposit in 90 days","Doctor of Credit current checking post tracks the main personal offer as DD-based within 90 days.","https://www.doctorofcredit.com/chase-400-checking-bonus/"],
  ["Chase","Churn rule: 24 months from last enrollment date","Doctor of Credit churn list says Chase is generally once every 2 years from last enrollment date.","https://www.doctorofcredit.com/a-list-of-churnable-bank-account-bonuses/"],
["Chase","$900 combo offer is live","Doctor of Credit tracks the combo offer with a checking leg plus a savings leg that needs $15,000 for 90 days.","https://www.doctorofcredit.com/targeted-chase-900-checking-savings-bonus/"],
["Chase Biz","$20,000 new money within 30 days","Doctor of Credit current Chase business post tracks a $20k deposit requirement for the larger business bonus tier.","https://www.doctorofcredit.com/chase-business-total-checking-750-bonus-no-direct-deposit-required/"],
["Chase Biz","Keep balance 60 days + complete 5 qualifying transactions","Doctor of Credit says the business bonus needs the balance hold plus 5 qualifying transactions within 90 days.","https://www.doctorofcredit.com/chase-business-total-checking-750-bonus-no-direct-deposit-required/"],
["Chase Biz","No direct deposit required on current business offer","Doctor of Credit frames the current Chase business offer as balance + transaction based rather than payroll-DD based.","https://www.doctorofcredit.com/chase-business-total-checking-750-bonus-no-direct-deposit-required/"],
["Bank of America","$100 / $300 / $500 DD tiers","Doctor of Credit current BofA offer uses total direct deposits in the first 90 days to determine the tier.","https://www.doctorofcredit.com/bank-of-america-100-500-checking-bonus/"],
["Bank of America","90-day qualification window","Doctor of Credit says the direct deposits must land within the first 90 days from opening.","https://www.doctorofcredit.com/bank-of-america-100-500-checking-bonus/"],
["Bank of America Biz","$5,000 or $15,000 new money tiers","Doctor of Credit current business offer uses new-money deposit tiers rather than direct deposit.","https://www.doctorofcredit.com/bank-of-america-400-750-business-checking-bonus/"],
["Wells Fargo","$1,000 qualifying direct deposits in 90 days","Doctor of Credit current Wells Fargo personal offer is tied to $1,000+ qualifying direct deposits in 90 days.","https://www.doctorofcredit.com/wells-fargo-325-checking-bonus-available-online/"],
["Wells Fargo","Bank of America transfers reported as working","Doctor of Credit DD list includes Bank of America datapoints under Wells Fargo.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["Wells Fargo","Chase transfers reported as working","Doctor of Credit DD list includes multiple Chase datapoints under Wells Fargo.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["Wells Fargo","Charles Schwab is commonly reported as working","Doctor of Credit DD list shows a long run of Charles Schwab success datapoints for Wells Fargo.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["Wells Fargo","Wise is mixed / unreliable","Doctor of Credit DD list includes Wise entries that failed for some Wells Fargo readers.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["Wells Fargo Biz","$2,500 or $25,000 balance path","Doctor of Credit current Wells Fargo business offer is balance-based, not payroll-DD based.","https://www.doctorofcredit.com/wells-fargo-400-825-business-checking-bonus/"],
["U.S. Bank","$3k / $5k / $8k DD tiers on current offer","Doctor of Credit current Smartly post tracks direct-deposit tiers up to $450.","https://www.doctorofcredit.com/u-s-bank-450-100-checking-bonus/"],
["U.S. Bank","Wise is mixed / unreliable","Doctor of Credit DD list has both success and failure datapoints for Wise with U.S. Bank.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["U.S. Bank","Ally can be mixed","Doctor of Credit DD list notes Ally failures and at least one case that worked after manual request.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["U.S. Bank","Charles Schwab has failures logged","Doctor of Credit DD list includes Schwab datapoints that did not trigger the requirement for some readers.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["U.S. Bank Biz","$25,000 + 6 transactions for top tier","Doctor of Credit current business post tracks the Platinum business path with a $25k hold and 6 transactions.","https://www.doctorofcredit.com/u-s-bank-400-900-business-checking-bonus/"],
["U.S. Bank Biz","$5,000 tier exists on Silver business package","Doctor of Credit current business post also tracks a lower Silver business tier.","https://www.doctorofcredit.com/u-s-bank-400-900-business-checking-bonus/"],
["Citi","Enhanced Direct Deposits required on current personal offer","Doctor of Credit current Citi personal offer is direct-deposit based.","https://www.doctorofcredit.com/citi-300-checking-bonus/"],
["Citi","2 enhanced direct deposits within 90 days","Doctor of Credit says the current Citi personal offer uses two enhanced DDs inside 90 days.","https://www.doctorofcredit.com/citi-300-checking-bonus/"],
["Citi Biz","No direct deposit required","Doctor of Credit business post frames Citi business as deposit-based with no DD requirement.","https://www.doctorofcredit.com/ymmv-in-branch-citibank-business-up-to-2000-checking-bonus/"],
["PNC","Alliant often works","Doctor of Credit DD list shows many Alliant success datapoints for PNC.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["PNC","Ally often works but is mixed","Doctor of Credit DD list shows many Ally successes for PNC with some failures mixed in.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["PNC","AmEx Serve has several success datapoints","Doctor of Credit DD list includes multiple Serve datapoints for PNC.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["PNC","Current personal bonus uses DD totals in 60 days","Doctor of Credit current PNC personal post uses DD totals inside 60 days for the bonus tiers.","https://www.doctorofcredit.com/pnc-up-to-250-400-checking-bonus/"],
["PNC Biz","Business bonus is balance / hold based","Doctor of Credit business post tracks statement-cycle balance holds rather than payroll DD.","https://www.doctorofcredit.com/pnc-up-to-500-business-checking-bonus-al-dc-de-fl-ga-il-in-ky-md-mi-mo-nc-nj-ny-oh-pa-sc-va-wi-and-wv/"],
["Regions","Alliant works","Doctor of Credit DD list includes Alliant success datapoints for Regions.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["Regions","Ally frequently works","Doctor of Credit DD list has many Ally success datapoints for Regions.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["Regions","Capital One 360 works","Doctor of Credit DD list includes multiple Capital One 360 success datapoints for Regions.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["Regions","Current offer needs online banking + $1,000 ACH DD in 90 days","Doctor of Credit latest Regions personal post tracks the current requirement set.","https://www.doctorofcredit.com/regions-bank-400-checking-bonus-50-referral-al-ar-fl-ga-il-in-ia-ky-la-ms-mo-nc-sc-tn-tx-2/"],
["BMO","Ally worked","Doctor of Credit DD list includes Ally success datapoints for BMO Harris / BMO.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["BMO","Chase is mixed but often works","Doctor of Credit DD list includes multiple Chase successes with some failures for BMO.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["BMO","Discover is mixed","Doctor of Credit DD list includes both positive and negative Discover datapoints for BMO.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["BMO","Current checking offer uses DD tiers in first 90 days","Doctor of Credit current BMO checking post uses qualifying direct-deposit tiers.","https://www.doctorofcredit.com/il-wi-mn-in-az-fl-ks-mo-bmo-harris-350-checking-300-savings-bonus/"],
["BMO Biz","Business bonus is balance based","Doctor of Credit BMO business post tracks balance/hold tiers rather than payroll DD.","https://www.doctorofcredit.com/az-fl-il-ks-mo-mn-wi-bmo-harris-200-500-business-checking-bonus/"],
["Huntington","ACH transfers work","Doctor of Credit DD list includes ACH transfer success datapoints for Huntington.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["Huntington","Ally often works","Doctor of Credit DD list includes multiple Ally successes for Huntington.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["Huntington","Chase often works","Doctor of Credit DD list includes multiple Chase success datapoints for Huntington.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["Huntington","Fidelity often works","Doctor of Credit DD list includes multiple Fidelity success datapoints for Huntington.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["Huntington","Some current offers do not require DD","Doctor of Credit current Huntington personal page tracks Perks / Platinum offers with fee notes and no-DD framing on some offers.","https://www.doctorofcredit.com/oh-mi-pa-ky-wv-huntington-bank-200-checking-promotion-no-direct-deposit-requirement/"],
["Fifth Third","Ally works but is mixed over time","Doctor of Credit DD list includes many Ally successes for Fifth Third, plus some failures over time.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["Fifth Third","Capital One often works","Doctor of Credit DD list includes Capital One success datapoints for Fifth Third.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["Fifth Third","Charles Schwab often works","Doctor of Credit DD list includes Charles Schwab success datapoints for Fifth Third.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["Fifth Third","Current personal offer needs $500 direct deposits in 90 days","Doctor of Credit current Fifth Third personal post tracks the latest DD requirement.","https://www.doctorofcredit.com/fifth-third-200-checking-bonus-fl-ga-il-ky-mi-nc-oh-tn-wv/"],
["TD Bank","$500 or $2,500 DD depending on account tier","Doctor of Credit current TD checking post tracks different DD requirements for Complete vs Beyond Checking.","https://www.doctorofcredit.com/targeted-td-bank-300-checking-200-savings-bonus/"],
["TD Bank","Fidelity worked","Doctor of Credit DD list includes Fidelity success datapoints for TD Bank.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["TD Bank","Robinhood worked","Doctor of Credit DD list includes Robinhood success datapoints for TD Bank.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["TD Bank","Venmo worked","Doctor of Credit DD list includes Venmo success datapoints for TD Bank.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["Capital One","2 direct deposits of $500 within 75 days","Doctor of Credit current 360 Checking post tracks this as the core personal bonus path.","https://www.doctorofcredit.com/capital-one-300-checking-bonus/"],
["Capital One","Targeted $400 version exists","Doctor of Credit tracked a GET400 targeted version using the same general 2x$500 DD framework.","https://www.doctorofcredit.com/ymmv-capital-one-400-checking-bonus/"],
["Capital One","Debit-spend promo also exists","Doctor of Credit also tracked a DEBIT250 version using 20 debit purchases instead of DD.","https://www.doctorofcredit.com/capital-one-250-checking-bonus-direct-deposit-not-required-2/"],
["Capital One Biz","$5,000 balance for 60 days","Doctor of Credit current Capital One business post tracks the $500 tier with a 60-day balance hold.","https://www.doctorofcredit.com/capital-one-500-1000-business-checking-bonus/"],
["Simmons Bank","Ally worked","Doctor of Credit DD list includes an Ally success datapoint for Simmons.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["Simmons Bank","Fidelity worked","Doctor of Credit DD list includes a Fidelity success datapoint for Simmons.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["Simmons Bank","Novo worked","Doctor of Credit DD list includes a Novo success datapoint for Simmons.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["Simmons Bank","Current personal bonus pays $150 per cycle, up to 3 cycles","Doctor of Credit current Simmons personal post tracks the per-cycle structure.","https://www.doctorofcredit.com/ar-tx-tn-ok-mo-ks-simmons-bank-300-checking-bonus/"],
["Equity Bank","$1,000 DD + debit activation in 45 days","Doctor of Credit current Equity personal post tracks the key requirements.","https://www.doctorofcredit.com/ks-mo-ar-ok-ne-equity-bank-400-checking-bonus/"],
["Equity Bank","Checking + savings combo required on current personal offer","Doctor of Credit current Equity personal offer requires both accounts.","https://www.doctorofcredit.com/ks-mo-ar-ok-ne-equity-bank-400-checking-bonus/"],
["Equity Bank","DoC DD list currently shows no ACH workaround datapoints","Doctor of Credit knowledge-base currently shows no DD-method datapoints under Equity Bank.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["Equity Bank Biz","$20,000 deposits + debit activation","Doctor of Credit current Equity business post tracks deposit + debit card use requirements.","https://www.doctorofcredit.com/ks-mo-ar-ok-equity-bank-1000-business-checking-bonus/"],
["Community America","Fidelity worked","Doctor of Credit DD list includes Fidelity success datapoints for CommunityAmerica CU.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["Community America","Novo worked","Doctor of Credit DD list includes a Novo success datapoint for CommunityAmerica CU.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["Community America","RelayFi worked","Doctor of Credit DD list includes a RelayFi success datapoint for CommunityAmerica CU.","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],
["Community America","Current offer needs 2+ direct deposits totaling $2,500 in 90 days","Doctor of Credit current CommunityAmerica personal post tracks the main DD requirement.","https://www.doctorofcredit.com/ks-mo-only-communityamerica-credit-union-300-checking-bonus/"],
["Central Bank","2 or more direct deposits within 90 days","Doctor of Credit current Central Bank personal post tracks the DD requirement window.","https://www.doctorofcredit.com/ok-il-ks-mo-co-only-central-bank-300-800-checking-bonus/"],
["Central Bank","$300 / $800 tiers based on direct-deposit total","Doctor of Credit current Central Bank personal post uses DD tiers.","https://www.doctorofcredit.com/ok-il-ks-mo-co-only-central-bank-300-800-checking-bonus/"],
["Central Bank Biz","$3,000 balance at day 90","Doctor of Credit older Central Bank business post tracked an in-branch business balance datapoint.","https://www.doctorofcredit.com/ok-il-ks-mo-co-in-branch-only-central-bank-500-checking-bonus/"]
];
const DOC_LINKS=[["DD Methods Master List","https://www.doctorofcredit.com/knowledge-base/list-methods-banks-count-direct-deposits/"],["Churnable Bonuses","https://www.doctorofcredit.com/a-list-of-churnable-bank-account-bonuses/"],["Best Current Bonuses","https://www.doctorofcredit.com/best-bank-account-bonuses/"],["CC Funding List","https://www.doctorofcredit.com/bank-accounts/bank-accounts-that-can-be-funded-with-a-credit-card/"],["BankRewards.io","https://www.bankrewards.io"]];
/* One-time ID repair: safely upgrades legacy/incorrect IDs to the smart
   short format based on each entry's current bank name and type. Only the
   id field is touched; all user data remains intact. */
function repairEntryIds(list){
  const src=Array.isArray(list)?list:[];
  const used=new Set();
  const seqByKey={};
  let changed=false;
  const repaired=src.map((entry,idx)=>{
    const e={...entry};
    const bank=e.bank||'';
    const eType=entryBankType(e);
    const key=bankCode(bank||('Bank '+(idx+1)))+'|'+eType;
    const prefix=bankCode(bank||'Bank')+'-'+eType+'-';
    const rawId=String(e.id||'').toUpperCase().trim();
    if(!e.opened){
      if(rawId&&!isOfficialEntryId(rawId)){e.id=rawId;return e}
      const draft=makeDraftId(bank||'Bank');
      if(e.id!==draft)changed=true;
      e.id=draft;
      return e;
    }
    if(isOfficialEntryId(rawId)&&rawId.startsWith(prefix)&&!used.has(rawId)){
      used.add(rawId);
      seqByKey[key]=Math.max(seqByKey[key]||0,parseInt(rawId.slice(-2),10)||0);
      e.id=rawId;
      return e;
    }
    let next=Math.max((seqByKey[key]||0)+1,1);
    let fixed=prefix+String(next).padStart(2,'0');
    while(used.has(fixed)){
      next++;
      fixed=prefix+String(next).padStart(2,'0');
    }
    seqByKey[key]=next;
    used.add(fixed);
    if(e.id!==fixed)changed=true;
    e.id=fixed;
    return e;
  });
  return{items:repaired,changed};
}
function disableProfileEventStorage(){try{localStorage.removeItem(PROFILE_EVT_KEY)}catch{}}
function loadProfileEvents(){return[]}
function saveProfileEvents(rows){}
function setProfileEvent(bank,entryId,type,date,label){}
function syncProfileEventsFromEntry(e){}
function getProfileEventsForBank(bank){return[]}
disableProfileEventStorage();
let entries=migrateEntryAccountTypes(ld(SK,DEF)),tab='tracker',expanded=null,modal=null,cfm=null,search='';
const __idRepair=repairEntryIds(entries);
entries=__idRepair.items;
if(__idRepair.changed)sv(SK,entries);
syncExistingDatapointsToDB();
migrateLegacyInlineItems();
disableProfileEventStorage();
let dashYear=new Date().getFullYear(),taxYear=new Date().getFullYear();
let showAnalyzer=false,analyzerText='',analyzerResult=null,analyzerIsBiz=false;
let showInlineAZ=false,inlineResult=null;
let phoneSearch='',showPhoneAdd=false;
let dpSearch='',dpExpandedBankKey='';
let profileSearch='',activeProfileKey='';
let inlineUiState={};
let dpEditor=null;
let ddPrompt=null,rcvPrompt=null,showTemplates=false;
let feedItems=null,feedLoading=false;
let undoState=null,undoTimer=null;
let closePrompt=null;
let overwritePrompt=null;
let matchPickerPrompt=null;
let feeCheckPrompt=null;
let timerEditModal=null;
const btPostRenderHooks=[];
function btRegisterPostRender(name,fn){if(typeof fn!=='function')return false;const id=String(name||('hook_'+btPostRenderHooks.length));const existing=btPostRenderHooks.find(x=>x.name===id);if(existing){existing.fn=fn;return true}btPostRenderHooks.push({name:id,fn});return true}
function btRunPostRenderHooks(){btPostRenderHooks.slice().forEach(h=>{try{h.fn()}catch(e){console.warn('[BonusTracker post-render]',h.name,e)}})}
try{window.btRegisterPostRender=btRegisterPostRender;window.btRunPostRenderHooks=btRunPostRenderHooks}catch{}
function btCleanStr(v){return String(v==null?'':v).replace(/\s+/g,' ').trim()}
function btMakeLegacyInlineId(prefix,entryId,i){return prefix+'_'+String(entryId||'entry').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,24)+'_'+Date.now().toString(36)+'_'+i+'_'+Math.random().toString(36).slice(2,7)}
function normalizeChecklistItemLocal(item,entryId,i){const x=(item&&typeof item==='object')?{...item}:{text:btCleanStr(item)};if(!btCleanStr(x.id))x.id=btMakeLegacyInlineId('ck',entryId,i);if(!btCleanStr(x.text))x.text=btCleanStr(x.label||x.name||x.title||x.description||x.note||'Checklist step');x.done=!!(x.done||x.checked||x.complete||x.completed);return x}
function migrateLegacyInlineItems(){if(!Array.isArray(entries))return false;let changed=false;entries=entries.map((e,idx)=>{if(!e||typeof e!=='object')return e;const n={...e};const entryId=btCleanStr(n.id)||('row_'+idx);if(Array.isArray(n.customTimers)){const before=JSON.stringify(n.customTimers);n.customTimers=n.customTimers.map((t,i)=>{const x=(t&&typeof t==='object')?{...t}:{text:btCleanStr(t)};if(!btCleanStr(x.id))x.id=btMakeLegacyInlineId('tm',entryId,i);if(!btCleanStr(x.text))x.text=btCleanStr(x.label||x.name||x.title||x.description||'Timer');if(!btCleanStr(x.date))x.date=btCleanStr(x.dueDate||x.due||x.endDate||'');if(!btCleanStr(x.startDate))x.startDate=btCleanStr(x.start||x.opened||'');x.daysRequired=parseInt(x.daysRequired||x.days||x.durationDays||0,10)||0;x.done=!!x.done;return x});if(JSON.stringify(n.customTimers)!==before)changed=true}if(Array.isArray(n.checklist)){const before=JSON.stringify(n.checklist);n.checklist=n.checklist.map((item,i)=>normalizeChecklistItemLocal(item,entryId,i));if(JSON.stringify(n.checklist)!==before)changed=true}return n});if(changed)sv(SK,entries);return changed}
function inlineStateFor(id){if(!inlineUiState[id])inlineUiState[id]={checklist:false,timer:false,timerEdit:null,timerKind:'due'};if(!('timerEdit' in inlineUiState[id]))inlineUiState[id].timerEdit=null;if(!('timerKind' in inlineUiState[id]))inlineUiState[id].timerKind='due';return inlineUiState[id]}
function isInlineOpen(id,type){return !!inlineStateFor(id)[type]}
let timerChoicePrompt=null;
function openTimerTypePrompt(id){const entry=entries.find(e=>e.id===id);if(!entry)return;timerChoicePrompt={entryId:id,bank:entry.bank||''};R()}
function closeTimerTypePrompt(){timerChoicePrompt=null;R()}
function chooseTimerType(kind){if(!timerChoicePrompt)return;const id=timerChoicePrompt.entryId;const st=inlineStateFor(id);st.timerKind=kind==='days'?'days':'due';st.timerEdit=null;timerChoicePrompt=null;window.__skipTimerPrompt=true;toggleInlineForm(id,'timer',true);window.__skipTimerPrompt=false}
function rTimerChoicePrompt(){if(!timerChoicePrompt)return'';let h='<div class="cbg" onclick="closeTimerTypePrompt()"><div class="dd-box" onclick="event.stopPropagation()">';h+='<h3>Choose mini timer type</h3>';h+='<div class="sub">Pick the timer style that matches the bank requirement.</div>';h+='<button class="inline-trigger" style="width:100%;justify-content:flex-start;margin-bottom:8px;text-align:left" onclick="chooseTimerType(\'due\')"><span>📅</span><span><strong>Due Date Timer</strong><br><span style="font-size:10px;color:#64748B;font-weight:700">Countdown to an exact date you already know.</span></span></button>';h+='<button class="inline-trigger" style="width:100%;justify-content:flex-start;text-align:left" onclick="chooseTimerType(\'days\')"><span>⏱️</span><span><strong>Start Date + Days Timer</strong><br><span style="font-size:10px;color:#64748B;font-weight:700">Enter a start date and days; the app calculates the due date.</span></span></button>';h+='<button class="btn-s" onclick="closeTimerTypePrompt()">Cancel</button>';h+='</div></div>';return h}
function toggleInlineForm(id,type,force){const st=inlineStateFor(id);const next=typeof force==='boolean'?force:!st[type];if(type==='timer'&&next&&force===true&&!window.__skipTimerPrompt){openTimerTypePrompt(id);return}st[type]=next;if(type==='timer'&&!next)st.timerEdit=null;R();if(st[type]){setTimeout(()=>{const targetId=type==='checklist'?'ck_'+id:'tm_txt_'+id;const el=document.getElementById(targetId);if(el)el.focus()},0)}}
function clearInlineInputs(id,type){if(type==='checklist'){const inp=document.getElementById('ck_'+id);if(inp)inp.value=''}else{const txt=document.getElementById('tm_txt_'+id);const st=document.getElementById('tm_start_'+id);const ds=document.getElementById('tm_days_'+id);if(txt)txt.value='';if(st)st.value='';if(ds)ds.value='';inlineStateFor(id).timerEdit=null;}}
function findPhone(bank,eid){if(eid){const ee=entries.find(x=>x.id===eid);if(ee&&ee.phoneNum)return ee.phoneNum}const bn=(bank||'').toLowerCase();const isBiz=bn.includes('biz')||bn.includes('business');const row=getPhoneBook().find(r=>{const bl=(r.bank||'').toLowerCase();return bn===bl||bn.includes(bl)||bl.includes(bn)||normalizeBankFamily(bn)===normalizeBankFamily(bl)});if(!row)return null;return isBiz?(row.business||row.personal):(row.personal||row.business)}
function findPhoneLabel(bank){const bn=bank.toLowerCase();return(bn.includes('biz')||bn.includes('business'))?'Business':'Personal'}
function callBank(id){const e=entries.find(x=>x.id===id);if(!e)return;const phone=findPhone(e.bank,id);if(phone)window.location.href='tel:'+phone.replace(/[^0-9+]/g,'');else{cfm={title:'No Number Found',msg:'No phone number found for '+e.bank+'. Check the Phone tab.',green:true,action:()=>{cfm=null;R()}};R()}}
function undoClose(){if(!undoState)return;entries=entries.map(e=>e.id===undoState.id?{...undoState}:e);entries=sortE(entries);sv(SK,entries);undoState=null;if(undoTimer)clearTimeout(undoTimer);R()}
let _sp=0;
const I={grid:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',doc:'<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',tips:'<svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',phone:'<svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>',info:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',profile:'<svg viewBox="0 0 24 24"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 9h.01"/><path d="M15 9h.01"/><path d="M9 13h.01"/><path d="M15 13h.01"/><path d="M12 21v-4"/></svg>',backup:'<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',restore:'<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',quick:'<svg viewBox="0 0 24 24"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>',trash:'<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',spark:'<svg viewBox="0 0 24 24"><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.4L12 15l-1.9-4.6L5.5 9l4.6-1.4L12 3z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z"/></svg>',edit:'<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',gift:'<svg viewBox="0 0 24 24"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z"/></svg>',lock:'<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',clockShield:'<svg viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3z"/><circle cx="12" cy="12" r="3.5"/><path d="M12 10.5v1.8l1.2.7"/></svg>',shieldCheck:'<svg viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>',refresh:'<svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0 0 20.49 15"/></svg>',alert:'<svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',target:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg>',calendar:'<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',search:'<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',feed:'<svg viewBox="0 0 24 24"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>'};
function displayStatusMeta(raw){switch(raw){case'WORKING':return{label:'Working',cls:'w',icon:I.target};case'CUSTOM TIMER':return{label:'Custom Timer',cls:'buf',icon:I.clockShield};case'REQ MET':return{label:'Req Met',cls:'req',icon:I.shieldCheck};case'PLANNED CLOSE':return{label:'Close Planned',cls:'wt',icon:I.lock};case'WAITING TO CLOSE':return{label:'Waiting to Close',cls:'buf',icon:I.clockShield};case'3-DAY BUFFER':return{label:'3-Day Buffer',cls:'buf',icon:I.clockShield};case'SAFE TO CLOSE':return{label:'Safe to Close',cls:'stc',icon:I.shieldCheck};case'WAITING TO CHURN!':return{label:'Waiting to Churn',cls:'wt',icon:I.refresh};case'TIME TO CHURN!':return{label:'Ready to Churn',cls:'ch',icon:I.alert};default:return{label:raw||'Status',cls:'w',icon:I.info}}}
function supportLine(e,countdown){const s=status(e);const hasEarlyFee=!!(!e.closed&&e.earlyCloseFee>0&&!e.feeChecked);if(s==='WAITING TO CHURN!'){const dl=daysLeft(e);return dl!==null?dl+'d left':'Cooling down'}if(s==='TIME TO CHURN!')return'Ready now';if(s==='CUSTOM TIMER'){const timer=nextActiveTimer(e);const d=timerCountdownDays(timer);if(timer&&d!==null){if(d<0)return'Overdue: '+timer.text;if(d===0)return'Due today: '+timer.text;return d+'d left: '+timer.text}return e.reqMet?'Req met • countdown active':'Countdown active'}if(s==='REQ MET'){if(e.reqMet){const d=Math.max(0,dB(e.reqMet,td()));return d>0?'Waiting bonus • '+d+'d since req met':'Waiting bonus'}return'Waiting bonus'}if(s==='PLANNED CLOSE'){const d=e.plannedClose?dB(td(),e.plannedClose):null;if(d!==null){let msg=d>0?d+'d to planned close':'Ready to close';if(hasEarlyFee)msg+=' • check close fee';return msg}return'Close planned'}if(s==='WAITING TO CLOSE'){const d=daysUntilSafe(e);let msg=d!==null&&d>0?d+'d until safe to close':'Waiting to close';if(hasEarlyFee)msg+=' • fee if closed early';return msg}if(s==='3-DAY BUFFER'){const d=daysUntilSafe(e);let msg=d!==null&&d>0?d+'d left in buffer':'Almost there';if(hasEarlyFee)msg+=' • fee if closed early';return msg}if(s==='SAFE TO CLOSE'){return(e.earlyCloseFee>0||e.minHoldDays>0)?'Bonus received • close when ready':'Bonus received • ready when you are'}if(s==='WORKING'){if(countdown&&countdown.lbl==='Req deadline'&&countdown.days>0)return countdown.days+'d to requirement deadline';if(countdown&&countdown.lbl==='Req deadline'&&countdown.days===0)return'Requirement deadline today';if(countdown&&countdown.lbl==='Req deadline'&&countdown.days<0)return'Missed requirement deadline';if(e.opened){const openDays=dB(e.opened,td());if(openDays>0)return openDays+'d open'}return'In progress'}return''}
function statusBadgeHtml(e,countdown){const meta=displayStatusMeta(status(e));const support=supportLine(e,countdown);return'<span class="badge '+meta.cls+'">'+meta.icon+'<span>'+esc(meta.label)+'</span></span>'+(support?'<div class="card-subline">'+esc(support)+'</div>':'')}
function quickBtn(cls,icon,label,onclick){return'<button class="qbtn '+cls+'" onclick="'+onclick+'">'+icon+'<span>'+label+'</span></button>'}
function actionBtn(cls,icon,label,onclick){return'<button class="cbtn '+cls+'" onclick="'+onclick+'">'+icon+'<span>'+label+'</span></button>'}
function highlightTC(text){if(!text)return'';let h=esc(text);h=h.replace(/^(REQUIREMENTS:|DIRECT DEPOSIT RULES:|ADDITIONAL BONUSES:|FEES &amp; TIMING:|CHURN &amp; TAX:)/gm,'<span class="hl-section">$1</span>');h=h.replace(/\* (Step \d+:)/g,'* <span class="hl-step">$1</span>');h=h.replace(/(\$[\d,]+(?:\.\d+)?)/g,'<span class="hl-money">$1</span>');h=h.replace(/(\d+\s+(?:days?|months?|weeks?|consecutive\s+days|statement\s+cycles?))/gi,'<span class="hl-days">$1</span>');h=h.replace(/(within\s+\d+\s+\w+)/gi,'<span class="hl-days">$1</span>');h=h.replace(/(NOT count|does NOT|do not qualify|not eligible|cannot be combined|not be combined|ineligible)/gi,'<span class="hl-warn">$1</span>');h=h.replace(/(clawback|penalty|early close|termination fee|fee if closed)/gi,'<span class="hl-fee">$1</span>');h=h.replace(/(?:code[:\s]+)([A-Z0-9]{3,})/g,'code: <span class="hl-code">$1</span>');h=h.replace(/(\$0 \(No fee\)|No fee|None|Safe anytime|free checking)/gi,'<span class="hl-good">$1</span>');h=h.replace(/(Zelle|P2P|Micro-deposits?|person-to-person)/gi,'<span class="hl-warn">$1</span>');return h}

function profileGroupMatchKey(groupKey, bankName){return bankKey(bankName||'')===groupKey}
function removeProfileReqsByGroupKey(groupKey){
  const reqs=loadReqs()||{};
  const next={};
  Object.entries(reqs).forEach(([k,v])=>{if(!profileGroupMatchKey(groupKey,(v&&v.bank)||k))next[k]=v});
  saveReqs(next);
}
function renameProfileReqsByGroupKey(groupKey,newBank){
  const reqs=loadReqs()||{};
  const next={};
  Object.entries(reqs).forEach(([k,v])=>{if(profileGroupMatchKey(groupKey,(v&&v.bank)||k))return;next[k]=v});
  const current=profileReqForBank(newBank)||{};
  next[String(newBank).toLowerCase()]={...current,bank:newBank,updated:td()};
  saveReqs(next);
}
function renameBankGroup(groupKey,newBank){
  const bank=String(newBank||'').trim();
  if(!bank)return false;
  entries=entries.map(e=>profileGroupMatchKey(groupKey,e.bank)?{...e,bank}:e);
  sv(SK,entries);
  saveUserDatapoints(loadUserDatapoints().map(x=>profileGroupMatchKey(groupKey,x.bank)?{...x,bank}:x));
  saveCommunityDatapoints(loadCommunityDatapoints().map(x=>profileGroupMatchKey(groupKey,x.bank)?{...x,bank}:x));
  saveProfileEvents(loadProfileEvents().map(x=>profileGroupMatchKey(groupKey,x.bank)?{...x,bank}:x));
  savePhoneEdits(loadPhoneEdits().map(x=>profileGroupMatchKey(groupKey,x.bank)?{...x,bank}:x));
  renameProfileReqsByGroupKey(groupKey,bank);
  activeProfileKey=bankKey(bank);
  if(modal&&profileGroupMatchKey(groupKey,modal.bank))modal={...modal,bank};
  if(dpEditor&&profileGroupMatchKey(groupKey,dpEditor.bank))dpEditor={...dpEditor,bank};
  return true;
}
function renameProfileBank(groupKey,bankEnc){
  const oldBank=decodeURIComponent(bankEnc||'');
  const next=prompt('Edit bank name',oldBank||'');
  if(next===null)return;
  const bank=String(next||'').trim();
  if(!bank){alert('Bank name required');return;}
  if(bank===oldBank)return;
  cfm={title:'Rename bank',msg:'Rename '+oldBank+' to '+bank+' across tracker history, saved requirements, datapoints, profile events, and custom phone data?',action:()=>{renameBankGroup(groupKey,bank);cfm=null;R()}};
  R();
}
function resetBankProfile(groupKey,bankEnc){
  const bank=decodeURIComponent(bankEnc||'');
  const entryIds=new Set(entries.filter(e=>profileGroupMatchKey(groupKey,e.bank)).map(e=>e.id));
  cfm={title:'Reset bank profile',msg:'Reset '+bank+'? This removes tracker history, confirmed datapoints, saved requirements, profile events, and custom phone data for this bank. Community reference datapoints will stay.',action:()=>{
    entries=entries.filter(e=>!profileGroupMatchKey(groupKey,e.bank));
    sv(SK,entries);
    saveUserDatapoints(loadUserDatapoints().filter(x=>!profileGroupMatchKey(groupKey,x.bank)));
    saveProfileEvents(loadProfileEvents().filter(x=>!profileGroupMatchKey(groupKey,x.bank)&&!entryIds.has(x.entryId)));
    removeProfileReqsByGroupKey(groupKey);
    savePhoneEdits(loadPhoneEdits().filter(x=>!profileGroupMatchKey(groupKey,x.bank)));
    if(modal&&profileGroupMatchKey(groupKey,modal.bank))modal=null;
    if(dpEditor&&profileGroupMatchKey(groupKey,dpEditor.bank))dpEditor=null;
    if(expanded&&entryIds.has(expanded))expanded=null;
    activeProfileKey='';
    cfm=null;
    R();
  }};
  R();
}
function deleteProfileBank(groupKey,bankEnc){
  const bank=decodeURIComponent(bankEnc||'');
  const entryIds=new Set(entries.filter(e=>profileGroupMatchKey(groupKey,e.bank)).map(e=>e.id));
  cfm={title:'Delete bank',msg:'Delete '+bank+' completely? This removes tracker history, confirmed datapoints, community datapoints, saved requirements, profile events, and custom phone data for this bank.',action:()=>{
    entries=entries.filter(e=>!profileGroupMatchKey(groupKey,e.bank));
    sv(SK,entries);
    saveUserDatapoints(loadUserDatapoints().filter(x=>!profileGroupMatchKey(groupKey,x.bank)));
    saveCommunityDatapoints(loadCommunityDatapoints().filter(x=>!profileGroupMatchKey(groupKey,x.bank)));
    saveProfileEvents(loadProfileEvents().filter(x=>!profileGroupMatchKey(groupKey,x.bank)&&!entryIds.has(x.entryId)));
    removeProfileReqsByGroupKey(groupKey);
    savePhoneEdits(loadPhoneEdits().filter(x=>!profileGroupMatchKey(groupKey,x.bank)));
    if(modal&&profileGroupMatchKey(groupKey,modal.bank))modal=null;
    if(dpEditor&&profileGroupMatchKey(groupKey,dpEditor.bank))dpEditor=null;
    if(expanded&&entryIds.has(expanded))expanded=null;
    activeProfileKey='';
    cfm=null;
    R();
  }};
  R();
}
function clearProfileMilestone(entryId,type){
  const map={opened:'opened',reqMet:'reqMet',bonusReceived:'bonusRecd',closed:'closed'};
  const field=map[type];
  const entry=entries.find(e=>e.id===entryId);
  if(!entry||!field)return;
  cfm={title:'Clear milestone',msg:'Clear '+type+' for '+entry.bank+'?',action:()=>{
    entries=entries.map(e=>e.id===entryId?{...e,[field]:'',...(field==='closed'?{feeChecked:false}:{}),...(field==='bonusRecd'?{plannedClose:''}:{})}:e);
    sv(SK,entries);
    const updated=entries.find(e=>e.id===entryId);
    if(updated){syncProfileEventsFromEntry(updated);refreshSavedReqFromEntry(updated)}
    cfm=null;
    R();
  }};
  R();
}
function clearProfileRequirements(bankEnc){
  const bank=decodeURIComponent(bankEnc||'');
  const key=bankKey(bank);
  cfm={title:'Clear saved requirements',msg:'Clear saved requirement fields for '+bank+'?',action:()=>{removeProfileReqsByGroupKey(key);cfm=null;R()}};
  R();
}
function openProfileReqEditor(bankEnc){
  const bank=decodeURIComponent(bankEnc||'');
  if(!bank)return;
  const current=profileReqForBank(bank)||{};
  const prompts=[
    ['monthlyFeeYNText','Monthly fee'],
    ['promoCodeText','Promo code'],
    ['avoidMonthlyFeeText','How to avoid the monthly fee'],
    ['completeBonusText','How to complete the bonus'],
    ['earlyTerminationFeeText','Early termination fee'],
    ['eligibilityText','Eligibility / churn'],
    ['expirationDateText','Expiration date of bonus'],
    ['requiredDaysText','How many days required to complete the bonus']
  ];
  const next={...current,bank};
  for(const [field,label] of prompts){
    const resp=prompt(label,current[field]||'');
    if(resp===null)return;
    next[field]=String(resp||'').trim();
  }
  const __manualReqDays=parseRequirementDaysText(next.requiredDaysText);saveReq(bank,{...next,reqDays:__manualReqDays,updated:td()});
  R();
}

function openBankProfileFromBank(bankEnc){const bank=decodeURIComponent(bankEnc||'');if(!bank)return;activeProfileKey=bankKey(bank);profileSearch='';tab='profiles';expanded=null;R();setTimeout(()=>{const sc=document.querySelector('.scroll');if(sc)sc.scrollTop=0},0)}
function openBankProfileFromKey(key){if(!key)return;activeProfileKey=key;profileSearch='';tab='profiles';expanded=null;R();setTimeout(()=>{const sc=document.querySelector('.scroll');if(sc)sc.scrollTop=0},0)}
function closeActiveProfile(){activeProfileKey='';R();setTimeout(()=>{const sc=document.querySelector('.scroll');if(sc)sc.scrollTop=0},0)}
function profileTimelineDate(e){return e?.closed||e?.bonusRecd||e?.opened||''}
function profileRuleForBank(bank){const carrier=(bank&&typeof bank==='object')?bank:{bank};const wanted=entryBankIdentity(carrier);const same=RULES.filter(r=>{const rb=r&&r[0]||'';if(!rb)return false;const ri=entryBankIdentity({bank:rb,accountType:detectAccountTypeFromText(rb)});if(ri.family!==wanted.family)return false;const rowExplicit=bankTypeInfo(rb).explicit;if((carrier.accountType&&['personal','business'].includes(normalizeAccountType(carrier.accountType)))||wanted.typeExplicit&&rowExplicit)return ri.type===wanted.type;return true});return same.sort((a,b)=>{const ai=entryBankIdentity({bank:a[0]||'',accountType:detectAccountTypeFromText(a[0]||'')}),bi=entryBankIdentity({bank:b[0]||'',accountType:detectAccountTypeFromText(b[0]||'')});const ae=ai.key===wanted.key?0:1,be=bi.key===wanted.key?0:1;if(ae!==be)return ae-be;return String(b[0]||'').length-String(a[0]||'').length})[0]||null}
function profileReqForBank(bank){const reqs=Object.values(loadReqs()||{});const carrier=(bank&&typeof bank==='object')?bank:{bank};const wanted=entryBankIdentity(carrier);const explicit=!!(carrier.accountType&&['personal','business'].includes(normalizeAccountType(carrier.accountType)));const matches=reqs.filter(r=>{const rb=r&&r.bank||'';if(!rb)return false;const ri=entryBankIdentity(r);if(ri.family!==wanted.family)return false;if(explicit||wanted.typeExplicit)return ri.type===wanted.type;return true});return matches.sort((a,b)=>{const ai=entryBankIdentity(a),bi=entryBankIdentity(b);const ae=ai.key===wanted.key?0:1,be=bi.key===wanted.key?0:1;if(ae!==be)return ae-be;return String(b.bank||'').length-String(a.bank||'').length})[0]||null}
function profilePhoneForBank(bank){const wanted=bankIdentity(bank);const rows=getPhoneBook().filter(r=>{const rb=r&&r.bank||'';if(!rb)return false;const ri=bankIdentity(rb);if(ri.family!==wanted.family)return false;if(wanted.typeExplicit)return ri.type===wanted.type;return true});return rows.sort((a,b)=>{const ai=bankIdentity(a.bank||''),bi=bankIdentity(b.bank||'');const ae=ai.key===wanted.key?0:1,be=bi.key===wanted.key?0:1;if(ae!==be)return ae-be;return String(b.bank||'').length-String(a.bank||'').length})[0]||null}
function profileMethodFailed(text){return /fail|failed|did not|didn't|didnt|not work|unreliable|rejected|declined|mixed|no longer/i.test(String(text||''))}
function buildProfileGroups(){const map=new Map();const ensure=(bank)=>{const key=bankKey(bank||'Unknown Bank');if(!map.has(key))map.set(key,{key,bank:bank||'Unknown Bank',entries:[],user:[],community:[],rule:null,req:null,phone:null});const cur=map.get(key);if((cur.bank||'').length<(bank||'').length)cur.bank=bank;return cur};entries.forEach(e=>{if(e&&e.bank&&e.opened)ensure(e.bank).entries.push(e)});const getGroup=bank=>map.get(bankKey(bank||''))||null;loadUserDatapoints().forEach(item=>{const g=item&&item.bank?getGroup(item.bank):null;if(g)g.user.push(item)});getCommunityDatapoints().forEach(item=>{const g=item&&item.bank?getGroup(item.bank):null;if(g)g.community.push(item)});RULES.forEach(row=>{const g=getGroup(row&&row[0]);if(g&&(!g.rule||String(row[0]||'').length>String(g.rule?.[0]||'').length))g.rule=row});Object.values(loadReqs()||{}).forEach(r=>{const g=r&&r.bank?getGroup(r.bank):null;if(g&&(!g.req||String(r.bank||'').length>String(g.req?.bank||'').length))g.req=r});getPhoneBook().forEach(r=>{const g=r&&r.bank?getGroup(r.bank):null;if(g&&(!g.phone||String(r.bank||'').length>String(g.phone?.bank||'').length))g.phone=r});return Array.from(map.values()).map(g=>{g.entries=g.entries.sort((a,b)=>profileTimelineDate(b).localeCompare(profileTimelineDate(a)));g.activeEntry=g.entries.find(e=>e&&e.bank&&!e.closed)||null;g.cooldownEntry=g.entries.find(e=>['WAITING TO CHURN!','TIME TO CHURN!'].includes(status(e)))||null;g.rule=g.rule||profileRuleForBank(g.bank);g.req=g.req||profileReqForBank(g.bank);g.phone=g.phone||profilePhoneForBank(g.bank);g.completedEntries=g.entries.filter(e=>taxReady(e));g.receivedEntries=g.entries.filter(e=>isEarnedBonus(e));g.lifetime=g.completedEntries.reduce((s,e)=>s+(e.bonus||0),0);g.currentStatus=g.activeEntry?status(g.activeEntry):(g.cooldownEntry?status(g.cooldownEntry):(g.completedEntries.length?'ARCHIVED':'NO HISTORY'));g.nextReopen=g.cooldownEntry?nextReopen(g.cooldownEntry):'';g.confirmedWorked=g.user.filter(x=>!profileMethodFailed((x.note||'')+' '+(x.method||'')));g.confirmedFailed=g.user.filter(x=>profileMethodFailed((x.note||'')+' '+(x.method||'')));g.communityWarnings=g.community.filter(x=>profileMethodFailed((x.result||'')+' '+(x.method||'')));g.communityHelpful=g.community.filter(x=>!profileMethodFailed((x.result||'')+' '+(x.method||'')));g.activeCount=g.entries.filter(e=>e&&e.bank&&!e.closed).length;return g}).sort((a,b)=>{const aPri=a.activeCount?0:(a.cooldownEntry?1:2);const bPri=b.activeCount?0:(b.cooldownEntry?1:2);return aPri-bPri||b.lifetime-a.lifetime||b.completedEntries.length-a.completedEntries.length||a.bank.localeCompare(b.bank)})}
function profileHeadline(group){if(group.activeEntry){const st=status(group.activeEntry);if(st==='WORKING')return 'Currently being worked.';if(st==='SAFE TO CLOSE')return 'Safe to close now.';if(st==='3-DAY BUFFER')return 'Inside close buffer.';if(st==='CUSTOM TIMER')return 'Custom countdown running.'}if(group.cooldownEntry){const st=status(group.cooldownEntry);if(st==='TIME TO CHURN!')return 'Ready to churn again now.';if(st==='WAITING TO CHURN!'){const dl=daysLeft(group.cooldownEntry);return (dl!==null?dl+' days left':'Cooling down')+' until next churn.'}}return group.completedEntries.length?'No active promo right now.':'No tracked history yet.'}
function profileRequirements(group){const src=[group.req||{},group.activeEntry||{},group.cooldownEntry||{}];const pick=(...keys)=>{for(const obj of src){for(const key of keys){const v=obj&&obj[key];if(v!==undefined&&v!==null&&v!=='')return v}}return''};const rows=[];const push=(label,value)=>{if(value!==undefined&&value!==null&&String(value).trim()!=='')rows.push([label,String(value)])};push('Promo code',pick('promoCodeText','promoCode'));push('Monthly fee',pick('monthlyFeeYNText','monthlyFee'));push('Avoid fee',pick('avoidMonthlyFeeText','feeWaiver'));push('How to complete',pick('completeBonusText'));push('Required days',pick('requiredDaysText')||((pick('reqDays')&&Number(pick('reqDays'))>0)?(pick('reqDays')+' days'):''));push('Expiration',pick('expirationDateText','openWindow','openBy'));let eligibility=pick('eligibilityText');if(!eligibility&&group.rule)eligibility=group.rule[1]+' churn rule';push('Eligibility',eligibility);let early=pick('earlyTerminationFeeText');if(!early&&group.rule&&group.rule[5])early=group.rule[5];else if(!early&&pick('earlyCloseFee'))early=fM(parseInt(pick('earlyCloseFee'))||0);push('Early close',early);if(group.rule){push('Rule notes',group.rule[7]||'');push('MO availability',group.rule[4]?'Available in MO':'');}return rows.filter(r=>r[1])}
function profileStatusChip(group){const st=group.currentStatus;if(st==='TIME TO CHURN!')return '<span class="pf-chip red">Ready to churn</span>';if(st==='WAITING TO CHURN!')return '<span class="pf-chip amber">Cooling down</span>';if(st==='SAFE TO CLOSE')return '<span class="pf-chip green">Safe to close</span>';if(st==='3-DAY BUFFER')return '<span class="pf-chip amber">Close buffer</span>';if(st==='CUSTOM TIMER')return '<span class="pf-chip amber">Countdown active</span>';if(st==='WORKING')return '<span class="pf-chip blue">Working</span>';if(st==='ARCHIVED')return '<span class="pf-chip gray">Archived</span>';return '<span class="pf-chip gray">No history</span>'}
function goToBankDatapoints(bankEnc){const bank=decodeURIComponent(bankEnc||'');if(!bank)return;dpExpandedBankKey=bankKey(bank);dpSearch='';tab='tips';R();setTimeout(()=>{const sc=document.querySelector('.scroll');if(sc)sc.scrollTop=0},0)}
function renderProfileDetail(group){
  if(!group)return '<div class="empty"><div class="em">🏦</div><p>Bank profile not found.</p></div>';
  const totalAttempts=group.entries.length;
  const lifetime=fM(group.lifetime||0);
  const churns=group.completedEntries.length;
  const active=group.activeCount;
  const methods=group.confirmedWorked.length;
  const phone=group.phone;
  const reqRows=profileRequirements(group);
  const intelligence=profileIntelligence(group);
  const events=getProfileEventsForBank(group.bank).slice(0,10);
  const typeLabel=group.activeEntry?entryTypeLabel(group.activeEntry.bank):entryTypeLabel(group.bank);
  const phoneText=(phone&&(phone.personal||phone.business))
    ? `${phone.personal?('Personal: '+phone.personal):''}${phone.personal&&phone.business?'\n':''}${phone.business?('Business: '+phone.business):''}`
    : '';
  const phoneCard=(phone&&(phone.personal||phone.business))
    ? `<div class="pf-kv-row"><div class="pf-k">Phone</div><div class="pf-v">${esc(phoneText)}</div></div>`
    : '';
  const nextReopenCard=(group.cooldownEntry&&group.nextReopen)
    ? `<div class="pf-kv-row"><div class="pf-k">Next Reopen</div><div class="pf-v">${esc(fD(group.nextReopen))}</div></div>`
    : '';
  const lastMethodCard=(group.activeEntry&&group.activeEntry.dataPoint)
    ? `<div class="pf-kv-row"><div class="pf-k">Last Saved Method</div><div class="pf-v">${esc(group.activeEntry.dataPoint)}</div></div>`
    : '';
  const callNum=(phone&&(phone.personal||phone.business))
    ? ((group.activeEntry&&findPhone(group.activeEntry.bank,group.activeEntry.id))||(phone.personal||phone.business))
    : '';
  return `
    <div class="pf-shell">
      <div class="pf-topbar">
        <div class="ph-actions" style="margin:0">
          <button class="pf-back" onclick="closeActiveProfile()">← Back to banks</button>
          <button class="ph-mini ph-save" onclick="renameProfileBank('${group.key}','${encodeURIComponent(group.bank)}')">Edit bank name</button>
        </div>
        ${profileStatusChip(group)}
      </div>

      <div class="pf-hero">
        <div class="pf-hero-top">
          ${bankLogo(group.bank)}
          <div class="pf-hero-copy">
            <div class="pf-kicker">Bank profile</div>
            <div class="pf-title">${esc(group.bank)}</div>
            <div class="pf-note">${esc(profileHeadline(group))}</div>
          </div>
          <div class="pf-hero-badge">${lifetime}</div>
        </div>
        <div class="pf-grid">
          <div class="pf-stat"><div class="n">${churns}</div><div class="l">Bonuses</div></div>
          <div class="pf-stat"><div class="n">${active}</div><div class="l">Open entries</div></div>
          <div class="pf-stat"><div class="n">${totalAttempts}</div><div class="l">Tracked attempts</div></div>
          <div class="pf-stat"><div class="n">${methods}</div><div class="l">Confirmed methods</div></div>
        </div>
      </div>

      <div class="pf-sec">
        <div class="pf-sec-h"><div class="pf-sec-t">Bank Intelligence</div></div>
        <div class="pf-kv">
          <div class="pf-kv-row"><div class="pf-k">Best Method</div><div class="pf-v">${esc(intelligence.bestMethod||'No clear winner yet')}</div></div>
          <div class="pf-kv-row"><div class="pf-k">Avg Open → Bonus</div><div class="pf-v">${intelligence.avgToReceive!==null?esc(intelligence.avgToReceive+' days'):'—'}</div></div>
          <div class="pf-kv-row"><div class="pf-k">Avg Bonus → Close</div><div class="pf-v">${intelligence.avgReceiveToClose!==null?esc(intelligence.avgReceiveToClose+' days'):'—'}</div></div>
          <div class="pf-kv-row"><div class="pf-k">Last Churn Rule Used</div><div class="pf-v">${esc(intelligence.lastChurn?({1:'1 Year',2:'2 Years',3:'3 Years',180:'180D'}[intelligence.lastChurn]||intelligence.lastChurn):'—')}</div></div>
          <div class="pf-kv-row"><div class="pf-k">Last Receive Bonus</div><div class="pf-v">${intelligence.lastReceived?.bonusRecd?esc(fD(intelligence.lastReceived.bonusRecd)):'—'}</div></div>
          <div class="pf-kv-row"><div class="pf-k">Last Account Close Date</div><div class="pf-v">${intelligence.lastEntry?.closed?esc(fD(intelligence.lastEntry.closed)):'—'}</div></div>
          <div class="pf-kv-row"><div class="pf-k">Days Remaining To Churn Again</div><div class="pf-v">${intelligence.lastEntry?.closed?esc(String(daysLeft(intelligence.lastEntry)??'—')):'—'}</div></div>
        </div>
      </div>

      <div class="pf-sec">
        <div class="pf-sec-h"><div class="pf-sec-t">Timeline</div></div>
        ${events.length?`<div class="pf-history">${events.map(ev=>`<div class="pf-history-card"><div class="pf-history-top"><div><div class="pf-name">${esc(ev.label||ev.type)}</div><div class="pf-history-id">${esc(ev.entryId)}</div></div><div class="pf-history-bonus">${esc(fD(ev.date))}</div></div><div class="ph-actions"><button class="ph-mini ph-save" onclick="openEdit('${ev.entryId}')">Edit entry</button><button class="ph-mini ph-del" onclick="clearProfileMilestone('${ev.entryId}','${ev.type}')">Clear this</button></div></div>`).join('')}</div>`:'<div class="pf-empty">Timeline will grow automatically as this bank moves through open, req met, received, and close milestones.</div>'}
      </div>

      <div class="pf-sec">
        <div class="pf-sec-h"><div class="pf-sec-t">Overview</div></div>
        <div class="pf-kv">
          <div class="pf-kv-row"><div class="pf-k">Bank Type</div><div class="pf-v">${esc(typeLabel)}</div></div>
          ${nextReopenCard}
          ${lastMethodCard}
          ${phoneCard}
        </div>
        <div class="pf-actions">
          ${group.activeEntry?`<button class="ph-mini ph-save" onclick="openEdit('${group.activeEntry.id}')">Open active entry</button>`:''}
          ${callNum?`<a class="pf-link" href="tel:${esc(callNum)}">Call bank</a>`:''}
          <button class="ph-mini ph-reset" onclick="goToBankDatapoints('${encodeURIComponent(group.bank)}')">Open datapoints</button>
          <button class="ph-mini ph-save" onclick="renameProfileBank('${group.key}','${encodeURIComponent(group.bank)}')">Rename bank</button>
        </div>
      </div>

      <div class="pf-sec">
        <div class="pf-sec-h">
          <div class="pf-sec-t">Methods That Worked</div>
          <div class="ph-actions" style="margin:0"><button class="ph-mini ph-save" onclick="addUserDPForBank('${encodeURIComponent(group.bank)}')">Add confirmed</button></div>
        </div>
        ${group.confirmedWorked.length
          ? `<div class="pf-history">${group.confirmedWorked.map(x=>`<div class="pf-history-card"><div class="pf-history-top"><div><div class="pf-name">${esc(x.method)}</div><div class="pf-history-id">Confirmed user datapoint</div></div><span class="tag b">Worked</span></div><div class="pf-item-note">${esc(x.note||'No notes added yet.')}</div><div class="ph-help" style="margin-top:6px">Last confirmed ${esc(fD(x.lastConfirmedAt||x.updatedAt||x.createdAt))}</div><div class="ph-actions"><button class="ph-mini ph-save" onclick="openUserDPEditor('${x.id}')">Edit</button><button class="ph-mini ph-del" onclick="deleteUserDP('${x.id}')">Remove</button></div></div>`).join('')}</div>`
          : '<div class="pf-empty">No confirmed working methods saved yet.</div>'}
      </div>

      <div class="pf-sec">
        <div class="pf-sec-h"><div class="pf-sec-t">Failed / Caution Methods</div></div>
        ${group.confirmedFailed.length||group.communityWarnings.length
          ? `<div class="pf-history">${group.confirmedFailed.map(x=>`<div class="pf-history-card"><div class="pf-history-top"><div><div class="pf-name">${esc(x.method)}</div><div class="pf-history-id">Your failed datapoint</div></div><span class="tag n">Caution</span></div><div class="pf-item-note">${esc(x.note||'No note saved.')}</div><div class="ph-actions"><button class="ph-mini ph-save" onclick="openUserDPEditor('${x.id}')">Edit</button><button class="ph-mini ph-del" onclick="deleteUserDP('${x.id}')">Remove</button></div></div>`).join('')}${group.communityWarnings.map(x=>`<div class="pf-history-card"><div class="pf-history-top"><div><div class="pf-name">${esc(x.method)}</div><div class="pf-history-id">Community caution</div></div><span class="tag f">Community</span></div><div class="pf-item-note">${esc(x.result||'No note saved.')}</div><div class="ph-actions">${x.link?`<a class="pf-link" href="${x.link}" target="_blank" rel="noopener">Source</a>`:''}<button class="ph-mini ph-save" onclick="openCommunityDPEditor('${x.id}')">Edit</button><button class="ph-mini ph-del" onclick="deleteCommunityDP('${x.id}')">Remove</button></div></div>`).join('')}</div>`
          : '<div class="pf-empty">No failed or caution methods saved yet.</div>'}
      </div>

      <div class="pf-sec">
        <div class="pf-sec-h">
          <div class="pf-sec-t">Saved Requirements</div>
          <div class="ph-actions" style="margin:0"><button class="ph-mini ph-save" onclick="openProfileReqEditor('${encodeURIComponent(group.bank)}')">Edit</button>${reqRows.length?`<button class="ph-mini ph-del" onclick="clearProfileRequirements('${encodeURIComponent(group.bank)}')">Clear</button>`:''}</div>
        </div>
        ${reqRows.length
          ? `<div class="pf-kv">${reqRows.map(([k,v])=>`<div class="pf-kv-row"><div class="pf-k">${esc(k)}</div><div class="pf-v">${esc(v)}</div></div>`).join('')}</div>`
          : '<div class="pf-empty">No saved requirements yet. Analyze terms or update a tracker entry to build this section.</div>'}
      </div>

      <div class="pf-sec">
        <div class="pf-sec-h">
          <div class="pf-sec-t">Community Notes</div>
          <div class="ph-actions" style="margin:0"><button class="ph-mini ph-save" onclick="addCommunityDPForBank('${encodeURIComponent(group.bank)}')">Add community</button></div>
        </div>
        ${group.communityHelpful.length
          ? `<div class="pf-history">${group.communityHelpful.slice(0,12).map(x=>`<div class="pf-history-card"><div class="pf-history-top"><div><div class="pf-name">${esc(x.method)}</div><div class="pf-history-id">Community datapoint</div></div><span class="tag y">Helpful</span></div><div class="pf-item-note">${esc(x.result||'No note saved.')}</div><div class="ph-actions">${x.link?`<a class="pf-link" href="${x.link}" target="_blank" rel="noopener">Source</a>`:''}<button class="ph-mini ph-save" onclick="openCommunityDPEditor('${x.id}')">Edit</button><button class="ph-mini ph-del" onclick="deleteCommunityDP('${x.id}')">Remove</button></div></div>`).join('')}</div>`
          : '<div class="pf-empty">No community notes saved for this bank yet.</div>'}
      </div>

      <div class="pf-sec">
        <div class="pf-sec-h"><div class="pf-sec-t">Close / Reopen History</div></div>
        ${group.entries.length
          ? `<div class="pf-history">${group.entries.map(e=>{const reopen=nextReopen(e);const meta=[];if(e.opened)meta.push('Opened '+fD(e.opened));if(e.bonusRecd)meta.push('Bonus '+fD(e.bonusRecd));if(e.closed)meta.push('Closed '+fD(e.closed));if(reopen)meta.push('Reopen '+fD(reopen));return `<div class="pf-history-card"><div class="pf-history-top"><div><div class="pf-name">${esc(getEntryDisplayId(e)||group.bank)}</div><div class="pf-history-id">${esc(status(e)||'Saved')}</div></div><div class="pf-history-bonus">${(e.bonus||0)?fM(e.bonus):'—'}</div></div><div class="pf-history-meta">${meta.map(m=>`<span class="pf-mini">${esc(m)}</span>`).join('')}</div>${e.dataPoint?`<div class="pf-item-note">Method: ${esc(e.dataPoint)}</div>`:''}${e.notes?`<div class="pf-item-note">${esc(String(e.notes).slice(0,180))}${String(e.notes).length>180?'…':''}</div>`:''}<div class="ph-actions"><button class="ph-mini ph-save" onclick="openEdit('${e.id}')">Edit</button><button class="ph-mini ph-del" onclick="delEntry('${e.id}')">Delete</button></div></div>`}).join('')}</div>`
          : '<div class="pf-empty">No tracker history yet for this bank.</div>'}
      </div>

      <div class="pf-danger">
        <div class="ttl">Danger Zone</div>
        <div class="sub">These controls are intentionally placed at the bottom. Reset keeps community reference data, while delete removes the whole bank group.</div>
        <div class="ph-actions">
          <button class="ph-mini ph-del" onclick="resetBankProfile('${group.key}','${encodeURIComponent(group.bank)}')">Reset Bank</button>
          <button class="ph-mini ph-del" onclick="deleteProfileBank('${group.key}','${encodeURIComponent(group.bank)}')">Delete Bank</button>
        </div>
      </div>
    </div>`;
}
function rProfiles(){
  const groups=buildProfileGroups();
  if(activeProfileKey){
    const group=groups.find(g=>g.key===activeProfileKey);
    return renderProfileDetail(group);
  }
  const q=(profileSearch||'').toLowerCase().trim();
  const filtered=q?groups.filter(g=>g.bank.toLowerCase().includes(q)||g.confirmedWorked.some(x=>(x.method||'').toLowerCase().includes(q))||g.community.some(x=>(x.method||'').toLowerCase().includes(q)||(x.result||'').toLowerCase().includes(q))):groups;
  const totalLifetime=groups.reduce((s,g)=>s+(g.lifetime||0),0);
  let h='<div class="pf-shell">';
  h+='<div class="pf-summary"><div class="ttl">Bank Profiles</div><div class="sub">This replaces the old rules view with a true bank brain. Open one bank to see lifetime earnings, past churns, methods that worked, failed/caution methods, saved requirements, community notes, and close/reopen history.</div></div>';
  h+='<input class="sinput" placeholder="Search bank or method..." value="'+esc(profileSearch)+'" oninput="profileSearch=this.value;R()">';
  h+='<div class="pf-card"><div class="rcard-row"><div class="nm">Coverage</div><div class="ph2">'+filtered.length+' banks</div></div><div class="sub" style="margin-top:4px">'+fM(totalLifetime)+' Lifetime Bonuses across '+groups.reduce((s,g)=>s+g.completedEntries.length,0)+' bonuses.</div></div>';
  if(!filtered.length){
    h+='<div class="empty"><div class="em">🏦</div><p>No bank profiles matched your search.</p></div>';
  }else{
    filtered.forEach(g=>{
      const next=g.cooldownEntry&&g.nextReopen?('Next reopen '+fD(g.nextReopen)):(g.activeEntry?profileHeadline(g):'No active promo');
      h+=`<div class="pf-card clickable" onclick="openBankProfileFromKey('${g.key}')"><div class="pf-head">${bankLogo(g.bank,true)}<div class="pf-info"><div class="pf-name">${esc(g.bank)}</div><div class="pf-sub">${esc(next)}</div><div class="pf-meta">${profileStatusChip(g)}<span class="pf-chip blue">${fM(g.lifetime||0)} Lifetime Bonuses</span><span class="pf-chip green">${g.completedEntries.length} bonuses</span>${g.confirmedWorked.length?`<span class="pf-chip gray">${g.confirmedWorked.length} methods</span>`:''}</div></div><button class="pf-open" onclick="event.stopPropagation();openBankProfileFromKey('${g.key}')">Open</button></div></div>`;
    });
  }
  h+='</div>';
  return h;
}

function isRealDateString(d){if(!d)return true;if(!/^\d{4}-\d{2}-\d{2}$/.test(String(d)))return false;const dt=new Date(d+'T00:00:00');return !isNaN(dt.getTime())&&dt.toISOString().slice(0,10)===d}
function healthAdd(list,severity,title,msg,entryId){list.push({severity,title,msg,entryId})}
function getDataHealthIssues(){
  const issues=[];
  const seenIds={};
  entries.forEach(e=>{if(e&&e.id){const k=String(e.id);if(!seenIds[k])seenIds[k]=[];seenIds[k].push(e)}});
  Object.entries(seenIds).forEach(([id,rows])=>{if(rows.length>1)healthAdd(issues,'red','Duplicate record ID',`${id} is used by ${rows.length} entries: ${rows.map(x=>x.bank).join(', ')}.`,rows[0].id)});
  const activeByBank={};
  entries.forEach(e=>{if(!e||!e.bank)return;const key=entryBankKey(e);if(!e.closed){if(!activeByBank[key])activeByBank[key]=[];activeByBank[key].push(e)}});
  Object.values(activeByBank).forEach(rows=>{if(rows.length>1)healthAdd(issues,'amber','Multiple active entries for same bank',`${rows.map(x=>x.bank).join(', ')} are open at the same time. This may be okay, but review for duplicates.`,rows[0].id)});
  const dateFields=[['opened','Opened'],['closed','Closed'],['bonusRecd','Bonus received'],['reqMet','Requirement met'],['plannedClose','Planned close']];
  entries.forEach(e=>{
    if(!e||!e.bank)return;
    dateFields.forEach(([key,label])=>{const val=e[key];if(val&&!isRealDateString(val))healthAdd(issues,'red','Invalid date',`${e.bank}: ${label} date is not valid (${val}).`,e.id);else if(val&&dB(td(),val)>0)healthAdd(issues,'amber','Future date check',`${e.bank}: ${label} is in the future (${fD(val)}).`,e.id)});
    if(e.opened&&e.closed&&dB(e.opened,e.closed)<0)healthAdd(issues,'red','Closed before opened',`${e.bank}: Closed date is before opened date.`,e.id);
    if(e.opened&&e.bonusRecd&&dB(e.opened,e.bonusRecd)<0)healthAdd(issues,'amber','Bonus received before opened',`${e.bank}: Bonus received date is before opened date.`,e.id);
    if(e.closed&&!e.churn)healthAdd(issues,'red','Missing churn rule',`${e.bank}: Closed entry has no churn rule, so the reopen countdown cannot be trusted.`,e.id);
    if(e.closed&&(e.bonus||0)>0&&!e.bonusRecd)healthAdd(issues,'red','Tax-ready data missing',`${e.bank}: Closed with a bonus amount but missing Bonus Received date.`,e.id);
    if(e.closed&&e.bonusRecd&&!(e.bonus>0))healthAdd(issues,'amber','Closed with $0 bonus',`${e.bank}: Closed and has a received date, but bonus amount is $0.`,e.id);
    if(!e.opened&&!e.closed)healthAdd(issues,'blue','Draft entry',`${e.bank}: Missing opened date. It will stay as a draft until opened date is added.`,e.id);
    if(!e.closed&&!e.bonusRecd&&e.opened&&e.reqDays>0&&daysToDeadline(e)<0)healthAdd(issues,'red','Requirement deadline passed',`${e.bank}: Requirement deadline appears overdue by ${Math.abs(daysToDeadline(e))} day(s).`,e.id);
    if(!e.closed&&e.bonusRecd&&!e.plannedClose&&!(e.minHoldDays>0)&&!e.feeChecked)healthAdd(issues,'amber','Review close timing',`${e.bank}: Bonus received but no planned close date or close-fee timer is set.`,e.id);
    if(!e.closed&&(e.bonus||0)>0&&!e.churn)healthAdd(issues,'amber','Missing churn rule',`${e.bank}: Bonus amount is set but churn rule is blank.`,e.id);
  });
  const rank={red:0,amber:1,blue:2};
  return issues.sort((a,b)=>(rank[a.severity]-rank[b.severity])||(a.title||'').localeCompare(b.title||''));
}
function healthSeverityLabel(s){return s==='red'?'Fix first':s==='amber'?'Review':'Info'}
function openHealthEntry(id){if(!id)return;tab='tracker';search='';expanded=id;R()}
function rHealth(){
  const issues=getDataHealthIssues();
  const red=issues.filter(x=>x.severity==='red').length;
  const amber=issues.filter(x=>x.severity==='amber').length;
  const blue=issues.filter(x=>x.severity==='blue').length;
  let h='<div class="health-shell">';
  h+='<div class="health-card '+(!issues.length?'health-ok':'')+'"><div class="health-top"><div><div class="health-title">'+(!issues.length?'Data Health: Clean':'Data Health Checker')+'</div><div class="health-sub">'+(!issues.length?'No major tracker issues found. Still export a backup before big edits.':'Review these items before tax export, account closing, or restore/import.')+'</div></div><button class="health-btn" onclick="exportBackup()">Backup</button></div></div>';
  h+='<div class="health-counts"><div class="health-stat"><div class="n" style="color:var(--red)">'+red+'</div><div class="l">Fix First</div></div><div class="health-stat"><div class="n" style="color:var(--amber)">'+amber+'</div><div class="l">Review</div></div><div class="health-stat"><div class="n" style="color:var(--accent)">'+blue+'</div><div class="l">Info</div></div></div>';
  if(!issues.length){h+='<div class="health-card health-ok"><div class="health-title">Everything looks good</div><div class="health-sub">Closed bonuses have the required tax fields, churn countdowns have rules, and no duplicate record IDs were detected.</div></div>'}
  else{h+='<div class="health-card"><div class="health-title">Issues Found</div><div class="health-sub">'+issues.length+' item(s) detected.</div></div>';issues.forEach((it,i)=>{h+='<div class="health-issue '+it.severity+'"><div class="health-top"><div><div class="health-issue-title">'+esc(it.title)+'</div><div class="health-issue-msg">'+esc(it.msg)+'</div></div><span class="pf-chip '+(it.severity==='red'?'red':it.severity==='amber'?'amber':'blue')+'">'+healthSeverityLabel(it.severity)+'</span></div>';if(it.entryId)h+='<div class="health-actions"><button class="health-btn" onclick="openHealthEntry(\''+esc(it.entryId)+'\')">Open entry</button></div>';h+='</div>'})}
  h+='</div>';
  return h;
}
function closeSafetyWarnings(e,p){
  const w=[];
  if(!e)w.push('Original tracker entry was not found.');
  if(!p.closeDate)w.push('Close date is blank.');
  if(e?.opened&&p.closeDate&&dB(e.opened,p.closeDate)<0)w.push('Close date is before the opened date.');
  if(e?.bonus&&p.actualBonus===0)w.push('Expected bonus is '+fM(e.bonus)+' but actual bonus is $0.');
  if((p.actualBonus||0)>0&&!e?.bank)w.push('Bank name is missing.');
  if((p.actualBonus||0)>0&&!p.closeDate)w.push('Bonus cannot be tax-ready without a close date.');
  if((p.actualBonus||0)>0&&!e?.bonusRecd)w.push('Bonus received date is blank, so the close date will be used as the received date.');
  if(e&&!e.churn)w.push('Churn rule is blank, so reopen countdown will not be reliable.');
  return w;
}

function R(){const el=document.querySelector('.scroll');if(el)_sp=el.scrollTop;if(tab==='profiles'||tab==='health')tab='tracker';sanitizeAllTimers(false);const sorted=sortE(entries);const wk=sorted.filter(e=>e.bank&&!e.closed).length;const ch=sorted.filter(e=>status(e)==='WAITING TO CHURN!'||status(e)==='TIME TO CHURN!').length;const rd=sorted.filter(e=>status(e)==='TIME TO CHURN!').length;const yr=completedYrTotal(dashYear);const thisYr=new Date().getFullYear();let h='';h+='<div class="hdr"><div class="hdr-shell"><div class="hdr-row"><div><h1><em>Bonus</em>Tracker</h1><div class="hdr-sub">Track • close • churn</div></div><div class="yr-pills">';[thisYr-1,thisYr,thisYr+1].forEach(y=>{h+='<button class="yr-btn'+(dashYear===y?' on':'')+'" onclick="dashYear='+y+';R()">'+y+'</button>'});h+='</div></div>';if(tab==='tracker'){h+='<div class="hero"><div class="hero-copy"><div class="hero-kicker">'+dashYear+' total collected</div><div class="hero-value">'+fM(yr)+'</div><div class="hero-note">'+wk+' open • '+ch+' cooling down • '+rd+' ready right now</div></div><div class="hero-side"><div class="hero-chip">'+rd+' ready</div></div></div>';h+='<div class="stats"><div class="st"><div class="n">'+wk+'</div><div class="l">Open</div></div><div class="st"><div class="n">'+ch+'</div><div class="l">Cooldown</div></div><div class="st"><div class="n">'+rd+'</div><div class="l">Ready</div></div><div class="st"><div class="n">'+fM(yr)+'</div><div class="l">'+dashYear+'</div></div></div>'}h+='</div></div>';h+='<div class="scroll">';if(tab==='tracker')h+=rTracker(sorted);else if(tab==='tax')h+=rTax();else if(tab==='tips')h+=rTips();else if(tab==='phone')h+=rPhone();h+='</div>';if(tab==='tracker')h+='<button class="fab" onclick="openAdd()">+</button>';h+='<div class="tabs">';['tracker','tax','tips','phone'].forEach((t,i)=>{h+='<button class="tb'+(tab===t?' on':'')+'" onclick="tab=\''+t+'\';search=\''+'\';R()">'+[I.grid,I.doc,I.tips,I.phone][i]+'<span>'+['Tracker','Tax','Datapoints','Phone'][i]+'</span></button>'});h+='</div>';if(modal)h+=rModal();if(cfm)h+=rCfm();if(ddPrompt)h+=rDD();if(rcvPrompt)h+=rRcv();if(closePrompt)h+=rClose();if(overwritePrompt)h+=rOverwrite();if(matchPickerPrompt)h+=rMatchPicker();if(feeCheckPrompt)h+=rFeeCheck();if(timerEditModal)h+=rTimerEdit();if(dpEditor)h+=rDpEditor();if(timerChoicePrompt)h+=rTimerChoicePrompt();if(undoState)h+='<div class="undo-bar"><span>Closed '+esc(undoState.bank)+'</span><button onclick="undoClose()">Undo</button></div>';document.getElementById('app').innerHTML=h;const ns=document.querySelector('.scroll');if(ns)ns.scrollTop=_sp;btRunPostRenderHooks()}
function rTracker(sorted){
  const q=search.toLowerCase();
  const f=q?sorted.filter(e=>(e.bank||'').toLowerCase().includes(q)||(e.id||'').toLowerCase().includes(q)):sorted;
  let h='';
  const bkd=daysSinceBk();
  if(bkd>=7) h += `<div class="bk-remind">${bkd>=999?'Backup recommended':'Backup updated '+bkd+'d ago'} <button onclick="exportBackup()">Export</button></div>`;

  h += '<div class="qbar">';
  h += quickBtn('blue',I.backup,'Backup','exportBackup()');
  h += quickBtn('green',I.restore,'Restore','importBackup()');
  h += quickBtn('purple',I.quick,'Quick Add','showTemplates=!showTemplates;R()');
  h += quickBtn('red',I.trash,'Reset','resetAllData()');
  h += '</div>';

  if(showTemplates){
    h += '<div class="sec">Quick add templates</div><div class="tgrid">';
    TEMPLATES.forEach((t,i)=>{
      h += `<button class="tbtn" onclick="addFromTpl(${i})">${bankLogo(t.bank,true)}<div class="t-info"><div class="nm">${esc(t.bank)}</div><div class="bn">${fM(t.bonus)}</div></div></button>`;
    });
    h += '</div>';
  }

  h += `<input class="sinput" type="text" placeholder="Search banks..." value="${esc(search)}" oninput="search=this.value;R()">`;
  h += `<button class="tc-btn" onclick="showAnalyzer=!showAnalyzer;R()">${I.spark}<span>${showAnalyzer?'Hide analyzer':'Analyze promo terms'}</span></button>`;
  if(showAnalyzer) h += rAnalyzer();

  if(!f.length){
    return h + '<div class="empty"><div class="em">No banks yet</div><p>Add your first bank with the + button, use Quick Add for templates, or restore a saved backup.</p></div>';
  }

  h += '<div class="sec">Your banks</div>';

  f.forEach(e=>{
    const s=status(e), isX=expanded===e.id, nr=nextReopen(e), countdown=getCountdown(e), urg=getUrg(e);
    h += `<div class="card u-${urg}">`;
    h += `<div class="card-h" onclick="expanded=expanded==='${e.id}'?null:'${e.id}';R()">`;
    h += `<div class="card-logo-col">${bankLogo(e.bank)}${accountTypeChipHtml(e)}${e.churn?churnTagHtml(e.bank,e.churn):''}</div>`;
    h += `<div class="card-left"><div class="card-name">${esc(e.bank)}</div><div class="card-row">${statusBadgeHtml(e,countdown)}</div></div>`;
    h += '<div class="card-right"><div class="card-right-main">';
    if(!e.closed&&e.bonus) h += `<div class="card-bonus">${fM(e.bonus)}</div>`;
    h += `<div class="card-id">${esc(getEntryDisplayId(e))}</div></div>`;
    h += '</div></div>';

    if(isX){
      h += '<div class="card-exp"><div class="card-grid">';
      if(e.opened) h += `<div class="cf"><div class="k">Opened</div><div class="v">${fD(e.opened)}</div></div>`;
      if(e.closed) h += `<div class="cf"><div class="k">Closed</div><div class="v">${fD(e.closed)}</div></div>`;
      if(e.bonusRecd) h += `<div class="cf"><div class="k">Received</div><div class="v ok">${fD(e.bonusRecd)}</div></div>`;
      if(nr) h += `<div class="cf"><div class="k">Reopen</div><div class="v">${fD(nr)}</div></div>`;
      if(e.reqMet) h += `<div class="cf"><div class="k">Req Met</div><div class="v">${fD(e.reqMet)}</div></div>`;
      if(isCompleted(e)) h += '<div class="cf"><div class="k">Tax</div><div class="v ok">Logged</div></div>';
      if(e.referralBonus) h += `<div class="cf"><div class="k">Referral</div><div class="v"><span class="ref-b">+${fM(e.referralBonus)}</span></div></div>`;
      if(e.minHoldDays>0&&!e.closed){
        const scd=rawSafeDate(e);
        const safeDays=daysUntilSafe(e);
        h += `<div class="cf"><div class="k">Hold Until</div><div class="v${safeDays<=0?' ok':' warn'}">${fD(scd)}</div></div>`;
      }
      if(e.earlyCloseFee>0&&!e.closed){
        h += `<div class="cf"><div class="k">Close Fee</div><div class="v warn">${fM(e.earlyCloseFee)}</div></div>`;
      }
      if(e.minHoldDays>0&&!e.closed){
        const __feeMeta=closeFeeCountdownMeta(e);
        const __feeTitle=safeCloseDate(e)?`Safe close: ${fD(safeCloseDate(e))}`:'Add opened date to calculate';
        h += `<div class="cf"><div class="k">Close Fee Countdown</div><div class="v" style="padding-top:2px"><span class="tm-pill ${__feeMeta.cls}" title="${esc(__feeTitle)}" style="margin-left:6px">${esc(__feeMeta.text)}</span></div></div>`;
      }
      h += '</div>';

      if(!e.closed){
        h += '<div class="sec" style="margin-top:6px">Checklist</div><ul class="ck">';
        if(e.checklist&&e.checklist.length){
          e.checklist.forEach((c,ci)=>{
            h += `<li><div class="ckb${c.done?' dn':''}" onclick="event.stopPropagation();toggleCk('${e.id}',${ci})"></div><span class="ck-text${c.done?' dn':''}">${esc(c.text)}</span><span class="ck-del" onclick="event.stopPropagation();rmCk('${e.id}',${ci})">×</span></li>`;
          });
        }
        h += '</ul><div class="ck-add-shell">';
        h += isInlineOpen(e.id,'checklist')
          ? `<div class="inline-form" onclick="event.stopPropagation()"><div class="ck-add"><input id="ck_${e.id}" placeholder="Add step..." onclick="event.stopPropagation()" onkeydown="if(event.key==='Enter'){event.stopPropagation();addCk('${e.id}')}" /></div><div class="inline-actions"><button class="inline-btn primary" onclick="event.stopPropagation();addCk('${e.id}')">Add</button><button class="inline-btn secondary" onclick="event.stopPropagation();clearInlineInputs('${e.id}','checklist')">Reset</button><button class="inline-btn ghost" onclick="event.stopPropagation();toggleInlineForm('${e.id}','checklist',false)">Cancel</button></div></div>`
          : `<button class="inline-trigger" onclick="event.stopPropagation();toggleInlineForm('${e.id}','checklist',true)">+ Add checklist step</button>`;
        h += '</div>';
        h += '<div class="sec" style="margin-top:8px">Mini Countdown Timers</div><ul class="tm">';
        const __timers=sortCustomTimers(normalizeTimerList(e.customTimers||[]).filter(t=>!isDeletedTimer(e,t)));
        const __timerEditId=inlineStateFor(e.id).timerEdit||'';
        const __editTimer=__timers.find(t=>t.id===__timerEditId)||null;
        if(__timers.length){
          __timers.forEach((t)=>{const meta=timerCountdownMeta(t);h += `<li><div class="ckb${t.done?' dn':''}" onclick="toggleTimer('${e.id}','${t.id||''}')"></div><div class="tm-main"><div class="tm-title${t.done?' dn':''}">${esc(t.text||'Timer')}</div><div class="tm-sub">${timerMetaLine(t)}</div></div><span class="tm-pill ${meta.cls}">${esc(meta.text)}</span><button type="button" class="tm-edit-btn" onclick="event.stopPropagation();openTimerEditor('${e.id}','${t.id||''}')">Edit</button><span class="ck-del" onclick="event.stopPropagation();rmTimer('${e.id}','${t.id||''}')">×</span></li>`;});
        }else{
          h += '<li><div class="tm-main"><div class="tm-sub">Add a custom due date for bank-specific requirements.</div></div></li>';
        }
        h += '</ul><div class="tm-add-shell">';
        const __timerKind=inlineStateFor(e.id).timerKind==='days'?'days':'due';
        const __timerKindLabel=__timerKind==='days'?'Start Date + Days Timer':'Due Date Timer';
        const __timerHelp=__timerKind==='days'?'Use this when the bank says “hold for 60 days” or “complete within 90 days.”':'Use this when you already know the exact deadline date.';
        h += isInlineOpen(e.id,'timer')
          ? `<div class="inline-form"><div class="tc-label timer-kind-label" style="margin-bottom:8px">${__timerKindLabel}</div><div class="tm-add" style="${__timerKind==='due'?'grid-template-columns:minmax(0,1fr) minmax(0,.75fr)':''}"><input id="tm_txt_${e.id}" placeholder="${__timerKind==='days'?'e.g. 60-day hold ends':'e.g. Last day to deposit'}"><input id="tm_start_${e.id}" type="date" title="${__timerKind==='days'?'Start date':'Due date'}"><input id="tm_days_${e.id}" type="${__timerKind==='days'?'number':'hidden'}" inputmode="numeric" min="1" placeholder="Days" onkeydown="if(event.key==='Enter'){upsertTimer('${e.id}')}"></div><div class="tm-sub timer-kind-help" style="margin-top:6px">${__timerHelp}</div><div class="inline-actions"><button class="inline-btn primary" onclick="upsertTimer('${e.id}')">Add timer</button><button class="inline-btn secondary" onclick="clearInlineInputs('${e.id}','timer')">Reset</button><button class="inline-btn ghost" onclick="toggleInlineForm('${e.id}','timer',false)">Cancel</button></div></div>`
          : `<button class="inline-trigger" onclick="toggleInlineForm('${e.id}','timer',true)">+ Add mini timer</button>`;
        h += '</div>';
      }

      if(e.notes) h += `<div class="card-notes" style="white-space:pre-wrap;font-size:12px;line-height:1.6">${esc(e.notes)}</div>`;
      if(e.analyzedTC) h += `<div class="tc-box"><div class="tc-label">T&amp;C analysis</div><div class="tc-body">${highlightTC(e.analyzedTC)}</div></div>`;
      h += '';

      h += '<div class="card-btns">';
      h += actionBtn('edit',I.edit,'Edit',`event.stopPropagation();openEdit('${e.id}')`);
      if(!e.closed) h += actionBtn('rcv',I.gift,(e.bonusRecd?'Update Received':'Received'),`event.stopPropagation();openRcv('${e.id}')`);
      if(!e.closed) h += actionBtn('cls',I.lock,'Close',`event.stopPropagation();closeAcct('${e.id}')`);
      h += actionBtn('del',I.trash,'Delete',`event.stopPropagation();delEntry('${e.id}')`);
      h += '</div></div>';
    }

    h += '</div>';
  });

  const attentionSug=getAttentionSuggestions();
  const churnSug=getChurnSuggestions();
  if(attentionSug.length||churnSug.length){
    h += '<div class="sec">Suggested next</div>';
    h += '<div class="sug-split">';
    h += '<div class="sug-panel"><div class="sug-panel-h">Needs attention • '+attentionSug.length+' item'+(attentionSug.length!==1?'s':'')+'</div>'+(attentionSug.length?attentionSug.map(s=>`<div class="sug-c">${bankLogo(s.bank,true)}<div class="s-info"><div class="nm">${esc(s.bank)}</div>${s.showBonus&&s.bonus?`<div class="sub">${fM(s.bonus)}</div>`:''}<div class="rsn">${esc(s.rsn)}</div></div></div>`).join(''):'<div class="sug-empty">No urgent items.</div>')+'</div>';
    h += '<div class="sug-panel"><div class="sug-panel-h">Least days to churn</div>'+(churnSug.length?churnSug.map(s=>`<div class="sug-c">${bankLogo(s.bank,true)}<div class="s-info"><div class="nm">${esc(s.bank)}</div>${s.showBonus&&s.bonus?`<div class="sub">${fM(s.bonus)}</div>`:''}<div class="rsn">${esc(s.rsn)}</div></div></div>`).join(''):'<div class="sug-empty">Nothing cooling down yet.</div>')+'</div>';
    h += '</div>';
  }

  return h;
}
function rTax(){const yrs=[];for(let y=2025;y<=2040;y++)yrs.push(y);const yrE=taxEntriesForYear(taxYear);const yrA=yrE.reduce((s,e)=>s+(e.bonus||0),0);const allA=entries.filter(e=>taxReady(e)).reduce((s,e)=>s+(e.bonus||0),0);let h='<div class="sec">Tax Year</div><div class="ybar">';yrs.forEach(y=>{const a=completedYrTotal(y);h+='<button class="ypill'+(taxYear===y?' on':'')+'" onclick="taxYear='+y+';R()">'+y+(a?' · '+fM(a):'')+'</button>'});h+='</div><div class="ytotal">'+fM(yrA)+'</div><div class="ysub">'+taxYear+' — '+yrE.length+' completed bonus'+(yrE.length!==1?'es':'')+' (received + closed)</div>';h+='<button class="export-btn" onclick="promptExportYear()">Export a Year CSV</button>';if(!yrE.length)return h+'<div class="empty"><div class="em">📋</div><p>No completed bonuses in '+taxYear+'</p></div>';yrE.forEach(e=>{h+='<div class="tax-c"><div class="tax-top"><div class="tax-bank">'+bankLogo(e.bank,true)+' '+esc(e.bank)+'</div><div class="tax-amt">'+fM(e.bonus)+'</div></div><div class="tax-dates">'+(e.opened?'<span>Open: '+fD(e.opened)+'</span>':'')+'<span>Received: '+fD(e.bonusRecd)+'</span><span>Closed: '+fD(e.closed)+'</span></div></div>'});h+='<div class="sec" style="margin-top:16px">All-Time</div><div class="ytotal">'+fM(allA)+'</div>';return h}
function rTips(){
  const groups=buildDatapointGroups();
  const userCount=loadUserDatapoints().length;
  const communityCount=getCommunityDatapoints().length;
  let h='';
  h+='<div class="dp-shell">';
  h+='<div class="dp-summary"><div class="ttl">Structured Datapoints Database</div><div class="sub">Tap a bank to open its datapoints. Confirmed datapoints stay compact until you tap <strong>Edit</strong>, which helps prevent accidental changes. Community datapoints can now also be edited or removed when needed.</div></div>';
  h+='<input class="sinput dp-search" placeholder="Search bank, method, or note..." value="'+esc(dpSearch)+'" oninput="dpSearch=this.value;R()">';
  h+='<div class="rcard"><div class="rcard-row"><div class="nm">Coverage</div><div class="ph2">'+groups.length+' banks</div></div><div class="sub" style="margin-top:4px">'+userCount+' confirmed user datapoints · '+communityCount+' community datapoints</div></div>';
  if(!groups.length){
    h+='<div class="empty"><div class="em">🗂️</div><p>No datapoints matched your search.</p></div>';
  }else{
    groups.forEach(g=>{
      const open=dpExpandedBankKey===g.key;
      h+='<div class="dp-bank">';
      h+='<div class="dp-head" onclick="toggleDPBank(\''+g.key+'\')">';
      h+=bankLogo(g.bank,true);
      h+='<div class="dp-info"><div class="dp-name">'+esc(g.bank)+'</div><div class="dp-meta"><span class="dp-count user">'+g.user.length+' confirmed</span><span class="dp-count community">'+g.community.length+' community</span></div></div>';
      h+='<div class="dp-arrow">'+(open?'−':'＋')+'</div></div>';
      if(open){
        h+='<div class="dp-body">';
        h+='<div class="ph-actions" style="justify-content:flex-end;margin:2px 0 8px"><button class="ph-mini ph-del" onclick="event.stopPropagation();deleteDPBankGroup(\''+g.key+'\',\''+encodeURIComponent(g.bank)+'\')">Delete bank</button></div>';
        h+='<div class="dp-block"><div class="dp-block-h"><div class="dp-block-t">Confirmed User Datapoints</div><button class="dp-add" onclick="event.stopPropagation();addUserDPForBank(\''+encodeURIComponent(g.bank)+'\')">+ Add confirmed</button></div>';
        if(g.user.length){
          g.user.forEach(item=>{
            h+='<div class="dp-ref"><div class="dp-ref-top"><div><div class="dp-ref-title">'+esc(item.method)+'</div><div class="dp-ref-sub">'+esc(item.note||'No notes added yet.')+'</div><div class="ph-help" style="margin-top:6px">Last confirmed '+esc(fD(item.lastConfirmedAt||item.updatedAt||item.createdAt))+(item.entryId?' · linked to tracker history':'')+'</div></div><span class="tag b">Confirmed</span></div><div class="ph-actions"><button class="ph-mini ph-save" onclick="openUserDPEditor(\''+item.id+'\')">Edit</button><button class="ph-mini ph-del" onclick="deleteUserDP(\''+item.id+'\')">Remove</button></div></div>';
          });
        }else{
          h+='<div class="dp-empty">No confirmed user datapoints saved for this bank yet.</div>';
        }
        h+='</div>';
        h+='<div class="dp-block"><div class="dp-block-h"><div class="dp-block-t">Community Datapoints</div><button class="dp-add" onclick="event.stopPropagation();addCommunityDPForBank(\''+encodeURIComponent(g.bank)+'\')">+ Add community</button></div>';
        if(g.community.length){
          g.community.forEach(item=>{
            h+='<div class="dp-ref"><div class="dp-ref-top"><div><div class="dp-ref-title">'+esc(item.method)+'</div><div class="dp-ref-sub">'+esc(item.result||'No community note saved.')+'</div></div><span class="tag '+(((item.result||'').toLowerCase().includes('work')||(item.result||'').toLowerCase().includes('safe'))?'y':'f')+'">Community</span></div>'+(item.link?'<a class="dp-link" href="'+item.link+'" target="_blank" rel="noopener">Open source</a>':'<div class="ph-help" style="margin-top:6px">No source link saved</div>')+'<div class="ph-actions"><button class="ph-mini ph-save" onclick="openCommunityDPEditor(\''+item.id+'\')">Edit</button><button class="ph-mini ph-del" onclick="deleteCommunityDP(\''+item.id+'\')">Remove</button></div></div>';
          });
        }else{
          h+='<div class="dp-empty">No community datapoints saved for this bank yet.</div>';
        }
        h+='</div>';
        h+='</div>';
      }
      h+='</div>';
    });
  }
  h+='<div class="sec">📚 Resources</div>';
  DOC_LINKS.forEach(([t,u])=>{h+='<a href="'+u+'" target="_blank" rel="noopener" class="feed-c"><div class="feed-t">🔗 '+esc(t)+'</div></a>'});
  h+='</div>';
  return h;
}
function rPhone(){const rows=getPhoneBook();const q=(phoneSearch||'').toLowerCase().trim();const filtered=q?rows.filter(r=>r.bank.toLowerCase().includes(q)||r.personal.toLowerCase().includes(q)||r.business.toLowerCase().includes(q)):rows;let h='<div class="sec">Customer Service Numbers</div>';h+='<input class="sinput" placeholder="Search banks or phone numbers..." value="'+esc(phoneSearch||'')+'" oninput="phoneSearch=this.value;R()" id="phs">';h+='<button class="tc-btn" style="height:auto;padding:14px 16px;margin-bottom:10px" onclick="showPhoneAdd=!showPhoneAdd;R()">'+I.phone+'<span>'+(showPhoneAdd?'Hide add bank form':'Add new bank phone')+'</span></button>';if(showPhoneAdd){h+='<div class="ph-add-card"><div class="ph-top"><div><div class="nm">Add Bank</div><div class="ph-help">Create a phone entry manually with separate personal and business numbers.</div></div></div><div class="fg" style="margin-bottom:8px"><label>Bank Name</label><input id="ph_new_bank" class="ph-field" placeholder="e.g. Guaranty Bank"></div><div class="ph-edit-grid"><div><span class="ph-label">Personal</span><input id="ph_new_personal" class="ph-field" placeholder="1-800-000-0000"></div><div><span class="ph-label">Business</span><input id="ph_new_business" class="ph-field" placeholder="1-800-000-0000"></div></div><div class="ph-actions"><button class="ph-mini ph-save" onclick="addPhoneTabRow()">Save</button><button class="ph-mini ph-reset" onclick="showPhoneAdd=false;R()">Cancel</button></div></div>'}if(!filtered.length)return h+'<div class="empty"><div class="em">📞</div><p>No phone entries found.</p></div>';filtered.forEach((row,idx)=>{const bankEnc=encodeURIComponent(row.bank);const isCustom=!!row.custom&&!hasDefaultPhone(row.bank);h+='<div class="ph-card">'+bankLogo(row.bank,false)+'<div style="flex:1"><div class="ph-top"><div><div class="nm">'+esc(row.bank)+'</div><div class="ph-help">Edit and save personal/business numbers from this tab.</div></div>'+(isCustom?'<span class="tag b">Custom</span>':'')+'</div><div class="ph-edit-grid"><div><span class="ph-label">Personal</span><input id="ph_p_'+idx+'" class="ph-field" value="'+esc(row.personal||'')+'" placeholder="No personal number"></div><div><span class="ph-label">Business</span><input id="ph_b_'+idx+'" class="ph-field" value="'+esc(row.business||'')+'" placeholder="No business number"></div></div><div class="ph-actions"><button class="ph-mini ph-save" onclick="savePhoneTabRow(\''+bankEnc+'\','+idx+','+(isCustom?'true':'false')+')">Save</button>'+(hasDefaultPhone(row.bank)?'<button class="ph-mini ph-reset" onclick="resetPhoneTabRow(\''+bankEnc+'\')">Reset</button>':'<button class="ph-mini ph-del" onclick="deletePhoneTabRow(\''+bankEnc+'\')">Delete</button>')+(row.personal?'<a href="tel:'+esc(row.personal)+'" class="ph-mini ph-reset" style="text-decoration:none;display:inline-flex;align-items:center;justify-content:center">Call Personal</a>':'')+(row.business?'<a href="tel:'+esc(row.business)+'" class="ph-mini ph-reset" style="text-decoration:none;display:inline-flex;align-items:center;justify-content:center">Call Business</a>':'')+'</div></div></div>'});return h}
function rRules(){let h='<div class="sec">Churn Rules \u2014 MO + Nationwide</div><input class="sinput" placeholder="Search..." oninput="this.dataset.q=this.value;R()" id="rs">';const q=(document.getElementById('rs')||{}).value||'';const fl=q?RULES.filter(r=>r[0].toLowerCase().includes(q.toLowerCase())):RULES;h+='<div class="rcard" style="margin-bottom:8px"><div class="nm">Tracker Bonus Display Rule</div><div class="sub" style="margin-top:4px">On the Tracker tab, the $ bonus amount shows only when a bank has a saved bonus amount and the status is Working or Countdown Active.</div></div>';fl.forEach(([bank,rule,mo,churnable,moAvail,closeFee,maint,notes])=>{h+='<div class="rcard" style="display:flex;align-items:flex-start;gap:10px">'+bankLogo(bank,false)+'<div style="flex:1"><div class="rcard-row"><div class="nm">'+esc(bank)+'</div><div style="text-align:right"><div class="ph">'+esc(rule)+'</div><div class="ph2">'+mo+'mo</div></div></div><div style="margin-top:3px;display:flex;flex-wrap:wrap;gap:2px">';h+=churnable?'<span class="tag y">\u2705 Churnable</span>':'<span class="tag n">\u274C Not Churnable</span>';if(moAvail)h+='<span class="tag m">\uD83D\uDCCD MO</span>';if(closeFee&&closeFee!=='None')h+='<span class="tag f">\u26A0 '+esc(closeFee)+'</span>';h+='<span class="tag '+(maint.includes('$0')||maint.includes('free')?'b':'f')+'">'+esc(maint)+'</span>';h+='</div>';if(notes)h+='<div class="sub">'+esc(notes)+'</div>';h+='</div></div>'});return h}
function rClose(){if(!closePrompt)return'';const p=closePrompt;let h='<div class="cbg" onclick="cancelClose()"><div class="close-modal" onclick="event.stopPropagation()">';if(p.step==='date'){h+='<h3>\uD83D\uDD12 Close '+esc(p.bank)+'</h3><div class="sub">When did you close (or plan to close) this account?</div>';h+='<label>Close Date</label><input type="date" id="cp_date" value="'+p.closeDate+'">';h+='<div style="display:flex;gap:6px;margin-top:12px"><button class="c-c" onclick="cancelClose()">Cancel</button><button class="c-g" onclick="closeNext()">Next \u2192</button></div>'}else if(p.step==='bonus'){h+='<h3>\uD83D\uDCB0 Did you get the full bonus?</h3><div class="sub">'+esc(p.bank)+' \u2014 expected '+fM(p.bonus)+'</div>';h+='<div class="bonus-row"><button class="bonus-opt'+(p.gotFull?' sel':'')+'" onclick="closePrompt.gotFull=true;closePrompt.actualBonus=closePrompt.bonus;R()">Yes \u2014 '+fM(p.bonus)+'</button><button class="bonus-opt'+(!p.gotFull?' sel':'')+'" onclick="closePrompt.gotFull=false;R()">No \u2014 partial/none</button></div>';if(!p.gotFull){h+='<label>How much did you actually get?</label><input type="number" inputmode="numeric" id="cp_amt" value="'+(p.actualBonus||0)+'" placeholder="0">'}h+='<div style="display:flex;gap:6px;margin-top:12px"><button class="c-c" onclick="closeBack()">Back</button><button class="c-g" onclick="closeNext()">Next \u2192</button></div>'}else if(p.step==='dp'){h+='<h3>\uD83D\uDCCB What triggered the bonus?</h3><div class="sub">What DD method or action triggered '+esc(p.bank)+'\'s bonus? (Optional)</div>';h+='<div class="dd-chips" style="margin-bottom:8px">';['Employer DD','Robinhood ACH','Fidelity ACH','Schwab ACH','Venmo DD','Melio Bill Pay','No DD needed','Debit only'].forEach(m=>{h+='<button class="dd-chip" onclick="document.getElementById(\'cp_dp\').value=\''+m+'\'">'+m+'</button>'});h+='</div><input id="cp_dp" value="'+esc(p.dp)+'" placeholder="e.g. $1,000 DD via Robinhood ACH" onclick="event.stopPropagation()">';h+='<div style="display:flex;gap:6px;margin-top:12px"><button class="c-c" onclick="closeBack()">Back</button><button class="c-c" onclick="cancelClose()">Cancel</button><button class="c-g" onclick="closeNext()">\u2705 Close Account</button></div>'}h+='</div></div>';return h}
function rFeeCheck(){if(!feeCheckPrompt)return'';const p=feeCheckPrompt;const e=entries.find(x=>x.id===p.entryId);const hasTimer=!!(e&&e.minHoldDays>0&&!e.feeChecked);let h='<div class="cbg" onclick="feeCheckCancel()"><div class="fee-box" onclick="event.stopPropagation()">';if(p.step==='ask'){h+='<h3>🛡️ Early Closure Fee?</h3>';h+='<div class="sub">Does <strong>'+esc(p.bank)+'</strong> charge a fee for closing the account early?</div>';if(hasTimer){const dsc=daysUntilSafe(e);h+='<div style="padding:8px 10px;background:#FEF3C7;border-radius:8px;margin-bottom:10px;font-size:11px;color:#92400E;font-weight:600">⏰ Current hold: '+(dsc>0?dsc+'d remaining • '+fM(e.earlyCloseFee)+' fee':'✅ Hold period expired')+'</div>'}h+='<div class="fee-choice">';h+='<button class="fee-yes" onclick="feeCheckPrompt.step=\'months\';R()">⚠️ Yes, set timer</button>';h+='<button class="fee-no" onclick="feeCheckSkip()">✅ No fee / Close now</button>';h+='</div>';if(hasTimer){h+='<button class="btn-s" onclick="feeCheckRemoveTimer()">Remove current timer only</button>';h+='<div style="font-size:10px;color:var(--muted);text-align:center;margin-top:6px">This keeps the bank open and clears the early-close hold.</div>'}else{h+='<div style="font-size:10px;color:var(--muted);text-align:center">"Close now" clears any hold period and proceeds to close</div>'}}else if(p.step==='months'){h+='<h3>⏰ How long to wait?</h3>';h+='<div class="sub">How many months from account opening must you wait to avoid the fee?</div>';h+='<div class="fee-months-grid">';[3,6,9,12,18,24].forEach(m=>{const rawDate=e&&e.opened?addM(e.opened,m):'';const safeDate=rawDate?addD(rawDate,BUFFER_DAYS):'';const daysAway=safeDate?Math.max(0,dB(td(),safeDate)):0;h+='<button class="fee-mo-btn'+(p.months===m?' sel':'')+'" onclick="feeCheckPrompt.months='+m+';R()">'+m+' mo';if(safeDate&&e.opened)h+='<span class="sm">'+daysAway+'d left</span>';h+='</button>'});h+='</div>';h+='<div style="display:flex;gap:6px;margin-top:8px;align-items:center"><span style="font-size:12px;color:var(--sub);font-weight:600;white-space:nowrap">Custom:</span><input type="number" inputmode="numeric" id="fcp_custom" value="'+(p.months||'')+'" placeholder="months" style="flex:1;padding:10px 12px;border:1.5px solid var(--border);border-radius:10px;font-family:inherit;font-size:14px;background:var(--bg);outline:none" onchange="feeCheckPrompt.months=parseInt(this.value)||6;R()"><span style="font-size:12px;color:var(--sub);font-weight:600">months</span></div>';h+='<div style="display:flex;gap:6px;margin-top:10px;align-items:center"><label style="font-size:11px;font-weight:600;color:var(--sub);white-space:nowrap">Fee amount $</label><input type="number" inputmode="numeric" id="fcp_fee" value="'+(p.feeAmount||'')+'" placeholder="e.g. 25" style="flex:1;padding:10px 12px;border:1.5px solid var(--border);border-radius:10px;font-family:inherit;font-size:14px;background:var(--bg);outline:none" onchange="feeCheckPrompt.feeAmount=parseInt(this.value)||0"></div>';if(e&&e.opened&&p.months>0){const rawDate=addM(e.opened,p.months);const safeDate=addD(rawDate,BUFFER_DAYS);const daysAway=Math.max(0,dB(td(),safeDate));h+='<div class="fee-preview"><div class="fp-date">📅 Safe to close: '+fD(safeDate)+'</div><div class="fp-days">'+(daysAway>0?daysAway+' days (incl. 3d buffer)':'✅ Already past!')+'</div></div>'}else if(!e||!e.opened){h+='<div class="fee-preview"><div class="fp-date" style="color:var(--red)">⚠️ No open date set</div><div class="fp-days">Timer starts when you add an open date</div></div>'}h+='<div style="display:flex;gap:6px;margin-top:10px">';h+='<button class="c-c" onclick="feeCheckPrompt.step=\'ask\';R()">Back</button>';h+='<button class="c-g" onclick="feeCheckSave()">⏰ Set Timer</button>';h+='</div>';if(hasTimer)h+='<button class="btn-s" onclick="feeCheckRemoveTimer()">Remove current timer only</button>'}h+='</div></div>';return h}
function rModal(){const e=modal;const oi=k=>' oninput="modal[\''+k+'\']=this.value" ';const on=k=>' oninput="modal[\''+k+'\']=parseInt(this.value)||0" ';let h='<div class="ov" onclick="closeModal()"><div class="modal" onclick="event.stopPropagation()">';h+='<div class="m-bar"></div><div class="m-hdr"><h2>'+(e._edit?'Edit':'New')+' Entry</h2>'+(e._edit?'<span class="m-id">'+esc(e.id||'')+'</span>':'')+'</div>';h+='<div class="fg"><label>Bank Name *</label><input value="'+esc(e.bank||'')+'" oninput="modal.bank=this.value;if(!modal.accountType)syncModalAccountTypeFromBank();R()" onblur="applyModalBankMemory()" placeholder="e.g. Chase"></div>';h+='<div class="fg"><label>Account Type</label><select onchange="modal.accountType=this.value"><option value="personal"'+((normalizeAccountType(e.accountType)||inferAccountTypeForEntry(e))==='personal'?' selected':'')+'>Personal</option><option value="business"'+((normalizeAccountType(e.accountType)||inferAccountTypeForEntry(e))==='business'?' selected':'')+'>Business</option></select></div>';h+='<div class="m-sec">Bonus</div>';h+='<div class="frow"><div class="fg"><label>Amount $</label><input type="number" inputmode="numeric" value="'+(e.bonus||'')+'"'+on('bonus')+'placeholder="300"></div>';h+='<div class="fg"><label>Churn Rule</label><select onchange="modal.churn=this.value"><option value="">Select</option><option value="1"'+(e.churn==='1'?' selected':'')+'>1 Year</option><option value="2"'+(e.churn==='2'?' selected':'')+'>2 Years</option><option value="3"'+(e.churn==='3'?' selected':'')+'>3 Years</option><option value="180"'+(e.churn==='180'?' selected':'')+'>180 Days</option></select></div></div>';h+='<div class="m-sec">Simple Terms Auto-Fill</div>';h+='<div class="frow"><div class="fg"><label>Monthly Fee (Yes / No)</label><input value="'+esc(e.monthlyFeeYNText||'')+'" oninput="modal.monthlyFeeYNText=this.value" placeholder="Yes or No"></div><div class="fg"><label>Promo Code</label><input value="'+esc(e.promoCodeText||'')+'" oninput="modal.promoCodeText=this.value" placeholder="leave blank if missing"></div></div>';h+='<div class="frow"><div class="fg"><label>Known DD / Data Point</label><input value="'+esc(e.dataPoint||'')+'" oninput="modal.dataPoint=this.value" placeholder="e.g. Employer DD, ACH, payroll"></div><div class="fg"><label>Promo Expiration / Open By</label><input value="'+esc(e.expirationDateText||'')+'" oninput="modal.expirationDateText=this.value" placeholder="leave blank if missing"></div></div>';h+='<div class="frow"><div class="fg"><label>Funding Deadline Days</label><input type="number" inputmode="numeric" min="0" value="'+esc(String(e.fundedDays||''))+'" oninput="modal.fundedDays=parseInt(this.value)||0" placeholder="e.g. 30"></div><div class="fg"><label>Funding Amount / Target Tier</label><input value="'+esc(e.fundingAmountText||(e.fundingAmount?fM(e.fundingAmount):''))+'" oninput="modal.fundingAmountText=this.value;modal.fundingAmount=parseCloseFeeAmount(this.value)" placeholder="e.g. $2,000 for $500 tier"></div></div>';h+='<div class="fg"><label>Payout Timing</label><input value="'+esc(e.payoutTimingText||'')+'" oninput="modal.payoutTimingText=this.value" placeholder="e.g. within 15 days after requirements are met"></div>';h+='<div class="fg"><label>How to Avoid the Monthly Fee</label><input value="'+esc(e.avoidMonthlyFeeText||'')+'" oninput="modal.avoidMonthlyFeeText=this.value" placeholder="leave blank if missing"></div>';h+='<div class="fg"><label>How to Complete the Bonus</label><textarea rows="3" oninput="modal.completeBonusText=this.value" placeholder="leave blank if missing">'+esc(e.completeBonusText||'')+'</textarea></div>';h+='<div class="frow"><div class="fg"><label>Early Close Fee Amount</label><input value="'+esc(e.earlyTerminationFeeText||'')+'" oninput="modal.earlyTerminationFeeText=this.value;modal.earlyCloseFee=parseCloseFeeAmount(this.value)" placeholder="number only, e.g. 25 or None"></div><div class="fg"><label>Close Fee Days After Opened</label><input type="number" inputmode="numeric" min="0" value="'+esc(String(e.closeFeeCountdownDays??''))+'" oninput="modal.closeFeeCountdownDays=this.value;modal.minHoldDays=parseInt(this.value)||0;modal.feeChecked=false" placeholder="e.g. 180 from opened date"></div></div>';h+='<div class="fg"><label>Eligibility / Churn</label><textarea rows="2" oninput="modal.eligibilityText=this.value" placeholder="leave blank if missing">'+esc(e.eligibilityText||'')+'</textarea></div>';h+='<div class="fg"><label>How Many Days Required to Complete the Bonus?</label><input value="'+esc(e.requiredDaysText||(e.reqDays>0?String(e.reqDays):''))+'" oninput="modal.requiredDaysText=this.value;modal.reqDays=parseRequirementDaysText(this.value)" placeholder="e.g. 90"></div>';h+='<div class="m-sec">Dates</div>';const df=(lbl,id,k,v)=>'<div class="fg"><label>'+lbl+'</label><div class="date-wrap"><input type="date" value="'+(v||'')+'"'+oi(k)+'><button class="date-clr" type="button" onclick="modal.'+k+'=\'\';this.previousElementSibling.value=\'\'">\u2715</button></div></div>';h+='<div class="frow">'+df('Opened','fo','opened',e.opened)+df('Closed','fc','closed',e.closed)+'</div>';h+='<div class="frow">'+df('Bonus Received','fb','bonusRecd',e.bonusRecd)+df('Req Met','fr','reqMet',e.reqMet)+'</div>';h+='<div class="m-sec">Your Notes</div>';h+='<div style="font-size:10px;color:var(--muted);margin-bottom:3px">Your personal notes — never overwritten by analyzer</div>';h+='<div class="fg"><textarea rows="3" style="font-size:13px;line-height:1.5;min-height:60px"'+oi('notes')+'placeholder="Your personal notes, tips, reminders...">'+esc(e.notes||'')+'</textarea></div>';if(modal.analyzedTC){h+='<div class="m-sec">Analyzed T&C Summary</div>';h+='<div style="font-size:10px;color:var(--muted);margin-bottom:3px">Auto-generated from T&C analyzer — re-analyze to update</div>';h+='<div class="fg"><textarea rows="6" style="font-size:12px;line-height:1.6;min-height:120px;background:#F8FAFC;border:1.5px solid #E2E8F0" oninput="modal.analyzedTC=this.value" placeholder="Analyzed T&C will appear here...">'+esc(modal.analyzedTC)+'</textarea></div>'}h+='<button type="button" class="tc-btn" onclick="showInlineAZ=!showInlineAZ;R()">\uD83E\uDDE0 '+(showInlineAZ?'Hide T&C Analyzer':'Paste T&C to Auto-fill')+'</button>';if(showInlineAZ){h+='<div class="az-area"><textarea id="inline_tc" placeholder="Paste T&C here..."></textarea><button class="az-go" onclick="event.preventDefault();runInlineAnalyze()">Analyze & Auto-fill</button>'+(inlineResult?'<div style="margin-top:4px;font-size:10px;color:var(--green);font-weight:600">\u2705 Auto-filled!</div>':'')+'</div>'}h+='<button type="button" class="btn-p" onclick="saveEntryFromButton(this,event)">\uD83D\uDCBE '+(e._edit?'Save Changes':'Add Entry')+'</button>';h+='<button class="btn-s" onclick="closeModal()">Cancel</button>';if(e._edit)h+='<button class="btn-d" onclick="clearFields()">Clear All Fields</button>';h+='</div></div>';return h}
function rCfm(){return'<div class="cbg" onclick="cfm=null;R()"><div class="cbox" onclick="event.stopPropagation()"><h3>'+cfm.title+'</h3><p>'+cfm.msg+'</p><div class="crow"><button class="c-c" onclick="cfm=null;R()">Cancel</button><button class="'+(cfm.green?'c-g':'c-r')+'" onclick="cfm.action()">'+(cfm.green?'Confirm':'Delete')+'</button></div></div></div>'}
function rDD(){const p=ddPrompt;const common=['Employer DD','Robinhood ACH','Fidelity ACH','Schwab ACH','Venmo DD','PayPal DD','Melio Bill Pay','Cash App DD','No DD Required','Debit Card Only'];let h='<div class="cbg" onclick="skipDD()"><div class="dd-box" onclick="event.stopPropagation()"><h3>\uD83D\uDCCB What triggered the bonus?</h3><div class="sub">Select DD method(s) for '+esc(p.bank)+'. Optional \u2014 tap Skip to close without saving.</div><div class="dd-chips">';common.forEach(m=>{h+='<button class="dd-chip'+(p.sel.includes(m)?' sel':'')+'" onclick="event.stopPropagation();toggleDDChip(\''+esc(m)+'\')">'+esc(m)+'</button>'});h+='</div><input class="dd-input" id="dd_custom" placeholder="Other methods, comma separated..." onclick="event.stopPropagation()">';h+='<div class="crow"><button class="c-c" onclick="skipDD()">Skip</button><button class="c-g" onclick="submitDD()">\uD83D\uDCBE Save</button></div></div></div>';return h}
function rRcv(){const p=rcvPrompt;if(!p)return'';let h='<div class="cbg" onclick="skipRcv()"><div class="rcv-box" onclick="event.stopPropagation()">';h+='<h3>🎉 Bonus Received</h3><div class="sub">This only marks '+esc(p.bank)+' as received. Closing stays separate.</div>';h+='<input class="dd-input" type="date" id="rcv_date" value="'+(p.date||'')+'" onclick="event.stopPropagation()">';h+='<div class="crow"><button class="c-c" onclick="skipRcv()">Cancel</button>'+(p.hasExisting?'<button class="c-r" onclick="clearRcv()">Clear</button>':'')+'<button class="c-g" onclick="rcvSubmit()">Save</button></div>';h+='</div></div>';return h}
function rOverwrite(){
  if(!overwritePrompt)return'';
  const p=overwritePrompt, ex=p.existingEntry, isActive=isActiveEntry(ex);
  const s=status(ex);
  const isHistory=!isActive;
  let h='<div class="cbg" onclick="overwritePrompt=null;R()"><div class="ow-box" onclick="event.stopPropagation()">';
  h+='<h3>'+esc(isHistory?'Start new churn cycle?':'Matching bank already exists')+'</h3>';
  h+='<div class="sub">'+(isHistory
    ?'<strong>'+esc(p.newData.bank)+'</strong> matches an older/cooldown record. Replace that record to start the next churn cycle, or choose Create Separate Entry if you really want a duplicate.'
    :'<strong>'+esc(p.newData.bank)+'</strong> already has an active matching entry. Edit it, replace it, or create a separate entry intentionally.'
  )+'</div>';
  h+='<div class="ow-existing">'+bankLogo(ex.bank)+'<div class="ow-info"><div class="nm">'+esc(ex.bank)+'</div><div class="det">'+esc(s)+' · ID: '+esc(getEntryDisplayId(ex)||ex.id||'')+'</div>';
  if(ex.opened)h+='<div class="det">Opened: '+fD(ex.opened)+'</div>';
  if(ex.closed)h+='<div class="det">Closed: '+fD(ex.closed)+'</div>';
  h+='</div><div class="amt">'+fM(ex.bonus)+'</div></div>';
  h+='<div style="display:flex;flex-direction:column;gap:8px">';
  if(isHistory){
    h+='<button class="c-g" style="width:100%;padding:12px;border-radius:12px;border:none;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer" onclick="doOverwrite()">Start New Churn Cycle / Replace This Record</button>';
    h+='<button style="width:100%;padding:12px;border-radius:12px;border:none;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;background:#EFF6FF;color:var(--accent)" onclick="doOpenExisting()">View / Edit Existing Record</button>';
    h+='<button style="width:100%;padding:12px;border-radius:12px;border:1px solid var(--border);font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;background:#fff;color:var(--text)" onclick="doAddNew()">Create Separate New Entry</button>';
  }else{
    h+='<button style="width:100%;padding:12px;border-radius:12px;border:none;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;background:#EFF6FF;color:var(--accent)" onclick="doOpenExisting()">Edit Existing Entry</button>';
    h+='<button class="c-g" style="width:100%;padding:12px;border-radius:12px;border:none;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer" onclick="doOverwrite()">Replace Existing Entry</button>';
    h+='<button style="width:100%;padding:12px;border-radius:12px;border:1px solid var(--border);font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;background:#fff;color:var(--text)" onclick="doAddNew()">Create Separate New Entry</button>';
  }
  h+='<button class="c-c" style="width:100%;padding:10px;border-radius:10px;border:none;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer" onclick="overwritePrompt=null;R()">Cancel</button>';
  h+='</div></div></div>';
  return h;
}
function rMatchPicker(){
  if(!matchPickerPrompt)return'';
  const p=matchPickerPrompt;
  let h='<div class="cbg" onclick="matchPickerPrompt=null;R()"><div class="ow-box" onclick="event.stopPropagation()">';
  h+='<h3>Pick the right bank match</h3>';
  h+='<div class="sub">We found bank-family matches for <strong>'+esc(p.newData.bank)+'</strong>. Pick Personal or Business so the app does not create the wrong duplicate.</div>';
  h+='<div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">';
  p.matches.forEach(m=>{
    const st=status(m);
    h+=`<button style="width:100%;text-align:left;padding:12px;border-radius:12px;border:1px solid var(--border);background:#fff;font-family:inherit;cursor:pointer" onclick="chooseMatch('${m.id}')">`;
    h+='<div style="display:flex;align-items:center;gap:10px">'+bankLogo(m.bank,true)+'<div style="flex:1;min-width:0">';
    h+='<div style="font-size:13px;font-weight:700">'+esc(m.bank)+'</div>';
    h+='<div style="font-size:10px;color:var(--muted);margin-top:2px">'+esc(entryTypeLabel(m))+' · ID: '+esc(getEntryDisplayId(m))+' · '+esc(st)+'</div>';
    h+='</div><div style="font-size:10px;font-weight:700;color:var(--accent)">Use</div></div>';
    h+='</button>';
  });
  h+='</div>';
  h+='<div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">';
  h+='<button class="c-g" style="width:100%;padding:12px;border-radius:12px;border:none;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer" onclick="skipMatchPickerToNew()">Create Separate New Entry</button>';
  h+='<button class="c-c" style="width:100%;padding:10px;border-radius:10px;border:none;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer" onclick="matchPickerPrompt=null;R()">Cancel</button>';
  h+='</div></div></div>';
  return h;
}
function rAnalyzer(){let h='<div style="background:var(--card);border-radius:12px;padding:12px;margin-bottom:8px;border:1px solid var(--border)">';h+='<div style="font-size:12px;font-weight:700;margin-bottom:6px">\uD83D\uDD0D T&C Analyzer</div>';h+='<textarea class="fg" id="az_input" style="width:100%;min-height:120px;padding:8px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:11px;outline:none;resize:vertical" placeholder="Paste full terms & conditions here...">'+esc(analyzerText)+'</textarea>';h+='<div style="display:flex;gap:4px;margin-top:4px"><button class="az-go" style="flex:1" onclick="runMainAnalyze()">Analyze</button><button class="btn-s" style="flex:0;margin:0;padding:8px 12px" onclick="showAnalyzer=false;analyzerText=\'\';analyzerResult=null;R()">Close</button></div>';if(analyzerResult){const r=analyzerResult;h+='<div style="margin-top:8px">';if(r.notesForTracker){h+='<div class="tc-box" style="padding:12px;border-radius:12px"><div class="tc-body" style="font-size:13px;line-height:1.8">'+highlightTC(r.notesForTracker)+'</div></div>'}else{h+='<div style="padding:12px;background:var(--bg);border-radius:12px;font-size:13px;line-height:1.8">';if(r.bonusAmount)h+='<div>* Bonus: '+esc(r.bonusAmount)+'</div>';if(r.ddAmount)h+='<div>* DD: '+esc(r.ddAmount)+(r.ddCount?' (x'+r.ddCount+')':'')+'</div>';if(r.debitTxns)h+='<div>* Debit Txns: '+esc(r.debitTxns)+'</div>';if(r.timeline)h+='<div>* Timeline: '+esc(r.timeline)+'</div>';if(r.monthlyFee)h+='<div>* Monthly Fee: '+esc(r.monthlyFee)+'</div>';if(r.promoCode)h+='<div>* Promo: '+esc(r.promoCode)+'</div>';if(r.churnRule)h+='<div>* Churn: '+esc(r.churnRule)+'</div>';if(r.earlyCloseFee)h+='<div>* Close Fee: '+esc(r.earlyCloseFee)+'</div>';h+='</div>'}h+='<button class="btn-p" style="margin-top:8px;font-size:13px;padding:12px" onclick="fillFromAI()">\u2B07 Auto-fill New Entry</button>';h+='</div>'}h+='</div>';return h}
function openAdd(){modal={bank:'',accountType:'unknown',bonus:0,churn:'',opened:'',closed:'',bonusRecd:'',reqMet:'',notes:'',analyzedTC:'',minHoldDays:0,earlyCloseFee:0,closeFeeCountdownDays:'',dataPoint:'',reqDays:0,referralBonus:0,checklist:[],plannedClose:'',phoneNum:'',feeChecked:false,monthlyFeeYNText:'',promoCodeText:'',avoidMonthlyFeeText:'',eligibilityText:'',expirationDateText:'',requiredDaysText:'',completeBonusText:'',earlyTerminationFeeText:'',fundedDays:0,fundingAmount:0,fundingAmountText:'',payoutTimingText:'',customTimers:[]};overwritePrompt=null;matchPickerPrompt=null;showInlineAZ=false;inlineResult=null;R()}
try{window.openAdd=openAdd}catch{}
function formatAnalyzedBankName(name,isBiz){let bank=(name||'').trim();if(!bank)return isBiz?'Biz':'';bank=bank.replace(/\s+/g,' ').trim();if(isBiz){if(/\bbiz\b/i.test(bank))return bank;if(/\bbusiness\b/i.test(bank))return bank.replace(/\bbusiness\b/i,'Biz').replace(/\s+/g,' ').trim();return bank+' Biz'}return bank}
function openEdit(id){const e=entries.find(x=>x.id===id);if(e){modal={...e,analyzedTC:e.analyzedTC||'',requiredDaysText:e.requiredDaysText||(e.reqDays>0?String(e.reqDays):''),earlyTerminationFeeText:e.earlyTerminationFeeText||(e.earlyCloseFee>0?String(e.earlyCloseFee):''),closeFeeCountdownDays:e.minHoldDays>0?e.minHoldDays:'',_edit:true};showInlineAZ=false;inlineResult=null;R()}}
function closeModal(){modal=null;showInlineAZ=false;inlineResult=null;R()}
function clearFields(){if(!modal)return;modal.accountType='unknown';['bonus','churn','opened','closed','bonusRecd','reqMet','dataPoint','notes','plannedClose','phoneNum','monthlyFeeYNText','promoCodeText','avoidMonthlyFeeText','completeBonusText','earlyTerminationFeeText','eligibilityText','expirationDateText','requiredDaysText','closeFeeCountdownDays'].forEach(k=>{modal[k]=''});modal.customTimers=[];['reqDays','minHoldDays','earlyCloseFee','referralBonus'].forEach(k=>{modal[k]=0});modal.bonus=0;modal.feeChecked=false;R()}
function parseCloseFeeAmount(text){const raw=String(text||'').trim();if(!raw)return 0;if(/^(none|no|n\/a)$/i.test(raw))return 0;const m=raw.match(/\$?([\d,]+(?:\.\d+)?)/);return m?parseInt(String(m[1]).replace(/,/g,''),10)||0:0}
function parseRequirementDaysText(v){const raw=String(v??'').trim();if(!raw)return 0;const m=raw.match(/(\d{1,4})/);return m?Math.max(0,parseInt(m[1],10)||0):0}
function syncRequiredDaysFromModal(d){const raw=String(modal.requiredDaysText??'').trim();const parsed=parseRequirementDaysText(raw);if(raw){d.requiredDaysText=raw;d.reqDays=parsed}else if((modal.reqDays||0)>0){d.reqDays=parseInt(modal.reqDays,10)||0;d.requiredDaysText=String(d.reqDays)}else{d.requiredDaysText='';d.reqDays=0}return d.reqDays}
function applyCountdownFromModal(d){const raw=String(modal.closeFeeCountdownDays??'').trim();if(raw===''){d.minHoldDays=0;d.feeChecked=false;return true}const wanted=Math.max(0,parseInt(raw,10)||0);if(wanted===0){d.minHoldDays=0;d.feeChecked=false;return true}d.minHoldDays=wanted;d.feeChecked=false;return true}
let entrySaveBusy=false;
function modalControlValueByLabel(labelRe){
  const box=document.querySelector('.modal');
  if(!box)return null;
  const rows=Array.from(box.querySelectorAll('.fg'));
  for(const row of rows){
    const label=(row.querySelector('label')?.textContent||'').replace(/\s+/g,' ').trim();
    if(!labelRe.test(label))continue;
    const control=row.querySelector('input,textarea,select');
    if(control)return control.value;
  }
  return null;
}
function syncModalFromEditDOM(){
  if(!modal)return;
  try{document.activeElement&&document.activeElement.blur&&document.activeElement.blur()}catch{}
  const setStr=(key,re)=>{const v=modalControlValueByLabel(re);if(v!==null)modal[key]=v};
  const setNum=(key,re)=>{const v=modalControlValueByLabel(re);if(v!==null)modal[key]=parseInt(v,10)||0};
  setStr('bank',/^Bank Name/i);
  setStr('accountType',/^Account Type/i);
  setNum('bonus',/^Amount/i);
  setStr('churn',/^Churn Rule/i);
  setStr('monthlyFeeYNText',/^Monthly Fee/i);
  setStr('promoCodeText',/^Promo Code/i);
  setStr('dataPoint',/^Known DD/i);
  setStr('expirationDateText',/^Promo Expiration/i);
  setNum('fundedDays',/^Funding Deadline Days/i);
  setStr('fundingAmountText',/^Funding Amount/i);
  const fundingRaw=modalControlValueByLabel(/^Funding Amount/i);
  if(fundingRaw!==null)modal.fundingAmount=parseCloseFeeAmount(fundingRaw);
  setStr('payoutTimingText',/^Payout Timing/i);
  setStr('avoidMonthlyFeeText',/^How to Avoid/i);
  setStr('completeBonusText',/^How to Complete/i);
  setStr('earlyTerminationFeeText',/^Early Close Fee Amount/i);
  modal.earlyCloseFee=parseCloseFeeAmount(modal.earlyTerminationFeeText);
  const holdRaw=modalControlValueByLabel(/^Close Fee Days After Opened/i);
  if(holdRaw!==null){
    modal.closeFeeCountdownDays=holdRaw;
    modal.minHoldDays=parseInt(holdRaw,10)||0;
    modal.feeChecked=false;
  }
  setStr('eligibilityText',/^Eligibility/i);
  const reqRaw=modalControlValueByLabel(/^How Many Days Required/i);
  if(reqRaw!==null){
    modal.requiredDaysText=reqRaw;
    modal.reqDays=parseRequirementDaysText(reqRaw);
  }
  setStr('opened',/^Opened$/i);
  setStr('closed',/^Closed$/i);
  setStr('bonusRecd',/^Bonus Received/i);
  setStr('reqMet',/^Req Met/i);
  setStr('notes',/^Your Notes/i);
  setStr('analyzedTC',/^Analyzed T&C Summary/i);
}
function saveEntriesStrict(rows){
  try{
    const payload=JSON.stringify(rows||[]);
    localStorage.setItem(SK,payload);
    if(localStorage.getItem(SK)!==payload)throw new Error('Local save verification failed');
    return true;
  }catch(err){
    console.error('Bank Bonus Tracker save failed',err);
    alert('Save failed. Your browser did not confirm the data was stored. Please export a backup, free storage if needed, then try again.');
    return false;
  }
}
function saveEntryFromButton(btn,ev){
  if(ev){ev.preventDefault();ev.stopPropagation();}
  if(entrySaveBusy)return false;
  entrySaveBusy=true;
  const oldText=btn?btn.innerHTML:'';
  if(btn){btn.disabled=true;btn.innerHTML='Saving…';}
  setTimeout(()=>{
    let ok=false, duplicatePrompt=false;
    try{syncModalFromEditDOM();const result=saveEntry();duplicatePrompt=result==='duplicate-prompt';ok=!!result}catch(err){console.error('Save flow failed',err);alert('Save failed because the app hit an error. Please copy a backup before retrying.');ok=false;}
    if(ok&&!duplicatePrompt)alert('Saved successfully.');
    if(!ok&&btn&&document.body.contains(btn)){btn.disabled=false;btn.innerHTML=oldText;}
    setTimeout(()=>{entrySaveBusy=false},350);
  },0);
  return false;
}
function saveEntry(){
  syncModalFromEditDOM();
  const bank=(modal.bank||'').trim();
  if(!bank){alert('Bank name required');return false}
  syncModalAccountTypeFromBank();
  const d={bank,accountType:normalizeAccountType(modal.accountType)||'personal',bonus:modal.bonus||0,churn:modal.churn||'',opened:modal.opened||'',closed:modal.closed||'',bonusRecd:modal.bonusRecd||'',reqMet:modal.reqMet||'',notes:modal.notes||'',analyzedTC:modal.analyzedTC||'',minHoldDays:modal.minHoldDays||0,earlyCloseFee:modal.earlyCloseFee||0,reqDays:modal.reqDays||0,referralBonus:modal.referralBonus||0,dataPoint:modal.dataPoint||'',fundedDays:modal.fundedDays||0,fundingAmount:modal.fundingAmount||0,fundingAmountText:modal.fundingAmountText||'',payoutTimingText:modal.payoutTimingText||'',plannedClose:modal.plannedClose||'',phoneNum:modal.phoneNum||'',feeChecked:modal.feeChecked||false,monthlyFeeYNText:modal.monthlyFeeYNText||'',promoCodeText:modal.promoCodeText||'',avoidMonthlyFeeText:modal.avoidMonthlyFeeText||'',completeBonusText:modal.completeBonusText||'',earlyTerminationFeeText:modal.earlyTerminationFeeText||'',eligibilityText:modal.eligibilityText||'',expirationDateText:modal.expirationDateText||'',requiredDaysText:modal.requiredDaysText||'',customTimers:normalizeTimerList(modal.customTimers)};
  syncRequiredDaysFromModal(d);
  d.earlyCloseFee=parseCloseFeeAmount(modal.earlyTerminationFeeText);
  applyCountdownFromModal(d);
  hydrateTimersFromOpened(d);
  if(!modal._edit&&!modal._skipDuplicateCheck&&handleDuplicateFlow(d,'manual')){closeModal();R();return 'duplicate-prompt'}
  const beforeEntries=entries.map(e=>({...e,checklist:Array.isArray(e.checklist)?[...e.checklist]:[],customTimers:normalizeTimerList(e.customTimers)}));
  let savedEntry=null;
  if(modal._edit){
    const targetId=modal.id;let promotedId='';
    entries=entries.map(e=>{if(e.id!==targetId)return e;let next={...e,...d,checklist:e.checklist||[],customTimers:(d.customTimers&&d.customTimers.length)?d.customTimers:(e.customTimers||[])};hydrateTimersFromOpened(next);const beforeId=next.id;next=promoteDraftEntryId(next,beforeId);promotedId=next.id;return next});
    savedEntry=entries.find(e=>e.id===promotedId)||entries.find(e=>e.id===targetId)||null;
  }else{
    const next=assignEntryIdForCreate({...d,checklist:[],customTimers:d.customTimers||[]});hydrateTimersFromOpened(next);entries.push(next);savedEntry=next;
  }
  entries=sortE(entries);
  if(!saveEntriesStrict(entries)){entries=beforeEntries;return false}
  if(savedEntry){syncProfileEventsFromEntry(savedEntry);refreshSavedReqFromEntry(savedEntry)}
  closeModal();
  return true;
}
function normalizeNewCycleData(d,existing){
  d={...(d||{})}; existing=existing||{};
  const next={...existing,...d};
  next.id=existing.id||d.id||next.id;
  next.bank=d.bank||existing.bank||'';
  next.accountType=normalizeAccountType(d.accountType)||normalizeAccountType(existing.accountType)||inferAccountTypeForEntry(next)||'personal';
  next.bonus=(d.bonus||d.bonus===0)?d.bonus:(existing.bonus||0);
  next.churn=d.churn||existing.churn||'';
  next.opened=d.opened||'';
  next.closed='';
  next.bonusRecd='';
  next.reqMet='';
  next.plannedClose='';
  next.phoneNum=d.phoneNum||existing.phoneNum||'';
  next.notes=d.notes||'';
  next.checklist=[];
  next.customTimers=normalizeTimerList(d.customTimers||[]);
  hydrateTimersFromOpened(next);
  next.feeChecked=false;
  next.referralBonus=d.referralBonus||0;
  next.dataPoint=d.dataPoint||'';
  next.fundedDays=d.fundedDays||0;
  next.fundingAmount=d.fundingAmount||0;
  next.fundingAmountText=d.fundingAmountText||'';
  next.payoutTimingText=d.payoutTimingText||'';
  next.reqDays=d.reqDays||0;
  next.minHoldDays=d.minHoldDays||0;
  next.earlyCloseFee=d.earlyCloseFee||0;
  next.analyzedTC=d.analyzedTC||'';
  next.monthlyFeeYNText=d.monthlyFeeYNText||'';
  next.promoCodeText=d.promoCodeText||'';
  next.avoidMonthlyFeeText=d.avoidMonthlyFeeText||'';
  next.completeBonusText=d.completeBonusText||'';
  next.earlyTerminationFeeText=d.earlyTerminationFeeText||'';
  next.eligibilityText=d.eligibilityText||'';
  next.expirationDateText=d.expirationDateText||'';
  next.requiredDaysText=d.requiredDaysText||'';
  next.previousCycles=Array.isArray(existing.previousCycles)?existing.previousCycles.slice(0,10):[];
  return next;
}
function chooseMatch(id){
  if(!matchPickerPrompt)return;
  const picked=matchPickerPrompt.matches.find(m=>m.id===id);
  if(!picked)return;
  const d=matchPickerPrompt.newData||{};
  overwritePrompt=makeDuplicatePrompt(d,picked,matchPickerPrompt.source||'analyzer');
  matchPickerPrompt=null;
  tab='tracker';search='';expanded=picked.id;
  R();
}
function skipMatchPickerToNew(){if(!matchPickerPrompt)return;modal={...matchPickerPrompt.newData,checklist:[],_skipDuplicateCheck:true};matchPickerPrompt=null;tab='tracker';search='';R()}
function doOpenExisting(){
  if(!overwritePrompt||!overwritePrompt.existingEntry)return;
  const ex={...overwritePrompt.existingEntry};
  overwritePrompt=null;
  modal={...ex,analyzedTC:ex.analyzedTC||'',closeFeeCountdownDays:ex.minHoldDays>0?ex.minHoldDays:'',_edit:true};
  expanded=ex.id;tab='tracker';search='';showInlineAZ=false;inlineResult=null;
  R();
}
function doOverwrite(){
  if(!overwritePrompt)return;
  const p=overwritePrompt;
  const d=p.newData||{};
  let savedId=p.existingEntry.id;
  entries=entries.map(e=>{
    if(e.id!==p.existingEntry.id)return e;
    const oldCycle=archivedCycleSnapshot(e);
    saveOfferVersionFromEntry(e,'archived-before-replace');
    let next=normalizeNewCycleData(d,e);
    if(oldCycle)next.previousCycles=[oldCycle,...(Array.isArray(e.previousCycles)?e.previousCycles:[])].slice(0,10);
    next=promoteDraftEntryId(next,e.id);
    savedId=next.id;
    return next;
  });
  entries=sortE(entries);sv(SK,entries);
  const saved=entries.find(e=>e.id===savedId)||null;
  if(saved){syncProfileEventsFromEntry(saved);refreshSavedReqFromEntry(saved)}
  overwritePrompt=null;modal=null;expanded=savedId;tab='tracker';search='';showInlineAZ=false;inlineResult=null;
  R();
}
function doAddNew(){
  if(!overwritePrompt)return;
  const p=overwritePrompt;
  const d={...p.newData};
  const next=assignEntryIdForCreate({...d,checklist:[],customTimers:normalizeTimerList(d.customTimers||[]),feeChecked:false});
  entries.push(next);entries=sortE(entries);sv(SK,entries);
  syncProfileEventsFromEntry(next);refreshSavedReqFromEntry(next);
  overwritePrompt=null;modal=null;expanded=next.id;tab='tracker';search='';showInlineAZ=false;inlineResult=null;
  R();
}
function getBackupStorageKeys(){return[SK,TK,DD_KEY,REQ_KEY,OFFER_HIST_KEY,PHONE_KEY,DP_USER_KEY,COMMUNITY_DP_KEY,COMMUNITY_DP_SEED_KEY,PROFILE_EVT_KEY,BK_KEY,'bt_tc_learning_inbox_v320']}
function parseBackupStorageValue(raw){try{return JSON.parse(raw)}catch{return raw}}
function storageValueForRestore(val){return typeof val==='string'?val:JSON.stringify(val)}
function countBackupEntries(d){if(Array.isArray(d?.entries))return d.entries.length;const arr=backupArrayFromStorage(d,SK);return arr.length}
function countBackupUserDatapoints(d){if(Array.isArray(d?.userDatapoints))return d.userDatapoints.length;if(Array.isArray(d?.ddMethods))return d.ddMethods.length;const arr=backupArrayFromStorage(d,DP_USER_KEY);return arr.length||backupArrayFromStorage(d,DD_KEY).length}
function countBackupCommunityDatapoints(d){if(Array.isArray(d?.communityDatapoints))return d.communityDatapoints.length;return backupArrayFromStorage(d,COMMUNITY_DP_KEY).length}
function countBackupProfileEvents(d){if(Array.isArray(d?.profileEvents))return d.profileEvents.length;if(Array.isArray(d?.storageSnapshot?.[PROFILE_EVT_KEY]))return d.storageSnapshot[PROFILE_EVT_KEY].length;const raw=d?.localStorage?.[PROFILE_EVT_KEY];try{const p=JSON.parse(raw||'[]');return Array.isArray(p)?p.length:0}catch{return 0}}
function countBackupReqs(d){if(d?.bankReqs&&typeof d.bankReqs==='object')return Object.keys(d.bankReqs).length;const obj=backupObjectFromStorage(d,REQ_KEY);return Object.keys(obj).length}
function countBackupPhones(d){if(Array.isArray(d?.phoneBook))return d.phoneBook.length;return backupArrayFromStorage(d,PHONE_KEY).length}
function buildStorageSnapshot(){const snap={};getBackupStorageKeys().forEach(key=>{try{const raw=localStorage.getItem(key);if(raw===null)return;snap[key]=parseBackupStorageValue(raw)}catch{}});return snap}
function restoreStorageSnapshot(snapshot){if(!snapshot||typeof snapshot!=='object')return;Object.entries(snapshot).forEach(([key,val])=>{if(!getBackupStorageKeys().includes(key))return;try{localStorage.setItem(key,storageValueForRestore(val))}catch{}})}
function backupTimestamp(){const dt=new Date();const pad=n=>String(n).padStart(2,'0');return dt.getFullYear()+pad(dt.getMonth()+1)+pad(dt.getDate())+'_'+pad(dt.getHours())+pad(dt.getMinutes())+pad(dt.getSeconds())}
function downloadBlob(blob,filename){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url)}
async function deliverBackupFile(blob,filename,preferShare){if(preferShare&&typeof File!=='undefined'&&navigator?.share){try{const file=new File([blob],filename,{type:'application/json'});if(!navigator.canShare||navigator.canShare({files:[file]})){await navigator.share({files:[file],title:'Bank Bonus Tracker backup',text:'Save this full backup to Files, iCloud Drive, Google Drive, or email so you can restore later on any device.'});return 'shared'}}catch(err){}}downloadBlob(blob,filename);return 'downloaded'}
function buildResetSafetyBackupPayload(){const data=buildPortableBackupPayload();data.reason='pre-reset-safety-backup';return data}
async function exportBackup(preferShare=true,customData=null,customFilename=''){const data=customData||buildPortableBackupPayload();const filename=customFilename||('BankBonusTracker_FullBackup_'+backupTimestamp()+'.json');const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const mode=await deliverBackupFile(blob,filename,preferShare);setLastBk();return{mode,filename,data}}
function performHardReset(){entries=[];sv(SK,[]);try{getBackupStorageKeys().forEach(k=>localStorage.removeItem(k));localStorage.removeItem(PROFILE_EVT_KEY);localStorage.removeItem(BK_KEY)}catch{}dashYear=new Date().getFullYear();taxYear=new Date().getFullYear();expanded=null;modal=null;search='';showTemplates=false;showAnalyzer=false;analyzerText='';analyzerResult=null;inlineResult=null;showInlineAZ=false;phoneSearch='';showPhoneAdd=false;dpSearch='';dpExpandedBankKey='';dpEditor=null;profileSearch='';activeProfileKey='';overwritePrompt=null;matchPickerPrompt=null;ddPrompt=null;rcvPrompt=null;closePrompt=null;feeCheckPrompt=null;undoState=null;if(undoTimer)clearTimeout(undoTimer);R()}
function resetAllData(){cfm={title:'⚠️ Reset All Data',msg:'This will permanently delete ALL tracker rows, datapoints, saved bank requirements, and saved phone data from this device.\n\nFor safety, the app will export one final full backup first so you can save it to Files/iCloud/Drive before the wipe finishes.',action:()=>{cfm={title:'🚨 Final confirmation',msg:'Continue with the full reset? A recovery backup file will be created first, then this device will be wiped.',action:async()=>{cfm=null;R();try{await exportBackup(false,buildResetSafetyBackupPayload(),'BankBonusTracker_PreReset_'+backupTimestamp()+'.json')}catch{}performHardReset();cfm={title:'Reset Complete',msg:'This device has been cleared. Keep the exported pre-reset backup file somewhere safe so you can restore later.',green:true,action:()=>{cfm=null;R()}};R()}};R()}};R()}
function delEntry(id){const e=entries.find(x=>x.id===id);if(!e)return;cfm={title:'Delete Bank Entry?',msg:'Delete '+e.bank+' '+(e.id||'')+' from the tracker?\n\nThis cannot be undone.',action:()=>{entries=entries.filter(x=>x.id!==id);sv(SK,entries);expanded=null;cfm={title:'Bank Entry Deleted',msg:e.bank+' was deleted from the tracker.',green:true,action:()=>{cfm=null;R()}};R()}};R()}
function closeAcct(id){const e=entries.find(x=>x.id===id);if(!e)return;feeCheckPrompt={entryId:id,bank:e.bank,step:'ask',months:e.minHoldDays>0?Math.round(e.minHoldDays/30):6,feeAmount:e.earlyCloseFee||0};R()}
function feeCheckSkip(){if(!feeCheckPrompt)return;const id=feeCheckPrompt.entryId;entries=entries.map(e=>{if(e.id===id){e.feeChecked=true;e.minHoldDays=0;e.earlyCloseFee=0}return e});entries=sortE(entries);sv(SK,entries);feeCheckPrompt=null;startCloseFlow(id)}
function feeCheckRemoveTimer(){if(!feeCheckPrompt)return;const id=feeCheckPrompt.entryId;const current=entries.find(e=>e.id===id);entries=entries.map(e=>{if(e.id===id){e.minHoldDays=0;e.earlyCloseFee=0;e.feeChecked=true}return e});entries=sortE(entries);sv(SK,entries);feeCheckPrompt=null;cfm={title:'Timer Removed',msg:(current?current.bank+' ':'')+'early-close timer removed. This bank is now marked Safe to Close.',green:true,action:()=>{cfm=null;R()}};R()}
function feeCheckSave(){if(!feeCheckPrompt)return;const p=feeCheckPrompt;const id=p.entryId;const months=p.months||6;const feeAmt=p.feeAmount||0;entries=entries.map(e=>{if(e.id===id){if(e.opened){const safeDate=addM(e.opened,months);e.minHoldDays=dB(e.opened,safeDate)}else{e.minHoldDays=months*30}e.earlyCloseFee=feeAmt;e.feeChecked=false}return e});entries=sortE(entries);sv(SK,entries);feeCheckPrompt=null;const e=entries.find(x=>x.id===id);if(e){const dsc=daysUntilSafe(e);if(dsc!==null&&dsc<=0){cfm={title:'\u2705 Already Safe!',msg:e.bank+' hold period has already passed. You can close anytime!',green:true,action:()=>{cfm=null;R()}};R();return}}R()}
function feeCheckCancel(){feeCheckPrompt=null;R()}
function startCloseFlow(id){const e=entries.find(x=>x.id===id);if(!e)return;closePrompt={entryId:id,bank:e.bank,bonus:e.bonus||0,step:'date',closeDate:td(),gotFull:true,actualBonus:e.bonus||0,dp:''};R()}
function closeNext(){const p=closePrompt;if(!p)return;if(p.step==='date'){const d=document.getElementById('cp_date');if(d)p.closeDate=d.value;if(!p.closeDate){alert('Close date is required.');return}p.step='bonus';R()}else if(p.step==='bonus'){if(!p.gotFull){const v=document.getElementById('cp_amt');if(v)p.actualBonus=parseInt(v.value)||0}p.step='dp';R()}else if(p.step==='dp'){const dp=document.getElementById('cp_dp');if(dp)p.dp=dp.value.trim();finishClose()}}
function closeBack(){const p=closePrompt;if(!p)return;if(p.step==='dp')p.step='bonus';else if(p.step==='bonus')p.step='date';R()}
function finishClose(){const p=closePrompt;if(!p)return;const e=entries.find(x=>x.id===p.entryId);const warnings=closeSafetyWarnings(e,p);if(warnings.length&&!window.confirm('Review before closing:\n\n- '+warnings.join('\n- ')+'\n\nContinue anyway?'))return;undoState={...e};if(undoTimer)clearTimeout(undoTimer);undoTimer=setTimeout(()=>{undoState=null;R()},15000);entries=entries.map(x=>{if(x.id===p.entryId){x.closed=p.closeDate;x.bonus=p.actualBonus;if(p.actualBonus>0&&!x.bonusRecd)x.bonusRecd=p.closeDate;if(p.dp)x.dataPoint=p.dp;x.feeChecked=true}return x});const e2=entries.find(x=>x.id===p.entryId);const autoMethod=(p.dp||e2?.dataPoint||'').trim();if(e2&&p.actualBonus>0&&autoMethod)addDD(p.bank,autoMethod,p.actualBonus,p.closeDate,{entryId:p.entryId,note:'Auto-saved from successful close'});if(e2)refreshSavedReqFromEntry(e2);entries=sortE(entries);sv(SK,entries);closePrompt=null;expanded=null;R()}
function cancelClose(){closePrompt=null;R()}
function addFromTpl(i){const t=TEMPLATES[i];const newData={bank:t.bank,bonus:t.bonus,churn:t.churn,opened:td(),closed:'',bonusRecd:'',reqMet:'',notes:t.notes||'',analyzedTC:'',minHoldDays:t.minHoldDays||0,earlyCloseFee:t.earlyCloseFee||0,dataPoint:t.dataPoint||'',reqDays:t.reqDays||0,referralBonus:0,plannedClose:'',phoneNum:'',feeChecked:false};if(handleDuplicateFlow(newData,'template')){showTemplates=false;R();return}modal=newData;modal.checklist=[];modal.customTimers=[];showTemplates=false;R()}
function toggleCk(id,i){entries=entries.map(e=>{if(e.id===id&&e.checklist)e.checklist[i].done=!e.checklist[i].done;return e});sv(SK,entries);R()}
function addCk(id){const inp=document.getElementById('ck_'+id);if(!inp||!inp.value.trim())return;entries=entries.map(e=>{if(e.id===id){if(!e.checklist)e.checklist=[];e.checklist.push({text:inp.value.trim(),done:false})}return e});sv(SK,entries);toggleInlineForm(id,'checklist',false)}
function rmCk(id,i){entries=entries.map(e=>{if(e.id===id&&e.checklist)e.checklist.splice(i,1);return e});sv(SK,entries);R()}
function timerId(){return 'tmr_'+Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-5)}
function normalizeTimer(item){const x=(item&&typeof item==='object')?{...item}:{};const text=String(x.text||'').trim();const startDate=String(x.startDate||'').trim();const daysRequired=parseInt(x.daysRequired||0,10)||0;const date=String(x.date||timerDueFromStart(startDate,daysRequired)||'').trim();return{id:String(x.id||timerId()),text,startDate,daysRequired,date,done:!!x.done}}
function normalizeTimerList(list){return(Array.isArray(list)?list:[]).map(normalizeTimer).filter(t=>t.text||t.date)}
function hydrateTimersFromOpened(entry){if(!entry)return entry;const opened=String(entry.opened||'').trim();entry.customTimers=normalizeTimerList(entry.customTimers||[]).map(t=>{const days=parseInt(t.daysRequired||0,10)||0;if(opened&&days>0&&(!t.startDate||!t.date)){return normalizeTimer({...t,startDate:t.startDate||opened,date:t.date||timerDueFromStart(t.startDate||opened,days)})}return t});return entry}
const TIMER_DELETE_KEY_PREFIX='bt_deleted_timer_keys_v1:';
function normTimerVal(v){return String(v||'').replace(/\s+/g,' ').trim()}
function normTimerLower(v){return normTimerVal(v).toLowerCase()}
function timerDeleteSignature(t){if(!t)return'';return[normTimerLower(t.text||''),normTimerVal(t.date||''),normTimerVal(t.startDate||''),String(parseInt(t.daysRequired||0,10)||0)].join('|')}
function timerDeleteTextKey(t){return'text::'+normTimerLower(t?.text||'')}
function timerDeleteIdKey(t){return'id::'+normTimerVal(t?.id||'')}
function deletedTimerKeyStore(entryId){try{const raw=localStorage.getItem(TIMER_DELETE_KEY_PREFIX+entryId);const arr=raw?JSON.parse(raw):[];return Array.isArray(arr)?arr:[]}catch{return[]}}
function saveDeletedTimerKeyStore(entryId,keys){try{localStorage.setItem(TIMER_DELETE_KEY_PREFIX+entryId,JSON.stringify(Array.from(new Set(keys)).slice(-250)))}catch{}}
function deletedTimerKeys(e){const own=Array.isArray(e?.deletedTimerKeys)?e.deletedTimerKeys:[];const store=e?.id?deletedTimerKeyStore(e.id):[];return new Set([...own,...store].filter(Boolean))}
function saveDeletedTimerKeys(e,keys){if(!e)return;e.deletedTimerKeys=Array.from(keys).slice(-250);if(e.id)saveDeletedTimerKeyStore(e.id,e.deletedTimerKeys)}
function addDeletedTimerKeys(e,t){if(!e||!t)return;const keys=deletedTimerKeys(e);[timerDeleteSignature(t),timerDeleteTextKey(t),timerDeleteIdKey(t)].forEach(k=>{if(k&&k!=='text::'&&k!=='id::')keys.add(k)});saveDeletedTimerKeys(e,keys)}
function clearDeletedTimerKeys(e,t){if(!e||!t)return;const keys=deletedTimerKeys(e);[timerDeleteSignature(t),timerDeleteTextKey(t),timerDeleteIdKey(t)].forEach(k=>keys.delete(k));saveDeletedTimerKeys(e,keys)}
function isDeletedTimer(e,t){if(!e||!t)return false;const keys=deletedTimerKeys(e);return keys.has(timerDeleteSignature(t))||keys.has(timerDeleteTextKey(t))||keys.has(timerDeleteIdKey(t))}
function sanitizeEntryTimers(e){if(!e||!Array.isArray(e.customTimers))return false;const before=e.customTimers.length;e.customTimers=normalizeTimerList(e.customTimers).filter(t=>!isDeletedTimer(e,t));return e.customTimers.length!==before}
function sanitizeAllTimers(save){let changed=false;entries.forEach(e=>{if(sanitizeEntryTimers(e))changed=true});if(changed&&save)sv(SK,entries);return changed}
function timerEditorDraft(){const p=timerEditModal;if(!p)return null;return {...p,text:(document.getElementById('tem_text')?.value??p.text??'').trim(),startDate:(document.getElementById('tem_start')?.value??p.startDate??'').trim(),daysRequired:(document.getElementById('tem_days')?.value??p.daysRequired??'').trim()}}
function openNewTimerEditor(id,mode='due'){const entry=entries.find(e=>e.id===id);if(!entry)return;const fallbackDate=entry.opened||td();timerEditModal={entryId:id,timerId:'',isNew:true,text:'',mode:mode==='days'?'days':'due',startDate:fallbackDate,daysRequired:''};R();setTimeout(()=>{const el=document.getElementById('tem_text');if(el)el.focus()},0)}
function openTimerEditor(id,timerIdValue){const entry=entries.find(e=>e.id===id);if(!entry)return;const timer=normalizeTimerList(entry.customTimers).find(t=>t.id===timerIdValue);if(!timer)return;timerEditModal={entryId:id,timerId:timer.id,isNew:false,text:timer.text||'',mode:timer.daysRequired>0?'days':'due',startDate:(timer.daysRequired>0?timer.startDate:timer.date)||'',daysRequired:timer.daysRequired?String(timer.daysRequired):''};R();setTimeout(()=>{const el=document.getElementById('tem_text');if(el)el.focus()},0)}
function closeTimerEditor(){timerEditModal=null;R()}
function switchTimerEditMode(mode){if(!timerEditModal)return;const draft=timerEditorDraft()||timerEditModal;timerEditModal={...draft,mode:mode==='days'?'days':'due'};if(timerEditModal.mode==='due')timerEditModal.daysRequired='';R();setTimeout(()=>{const el=document.getElementById('tem_text');if(el)el.focus()},0)}
function saveTimerEditor(){const draft=timerEditorDraft();if(!draft)return;const txt=(draft.text||'').trim();const start=(draft.startDate||'').trim();const days=draft.mode==='days'?(parseInt(draft.daysRequired,10)||0):0;if(!txt||!start){alert(draft.mode==='days'?'Add a description and start date.':'Add a description and due date.');return}if(draft.mode==='days'&&days<=0){alert('Add the number of days for a Start Date + Days timer.');return}const due=days>0?timerDueFromStart(start,days):start;const idToSave=draft.timerId||timerId();const updated=normalizeTimer({id:idToSave,text:txt,startDate:days>0?start:'',daysRequired:days,date:due,done:false});let found=false;entries=entries.map(e=>{if(e.id===draft.entryId){found=true;const timers=normalizeTimerList(e.customTimers).filter(t=>!isDeletedTimer(e,t));const idx=timers.findIndex(t=>t.id===updated.id);clearDeletedTimerKeys(e,updated);if(idx>=0){updated.done=!!timers[idx].done;timers[idx]=updated}else timers.push(updated);e.customTimers=timers}return e});if(!found){alert('Could not find the bank entry for this timer.');return}sv(SK,entries);timerEditModal=null;R()}
function rTimerEdit(){if(!timerEditModal)return'';const p=timerEditModal;const isDays=p.mode==='days';const isNew=!!p.isNew||!p.timerId;let h='<div class="cbg" onclick="closeTimerEditor()"><div class="dd-box" onclick="event.stopPropagation()">';h+='<h3>'+(isNew?'Add countdown timer':'Edit countdown timer')+'</h3>';h+='<div class="sub">'+(isNew?'Create a custom countdown. Use an exact due date, or switch to start date + days.':'Keep it as an exact due date, or switch to start date + days.')+'</div>';h+='<div class="dd-chips"><button type="button" class="dd-chip '+(!isDays?'sel':'')+'" onclick="event.stopPropagation();switchTimerEditMode(\'due\')">Due Date</button><button type="button" class="dd-chip '+(isDays?'sel':'')+'" onclick="event.stopPropagation();switchTimerEditMode(\'days\')">Start + Days</button></div>';h+='<div class="fg"><label>Description</label><input id="tem_text" value="'+esc(p.text||'')+'" placeholder="e.g. Deposit deadline"></div>';if(isDays){h+='<div class="frow"><div class="fg"><label>Start date</label><input id="tem_start" type="date" value="'+esc(p.startDate||'')+'"></div><div class="fg"><label>Days</label><input id="tem_days" type="number" inputmode="numeric" min="1" value="'+esc(String(p.daysRequired||''))+'" placeholder="60"></div></div>'}else{h+='<div class="fg"><label>Due date</label><input id="tem_start" type="date" value="'+esc(p.startDate||'')+'"><input id="tem_days" type="hidden" value=""></div>'}h+='<div class="crow"><button type="button" class="c-c" onclick="closeTimerEditor()">Cancel</button><button type="button" class="c-g" onclick="saveTimerEditor()">'+(isNew?'Add Timer':'Save')+'</button></div>';h+='</div></div>';return h}

function toggleTimer(id,timerId){entries=entries.map(e=>{if(e.id===id){e.customTimers=normalizeTimerList(e.customTimers).filter(t=>!isDeletedTimer(e,t)).map(t=>t.id===timerId?{...t,done:!t.done}:t)}return e});sv(SK,entries);R()}
function upsertTimer(id){const txt=document.getElementById('tm_txt_'+id);const st=document.getElementById('tm_start_'+id);const ds=document.getElementById('tm_days_'+id);const ui=inlineStateFor(id);const kind=ui.timerKind==='days'?'days':'due';const days=kind==='days'?(parseInt(ds?.value,10)||0):0;if(!txt||!st||!txt.value.trim()||!st.value){alert(kind==='days'?'Add a timer name and start date.':'Add a timer name and due date.');return}if(kind==='days'&&days<=0){alert('Add the number of days for this timer.');return}const editId=ui.timerEdit||'';const due=days>0?timerDueFromStart(st.value,days):st.value;entries=entries.map(e=>{if(e.id===id){const timers=normalizeTimerList(e.customTimers).filter(t=>!isDeletedTimer(e,t));const idx=timers.findIndex(t=>t.id===editId);const next=normalizeTimer({id:idx>=0?timers[idx].id:timerId(),text:txt.value.trim(),startDate:days>0?st.value:'',daysRequired:days,date:due,done:idx>=0?!!timers[idx].done:false});clearDeletedTimerKeys(e,next);if(idx>=0)timers[idx]=next;else timers.push(next);e.customTimers=timers}return e});sv(SK,entries);ui.timerEdit=null;window.__skipTimerPrompt=true;toggleInlineForm(id,'timer',false);window.__skipTimerPrompt=false}
function rmTimer(id,timerId){const entry=entries.find(e=>e.id===id);if(!entry)return;const timer=normalizeTimerList(entry.customTimers).find(t=>t.id===timerId);const label=timer?.text?('Delete mini timer “'+timer.text+'”?'):'Delete this mini timer?';cfm={title:'Delete mini timer',msg:label,action:()=>{entries=entries.map(e=>{if(e.id===id){const timers=normalizeTimerList(e.customTimers);const target=timers.find(t=>t.id===timerId);if(target)addDeletedTimerKeys(e,target);e.customTimers=timers.filter(t=>t.id!==timerId)}return e});const st=inlineStateFor(id);if(st.timerEdit===timerId)st.timerEdit=null;sv(SK,entries);cfm=null;R()}};R()}
function toggleDDChip(m){if(!ddPrompt)return;const i=ddPrompt.sel.indexOf(m);if(i>=0)ddPrompt.sel.splice(i,1);else ddPrompt.sel.push(m);R()}
function submitDD(){if(!ddPrompt)return;const c=document.getElementById('dd_custom');const all=[...ddPrompt.sel];if(c&&c.value)c.value.split(',').forEach(x=>{const t=x.trim();if(t)all.push(t)});all.forEach(m=>addDD(ddPrompt.bank,m,ddPrompt.bonus,td()));ddPrompt=null;R()}
function skipDD(){ddPrompt=null;R()}
function confirmMarkReceived(id){const e=entries.find(x=>x.id===id);if(!e)return;cfm={title:e.bonusRecd?'Update Bonus Received?':'Mark Bonus Received?',msg:(e.bonusRecd?'Update the bonus received date for ':'Mark the bonus as received for ')+e.bank+'?\n\nYou can review the received date before saving.',green:true,action:()=>{cfm=null;openRcv(id)}};R()}
function openRcv(id){const e=entries.find(x=>x.id===id);if(!e)return;rcvPrompt={entryId:id,bank:e.bank,date:e.bonusRecd||td(),hasExisting:!!e.bonusRecd};R()}
function rcvNext(){}
function rcvSubmit(){const p=rcvPrompt;if(!p)return;const d=document.getElementById('rcv_date');if(d)p.date=d.value;if(!p.date){alert('Received date required');return}entries=entries.map(e=>{if(e.id===p.entryId){e.bonusRecd=p.date;e.plannedClose=''}return e});const e2=entries.find(e=>e.id===p.entryId);if(e2){syncProfileEventsFromEntry(e2);refreshSavedReqFromEntry(e2)}entries=sortE(entries);sv(SK,entries);rcvPrompt=null;cfm={title:'Bonus Received Saved',msg:(e2?e2.bank:'This bank')+' received date saved for '+fD(p.date)+'.',green:true,action:()=>{cfm=null;R()}};R()}
function clearRcv(){const p=rcvPrompt;if(!p)return;entries=entries.map(e=>{if(e.id===p.entryId){e.bonusRecd='';e.plannedClose=''}return e});entries=sortE(entries);sv(SK,entries);rcvPrompt=null;R()}
function skipRcv(){rcvPrompt=null;R()}
function looksLikeActualDateText(s){
  if(!s) return false;
  return /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}/i.test(s) || /^\d{4}-\d{2}-\d{2}$/.test(String(s).trim());
}
function normalizePromoWindowText(s){
  if(!s) return '';
  const raw=String(s).trim();
  const m=raw.match(/^Q[1-4]\s+\d{4}\s*\(([^)]+)\)$/i);
  
  if(m) return m[1].trim();
  
  return looksLikeActualDateText(raw) ? raw : '';
  
}

function buildSimpleAutoFill(r){
  
  const steps=[];
  
  if(r.minOpeningDeposit) steps.push('Open with '+r.minOpeningDeposit);
  
  else steps.push('Open the required account');
  
  if(r.qualifyingPaths?.length){
    
    steps.push(...r.qualifyingPaths);
    
  }
  else{
    
    if(r.ddAmount) steps.push('Direct deposit '+r.ddAmount+(r.ddCount?' ('+r.ddCount+'+ deposits)':''));
    
    if(r.newMoneyAmount) steps.push('Deposit '+r.newMoneyAmount+' of new money'+(r.newMoneyDays?' within '+r.newMoneyDays+' days':''));
    
    if(r.maintainBalance||r.maintainDays) steps.push('Maintain '+(r.maintainBalance||'required balance')+(r.maintainDays?' for '+r.maintainDays+' days':''));
    
    if(r.activityCount) steps.push('Complete '+r.activityCount+' qualifying transactions'+(r.activityDays?' within '+r.activityDays+' days':''));
    
    if(r.debitTxns) steps.push('Complete '+r.debitTxns+' debit card transactions');
    
  }
  
  if(r.mustRemainOpen) steps.push('Keep account open until bonus payout');
  
  if(r.requiresGoodStanding) steps.push('Keep account in good standing');
  
  const elig=[];
  
  if(r.residency) elig.push(r.residency);
  
  if(r.currentCustomerIneligible) elig.push('Current customers not eligible');
  
  if(r.churnMonths) elig.push(r.churnMonths+'-month restriction');
  
  if(r.priorBonusIneligible) elig.push('Previous bonus recipients not eligible');
  
  if(r.limitOneBonus) elig.push(/business/i.test(r.acctType||r.bankName||'') ? 'One bonus per business/entity' : 'One bonus per customer/account');
  
  if(r.primaryOwnerOnly) elig.push('Bonus paid to primary owner only');
  
  let monthlyFeeYN='';
  
  const mf=String(r.monthlyFee||'').trim();
  
  if(mf){
    
    if(mf==='$0 (No fee)' || /no fee/i.test(mf)) monthlyFeeYN='No';
    
    else if(mf!=='Not clearly stated in pasted T&C') monthlyFeeYN='Yes';
    
  }
   else if(r.feeWaiver){
     monthlyFeeYN='Yes';
    
  }
  
  let earlyTerm='';
  
  if(r.earlyCloseFee && String(r.earlyCloseFee).trim()!=='None'){
    
    earlyTerm=String(r.earlyCloseFee).trim();
    
    if(r.earlyCloseDays) earlyTerm+=' if closed within '+r.earlyCloseDays+' days';
    
  }
   else if(r.earlyCloseDays){
    
    earlyTerm='Fee applies if closed within '+r.earlyCloseDays+' days';
    
  }
  
  const requiredDays=Math.max(parseInt(r.timelineDays||0,10)||0,parseInt(r.newMoneyDays||0,10)||0,parseInt(r.maintainDays||0,10)||0,parseInt(r.activityDays||0,10)||0,parseInt(r.minDaysOpen||0,10)||0);
  
  return {
    
    monthlyFeeYNText: monthlyFeeYN,
    promoCodeText: r.promoCode || '',
    avoidMonthlyFeeText: r.feeWaiver || '',
    completeBonusText: steps.map((s,i)=>(i+1)+'. '+s).join('\n'),
    earlyTerminationFeeText: earlyTerm,
    eligibilityText: elig.join(' | '),
    expirationDateText: normalizePromoWindowText(r.openBy || r.openWindow || ''),
    requiredDaysText: requiredDays ? String(requiredDays) : ''
  };
  
}

function runMainAnalyze(){
  const el=document.getElementById('az_input');
  if(!el)return;
  analyzerText=el.value;
  if(!analyzerText||analyzerText.length<20){
    alert('Paste more T&C text');
    return
  }
  analyzerResult=analyzeTC(analyzerText);
  analyzerIsBiz=/\bbusiness\b/i.test(analyzerText)||/\bbusiness\b/i.test((analyzerResult&&analyzerResult.acctType)||'')||/\bbusiness\b/i.test((analyzerResult&&analyzerResult.bankName)||'');
  if(analyzerResult&&analyzerResult.bankName)saveReq(formatAnalyzedBankName(analyzerResult.bankName||analyzerResult.acctType||'Unknown',analyzerIsBiz),analyzerResult);
  if(!analyzerResult||Object.keys(analyzerResult).length<2)alert('Could not extract enough data. Try pasting more of the full terms & conditions.');
  R()
}

function timerCountdownDays(item){
  if(!item||!item.date||item.done)return null;
  return dB(td(),item.date)
}

function timerCountdownMeta(item){
  if(item?.done)return{
    cls:'gray',text:'Done'
  };
  if(!item||!item.date)return{
    cls:'amber',text:'No date'
  };
  const days=timerCountdownDays(item);
  if(days===null)return{
    cls:'amber',text:'No date'
  };
  if(days<0)return{
    cls:'red',text:`Overdue ${Math.abs(days)}d`
  };
  if(days===0)return{
    cls:'red',text:'Due today'
  };
  if(days<=7)return{
    cls:'red',text:`${days}d left`
  };
  if(days<=14)return{
    cls:'amber',text:`${days}d left`
  };
  return{
    cls:'green',text:`${days}d left`
  }
  
}

function sortCustomTimers(list){
  const src=normalizeTimerList(list);
  return [...src].sort((a,b)=>{const ad=a?.done?1:0,bd=b?.done?1:0;if(ad!==bd)return ad-bd;return (a?.date||'9999-12-31').localeCompare(b?.date||'9999-12-31')})
}

function timerDueFromStart(startDate,daysRequired){
  const n=parseInt(daysRequired,10)||0;
  if(!startDate||n<=0)return'';
  return addD(startDate,n)
}

function timerMetaLine(t){
  const due=t?.date||'';
  const start=t?.startDate||'';
  const days=parseInt(t?.daysRequired||0,10)||0;
  if(start&&days&&due)return 'Start + Days: '+fD(start)+' • '+days+'d • Due: '+fD(due);
  if(due)return 'Due Date: '+fD(due);
  return 'No date set'
}

function runInlineAnalyze(){
  const el=document.getElementById('inline_tc');
  if(!el||el.value.length<20){
    alert('Paste more T&C text');
    return
  }
  if(typeof window.tcV3Analyze==='function'){
    const r=window.tcV3Analyze(el.value,{noGlobalFallback:true});
    inlineResult=r;
    if(r){
      if(window.tcV3ApplyToModal)window.tcV3ApplyToModal(r);
      else{
        if(r.bank&&!modal.bank)modal.bank=r.bank;
        if(r.bonus&&!modal.bonus)modal.bonus=parseInt(r.bonus)||0;
        if(r.reqDays)modal.reqDays=parseInt(r.reqDays)||0;
        if(r.reqMoney&&!modal.dataPoint)modal.dataPoint='DD '+fM(r.reqMoney)+(r.reqDays?' within '+r.reqDays+' days':'');
        if(r.code&&!modal.promoCodeText)modal.promoCodeText=r.code;
        if(r.openBy&&!modal.expirationDateText)modal.expirationDateText=fD(r.openBy);
        if(r.fee&&!modal.monthlyFeeYNText)modal.monthlyFeeYNText='Yes — '+fM(r.fee)+' monthly fee';
        if(r.waivers?.length&&!modal.avoidMonthlyFeeText)modal.avoidMonthlyFeeText=r.waivers.join('\n');
        if(r.actionPlan&&!modal.completeBonusText)modal.completeBonusText=r.actionPlan;
        if(r.reqDays&&!modal.requiredDaysText)modal.requiredDaysText=String(r.reqDays);
      }
      if(!modal.analyzedTC){
        modal.analyzedTC=['Analyzer result',r.actionPlan||'',r.reviewFlags?.length?('Review: '+r.reviewFlags.join(' | ')):''].filter(Boolean).join('\n');
      }
      R();
      return;
    }
  }
  inlineResult=analyzeTC(el.value);
  if(inlineResult){
    if(inlineResult.notesForTracker)modal.analyzedTC=inlineResult.notesForTracker;
    if(inlineResult.bonusAmount&&!modal.bonus)modal.bonus=parseInt(String(inlineResult.bonusAmount).replace(/[$,]/g,''))||0;
    if(inlineResult.churnMonths&&!modal.churn)modal.churn=inlineResult.churnMonths<=6?'180':inlineResult.churnMonths<=12?'1':inlineResult.churnMonths<=24?'2':'3';
    if(inlineResult.earlyCloseDays)modal.minHoldDays=parseInt(inlineResult.earlyCloseDays)||0;
    if(inlineResult.earlyCloseFee)modal.earlyCloseFee=parseInt(String(inlineResult.earlyCloseFee).replace(/[$,]/g,''))||0;
    if(inlineResult.ddAmount||inlineResult.debitTxns)modal.dataPoint=[inlineResult.ddAmount?'DD '+inlineResult.ddAmount:'',inlineResult.debitTxns?inlineResult.debitTxns+' debit txns':''].filter(Boolean).join(' + ');
    if(inlineResult.promoCode&&!modal.dataPoint)modal.dataPoint='Promo: '+inlineResult.promoCode;
    if(inlineResult.timelineDays)modal.reqDays=inlineResult.timelineDays;
    if(inlineResult.minDaysOpen&&!modal.minHoldDays)modal.minHoldDays=inlineResult.minDaysOpen;
    const __simple=buildSimpleAutoFill(inlineResult);
    if(__simple.monthlyFeeYNText&&!modal.monthlyFeeYNText)modal.monthlyFeeYNText=__simple.monthlyFeeYNText;
    if(__simple.promoCodeText&&!modal.promoCodeText)modal.promoCodeText=__simple.promoCodeText;
    if(__simple.avoidMonthlyFeeText&&!modal.avoidMonthlyFeeText)modal.avoidMonthlyFeeText=__simple.avoidMonthlyFeeText;
    if(__simple.completeBonusText&&!modal.completeBonusText)modal.completeBonusText=__simple.completeBonusText;
    if(__simple.earlyTerminationFeeText&&!modal.earlyTerminationFeeText)modal.earlyTerminationFeeText=__simple.earlyTerminationFeeText;
    if(__simple.eligibilityText&&!modal.eligibilityText)modal.eligibilityText=__simple.eligibilityText;
    if(__simple.expirationDateText&&!modal.expirationDateText)modal.expirationDateText=__simple.expirationDateText;
    if(__simple.requiredDaysText&&!modal.requiredDaysText)modal.requiredDaysText=__simple.requiredDaysText;
    if(inlineResult.bankName&&!modal.bank)modal.bank=inlineResult.bankName
  }
  else{
    alert('Could not extract data. Paste more of the full T&C.')
  }
  R()
}

function normalizeRestoredEntry(e){
  const x=(e&&typeof e==='object')?{
    ...e
  }
  :{};
  x.bank=String(x.bank||'').trim();
  x.bonus=parseInt(x.bonus||0,10)||0;
  x.churn=x.churn||'';
  x.opened=x.opened||'';
  x.closed=x.closed||'';
  x.bonusRecd=x.bonusRecd||'';
  x.reqMet=x.reqMet||'';
  x.notes=x.notes||'';
  x.analyzedTC=x.analyzedTC||'';
  x.minHoldDays=parseInt(x.minHoldDays||0,10)||0;
  x.earlyCloseFee=parseInt(x.earlyCloseFee||0,10)||0;
  x.dataPoint=x.dataPoint||'';
  x.reqDays=parseInt(x.reqDays||0,10)||0;
  x.referralBonus=parseInt(x.referralBonus||0,10)||0;
  x.plannedClose=x.plannedClose||'';
  x.phoneNum=x.phoneNum||'';
  x.feeChecked=!!x.feeChecked;
  x.monthlyFeeYNText=x.monthlyFeeYNText||'';
  x.promoCodeText=x.promoCodeText||'';
  x.avoidMonthlyFeeText=x.avoidMonthlyFeeText||'';
  x.completeBonusText=x.completeBonusText||'';
  x.earlyTerminationFeeText=x.earlyTerminationFeeText||'';
  x.eligibilityText=x.eligibilityText||'';
  x.expirationDateText=x.expirationDateText||'';
  x.requiredDaysText=x.requiredDaysText||'';
  x.checklist=Array.isArray(x.checklist)?x.checklist:[];
  x.customTimers=normalizeTimerList(x.customTimers);
  return x
}

function buildPortableBackupPayload(){
  const userDatapoints=loadUserDatapoints();
  const communityDatapoints=loadCommunityDatapoints();
  const phoneEdits=loadPhoneEdits();
  const reqs=loadReqs();
  const profileEvents=loadProfileEvents();
  const snapshot=buildStorageSnapshot();
  return{
    app:'Bank Bonus Tracker',
    appVersion:APP_VERSION,
    backupType:'full-fidelity-portable',
    schemaVersion:'v11-backup-restore-hardened',
    exportedAt:new Date().toISOString(),
    entryCount:Array.isArray(entries)?entries.length:0,
    userDatapointCount:userDatapoints.length,
    communityDatapointCount:communityDatapoints.length,
    requirementCount:Object.keys(reqs||{}).length,
    phoneCount:phoneEdits.length,
    profileEventCount:profileEvents.length,
    prefs:{
      dashYear,taxYear
    },
    entries:(entries||[]).map(e=>({...e})),
    userDatapoints:[...userDatapoints],
    ddMethods:[...loadDD()],
    communityDatapoints:[...communityDatapoints],
    bankReqs:{
      ...reqs
    },
    phoneBook:[...phoneEdits],
    profileEvents:[...profileEvents],
    storageSnapshot:snapshot,
    manifest:{
      includesProfiles:false,
      includesProfileHistory:true,
      includesTrackerEntries:true,
      includesUserDatapoints:true,
      includesCommunityDatapoints:true,
      includesSavedRequirements:true,
      includesPhoneBook:true,
      includesProfileEvents:true,
      includesStorageSnapshot:true,
      storageKeys:Object.keys(snapshot)
    }

  }

}

function describeBackupPayload(d){
  const when=(d?.exportedAt||d?.createdAt)?new Date(d.exportedAt||d.createdAt).toLocaleString():'';
  const type=d?.backupType||d?.backupVersion||d?.kind||'unknown';
  return['Backup date: '+(when||'Unknown'),'Backup type: '+type,'Entries: '+countBackupEntries(d),'Your datapoints: '+countBackupUserDatapoints(d),'Community datapoints: '+countBackupCommunityDatapoints(d),'Saved bank requirements: '+countBackupReqs(d),'Saved phone entries: '+countBackupPhones(d),'Profile events: '+countBackupProfileEvents(d)].join('\n')
}


function normalizeBackupStorageSnapshot(d){
  const source=(d&&typeof d==='object')?(d.storageSnapshot||d.localStorage||d.storage||null):null;
  const out={};
  if(!source||typeof source!=='object')return out;
  Object.entries(source).forEach(([key,val])=>{
    if(!getBackupStorageKeys().includes(key))return;
    out[key]=typeof val==='string'?parseBackupStorageValue(val):val;
  });
  return out;
}
function backupArrayFromStorage(d,key){
  const snap=normalizeBackupStorageSnapshot(d);
  const v=snap[key];
  if(Array.isArray(v))return v;
  if(typeof v==='string'){try{const p=JSON.parse(v);return Array.isArray(p)?p:[]}catch{}}
  return [];
}
function backupObjectFromStorage(d,key){
  const snap=normalizeBackupStorageSnapshot(d);
  const v=snap[key];
  if(v&&typeof v==='object'&&!Array.isArray(v))return v;
  if(typeof v==='string'){try{const p=JSON.parse(v);return p&&typeof p==='object'&&!Array.isArray(p)?p:{}}catch{}}
  return {};
}
function normalizePortableBackupInput(d){
  if(!d||typeof d!=='object')throw new Error('Invalid backup file.');
  if(Array.isArray(d.entries))return d;
  const snapshot=normalizeBackupStorageSnapshot(d);
  if(Array.isArray(snapshot[SK])){
    return{
      app:d.app||'Bank Bonus Tracker',
      appVersion:d.appVersion||d.version||'legacy',
      backupType:d.backupType||d.backupVersion||'legacy-full-storage',
      schemaVersion:d.schemaVersion||'legacy-storage',
      exportedAt:d.exportedAt||d.createdAt||'',
      prefs:d.prefs||{},
      entries:snapshot[SK]||[],
      userDatapoints:snapshot[DP_USER_KEY]||snapshot[DD_KEY]||[],
      ddMethods:snapshot[DD_KEY]||[],
      communityDatapoints:snapshot[COMMUNITY_DP_KEY]||[],
      bankReqs:snapshot[REQ_KEY]||{},
      phoneBook:snapshot[PHONE_KEY]||[],
      profileEvents:snapshot[PROFILE_EVT_KEY]||[],
      storageSnapshot:snapshot,
      legacySource:true
    };
  }
  throw new Error('Backup file is missing entries.');
}
function applyPortableRestore(d){
  d=normalizePortableBackupInput(d);
  const restoredEntries=Array.isArray(d.entries)?d.entries:(Array.isArray(d?.storageSnapshot?.[SK])?d.storageSnapshot[SK]:null);
  if(!Array.isArray(restoredEntries))throw new Error('Backup file is missing entries.');
  const cleaned=restoredEntries.map(normalizeRestoredEntry).filter(e=>e.bank);
  const repaired=repairEntryIds(cleaned);
  entries=sortE(repaired.items);
  sv(SK,entries);

  const userPoints=Array.isArray(d.userDatapoints)?d.userDatapoints:(Array.isArray(d.ddMethods)?d.ddMethods:backupArrayFromStorage(d,DP_USER_KEY));
  saveDD(userPoints);

  const communityRows=Array.isArray(d.communityDatapoints)?d.communityDatapoints:backupArrayFromStorage(d,COMMUNITY_DP_KEY);
  saveCommunityDatapoints(communityRows);

  const reqRows=d.bankReqs&&typeof d.bankReqs==='object'?d.bankReqs:backupObjectFromStorage(d,REQ_KEY);
  saveReqs(reqRows);

  const phoneRows=Array.isArray(d.phoneBook)?d.phoneBook:backupArrayFromStorage(d,PHONE_KEY);
  savePhoneEdits(phoneRows);

  const profileRows=Array.isArray(d.profileEvents)?d.profileEvents:backupArrayFromStorage(d,PROFILE_EVT_KEY);
  saveProfileEvents(profileRows);

  restoreStorageSnapshot(d.storageSnapshot||normalizeBackupStorageSnapshot(d));
  sv(SK,entries);
  saveDD(userPoints);
  saveCommunityDatapoints(communityRows);
  saveReqs(reqRows);
  savePhoneEdits(phoneRows);
  saveProfileEvents(profileRows);

  try{localStorage.setItem('bt_last_restore',new Date().toISOString())}catch{}
  if(d.prefs&&Number.isFinite(parseInt(d.prefs.dashYear,10)))dashYear=parseInt(d.prefs.dashYear,10);
  else dashYear=new Date().getFullYear();
  if(d.prefs&&Number.isFinite(parseInt(d.prefs.taxYear,10)))taxYear=parseInt(d.prefs.taxYear,10);
  else taxYear=new Date().getFullYear();
  setLastBk();
  cfm={
    title:'Restore Complete',msg:`${entries.length} entries restored.\n${countBackupUserDatapoints(d)} datapoints restored.\n${countBackupProfileEvents(d)} profile events restored.\n\nThis backup is now ready on this browser/device.`,green:true,action:()=>{
      cfm=null;
      R()
    }

  };
  R()
}

function importBackup(){
  const inp=document.createElement('input');
  inp.type='file';
  inp.accept='.json';
  inp.onchange=function(ev){
    const f=ev.target.files&&ev.target.files[0];
    if(!f)return;
    const reader=new FileReader();
    reader.onload=async function(e){
      try{
        const data=JSON.parse(e.target.result);
        const ok=window.confirm(`Restore this full backup?\n\n${describeBackupPayload(data)}\n\nSafety upgrade: before restore, the app will export your current device data as a pre-restore backup. Then it will replace the current data on this device.`);
        if(!ok)return;
        try{
          await exportBackup(false,buildPortableBackupPayload(),'BankBonusTracker_PreRestore_'+backupTimestamp()+'.json')
        }
        catch{}
        applyPortableRestore(data)
      }
      catch(err){
        alert('Invalid or unsupported backup file.')
      }
      
    };
    reader.readAsText(f)
  };
  inp.click()
}

function exportCSV(yr){
  const yrE=taxEntriesForYear(yr);
  let csv='Bank,Bonus,Received,Opened,Closed,Data Point\n';
  yrE.forEach(e=>{csv+='"'+e.bank+'",'+e.bonus+',"'+fD(e.bonusRecd)+'","'+fD(e.opened)+'","'+fD(e.closed)+'","'+(e.dataPoint||'').replace(/"/g,"'")+'"\n'});csv+='\nTotal,'+yrE.reduce((s,e)=>s+(e.bonus||0),0)+'\n';const blob=new Blob([csv],{type:'text/csv'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='BonusTracker_'+yr+'.csv';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url)}
function promptExportYear(){const raw=window.prompt('Enter the year you want to export:', String(taxYear||new Date().getFullYear()));if(raw===null)return;const yr=parseInt(String(raw).trim(),10);if(!Number.isFinite(yr)||yr<1900||yr>2100){alert('Please enter a valid 4-digit year.');return}exportCSV(yr)}
function loadFeed(){feedLoading=true;R();fetch('https://api.allorigins.win/get?url='+encodeURIComponent('https://www.doctorofcredit.com/category/bank-account-bonuses/feed/')).then(r=>r.json()).then(d=>{const p=new DOMParser(),x=p.parseFromString(d.contents,'text/xml'),items=x.querySelectorAll('item');feedItems=[];items.forEach((it,i)=>{if(i>=12)return;feedItems.push({title:it.querySelector('title')?.textContent||'',link:it.querySelector('link')?.textContent||'',date:it.querySelector('pubDate')?.textContent||''})});feedLoading=false;R()}).catch(()=>{feedItems=null;feedLoading=false;R()})}
entries=sortE(entries);R();

/* === Consolidated core module: Core UI stability (moved into app.js in v3.3.36) === */
/*
 * filename: scripts/ui-stability-module.js
 * version: 3.3.16
 * consolidated-purpose: Safari crash-safe UI module and v3-aware smoke check.
 * last-touched: 2026-05-02
 */
(function(){
  const VER = '3.3.16';

  function entriesReady(){
    try { return Array.isArray(entries); } catch { return Array.isArray(window.entries); }
  }

  window.btSmokeCheck = function(){
    return {
      version: VER,
      appRoot: !!document.getElementById('app'),
      storageReady: typeof sv === 'function' && typeof SK !== 'undefined',
      entriesReady: entriesReady(),
      renderReady: typeof R === 'function',
      analyzerEngineReady: typeof tcV3Analyze === 'function' || typeof tcStrictAnalyze === 'function',
      analyzerProReady: typeof tcOpenPro === 'function' && typeof tcRunPro === 'function' && typeof tcApplyPro === 'function',
      analyzerTimerReady: typeof tcCreateTimers === 'function' || typeof tcV3CreateTimers === 'function',
      analyzerSourceReady: typeof tcV3ResolveSource === 'function' && typeof tcV3SaveSourceForCurrentEntry === 'function',
      profileLibraryReady: typeof tcV31OpenProfileLibrary === 'function' || typeof tcV32OpenLearningInbox === 'function',
      bankActionsReady: typeof openBankActions === 'function' && typeof runBankAction === 'function',
      timerModalReady: typeof openTimerEditor === 'function' && typeof saveTimerEditor === 'function'
    };
  };

  if (!document.getElementById('ui_stability_module_style')) {
    const st = document.createElement('style');
    st.id = 'ui_stability_module_style';
    st.textContent = `
      .tca-box .tm-pill{min-width:8px!important;width:8px!important;height:8px!important;padding:0!important;border-radius:999px!important;font-size:0!important;overflow:hidden!important;vertical-align:middle!important;margin-left:4px!important;display:inline-block!important}
      .tca-box .tm-pill::before{content:'';display:block;width:8px;height:8px;border-radius:999px}.tca-box .tm-pill.green::before{background:#10B981}.tca-box .tm-pill.amber::before{background:#F59E0B}.tca-box .tm-pill.red::before{background:#EF4444}
      .tcr-bg{align-items:flex-end!important;overflow:hidden!important}
      .tcr-sheet{max-height:calc(100dvh - max(env(safe-area-inset-top,0px),8px))!important;overflow-y:auto!important;-webkit-overflow-scrolling:touch!important;contain:paint!important;transform:translateZ(0)!important}
      .tcr-actions{position:static!important;display:flex!important;gap:10px!important;margin:16px 0 8px!important;padding:0 0 calc(10px + env(safe-area-inset-bottom,0px))!important;background:transparent!important;box-shadow:none!important;z-index:auto!important}
      .tcr-actions button{min-height:56px!important;border-radius:16px!important;flex:1!important}
      @media(max-width:700px){
        .tcr-sheet{max-width:100%!important;border-radius:22px 22px 0 0!important;padding:9px 12px calc(18px + env(safe-area-inset-bottom,0px))!important}
        .tcr-grid{grid-template-columns:1fr!important;gap:8px!important}
        .tcr-summary{grid-template-columns:1fr 1fr!important;gap:7px!important}
        .tcr-field,.tcr-field.wide{grid-column:1/-1!important;margin-bottom:9px!important}
        .tcr-field input,.tcr-field textarea,.tcr-field select{font-size:16px!important;min-height:52px!important;line-height:1.35!important;white-space:normal!important;text-overflow:clip!important;overflow:visible!important}
        .tcr-field textarea{min-height:132px!important;max-height:220px!important;overflow-y:auto!important;resize:none!important}
        .tcr-section{border-radius:18px!important;padding:12px!important;margin:10px 0!important}
        .tcr-hero{border-radius:20px!important;padding:13px!important}
        .tcr-hero h3{font-size:18px!important}
        .tcr-hero p{font-size:11px!important}
        .tcr-chip b{font-size:12px!important}
      }
    `;
    document.head.appendChild(st);
  }
})();
/* === End consolidated core module: Core UI stability === */

/* === Consolidated core module: Reviewed-entry field polish (moved into app.js in v3.3.36) === */
/*
 * filename: scripts/field-polish-module.js
 * version: 2.7.9
 * consolidated-purpose: Rename promo date label to Promo Expiration / Open-by Date with crash-safe one-time polish.
 * last-touched: unknown
 */
(function(){
  const VER = '2.7.9';
  const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const clean = v => String(v || '').replace(/\s+/g, ' ').trim();
  const money = n => '$' + Number(n || 0).toLocaleString();
  const num = v => {
    const m = String(v || '').replace(/[$,\s]/g,'').match(/-?\d+(?:\.\d+)?/);
    const n = m ? parseFloat(m[0]) : 0;
    return Number.isFinite(n) ? n : 0;
  };

  function addDaysIso(start, days){
    try { if (typeof timerDueFromStart === 'function') return timerDueFromStart(start, days); } catch {}
    try { if (typeof addD === 'function') return addD(start, days); } catch {}
    const d = new Date(String(start) + 'T00:00:00');
    d.setDate(d.getDate() + (parseInt(days,10) || 0));
    return d.toISOString().split('T')[0];
  }
  function payoutDaysFromText(txt){
    txt = String(txt || '');
    if(/within\s+15|fifteen/i.test(txt)) return 15;
    if(/within\s+30|thirty|up to\s+30/i.test(txt)) return 30;
    if(/within\s+60|sixty/i.test(txt)) return 60;
    if(/120th day|day\s*120/i.test(txt)) return 30;
    return 0;
  }
  function timerIdLocal(){
    try { if (typeof timerId === 'function') return timerId(); } catch {}
    return 'tm_' + Math.random().toString(36).slice(2,8) + Date.now().toString(36).slice(-4);
  }
  function makeTimer(text, date, startDate='', daysRequired=0){
    const raw = { id:timerIdLocal(), text, startDate:startDate || '', daysRequired:Number(daysRequired || 0), date:date || '', done:false };
    try { return typeof normalizeTimer === 'function' ? normalizeTimer(raw) : raw; } catch { return raw; }
  }
  function getVal(id){ return document.getElementById(id)?.value || ''; }
  function getNum(id){ return num(getVal(id)); }
  function checked(id){ return !!document.getElementById(id)?.checked; }
  function rawTerms(){
    const values = qsa('textarea').map(a => a.value || '').filter(v => /bonus|qualifying|direct deposit|monthly service fee|monthly account fee|offer|promo|checking/i.test(v));
    values.sort((a,b)=>b.length-a.length);
    return values[0] || '';
  }
  function inferHoldDays(){
    const payout = clean(getVal('tcr_payout'));
    const explicit = parseInt(getVal('tcr_holddays'),10) || 0;
    if (explicit) return explicit;
    if (/120/.test(payout)) return 120;
    return 0;
  }
  function pretty(iso){
    if (!iso) return '';
    try { return typeof fD === 'function' ? fD(iso) : iso; } catch { return iso; }
  }
  function inferBank(raw){
    const text = String(raw || '');
    if (/Morgan Stanley Private Bank|E\*TRADE/i.test(text)) return 'Morgan Stanley Private Bank';
    if (/Wells Fargo/i.test(text)) return 'Wells Fargo';
    if (/U\.S\. Bank|US Bank/i.test(text)) return 'U.S. Bank';
    if (/Bank of America|BofA/i.test(text)) return 'Bank of America';
    if (/Capital One/i.test(text)) return 'Capital One';
    if (/Chase/i.test(text)) return 'Chase';
    if (/Citi(?:bank)?/i.test(text)) return 'Citibank';
    if (/PNC/i.test(text)) return 'PNC Bank';
    const m = text.match(/(?:from|with|by)\s+([A-Z][A-Za-z&.'’\- ]{2,80}?(?:Bank|Credit Union|Private Bank))/);
    return m ? clean(m[1]) : 'New Bank Bonus';
  }
  function newRecordId(bank){
    try { if (typeof genId === 'function') return genId(bank, new Set((entries || []).map(e => e.id))); } catch {}
    return 'BNK-P-' + Date.now().toString().slice(-6);
  }
  function textPlan(){
    const lines = [];
    const promo = clean(getVal('tcr_promo'));
    const fundedDays = parseInt(getVal('tcr_funded_days'), 10) || 0;
    const count = parseInt(getVal('tcr_dd_count'), 10) || 0;
    const reqMoney = getNum('tcr_req_money');
    const reqDays = parseInt(getVal('tcr_req_days'), 10) || 0;
    const payout = clean(getVal('tcr_payout'));
    lines.push(`1. Open one eligible account${promo ? ` using promo code ${promo}` : ''}.`);
    if (fundedDays) lines.push(`${lines.length + 1}. Fund the account within ${fundedDays} days to keep it open.`);
    lines.push(`${lines.length + 1}. Receive ${count ? `at least ${count} ` : ''}qualifying Direct Deposits${reqMoney ? ` of ${money(reqMoney)}+ each` : ''}${reqDays ? ` within ${reqDays} days of account opening` : ''}.`);
    lines.push(`${lines.length + 1}. Bonus payout: ${payout || 'review payout timing'}.`);
    lines.push(`${lines.length + 1}. Keep account open and in good standing until payout.`);
    return lines.join('\n');
  }
  function buildTimers(){
    const timers = [];
    const opened = clean(getVal('tcr_opened'));
    const raw = rawTerms();
    let parsed = {};
    try { if (typeof tcStrictAnalyze === 'function') parsed = tcStrictAnalyze(raw); } catch {}
    if (checked('tcr_timer_promo') && parsed.openBy) timers.push(makeTimer('Promo expiration / open-by deadline', parsed.openBy));
    const reqDays = parseInt(getVal('tcr_req_days'), 10) || 0;
    const fundedDays = parseInt(getVal('tcr_funded_days'), 10) || 0;
    const holdDays = inferHoldDays();
    if (checked('tcr_timer_fund') && fundedDays) timers.push(makeTimer('Deposit new money / funding deadline', opened ? addDaysIso(opened, fundedDays) : '', opened, fundedDays));
    if (checked('tcr_timer_payout') && holdDays) timers.push(makeTimer('Maintain required balance / hold check', opened ? addDaysIso(opened, holdDays) : '', opened, holdDays));
    if (checked('tcr_timer_req') && reqDays) timers.push(makeTimer(parsed.requirementType==='transactions'?'Complete qualifying transactions':'Bonus requirement deadline', opened ? addDaysIso(opened, reqDays) : '', opened, reqDays));
    const payoutDays = payoutDaysFromText(clean(getVal('tcr_payout')));
    if (reqDays && payoutDays) timers.push(makeTimer('Bonus payout watch', opened ? addDaysIso(opened, reqDays + payoutDays) : '', opened, reqDays + payoutDays));
    if (reqDays && payoutDays) timers.push(makeTimer('Close review after payout', opened ? addDaysIso(opened, reqDays + payoutDays + 5) : '', opened, reqDays + payoutDays + 5));
    const seen = new Set();
    return timers.filter(t => { const k=(t.text||'').toLowerCase()+'|'+(t.daysRequired||'')+'|'+(t.date||''); if(seen.has(k))return false; seen.add(k); return true; });
  }

  function renamePromoDateLabel(){
    const sheet = document.querySelector('.tcr-sheet');
    if (!sheet || !sheet.textContent.includes('Auto-fill New Entry')) return;
    const openBy = document.getElementById('tcr_openby');
    const label = openBy?.closest('.tcr-field')?.querySelector('label');
    if (label) label.textContent = 'Promo Expiration / Open-by Date';
    qsa('.tcr-timer-row b', sheet).forEach(b => {
      if (/promo\/open-by deadline/i.test(b.textContent || '')) b.textContent = 'Promo expiration / open-by deadline';
    });
  }

  function ensureHiddenCompatFields(){
    const sheet = document.querySelector('.tcr-sheet');
    if (!sheet || !sheet.textContent.includes('Auto-fill New Entry')) return;
    renamePromoDateLabel();
    if (!document.getElementById('tcr_earlyfee')) sheet.insertAdjacentHTML('beforeend','<input id="tcr_earlyfee" type="hidden" value="0">');
    if (!document.getElementById('tcr_holddays')) {
      const payout = clean(getVal('tcr_payout'));
      const defaultHold = /120/.test(payout) ? 120 : '';
      sheet.insertAdjacentHTML('beforeend',`<input id="tcr_holddays" type="hidden" value="${defaultHold}">`);
    }
  }

  function createReviewedEntry(){
    const sheet = document.querySelector('.tcr-sheet');
    if (!sheet || !sheet.textContent.includes('Auto-fill New Entry')) return false;
    ensureHiddenCompatFields();
    const raw = rawTerms();
    let parsed = {};
    try { if (typeof tcStrictAnalyze === 'function') parsed = tcStrictAnalyze(raw); } catch {}
    const bank = clean(getVal('tcr_bank')) || parsed.bank || inferBank(raw);
    const bonus = getNum('tcr_bonus');
    if (!bank) { alert('Bank name is required.'); return true; }
    if (!bonus) { alert('Bonus amount is missing. Review before saving.'); return true; }

    const reqDays = parseInt(getVal('tcr_req_days'), 10) || 0;
    const holdDays = inferHoldDays();
    const earlyFee = getNum('tcr_earlyfee');
    const payout = clean(getVal('tcr_payout'));
    const notCounts = clean(getVal('tcr_not_counts'));
    const notesParts = ['Created from T&C Analyzer Pro Review Form. Review all fields before opening/applying.'];
    if (notCounts) notesParts.push('Does NOT count: ' + notCounts.replace(/\n/g, '; '));
    if (payout) notesParts.push('Payout: ' + payout);
    if (holdDays) notesParts.push('Hold until: ' + holdDays + ' days after opening before closing.');

    const fundedDays = parseInt(getVal('tcr_funded_days'), 10) || 0;
    const fundingAmount = getNum('tcr_funding_amount') || getNum('tcr_requirement_amount');
    const entry = {
      bank, accountType:normalizeAccountType(parsed.accountType)||inferAccountTypeForEntry({bank,analyzedTC:raw})||'personal', bonus, churn: parsed.prior ? 1 : '',
      opened: clean(getVal('tcr_opened')), bonusRecd: '', closed: '', dataPoint: clean(getVal('tcr_counts')),
      notes: notesParts.join('\n'), reqDays, minHoldDays: holdDays, earlyCloseFee: earlyFee,
      fundedDays, fundingAmount, fundingAmountText: fundingAmount ? money(fundingAmount) : '', payoutTimingText: payout,
      feeChecked: false, plannedClose: '', customTimers: buildTimers(),
      monthlyFeeYNText: getNum('tcr_fee') ? `Yes — ${money(getNum('tcr_fee'))} monthly fee` : 'Not clearly stated in pasted T&C',
      promoCodeText: clean(getVal('tcr_promo')),
      avoidMonthlyFeeText: clean(getVal('tcr_waivers')),
      completeBonusText: clean(getVal('tcr_complete')) || textPlan(),
      earlyTerminationFeeText: earlyFee ? String(earlyFee) : '0',
      eligibilityText: clean(getVal('tcr_eligibility')),
      expirationDateText: clean(getVal('tcr_openby')) ? pretty(clean(getVal('tcr_openby'))) : '',
      requiredDaysText: reqDays ? String(reqDays) : ''
    };

    try {
      hydrateTimersFromOpened(entry);
      if (typeof handleDuplicateFlow === 'function' && handleDuplicateFlow(entry,'analyzer-review')) {
        document.getElementById('tc_review_overlay')?.remove();
        if (typeof R === 'function') R();
        setTimeout(() => alert('Matching bank found. Choose replace existing, edit existing, or create separate entry.'), 80);
        return true;
      }
      const next = typeof assignEntryIdForCreate === 'function' ? assignEntryIdForCreate({...entry,checklist:[],customTimers:normalizeTimerList(entry.customTimers||[])}) : {...entry,id:newRecordId(bank),checklist:[]};
      hydrateTimersFromOpened(next);
      const before = Array.isArray(entries) ? entries.map(e=>({...e})) : [];
      entries.unshift(next);
      entries = typeof sortE === 'function' ? sortE(entries) : entries;
      const savedOk = typeof saveEntriesStrict === 'function' ? saveEntriesStrict(entries) : (typeof sv === 'function' && typeof SK !== 'undefined' ? (sv(SK, entries), true) : true);
      if(!savedOk){ entries = before; return true; }
      if (typeof syncProfileEventsFromEntry === 'function') syncProfileEventsFromEntry(next);
      if (typeof refreshSavedReqFromEntry === 'function') refreshSavedReqFromEntry(next);
      document.getElementById('tc_review_overlay')?.remove();
      if (typeof R === 'function') R();
      setTimeout(() => alert('New entry created for ' + next.bank + (next.customTimers.length ? ` with ${next.customTimers.length} mini timer(s).` : '. Add Opened Date later to auto-create requirement timers.') + ' Review the entry before opening/applying.'), 80);
    } catch (err) {
      console.error('[field-polish-module]', err);
      alert('Could not create the entry. Refresh and try again.');
    }
    return true;
  }

  document.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (/Create Entry \+ Timers/i.test(btn.textContent || '') && document.querySelector('.tcr-sheet')?.textContent.includes('Auto-fill New Entry')) {
      e.preventDefault(); e.stopImmediatePropagation(); createReviewedEntry(); return;
    }
    setTimeout(ensureHiddenCompatFields, 120);
    setTimeout(renamePromoDateLabel, 320);
  }, true);

  if (!document.getElementById('field_polish_module_style')) {
    const st = document.createElement('style');
    st.id = 'field_polish_module_style';
    st.textContent = `.app-version::after{content:' · Safe';opacity:.78}.manual-record-pill{display:inline-flex;align-items:center;gap:4px;margin:0 0 8px 2px;padding:6px 9px;border-radius:999px;background:#EEF2FF;color:#475569;font-size:10px;font-weight:900;letter-spacing:.5px}`;
    document.head.appendChild(st);
  }
})();
/* === End consolidated core module: Reviewed-entry field polish === */

/* === Consolidated core module: Action button safety and full backup helpers (moved into app.js in v3.3.36) === */
/*
 * filename: scripts/action-button-safety-fix.js
 * version: 3.3.2
 * consolidated-purpose: Stable action safety + full device-transfer backup/restore. No version badge control.
 * last-touched: unknown
 */
(function(){
  const VER='3.3.46';
  const BACKUP_KIND='bonus-tracker-full-device-backup';
  const APP_PREFIX='bt_';
  const KNOWN_KEYS=[
    'bt_e_v4','bt_t_v4','bt_dd_methods','bt_bank_reqs','bt_last_backup','bt_last_restore','bt_phone_book_v1','bt_user_datapoints_v1','bt_community_datapoints_v1','bt_community_datapoints_seed_v2','bt_profile_events_v1','bt_tc_learning_inbox_v320'
  ];

  function addStyle(){
    let st=document.getElementById('bt_action_button_safety_style');
    if(!st){st=document.createElement('style');st.id='bt_action_button_safety_style';document.head.appendChild(st);}
    st.textContent=`button,[role="button"],a,input[type="button"],input[type="submit"]{touch-action:manipulation}`;
  }
  function cleanup(){
    const menu=document.getElementById('bt_tools_folder_menu');
    if(!menu||menu.hasAttribute('hidden')) document.getElementById('bt_tools_backdrop')?.remove();
    ['v32_inbox_btn','v31_profile_btn'].forEach(id=>{const el=document.getElementById(id);if(el){el.style.display='none';el.style.pointerEvents='none';}});
  }
  function buttonInfo(){
    return Array.from(document.querySelectorAll('button,a,[role="button"],input[type="button"],input[type="submit"]')).map((el,i)=>{
      const r=el.getBoundingClientRect();
      const s=getComputedStyle(el);
      const text=(el.textContent||el.value||el.getAttribute('aria-label')||el.getAttribute('title')||'').trim().replace(/\s+/g,' ').slice(0,60);
      return {i,text,tag:el.tagName,id:el.id||'',class:String(el.className||''),visible:r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden',pointerEvents:s.pointerEvents,rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}};
    }).filter(x=>x.visible);
  }

  function todayStamp(){const d=new Date();const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'-'+p(d.getHours())+p(d.getMinutes());}
  function hashString(str){let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h+=(h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24);}return (h>>>0).toString(16).padStart(8,'0');}
  function safeJson(v,d){try{return JSON.parse(v)}catch{return d}}
  function storageSnapshot(){
    const out={};
    for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k)out[k]=localStorage.getItem(k);}
    try{if(Array.isArray(entries))out.bt_e_v4=JSON.stringify(entries)}catch{}
    return out;
  }
  function countFrom(storage,key){const parsed=safeJson(storage[key],null);if(Array.isArray(parsed))return parsed.length;if(parsed&&typeof parsed==='object')return Object.keys(parsed).length;return 0;}
  function makeBackupPayload(reason='manual'){
    const localStorageData=storageSnapshot();
    const summary={
      entries:countFrom(localStorageData,'bt_e_v4'),
      taxOrTimers:countFrom(localStorageData,'bt_t_v4'),
      datapoints:countFrom(localStorageData,'bt_user_datapoints_v1'),
      phoneContacts:countFrom(localStorageData,'bt_phone_book_v1'),
      tcSamples:countFrom(localStorageData,'bt_tc_learning_inbox_v320'),
      profileEvents:countFrom(localStorageData,'bt_profile_events_v1'),
      totalStorageKeys:Object.keys(localStorageData).length
    };
    const payload={kind:BACKUP_KIND,backupVersion:'full-v1',app:'BonusTracker',appVersion:(window.BT_APP_VERSION||(typeof APP_VERSION!=='undefined'?APP_VERSION:VER)),createdAt:new Date().toISOString(),reason,url:location.href,userAgent:navigator.userAgent,summary,localStorage:localStorageData};
    payload.checksum=hashString(JSON.stringify(payload));
    return payload;
  }
  function downloadJson(obj,name){
    const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},1500);
  }
  function exportFullBackup(reason='manual'){
    const payload=makeBackupPayload(reason);
    try{localStorage.setItem('bt_last_backup',new Date().toISOString().split('T')[0])}catch{}
    downloadJson(payload,'bonus-tracker-full-backup-'+todayStamp()+'.json');
    setTimeout(()=>alert('Full backup saved. Keep this JSON file in iCloud Drive, Google Drive, or Files.\n\nSaved: '+payload.summary.entries+' banks, '+payload.summary.tcSamples+' T&C samples, '+payload.summary.datapoints+' datapoints.'),250);
    return payload;
  }
  function validateBackup(obj){
    if(!obj||typeof obj!=='object')return {ok:false,error:'Backup file is not valid JSON.'};
    const storage=obj.localStorage||obj.storage||null;
    if(!storage||typeof storage!=='object')return {ok:false,error:'No localStorage data found in this backup.'};
    if(obj.kind&&obj.kind!==BACKUP_KIND)return {ok:false,error:'This JSON is not a BonusTracker full backup.'};
    const hasEntries=Object.prototype.hasOwnProperty.call(storage,'bt_e_v4');
    const hasAny=Object.keys(storage).some(k=>k.startsWith(APP_PREFIX)||KNOWN_KEYS.includes(k));
    if(!hasEntries&&!hasAny)return {ok:false,error:'This backup does not contain BonusTracker app keys.'};
    return {ok:true,storage};
  }
  function restoreFromObject(obj){
    const v=validateBackup(obj);
    if(!v.ok){alert(v.error);return false;}
    const storage=v.storage;
    const entryCount=countFrom(storage,'bt_e_v4');
    const tcCount=countFrom(storage,'bt_tc_learning_inbox_v320');
    const msg='Restore this backup?\n\nThis will replace the current app data on this phone.\n\nBackup contains:\n• '+entryCount+' bank entries\n• '+tcCount+' saved T&C samples\n• '+Object.keys(storage).length+' storage keys\n\nA current backup will download first as a safety copy.';
    if(!confirm(msg))return false;
    try{exportFullBackup('pre-restore-safety-copy')}catch{}
    setTimeout(()=>{
      try{
        const existing=[];
        for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k)existing.push(k);}
        existing.forEach(k=>{if(k.startsWith(APP_PREFIX)||KNOWN_KEYS.includes(k))localStorage.removeItem(k);});
        Object.entries(storage).forEach(([k,val])=>{try{localStorage.setItem(k,String(val??''))}catch{}});
        localStorage.setItem('bt_last_restore',new Date().toISOString());
        alert('Restore complete. The app will reload now.');
        location.reload();
      }catch(e){alert('Restore failed: '+(e&&e.message?e.message:e));}
    },650);
    return true;
  }
  function chooseRestoreFile(){
    const input=document.createElement('input');input.type='file';input.accept='application/json,.json';input.style.display='none';
    input.onchange=()=>{const file=input.files&&input.files[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{restoreFromObject(JSON.parse(String(reader.result||'')))}catch(e){alert('Could not read backup JSON: '+(e&&e.message?e.message:e));}};reader.readAsText(file);setTimeout(()=>input.remove(),3000);};
    document.body.appendChild(input);input.click();
  }
  function buttonText(el){return (el.textContent||el.value||el.getAttribute('aria-label')||el.getAttribute('title')||'').trim().replace(/\s+/g,' ');}
  function hookBackupRestoreButtons(){
    if(window.__btFullBackupButtonsHooked)return;
    document.addEventListener('click',function(e){
      const btn=e.target?.closest?.('button,a,[role="button"],input[type="button"],input[type="submit"]');
      if(!btn)return;
      const txt=buttonText(btn).toLowerCase();
      if(txt==='backup'||txt.includes('backup')){e.preventDefault();e.stopImmediatePropagation();if(typeof exportBackup==='function')exportBackup(true);else exportFullBackup('manual-button');return;}
      if(txt==='restore'||txt.includes('restore')){e.preventDefault();e.stopImmediatePropagation();if(typeof importBackup==='function')importBackup();else chooseRestoreFile();return;}
    },true);
    window.__btFullBackupButtonsHooked=true;
  }
  function boot(){addStyle();cleanup();hookBackupRestoreButtons();}

  window.btActionButtonSafetyFixVersion=VER;
  window.btActionButtonHealthCheck=function(){cleanup();return {version:VER,buttons:buttonInfo(),tools:window.btToolsButtonHealthCheck?window.btToolsButtonHealthCheck():null,backup:window.btFullBackupHealthCheck?window.btFullBackupHealthCheck():null};};
  window.btFullBackupExport=(reason='manual')=>typeof exportBackup==='function'?exportBackup(true):exportFullBackup(reason);
  window.btFullBackupRestore=()=>typeof importBackup==='function'?importBackup():chooseRestoreFile();
  window.btFullBackupMakePayload=makeBackupPayload;
  window.btFullBackupHealthCheck=function(){const p=makeBackupPayload('health-check');return {version:VER,kind:BACKUP_KIND,summary:p.summary,checksum:p.checksum,keys:Object.keys(p.localStorage).length};};

  boot();
  if(typeof window.btRegisterPostRender==='function') window.btRegisterPostRender('action-button-safety',()=>{cleanup();hookBackupRestoreButtons();});
})();
/* === End consolidated core module: Action button safety and full backup helpers === */

/* === Consolidated core module: Tools folder floating menu (moved into app.js in v3.3.36) === */
/*
 * filename: scripts/tools-folder-fab.js
 * version: 3.3.13
 * consolidated-purpose: Source-clean Tools folder — native + is hidden immediately and Quick Add calls openAdd directly.
 * last-touched: unknown
 */
(function(){
  const VER='3.3.13';

  function addStyle(){
    let st=document.getElementById('bt_tools_folder_style');
    if(!st){st=document.createElement('style');st.id='bt_tools_folder_style';document.head.appendChild(st);}
    st.textContent=`
      #v32_inbox_btn,#v31_profile_btn{display:none!important;pointer-events:none!important;}
      .fab{display:none!important;opacity:0!important;pointer-events:none!important;transform:scale(.65)!important;}
      #bt_tools_backdrop[hidden],#bt_tools_folder_menu[hidden]{display:none!important;pointer-events:none!important;}
      #bt_tools_folder_btn{position:fixed;right:14px;bottom:calc(env(safe-area-inset-bottom,0px) + 92px);z-index:245;border:0;border-radius:24px;width:76px;height:56px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;box-shadow:0 14px 34px rgba(37,99,235,.34);font:900 12px 'DM Sans',system-ui;letter-spacing:.2px;display:flex;align-items:center;justify-content:center;gap:3px;flex-direction:column;-webkit-tap-highlight-color:transparent;}
      #bt_tools_folder_btn .ico{font-size:21px;line-height:18px}#bt_tools_folder_btn .lbl{font-size:11px;line-height:12px}
      #bt_tools_folder_menu{position:fixed;right:14px;bottom:calc(env(safe-area-inset-bottom,0px) + 156px);z-index:246;width:min(244px,calc(100vw - 28px));background:rgba(248,250,252,.98);border:1px solid rgba(148,163,184,.35);border-radius:22px;padding:10px;box-shadow:0 22px 60px rgba(15,23,42,.32);font-family:'DM Sans',system-ui;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);}
      .bt-tools-head{display:flex;align-items:center;justify-content:space-between;padding:6px 8px 10px;color:#0f172a;font-weight:900}.bt-tools-head span{font-size:13px}.bt-tools-x{border:0;background:#e2e8f0;color:#334155;border-radius:999px;width:28px;height:28px;font-weight:900;font-size:18px}.bt-tools-item{width:100%;border:0;border-radius:16px;margin:5px 0;padding:12px 12px;background:white;color:#0f172a;text-align:left;font:900 13px 'DM Sans',system-ui;box-shadow:inset 0 0 0 1px rgba(226,232,240,.9);display:flex;align-items:center;gap:10px}.bt-tools-item small{display:block;color:#64748b;font-weight:700;font-size:11px;margin-top:1px}.bt-tools-item .emoji{font-size:18px;width:24px;text-align:center}.bt-tools-backdrop{position:fixed;inset:0;z-index:244;background:transparent;}
      @media(max-width:430px){#bt_tools_folder_btn{right:14px;bottom:calc(env(safe-area-inset-bottom,0px) + 92px);width:76px;height:54px;border-radius:22px}#bt_tools_folder_menu{right:14px;bottom:calc(env(safe-area-inset-bottom,0px) + 152px)}}
    `;
  }

  function closeMenu(){document.getElementById('bt_tools_folder_menu')?.setAttribute('hidden','');document.getElementById('bt_tools_backdrop')?.remove();}
  function toggleMenu(){
    ensureMenu();
    const m=document.getElementById('bt_tools_folder_menu');
    if(!m)return;
    if(m.hasAttribute('hidden')){
      document.getElementById('bt_tools_backdrop')?.remove();
      const bd=document.createElement('div');
      bd.id='bt_tools_backdrop';bd.className='bt-tools-backdrop';bd.onclick=closeMenu;
      document.body.appendChild(bd);
      m.removeAttribute('hidden');
    }else closeMenu();
  }
  function openTC(){closeMenu(); if(typeof window.tcV32OpenLearningInbox==='function')window.tcV32OpenLearningInbox(); else document.getElementById('v32_inbox_btn')?.click();}
  function openProfiles(){closeMenu(); if(typeof window.tcV31OpenProfileLibrary==='function')window.tcV31OpenProfileLibrary(); else document.getElementById('v31_profile_btn')?.click();}
  function runSelfTest(){closeMenu(); if(typeof window.tcV31OpenProfileLibrary==='function')window.tcV31OpenProfileLibrary(); setTimeout(()=>{ if(typeof window.tcV31RunAndShowSelfTest==='function')window.tcV31RunAndShowSelfTest(); },180);}
  function quickAdd(){
    closeMenu();
    if(typeof window.openAdd==='function'){window.openAdd();return;}
    try{if(typeof openAdd==='function'){openAdd();return;}}catch{}
  }
  function ensureMenu(){
    if(document.getElementById('bt_tools_folder_menu'))return;
    const m=document.createElement('div');m.id='bt_tools_folder_menu';m.setAttribute('hidden','');
    m.innerHTML=`
      <div class="bt-tools-head"><span>Tools Folder</span><button class="bt-tools-x" type="button" onclick="window.btToolsFolderClose&&window.btToolsFolderClose()">×</button></div>
      <button class="bt-tools-item" type="button" onclick="window.btToolsQuickAdd&&window.btToolsQuickAdd()"><span class="emoji">＋</span><span>Quick Add<small>Create a new bank entry</small></span></button>
      <button class="bt-tools-item" type="button" onclick="window.btToolsOpenTC&&window.btToolsOpenTC()"><span class="emoji">📄</span><span>T&C Inbox<small>Save/analyze promo terms</small></span></button>
      <button class="bt-tools-item" type="button" onclick="window.btToolsOpenProfiles&&window.btToolsOpenProfiles()"><span class="emoji">🗂️</span><span>Profiles<small>Saved bank profiles</small></span></button>
      <button class="bt-tools-item" type="button" onclick="window.btToolsRunSelfTest&&window.btToolsRunSelfTest()"><span class="emoji">✅</span><span>Run Self-Test<small>Verify analyzer profiles</small></span></button>
    `;
    document.body.appendChild(m);
  }
  function ensureButton(){if(document.getElementById('bt_tools_folder_btn'))return;const b=document.createElement('button');b.id='bt_tools_folder_btn';b.type='button';b.innerHTML='<span class="ico">＋</span><span class="lbl">Tools</span>';b.onclick=toggleMenu;document.body.appendChild(b);}
  function cleanupBackdrops(){const m=document.getElementById('bt_tools_folder_menu');if(!m||m.hasAttribute('hidden'))document.getElementById('bt_tools_backdrop')?.remove();}
  function boot(){addStyle();ensureButton();ensureMenu();cleanupBackdrops();}

  window.btToolsFolderVersion=VER;
  window.btToolsFolderClose=closeMenu;
  window.btToolsQuickAdd=quickAdd;
  window.btToolsOpenTC=openTC;
  window.btToolsOpenProfiles=openProfiles;
  window.btToolsRunSelfTest=runSelfTest;
  window.btToolsFolderApply=boot;
  window.btToolsButtonHealthCheck=function(){cleanupBackdrops();return {version:VER,menuOpen:!document.getElementById('bt_tools_folder_menu')?.hasAttribute('hidden'),backdrop:!!document.getElementById('bt_tools_backdrop')}};

  boot();
  if(typeof window.btRegisterPostRender==='function') window.btRegisterPostRender('tools-folder',boot);
})();
/* === End consolidated core module: Tools folder floating menu === */

/* === Consolidated core module: Tracker card bank actions renderer (moved into app.js in v3.3.36) === */
/*
 * filename: scripts/tracker-card-source-actions.js
 * version: 3.3.34
 * consolidated-purpose: Compact source-rendered per-bank Actions menu using core checklist/timer modals.
 * last-touched: 2026-05-02
 */
(function(){
  const VER='3.3.34';
  let checklistModal=null;

  window.__btBankActionPrompt=window.__btBankActionPrompt||null;

  function ensureBankActionCompactStyle(){
    if(document.getElementById('bt_source_bank_actions_compact_style'))return;
    const st=document.createElement('style');
    st.id='bt_source_bank_actions_compact_style';
    st.textContent=`
      .bt-ba-compact{padding:10px 14px calc(12px + var(--safe-b))!important;max-height:72dvh!important;overflow-y:auto!important;border-radius:18px 18px 0 0!important;}
      .bt-ba-compact .m-bar{margin-bottom:8px!important;height:4px!important;width:34px!important;}
      .bt-ba-compact .m-hdr{margin-bottom:8px!important;}
      .bt-ba-compact .m-hdr h2{font-size:15px!important;line-height:1.1!important;}
      .bt-ba-identity{display:flex;align-items:center;gap:8px;margin:4px 0 8px;padding:6px 8px;border-radius:12px;background:#F8FAFC;border:1px solid #E2E8F0;}
      .bt-ba-identity .blogo{width:30px!important;height:30px!important;border-radius:9px!important;font-size:11px!important;}
      .bt-ba-identity .card-name{font-size:13px!important;line-height:1.1!important;}
      .bt-ba-status{font-size:9px!important;color:#64748B;font-weight:900;letter-spacing:.3px;margin-top:1px;text-transform:uppercase;}
      .bt-ba-list{display:grid;grid-template-columns:1fr;gap:6px;}
      .bt-ba-mini{width:100%;border:0;border-radius:12px;background:#F8FAFC;color:#0F172A;padding:8px 10px;font-family:'DM Sans',system-ui,sans-serif;text-align:left;box-shadow:inset 0 0 0 1px #E2E8F0;display:flex;align-items:center;gap:8px;min-height:46px;cursor:pointer;}
      .bt-ba-mini:active{transform:scale(.985);}
      .bt-ba-mini .ico{width:24px;height:24px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:#EFF6FF;font-size:14px;flex-shrink:0;}
      .bt-ba-mini b{display:block;font-size:12px;line-height:1.05;color:inherit;}
      .bt-ba-mini small{display:block;margin-top:2px;font-size:9px;line-height:1.15;color:#94A3B8;font-weight:700;}
      .bt-ba-mini.danger{background:#FEF2F2;color:#DC2626;box-shadow:inset 0 0 0 1px #FECACA;}
      .bt-ba-mini.danger .ico{background:#FEE2E2;}
      .bt-ba-mini.cancel{justify-content:center;text-align:center;background:#E2E8F0;color:#334155;min-height:40px;}
      .bt-ba-mini.cancel .ico{display:none;}
      @media(min-width:520px){.bt-ba-compact{max-width:420px!important;border-radius:18px!important;padding-bottom:14px!important}.bt-ba-list{grid-template-columns:1fr 1fr}.bt-ba-mini.danger,.bt-ba-mini.cancel{grid-column:1/-1}}
    `;
    document.head.appendChild(st);
  }

  function saveEntries(){
    try{
      if(typeof sv==='function'&&typeof SK!=='undefined'){
        sv(SK,entries);
        return;
      }
    }catch{}
    try{localStorage.setItem('bt_e_v4',JSON.stringify(entries));}catch{}
  }

  function todayIso(){
    try{return typeof td==='function'?td():new Date().toISOString().split('T')[0]}catch{return new Date().toISOString().split('T')[0]}
  }

  function getEntry(id){
    try{return entries.find(function(e){return e&&e.id===id})||null}catch{return null}
  }

  function clearInlineState(id){
    try{
      const st=inlineStateFor(id);
      st.checklist=false;
      st.timer=false;
      st.timerEdit=null;
    }catch{}
  }

  function removeChecklistModal(){
    const old=document.getElementById('bt_checklist_modal');
    if(old)old.remove();
  }

  function closeChecklistModal(){
    checklistModal=null;
    removeChecklistModal();
  }

  function saveChecklistModal(){
    if(!checklistModal)return;
    const input=document.getElementById('bt_checklist_modal_text');
    const text=(input&&input.value?input.value:'').trim();
    if(!text){alert('Add a checklist description.');return;}
    const id=checklistModal.entryId;
    entries=entries.map(function(e){
      if(e&&e.id===id){
        if(!Array.isArray(e.checklist))e.checklist=[];
        e.checklist.push({text:text,done:false});
      }
      return e;
    });
    saveEntries();
    try{expanded=id}catch{}
    closeChecklistModal();
    R();
  }

  function showChecklistModal(){
    removeChecklistModal();
    if(!checklistModal)return;

    const overlay=document.createElement('div');
    overlay.id='bt_checklist_modal';
    overlay.className='cbg';
    overlay.addEventListener('click',closeChecklistModal);

    const box=document.createElement('div');
    box.className='dd-box';
    box.addEventListener('click',function(ev){ev.stopPropagation();});

    const title=document.createElement('h3');
    title.textContent='Add checklist step';

    const sub=document.createElement('div');
    sub.className='sub';
    sub.textContent='Add one requirement task for '+(checklistModal.bank||'this bank')+'.';

    const fg=document.createElement('div');
    fg.className='fg';

    const label=document.createElement('label');
    label.textContent='Description';

    const input=document.createElement('input');
    input.id='bt_checklist_modal_text';
    input.placeholder='e.g. Make 1 debit card transaction';
    input.addEventListener('keydown',function(ev){
      if(ev.key==='Enter')saveChecklistModal();
    });

    fg.appendChild(label);
    fg.appendChild(input);

    const row=document.createElement('div');
    row.className='crow';

    const cancel=document.createElement('button');
    cancel.className='c-c';
    cancel.textContent='Cancel';
    cancel.addEventListener('click',closeChecklistModal);

    const save=document.createElement('button');
    save.className='c-g';
    save.textContent='Save';
    save.addEventListener('click',saveChecklistModal);

    row.appendChild(cancel);
    row.appendChild(save);

    box.appendChild(title);
    box.appendChild(sub);
    box.appendChild(fg);
    box.appendChild(row);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    setTimeout(function(){try{input.focus()}catch{}},30);
  }

  function openChecklistModal(id){
    const e=getEntry(id);
    window.__btBankActionPrompt=null;
    if(!e){R();return;}
    clearInlineState(id);
    try{expanded=id}catch{}
    checklistModal={entryId:id,bank:e.bank||''};
    R();
    showChecklistModal();
  }

  function openNewTimerModal(id){
    const e=getEntry(id);
    window.__btBankActionPrompt=null;
    if(!e){R();return;}
    clearInlineState(id);
    try{expanded=id}catch{}
    if(typeof openNewTimerEditor==='function'){
      openNewTimerEditor(id,'due');
      return;
    }
    try{
      timerEditModal={entryId:id,timerId:'',isNew:true,text:'',mode:'due',startDate:e.opened||todayIso(),daysRequired:''};
    }catch{}
    R();
  }

  function openBankActions(id){
    window.__btBankActionPrompt=id;
    R();
  }
  function closeBankActions(){
    window.__btBankActionPrompt=null;
    R();
  }
  function runBankAction(id,action){
    const e=getEntry(id);
    window.__btBankActionPrompt=null;
    if(!e){R();return}
    expanded=id;
    if(action==='edit'){openEdit(id);return}
    if(action==='received'){confirmMarkReceived(id);return}
    if(action==='close'){closeAcct(id);return}
    if(action==='delete'){delEntry(id);return}
    if(action==='checklist'){
      openChecklistModal(id);
      return;
    }
    if(action==='timer'){
      openNewTimerModal(id);
      return;
    }
    R();
  }
  function bankActionSheetButton(id,action,icon,title,sub,danger=false){
    return `<button class="bt-ba-mini ${danger?'danger':''}" onclick="event.stopPropagation();runBankAction('${id}','${action}')"><span class="ico">${icon}</span><span><b>${esc(title)}</b>${sub?`<small>${esc(sub)}</small>`:''}</span></button>`;
  }
  function rBankActions(){
    const e=entries.find(x=>x.id===window.__btBankActionPrompt);
    if(!e)return'';
    ensureBankActionCompactStyle();
    let h='<div class="ov" onclick="closeBankActions()"><div class="modal bt-ba-compact" onclick="event.stopPropagation()">';
    h+='<div class="m-bar"></div><div class="m-hdr"><h2>Bank Actions</h2><span class="m-id">'+esc(getEntryDisplayId(e)||e.id||'')+'</span></div>';
    h+='<div class="bt-ba-identity">'+bankLogo(e.bank,true)+'<div><div class="card-name">'+esc(e.bank)+'</div><div class="bt-ba-status">'+esc(status(e)||'')+'</div></div></div>';
    h+='<div class="bt-ba-list">';
    h+=bankActionSheetButton(e.id,'edit','✏️','Edit Bank','Details, dates, bonus, rules');
    if(!e.closed)h+=bankActionSheetButton(e.id,'received','🎁',e.bonusRecd?'Update Received':'Mark Received','Bonus received date');
    if(!e.closed)h+=bankActionSheetButton(e.id,'close','🔒','Close Account','Record closed date');
    if(!e.closed)h+=bankActionSheetButton(e.id,'checklist','✅','Add Checklist','New requirement step');
    if(!e.closed)h+=bankActionSheetButton(e.id,'timer','⏱️','Add Timer','Custom countdown');
    h+=bankActionSheetButton(e.id,'delete','🗑️','Delete Bank','Remove tracker entry',true);
    h+='<button class="bt-ba-mini cancel" onclick="event.stopPropagation();closeBankActions()"><span><b>Cancel</b></span></button>';
    h+='</div></div></div>';
    return h;
  }

  function rTracker(sorted){
    const q=search.toLowerCase();
    const f=q?sorted.filter(e=>(e.bank||'').toLowerCase().includes(q)||(e.id||'').toLowerCase().includes(q)):sorted;
    let h='';
    const bkd=daysSinceBk();
    if(bkd>=7) h += `<div class="bk-remind">${bkd>=999?'Backup recommended':'Backup updated '+bkd+'d ago'} <button onclick="exportBackup()">Export</button></div>`;

    h += '<div class="qbar">';
    h += quickBtn('blue',I.backup,'Backup','exportBackup()');
    h += quickBtn('green',I.restore,'Restore','importBackup()');
    h += quickBtn('purple',I.quick,'Quick Add','showTemplates=!showTemplates;R()');
    h += quickBtn('red',I.trash,'Reset','resetAllData()');
    h += '</div>';

    if(showTemplates){
      h += '<div class="sec">Quick add templates</div><div class="tgrid">';
      TEMPLATES.forEach((t,i)=>{
        h += `<button class="tbtn" onclick="addFromTpl(${i})">${bankLogo(t.bank,true)}<div class="t-info"><div class="nm">${esc(t.bank)}</div><div class="bn">${fM(t.bonus)}</div></div></button>`;
      });
      h += '</div>';
    }

    h += `<input class="sinput" type="text" placeholder="Search banks..." value="${esc(search)}" oninput="search=this.value;R()">`;
    h += `<button class="tc-btn" onclick="showAnalyzer=!showAnalyzer;R()">${I.spark}<span>${showAnalyzer?'Hide analyzer':'Analyze promo terms'}</span></button>`;
    if(showAnalyzer) h += rAnalyzer();

    if(!f.length){
      return h + '<div class="empty"><div class="em">No banks yet</div><p>Add your first bank with the + button, use Quick Add for templates, or restore a saved backup.</p></div>' + rBankActions();
    }

    h += '<div class="sec">Your banks</div>';

    f.forEach(e=>{
      const s=status(e), isX=expanded===e.id, nr=nextReopen(e), countdown=getCountdown(e), urg=getUrg(e);
      h += `<div class="card u-${urg}">`;
      h += `<div class="card-h" onclick="expanded=expanded==='${e.id}'?null:'${e.id}';R()">`;
      h += `<div class="card-logo-col">${bankLogo(e.bank)}${accountTypeChipHtml(e)}${e.churn?churnTagHtml(e.bank,e.churn):''}</div>`;
      h += `<div class="card-left"><div class="card-name">${esc(e.bank)}</div><div class="card-row">${statusBadgeHtml(e,countdown)}</div></div>`;
      h += '<div class="card-right"><div class="card-right-main">';
      if((s==='WORKING'||s==='CUSTOM TIMER')&&e.bonus) h += `<div class="card-bonus">${fM(e.bonus)}</div>`;
      h += `<div class="card-id">${esc(getEntryDisplayId(e))}</div></div>`;
      h += '</div></div>';

      if(isX){
        h += '<div class="card-exp"><div class="card-grid">';
        if(e.opened) h += `<div class="cf"><div class="k">Opened</div><div class="v">${fD(e.opened)}</div></div>`;
        if(e.closed) h += `<div class="cf"><div class="k">Closed</div><div class="v">${fD(e.closed)}</div></div>`;
        if(e.bonusRecd) h += `<div class="cf"><div class="k">Received</div><div class="v ok">${fD(e.bonusRecd)}</div></div>`;
        if(nr) h += `<div class="cf"><div class="k">Reopen</div><div class="v">${fD(nr)}</div></div>`;
        if(e.reqMet) h += `<div class="cf"><div class="k">Req Met</div><div class="v">${fD(e.reqMet)}</div></div>`;
        if(isCompleted(e)) h += '<div class="cf"><div class="k">Tax</div><div class="v ok">Logged</div></div>';
        if(e.referralBonus) h += `<div class="cf"><div class="k">Referral</div><div class="v"><span class="ref-b">+${fM(e.referralBonus)}</span></div></div>`;
        if(e.minHoldDays>0&&!e.closed){
          const scd=rawSafeDate(e);
          const safeDays=daysUntilSafe(e);
          h += `<div class="cf"><div class="k">Hold Until</div><div class="v${safeDays<=0?' ok':' warn'}">${fD(scd)}</div></div>`;
        }
        if(e.earlyCloseFee>0&&!e.closed){
          h += `<div class="cf"><div class="k">Close Fee</div><div class="v warn">${fM(e.earlyCloseFee)}</div></div>`;
        }
        if(e.minHoldDays>0&&!e.closed){
          const __feeMeta=closeFeeCountdownMeta(e);
          const __feeTitle=safeCloseDate(e)?`Safe close: ${fD(safeCloseDate(e))}`:'Add opened date to calculate';
          h += `<div class="cf"><div class="k">Close Fee Countdown</div><div class="v" style="padding-top:2px"><span class="tm-pill ${__feeMeta.cls}" title="${esc(__feeTitle)}" style="margin-left:6px">${esc(__feeMeta.text)}</span></div></div>`;
        }
        h += '</div>';

        if(!e.closed){
          h += '<div class="sec" style="margin-top:6px">Checklist</div><ul class="ck">';
          if(e.checklist&&e.checklist.length){
            e.checklist.forEach((c,ci)=>{
              h += `<li><div class="ckb${c.done?' dn':''}" onclick="event.stopPropagation();toggleCk('${e.id}',${ci})"></div><span class="ck-text${c.done?' dn':''}">${esc(c.text)}</span><span class="ck-del" onclick="event.stopPropagation();rmCk('${e.id}',${ci})">×</span></li>`;
            });
          }
          h += '</ul><div class="ck-add-shell">';
          h += isInlineOpen(e.id,'checklist')
            ? `<div class="inline-form" onclick="event.stopPropagation()"><div class="ck-add"><input id="ck_${e.id}" placeholder="Add step..." onclick="event.stopPropagation()" onkeydown="if(event.key==='Enter'){event.stopPropagation();addCk('${e.id}')}" /></div><div class="inline-actions"><button class="inline-btn primary" onclick="event.stopPropagation();addCk('${e.id}')">Add</button><button class="inline-btn secondary" onclick="event.stopPropagation();clearInlineInputs('${e.id}','checklist')">Reset</button><button class="inline-btn ghost" onclick="event.stopPropagation();toggleInlineForm('${e.id}','checklist',false)">Cancel</button></div></div>`
            : '';
          h += '</div>';
          h += '<div class="sec" style="margin-top:8px">Mini Countdown Timers</div><ul class="tm">';
          const __timers=sortCustomTimers(e.customTimers||[]);
          if(__timers.length){
            __timers.forEach((t)=>{const meta=timerCountdownMeta(t);h += `<li><div class="ckb${t.done?' dn':''}" onclick="toggleTimer('${e.id}','${t.id||''}')"></div><div class="tm-main"><div class="tm-title${t.done?' dn':''}">${esc(t.text||'Timer')}</div><div class="tm-sub">${timerMetaLine(t)}</div></div><span class="tm-pill ${meta.cls}">${esc(meta.text)}</span><button type="button" class="tm-edit-btn" onclick="event.stopPropagation();openTimerEditor('${e.id}','${t.id||''}')">Edit</button><span class="ck-del" onclick="event.stopPropagation();rmTimer('${e.id}','${t.id||''}')">×</span></li>`;});
          }else{
            h += '<li><div class="tm-main"><div class="tm-sub">Add a custom due date for bank-specific requirements.</div></div></li>';
          }
          h += '</ul><div class="tm-add-shell">';
          h += isInlineOpen(e.id,'timer')
            ? `<div class="inline-form"><div class="tm-add"><input id="tm_txt_${e.id}" placeholder="e.g. Use debit card once"><input id="tm_start_${e.id}" type="date"><input id="tm_days_${e.id}" type="number" inputmode="numeric" min="1" placeholder="Days" onkeydown="if(event.key==='Enter'){upsertTimer('${e.id}')}"></div><div class="inline-actions"><button class="inline-btn primary" onclick="upsertTimer('${e.id}')">Add timer</button><button class="inline-btn secondary" onclick="clearInlineInputs('${e.id}','timer')">Reset</button><button class="inline-btn ghost" onclick="toggleInlineForm('${e.id}','timer',false)">Cancel</button></div></div>`
            : '';
          h += '</div>';
        }

        if(e.notes) h += `<div class="card-notes" style="white-space:pre-wrap;font-size:12px;line-height:1.6">${esc(e.notes)}</div>`;
        h += renderClosePlan(e);
        h += renderOfferHistory(e);
        if(e.analyzedTC) h += `<div class="tc-box"><div class="tc-label">T&amp;C analysis</div><div class="tc-body">${highlightTC(e.analyzedTC)}</div></div>`;
        h += '';

        h += '<div class="card-btns">';
        h += actionBtn('edit',I.quick,'Actions',`event.stopPropagation();openBankActions('${e.id}')`);
        h += '</div></div>';
      }

      h += '</div>';
    });

    const attentionSug=getAttentionSuggestions();
    const churnSug=getChurnSuggestions();
    if(attentionSug.length||churnSug.length){
      h += '<div class="sec">Suggested next</div>';
      h += '<div class="sug-split">';
      h += '<div class="sug-panel"><div class="sug-panel-h">Needs attention • '+attentionSug.length+' item'+(attentionSug.length!==1?'s':'')+'</div>'+(attentionSug.length?attentionSug.map(s=>`<div class="sug-c">${bankLogo(s.bank,true)}<div class="s-info"><div class="nm">${esc(s.bank)}</div>${s.showBonus&&s.bonus?`<div class="sub">${fM(s.bonus)}</div>`:''}<div class="rsn">${esc(s.rsn)}</div></div></div>`).join(''):'<div class="sug-empty">No urgent items.</div>')+'</div>';
      h += '<div class="sug-panel"><div class="sug-panel-h">Least days to churn</div>'+(churnSug.length?churnSug.map(s=>`<div class="sug-c">${bankLogo(s.bank,true)}<div class="s-info"><div class="nm">${esc(s.bank)}</div>${s.showBonus&&s.bonus?`<div class="sub">${fM(s.bonus)}</div>`:''}<div class="rsn">${esc(s.rsn)}</div></div></div>`).join(''):'<div class="sug-empty">Nothing cooling down yet.</div>')+'</div>';
      h += '</div>';
    }

    return h + rBankActions();
  }

  window.confirmMarkReceived=confirmMarkReceived;
  window.openBankActions=openBankActions;
  window.closeBankActions=closeBankActions;
  window.runBankAction=runBankAction;
  window.rBankActions=rBankActions;
  window.rTracker=rTracker;
  window.btCloseChecklistActionModal=closeChecklistModal;
  window.btSourceBankActionsVersion=VER;

  setTimeout(()=>{try{ensureBankActionCompactStyle();R();}catch(e){console.error('Bank Actions source renderer failed',e);}},0);
})();
/* === End consolidated core module: Tracker card bank actions renderer === */
