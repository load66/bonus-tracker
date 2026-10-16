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
assert.deepEqual(result.netWorthHistory.map(x=>x.value),['1150.00','1300.00']);
assert.equal(result.income,'1000.00');
assert.equal(result.expenses,'100.00');
assert.equal(result.cashFlow,'900.00');
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
classified.monitoredAccounts.push('card');
delete classified.transactions.cash.review;
result=summarize(classified,{now:NOW});
assert.equal(result.complete,false,'an uncovered selected account cannot be masked by another account with history');
classified.monitoredAccounts.pop();
classified.accounts[1].balanceDate=NOW-8*DAY;
result=summarize(classified,{now:NOW});
assert.equal(result.cashAvailable,false,'stale deposit balances cannot produce a cash total');
assert.equal(result.netWorthAvailable,false,'stale balances cannot produce net worth');


// Phase 1 regression contract: financial truth must survive partial coverage.
const financeAt=NOW;
const financeAccount=(key,kind,balance,age=60)=>({
  key,kind,detectedType:kind,currency:'USD',balance,balanceDate:financeAt-age
});
const partialAccounts=[
  financeAccount('available','checking','100.05'),
  financeAccount('credit','credit_card','-15.00'),
  financeAccount('excluded','savings','500.00',9*DAY),
  financeAccount('stale','brokerage','250.00',9*DAY)
];
const covered=summarize({
  accounts:partialAccounts,
  accountProfiles:{excluded:{kind:'savings',balanceMode:'exclude'}},
  balanceHistory:{
    available:[{observedAt:NOW-100000,balance:'90.00',currency:'USD'},
      {observedAt:NOW-60,balance:'100.05',currency:'USD'}],
    credit:[{observedAt:NOW-100000,balance:'5.00',currency:'USD'},
      {observedAt:NOW-60,balance:'-15.00',currency:'USD'}],
    stale:[{observedAt:NOW-100000,balance:'250.00',currency:'USD'},{observedAt:NOW-60,balance:'250.00',currency:'USD'}]
  }
},{now:financeAt});
assert.equal(covered.netWorthAvailable,false,'stale inclusion must not be called complete');
assert.equal(covered.observedNetWorth,'365.05','negative credit balance increases net worth; excluded account contributes zero');
assert.deepEqual(covered.netWorthCoverage,{eligible:3,covered:3,stale:1,undated:0,missing:0,unsupportedCurrency:0,unclassified:0});
assert.equal(covered.excludedFromNetWorth,1);
assert.equal(covered.netWorthHistory[0].value,'335.00','historic liability debt retains its sign');

const excluding=summarize({
  accounts:[financeAccount('kept','checking','80.00'),financeAccount('ignored','savings','900.00')],
  accountProfiles:{ignored:{kind:'savings',balanceMode:'exclude'}}
},{now:NOW});
assert.equal(excluding.netWorthAvailable,true,'an excluded valid account cannot block the eligible account');
assert.equal(excluding.netWorth,'80.00');
const unknown=summarize({
  accounts:[financeAccount('cash','checking','100.00'),{key:'missing',kind:'savings',currency:'USD',balance:null}],
},{now:NOW});
assert.equal(unknown.netWorthAvailable,false);
assert.equal(unknown.observedNetWorth,'100.00','known subtotal is displayed without inventing a missing balance');
assert.equal(unknown.netWorthCoverage.covered,1);
assert.equal(unknown.netWorthCoverage.missing,1);

const unclassified=summarize({
  accounts:[financeAccount('known','checking','100.00'),financeAccount('unknown','unclassified','700.00')],
  accountProfiles:{unknown:{kind:'unclassified',balanceMode:'asset'}}
},{now:NOW});
assert.equal(unclassified.observedNetWorth,'100.00','unclassified account cannot silently join net-worth subtotal');
assert.equal(unclassified.netWorthCoverage.eligible,2);
assert.equal(unclassified.netWorthCoverage.covered,1,'coverage cannot count an unclassified balance as included');
assert.equal(unclassified.netWorthCoverage.unclassified,1);
const cardCredit=summarize({accounts:[financeAccount('credit','credit_card','-30.00')]},{now:NOW});
assert.equal(cardCredit.netWorth,'30.00','credit-card overpayment is a net-worth asset');
const spendingState={
  lastSuccess:NOW,accounts:[financeAccount('cash','checking','1000.00')],
  monitoredAccounts:['cash'],transactions:{cash:{
    income:{posted:NOW-120,amount:'500.00',category:'income'},
    bonus:{posted:NOW-100,amount:'100.50',category:'bonus',kind:'possible_bonus'},
    paid:{id:'paid',posted:NOW-90,amount:'-40.00',merchant:'Grocery',category:'groceries'},
    refund:{posted:NOW-80,amount:'40.00',merchant:'Grocery',category:'refund'},
    small:{posted:NOW-70,amount:'-0.01',category:'dining'},
    transfer:{posted:NOW-60,amount:'-150.00',category:'transfer',signals:['matched_internal_transfer']},
    uncertain:{posted:NOW-50,amount:'20.00',category:'refund',merchant:'Unknown'}
  }}
};
const spend=summarize(spendingState,{now:NOW});
assert.equal(spend.bonusIncome,'100.50');
assert.equal(spend.income,'500.00','bonus income is kept separate');
assert.equal(spend.expenses,'0.01','refund reverses its exact-cents purchase category');
assert.equal(spend.spending.groceries,'0.00');
assert.equal(spend.refunds,'40.00');
assert.equal(spend.unattributedRefunds,1,'unattributed refund is flagged, never guessed');
assert.equal(spend.cashFlow,'600.49','cash flow includes bonus income but excludes transfers');
assert.equal(spend.complete,false,'unattributed refunds prevent a false complete report');
assert.equal(spend.monthly[0].bonusIncome,'100.50');

const confirmedCredit=summarize({
  lastSuccess:NOW,accounts:[financeAccount('cash','checking','50.00')],
  monitoredAccounts:['cash'],transactions:{cash:{
    purchase:{amount:'-20.00',category:'groceries',posted:NOW-300},
    correctedRefund:{amount:'5.00',category:'groceries',categorySource:'user',posted:NOW-200}
  }}
},{now:NOW});
assert.equal(confirmedCredit.expenses,'15.00','user-confirmed positive category credit offsets spending');
assert.equal(confirmedCredit.refunds,'5.00');
assert.equal(confirmedCredit.spending.groceries,'15.00');

const octoberInChicago=Date.parse('2026-11-01T04:30:00Z')/1000;
const localMonth=summarize({
  accounts:[financeAccount('c','checking','1.00')],
  monitoredAccounts:['c'],
  transactions:{c:{entry:{posted:octoberInChicago,amount:'3.50',category:'income'}}}
},{now:Date.parse('2026-11-01T06:00:00Z')/1000});
assert.equal(localMonth.monthly[0].month,'2026-10',
  'a late-night October 31 Chicago transaction must not fall into the UTC November bucket');

console.log('Financial observations passed: strict scope, multi-currency safety, exact cents, availability, coverage, privacy and non-mutation');
