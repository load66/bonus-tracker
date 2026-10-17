'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const U=require('../finance-unified-core.js'),E=require('../bonus-evidence-core.js'),P=require('../bonus-requirements-progress.js');
const now=Date.UTC(2026,9,17,12)/1000,opened='2026-09-30',entry={id:'bank-1',bank:'Synthetic Bank',opened,bonus:250,closed:''};
const sf={connected:true,lastSuccess:now,accounts:[{key:'checking',name:'Checking',bank:'Synthetic Bank',currency:'USD'}],
  mappings:{checking:{entryId:entry.id,bank:entry.bank,opened,productId:'primary'}},
  monitoredAccounts:['checking'],balanceHistory:{checking:[
    {at:now-2*86400,balance:'1600.00',currency:'USD'},
    {at:now-86400,balance:'1400.00',currency:'USD'}]},
  transactions:{checking:{w:{id:'w',posted:now-86400,amount:'1061.24',description:'Schreiber Foods',pending:false,signals:['paycheck','possible_direct_deposit']},
    inside:{id:'inside',posted:now-86400,amount:'900.00',category:'transfer',signals:['matched_internal_transfer'],pending:false},
    bought:{id:'bought',posted:now-86400,amount:'-12.45',description:'POS PURCHASE GROCER',pending:false},
    pending:{id:'pending',posted:now-86400,amount:'-19.00',description:'DEBIT CARD PURCHASE',pending:true},
    fee:{id:'fee',posted:now-86400,amount:'-5.00',signals:['possible_fee'],pending:false}}}};
const plaid={connected:true,lastSuccess:now,accounts:[{key:'savings',name:'Savings',bank:'Synthetic Bank',currency:'USD'}],
 mappings:{savings:{entryId:entry.id,bank:entry.bank,opened,productId:'secondary'}},
 transactions:{savings:{p:{id:'p',posted:now-86400,amount:'75.00',signals:['possible_bonus'],pending:false}}},
 evidenceReviews:{savings:{p:{status:'reviewed',reviewedAt:now}}}};
const unified=U.combine({simplefin:sf,plaid});
assert.equal(unified.mappings['simplefin:checking'].entryId,entry.id);
assert.equal(unified.mappings['plaid:savings'].entryId,entry.id);
assert.equal(unified.evidenceReviews['plaid:savings'].p.status,'reviewed');
const report=E.summarize(unified,[entry],now),group=report.campaigns[0];
assert.equal(report.linkedCampaigns,1);assert.equal(group.linkedAccounts.length,2);
assert.ok(group.rawActivity.every(r=>!r.id.startsWith('pending')));
assert.equal(group.balanceHistory['simplefin:checking'].length,2);
const rules={requirements:[
 {id:'dd',accountId:'primary',kind:'direct-deposit',text:'Employer DD'},
 {id:'new',accountId:'primary',kind:'new-money',text:'Fresh funds',amount:1000},
 {id:'purchases',accountId:'primary',kind:'transactions',text:'Two debit purchases',count:2},
 {id:'minimum',accountId:'primary',kind:'balance-hold',text:'Minimum daily balance',amount:1500,
 evidence:{quote:'Maintain a minimum daily balance of $1,500'},
 timing:{basis:'opened',value:30,unit:'calendar-days'}},
 {id:'average',accountId:'primary',kind:'balance-hold',text:'Average daily balance',amount:1500,
 evidence:{quote:'Maintain an average daily balance of $1,500'},
 timing:{basis:'opened',value:30,unit:'calendar-days'}},
 {id:'statement',accountId:'primary',kind:'balance-hold',text:'Statement ending balance',amount:1500,
 evidence:{quote:'Maintain a statement ending balance of $1,500'}}
],accounts:[{id:'primary'},{id:'secondary'}]};
const check=P.evaluate(entry,group,()=>({mode:'structured',ok:true,rules}),now);
const byId=Object.fromEntries(check.requirements.map(r=>[r.id,r]));
assert.equal(byId.dd.candidateCount,1,'employer wages must flag candidate');
assert.equal(byId.new.candidateCount,1,'internal transfer must be excluded from new money');
assert.equal(byId.purchases.candidateCount,1,'only posted debit purchases are candidates');
assert.equal(byId.minimum.balance.status,'at risk');
assert.equal(byId.average.balance.status,'on track');
assert.equal(byId.statement.balance.status,'needs review','daily observations cannot certify a statement end');
assert.equal(byId.minimum.balance.holdEnd,'2026-10-30');
assert.ok(check.requirements.every(r=>r.verifiedMet===false));
const invalid=E.summarize(unified,[{...entry,opened:'2026-10-01'}],now);
assert.equal(invalid.linkedCampaigns,0,'bank/opened/entryId must match exactly');
const source=fs.readFileSync('app.js','utf8'),evidence=fs.readFileSync('bonus-evidence.js','utf8'),
 sync=fs.readFileSync('bank-sync.js','utf8'),mobile=fs.readFileSync('mobile-ui.css','utf8');
for(const s of ['function renderTrackerEvidenceAlerts','Deposits / requirements: review pending','window.btReviewBonusCandidate','e.bonus=p.bonus'])assert.ok(source.includes(s),'Missing user-confirmed milestone safety: '+s);
assert.ok(evidence.includes('reviewPayout(group.entryId,candidate)')&&evidence.includes('endpoint(source)'), 'Payout candidate and provider-scoped review missing');
assert.ok(sync.includes('Link to '+String.fromCharCode(39))&&sync.includes('firstSeenAt'),'One-tap exact-cycle suggestion missing');
assert.ok(mobile.includes('env(safe-area-inset-bottom'),'Mobile bottom clearance missing');
console.log('Tracker automation: combined providers, linked employer, balances, external money, posted debit, confirmation, alerts and safe area passed');

assert.ok(source.includes('function btOpenTrackerEvidenceReview()')&&source.includes('bt-tracker-evidence-modal'),'Evidence review must require a Tracker-only explicit modal action');
assert.ok(evidence.includes("closest('#bt-tracker-evidence-modal, [data-synthetic-evidence-fixture]')"),'Private evidence must not mount in the Finance page automatically');
