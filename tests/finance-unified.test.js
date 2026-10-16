'use strict';
const assert=require('node:assert/strict');
const core=require('../finance-unified-core.js'),finance=require('../finance-overview-core.js');
const now=Math.floor(Date.now()/1000);
const a='a'.repeat(64),b='b'.repeat(64);
const simple={connected:true,accounts:[{key:a,bank:'River Bank',name:'Checking 4321',currency:'USD',
  balance:'501.25',balanceDate:now-100}],monitoredAccounts:[a],
  accountProfiles:{[a]:{kind:'checking',balanceMode:'asset'}},
  lastSuccess:now-90,transactions:{[a]:{one:{id:'txn-a',amount:'400.00',
    posted:now-400,pending:false,category:'income',categorySource:'user'}}}};
const plaid={connected:true,accounts:[{key:b,bank:'X Money',name:'X Money Checking',currency:'USD',
  balance:'200.99',balanceDate:null,accountType:'depository',accountSubtype:'checking'}],
  monitoredAccounts:[b],accountProfiles:{[b]:{kind:'checking',balanceMode:'asset'}},
  lastSuccess:now-70,transactions:{[b]:{two:{id:'txn-b',amount:'50.00',
    posted:now-300,pending:false,category:'income',categorySource:'user'}}}};
const u=core.combine({simplefin:simple,plaid});
assert.equal(u.accounts.length,2,'both source accounts appear on one dashboard');
assert.equal(u.sourceCount,2);
assert.equal(u.accounts[0].source,'simplefin');assert.equal(u.accounts[1].source,'plaid');
assert.equal(u.accounts[1].detectedType,'checking');
assert.equal(u.accounts[0].rawKey,a);assert.equal(u.accounts[1].rawKey,b);
assert.equal(u.transactions['plaid:'+b].two.id,'txn-b');
assert.equal(u.transactions['simplefin:'+a].one.id,'txn-a');
assert.deepEqual(u.monitoredAccounts,['simplefin:'+a,'plaid:'+b]);
assert.equal(u.lastSuccess,now-70,'latest successful provider sync remains visible');
const delayed=structuredClone(plaid);delayed.lastSuccess=null;
const partial=core.combine({simplefin:simple,plaid:delayed});
assert.equal(partial.lastSuccess,now-90,'one delayed provider must not erase known financial activity');
assert.equal(core.safeForSummary(partial).incompleteProviders,true);
assert.equal(core.detectedType({name:'Everyday Savings'}),'savings');
assert.equal(core.detectedType({name:'Main checking'}),'checking');
assert.equal(core.detectedType({name:'Account 001'}),'unclassified');
const safe=core.safeForSummary(u),summary=finance.summarize(safe,{now,days:30});
assert.equal(summary.income,'450.00','exact-cents reporting includes unique transactions from both providers');
assert.equal(summary.cashAvailable,false,'Plaid has no provider-verified balance timestamp');
assert.equal(summary.netWorthAvailable,false,'unknown balance freshness must not fabricate net worth');
assert.equal(u.accounts[0].balance,'501.25');
const twin=structuredClone(plaid);twin.accounts[0].bank='River Bank';twin.accounts[0].name='Checking 4321';twin.accounts[0].balance='501.25';
const ambiguous=core.combine({simplefin:simple,plaid:twin});
assert.equal(ambiguous.possibleDuplicates.length,1);
assert.ok(ambiguous.accounts.every(a=>a.possibleDuplicate));
const excluded=core.safeForSummary(ambiguous);
assert.equal(excluded.accounts.length,0,'suspected same-account links must not enter consolidated totals');
assert.equal(excluded.excludedForReview,2);
assert.equal(finance.summarize(excluded,{now,days:30}).income,null);
assert.equal(simple.accounts[0].key,a,'source snapshots stay unchanged');
assert.equal(twin.accounts[0].key,b,'the second provider is never overwritten');

// Phase 1: inferred account types drive defaults only when no override exists.
const implied=core.combine({simplefin:{...simple,accountProfiles:{}},
  plaid:{...plaid,accountProfiles:{}}});
assert.equal(implied.accountProfiles['simplefin:'+a].balanceMode,'asset');
assert.equal(implied.accountProfiles['plaid:'+b].balanceMode,'asset');
assert.equal(core.defaultBalanceMode('credit_card'),'liability');
assert.equal(core.defaultBalanceMode('mortgage'),'liability');
assert.equal(core.defaultBalanceMode('retirement'),'asset');
assert.equal(core.defaultBalanceMode('unclassified'),'exclude');
const explicitlyExcluded=core.combine({simplefin:{...simple,
  accountProfiles:{[a]:{kind:'checking',balanceMode:'exclude'}}}});
