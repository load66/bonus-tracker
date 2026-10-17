'use strict';
const assert=require('node:assert/strict');
const {summarize}=require('../finance-overview-core.js');
const NOW=1792134000, DAY=86400;
const row=(amount,posted=NOW-100,kind='deposit')=>({amount,posted,kind});
const account=(key,currency='USD')=>({key,currency,name:'Synthetic only'});
const state={
  lastSuccess:NOW,
  accounts:[account('checking'),account('other','EUR'),account('unselected')],
  monitoredAccounts:['checking','other'],
  mappings:{checking:{entryId:'bonus1'}},
  transactions:{
    checking:{
      a:row('100.10'),b:row('50.07',NOW-200,'possible_bonus'),
      c:row('-40.20'),old:row('900.00',NOW-31*DAY),
      future:row('150.00',NOW+3600),invalid:row('0.123'),
    },
    other:{d:row('300.00')},
    unselected:{e:row('999.00')}
  }
};
const before=JSON.stringify(state);
let result=summarize(state,{now:NOW});
assert.equal(result.credits,'150.17','exact cents for posted USD credits');
assert.equal(result.debits,'40.20','negative transactions are displayed as positive gross debits');
assert.equal(result.net,'109.97','net is observed credits less debits');
assert.equal(result.observations,3,'excludes other currency, unselected, old, future and invalid rows');
assert.equal(result.candidates,1,'flags bonus evidence for review only');
assert.equal(result.unusable,1,'unsupported decimal precision is not rounded into false totals');
assert.equal(result.usdAccounts,1);
assert.equal(result.otherCurrencyAccounts,1);
assert.equal(result.selectedAccounts,2,'monitoring and bonus mapping must not count the same account twice');
assert.equal(result.sourceAccounts,1);
assert.equal(result.hasSync,true);
assert.equal(result.hasActivity,true);
assert.equal(JSON.stringify(state),before,'pure function never changes account history or mapping');
assert.equal(Object.isFrozen(result),true);

result=summarize({...state,lastSuccess:null,transactions:{}},{now:NOW});
assert.equal(result.credits,null,'absent evidence must never be shown as $0');
assert.equal(result.hasActivity,false);
assert.equal(result.hasSync,false);

result=summarize({...state,transactions:{checking:{zero:row('0.00')}}},{now:NOW});
assert.equal(result.credits,'0.00','a genuine observed zero is distinguishable from unavailable data');
assert.equal(result.observations,1);

result=summarize({...state,monitoredAccounts:[],mappings:{},transactions:state.transactions},{now:NOW});
assert.equal(result.observations,0,'unselected accounts are excluded, even if history remains');
assert.equal(result.credits,null);

result=summarize({...state,monitoredAccounts:['missing'],mappings:{},transactions:state.transactions},{now:NOW});
assert.equal(result.missingAccounts,1,'missing selected account remains a visible coverage gap');

result=summarize({...state,accounts:[account('checking')],monitoredAccounts:['checking'],mappings:{},
  transactions:{checking:{plus:row('0.01'),minus:row('-0.01')}}},{now:NOW});
assert.equal(result.credits,'0.01');
assert.equal(result.debits,'0.01');
assert.equal(result.net,'0.00','no floating point rounding drift');

