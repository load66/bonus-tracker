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

const nonroundA=structuredClone(simple),nonroundB=structuredClone(plaid);
nonroundA.transactions[a]={
  transfer:{id:'t-7379',amount:'-7379.04',description:'To Personal Checking',
    posted:now-7200,pending:false,category:'unreviewed',categorySource:'automatic'}
};
nonroundB.transactions[b]={
  transfer:{id:'r-7379',amount:'7379.04',description:'From Personal Savings',
    posted:now-3600,pending:false,category:'income',categorySource:'automatic'}
};
const nonround=core.safeForSummary(core.combine({simplefin:nonroundA,plaid:nonroundB}));
assert.equal(nonround.transactions['simplefin:'+a].transfer.category,'transfer');
assert.equal(nonround.transactions['plaid:'+b].transfer.category,'transfer');
assert.ok(nonround.transactions['simplefin:'+a].transfer.signals.includes('matched_internal_transfer'));
assert.equal(finance.summarize(nonround,{now}).expenses,'0.00');
assert.equal(finance.summarize(nonround,{now}).income,'0.00');

const accountSamples=[
  ['Robinhood individual (6105)','investment','individual','brokerage'],
  ['Robinhood Roth IRA (9372)','investment','ira','retirement'],
  ['Robinhood Checking (2033)','investment','individual','checking'],
  ['Robinhood Savings (0793)','investment','individual','savings'],
  ['X Money Cash Management','depository','checking','checking'],
  ['Robinhood Credit Card','credit','credit_card','credit_card'],
  ['Fidelity 401(k)','investment','401k','retirement']
];
for(const [name,accountType,accountSubtype,expected] of accountSamples){
  assert.equal(core.detectedType({name,bank:'Robinhood',accountType,accountSubtype}),expected,name);
}
const cashAccount={key:'cash',name:'Checking (2033)',bank:'Robinhood',balance:'3000',currency:'USD',balanceDate:now-50,
  accountType:'depository',accountSubtype:'checking'};
const investAccount={key:'invest',name:'Robinhood individual (6105)',bank:'Robinhood',balance:'8000',currency:'USD',balanceDate:now-50,
  accountType:'investment',accountSubtype:'individual'};
const retirementAccount={key:'roth',name:'Robinhood Roth IRA (9372)',bank:'Robinhood',balance:'5000',currency:'USD',balanceDate:now-50,
  accountType:'investment',accountSubtype:'ira'};
const investmentProvider={connected:true,accounts:[cashAccount,investAccount,retirementAccount],
 monitoredAccounts:['cash','invest','roth'],lastSuccess:now,
 transactions:{cash:{out:{id:'out',description:'To Brokerage',amount:'-2000.00',
     category:'transfer',signals:['investment_transfer'],posted:now-60,pending:false}},
  invest:{buy:{id:'buy',description:'Buy NVDA',amount:'-4800.00',category:'shopping',posted:now-55,pending:false},
    in:{id:'in',description:'From Checking',amount:'2000.00',category:'transfer',posted:now-60,pending:false}},
  roth:{div:{id:'div',description:'Dividend',amount:'55.00',category:'income',posted:now-55,pending:false}}},
 balanceHistory:{cash:[{observedAt:now-100,balance:'3000',currency:'USD'}],
  invest:[{observedAt:now-86400,balance:'7900',currency:'USD'},{observedAt:now-50,balance:'8000',currency:'USD'}],
  roth:[{observedAt:now-86400,balance:'4990',currency:'USD'},{observedAt:now-50,balance:'5000',currency:'USD'}]}
};
const investCombined=core.combine({simplefin:investmentProvider});
const investmentSafe=core.safeForSummary(investCombined);
const overviewInvest=finance.summarize(investmentSafe,{now});
assert.equal(overviewInvest.cash,'3000.00','Cash excludes $13,000 brokerage and retirement assets');
assert.equal(overviewInvest.investments,'13000.00');
assert.equal(overviewInvest.brokerageTotal,'8000.00');
assert.equal(overviewInvest.retirementTotal,'5000.00');
assert.equal(overviewInvest.investmentChangeSinceSync,'110.00');
assert.equal(overviewInvest.investedThisMonth,'2000.00');
assert.equal(overviewInvest.income,'0.00','Investment dividends must not become household income');
assert.equal(overviewInvest.expenses,'0.00','Investment stock purchases must not become household spending');
assert.equal(overviewInvest.investmentIncome,'55.00');
const investAll=Object.entries(investmentSafe.transactions).flatMap(([accountKey,txs])=>
 Object.values(txs).map(row=>({...row,accountKey,
   account:investCombined.accounts.find(a=>a.key===accountKey),
   accountKind:investmentSafe.accountProfiles[accountKey].kind})));
const everyday=core.transactionFeed(investAll);
assert.ok(everyday.every(r=>['checking','savings','credit_card'].includes(r.accountKind)),'Default excludes brokerage trade rows');
assert.equal(everyday.length,1,'Checking-to-brokerage transfer is shown once');
assert.ok(everyday[0].pairedWith,'Matched transfer displays both linked sides');
const onlyInvestment=core.transactionFeed(investAll,'investments');
assert.ok(onlyInvestment.some(r=>r.description==='Buy NVDA'),'Investment filter exposes brokerage purchases');
assert.ok(onlyInvestment.some(r=>r.description==='Dividend'),'Investment filter exposes dividends');
assert.equal(core.investmentActivity(onlyInvestment.find(r=>r.description==='Buy NVDA')),'Buy');
assert.equal(core.investmentActivity(onlyInvestment.find(r=>r.description==='Dividend')),'Dividend');
assert.equal(core.transactionFeed(investAll,'transfers').length,1,'Matched transfer is not duplicated');
const manuallyTyped=structuredClone(investmentProvider);
manuallyTyped.accountProfiles={invest:{kind:'checking',balanceMode:'asset',includeSpending:true}};
const manual=core.combine({simplefin:manuallyTyped});
assert.equal(manual.accounts.find(a=>a.rawKey==='invest').kind,'checking','Manual account type must win over detected broker metadata');
