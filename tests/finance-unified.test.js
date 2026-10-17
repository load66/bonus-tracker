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
assert.equal(summary.cashAvailable,true,'Verified SimpleFIN checking subtotal remains available despite a stale Plaid account');
assert.equal(summary.cash,'501.25','Unknown Plaid cash balance must not enter the verified subtotal');
assert.equal(summary.staleOrUnavailableCash,1,'Overview must explicitly identify unavailable linked cash balance');
assert.equal(summary.cashPartial,true,'Cash card must indicate the subtotal is incomplete');
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

assert.equal(core.detectedType({bank:'Robinhood',name:'Robinhood individual',accountSubtype:'individual'}),'brokerage');
assert.equal(core.detectedType({bank:'Fidelity',name:'Stocks and crypto',accountSubtype:'crypto'}),'brokerage');
assert.equal(core.detectedType({bank:'Schwab',name:'Main brokerage'}),'brokerage');
assert.equal(core.detectedType({bank:'Robinhood',name:'Robinhood Credit Card',accountSubtype:'credit_card'}),'credit_card');
const movementsA=structuredClone(simple),movementsB=structuredClone(plaid);
movementsA.transactions[a]={
  out:{id:'out',amount:'-1000.00',posted:now-2*86400,pending:false,category:'subscription',categorySource:'automatic',description:'Internal sweep',merchant:'Internal sweep'},
  user:{id:'user',amount:'-200.00',posted:now-250,pending:false,category:'shopping',categorySource:'user',description:'User correction'}
};
movementsB.transactions[b]={
  in:{id:'in',amount:'1000.00',posted:now-86400,pending:false,category:'income',categorySource:'automatic',description:'Received transfer'},
  other:{id:'other',amount:'200.00',posted:now-250,pending:false,category:'income',categorySource:'automatic',description:'Received payment'}
};
const rawMovement=core.combine({simplefin:movementsA,plaid:movementsB});
const reconciled=core.safeForSummary(rawMovement);
assert.equal(reconciled.transactions['simplefin:'+a].out.category,'transfer');
assert.equal(reconciled.transactions['plaid:'+b].in.category,'transfer');
assert.ok(reconciled.transactions['simplefin:'+a].out.signals.includes('matched_internal_transfer'));
assert.equal(reconciled.transactions['simplefin:'+a].user.category,'shopping','Manual categories remain authoritative');
assert.equal(rawMovement.transactions['simplefin:'+a].out.category,'subscription','Provider records are not mutated');
const totals=finance.summarize(reconciled,{now,days:30});
assert.equal(totals.expenses,'200.00','Reconciled transfers do not inflate spending');
assert.equal(totals.income,'200.00','Reconciled incoming transfers are not income');
const collision=structuredClone(movementsB);
collision.transactions[b].same={id:'same',amount:'1000.00',posted:now-86400,pending:false,category:'income',categorySource:'automatic'};
const ambig=core.safeForSummary(core.combine({simplefin:movementsA,plaid:collision}));
assert.equal(ambig.transactions['simplefin:'+a].out.category,'subscription','Ambiguous pairs are not asserted as self-transfers');

console.log('Unified Finance: provider isolation, type inference, full account/transaction aggregation, exact cents, stale-balance safety and overlap controls passed');



const nonRoundA=structuredClone(simple),nonRoundB=structuredClone(plaid);
nonRoundA.transactions[a]={debit:{id:'debit',amount:'-7379.04',posted:now-86400,pending:false,
  category:'unreviewed',categorySource:'automatic',description:'To Personal Checking'}};
nonRoundB.transactions[b]={credit:{id:'credit',amount:'7379.04',posted:now-86390,pending:false,
  category:'unreviewed',categorySource:'automatic',description:'From Personal Savings'}};
const nonRoundSafe=core.safeForSummary(core.combine({simplefin:nonRoundA,plaid:nonRoundB}));
assert.equal(nonRoundSafe.transactions['simplefin:'+a].debit.category,'transfer');
assert.equal(nonRoundSafe.transactions['plaid:'+b].credit.category,'transfer');
assert.equal(finance.summarize(nonRoundSafe,{now,days:30}).expenses,'0.00',
  'Cross-provider non-round transfers never appear in Overview expenses');
assert.equal(nonRoundA.transactions[a].debit.category,'unreviewed','Provider rows remain immutable');



