'use strict';
const assert=require('node:assert/strict');
const F=require('../finance-overview-core.js');
const NOW=1792134000;
const acc=key=>({key,name:'Synthetic',bank:'Synthetic',currency:'USD',
  balance:key==='a'?'1000.00':'200.00',balanceDate:NOW-100,source:'plaid'});
const row=(id,amount,category,account)=>({id,posted:NOW-100,amount,category,
  categorySource:'automatic',confidence:'high',pending:false,account});
const make=()=>({
  auditNow:NOW,lastSuccess:NOW,
  accounts:[acc('a'),acc('b')],monitoredAccounts:['a','b'],
  accountProfiles:{a:{kind:'checking',balanceMode:'asset',includeSpending:true},
                   b:{kind:'credit_card',balanceMode:'liability',includeSpending:true}},
  transactions:{a:{paycheck:row('paycheck','1500.00','income','a'),
    grocery:row('grocery','-49.17','groceries','a')},b:{}}
});
const verify=state=>F.checkInvariants(state,F.summarize(state,{now:NOW}));
let state=make(),summary=F.summarize(state,{now:NOW});
assert.deepEqual(verify(state),[]);
assert.equal(summary.netWorth,'800.00');
assert.equal(summary.expenses,'49.17');
const netBad={...summary,netWorth:'801.00'};
assert.ok(F.checkInvariants(state,netBad).includes('NET_WORTH_MISMATCH'));
assert.ok(F.checkInvariants(state,netBad).includes('NET_WORTH_GROUP_MISMATCH'));
assert.ok(F.checkInvariants(state,{...summary,netWorthGroups:{...summary.netWorthGroups,cash:'999.00'}})
  .includes('NET_WORTH_GROUP_MISMATCH'));
assert.ok(F.checkInvariants(state,{...summary,spending:{groceries:'49.16'}})
  .includes('SPENDING_CATEGORY_MISMATCH'));
state=make();
state.transactions.a.duplicate=row('grocery','-30.00','groceries','a');
assert.ok(verify(state).includes('DUPLICATE_TRANSACTION_ID'));
state=make();
state.transactions.a.invalid=row('invalid','0.001','groceries','a');
assert.ok(verify(state).includes('INVALID_POSTED_AMOUNT'));
state=make();
state.transactions.a.odd=row('odd','50.00','housing','a');
assert.ok(verify(state).includes('CLASSIFICATION_GAP'));
state=make();
state.transactions.a.paycheck.transferPairId='pair1';
state.transactions.a.paycheck.signals=['matched_internal_transfer'];
assert.ok(verify(state).includes('CLASSIFICATION_CONFLICT'));
assert.ok(verify(state).includes('TRANSFER_PAIR_INVALID'));
state=make();
const outbound=row('outbound','-500.00','transfer','a');
const inbound=row('inbound','500.00','transfer','b');
for(const x of [outbound,inbound]){x.signals=['matched_internal_transfer'];x.transferPairId='pair2'}
state.transactions.a.outbound=outbound;state.transactions.b.inbound=inbound;
assert.deepEqual(verify(state),[]);
state.transactions.b.inbound.amount='499.99';
assert.ok(verify(state).includes('TRANSFER_PAIR_INVALID'));
state.transactions.b.inbound.amount='500.00';
state.transactions.b.inbound.account='a';
assert.deepEqual(verify(state),[],'Source account key determines pair identity, not optional row.account field');
state.transactions.a.second=row('second','500.00','transfer','a');
state.transactions.a.second.transferPairId='pair2';
state.transactions.a.second.signals=['matched_internal_transfer'];
assert.ok(verify(state).includes('TRANSFER_PAIR_INVALID'));
console.log('Exact-cent Finance invariant regressions passed');
