'use strict';
const assert=require('assert');
const {sandbox,app,storage}=require('./full-app-smoke.test.js');
const before=JSON.stringify([...storage]);

// Offer discovery uses the selected Personal/Business audience, not the
// account's unrelated category pill or an old bank-cooldown decision.
const offersAPI=sandbox.BTBankBonusFeed;
// Browser regression uses this stable search control while focus and saved filters persist.
assert(require('node:fs').readFileSync('bank-bonuses.js','utf8').includes('placeholder="Search bank bonuses…"'),'Retain the tested offer-search control text');
const sampleOffers=[
 {title:'Synthetic Consumer Checking $300',product:'checking',bank:'Synthetic Consumer'},
 {title:'Synthetic Biz Savings $400',product:'savings',bank:'Synthetic Biz'},
 {title:'Synthetic Business account offer',product:'checking',bank:'Synthetic Business'},
 {title:'Synthetic No-Type $200',product:'',bank:'Synthetic'},
 {title:'Synthetic Structured Savings Reward',product:'savings',bank:'Structured'}
];
assert.equal(offersAPI.offerAudience(sampleOffers[0]),'personal');
assert.deepEqual(Array.from(offersAPI.offersForAudience(sampleOffers,'all'),x=>x.title),sampleOffers.map(x=>x.title),'All audience includes both products plus identity-unknown offers without classification changes');
assert.equal(offersAPI.offerAudience(sampleOffers[1]),'business','Business wording overrides generic Savings product metadata');
assert.equal(offersAPI.offerAudience(sampleOffers[2]),'business','Business wording overrides Checking metadata');
assert.equal(offersAPI.offerAudience(sampleOffers[3]),'unverified','Unknown product cannot be labeled personal with confidence');
assert.deepEqual(Array.from(offersAPI.offersForAudience(sampleOffers,'business'),x=>x.title),[sampleOffers[1].title,sampleOffers[2].title]);
assert.deepEqual(Array.from(offersAPI.offersForAudience(sampleOffers,'personal'),x=>x.title),[sampleOffers[0].title,sampleOffers[3].title,sampleOffers[4].title]);
assert.equal(offersAPI.matchesCategory(sampleOffers[4],'savings'),true,'Structured product metadata filters savings even if title omits Savings keyword');
assert.equal(offersAPI.matchesCategory(sampleOffers[1],'checking'),false,'A business savings post must not appear in Checking');
assert.equal(offersAPI.matchesCategory(sampleOffers[1],'business'),true,'Business includes savings, not just Checking');
assert.equal(offersAPI.matchesCategory(sampleOffers[2],'checking'),true,'Business Checking appears in business account Checking filter');
assert.equal(offersAPI.checkedAge('not a date'),'check time unavailable');
const savedAudience=sandbox.BT360.audience;
assert.match(sandbox.BT360.segments(),/All accounts/,'Combined scope remains discoverable on every screen');
const originalAudienceSetting=storage.get('bt3628_audience_session');
try{
 sandbox.BT360.setAudience('personal');
 sandbox.btRadarOfferPill('business');
 assert.equal(sandbox.BT360.audience,'all','The Business offer pill must keep the unified view, not switch the entire app to Business');
 assert.equal(typeof sandbox.rBankBonuses,'function','Offer renderer must remain installed');
 sandbox.BT360.setAudience('personal');
 assert.equal(sandbox.BT360.audience,'personal');
 // Category resets on returning to Personal rather than hiding all consumer posts.
 assert.equal(offersAPI.offersForAudience(sampleOffers,'personal').some(x=>x.bank==='Synthetic Consumer'),true);
}finally{sandbox.BT360.setAudience(savedAudience);if(originalAudienceSetting===undefined)storage.delete('bt3628_audience_session');else storage.set('bt3628_audience_session',originalAudienceSetting);}

