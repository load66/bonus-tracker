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
    Object.freeze({role:'fees',label:'Wells Fargo account disclosures',url:'https://www.wellsfargo.com/online-banking/consumer-account-fees/'})
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
 function status(bank,now){return classify(records[String(bank||'').trim()],now)}
 root.BTQuickAddCatalog=Object.freeze({version:1,status,classify,records,reviewedSources,safeUrl});
})(typeof window!=='undefined'?window:globalThis);
