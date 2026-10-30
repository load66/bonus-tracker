/* Read-only card plans. No bank-account, payment, tax or eligibility engine writes. */
(function(root){
'use strict';
const KEY='bt_credit_cards_v1',FORMAT='BonusTrackerCreditCard',VERSION=1;
let selected=false,pending=null,baseline=null,error='';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>v?new Date(v+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}):'Not recorded';
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const url=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch{return ''}};
function validate(p){
 if(!p||p.format!==FORMAT||p.version!==VERSION||!p.card||typeof p.card!=='object')throw Error('Choose a credit-card plan prepared for BonusTracker.');
 const c=p.card,keys=['id','issuer','name','opened','closed','reviewedOn','annualFee','nextFeeOn','welcomeOffer','benefits','reviews','closeBefore','sources','notes'];
 if(Object.keys(c).some(k=>!keys.includes(k)))throw Error('This plan contains unsupported fields.');
 for(const k of ['id','issuer','name'])if(typeof c[k]!=='string'||!c[k].trim()||c[k].length>120)throw Error('The card name, issuer or record ID is missing.');
 if(!/^[a-zA-Z0-9_-]+$/.test(c.id))throw Error('The record ID is invalid.');
 for(const k of ['opened','closed','reviewedOn','nextFeeOn','closeBefore'])if(c[k]!==null&&c[k]!==undefined&&c[k]!==''&&!validDate(c[k]))throw Error('Check the date in '+k+'.');
 if(!validDate(c.reviewedOn)||c.reviewedOn>new Date().toISOString().slice(0,10))throw Error('The review date must be an actual date.');
 const today=new Date().toISOString().slice(0,10);
 if(c.opened&&c.opened>today||c.closed&&(!c.opened||c.closed<c.opened||c.closed>today))throw Error('Check the actual opening and closing dates.');
 if(c.annualFee!==null&&c.annualFee!==undefined&&(typeof c.annualFee!=='number'||!Number.isFinite(c.annualFee)||c.annualFee<0))throw Error('The annual fee must be a confirmed amount or left unknown.');
 for(const k of ['welcomeOffer','notes'])if(c[k]!==undefined&&typeof c[k]!=='string')throw Error('The plan text is invalid.');
 for(const k of ['benefits','reviews','sources'])if(!Array.isArray(c[k])||c[k].length>40)throw Error('The plan needs benefits, review dates and sources.');
 for(const b of c.benefits)if(!b||typeof b.title!=='string'||typeof b.detail!=='string'||(b.status!==undefined&&typeof b.status!=='string'))throw Error('Check the benefit details.');
 for(const r of c.reviews)if(!r||typeof r.title!=='string'||typeof r.detail!=='string'||!['suggested','issuer-confirmed','unknown'].includes(r.kind)||r.on&&!validDate(r.on))throw Error('Review dates must explain whether they are suggested or issuer-confirmed.');
 for(const s of c.sources)if(!s||typeof s.label!=='string'||!url(s.url)||typeof s.note!=='string')throw Error('Each source needs a secure link and a note explaining what it supports.');
 if(!c.sources.length)throw Error('Add the sources used to prepare this plan.');
 if(c.closeBefore)throw Error('A plan cannot promise a safe closing deadline. Use an explained review date.');
 if(JSON.stringify(p).length>150000)throw Error('This plan is too large.');
 return JSON.parse(JSON.stringify(c));
}
function load(){
 const raw=root.localStorage.getItem(KEY);if(raw===null)return {version:1,cards:[]};
 const data=JSON.parse(raw);if(data.version!==1||!Array.isArray(data.cards))throw Error('Saved card plans could not be read. Restore a verified backup instead of replacing them.');
 data.cards.forEach(x=>{validate({format:FORMAT,version:1,card:x.current});if(!Array.isArray(x.history))throw Error('Saved card history is invalid.');});return data;
}
function prepare(p){const c=validate(p);load();baseline=root.localStorage.getItem(KEY);pending=c;error='';selected=true;return c;}
function commit(){
 if(!pending)return false;
 try{
  if(root.localStorage.getItem(KEY)!==baseline)throw Error('Your card plans changed. Open the plan again to review the latest version.');
  const data=load(),index=data.cards.findIndex(x=>x.current.id===pending.id);
  if(index>=0){const old=data.cards[index];if(old.current.issuer!==pending.issuer||old.current.name!==pending.name||old.current.opened!==pending.opened)throw Error('This record ID belongs to a different card or opening date.');if(pending.reviewedOn<old.current.reviewedOn)throw Error('This plan is older than your saved review.');data.cards[index]={current:pending,history:[...old.history,old.current]};}
  else data.cards.push({current:pending,history:[]});
  root.BTPersistence.commit(root.localStorage,{[KEY]:JSON.stringify(data)});
  pending=null;baseline=null;error='';root.btCloudBackupChanged?.();root.R?.();return true;
 }catch(e){error=e.message;root.R?.();return false;}
}
function open(value){selected=!!value;if(typeof expanded!=='undefined')expanded=null;root.bt362AddOpen=false;root.R?.();}
function countdown(on){if(!on)return '';const today=typeof td==='function'?td():new Date().toISOString().slice(0,10);const days=Math.round((Date.parse(on+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);return days===0?'Review today':days<0?'Review date passed':days+' days until review';}
function row(label,value){return '<div class="cc-row"><span>'+esc(label)+'</span><b>'+esc(value)+'</b></div>';}
function card(c,history=[]){
 const fee=c.annualFee===null||c.annualFee===undefined?'Not confirmed':'$'+c.annualFee.toLocaleString('en-US')+' / year';
 return '<article class="cc-card"><header><div><small>'+esc(c.issuer)+' · '+(c.closed?'Closed':c.opened?'Open account':'Opening date not recorded')+'</small><h2>'+esc(c.name)+'</h2></div><span class="bt360-chip">'+esc(fee)+'</span></header>'+
 '<p class="cc-reviewed">Prepared '+esc(date(c.reviewedOn))+' · read-only plan</p><div class="cc-dates">'+row('Account opened',date(c.opened))+row('Account closed',date(c.closed))+row('Next annual fee',c.nextFeeOn?date(c.nextFeeOn):'Date not confirmed')+'</div>'+
 '<section><h3>Your welcome offer</h3><p>'+esc(c.welcomeOffer||'Original offer not confirmed. Today’s advertisement may be different.')+'</p></section>'+
 '<section><h3>Benefits to use</h3>'+c.benefits.map(b=>'<div class="cc-benefit"><b>'+esc(b.title)+'</b>'+(b.status?'<small>'+esc(b.status)+'</small>':'')+'<p>'+esc(b.detail)+'</p></div>').join('')+'</section>'+
 '<section><h3>Dates to review</h3>'+c.reviews.map(r=>'<div class="cc-review"><div><b>'+esc(r.title)+'</b><span>'+esc(r.on?date(r.on):'Check with issuer')+'</span></div><small>'+esc(r.kind==='suggested'?'Suggested review · not an issuer deadline':r.kind==='issuer-confirmed'?'Issuer-confirmed date':'Timing not confirmed')+(r.on?' · '+esc(countdown(r.on)):'')+'</small><p>'+esc(r.detail)+'</p></div>').join('')+'</section>'+
 '<section><h3>Before changing or closing</h3><p>Confirm the offer’s keep-open rules, any bonus repayment, the annual-fee refund policy and what happens to unused rewards. Let pending credits and refunds arrive, move recurring payments, and settle the final balance. A review date does not mean the card is safe to close.</p>'+(c.notes?'<p>'+esc(c.notes)+'</p>':'')+'</section>'+
 '<details><summary>Sources & saved history</summary><p>Enrollment details come from your saved offer. Public product pages describe current benefits and may change.</p>'+c.sources.map(s=>'<p><a href="'+esc(url(s.url))+'" target="_blank" rel="noopener noreferrer">'+esc(s.label)+' ↗</a><small>'+esc(s.note)+'</small></p>').join('')+(history.length?'<p>'+history.length+' earlier plan'+(history.length===1?'':'s')+' preserved in your backup.</p>':'')+'</details></article>';
}
function navigation(){return '<div class="cc-switch" role="group" aria-label="Tracker account category"><button type="button" aria-pressed="'+!selected+'" onclick="BTCards.open(false)">Bank bonuses</button><button type="button" aria-pressed="'+selected+'" onclick="BTCards.open(true)">Credit cards</button></div>';}
function render(){
 let data;try{data=load()}catch(e){return '<div class="cc-empty" role="alert">'+esc(e.message)+'</div>';}
 return '<div class="cc-page"><div class="cc-intro"><h2>Credit cards</h2><p>Your welcome offers, useful benefits and next-year decisions in one place.</p></div>'+(error?'<p class="cc-error" role="alert">'+esc(error)+'</p>':'')+
 (pending?'<section class="cc-import" aria-label="Review credit-card plan"><h3>Review your prepared plan</h3><p>'+(data.cards.some(x=>x.current.id===pending.id)?'This updates the same card and preserves the previous plan.':'This adds a separate card. Your bank bonuses stay unchanged.')+'</p><button type="button" class="bt360-primary" onclick="BTCards.commit()">Save this plan</button><button type="button" class="bt360-secondary" onclick="BTCards.cancel()">Cancel</button>'+card(pending)+'</section>':'')+
 (!data.cards.length&&!pending?'<div class="cc-empty"><h3>Your first card starts here</h3><p>Ask me to prepare a card plan from your enrollment offer. Open the prepared file, review the details, then save it here.</p><p>No card number, security code or bank password is needed.</p></div>':'')+
 data.cards.map(x=>card(x.current,x.history)).join('')+'<div class="cc-import-help"><p>Saved on this device. Keep a full backup in Files or iCloud Drive; changes do not sync automatically.</p><button type="button" class="bt360-secondary" onclick="BTCards.choose()">Open a prepared card plan</button> <button type="button" class="bt360-secondary" onclick="exportBackup()">Save a backup file</button><p>Cards are read-only. To update a benefit, payment or closing date, ask for an updated plan. Earlier saved plans are kept.</p></div></div>';
}
function reveal(){
 root.R?.();
 const focus=()=>{const panel=document.querySelector('.cc-import')||document.querySelector('.cc-error');if(panel){panel.tabIndex=-1;panel.scrollIntoView({block:'start',behavior:'auto'});panel.focus({preventScroll:true});}};
 if(root.requestAnimationFrame)root.requestAnimationFrame(focus);else focus();
}
async function importFile(f){
 if(!f)return false;
 try{
  if(f.size>150000)throw Error('Choose a smaller card-plan file.');
  const raw=typeof f.text==='function'?await f.text():await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('The file could not be read. Download it to Files and try again.'));reader.readAsText(f);});
  let value;try{value=JSON.parse(raw)}catch{throw Error('This file is not valid JSON. Choose the prepared credit-card plan.');}
  prepare(value);reveal();return true;
 }catch(e){pending=null;baseline=null;selected=true;error=e.message||'The file could not be opened. Try again.';reveal();return false;}
}
function choose(){
 const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.hidden=true;
 document.body.appendChild(input);
 input.onchange=async()=>{try{await importFile(input.files?.[0])}finally{input.remove();}};
 input.oncancel=()=>input.remove();
 input.click();
}
function readLink(){if(!root.location?.hash?.startsWith('#btcard='))return;try{prepare(JSON.parse(decodeURIComponent(root.location.hash.slice(8))));if(typeof tab!=='undefined')tab='tracker';root.history?.replaceState(null,'',root.location.pathname+root.location.search);root.R?.();}catch(e){error=e.message;selected=true;root.R?.();}}
root.BTCards={KEY,validate,load,prepare,commit,navigation,render,card,choose,importFile,open,get selected(){return selected},cancel(){pending=null;baseline=null;error='';root.R?.();},readLink};
if(root.addEventListener){root.addEventListener('hashchange',readLink);root.addEventListener('load',readLink);}
if(typeof module==='object'&&module.exports)module.exports=root.BTCards;
})(typeof window!=='undefined'?window:globalThis);