const safe={schemaVersion:1,checkedAt:'2026-10-11T12:00:00Z',offers:[{title:'Bank <img onerror=alert(1)> $500 Bonus',url:'https://www.doctorofcredit.com/bank-bonus/',publishedAt:'2026-10-10T12:00:00Z'}]};
assert.equal(sandbox.BTBankBonusFeed.validate(safe).offers.length,1);
assert.equal(sandbox.BTBankBonusFeed.validate({...safe,offers:[{...safe.offers[0],url:'javascript:alert(1)'}]}).offers.length,0);
assert.equal(sandbox.BTBankBonusFeed.validate({...safe,offers:[{...safe.offers[0],publishedAt:'2099-01-01'}]}).offers.length,0);
assert.throws(()=>sandbox.BTBankBonusFeed.validate({...safe,checkedAt:'bad'}));
assert.throws(()=>sandbox.BTBankBonusFeed.validate({...safe,schemaVersion:3}));
const additional={...safe,schemaVersion:2,offers:[{...safe.offers[0],title:'U.S. Bank $450 Checking Bonus',url:'https://frequentmiler.com/us-bank-bonus/',groupKey:'bank us 450 checking',availability:'nationwide'},{...safe.offers[0],title:'US Bank $450 Checking Bonus',url:'https://www.hustlermoneyblog.com/us-bank-bonus/',groupKey:'bank us 450 checking',availability:'nationwide'},{...safe.offers[0],title:'US Bank $500 Checking Bonus',groupKey:'bank us 500 checking',availability:'unknown'}]};
const multi=sandbox.BTBankBonusFeed.validate(additional);
assert.equal(multi.offers.length,3);
assert.equal(sandbox.BTBankBonusFeed.group(multi.offers).length,2);
assert.equal(sandbox.BTBankBonusFeed.group(multi.offers)[0].links.length,2);
assert.equal(sandbox.BTBankBonusFeed.filter(multi.offers,'U.S. Bank','nationwide').length,1);
assert.equal(sandbox.BTBankBonusFeed.filter(multi.offers,'Wells Fargo','all').length,0);
assert.equal(sandbox.BTBankBonusFeed.group([multi.offers[0],{...multi.offers[1],availability:'regional'}])[0].availability,'unknown');
assert.equal(sandbox.BTBankBonusFeed.validate({...safe,offers:[{...safe.offers[0],url:'https://frequentmiler.com.evil.test/bank/'}]}).offers.length,0);
assert.equal(JSON.stringify([...storage]),before,'Feed validator changed account storage');
assert.ok(app.innerHTML.includes('Bank Bonuses'),'New tab not rendered');
assert.ok(!require('fs').readFileSync('style.css','utf8').includes('.tabs .tb:nth-child(5)'),'Obsolete fifth-tab hide rule remains');
const offer={title:'Wells Fargo $325 Checking Bonus',url:'https://www.hustlermoneyblog.com/wells-fargo-checking-bonus/'};
const evidence={schemaVersion:1,status:'complete',records:{[offer.url]:{offerTitle:offer.title,offerUrl:offer.url,status:'evidence-found',officialCheckedAt:new Date().toISOString(),aiCheckedAt:new Date().toISOString(),reason:'Extracted quotations need review.',fields:{bonus:{value:'$325',quote:'Receive a $325 bonus.',sourceUrl:'https://accountoffers.wellsfargo.com/checkingoffer/',sourceHash:'a'.repeat(64)}}}}};
assert.equal(sandbox.BTBankBonusFeed.evidence(offer,evidence).fields.bonus.value,'$325');
assert.equal(sandbox.BTBankBonusFeed.evidence({...offer,title:'Wells Fargo $500 Bonus'},evidence),null);
assert.equal(sandbox.BTBankBonusFeed.evidence(offer,{...evidence,status:'unavailable'}),null);
const stale=JSON.parse(JSON.stringify(evidence));stale.records[offer.url].officialCheckedAt='2020-01-01';
assert.equal(Object.keys(sandbox.BTBankBonusFeed.evidence(offer,stale).fields).length,0);
const unsafe=JSON.parse(JSON.stringify(evidence));unsafe.records[offer.url].fields.bonus.sourceUrl='https://www.wellsfargo.com.evil.test/';
assert.equal(Object.keys(sandbox.BTBankBonusFeed.evidence(offer,unsafe).fields).length,0);
assert.equal(JSON.stringify([...storage]),before,'Evidence projection changed saved account storage');
console.log('Bank feed validation passed: schema, safe links, future dates, tab and account isolation');
const fresh=sandbox.BTBankBonusFeed.evidence(offer,evidence);
const candidate={...offer,publishedAt:new Date().toISOString(),groupKey:'wells',availability:'nationwide',evidence:fresh};
assert.equal(sandbox.BTBankBonusFeed.amount(candidate),325);
assert.equal(sandbox.BTBankBonusFeed.filter([candidate],'','all',{amount:'300'}).length,1);
assert.equal(sandbox.BTBankBonusFeed.filter([candidate],'','all',{amount:'500'}).length,0);
assert.equal(sandbox.BTBankBonusFeed.filter([candidate],'','all',{fees:'missing'}).length,1);
assert.equal(sandbox.BTBankBonusFeed.filter([candidate],'','all',{fees:'present'}).length,0);
assert.equal(sandbox.BTBankBonusFeed.filter([candidate],'','all',{activity:'missing'}).length,1);
assert.equal(sandbox.BTBankBonusFeed.filter([{...candidate,evidence:{...fresh,status:'needs-review'}}],'','all',{amount:'unknown'}).length,1,'Mismatched amount must remain unknown');
assert.equal(sandbox.BTBankBonusFeed.filter([{...candidate,evidence:{...fresh,fields:{bonus:{value:'$325 or $500'}}}}],'','all',{amount:'unknown'}).length,1,'Tiered amounts must remain unknown');
const changedEvidence=JSON.parse(JSON.stringify(evidence));
changedEvidence.records[offer.url].changesAt=new Date().toISOString();
changedEvidence.records[offer.url].changes=[{field:'monthly_fee',before:'$10',after:'$15',kind:'changed'},{field:'evil',before:'unsafe',after:'unsafe',kind:'changed'}];
const changedProjection=sandbox.BTBankBonusFeed.evidence(offer,changedEvidence);
assert.equal(changedProjection.changes.length,1);
assert.equal(sandbox.BTBankBonusFeed.filter([{...candidate,evidence:changedProjection}],'','all',{evidence:'changed'}).length,1);
changedEvidence.records[offer.url].officialCheckedAt='2020-01-01';
assert.equal(sandbox.BTBankBonusFeed.evidence(offer,changedEvidence).changes.length,0,'Stale changes must not appear current');
assert.equal(JSON.stringify([...storage]),before,'Review and filters changed saved account storage');
console.log('Evidence review passed: amount uncertainty, fee/activity filters, change validation and private-data isolation');