const classified={
  lastSuccess:NOW,
  accounts:[
    {...account('cash'),balance:'1000.00',balanceDate:NOW-60},
    {...account('savings'),balance:'500.00',balanceDate:NOW-60},
    {...account('card'),balance:'200.00',balanceDate:NOW-60}
  ],
  accountProfiles:{
    cash:{kind:'checking',balanceMode:'asset',order:0},savings:{kind:'savings',balanceMode:'asset',order:1},
    card:{kind:'credit_card',balanceMode:'liability',order:2}
  },
  balanceHistory:{
    cash:[{observedAt:NOW-DAY,at:NOW-DAY,balance:'900.00',currency:'USD'},{observedAt:NOW,at:NOW,balance:'1000.00',currency:'USD'}],
    savings:[{observedAt:NOW-DAY,at:NOW-DAY,balance:'500.00',currency:'USD'},{observedAt:NOW,at:NOW,balance:'500.00',currency:'USD'}],
    card:[{observedAt:NOW-DAY,at:NOW-DAY,balance:'250.00',currency:'USD'},{observedAt:NOW,at:NOW,balance:'200.00',currency:'USD'}]
  },
  monitoredAccounts:['cash'],mappings:{},transactions:{cash:{
    income:{...row('1000.00'),category:'income',categorySource:'automatic',confidence:'high'},
    expense:{...row('-100.00'),category:'groceries',categorySource:'user',confidence:'confirmed'},
    transfer:{...row('-500.00'),category:'transfer',categorySource:'automatic',confidence:'high'},
    pending:{...row('-10.00'),category:'shopping',categorySource:'automatic',confidence:'low',pending:true},
    review:{...row('-20.00'),category:'unreviewed',categorySource:'automatic',confidence:'low'}
  }}
};
result=summarize(classified,{now:NOW});
assert.equal(result.cash,'1500.00','cash includes only classified deposit accounts with current USD balances');
assert.equal(result.assets,'1500.00');
assert.equal(result.liabilities,'200.00');
assert.equal(result.netWorth,'1300.00');
assert.equal(result.uncategorized,1);
assert.deepEqual(result.netWorthHistory.map(x=>x.value),['1150.00','1300.00']);
assert.equal(result.income,'1000.00');
assert.equal(result.expenses,'120.00','Uncategorized debit is included in expenses immediately');
assert.equal(result.cashFlow,'880.00');
assert.equal(result.transfers,1,'transfers are excluded from income, expenses and cash flow');
assert.equal(result.pending,1,'pending activity is visible but excluded from totals');
assert.equal(result.unreviewed,1);
assert.equal(result.complete,false);
assert.equal(result.savingsRate,null,'savings rate is unavailable while transaction coverage needs review');
classified.transactions.cash.review.category='shopping';
classified.transactions.cash.review.categorySource='user';
classified.transactions.cash.review.confidence='confirmed';
result=summarize(classified,{now:NOW});
assert.equal(result.expenses,'120.00');
assert.equal(result.savingsRate,88);
classified.transactions.cash.review.categorySource='user_rule';
result=summarize(classified,{now:NOW});
assert.equal(result.complete,true,'merchant rules learned from user corrections count as reviewed');
assert.equal(result.unreviewed,0,'a confirmed user rule must not be mislabeled as unreviewed');
classified.transactions.cash.review.categorySource='ai';
classified.transactions.cash.review.confidence='medium';
result=summarize(classified,{now:NOW});
assert.equal(result.complete,false,'an unconfirmed AI suggestion never certifies complete spending');
classified.transactions.cash.review.categorySource='user';
classified.transactions.cash.review.confidence='confirmed';

classified.monitoredAccounts.push('card');
delete classified.transactions.cash.review;
result=summarize(classified,{now:NOW});
assert.equal(result.complete,false,'an uncovered selected account cannot be masked by another account with history');
classified.monitoredAccounts.pop();
classified.accounts[1].balanceDate=NOW-8*DAY;
result=summarize(classified,{now:NOW});
assert.equal(result.cashAvailable,true,'Known fresh cash accounts still contribute to a partial total');
assert.equal(result.cash,'1000.00');
assert.equal(result.staleOrUnavailableCash,1);
assert.equal(result.cashPartial,true);
assert.equal(result.netWorthAvailable,true,'fresh balances still support a partial subtotal');
assert.equal(result.netWorthPartial,true,'stale balances keep net worth explicitly partial');


const correctedLiabilities=structuredClone(classified);
correctedLiabilities.accounts[1].balanceDate=NOW;
correctedLiabilities.accountProfiles.savings.balanceMode='exclude';
correctedLiabilities.accounts[2].balance='-50.00';
correctedLiabilities.balanceHistory.card=[{observedAt:NOW,at:NOW,balance:'-50.00',currency:'USD'}];
result=summarize(correctedLiabilities,{now:NOW});
assert.equal(result.netWorthAvailable,true,'intentionally excluded accounts do not block net worth');
assert.equal(result.assets,'1050.00','a credit balance on a liability account counts as an asset');
assert.equal(result.liabilities,'0.00','a credit balance is not an absolute-valued liability');
assert.equal(result.netWorth,'1050.00');
assert.equal(result.excludedFromNetWorth,1);
assert.equal(result.netWorthHistory.at(-1).value,'1050.00','history handles account credits and exclusions');

