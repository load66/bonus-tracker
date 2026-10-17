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

const disabledCard=structuredClone(plaid);
disabledCard.accounts[0]={...disabledCard.accounts[0],name:'Robinhood Credit Card 4010',
  balance:'-283.27',accountType:'credit',accountSubtype:'credit_card',balanceDate:now-100};
disabledCard.accountProfiles[b]={kind:'credit_card',balanceMode:'liability',syncEnabled:false};
disabledCard.transactions[b]={cardIncome:{id:'cardIncome',amount:'900.00',posted:now-300,
  pending:false,category:'income',merchant:'Synthetic card credit',categorySource:'automatic'}};
const disabledUnified=core.combine({simplefin:simple,plaid:disabledCard});
assert.equal(disabledUnified.accounts.length,2,'Disabled account retained in directory for reactivation');
assert.equal(disabledUnified.accountProfiles['plaid:'+b].syncEnabled,false);
const disabledSafe=core.safeForSummary(disabledUnified);
assert.equal(disabledSafe.accounts.length,1,'Sync-off credit card excluded from every summary');
assert.equal(disabledSafe.transactions['plaid:'+b],undefined,'Sync-off transactions not used in recurring/spending');
assert.equal(disabledSafe.notSyncingAccounts,1);
const disabledSummary=finance.summarize(disabledSafe,{now,days:30});
assert.equal(disabledSummary.creditCards,'0.00','Credit-card balance must not leak into displayed totals');
assert.equal(disabledSummary.netWorth,'501.25','Sync-off card credit cannot increase net worth');
assert.equal(disabledSummary.income,'400.00','Sync-off transaction credits cannot count as income');
assert.equal(plaid.accountProfiles[b].syncEnabled,undefined,'Provider source was not modified');
const resumedCard=structuredClone(disabledCard);
resumedCard.accountProfiles[b].syncEnabled=true;
const resumedSafe=core.safeForSummary(core.combine({simplefin:simple,plaid:resumedCard}));
assert.equal(resumedSafe.accounts.length,2,'Reenabling Sync restores account to Finance');
assert.equal(finance.summarize(resumedSafe,{now,days:30}).income,'1300.00','Reenabled activity restored without losing saved history');
assert.equal(finance.summarize(resumedSafe,{now,days:30}).netWorth,'784.52','Credit balance restored to net worth');
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

const paymentFromBank=structuredClone(simple),paymentOnCard=structuredClone(plaid);
paymentFromBank.transactions[a]={debit:{id:'debit',amount:'-1000.00',posted:now-3600,pending:false,
  category:'unreviewed',categorySource:'automatic',description:'Account debit',merchant:'Account debit'}};
paymentOnCard.accounts[0]={...paymentOnCard.accounts[0],name:'Credit Card ending 4010',accountType:'credit',accountSubtype:'credit_card'};
paymentOnCard.accountProfiles[b]={kind:'credit_card',balanceMode:'liability'};
paymentOnCard.transactions[b]={payment:{id:'payment',amount:'1000.00',posted:now-1800,pending:false,
  category:'income',categorySource:'automatic',description:'Payment',merchant:'Payment'}};
const pairedPayment=core.safeForSummary(core.combine({simplefin:paymentFromBank,plaid:paymentOnCard}));
const paymentDebit=pairedPayment.transactions['simplefin:'+a].debit;
const paymentCredit=pairedPayment.transactions['plaid:'+b].payment;
assert.equal(paymentDebit.category,'transfer','Outgoing $1,000 is a transfer, not spending');
assert.equal(paymentCredit.category,'transfer','Incoming Payment +$1,000 is not Income');
assert.equal(paymentDebit.transferPairId,paymentCredit.transferPairId,'Unique cross-bank Payment legs form one pair');
assert.equal(finance.summarize(pairedPayment,{now,days:30}).income,'0.00','Payment transfers never inflate income');
assert.equal(finance.summarize(pairedPayment,{now,days:30}).expenses,'0.00','Payment transfers never inflate spending');
assert.equal(paymentOnCard.transactions[b].payment.category,'income','Pairing cannot mutate provider history');
const payrollFromBank=structuredClone(simple),schreiberIncome=structuredClone(plaid);
payrollFromBank.transactions[a]={debit:{id:'debit',amount:'-1000.00',posted:now-3600,pending:false,
  category:'transfer',categorySource:'automatic',description:'Internal transfer'}};
