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


const loanPaymentState={
  lastSuccess:NOW,
  accounts:[{...account('loan-cash'),balance:'500.00',balanceDate:NOW}],
  monitoredAccounts:['loan-cash'],
  accountProfiles:{'loan-cash':{kind:'checking',balanceMode:'asset',order:0}},
  transactions:{'loan-cash':{payment:{...row('-150.00'),category:'loan',confidence:'high',categorySource:'automatic'}}}
};
const loanSummary=summarize(loanPaymentState,{now:NOW});
assert.equal(loanSummary.expenses,'150.00','categorized real loan payments count as expenses');
assert.equal(loanSummary.spending.loan,'150.00','loan category appears in spending summary');
assert.equal(loanSummary.cashFlow,'-150.00','loan payment is not excluded as a transfer by default');

console.log('Financial observations passed: strict scope, multi-currency safety, exact cents, availability, coverage, privacy and non-mutation');