const excludedAll=structuredClone(correctedLiabilities);
for(const p of Object.values(excludedAll.accountProfiles))p.balanceMode='exclude';
assert.equal(summarize(excludedAll,{now:NOW}).netWorthAvailable,false,'zero included accounts is unknown, not zero');

const unconfirmedPromotion={
  lastSuccess:NOW,
  accounts:[account('bonus-checking')],
  monitoredAccounts:['bonus-checking'],
  transactions:{'bonus-checking':{
    credit:{...row('400.00',NOW-90,'possible_bonus'),
      category:'bonus',categorySource:'automatic',confidence:'high'}
  }}
};
const promotionSummary=summarize(unconfirmedPromotion,{now:NOW});
assert.equal(promotionSummary.credits,'400.00','observed credit remains recorded');
assert.equal(promotionSummary.income,'0.00','an unconfirmed promotion must not be counted as income');
assert.equal(promotionSummary.unreviewed,1,'automatic bonus inference still requires user review');
assert.equal(promotionSummary.complete,false,'a guessed promotion cannot certify cash-flow completeness');

console.log('Financial observations passed: strict scope, multi-currency safety, exact cents, availability, coverage, privacy and non-mutation');

const cardWithoutBankDate=structuredClone(classified);
cardWithoutBankDate.accounts[1].balanceDate=NOW;
cardWithoutBankDate.accounts[2].balanceDate=null;
cardWithoutBankDate.accounts[2].observedAt=NOW-100;
const observedCard=summarize(cardWithoutBankDate,{now:NOW});
assert.equal(observedCard.liabilities,'200.00','Include recently observed Robinhood credit-card debt with a partial-status warning');
assert.equal(observedCard.netWorthPartial,true,'Non-authoritative Plaid observation must not become a verified balance timestamp');
assert.equal(observedCard.provisionalBalances.length,1);
assert.equal(observedCard.cash,'1500.00');
const withUnknown=structuredClone(classified);
withUnknown.monitoredAccounts=['cash'];
withUnknown.transactions.cash.unknown={...row('-311.17'),category:'unreviewed',confidence:'low'};
const unknownSummary=summarize(withUnknown,{now:NOW});
assert.equal(unknownSummary.expenses,'411.17');
assert.equal(unknownSummary.spending.unreviewed,'311.17');
assert.equal(unknownSummary.uncategorized,1);

const pendingFinancialMovements=structuredClone(withUnknown);
pendingFinancialMovements.transactions.cash.paycard={...row('-200.00'),description:'Capital One CRCARDPMT',category:'unreviewed'};
pendingFinancialMovements.transactions.cash.invest={...row('-1000.00'),description:'Robinhood IRA contribution',category:'unreviewed'};
const movementSummary=summarize(pendingFinancialMovements,{now:NOW});
assert.equal(movementSummary.expenses,'411.17','Unreviewed bank payments and IRA contributions cannot increase expenses before the next server sync');

const investmentBalances={
  lastSuccess:NOW,accounts:[
    {...account('broker'),balance:'9200.00',balanceDate:NOW-60},
    {...account('retirement'),balance:null,balanceDate:NOW-60}
  ],
  accountProfiles:{
    broker:{kind:'brokerage',balanceMode:'asset'},
    retirement:{kind:'retirement',balanceMode:'asset'}
  },
  monitoredAccounts:['broker','retirement'],mappings:{},
  transactions:{broker:{},retirement:{}}
};
const incompleteInvestments=summarize(investmentBalances,{now:NOW});
assert.equal(incompleteInvestments.investments,null,
  'Known brokerage alone is not a complete investment total when retirement balance is unknown');
assert.equal(summarize({...investmentBalances,accounts:[]},{now:NOW}).investments,null,
  'No investment accounts means unavailable, not a known zero');
