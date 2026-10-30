'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const persistence=require('../persistence-transaction.js'),core=require('../cloud-backup-core.js');
const data=new Map([['bt_e_v4','[{"bank":"Unchanged Bank"}]']]);
const store={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),key:i=>[...data.keys()][i],get length(){return data.size}};
let changed=0;const s={localStorage:store,BTPersistence:persistence,Date,URL,console,btCloudBackupChanged:()=>changed++};s.window=s;vm.createContext(s);vm.runInContext(fs.readFileSync('credit-cards.js','utf8'),s);
const c={format:'BonusTrackerCreditCard',version:1,card:{id:'synthetic-card',issuer:'Synthetic Issuer',name:'Travel Card',opened:'2025-02-28',closed:null,reviewedOn:'2026-10-29',annualFee:95,nextFeeOn:null,welcomeOffer:'Original offer not confirmed.',benefits:[{title:'Test credit',detail:'Not yet received',status:'Pending'}],reviews:[{title:'Consider another year',on:'2027-02-28',kind:'suggested',detail:'Ask the issuer; this date is not clearance.'}],sources:[{label:'Official terms',url:'https://example.test/terms',note:'Synthetic fixture'}],notes:'<script>alert(1)</script>'}};
const clone=()=>JSON.parse(JSON.stringify(c));
const before=JSON.stringify([...data]);s.BTCards.prepare(c);assert.equal(JSON.stringify([...data]),before,'Preview must not persist');
assert(!s.BTCards.render().includes('<script>alert'),'Imported text must be escaped');
assert(s.BTCards.commit());assert.equal(changed,1);assert.equal(store.getItem('bt_e_v4'),'[{"bank":"Unchanged Bank"}]');
const saved=store.getItem(s.BTCards.KEY);assert(saved);assert(s.BTCards.render().includes('Date not confirmed'));
assert(!s.BTCards.render().includes('Safe to close'));
s.BTCards.prepare(c);assert(s.BTCards.commit());assert.equal(s.BTCards.load().cards[0].history.length,1,'Updates retain previous plan');
s.BTCards.prepare(c);store.setItem(s.BTCards.KEY,saved);assert.equal(s.BTCards.commit(),false,'Stale preview must not overwrite newer data');assert.equal(store.getItem(s.BTCards.KEY),saved);
for(const patch of [{opened:'2026-02-30'},{closed:'2020-01-01'},{annualFee:-1},{closeBefore:'2027-01-01'},{sources:[{label:'bad',url:'javascript:alert(1)',note:'bad'}]},{reviews:[{title:'Close now',on:'2027-01-01',kind:'safe',detail:'bad'}]}])assert.throws(()=>s.BTCards.validate({...clone(),card:{...clone().card,...patch}}));
const keys=['bt_e_v4',s.BTCards.KEY];const raw=core.snapshot(store,keys,{dashYear:2026,taxYear:2026},'3.7.0');
const fresh=new Map(),target={getItem:k=>fresh.get(k)??null,setItem:(k,v)=>fresh.set(k,v),removeItem:k=>fresh.delete(k),key:i=>[...fresh.keys()][i],get length(){return fresh.size}};
core.restore(target,raw,keys,persistence);assert.equal(target.getItem(s.BTCards.KEY),saved,'Recovery preserves exact card plans');
const onlyCards=JSON.parse(raw);onlyCards.storageSnapshot.bt_e_v4='[]';assert(core.hasRecords(core.inspect(JSON.stringify(onlyCards),keys)),'Card-only devices have records to protect');
s.BTCards.prepare(c);const original=store.setItem;store.setItem=()=>{throw Error('Quota')};assert.equal(s.BTCards.commit(),false);store.setItem=original;assert.equal(store.getItem(s.BTCards.KEY),saved,'Failed saves keep original plans');
console.log('Credit-card plans PASS: read-only preview, isolated save, history, stale-write and quota protection, safe text/URLs, dates and exact recovery.');

