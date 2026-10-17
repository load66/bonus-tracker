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
assert.equal(summary.netWorthAvailable,true,'the fresh included account remains usable');
assert.equal(summary.netWorthPartial,true,'missing freshness stays explicitly partial');
assert.equal(summary.netWorth,'501.25','unknown balance never enters the subtotal');
assert.equal(u.accounts[0].balance,'501.25');
const twin=structuredClone(plaid);twin.accounts[0].bank='River Bank';twin.accounts[0].name='Checking 4321';twin.accounts[0].balance='501.25';
const ambiguous=core.combine({simplefin:simple,plaid:twin});
assert.equal(ambiguous.possibleDuplicates.length,1);
assert.ok(ambiguous.accounts.every(a=>a.possibleDuplicate));
const excluded=core.safeForSummary(ambiguous);
assert.equal(excluded.accounts.length,0,'suspected same-account links must not enter consolidated totals');
assert.equal(excluded.excludedForReview,2);
assert.equal(finance.summarize(excluded,{now,days:30}).income,null);

const historyLoading=structuredClone(plaid);
historyLoading.accounts[0].historyComplete=false;
historyLoading.accounts[0].transactionSyncStatus='history_still_loading';
const partialHistory=core.safeForSummary(core.combine({simplefin:simple,plaid:historyLoading}));
assert.equal(partialHistory.historyIncomplete,true,
  'Plaid historical backfill is incomplete despite a successful last-sync timestamp');
assert.equal(partialHistory.incompleteProviders,false,
  'A successful connection timestamp is distinct from complete transaction history');
const verifiedHistory=structuredClone(historyLoading);
verifiedHistory.accounts[0].historyComplete=true;
verifiedHistory.accounts[0].transactionSyncStatus='ready';
assert.equal(core.safeForSummary(core.combine({simplefin:simple,plaid:verifiedHistory})).historyIncomplete,false,
  'Completed Plaid historical sync allows cash-flow completeness to be evaluated');
const providerError=structuredClone(plaid);
providerError.error='Synthetic transient provider failure';
assert.equal(core.safeForSummary(core.combine({simplefin:simple,plaid:providerError})).incompleteProviders,true,
  'Source errors must invalidate claimed aggregate completeness even with old success timestamps');

const malformedSimple=structuredClone(simple);
malformedSimple.warnings=['Synthetic provider row was skipped'];
malformedSimple.status='attention';
const malformedSafe=core.safeForSummary(core.combine({simplefin:malformedSimple,plaid}));
assert.equal(malformedSafe.incompleteProviders,true,
  'a successful sync with invalid or skipped rows must not certify complete data');
const malformedPlaid=structuredClone(plaid);
malformedPlaid.accounts[0].invalidTransactionRows=2;
assert.equal(core.safeForSummary(core.combine({simplefin:simple,plaid:malformedPlaid})).malformedActivity,true,
  'Plaid per-account malformed transaction counts must keep financial totals partial');

const hiddenBank=structuredClone(simple);
hiddenBank.accountProfiles[a].hidden=true;
const combinedHidden=core.combine({simplefin:hiddenBank,plaid});
const safeHidden=core.safeForSummary(combinedHidden);
assert.equal(combinedHidden.accounts.length,2,'hiding an account never removes its provider data');
assert.equal(safeHidden.accounts.length,1,'hidden accounts do not appear in Finance totals');
assert.equal(safeHidden.hiddenAccounts,1);
assert.equal(finance.summarize(safeHidden,{now,days:30}).income,'50.00',
  'transactions of hidden accounts must not enter income or spending summaries');
assert.equal(hiddenBank.transactions[a].one.amount,'400.00','account history remains recoverable');
assert.equal(simple.accounts[0].key,a,'source snapshots stay unchanged');
assert.equal(twin.accounts[0].key,b,'the second provider is never overwritten');
console.log('Unified Finance: provider isolation, type inference, full account/transaction aggregation, exact cents, stale-balance safety and overlap controls passed');
