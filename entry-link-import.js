/* BonusTracker v3.4.15 — one-click local entry import via #btadd= fragment. */
(function(){
  'use strict';
  const VER='3.4.15';
  const HASH_KEY='btadd=';
  const ALLOWED=[
    'bank','accountType','bonus','churn','churnable','churnability','churnBasis','churnBufferDays','churnReason','sourceEligibilityBasis','churnTrackingPolicy',
    'opened','closed','bonusRecd','reqMet','notes','analyzedTC','minHoldDays','closeFeeCountdownDays','earlyCloseFee','reqDays','referralBonus','dataPoint',
    'fundedDays','fundingAmount','fundingAmountText','payoutTimingText','phoneNum','feeChecked','monthlyFeeYNText','monthlyFeeAmountText','monthlyFeeFrequency',
    'monthlyFeeWaiverType','monthlyFeeWaiverAmountText','monthlyFeeWaiverText','promoCodeText','avoidMonthlyFeeText','completeBonusText','earlyTerminationFeeText',
    'eligibilityText','expirationDateText','requiredDaysText','closeRuleBasis','closeBufferDays','closeRuleText','closeRestrictionType','monthlyFeeChecked','customTimers'
  ];
  function decode(raw){
    let s=String(raw||'').replace(/-/g,'+').replace(/_/g,'/');
    while(s.length%4)s+='=';
    const bin=atob(s);const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));
    const txt=typeof TextDecoder!=='undefined'?new TextDecoder().decode(bytes):decodeURIComponent(escape(bin));
    return JSON.parse(txt);
  }
  function cleanPayload(p){
    const out={};if(!p||typeof p!=='object')return out;
    ALLOWED.forEach(k=>{if(p[k]!==undefined)out[k]=p[k]});
    out.bank=String(out.bank||'').trim();
    out.accountType=String(out.accountType||'personal').toLowerCase()==='business'?'business':'personal';
    out.opened=String(out.opened||'').trim();
    out.bonus=Number(out.bonus||0);
    out.reqDays=Math.max(0,parseInt(out.reqDays||0,10)||0);
    out.minHoldDays=Math.max(0,parseInt(out.minHoldDays||0,10)||0);
    out.closeBufferDays=Math.max(0,parseInt(out.closeBufferDays||0,10)||0);
    out.churnBufferDays=0;
    out.customTimers=typeof normalizeTimerList==='function'?normalizeTimerList(out.customTimers||[]):(Array.isArray(out.customTimers)?out.customTimers:[]);
    return out;
  }
  function sameEntry(a,b){
    try{
      const ka=typeof entryBankKey==='function'?entryBankKey(a):String(a?.bank||'').toLowerCase();
      const kb=typeof entryBankKey==='function'?entryBankKey(b):String(b?.bank||'').toLowerCase();
      return ka===kb&&String(a?.opened||'')===String(b?.opened||'')&&Number(a?.bonus||0)===Number(b?.bonus||0);
    }catch{return false}
  }
  function clearHash(){try{history.replaceState(null,'',location.pathname+location.search)}catch{location.hash=''}}
  function addLocalEntry(payload){
    if(typeof entries==='undefined'||!Array.isArray(entries)||typeof sv!=='function'||typeof SK==='undefined')throw new Error('Tracker storage is not ready.');
    let next=cleanPayload(payload);
    if(!next.bank)throw new Error('Bank name is missing.');
    if(!next.opened)throw new Error('Opened date is missing.');
    const decision=typeof churnDecisionForEntry==='function'?churnDecisionForEntry(next):(next.churnable===false?'nonrepeatable':next.churn?'repeatable':'');
    if(!decision)throw new Error('Future eligibility decision is missing.');
    if(decision==='repeatable'&&!['180','1','2','3'].includes(String(next.churn||'')))throw new Error('Repeatable entry is missing a supported churn period.');
    const existing=entries.find(e=>sameEntry(e,next));
    if(existing){clearHash();try{expanded=existing.id;tab='tracker';R()}catch{};return{status:'exists',entry:existing}}
    if(typeof assignEntryIdForCreate==='function')next=assignEntryIdForCreate(next);
    if(typeof hydrateTimersFromOpened==='function')hydrateTimersFromOpened(next);
    if(typeof normalizeLifecycleEntry==='function')next=normalizeLifecycleEntry(next);
    next.importSource='one-click-link';next.importedAt=typeof td==='function'?td():new Date().toISOString().slice(0,10);
    entries.push(next);
    if(typeof sortE==='function')entries=sortE(entries);
    sv(SK,entries);
    try{if(typeof saveOfferVersionFromEntry==='function')saveOfferVersionFromEntry(next,'one-click-import')}catch{}
    try{expanded=next.id;tab='tracker';search='';R()}catch{}
    clearHash();
    return{status:'added',entry:next};
  }
  function preview(p){
    const bonus='$'+Number(p.bonus||0).toLocaleString();
    return `Add ${p.bank} ${bonus} to this tracker?\n\nOpened: ${p.opened}\nRequirement: ${p.dataPoint||'See saved terms'}\nFuture eligibility: ${p.churnability==='not-repeatable'?'Non-repeatable':(p.churn==='180'?'180 days':p.churn+' year'+(String(p.churn)==='1'?'':'s'))+' after confirmed account close'}\n\nThis only changes the data stored in this browser.`;
  }
  function run(){
    const h=String(location.hash||'').replace(/^#/,'');if(!h.startsWith(HASH_KEY))return;
    try{
      const payload=cleanPayload(decode(h.slice(HASH_KEY.length)));
      if(!payload.bank||!payload.opened)throw new Error('Import payload is incomplete.');
      if(!window.confirm(preview(payload))){clearHash();return}
      const res=addLocalEntry(payload);
      setTimeout(()=>{try{cfm={title:res.status==='exists'?'Entry Already Exists':'Entry Added',msg:res.status==='exists'?`${payload.bank} ${payload.opened} is already in this tracker.`:`${payload.bank} was added with the opened date, requirement, fee, close rule, and churn rule already saved.`,green:true,action:()=>{cfm=null;R()}};R()}catch{}},30);
    }catch(err){clearHash();alert('Could not add this bank entry: '+(err&&err.message?err.message:err));}
  }
  window.btAddEntryFromPayload=addLocalEntry;
  window.btEntryLinkImportVersion=VER;
  setTimeout(run,80);setTimeout(run,700);
})();