schreiberIncome.transactions[b]={salary:{id:'salary',amount:'1000.00',posted:now-1800,pending:false,
  category:'income',categorySource:'automatic',description:'SCHREIBER FOODS PAYROLL',
  merchant:'Schreiber Foods',signals:['possible_direct_deposit']}};
const preservedPayroll=core.safeForSummary(core.combine({simplefin:payrollFromBank,plaid:schreiberIncome}));
assert.equal(preservedPayroll.transactions['plaid:'+b].salary.category,'income','Schreiber payroll stays Income, even at the same amount as another transfer');
assert.equal(preservedPayroll.transactions['plaid:'+b].salary.transferPairId,undefined,'A matching amount alone cannot absorb payroll');
assert.equal(finance.summarize(preservedPayroll,{now,days:30}).income,'1000.00','Schreiber pay contributes to income');
const twoPayments=structuredClone(paymentOnCard);
twoPayments.transactions[b].another={...twoPayments.transactions[b].payment,id:'another'};
const ambiguousPayment=core.safeForSummary(core.combine({simplefin:paymentFromBank,plaid:twoPayments}));
assert.equal(ambiguousPayment.transactions['plaid:'+b].payment.transferPairId,undefined,'Ambiguous equal payment credits remain unpaired');
assert.equal(ambiguousPayment.transactions['simplefin:'+a].debit.transferPairId,undefined,'Ambiguous equal payment debits remain unpaired');

console.log('Unified Finance: provider isolation, type inference, full account/transaction aggregation, exact cents, stale-balance safety and overlap controls passed');

const brokerNames=[
  {bank:'Robinhood',name:'Robinhood individual (6105)',accountSubtype:'individual',expected:'brokerage'},
  {bank:'Robinhood',name:'Robinhood Roth IRA (9372)',accountSubtype:'individual',expected:'retirement'},
  {bank:'Robinhood',name:'Checking (2033)',accountSubtype:'individual',expected:'checking'},
  {bank:'Robinhood',name:'Savings (0793)',accountSubtype:'individual',expected:'savings'},
  {bank:'Coinbase',name:'Digital assets',accountType:'investment',expected:'brokerage'},
  {bank:'Schwab',name:'Schwab Cash Management',accountType:'investment',expected:'checking'},
];
for(const entry of brokerNames)assert.equal(core.detectedType(entry),entry.expected,entry.name);
const investSimple=structuredClone(simple),investPlaid=structuredClone(plaid);
investSimple.accounts[0].balance='1200.00';
investSimple.accounts[0].name='Checking (2033)';
investSimple.transactions[a]={
  move:{id:'move',amount:'-7379.04',posted:now-3600,category:'unreviewed',
    categorySource:'automatic',description:'To Personal Checking',pending:false},
  fund:{id:'fund',amount:'-2000.00',posted:now-1200,category:'unreviewed',
    categorySource:'automatic',description:'To Brokerage',pending:false}
};
investPlaid.accounts[0]={...investPlaid.accounts[0],bank:'Robinhood',name:'Robinhood individual (6105)',
  accountSubtype:'individual',accountType:'investment',balance:'15000.00',balanceDate:now-90};
