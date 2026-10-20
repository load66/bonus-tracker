'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context=vm.createContext({window:{},URL,Date});
vm.runInContext(fs.readFileSync('quick-add-catalog.js','utf8'),context,{filename:'quick-add-catalog.js'});
const c=context.window.BTQuickAddCatalog;
assert.equal(c.version,2);
assert.equal(c.status('Wells Fargo',Date.parse('2026-10-20T12:00:00Z')).kind,'expired');
assert.equal(c.status('Wells Fargo',Date.parse('2026-10-20T12:00:00Z')).checked,'2026-10-20');
assert.equal(c.status('Capital One',Date.parse('2026-10-20T12:00:00Z')).kind,'changed');
assert.equal(c.status('Capital One',Date.parse('2026-11-18T12:00:00Z')).kind,'stale');
assert.equal(c.status('Wells Fargo',Date.parse('2026-10-11T12:00:00Z')).kind,'unverified','A future review must not certify a historical browser state');
assert.equal(c.status('Capital One',Date.parse('2026-10-11T12:00:00Z')).kind,'unverified','Future source review cannot count as current');
assert.equal(c.status('Nonexistent Community Bank').kind,'unverified');
assert.equal(c.reviewedSources(c.records['Capital One']).length,2);
assert.equal(c.reviewedSources(c.records['Wells Fargo']).length,2);
assert.equal(c.safeUrl('https://www.capitalone.com.evil.invalid/bank/','Capital One'),'');
assert.equal(c.safeUrl('http://www.capitalone.com/bank/','Capital One'),'');
assert.equal(c.safeUrl('https://example.org/bank/','Capital One'),'');
assert.equal(c.safeUrl('https://www.capitalone.com@evil.invalid/','Capital One'),'');
const today=Date.parse('2026-10-20T15:00:00Z');
const base={
 bank:'Capital One',product:'Test Checking',audience:'personal',offerKey:'synthetic-scope-catalog',
 reviewedAt:'2026-10-20',state:'active',
 sources:[
  {role:'promotion',label:'Synthetic official promotion',url:'https://www.capitalone.com/bank/test/offer'},
  {role:'fees',label:'Synthetic official fees',url:'https://www.capitalone.com/bank/disclosures/test'}
 ],
 verification:{
  offerKey:'synthetic-scope-catalog',product:'Test Checking',audience:'personal',
  checkedAt:'2026-10-20T14:00:00Z',promotionVerified:true,feeScheduleVerified:true,eligibilityVerified:true,
  promotionHash:'a'.repeat(64),feeScheduleHash:'b'.repeat(64)
 }
};
assert.equal(c.classify(base,today).kind,'verified-active','A verified synthetic record can reach the source-reviewed state');
assert.equal(c.classify({...base,verification:{...base.verification,feeScheduleVerified:false}},today).kind,'unverified','A missing official fee check blocks active');
assert.equal(c.classify({...base,verification:{...base.verification,audience:'business'}},today).kind,'unverified','A different product audience blocks active');
assert.equal(c.classify({...base,verification:{...base.verification,offerKey:'different-offer-key'}},today).kind,'unverified','A different promotion blocks active');
assert.equal(c.classify({...base,verification:{...base.verification,promotionHash:''}},today).kind,'unverified','Unsupported evidence hash blocks active');
assert.equal(c.classify({...base,verification:{...base.verification,checkedAt:'2026-10-18T12:00:00Z'}},today).kind,'unverified','An old check cannot claim current activity');
assert.equal(c.classify({...base,endsAt:'2026-10-19'},today).kind,'expired','Expiry overrides a verified source snapshot');
assert.equal(c.classify({...base,sources:[{role:'promotion',url:'https://www.capitalone.com.evil.invalid'}]},today).kind,'unverified','Unsafe source cannot certify active offer');
assert.equal(c.classify({...base,bank:'Unknown Bank'},today).kind,'unverified','Unknown brands cannot become sourced');
assert.equal(Object.keys(c.records).length,2,'The initial sourced catalog has two officially reviewed examples, not twelve invented verifications');
const manifest=JSON.parse(fs.readFileSync('data/quick-add-source-manifest.json','utf8'));
assert.equal(manifest.schemaVersion,1);
for(const [bank,item] of Object.entries(manifest.records)){
 assert.equal(item.offerKey,c.records[bank].offerKey,'Monitor must match exact enrolled offer scope');
 assert.equal(item.sources.map(x=>x.url).sort().join('|'),Array.from(c.reviewedSources(c.records[bank]),x=>x.url).sort().join('|'),'Monitored source URLs must equal reviewed catalog URLs');
}

assert.match(c.status('Capital One',today).note,/CHECKING250/);
console.log('Source-backed catalog: verified-active strict gate, expiry, changed, stale, host isolation, historical fallback PASS');


// The public watch never upgrades an example to active or writes account data.
const checkedAt=new Date().toISOString();
const wells=c.records['Wells Fargo'],capital=c.records['Capital One'];
const records={};
for(const offer of [wells,capital]){
 const roles={};
 for(const link of offer.sources)roles[link.role]={
   url:link.url,status:'unchanged',baselineHash:'a'.repeat(64),observedHash:'a'.repeat(64),
   observedAt:checkedAt,checkedAt,changeAt:null
 };
 records[offer.bank]={offerKey:offer.offerKey,sources:roles};
}
records['Capital One'].sources.promotion={
 ...records['Capital One'].sources.promotion,
 status:'changed',observedHash:'b'.repeat(64),changeAt:checkedAt
};
context.window.fetch=()=>Promise.resolve({ok:true,json:()=>Promise.resolve({schemaVersion:1,generatedAt:checkedAt,records})});
c.refreshWatch().then(()=>{
 assert.equal(c.status('Capital One').watchState,'changed');
 assert.equal(c.status('Capital One').kind,'stale','Changed official source cannot be verified active');
 assert.match(c.status('Capital One').watchNote,/official promotion or fee page changed/);
 assert.equal(c.status('Wells Fargo').kind,'expired','Historical expiry must persist through source watch');
 assert.equal(c.status('Wells Fargo').watchState,'observed');
 assert.equal(c.status('Nonexistent Bank').kind,'unverified');
 console.log('Catalog monitor projection PASS: source changes demote, valid expiration survives and other banks remain unknown');
}).catch(err=>{console.error(err);process.exitCode=1});