const malformed=JSON.parse(JSON.stringify(evidence));
malformed.records[offer.url].fields.bonus.value='';
malformed.records[offer.url].fields.toString={value:'$325',quote:'$325',sourceUrl:'https://accountoffers.wellsfargo.com/checkingoffer/',sourceHash:'a'.repeat(64)};
assert.equal(Object.keys(sandbox.BTBankBonusFeed.evidence(offer,malformed).fields).length,0,'Empty values and inherited field names must be rejected');
assert.equal(sandbox.BTBankBonusFeed.amount({...candidate,evidence:{...fresh,fields:{bonus:{value:'$3,25'}}}}),null,'Malformed currency must stay unknown');

// Geography never guesses availability from a bank name or a missing restriction.
const priority=sandbox.BTBankBonusFeed;
const geo=(title,area='MO',availability='unknown')=>priority.geography({title,availability},area);
assert.equal(geo('[CA, UT In Branch] Columbia Bank $250 Checking Bonus').kind,'outside');
assert.equal(geo('(Update) [MO, KS] Regional Bank $300 Checking Bonus').kind,'listed');
assert.equal(geo('[MO, Select Counties only] Regional Bank $300').kind,'listed');
assert.match(geo('[MO, Select Counties only] Regional Bank $300').detail,/local limits/);
assert.equal(geo('Wells Fargo $325 Checking Bonus').kind,'unknown');
assert.equal(geo('Any Bank (Nationwide)').kind,'nationwide');
assert.equal(geo('[CA only] Any Bank (Nationwide)').kind,'unknown','Contradictory geography must not become exclusion');
assert.equal(geo('[Nationwide except MO] Any Bank').kind,'outside');
assert.equal(geo('[CA only] Any Bank','CA').kind,'listed');
assert.equal(geo('[CA only] Any Bank','').kind,'unknown');
const context={today:'2026-10-14',family:n=>String(n).toLowerCase().replace(/\b(?:bank|biz|business|personal)\b/g,'').replace(/\s+/g,' ').trim(),audience:e=>e.accountType||'personal',nonrepeat:e=>e.churnable===false,ready:e=>e.reviewDate||''};
const rows=[{bank:'Soon Bank',closed:'2026-01-01',reviewDate:'2026-11-01'}, {bank:'Ready Bank',closed:'2026-01-01',reviewDate:'2026-10-13'}, {bank:'Later Bank',closed:'2026-01-01',reviewDate:'2026-12-01'}, {bank:'Open Bank',closed:'',reviewDate:'2026-01-01'}, {bank:'Once Bank',closed:'2026-01-01',churnable:false}, {bank:'Unknown Bank',closed:'2026-01-01'}, {bank:'Chase Biz',accountType:'business',closed:'2026-01-01',reviewDate:'2026-10-01'}];
const discovery=['[CA only] Ready Bank $300 Checking Bonus','Later Bank $400 Checking Bonus','New Bank $300 Checking Bonus','Soon Bank $300 Checking Bonus','Ready Bank $500 Checking Bonus','Open Bank $250 Checking Bonus','Once Bank $300 Checking Bonus','Unknown Bank $100 Checking Bonus','Chase Bank $500 Business Checking Bonus'].map((title,i)=>({title,publishedAt:'2026-10-13T12:00:00Z',url:'https://example.test/'+i}));
const snapshot=JSON.stringify(rows);
const ordered=priority.prioritize(discovery,rows,'MO',context);
assert.equal(ordered[0].priorityGroup,'explore','Tracker review readiness alone is not proof of personal eligibility');
assert.equal(ordered.at(-1).geo.kind,'outside','Regional mismatch overrides tracker readiness');
assert.equal(ordered.find(x=>x.title.startsWith('Open')).match.kind,'review');
assert.equal(ordered.find(x=>x.title.startsWith('Once')).match.kind,'review');
assert.equal(ordered.find(x=>x.title.startsWith('Unknown')).match.date,'');
assert.equal(ordered.filter(x=>x.priorityGroup==='next').map(x=>x.match.date).join(','),'2026-11-01,2026-12-01');
assert.equal(priority.match({title:'Chase $500 Checking Bonus'},rows,context),null,'Business cooldown must not be applied to a consumer offer');
assert.equal(priority.match({title:'Ready Bank $2,500 Investing Bonus'},rows,context).kind,'review');
assert.equal(priority.match({title:'Ready Bank synthetic unspecified reward'},rows,context).kind,'review','Unclassified product cannot get tracker ready grouping');
assert.equal(priority.match({title:'Soon Bank $300 Checking Bonus'},[...rows,{bank:'Soon Bank',closed:'2026-01-01',reviewDate:'2027-01-01'}],context).date,'2027-01-01');
assert.equal(priority.prioritize(discovery,rows,'MO',context,'area').some(x=>x.geo.kind==='outside'),false);
assert.equal(priority.prioritize(discovery,rows,'MO',context,'tracker').every(x=>!!x.match),true);
assert.equal(JSON.stringify(rows),snapshot,'Ranking must not mutate account records');
assert.equal(JSON.stringify([...storage]),before,'Personal discovery must not change persisted financial data');

