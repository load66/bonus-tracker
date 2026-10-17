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
  in:{id:'in',amount:'1000.00',posted:now-86400,pending:false,category:'income',categorySource:'automatic',description:'Payment',merchant:'Payment'},
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

const syncOffCard=structuredClone(simple);
syncOffCard.accounts[0]={...syncOffCard.accounts[0],bank:'Robinhood',name:'Robinhood Credit Card',accountType:'credit',
  accountSubtype:'credit_card',balance:'-283.27',balanceDate:now-30};
syncOffCard.accountProfiles[a]={kind:'credit_card',balanceMode:'liability',syncEnabled:false};
syncOffCard.transactions[a].one.amount='500.00';
const otherCard=structuredClone(plaid);
otherCard.accounts[0]={...otherCard.accounts[0],bank:'PayPal',name:'PayPal Mastercard',accountType:'credit',
  accountSubtype:'credit_card',balance:'63.87',balanceDate:now-30};
otherCard.accountProfiles[b]={kind:'credit_card',balanceMode:'liability',syncEnabled:true};
const disabledCombined=core.combine({simplefin:syncOffCard,plaid:otherCard});
const disabledView=core.safeForSummary(disabledCombined);
assert.equal(disabledCombined.accounts.length,2,'Sync off preserves editable account evidence');
assert.equal(disabledView.accounts.length,1,'Sync-off credit card does not appear in Finance summaries');
assert.equal(disabledView.notSyncingAccounts,1);
assert.equal(disabledView.transactions['simplefin:'+a],undefined,'Disabled card history must not flow into spending/recurring');
assert.equal(finance.summarize(disabledView,{now,days:30}).netWorth,'-63.87','Credit-card exclusion changes net worth');
const rediscovered=structuredClone(syncOffCard);
rediscovered.accounts.push({key:'z'.repeat(64),name:'New checking',bank:'Robinhood',
  currency:'USD',balance:'25.00',balanceDate:now-30});
assert.equal(core.safeForSummary(core.combine({simplefin:rediscovered,plaid:otherCard})).accounts.some(entry=>entry.key==='simplefin:'+a),false,
  'Discovery must not reactivate a disabled account');
rediscovered.accountProfiles[a].syncEnabled=true;
const restored=core.safeForSummary(core.combine({simplefin:rediscovered,plaid:otherCard}));
assert.equal(restored.accounts.some(entry=>entry.key==='simplefin:'+a),true,'Sync back on restores saved card');
assert.ok(restored.transactions['simplefin:'+a].one,'Prior transaction history remains intact');

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


// Cross-provider $1,000: the Plaid credit arrives before SimpleFIN's debit.
// Every safeForSummary projection must automatically rebuild the reciprocal pair.
const crossSimple=structuredClone(simple),crossPlaid=structuredClone(plaid);
crossSimple.accounts[0].bank='Robinhood';crossSimple.accounts[0].name='Robinhood Checking ··2033';
crossPlaid.accounts[0].bank='X money';crossPlaid.accounts[0].name='X money Checking';
crossPlaid.transactions[b]={payment:{id:'payment',amount:'1000.00',posted:now-900,
  pending:false,category:'income',categorySource:'automatic',merchant:'Payment',
  description:'Payment',signals:[]}};
crossSimple.transactions[a]={};
const firstArrival=core.safeForSummary(core.combine({simplefin:crossSimple,plaid:crossPlaid}));
assert.equal(firstArrival.transactions['plaid:'+b].payment.category,'unreviewed',
  'A generic X money Payment is provisional, never household income');
assert.ok(firstArrival.transactions['plaid:'+b].payment.signals.includes('possible_transfer'));
assert.equal(firstArrival.transactions['plaid:'+b].payment.transferPairId,undefined);
assert.equal(finance.summarize(firstArrival,{now,days:30}).income,'0.00',
  'Provisional Payment cannot inflate Income while SimpleFIN catches up');
crossSimple.transactions[a].debit={id:'robinhood-debit',amount:'-1000.00',posted:now-86400,
  pending:false,category:'unreviewed',categorySource:'automatic',
  merchant:'Outgoing ACH',description:'Outgoing ACH',signals:[]};
const afterLateArrival=core.safeForSummary(core.combine({simplefin:crossSimple,plaid:crossPlaid}));
const crossDebit=afterLateArrival.transactions['simplefin:'+a].debit;
const crossCredit=afterLateArrival.transactions['plaid:'+b].payment;
assert.equal(crossDebit.category,'transfer');
assert.equal(crossCredit.category,'transfer');
assert.equal(crossDebit.transferPairId,crossCredit.transferPairId,
  'Opposite provider legs uniquely matched despite arriving a day apart');
