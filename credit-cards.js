/* Read-only card plans. No bank-account, payment, tax or eligibility engine writes. */
(function(root){
'use strict';
const KEY='bt_credit_cards_v1',FORMAT='BonusTrackerCreditCard',VERSION=1;
let selected=false,pending=null,baseline=null,error='',query='',category='all';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>v?new Date(v+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}):'Not recorded';
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const url=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch{return ''}};
function validate(p){
 if(!p||p.format!==FORMAT||p.version!==VERSION||!p.card||typeof p.card!=='object')throw Error('Choose a credit-card plan prepared for BonusTracker.');
 const c=p.card,keys=['id','issuer','name','opened','closed','reviewedOn','annualFee','nextFeeOn','welcomeOffer','benefits','reviews','closeBefore','sources','notes','accountType','role','five24','five24Reason','annualFeeDateKind','annualFeeNote','bonusDeadline','bonusReceived','sourceNote'];
 if(Object.keys(c).some(k=>!keys.includes(k)))throw Error('This plan contains unsupported fields.');
 for(const k of ['id','issuer','name'])if(typeof c[k]!=='string'||!c[k].trim()||c[k].length>120)throw Error('The card name, issuer or record ID is missing.');
 if(!/^[a-zA-Z0-9_-]+$/.test(c.id))throw Error('The record ID is invalid.');
 for(const k of ['opened','closed','reviewedOn','nextFeeOn','closeBefore','bonusDeadline','bonusReceived'])if(c[k]!==null&&c[k]!==undefined&&c[k]!==''&&!validDate(c[k]))throw Error('Check the date in '+k+'.');
 if(!validDate(c.reviewedOn)||c.reviewedOn>new Date().toISOString().slice(0,10))throw Error('The review date must be an actual date.');
 const today=new Date().toISOString().slice(0,10);
 if(c.opened&&c.opened>today||c.closed&&(!c.opened||c.closed<c.opened||c.closed>today))throw Error('Check the actual opening and closing dates.');
 if(c.annualFee!==null&&c.annualFee!==undefined&&(typeof c.annualFee!=='number'||!Number.isFinite(c.annualFee)||c.annualFee<0))throw Error('The annual fee must be a confirmed amount or left unknown.');
 for(const [k,allowed] of Object.entries({accountType:['personal','business','unknown'],role:['primary','authorized','unknown'],five24:['counts','excluded','unknown'],annualFeeDateKind:['confirmed','estimated','unknown']}))if(c[k]!==undefined&&!allowed.includes(c[k]))throw Error('Check '+k+' in the prepared plan.');
 if(c.bonusReceived&&c.bonusReceived>today)throw Error('A received bonus needs an actual date.');
 for(const k of ['five24Reason','annualFeeNote','sourceNote'])if(c[k]!==undefined&&typeof c[k]!=='string')throw Error('Check the card notes.');
 if(c.five24==='excluded'&&!c.five24Reason?.trim())throw Error('Explain why this card is excluded from the estimate.');
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
function prepare(p){
 if(!p||!['BonusTrackerCreditCard','BonusTrackerCreditCards'].includes(p.format)||p.version!==1)throw Error('Choose a prepared credit-card plan or collection.');
 const items=p?.format==='BonusTrackerCreditCards'&&p.version===1?p.cards:[p?.card];
 if(!Array.isArray(items)||!items.length||items.length>100)throw Error('Choose a prepared card plan or collection.');
 const cards=items.map(card=>validate({format:FORMAT,version:VERSION,card}));
 if(new Set(cards.map(c=>c.id)).size!==cards.length)throw Error('The collection contains duplicate card IDs.');
 if(JSON.stringify(p).length>1000000)throw Error('This card collection is too large.');
 load();baseline=root.localStorage.getItem(KEY);pending=cards;error='';selected=true;return p?.format==='BonusTrackerCreditCards'?cards:cards[0];
}
function commit(){
 if(!pending)return false;
 try{
  if(root.localStorage.getItem(KEY)!==baseline)throw Error('Your card plans changed. Open the plan again to review the latest version.');
  const data=load();
  for(const incoming of pending){
   const index=data.cards.findIndex(x=>x.current.id===incoming.id);
   if(index>=0){const old=data.cards[index];if(old.current.issuer!==incoming.issuer||(old.current.opened&&old.current.opened!==incoming.opened))throw Error('This record ID belongs to a different issuer or opening date.');if(incoming.reviewedOn<old.current.reviewedOn)throw Error('This plan is older than your saved review.');data.cards[index]={current:incoming,history:[...old.history,old.current]};}
   else data.cards.push({current:incoming,history:[]});
  }
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
 '<p class="cc-reviewed">Prepared '+esc(date(c.reviewedOn))+' · read-only plan</p><div class="cc-dates">'+row('Account opened',date(c.opened))+row('Account closed',date(c.closed))+row('Next annual fee',feeDate(c))+row('5/24 estimate',c.five24==='counts'?'Counts while in the planning window':c.five24==='excluded'?'Excluded from this estimate':'Needs review')+'</div>'+(c.annualFeeNote?'<p>'+esc(c.annualFeeNote)+'</p>':'')+(c.five24Reason?'<p>'+esc(c.five24Reason)+'</p>':'')+
 '<p class="cc-source-note">'+esc(c.sourceNote||'Prepared from saved card information. Missing details stay unconfirmed.')+'</p><section><h3>Your welcome offer</h3><p>'+esc(c.welcomeOffer||'Original offer not confirmed. Today’s advertisement may be different.')+'</p></section>'+
 '<section><h3>Benefits to use</h3>'+c.benefits.map(b=>'<div class="cc-benefit"><b>'+esc(b.title)+'</b>'+(b.status?'<small>'+esc(b.status)+'</small>':'')+'<p>'+esc(b.detail)+'</p></div>').join('')+'</section>'+
 '<section><h3>Dates to review</h3>'+c.reviews.map(r=>'<div class="cc-review"><div><b>'+esc(r.title)+'</b><span>'+esc(r.on?date(r.on):'Check with issuer')+'</span></div><small>'+esc(r.kind==='suggested'?'Suggested review · not an issuer deadline':r.kind==='issuer-confirmed'?'Issuer-confirmed date':'Timing not confirmed')+(r.on?' · '+esc(countdown(r.on)):'')+'</small><p>'+esc(r.detail)+'</p></div>').join('')+'</section>'+
 '<section><h3>Before changing or closing</h3><p>Confirm the offer’s keep-open rules, any bonus repayment, the annual-fee refund policy and what happens to unused rewards. Let pending credits and refunds arrive, move recurring payments, and settle the final balance. A review date does not mean the card is safe to close.</p>'+(c.notes?'<p>'+esc(c.notes)+'</p>':'')+'</section>'+
 '<details><summary>Sources & saved history</summary><p>Enrollment details come from your saved offer. Public product pages describe current benefits and may change.</p>'+c.sources.map(s=>'<p><a href="'+esc(url(s.url))+'" target="_blank" rel="noopener noreferrer">'+esc(s.label)+' ↗</a><small>'+esc(s.note)+'</small></p>').join('')+(history.length?'<p>'+history.length+' earlier plan'+(history.length===1?'':'s')+' preserved in your backup.</p>':'')+'</details></article>';
}
function planningDrop(opened){
 if(!validDate(opened))return null;
 const [y,m]=opened.split('-').map(Number);
 return new Date(Date.UTC(y+2,m,1,12)).toISOString().slice(0,10);
}
function five24(cards,today=typeof td==='function'?td():new Date().toISOString().slice(0,10)){
 const known=[],unknown=[],excluded=[];
 const seen=new Set();
 for(const c of cards){
  if(seen.has(c.id))continue;seen.add(c.id);
  const drop=planningDrop(c.opened);
  if(c.five24==='excluded'||drop&&drop<=today){excluded.push({card:c,drop});continue;}
  if(!drop||!c.five24||c.five24==='unknown'){unknown.push({card:c,drop});continue;}
  if(c.opened<=today)known.push({card:c,drop});
 }
 known.sort((a,b)=>a.drop.localeCompare(b.drop)||a.card.name.localeCompare(b.card.name));
 let remaining=known.length,nextUnder=null;
 for(const day of [...new Set(known.map(x=>x.drop))]){remaining-=known.filter(x=>x.drop===day).length;if(remaining<5){nextUnder=known.length>=5?day:null;break;}}
 return {count:known.length,unknown:unknown.length,known,unresolved:unknown,excluded,nextUnder,complete:unknown.length===0};
}
function feeDate(c){return c.annualFee===0?'No annual card fee':c.nextFeeOn?date(c.nextFeeOn)+(c.annualFeeDateKind==='confirmed'?' · confirmed':' · estimated'):'Date not confirmed';}
function daysUntil(on,today){return Math.round((Date.parse(on+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);}
function dashboard(cards){
 const today=typeof td==='function'?td():new Date().toISOString().slice(0,10),p=five24(cards,today),open=cards.filter(c=>!c.closed);
 const fees=open.filter(c=>c.annualFee>0&&c.nextFeeOn&&daysUntil(c.nextFeeOn,today)>=0&&daysUntil(c.nextFeeOn,today)<=45);
 const unknownFees=open.filter(c=>c.annualFee===undefined||c.annualFee===null||c.annualFee>0&&!c.nextFeeOn);
 const bonuses=open.filter(c=>!c.bonusReceived&&c.bonusDeadline&&daysUntil(c.bonusDeadline,today)>=0&&daysUntil(c.bonusDeadline,today)<=30);
 const missingBonus=open.filter(c=>!c.bonusReceived&&!c.bonusDeadline);
 return '<section class="cc-dashboard" aria-label="Card stats"><div class="cc-stats-grid"><div class="'+(p.count>=5||p.unknown?'is-caution':'')+'"><span>5/24 estimate</span><strong>'+p.count+' known</strong><small>'+(p.unknown?(p.unknown===1?'1 needs review':p.unknown+' need review'):'From saved cards only')+'</small></div><div><span>Annual fees · 45 days</span><strong>'+fees.length+'</strong><small>'+(unknownFees.length?(unknownFees.length===1?'1 needs review':unknownFees.length+' need review'):'Saved dates only')+'</small></div><div><span>Bonus deadlines · 30 days</span><strong>'+bonuses.length+'</strong><small>'+(missingBonus.length?'Some dates missing':'Saved dates only')+'</small></div></div>'+
 '<details class="cc-stats-details"><summary>View 5/24 timeline & upcoming dates</summary><div class="cc-stat-note"><b>'+(p.nextUnder?'Listed cards fall below five on '+date(p.nextUnder):p.count<5?'Fewer than five known cards':'Check your listed accounts')+'</b><p>'+(p.unknown?'Opening dates or counting details are missing. Your full total and below-five date are not confirmed.':'This is an estimate from saved accounts, not a complete credit report or Chase approval.')+'</p></div><h3>Cards in the estimate</h3>'+p.known.map(x=>'<div class="cc-timeline-row"><span>'+esc(x.card.name)+'<small>Opened '+esc(date(x.card.opened))+(x.card.closed?' · closed, still counted':'')+'</small></span><b>Stops counting<br>'+esc(date(x.drop))+'</b></div>').join('')+(p.known.length?'':'<p>No confirmed counting records yet.</p>')+
 (p.unresolved.length?'<h3>Needs review</h3>'+p.unresolved.map(x=>'<p>'+esc(x.card.name)+' · '+esc(!x.card.opened?'Opening date needed':'Check whether it counts')+'</p>').join(''):'')+
 '<h3>Annual fees in the next 45 days</h3>'+(fees.length?fees.map(c=>'<p>'+esc(c.name)+' · '+esc(feeDate(c))+'</p>').join(''):'<p>No saved fee dates in this period.'+(unknownFees.length?' Some dates or amounts are still unknown.':'')+'</p>')+
 '<h3>Bonus deadlines in the next 30 days</h3>'+(bonuses.length?bonuses.map(c=>'<p>'+esc(c.name)+' · '+esc(date(c.bonusDeadline))+'</p>').join(''):'<p>No recorded deadlines in this period. This does not confirm that every bonus is complete.</p>')+
 '<details><summary>How this estimate works</summary><p>5/24 is a reported, unpublished Chase policy. This planner uses the first day of the month after a card’s 24-month anniversary. Closing a card does not remove it early. Most business cards that do not appear on a personal report are excluded; not all business cards qualify for that exclusion. Authorized-user cards may appear in automated counts and need review. Keep the original opening date and record ID when changing products. Check your full report and current issuer requirements before applying.</p><a href="https://travelfreely.com/checkyour5-24status/" target="_blank" rel="noopener noreferrer">Travel Freely counting guide ↗</a> · <a href="https://thepointsguy.com/credit-cards/ultimate-guide-chase-5-24-rule/" target="_blank" rel="noopener noreferrer">Reported timing method ↗</a></details></details></section>';
}
function cardList(records){
 const filtered=records.filter(x=>(category==='all'||x.current.accountType===category)&&[x.current.name,x.current.issuer].join(' ').toLowerCase().includes(query.toLowerCase())).sort((a,b)=>(b.current.opened||'').localeCompare(a.current.opened||''));
 return '<div class="cc-list-tools"><label>Search cards<input id="cc-search" type="search" placeholder="Card or issuer" value="'+esc(query)+'" oninput="BTCards.search(this.value)"></label><label>Show<select onchange="BTCards.filter(this.value)">'+[['all','All cards'],['personal','Personal'],['business','Business']].map(([k,t])=>'<option value="'+k+'"'+(category===k?' selected':'')+'>'+t+'</option>').join('')+'</select></label></div><p class="cc-list-count">'+filtered.length+' saved card'+(filtered.length===1?'':'s')+' · newest first</p>'+
 filtered.map(x=>{const c=x.current,brand=c.issuer==='Chase'?'chase':c.issuer==='Capital One'?'capital':c.issuer==='Robinhood'?'gold':'other';return '<details class="cc-account"><summary><span class="cc-card-art '+brand+'" aria-hidden="true">'+esc(c.issuer.split(' ').map(x=>x[0]).join('').slice(0,3))+'</span><span class="cc-account-copy"><b>'+esc(c.name)+'</b><small>'+esc(c.accountType==='business'?'Business':c.accountType==='personal'?'Personal':'Account type needs review')+(c.closed?' · Closed':'')+'</small><span>Opened <strong>'+esc(date(c.opened))+'</strong></span><span>Annual fee <strong>'+esc(c.annualFee==null?'Not confirmed':'$'+c.annualFee.toLocaleString('en-US'))+'</strong></span><small>'+esc(feeDate(c))+'</small></span><span aria-hidden="true">⌄</span></summary><div class="cc-account-body">'+card(c,x.history)+'</div></details>';}).join('')+(filtered.length?'':'<p class="cc-empty">No cards match this view.</p>');
}
function navigation(){return '<div class="cc-switch" role="group" aria-label="Tracker account category"><button type="button" aria-pressed="'+!selected+'" onclick="BTCards.open(false)">Bank bonuses</button><button type="button" aria-pressed="'+selected+'" onclick="BTCards.open(true)">Credit cards</button></div>';}
function render(){
 let data;try{data=load()}catch(e){return '<div class="cc-empty" role="alert">'+esc(e.message)+'</div>';}
 return '<div class="cc-page"><div class="cc-intro"><h2>My cards</h2><p>See what needs attention. Open a card for its offer, benefits and dates.</p></div>'+dashboard(data.cards.map(x=>x.current))+(error?'<p class="cc-error" role="alert">'+esc(error)+'</p>':'')+
 (pending?'<section class="cc-import" aria-label="Review credit-card plan"><h3>Review your prepared plan</h3><p>'+(pending.length===1&&data.cards.some(x=>x.current.id===pending[0].id)?'This updates the same card and preserves the previous plan.':pending.length+' card plan'+(pending.length===1?'':'s')+' ready to review. Existing cards keep their earlier plans.')+'</p><button type="button" class="bt360-primary" onclick="BTCards.commit()">Save this plan</button><button type="button" class="bt360-secondary" onclick="BTCards.cancel()">Cancel</button>'+pending.map(c=>card(c)).join('')+'</section>':'')+
 (!data.cards.length&&!pending?'<div class="cc-empty"><h3>Your first card starts here</h3><p>Ask me to prepare a card plan from your enrollment offer. Open the prepared file, review the details, then save it here.</p><p>No card number, security code or bank password is needed.</p></div>':'')+
 cardList(data.cards)+'<div class="cc-import-help"><p>Saved on this device. Keep a full backup in Files or iCloud Drive; changes do not sync automatically.</p><button type="button" class="bt360-secondary" onclick="BTCards.choose()">Open a prepared card plan</button> <button type="button" class="bt360-secondary" onclick="exportBackup()">Save a backup file</button><p>Cards are read-only. To update a benefit, payment or closing date, ask for an updated plan. Earlier saved plans are kept.</p></div></div>';
}
function reveal(){
 root.R?.();
 const focus=()=>{const panel=document.querySelector('.cc-import')||document.querySelector('.cc-error');if(panel){panel.tabIndex=-1;panel.scrollIntoView({block:'start',behavior:'auto'});panel.focus({preventScroll:true});}};
 if(root.requestAnimationFrame)root.requestAnimationFrame(focus);else focus();
}
async function importFile(f){
 if(!f)return false;
 try{
  if(f.size>1000000)throw Error('Choose a smaller card-plan file.');
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
root.BTCards={KEY,validate,load,prepare,commit,five24,planningDrop,dashboard,navigation,render,card,choose,importFile,open,get selected(){return selected},search(value){query=value;const start=document.querySelector('#cc-search')?.selectionStart;root.R?.();const input=document.querySelector('#cc-search');input?.focus({preventScroll:true});try{input?.setSelectionRange(start,start)}catch{}},filter(value){category=['all','personal','business'].includes(value)?value:'all';root.R?.();},cancel(){pending=null;baseline=null;error='';root.R?.();},readLink};
if(root.addEventListener){root.addEventListener('hashchange',readLink);root.addEventListener('load',readLink);}
if(typeof module==='object'&&module.exports)module.exports=root.BTCards;
})(typeof window!=='undefined'?window:globalThis);
