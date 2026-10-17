'use strict';
const assert=require('node:assert/strict');
const R=require('../finance-reconcile-core.js');
const DAY=86400,NOW=1792134000;
const account={key:'synthetic',source:'plaid',kind:'checking',currency:'USD',historyComplete:true};
const snap=(older,newer)=>[
  {observedAt:NOW-2*DAY,balance:older,currency:'USD'},
  {observedAt:NOW,balance:newer,currency:'USD'}
];
const tx=(id,amount,posted=NOW-DAY,extra={})=>({id,posted,amount,pending:false,...extra});
const rows={one:tx('one','-200.00'),two:tx('two','50.00',NOW-DAY+1)};
const run=(a,h,t,options={})=>R.reconcile(a,h,t,{historyComplete:true,...options});
const match=run(account,snap('1000.00','850.00'),rows);
assert.equal(match.status,'reconciled');
assert.equal(match.difference,'0.00');
assert.equal(match.differenceCents,'0');
assert.deepEqual(match.transactions.map(row=>row.id),['one','two']);
const missing=run(account,snap('1000.00','850.00'),{one:rows.one});
assert.equal(missing.status,'off');
assert.equal(missing.difference,'50.00');
assert.equal(missing.differenceCents,'5000');
const duplicate=run(account,snap('1000.00','850.00'),[...Object.values(rows),tx('duplicate','-200.00')]);
assert.equal(duplicate.status,'off');
assert.equal(duplicate.difference,'200.00');
const pending=run(account,snap('1000.00','850.00'),
  {...rows,ignored:tx('ignored','-800.00',NOW-DAY,{pending:true})});
assert.equal(pending.status,'reconciled');
assert.equal(run(account,snap('1000.00','850.00'),{
  ignored:tx('ignored','-150.00',NOW-DAY,{pending:true})}).status,'unknown');
assert.equal(run(account,snap('1000.00','850.00'),rows,{historyComplete:false}).status,'unknown');
assert.equal(run(account,snap('1000.00','850.00'),rows,{historyLoading:true}).status,'unknown');
assert.equal(run(account,snap('1000.00','850.00').slice(1),rows).status,'unknown');
assert.equal(run(account,snap('1000.00','850.00'),{one:tx('one','-200.00',NOW-2*DAY-3600),
  two:tx('two','50.00',NOW-DAY)}).status,'reconciled','One-day tolerance accepts bank date boundaries');
for(const [source,from,to] of [['simplefin','-2000.00','-1850.00'],['plaid','2000.00','1850.00']]){
  const loan={...account,kind:'mortgage',source};
  const result=run(loan,snap(from,to),{payment:tx('payment','150.00')});
  assert.equal(result.status,'reconciled',source+' mortgage debt sign');
  assert.equal(R.signed(loan,R.cents(from)),-200000n);
}
const plaidCard={...account,kind:'credit_card',source:'plaid'};
assert.equal(run(plaidCard,snap('500.00','400.00'),
  {payment:tx('payment','100.00')}).status,'reconciled');
const finCard={...plaidCard,source:'simplefin'};
assert.equal(run(finCard,snap('-500.00','-400.00'),
  {payment:tx('payment','100.00')}).reason,'liability_sign_unverified');
assert.equal(run({...finCard,liabilityDebtSign:'negative'},snap('-500.00','-400.00'),
  {payment:tx('payment','100.00')}).status,'reconciled');
const state={accounts:[account],accountProfiles:{synthetic:{kind:'checking',balanceMode:'asset'}},
  balanceHistory:{synthetic:snap('1000.00','850.00')},transactions:{synthetic:rows}};
const before=JSON.stringify(state);
assert.equal(R.reconcileAll(state)[0].status,'reconciled');
assert.equal(JSON.stringify(state),before,'Reconciliation must not rewrite bank records');
const disabled=structuredClone(state);
disabled.accountProfiles.synthetic.syncEnabled=false;
assert.deepEqual(R.reconcileAll(disabled),[],'Disabled accounts cannot pollute totals');
console.log('finance reconciliation exact-cent regression passed');
