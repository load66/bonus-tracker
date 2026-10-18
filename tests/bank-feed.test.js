'use strict';
const assert=require('assert');
const {sandbox,app,storage}=require('./full-app-smoke.test.js');
const before=JSON.stringify([...storage]);
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
assert.equal(ordered[0].priorityGroup,'ready');
assert.equal(ordered.at(-1).geo.kind,'outside','Regional mismatch overrides tracker readiness');
assert.equal(ordered.find(x=>x.title.startsWith('Open')).match.kind,'review');
assert.equal(ordered.find(x=>x.title.startsWith('Once')).match.kind,'review');
assert.equal(ordered.find(x=>x.title.startsWith('Unknown')).match.date,'');
assert.equal(ordered.filter(x=>x.priorityGroup==='next').map(x=>x.match.date).join(','),'2026-11-01,2026-12-01');
assert.equal(priority.match({title:'Chase $500 Checking Bonus'},rows,context),null,'Business cooldown must not be applied to a consumer offer');
assert.equal(priority.match({title:'Ready Bank $2,500 Investing Bonus'},rows,context).kind,'review');
assert.equal(priority.match({title:'Soon Bank $300 Checking Bonus'},[...rows,{bank:'Soon Bank',closed:'2026-01-01',reviewDate:'2027-01-01'}],context).date,'2027-01-01');
assert.equal(priority.prioritize(discovery,rows,'MO',context,'area').some(x=>x.geo.kind==='outside'),false);
assert.equal(priority.prioritize(discovery,rows,'MO',context,'tracker').every(x=>!!x.match),true);
assert.equal(JSON.stringify(rows),snapshot,'Ranking must not mutate account records');
assert.equal(JSON.stringify([...storage]),before,'Personal discovery must not change persisted financial data');
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
