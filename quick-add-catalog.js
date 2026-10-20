/* BonusTracker public Quick Add source catalog, v1.
 * Historical cards are discovery aids, NEVER saved rules or proof of eligibility.
 * Curated official links record research on a date, not a continuously live claim.
 */
(function(root){
 'use strict';
 const H={'Wells Fargo':['accountoffers.wellsfargo.com','www.wellsfargo.com'],
          'Capital One':['www.capitalone.com']};
 const records=Object.freeze({
  'Wells Fargo':Object.freeze({
   bank:'Wells Fargo',product:'Everyday Checking',audience:'personal',
   offerKey:'everyday-checking-325-2026-10-13',historicAmount:325,
   reviewedAt:'2026-10-20',endsAt:'2026-10-13',
   state:'expired',changeFields:['monthly_fee'],
   note:'The $325 Everyday Checking promotion required enrollment by October 13, 2026. The published $15 monthly fee differs from the historical $10 shortcut. Look for a new, applicable promotion before opening.',
   sources:Object.freeze([
    Object.freeze({role:'promotion',label:'Published $325 offer and deadline',url:'https://accountoffers.wellsfargo.com/checkingoffer/'}),
    Object.freeze({role:'fees',label:'Wells Fargo account disclosures',url:'https://www.wellsfargo.com/mobile-online-banking/consumer-account-fees/'})
   ])
  }),
  'Capital One':Object.freeze({
   bank:'Capital One',product:'360 Checking',audience:'personal',
   offerKey:'360-checking-250-choice-2026',historicAmount:250,
   reviewedAt:'2026-10-20',state:'changed',changeFields:['qualifying_activity','promo_code','eligibility'],
   note:'Capital One lists separate qualifying paths: CHECKING250 for two $500 direct deposits or DEBIT250 for 20 qualifying debit purchases. Both have a 75-day requirement window. An older single-path shortcut does not identify the enrolled offer.',
   sources:Object.freeze([
    Object.freeze({role:'promotion',label:'Official $250 offer choices and terms',url:'https://www.capitalone.com/bank/choose-your-offer/'}),
    Object.freeze({role:'fees',label:'360 Checking account disclosures',url:'https://www.capitalone.com/bank/disclosures/checking-accounts/online-checking-account/'})
   ])
  })
 });
 function dateDay(s){
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;
  const d=new Date(s+'T12:00:00Z');return !Number.isNaN(+d)&&d.toISOString().slice(0,10)===s?Date.parse(s+'T00:00:00Z'):null;
 }
 function safeUrl(url,bank){
  try{const u=new URL(url);return u.protocol==='https:'&&H[bank]?.includes(u.hostname)&&!u.username&&!u.password&&!u.port&&!u.hash?u.href:''}catch{return''}
 }
 function reviewedSources(r){
  const rows=Array.isArray(r?.sources)?r.sources:[];
  return rows.filter(x=>x&&['promotion','fees'].includes(x.role)&&safeUrl(x.url,r.bank))
    .map(x=>({role:x.role,label:String(x.label||'Official disclosure').slice(0,100),url:safeUrl(x.url,r.bank)}));
 }
 function classify(r,now=Date.now()){
  const unknown={status:'Unverified example',short:'Unverified',kind:'unverified',note:'No current applicable promotion, fee schedule or eligibility terms have been verified for this shortcut.',checked:'',url:'',sources:[],changedFields:[]};
  if(!r||!r.bank||!H[r.bank])return unknown;
  const sources=reviewedSources(r),promo=sources.find(x=>x.role==='promotion'),fees=sources.find(x=>x.role==='fees');
  const checked=dateDay(r.reviewedAt),until=dateDay(r.endsAt);
  if(checked!==null&&now<checked)return{...unknown,note:'Source review is dated after this device clock. Recheck the promotion and fee schedule.'};
  const recent=checked!==null&&now>=checked&&now-checked<=14*86400000;
  const note=typeof r.note==='string'?r.note.slice(0,700):unknown.note;
  const base={...unknown,note,checked:checked===null?'':r.reviewedAt,url:promo?.url||'',sources,changedFields:Array.isArray(r.changeFields)?r.changeFields.filter(x=>typeof x==='string').slice(0,8):[]};
  if(until!==null&&now>=until+86400000&&promo){return{...base,status:'Expired example',short:'Expired',kind:'expired'};}
  if(r.state==='changed'&&promo&&fees&&base.changedFields.length){
    return{...base,status:recent?'Changed terms':'Changed · recheck',short:recent?'Changed':'Recheck',kind:recent?'changed':'stale'};
  }
  // Active means independently reviewed EXACT offer scope, all fee/eligibility
  // disclosures, stable source hashes and a current time-bound verification.
  // A discovered bank webpage, article or recently checked marketing URL alone
  // can NEVER satisfy this gate.
  const v=r.verification||{},asOf=Date.parse(v.checkedAt||'');
  const active=promo&&fees&&r.state==='active'&&r.product&&['personal','business'].includes(r.audience)
    &&typeof r.offerKey==='string'&&r.offerKey.length>=12
    &&v.offerKey===r.offerKey&&v.product===r.product&&v.audience===r.audience
    &&v.promotionVerified===true&&v.feeScheduleVerified===true&&v.eligibilityVerified===true
    &&/^[0-9a-f]{64}$/.test(v.promotionHash||'')&&/^[0-9a-f]{64}$/.test(v.feeScheduleHash||'')
    &&Number.isFinite(asOf)&&now>=asOf&&now-asOf<=24*3600000
    &&(until===null||now<=until+86400000);
  if(active)return{...base,status:'Official documents checked',short:'Checked',kind:'verified-active'};
  return base;
 }
 let watched=null,loading=null;
 const HEX=/^[0-9a-f]{64}$/;
 function monitored(bank,now=Date.now()){
  const spec=records[bank],v=watched?.records?.[bank];
  if(!spec||!v||v.offerKey!==spec.offerKey||!v.sources||typeof v.sources!=='object')return null;
  const reasons=[];
  for(const source of reviewedSources(spec)){
   const item=v.sources[source.role];
   if(!item||item.url!==source.url||!['baseline','unchanged','changed','unavailable'].includes(item.status))return null;
   const checked=Date.parse(item.checkedAt||'');
   if(!Number.isFinite(checked)||checked>now+60000||now-checked>36*3600000)return{status:'stale',note:'Scheduled source checks are overdue. Review the official page directly.'};
   if(item.status==='changed'){
     if(!HEX.test(item.baselineHash||'')||!HEX.test(item.observedHash||'')||!Number.isFinite(Date.parse(item.changeAt||'')))return null;
     reasons.push('changed');
   }else if(item.status==='unavailable')reasons.push('unavailable');
   else if(!HEX.test(item.baselineHash||'')||!HEX.test(item.observedHash||''))return null;
  }
  return reasons.includes('changed')?{status:'changed',note:'An official promotion or fee page changed since the stored baseline. Reverify the exact offer and terms before applying.'}
    :reasons.includes('unavailable')?{status:'unavailable',note:'An official source could not be checked. Its requirements and fees cannot be treated as current.'}
    :{status:'observed',note:'Official pages were monitored, but automated fingerprints do not establish eligibility or verify promotion terms.'};
 }
 function status(bank,now=Date.now()){
   bank=String(bank||'').trim();
   const old=classify(records[bank],now),fresh=monitored(bank,now);
   if(!fresh)return old;
   if(fresh.status==='observed')return{...old,watchNote:fresh.note,watchState:'observed'};
   if(old.kind==='expired')return{...old,watchNote:fresh.note,watchState:fresh.status};
   return {...old,status:fresh.status==='changed'?'Source changed · recheck':'Source check pending',
     short:'Recheck',kind:'stale',watchNote:fresh.note,watchState:fresh.status};
 }
 function refreshWatch(){
   if(loading)return loading;
   if(typeof root.fetch!=='function')return Promise.resolve(null);
   const controller=typeof root.AbortController==='function'?new root.AbortController():null;
   loading=root.fetch('./data/quick-add-source-monitor.json',{cache:'no-store',credentials:'omit',
     ...(controller?{signal:controller.signal}:{})}).then(response=>{
       if(!response.ok)throw Error('Source watch unavailable');
       return response.json();
     }).then(data=>{
       if(data?.schemaVersion!==1||!data.records||typeof data.records!=='object'
           ||Array.isArray(data.records)||Object.keys(data.records).length>12)throw Error('Unexpected source watch schema');
       watched=data;
       try{if(typeof showTemplates!=='undefined'&&showTemplates&&typeof modal!=='undefined'&&!modal&&typeof R==='function')R();}catch{}
       return watched;
     }).catch(()=>null);
   return loading;
 }
 root.BTQuickAddCatalog=Object.freeze({version:2,status,classify,records,reviewedSources,safeUrl,monitored,refreshWatch});

})(typeof window!=='undefined'?window:globalThis);