assert.equal(crossDebit.transferOtherAccountKey,'plaid:'+b);
assert.equal(crossCredit.transferOtherAccountKey,'simplefin:'+a);
assert.ok(crossDebit.signals.includes('matched_internal_transfer'));
assert.ok(crossCredit.signals.includes('matched_internal_transfer'));
assert.equal(finance.summarize(afterLateArrival,{now,days:30}).income,'0.00');
assert.equal(finance.summarize(afterLateArrival,{now,days:30}).expenses,'0.00');
assert.equal(crossPlaid.transactions[b].payment.category,'income',
  'Original provider activity must remain immutable');
const competing=structuredClone(crossSimple);
competing.transactions[a].second={...competing.transactions[a].debit,id:'second',posted:now-83000};
const ambiguousCross=core.safeForSummary(core.combine({simplefin:competing,plaid:crossPlaid}));
assert.equal(ambiguousCross.transactions['plaid:'+b].payment.transferPairId,undefined,
  'Two matching outflows must not produce an automatic match');
assert.equal(ambiguousCross.transactions['plaid:'+b].payment.category,'unreviewed');
const manuallyReviewed=structuredClone(crossPlaid);
manuallyReviewed.transactions[b].payment.categorySource='user';
manuallyReviewed.transactions[b].payment.category='income';
const protectedCross=core.safeForSummary(core.combine({simplefin:crossSimple,plaid:manuallyReviewed}));
assert.equal(protectedCross.transactions['plaid:'+b].payment.category,'income',
  'Never overwrite a manual Income review, even with a matching debit');
assert.equal(protectedCross.transactions['plaid:'+b].payment.transferPairId,undefined);
const ruleReviewed=structuredClone(crossPlaid);
ruleReviewed.transactions[b].payment.categorySource='user_rule';
ruleReviewed.transactions[b].payment.category='transfer';
const protectedRule=core.safeForSummary(core.combine({simplefin:crossSimple,plaid:ruleReviewed}));
assert.equal(protectedRule.transactions['plaid:'+b].payment.category,'transfer');
assert.equal(protectedRule.transactions['plaid:'+b].payment.transferPairId,undefined,
  'Saved account rule must not be rewritten by an automatic pair');
const payrollGuard=structuredClone(crossPlaid);
payrollGuard.transactions[b].payment.description='Schreiber Foods Payroll';
payrollGuard.transactions[b].payment.merchant='Schreiber Foods';
payrollGuard.transactions[b].payment.signals=['possible_direct_deposit'];
const salary=core.safeForSummary(core.combine({simplefin:crossSimple,plaid:payrollGuard}));
assert.equal(salary.transactions['plaid:'+b].payment.category,'income',
  'Schreiber payroll is not a self-transfer on an equal-amount day');
assert.equal(salary.transactions['plaid:'+b].payment.transferPairId,undefined);

// Equal-value spending and an unrelated wallet Payment are not reciprocal transfers.
const unrelatedSpend=structuredClone(crossSimple);
unrelatedSpend.transactions[a].debit={...unrelatedSpend.transactions[a].debit,
  category:'groceries',merchant:'Synthetic Grocery Store',description:'Synthetic Grocery Store'};
const unrelatedResult=core.safeForSummary(core.combine({simplefin:unrelatedSpend,plaid:crossPlaid}));
assert.equal(unrelatedResult.transactions['simplefin:'+a].debit.category,'groceries');
assert.equal(unrelatedResult.transactions['plaid:'+b].payment.category,'unreviewed');
assert.equal(unrelatedResult.transactions['plaid:'+b].payment.transferPairId,undefined,
  'A grocery purchase cannot be erased by an equal-value deposit in another account');
assert.equal(finance.summarize(unrelatedResult,{now,days:30}).expenses,'1000.00');
const unrelatedIncome=structuredClone(crossPlaid);
unrelatedIncome.transactions[b].payment={...unrelatedIncome.transactions[b].payment,
  category:'income',merchant:'Dividend income',description:'Dividend income'};
const nonTransferIncome=core.safeForSummary(core.combine({simplefin:crossSimple,plaid:unrelatedIncome}));
assert.equal(nonTransferIncome.transactions['plaid:'+b].payment.category,'income');
assert.equal(nonTransferIncome.transactions['plaid:'+b].payment.transferPairId,undefined,
  'Ordinary non-payroll income is not erased solely because another account has an equal debit');