const completeInvestments=summarize({...investmentBalances,
  accounts:[investmentBalances.accounts[0],{...investmentBalances.accounts[1],balance:'600.00'}]
},{now:NOW});
assert.equal(completeInvestments.investments,'9800.00',
  'Only fully observed investment account balances may be shown as an investment total');


// Dashboard accounting identity: EVERY displayed signed bucket sums to net worth.
const numbers={
  lastSuccess:NOW,
  accounts:[
    {key:'cash',bank:'Checking CU',name:'Cash account',balance:'6555.84',balanceDate:NOW,currency:'USD'},
    {key:'broker',bank:'Brokerage CU',name:'Brokerage',balance:'11400.00',balanceDate:NOW,currency:'USD'},
    {key:'retirement',bank:'Retirement CU',name:'401k',balance:'18276.34',balanceDate:NOW,currency:'USD'},
    {key:'credit',bank:'Card Issuer',name:'Card',balance:'63.87',balanceDate:NOW,currency:'USD'},
    {key:'paypal',bank:'PayPal',name:'Wallet',balance:'283.27',balanceDate:NOW,currency:'USD'},
    {key:'stale',bank:'Cash Bank',name:'Stale checking',balance:'800.00',balanceDate:NOW-9*DAY,currency:'USD'}
  ],
  monitoredAccounts:['cash','broker','retirement','credit','paypal','stale'],
  accountProfiles:{
    cash:{kind:'checking',balanceMode:'asset'},broker:{kind:'brokerage',balanceMode:'asset'},
    retirement:{kind:'retirement',balanceMode:'asset'},credit:{kind:'credit_card',balanceMode:'liability'},
    paypal:{kind:'other_asset',balanceMode:'asset'},stale:{kind:'checking',balanceMode:'asset'}
  },transactions:{}
};
const overviewTotals=summarize(numbers,{now:NOW});
assert.equal(overviewTotals.netWorth,'36451.58');
assert.deepEqual(overviewTotals.netWorthGroups,{
  cash:'6555.84',investments:'29676.34',creditCards:'-63.87',other:'283.27'
});
assert.equal(Object.values(overviewTotals.netWorthGroups)
  .reduce((v,n)=>v+require('../finance-overview-core.js').cents(n),0n),
  require('../finance-overview-core.js').cents(overviewTotals.netWorth));
assert.equal(overviewTotals.netWorthNotUpdated.length,1);
assert.equal(overviewTotals.netWorthNotUpdated[0].lastKnownIncluded,false);
assert.equal(overviewTotals.netWorthNotUpdated[0].lastKnownBalance,'800.00');
assert.equal(overviewTotals.netWorthGroupAccounts.other[0].name,'Wallet',
  'PayPal is explicitly included in the Other row, not lost from the presentation');

// A credit/overpayment does NOT convert a credit card into an Other asset.
const creditBalanceCards={
  lastSuccess:NOW,
  accounts:[
    {key:'robinhood-card',bank:'Robinhood',name:'Robinhood Credit Card',mask:'4010',
      currency:'USD',balance:'-283.27',balanceDate:NOW},
    {key:'paypal-card',bank:'PayPal',name:'PayPal Mastercard',mask:'8532',
      currency:'USD',balance:'63.87',balanceDate:NOW}
  ],
  accountProfiles:{
    'robinhood-card':{kind:'credit_card',balanceMode:'liability'},
    'paypal-card':{kind:'credit_card',balanceMode:'liability'}
  },
  monitoredAccounts:[],transactions:{}
};
const cardCredit=summarize(creditBalanceCards,{now:NOW});
assert.equal(cardCredit.netWorth,'219.40','Card credit minus owed debt adds $219.40 to net worth');
assert.equal(cardCredit.netWorthGroups.creditCards,'219.40','Net credit is kept in Credit cards');
assert.equal(cardCredit.netWorthGroups.other,'0.00','No phantom Other asset from card credits');
assert.deepEqual(cardCredit.netWorthGroupAccounts.creditCards.map(x=>[x.name,x.amount]),[
  ['Robinhood Credit Card','283.27'],['PayPal Mastercard','-63.87']
]);
assert.equal(cardCredit.netWorthGroupAccounts.other.length,0);
const positiveCard=structuredClone(creditBalanceCards);
positiveCard.accounts[0].balance='283.27';
positiveCard.accountProfiles['robinhood-card'].balanceMode='asset';
const positiveSummary=summarize(positiveCard,{now:NOW});
assert.equal(positiveSummary.netWorthGroupAccounts.creditCards.length,2,
  'A credit card with a positive provider balance still appears in Credit cards');