// Eligibility-first smart sorter: bonus amount cannot override blockers.
const dollar=String.fromCharCode(36);
const smartProof={status:'verified',rules:[],conditions:[],nationwide:true};
const pURL='https://www.chase.com/synthetic-promotion',fURL='https://www.chase.com/synthetic-fees';
const smartBonus=n=>({status:'evidence-found',stale:false,changed:false,checkedAt:new Date().toISOString(),
 sources:[{role:'promotion',url:pURL,hash:'a'.repeat(64)},{role:'fees',url:fURL,hash:'b'.repeat(64)}],
 fields:{
  bonus:{value:dollar+n,sourceUrl:pURL},eligibility:{value:'New customer only',sourceUrl:pURL},
  qualifying_activity:{value:'Qualifying activity required',sourceUrl:pURL},
  monthly_fee:{value:dollar+'10 monthly',sourceUrl:fURL}
 }});

const smartOffer=(bank,amount,scope=true,opts={})=>({title:bank+' '+dollar+amount+' Checking Bonus',bank,product:'checking',amount,groupKey:'sort-'+bank,
  publishedAt:'2026-10-13T12:00:00Z',url:'https://example.test/smart-'+bank,availability:'unknown',
  evidence:smartBonus(amount),...(scope?{officialAvailability:smartProof}:{}),...opts});
const smartRows=[{bank:'Closed Bank',accountType:'personal',closed:'',reviewDate:'2026-01-01'},
 {bank:'Future Bank',accountType:'personal',closed:'2026-01-01',reviewDate:'2026-11-01'}];