// A generic SimpleFIN loan subtype must not conceal an explicit mortgage product.
const mortgageSimple=structuredClone(simple);
mortgageSimple.accounts[0]={...mortgageSimple.accounts[0],bank:'Synthetic Mortgage Servicer',
  name:'30-year Home Mortgage',accountType:'loan',accountSubtype:'loan',
  balance:'-182345.67',balanceDate:now-200};
mortgageSimple.accountProfiles={};
mortgageSimple.transactions[a]={};
const mortgageCombined=core.combine({simplefin:mortgageSimple});
const connectedMortgage=mortgageCombined.accounts[0];
assert.equal(connectedMortgage.kind,'mortgage');
assert.equal(mortgageCombined.accountProfiles[connectedMortgage.key].balanceMode,'liability');
assert.equal(mortgageCombined.accountProfiles[connectedMortgage.key].includeSpending,false);
const mortgageTotal=finance.summarize(core.safeForSummary(mortgageCombined),{now});
assert.equal(mortgageTotal.liabilities,'182345.67');
assert.equal(mortgageTotal.netWorth,'-182345.67');
assert.equal(core.detectedType({name:'Home Loan',accountType:'loan',accountSubtype:'loan'}),'mortgage');
assert.equal(core.detectedType({name:'Personal installment loan',accountSubtype:'loan'}),'loan');
const mortgageOverride=structuredClone(mortgageSimple);
mortgageOverride.accountProfiles={[a]:{kind:'loan',balanceMode:'exclude',includeSpending:false}};
const overriddenMortgage=core.combine({simplefin:mortgageOverride});
assert.equal(overriddenMortgage.accounts[0].kind,'loan','Saved account-type correction must win');
assert.equal(overriddenMortgage.accountProfiles['simplefin:'+a].balanceMode,'exclude',
  'Explicit net-worth exclusion is preserved');


// Mortgage names are often just the servicer with no product subtype.
for(const mortgageName of ['Mr. Cooper ··1234','LoanCare','Newrez-Shellpoint','Pennymac',
  'Cenlar','Nationstar','Lakeview Loan','RoundPoint','SPS Servicing','Home MTG 1234','HELOC']){
  assert.equal(core.detectedType({name:mortgageName,accountType:'',accountSubtype:''}),
    'mortgage',mortgageName+' must not disappear into unclassified');
}
// Plaid and SimpleFIN mortgage conventions must never create positive assets
// from ordinary outstanding debt, even when source signs differ.
const plaidLoan=structuredClone(plaid);
plaidLoan.accounts[0]={...plaidLoan.accounts[0],bank:'Synthetic Servicer',
  name:'30-year mortgage',balance:'250000.00',balanceDate:now-100,accountType:'loan',accountSubtype:'mortgage'};
plaidLoan.accountProfiles={};
const plaidLoanSummary=finance.summarize(core.safeForSummary(core.combine({plaid:plaidLoan})),{now});
assert.equal(plaidLoanSummary.liabilities,'250000.00');
assert.equal(plaidLoanSummary.netWorth,'-250000.00');


// Product-aware classification regression: investment/retirement evidence
// outranks generic "savings", even when providers omit or mislabel subtypes.
const classificationCases=[
  {account:{name:'Example Employer 401(k) Retirement Savings Plan',bank:'Example Plan Administrator',
    accountType:'depository',accountSubtype:'savings'},expected:'retirement'},
  {account:{name:'Account',bank:'Example Plan Provider',
    accountType:'investment',accountSubtype:'401(k)'},expected:'retirement'},
  {account:{name:'Plan 2',bank:'Example Plan Provider',
    accountType:'investment',accountSubtype:'403(b)'},expected:'retirement'},
  {account:{name:'Plan 3',bank:'Example Plan Provider',
    accountType:'investment',accountSubtype:'retirement plan'},expected:'retirement'},
  {account:{name:'Example Employer 403(b) Savings Plan',bank:'Example Financial',
    accountType:'investment',accountSubtype:'individual'},expected:'retirement'},
  {account:{name:'457(b) Deferred Compensation Plan',bank:'Example Custodian',
    accountType:'investment',accountSubtype:''},expected:'retirement'},
  {account:{name:'Roth IRA Savings',bank:'Example Financial',
    accountType:'depository',accountSubtype:'savings'},expected:'retirement'},
  {account:{name:'Traditional IRA',bank:'Example Custodian',
    accountType:'investment',accountSubtype:'individual'},expected:'retirement'},
  {account:{name:'Employee Savings Plan',bank:'Example Custodian',
    accountType:'investment',accountSubtype:'individual'},expected:'brokerage'},
  {account:{name:'Individual brokerage cash',bank:'Example Brokerage',
    accountType:'investment',accountSubtype:'individual'},expected:'brokerage'},
  {account:{name:'Trading Portfolio',bank:'Example Custodian',
    accountType:'depository',accountSubtype:''},expected:'brokerage'},
  {account:{name:'Securities account',bank:'Example Broker',
    accountType:'investment',accountSubtype:''},expected:'brokerage'},
  {account:{name:'Savings (synthetic)',bank:'Example Brokerage',
    accountType:'investment',accountSubtype:'individual'},expected:'savings'},
  {account:{name:'Investor Checking',bank:'Example Brokerage',
    accountType:'investment',accountSubtype:'individual'},expected:'checking'},
  {account:{name:'Savings Account',bank:'Example Credit Union',
    accountType:'depository',accountSubtype:'savings'},expected:'savings'},
  {account:{name:'Checking Account',bank:'Example Credit Union',
    accountType:'depository',accountSubtype:'checking'},expected:'checking'},
  {account:{name:'Mortgage Loan',bank:'Example Servicer',
    accountType:'loan',accountSubtype:'loan'},expected:'mortgage'},
  {account:{name:'Example Credit Card',bank:'Example Financial',
    accountType:'credit',accountSubtype:'credit_card'},expected:'credit_card'},
  {account:{name:'Generic Account',bank:'Example Financial',
    accountType:'unknown',accountSubtype:''},expected:'unclassified'}
];
for(const {account,expected} of classificationCases)
  assert.equal(core.detectedType(account),expected,'Product-aware inference: '+account.name);