assert.equal(positiveSummary.netWorthGroupAccounts.other.length,0,
  'Classification cannot use the sign or saved asset mode to change product type');

// A credit card's category comes from its saved account type, never its balance sign.
const creditCards=structuredClone(numbers);
creditCards.accounts=[
  {key:'robinhood',bank:'Robinhood',name:'Robinhood Credit Card',mask:'4010',
   balance:'-283.27',balanceDate:NOW,currency:'USD'},
  {key:'paypal-card',bank:'PayPal',name:'PayPal Mastercard',mask:'8532',
   balance:'63.87',balanceDate:NOW,currency:'USD'}
];
creditCards.accountProfiles={
  robinhood:{kind:'credit_card',balanceMode:'liability'},
  'paypal-card':{kind:'credit_card',balanceMode:'liability'}
};
creditCards.monitoredAccounts=['robinhood','paypal-card'];
creditCards.balanceHistory={};
const cardCredits=summarize(creditCards,{now:NOW});
assert.equal(cardCredits.netWorthGroups.creditCards,'219.40','Net credit card balance is $219.40 credit');
assert.equal(cardCredits.netWorthGroups.other,'0.00','Credits cannot leak into Other assets');
assert.equal(cardCredits.netWorthGroupAccounts.other.length,0,'No artificial Robinhood Other row');
assert.deepEqual(cardCredits.netWorthGroupAccounts.creditCards.map(x=>[x.key,x.amount]),[
  ['robinhood','283.27'],['paypal-card','-63.87']
],'Each card stays under Credit cards with a signed amount');
assert.equal(cardCredits.netWorth,'219.40','Reclassification cannot change net worth');
assert.equal(cardCredits.assets,'283.27');
assert.equal(cardCredits.liabilities,'63.87');

const octoberStart=Math.floor(new Date(new Date(NOW*1000).getFullYear(),
  new Date(NOW*1000).getMonth(),1).getTime()/1000);
const flow=structuredClone(numbers);
flow.accounts=flow.accounts.filter(a=>['cash','broker'].includes(a.key));
flow.accounts.find(a=>a.key==='broker').balance='1800.00';
flow.accountProfiles={cash:flow.accountProfiles.cash,broker:flow.accountProfiles.broker};
flow.monitoredAccounts=['cash','broker'];
flow.balanceHistory={broker:[
  {observedAt:octoberStart-3600,currency:'USD',balance:'1500.00'},
  {observedAt:NOW,currency:'USD',balance:'1800.00'}
]};
flow.transactions={broker:{
  transferIn:{id:'in',amount:'500.00',posted:octoberStart+86400,pending:false,
    signals:['investment_transfer'],transferPairId:'p1',transferOtherAccountKey:'cash'},
  transferOut:{id:'out',amount:'-100.00',posted:octoberStart+172800,pending:false,
    signals:['investment_transfer'],transferPairId:'p2',transferOtherAccountKey:'cash'}
}};
flow.investmentFlowCoverage={broker:{complete:true,from:octoberStart-3600,through:NOW}};
const perf=summarize(flow,{now:NOW});
assert.equal(perf.investmentMarketChange,'-100.00',
  'market change must remove contributions and restore withdrawals: 300 - 500 + 100');
assert.equal(perf.investmentContributions,'500.00');
assert.equal(perf.investmentWithdrawals,'100.00');
const unverified=structuredClone(flow);delete unverified.investmentFlowCoverage;
const unverifiedResult=summarize(unverified,{now:NOW});
assert.equal(unverifiedResult.investmentMarketChange,null,
  'investment balance delta is not performance without complete transaction coverage');
assert.equal(unverifiedResult.investmentContributions,'500.00',
  'observed paired transfers remain separately reviewable when performance is hidden');
console.log('Net-worth groups reconcile with PayPal/Other, stale balances excluded, and cash-flow-adjusted market change is gated');