// Reported month-boundary estimate: retained closed accounts, excluded business
// cards, unknown dates and simultaneous drop-offs must not imply approval.
{
 const base=clone().card;
 const counted=(id,opened,extra={})=>({...base,id,opened,five24:'counts',accountType:'personal',...extra});
 const rows=[counted('oldest','2024-10-26'),counted('second','2024-12-08'),counted('third','2025-09-18'),counted('fourth','2026-09-04'),counted('fifth','2026-10-29'),counted('closed','2025-01-01',{closed:'2026-01-01'}),counted('business','2026-01-01',{five24:'excluded',five24Reason:'Does not report to personal report',accountType:'business'})];
 let p=s.BTCards.five24(rows,'2026-10-30');assert.equal(p.count,6);assert.equal(p.nextUnder,'2027-01-01');
 assert.equal(s.BTCards.planningDrop('2024-10-26'),'2026-11-01');
 assert.equal(s.BTCards.planningDrop('2024-02-29'),'2026-03-01');
 assert.equal(s.BTCards.five24(rows,'2026-11-01').count,5);
 assert.equal(s.BTCards.five24([...rows,counted('unknown',null)],'2026-10-30').unknown,1);
 assert.equal(s.BTCards.five24([...rows,counted('au','2026-01-01',{five24:'unknown',role:'authorized'})],'2026-10-30').unknown,1);
 const sameMonth=Array.from({length:5},(_,i)=>counted('same'+i,'2024-10-'+String(i+1).padStart(2,'0')));
 assert.equal(s.BTCards.five24(sameMonth,'2026-10-31').nextUnder,'2026-11-01');
 assert.equal(s.BTCards.five24(sameMonth,'2026-11-01').count,0);
 assert.equal(s.BTCards.five24([...rows,rows[0]],'2026-10-30').count,6,'Same record ID cannot count twice');
 const bankBefore=store.getItem('bt_e_v4');s.BTCards.prepare({format:'BonusTrackerCreditCards',version:1,cards:[counted('batch1','2026-01-01'),counted('batch2','2026-02-01')]});assert(s.BTCards.commit());assert.equal(s.BTCards.load().cards.length,3);assert.equal(store.getItem('bt_e_v4'),bankBefore);
 const before=store.getItem(s.BTCards.KEY);assert.throws(()=>s.BTCards.prepare({format:'BonusTrackerCreditCards',version:1,cards:[counted('bad','2026-01-01'),{...base,id:'invalid',opened:'2026-02-30'}]}));assert.equal(store.getItem(s.BTCards.KEY),before,'Invalid collections cannot partially import');
}
console.log('5/24 planning and atomic collections PASS: month boundary, closed/business/AU/unknown accounts, duplicates, grouped drop-offs and no bank writes.');

// Explicit, recoverable collection corrections never remove unrelated records.
{
 const original=s.BTCards.load(),extra={...clone().card,id:'correction-extra',name:'Not in selected collection'},keep={...clone().card,id:'correction-keep',accountType:'personal',five24:'counts'};
 s.BTCards.prepare({format:'BonusTrackerCreditCards',version:1,cards:[extra,keep]});assert(s.BTCards.commit());
 const before=store.getItem(s.BTCards.KEY),banks=store.getItem('bt_e_v4');
 const correction={format:'BonusTrackerCreditCards',version:1,cards:[keep],removeCardIds:[extra.id]};
 s.BTCards.prepare(correction);assert.equal(store.getItem(s.BTCards.KEY),before);assert(s.BTCards.render().includes('Remove from My cards'));assert(s.BTCards.render().includes(extra.name));
 const writer=store.setItem;store.setItem=()=>{throw Error('Quota')};assert.equal(s.BTCards.commit(),false);store.setItem=writer;assert.equal(store.getItem(s.BTCards.KEY),before);
 assert(s.BTCards.commit());const after=s.BTCards.load();assert(!after.cards.some(x=>x.current.id===extra.id));assert(after.cards.some(x=>x.current.id===keep.id));assert.equal(after.removedCards[0].current.id,extra.id);assert.equal(after.cards.length,original.cards.length+1);assert.equal(store.getItem('bt_e_v4'),banks);
 const snapshot=core.snapshot(store,keys,{dashYear:2026,taxYear:2026},'3.8.1');core.restore(target,snapshot,keys,persistence);assert.equal(target.getItem(s.BTCards.KEY),store.getItem(s.BTCards.KEY),'Correction history round-trips exactly');
 for(const removeCardIds of [[keep.id],['bad id'],[extra.id,extra.id],'all'])assert.throws(()=>s.BTCards.prepare({...correction,removeCardIds}));
 const html=s.BTCards.dashboard([{...keep,closed:null},{...keep,id:'business-total',accountType:'business',five24:'excluded'},{...keep,id:'closed-total',closed:'2026-01-01'}]);assert(html.includes('aria-label="Open card totals"'));assert(html.includes('<span>Open cards</span><strong>2</strong>'));assert(html.includes('<b>1</b> Personal'));assert(html.includes('<b>1</b> Business'));assert(html.includes('Chase 5/24 estimate'));
}
console.log('Card overview/correction PASS: separate open totals, explicit preview, recoverable removal, unrelated record isolation, quota rollback and exact backup.');