// Correct grouping must be read-only, idempotent and persistent across reloads;
// provider balances remain unchanged and net worth is not inflated.
for(const source of ['simplefin','plaid']){
  const retirementKey='r'.repeat(64),cashKey='c'.repeat(64),brokerKey='i'.repeat(64);
  const sourceState={connected:true,accounts:[
    {key:retirementKey,bank:'Example Plan Administrator',name:'Example Employer 401(k) Retirement Savings Plan',
      accountType:'depository',accountSubtype:'savings',currency:'USD',
      balance:'59280.56',balanceDate:now-100,observedAt:now-100},
    {key:cashKey,bank:'Example Bank',name:'Everyday Savings',
      accountType:'depository',accountSubtype:'savings',currency:'USD',
      balance:'1055.84',balanceDate:now-100,observedAt:now-100},
    {key:brokerKey,bank:'Example Brokerage',name:'Individual Brokerage',
      accountType:'investment',accountSubtype:'individual',currency:'USD',
      balance:'2500.00',balanceDate:now-100,observedAt:now-100}
  ],monitoredAccounts:[retirementKey,cashKey,brokerKey],
  transactions:{},accountProfiles:{},lastSuccess:now-30};
  const raw=JSON.stringify(sourceState);
  const inputs=source==='simplefin'?{simplefin:sourceState}:{plaid:sourceState};
  const classified=core.combine(inputs);
  const ret=classified.accounts.find(a=>a.rawKey===retirementKey);
  assert.equal(ret.kind,'retirement',source+' retirement is not savings');
  assert.equal(classified.accountProfiles[ret.key].kind,'retirement');
  assert.equal(classified.accountProfiles[ret.key].includeSpending,false);
  const out=finance.summarize(core.safeForSummary(classified),{now,days:30});
  assert.equal(out.cash,'1055.84',source+' cash includes deposits only');
  assert.equal(out.investments,'61780.56',source+' investments include retirement and brokerage');
  assert.equal(out.investmentRetirement,'59280.56',source+' retirement subgroup is correct');
  assert.equal(out.investmentBrokerage,'2500.00',source+' brokerage subgroup is correct');
  assert.equal(out.netWorth,'62836.40',source+' overall net worth remains correct');
  const repeat=finance.summarize(core.safeForSummary(core.combine(inputs)),{now,days:30});
  assert.equal(repeat.cash,out.cash);
  assert.equal(repeat.investments,out.investments);
  assert.equal(JSON.stringify(sourceState),raw,'Read-only classifier must not rewrite provider data');
  // A verified owner-saved account type must always outrank automatic inference.
  sourceState.accountProfiles[retirementKey]={
    kind:'savings',balanceMode:'exclude',includeSpending:false};
  const ownerOverride=core.combine(inputs);
  assert.equal(ownerOverride.accountProfiles[ret.key].kind,'savings',
    'Explicit saved account category is preserved, not silently replaced');
  assert.equal(ownerOverride.accountProfiles[ret.key].balanceMode,'exclude',
    'Manual net-worth exclusion is preserved');
}
