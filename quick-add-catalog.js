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
   const spec=records[bank];
   const generated=Date.parse(watched?.generatedAt||'');
   if(!spec||!watched||watched.schemaVersion!==1||!Number.isFinite(generated)||generated>now+60000)return null;
   const record=watched.records?.[bank];
   if(!record||record.offerKey!==spec.offerKey||!record.sources||typeof record.sources!=='object')
     return{status:'unavailable',note:'This bank has no complete official-source check. Reverify the promotion and fees.'};
   const reasons=[];
   for(const source of reviewedSources(spec)){
     const item=record.sources[source.role];
     if(!item||item.url!==source.url||!['baseline','unchanged','changed','unavailable'].includes(item.status)){
       reasons.push('unavailable');
       continue;
     }
     const checked=Date.parse(item.checkedAt||'');
     if(Number.isFinite(checked)&&checked>now+60000){reasons.push('unavailable');continue;}
     const stale=!Number.isFinite(checked)||now-checked>36*3600000;
     // A previously observed difference is a sticky review requirement even
     // when another official page or the next scheduled run is overdue.
     if(item.status==='changed'&&HEX.test(item.baselineHash||'')
        &&HEX.test(item.observedHash||'')&&Number.isFinite(Date.parse(item.changeAt||''))){
       reasons.push('changed');
       if(stale)reasons.push('stale');
     }else if(stale)reasons.push('stale');
     else if(item.status==='unavailable')reasons.push('unavailable');
     else if(!HEX.test(item.baselineHash||'')||!HEX.test(item.observedHash||''))reasons.push('unavailable');
   }
   return reasons.includes('changed')?{status:'changed',note:'An official promotion or fee page changed since its reviewed baseline. Reverify its terms'+(reasons.includes('stale')?' and overdue source checks':'')+' before applying.'}
     :reasons.includes('unavailable')?{status:'unavailable',note:'An official promotion or fee source is missing or unavailable. Recheck before applying.'}
     :reasons.includes('stale')?{status:'stale',note:'Scheduled source checks are overdue. Review the official pages directly.'}
     :{status:'observed',note:'Official pages were monitored, but automated fingerprints do not establish eligibility or verify promotion terms.'};
 }
 function status(bank,now=Date.now()){
   bank=String(bank||'').trim();
   const old=classify(records[bank],now);
   // A device clock before the catalog review cannot borrow future watch checks.
   const reviewAt=Date.parse((records[bank]?.reviewedAt||'')+'T00:00:00Z');
   if(Number.isFinite(reviewAt)&&now<reviewAt)return old;
   const fresh=monitored(bank,now);
   if(!fresh)return old;
   if(fresh.status==='observed')return{...old,watchNote:fresh.note,watchState:'observed'};
   if(old.kind==='expired')return{...old,watchNote:fresh.note,watchState:fresh.status};
   return {...old,status:fresh.status==='changed'?'Source changed · recheck':'Source check pending',
     short:'Recheck',kind:'stale',watchNote:fresh.note,watchState:fresh.status};
 }
 function reviewQueue(now=Date.now()){
   const generated=Date.parse(watched?.generatedAt||'');
   const issues=[],banks=Object.keys(records),observed=watched?.schemaVersion===1
     &&Number.isFinite(generated)&&generated<=now+60000
     &&watched.records&&typeof watched.records==='object'
     &&Object.keys(watched.records).length>0;
   let complete=!!observed;
   if(observed)for(const bank of banks){
     const spec=records[bank],watch=watched.records[bank];
     const hasBank=watch&&watch.offerKey===spec.offerKey&&watch.sources&&typeof watch.sources==='object';
     for(const source of reviewedSources(spec)){
       const row=hasBank?watch.sources[source.role]:null;
       // Every catalogued promotion/fee URL must have its own recognized
       // observation. Partial publisher results must never look all-clear.
       const valid=row&&row.url===source.url
         &&['baseline','unchanged','changed','unavailable'].includes(row.status);
       if(!valid){
         complete=false;
         issues.push({bank,role:source.role,kind:'unavailable',url:source.url,
           label:source.label,checkedAt:'',signals:[],overdue:false});
         continue;
       }
       const checked=Date.parse(row.checkedAt||'');
       const future=Number.isFinite(checked)&&checked>now+60000;
       const stale=!Number.isFinite(checked)||future||now-checked>36*3600000;
       const changed=row.status==='changed'&&HEX.test(row.baselineHash||'')
         &&HEX.test(row.observedHash||'')&&Number.isFinite(Date.parse(row.changeAt||''))
         &&Date.parse(row.changeAt)<=now+60000;
       const kind=future?'unavailable':changed?'changed':stale?'stale':row.status==='unavailable'?'unavailable':null;
       if(kind){
         const approved=['bonus_amount','monthly_fees','direct_deposit','deadlines','eligibility','closure_rules','other_terms'];
         const signals=kind==='changed'&&Array.isArray(row.reviewSignals)
           ?row.reviewSignals.filter(x=>approved.includes(x)).slice(0,7):[];
         issues.push({bank,role:source.role,kind,url:source.url,
           label:source.label,checkedAt:Number.isFinite(checked)&&!future?row.checkedAt:'',signals,overdue:stale&&!future});
       }
     }
   }
   const order={changed:0,unavailable:1,stale:2};
   issues.sort((a,b)=>order[a.kind]-order[b.kind]||a.bank.localeCompare(b.bank)||a.role.localeCompare(b.role));
   return {ready:!!observed,complete,issues,monitoredBanks:observed?Object.keys(watched.records).length:0};
 }
 let nextWatchAt=0;
 function refreshWatch(force=false){
   if(loading)return loading;
   if(!force&&Date.now()<nextWatchAt)return Promise.resolve(watched);
   if(typeof root.fetch!=='function')return Promise.resolve(null);
   nextWatchAt=Date.now()+15*60000;
   const controller=typeof root.AbortController==='function'?new root.AbortController():null;
   loading=root.fetch('./data/quick-add-source-monitor.json',{cache:'no-store',credentials:'omit',
     ...(controller?{signal:controller.signal}:{})}).then(response=>{
       if(!response.ok)throw Error('Source watch unavailable');
       return response.json();
     }).then(data=>{
       if(data?.schemaVersion!==1||!data.records||typeof data.records!=='object'
           ||Array.isArray(data.records)||Object.keys(data.records).length>12)throw Error('Unexpected source watch schema');
       watched=data;
       // Quick Add owns keyboard focus and scroll anchoring. Do not replace
       // its DOM asynchronously when a public watcher completes: labels refresh
       // on the next user-driven render. Only Bank Offers needs live queue updates.
       try{if(typeof tab!=='undefined'&&tab==='bonuses'&&typeof R==='function')R();}catch{}
       return watched;
     }).catch(()=>null).finally(()=>{loading=null;});
   return loading;
 }
 root.BTQuickAddCatalog=Object.freeze({version:2,status,classify,records,reviewedSources,
   safeUrl,monitored,reviewQueue,refreshWatch});

})(typeof window!=='undefined'?window:globalThis);