investPlaid.accountProfiles={};
investPlaid.transactions[b]={
  paired:{id:'paired',amount:'7379.04',posted:now-1000,category:'income',
    categorySource:'automatic',description:'From Personal Savings',pending:false},
  incoming:{id:'incoming',amount:'2000.00',posted:now-150,category:'income',
    categorySource:'automatic',description:'From Personal Checking',pending:false},
  dividend:{id:'dividend',amount:'3.50',posted:now-140,category:'income',
    categorySource:'automatic',description:'Dividend paid',pending:false},
  bought:{id:'bought',amount:'-500.00',posted:now-130,category:'shopping',
    categorySource:'automatic',description:'Bought NVDA shares',pending:false}
};
const investmentState=core.safeForSummary(core.combine({simplefin:investSimple,plaid:investPlaid}));
const positions=investmentState.accounts.find(x=>x.name.includes('individual'));
assert.equal(positions.kind,'brokerage');
assert.equal(investmentState.accountProfiles[positions.key].includeSpending,false);
const pairedDebit=investmentState.transactions['simplefin:'+a].move;
const pairedCredit=investmentState.transactions['plaid:'+b].paired;
assert.equal(pairedDebit.category,'transfer');
assert.equal(pairedCredit.category,'transfer');
assert.equal(pairedDebit.transferPairId,pairedCredit.transferPairId,'Non-round same-amount transfers across providers collapse into one pair');
const contributed=investmentState.transactions['simplefin:'+a].fund;
assert.ok(contributed.signals.includes('investment_transfer'));
assert.equal(contributed.category,'transfer');
const investments=finance.summarize(investmentState,{now,days:30});
assert.equal(investments.cash,'1200.00','Cash excludes Robinhood individual account');
assert.equal(investments.investments,'15000.00','Investment value separated from cash');
assert.equal(investments.investmentBrokerage,'15000.00');
assert.equal(investments.investmentRetirement,'0.00');
assert.equal(investments.investmentIncome,'3.50');
assert.equal(investments.investedThisMonth,'9379.04','Both distinct cash-to-brokerage transfer pairs are verified; trades and dividends do not count as contributions');
assert.equal(investments.expenses,'0.00','Trades in brokerage and checking transfers are not expenses');
assert.equal(investments.income,'0.00','Brokerage dividends and transfers are not household income');
const manualInvest=structuredClone(investPlaid);manualInvest.accountProfiles={
  [b]:{kind:'checking',balanceMode:'asset',includeSpending:true}
};
assert.equal(core.combine({simplefin:investSimple,plaid:manualInvest}).accounts.find(x=>x.rawKey===b).kind,'checking','Manual account choice always wins');


const wallet=structuredClone(plaid);
wallet.accounts=[{...wallet.accounts[0],bank:'PayPal',name:'PayPal balance',balance:'500.00',
  accountType:'depository',accountSubtype:'',balanceDate:now-75}];
wallet.transactions={[b]:{}};
wallet.accountProfiles={[b]:{kind:'unclassified',balanceMode:'exclude'}};
const walletView=core.combine({simplefin:simple,plaid:wallet});
assert.equal(walletView.accounts.find(x=>x.source==='plaid').kind,'checking');
assert.equal(walletView.accountProfiles['plaid:'+b].balanceMode,'asset','Legacy automatic wallet exclusion is restored');
const walletCash=finance.summarize(core.safeForSummary(walletView),{now});
assert.equal(walletCash.cash,'1001.25','Spendable wallet is included in Cash');
assert.equal(walletCash.netWorth,'1001.25','Wallet balance participates in Net worth');
const walletManual=structuredClone(wallet);
walletManual.accountProfiles[b]={kind:'checking',balanceMode:'exclude'};
const walletManualView=core.combine({simplefin:simple,plaid:walletManual});
assert.equal(walletManualView.accountProfiles['plaid:'+b].balanceMode,'exclude','Manual wallet exclusion stays excluded');
const brokerageLegacy=structuredClone(investPlaid);
brokerageLegacy.accountProfiles={[b]:{kind:'unclassified',balanceMode:'exclude'}};
const legacyView=core.combine({simplefin:investSimple,plaid:brokerageLegacy});
assert.equal(legacyView.accountProfiles['plaid:'+b].balanceMode,'asset','Auto-excluded investment returns to Net worth');
const manualBroker=structuredClone(investPlaid);
manualBroker.accountProfiles={[b]:{kind:'brokerage',balanceMode:'exclude'}};
const manualView=core.combine({simplefin:investSimple,plaid:manualBroker});
assert.equal(manualView.accountProfiles['plaid:'+b].balanceMode,'exclude','Explicit brokerage exclusion remains authoritative');
const legacyWorth=finance.summarize(core.safeForSummary(legacyView),{now});
const manualWorth=finance.summarize(core.safeForSummary(manualView),{now});
assert.equal(legacyWorth.netWorth,'16200.00','Cash plus investments determine total Net worth when included');
assert.equal(manualWorth.netWorth,'1200.00','Legacy wallet/investment exclusions change totals only when genuinely automatic');