const smartBefore=JSON.stringify(smartRows);
const smartSorted=priority.prioritize([
 smartOffer('SafeA',600),smartOffer('SafeB',900),smartOffer('SafeC',950,true,{rewardIsUpperBound:true}),
 smartOffer('NoScope',1200,false),smartOffer('Closed Bank',5000),smartOffer('Future Bank',4000)
],smartRows,'MO',context);
assert.deepEqual(smartSorted.slice(0,2).map(x=>x.bank),['SafeB','SafeA'],
 'Only proven fixed bonuses with complete current sources qualify for Top matches');
assert.equal(smartSorted.find(x=>x.bank==='SafeC').priorityGroup,'explore',
 'Upper-bound tier cannot become a top recommendation without exact fixed value');
assert.equal(smartSorted.find(x=>x.bank==='NoScope').priorityGroup,'explore');
assert.equal(smartSorted.find(x=>x.bank==='Closed Bank').priorityGroup,'review');
assert.equal(smartSorted.find(x=>x.bank==='Future Bank').priorityGroup,'next');
assert.equal(smartSorted[0].priorityGroup,'best');
assert.match(smartSorted[0].fit.reason,/personal customer eligibility/);
assert.equal(priority.offerFit(smartOffer('Test',1500),{kind:'outside'},null).kind,'blocked');
const newer=smartOffer('Newer',2500,true,{badges:['New'],evidence:{...smartBonus(2500),sources:[]}});
const newResult=priority.prioritize([smartOffer('Stable',400),newer],[],'MO',context);
assert.equal(newResult[0].bank,'Stable','A new high-dollar headline must not outrank an unchanged applicable offer without full source review');
assert.equal(newResult.find(x=>x.bank==='Newer').priorityGroup,'review','New offer requires source verification before top ranking');
const revised=smartOffer('Revised',1500,true,{badges:['Increased'],evidence:{...smartBonus(1500),fields:{bonus:{value:dollar+1500,sourceUrl:pURL}}}});
assert.equal(priority.prioritize([revised],[],'MO',context)[0].priorityGroup,'review','Increased headline requires current terms review');
const changed=smartOffer('Changed',1600,true,{evidence:{...smartBonus(1600),changed:true}});
assert.equal(priority.prioritize([changed],[],'MO',context)[0].priorityGroup,'review','Changed official evidence must be reviewed');
assert.equal(priority.completeOfferProof(smartOffer('Fully',1200)),true,'All exact scoped official terms permit evidence-ready rank');
const noEligibility=smartOffer('Incomplete',3200,true,{evidence:{...smartBonus(3200),fields:{bonus:{value:dollar+3200,sourceUrl:pURL}}}});
assert.equal(priority.completeOfferProof(noEligibility),false,'Headline/bonus quote alone does not prove eligibility');
assert.equal(priority.prioritize([noEligibility],[],'MO',context)[0].priorityGroup,'explore',
 'State coverage without official fee/customer/activity evidence is not a top match');
const staleEvidence=smartOffer('Stale',2100,true,{evidence:{...smartBonus(2100),checkedAt:'2020-01-01T00:00:00Z'}});
assert.equal(priority.completeOfferProof(staleEvidence),false,'An old promotion review cannot establish current top rank');
const weakFee=smartOffer('FeeMissing',2100,true,{evidence:{...smartBonus(2100),sources:[{role:'promotion',url:pURL,hash:'a'.repeat(64)}]}});
assert.equal(priority.completeOfferProof(weakFee),false,'The applicable fee schedule source must exist');
assert.equal(JSON.stringify(smartRows),smartBefore,'Ranking must not mutate account history');
assert.equal(JSON.stringify([...storage]),before,'Sorting must not write financial records');
console.log('Smart sorter PASS: highest proven bonus first, blocked high offers demoted, no writes');
console.log('Personal discovery passed: state evidence, unknown availability, audience/product separation, latest restriction, stable ordering and read-only records');

assert.equal(priority.match({title:'Soon Bank $300 Checking Bonus'},[{bank:'Soon Bank',closed:'2026-01-01',reviewDate:'2026-02-30'}],context).kind,'review','Invalid dates must not produce readiness');

