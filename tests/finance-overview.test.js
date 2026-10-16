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

console.log('Financial observations passed: strict scope, multi-currency safety, exact cents, availability, coverage, privacy and non-mutation');