assert.equal(explicitlyExcluded.accountProfiles['simplefin:'+a].balanceMode,'exclude',
  'user exclusion must never be overridden by inferred defaults');

const outgoing={...simple,transactions:{[a]:{
  sent:{id:'sent',amount:'-35.01',posted:now-200,
    description:'Credit card payment to bank',category:'transfer',
    categorySource:'automatic',signals:['possible_transfer']},
  unmatched:{id:'unmatched',amount:'-12.00',posted:now-500,
    description:'Transfer to another bank',category:'transfer',
    categorySource:'automatic',signals:['possible_transfer']}
}}};
const incoming={...plaid,transactions:{[b]:{
  received:{id:'received',amount:'35.01',posted:now-180,
    description:'Payment thank you',category:'unreviewed',
    categorySource:'automatic',signals:['possible_transfer']}
}}};
const paired=core.safeForSummary(core.combine({simplefin:outgoing,plaid:incoming}));
assert.equal(paired.transactions['simplefin:'+a].sent.category,'transfer');
assert.equal(paired.transactions['plaid:'+b].received.category,'transfer');
assert.ok(paired.transactions['plaid:'+b].received.signals.includes('matched_internal_transfer'));
assert.equal(paired.transactions['simplefin:'+a].unmatched.category,'unreviewed',
  'wording alone cannot verify an unpaired transfer');
assert.equal(incoming.transactions[b].received.category,'unreviewed',
  'source transactions are never silently rewritten');
assert.equal(finance.summarize(paired,{now,days:30}).transfers,2,
  'both confirmed sides are excluded from income and spending');

const userOverride=JSON.parse(JSON.stringify(incoming));
userOverride.transactions[b].received.categorySource='user';
userOverride.transactions[b].received.category='income';
const blocked=core.safeForSummary(core.combine({simplefin:outgoing,plaid:userOverride}));
assert.equal(blocked.transactions['plaid:'+b].received.category,'income',
  'transfer pairing must never override owner-confirmed categories');
assert.equal(blocked.transactions['simplefin:'+a].sent.category,'unreviewed',
  'unpaired automatic outgoing transfer requires review');

const ambiguousIncoming=JSON.parse(JSON.stringify(incoming));
ambiguousIncoming.transactions[b].second={...ambiguousIncoming.transactions[b].received,
  id:'second',posted:now-150};
const ambiguousTransfers=core.safeForSummary(core.combine({
  simplefin:outgoing,plaid:ambiguousIncoming
}));
assert.equal(ambiguousTransfers.transactions['simplefin:'+a].sent.category,'unreviewed',
  'ambiguous reciprocal movements must not be paired automatically');


// Matching amounts alone must not disguise unrelated payroll or FX movements.
const foreignCurrency=JSON.parse(JSON.stringify(incoming));
foreignCurrency.accounts[0].currency='EUR';
const fxSafe=core.safeForSummary(core.combine({simplefin:outgoing,plaid:foreignCurrency}));
assert.equal(fxSafe.transactions['plaid:'+b].received.category,'unreviewed',
  'different-currency movements must never be paired without FX reconciliation');
const unrelatedIncome=JSON.parse(JSON.stringify(incoming));
unrelatedIncome.transactions[b].received.description='Employer payroll';
unrelatedIncome.transactions[b].received.signals=[];
unrelatedIncome.transactions[b].received.category='income';
const unrelatedSafe=core.safeForSummary(core.combine({simplefin:outgoing,plaid:unrelatedIncome}));
assert.equal(unrelatedSafe.transactions['plaid:'+b].received.category,'income',
  'an unrelated payroll deposit cannot be treated as a credit-card payment merely because amounts match');
assert.equal(unrelatedSafe.transactions['simplefin:'+a].sent.category,'unreviewed',
  'unpaired automatic transfer requires review');
const payrollCoincidence={...plaid,transactions:{[b]:{
  salary:{id:'salary',amount:'35.01',posted:now-195,description:'Employer payroll deposit',
    category:'income',categorySource:'automatic',signals:['possible_direct_deposit']}
}}};
const protectedIncome=core.safeForSummary(core.combine({simplefin:outgoing,plaid:payrollCoincidence}));
assert.equal(protectedIncome.transactions['plaid:'+b].salary.category,'income',
  'a coincidental equal payroll amount must never be paired as a card payment');
assert.equal(protectedIncome.transactions['simplefin:'+a].sent.category,'unreviewed');
assert.equal(finance.summarize(protectedIncome,{now,days:30}).income,'35.01');

console.log('Unified Finance: provider isolation, type inference, full account/transaction aggregation, exact cents, stale-balance safety and overlap controls passed');