// Real investment-account names: retirement must win over individual/joint.
assert.equal(core.detectedType({bank:'Robinhood',name:'Robinhood individual (6105)'}),'brokerage');
assert.equal(core.detectedType({bank:'Robinhood',name:'Robinhood Roth IRA (9372)',accountSubtype:'individual'}),'retirement');
assert.equal(core.detectedType({bank:'Robinhood',name:'Checking (2033)'}),'checking');
assert.equal(core.detectedType({bank:'Robinhood',name:'Savings (0793)'}),'savings');
assert.equal(core.detectedType({bank:'Fidelity',name:'HSA investing'}),'brokerage');
assert.equal(core.detectedType({bank:'Webull',name:'Individual'}),'brokerage');
assert.equal(core.detectedType({bank:'Coinbase',name:'Crypto'}),'brokerage');
const investedAccounts=[
  {key:'invest-1',bank:'Robinhood',name:'Robinhood individual (6105)',currency:'USD',balance:'3000.00'},
  {key:'invest-2',bank:'Robinhood',name:'Robinhood Roth IRA (9372)',currency:'USD',balance:'2000.00'}
];
const segregatedSimple=structuredClone(simple);
segregatedSimple.accounts=[{...simple.accounts[0],bank:'Robinhood',name:'Checking (2033)'},...investedAccounts];
segregatedSimple.accountProfiles={
 [a]:{kind:'checking',balanceMode:'asset'},'invest-1':{kind:'brokerage',balanceMode:'asset'},
 'invest-2':{kind:'retirement',balanceMode:'asset'}
};
segregatedSimple.transactions[a]={
 out:{id:'out',amount:'-2000.00',posted:now-100,pending:false,category:'transfer',
      categorySource:'automatic',signals:['investment_transfer'],description:'To Brokerage'},
 purchase:{id:'purchase',amount:'-11.00',posted:now-200,pending:false,category:'shopping',description:'Target'}
};
segregatedSimple.transactions['invest-1']={
 activity:{id:'activity',amount:'-750.00',posted:now-100,pending:false,category:'unreviewed',description:'Buy NVDA shares'},
 incoming:{id:'incoming',amount:'2000.00',posted:now-100,pending:false,category:'transfer',signals:['matched_internal_transfer'],description:'From Personal Checking'}
};
const segregatedSafe=core.safeForSummary(core.combine({simplefin:segregatedSimple}));
const overviewSeg=finance.summarize(segregatedSafe,{now,days:30});
assert.equal(overviewSeg.cash,'501.25','Cash total excludes 5000 in investments');
assert.equal(overviewSeg.expenses,'11.00','Investment trades and transfers excluded from expenses');
assert.equal(overviewSeg.income,'0.00','Brokerage deposits never count as income');
const invest=finance.investmentSummary(segregatedSafe,{now});
assert.equal(invest.total,'5000.00');
assert.equal(invest.brokerage,'3000.00');
assert.equal(invest.retirement,'2000.00');
assert.equal(invest.investedThisMonth,'2000.00','To Brokerage reduces cash, not spending');
const ledgerAll=core.ledgerRows([
 {account:segregatedSafe.accounts[0],accountKey:'simplefin:'+a,
  amount:'-7379.04',posted:now-100,category:'transfer',signals:['matched_internal_transfer'],id:'cashout'},
 {account:segregatedSafe.accounts[1],accountKey:'simplefin:invest-1',
  amount:'7379.04',posted:now-100,category:'transfer',signals:['matched_internal_transfer'],id:'investin'},
 {account:segregatedSafe.accounts[1],accountKey:'simplefin:invest-1',
  amount:'-40.00',posted:now-300,category:'unreviewed',description:'Buy NVDA',id:'buy'}
],{scope:'all'});
assert.equal(ledgerAll.length,2,'Unique reciprocal checking to brokerage transfer shows once');
assert.equal(ledgerAll[0].transferSides.length,2,'Tap transfer exposes both sides');
assert.equal(core.ledgerRows(ledgerAll,{scope:'cash_cards'}).length,1,'Default hides brokerage activity');
assert.equal(core.ledgerRows(ledgerAll,{scope:'investments'}).length,1,'Investments filter shows brokerage activity');
assert.equal(core.ledgerRows(ledgerAll,{scope:'all',search:'NVDA'}).length,1,'Search includes merchant description');
assert.equal(core.ledgerRows(ledgerAll,{scope:'transfers'}).length,1,'Transfer filter isolates paired transfer');
const overridden=structuredClone(segregatedSimple);
overridden.accountProfiles['invest-1']={kind:'checking',balanceMode:'asset'};
assert.equal(core.combine({simplefin:overridden}).accountProfiles['simplefin:invest-1'].kind,'checking','Manual type choice wins');