const scopeOffer={title:'Truist $500 Checking Bonus',url:'https://www.doctorofcredit.com/truist-bonus/'};
const checkedAt=new Date(Date.now()-60000).toISOString(),expiresAt=new Date(Date.now()+3600000).toISOString();
const scopeRecord={...scopeOffer,offerTitle:scopeOffer.title,offerUrl:scopeOffer.url,status:'verified',checkState:'checked',checkedAt,expiresAt,sourceUrl:'https://www.truist.com/checking/lp/promos/checking-promo4',sourceHash:'a'.repeat(64),rules:[{mode:'include',states:['AL','AR'],quote:'The client must have a physical address in AL or AR.'}],conditions:[]};
const catalog={schemaVersion:1,records:{[scopeOffer.url]:scopeRecord}};
const official=priority.availability(scopeOffer,catalog);
assert.equal(official.status,'verified');
assert.equal(priority.geography({...scopeOffer,officialAvailability:official},'MO').kind,'outside');
assert.equal(priority.availability({...scopeOffer,title:'Truist $300 Checking Bonus'},catalog),null,'Changed offer identity cannot borrow evidence');
assert.equal(priority.availability(scopeOffer,{...catalog,records:{[scopeOffer.url]:{...scopeRecord,expiresAt:new Date(Date.now()-1000).toISOString()}}}).status,'stale');
assert.equal(priority.availability(scopeOffer,{...catalog,records:{[scopeOffer.url]:{...scopeRecord,rules:[{mode:'include',states:['BAD'],quote:'Invalid'}]}}}).status,'needs-review');
assert.equal(priority.availability(scopeOffer,{...catalog,records:{[scopeOffer.url]:{...scopeRecord,sourceUrl:'https://www.truist.com.evil.test/'}}}).status,'needs-review');
assert.equal(priority.availability(scopeOffer,{...catalog,records:{[scopeOffer.url]:{...scopeRecord,checkedAt:new Date(Date.now()+600000).toISOString()}}}).status,'needs-review');
const ids=priority.priorityIdentifiers(discovery, {...context,rows},'MO');
assert.ok(ids.length<=8&&ids.every(id=>typeof id==='string'),'Priority envelope contains only public URLs');
assert.ok(!JSON.stringify(ids).includes('reviewDate'));
assert.equal(JSON.stringify([...storage]),before,'Availability verification cannot rewrite saved terms');
console.log('Official scope projection passed: exact offer identity, source trust, expiry, state constraints and public-only priority identifiers');

const canonicalNow=new Date(Date.now()-120000).toISOString();
const canonical={schemaVersion:2,checkedAt:canonicalNow,offers:[{
  title:'Chase $400 Checking Bonus',url:'https://www.doctorofcredit.com/chase-synthetic/',
  publishedAt:canonicalNow,bank:'chase',product:'checking',amount:400,region:'unknown',
  offerKey:'chase|checking|400|unknown',groupKey:'chase|checking|400|unknown',
  firstSeen:canonicalNow,badges:['New','Increased'],changeLabel:'$300 → $400',
  links:[
    {url:'https://www.doctorofcredit.com/chase-synthetic/',sourceId:'doc',title:'Chase $400 Checking Bonus'},
    {url:'https://www.hustlermoneyblog.com/chase-synthetic/',sourceId:'hmb',title:'JPMorgan Chase $400 Checking Bonus'}
  ]
}]};
const canonicalProjection=priority.validate(canonical);
assert.equal(canonicalProjection.offers.length,1);
assert.equal(canonicalProjection.offers[0].links.length,2);
assert.equal(canonicalProjection.offers[0].bank,'chase');
assert.equal(canonicalProjection.offers[0].amount,400);
assert.equal(priority.group(canonicalProjection.offers).length,1);
assert.equal(priority.filter(canonicalProjection.offers,'chase','all',{amount:'300'}).length,1);
assert.equal(priority.filter(canonicalProjection.offers,'chase','all',{amount:'500'}).length,0);
const withAlien={...canonicalProjection.offers[0],links:[
 {url:'https://www.doctorofcredit.com/chase-synthetic/',sourceId:'doc',title:'Chase $400 Checking Bonus'},
 {url:'javascript:alert(1)',sourceId:'hmb',title:'Bad link'}]};
assert.equal(priority.validate({...canonical,offers:[{...canonical.offers[0],links:withAlien.links}]}).offers[0].links.length,1,'Unsafe links must not render');
assert.equal(priority.evidence({...canonical.offers[0],title:'Chase $500 Checking Bonus'},evidence),null,'Different reward may not borrow the same source evidence');
assert.equal(JSON.stringify([...storage]),before,'Canonical multi-source offers mutated tracker data');
console.log('Canonical offer UI passed: compact identity, two safe sources, extracted amount filters and data isolation');
