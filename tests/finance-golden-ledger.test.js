'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const U=require('../finance-unified-core.js');
const O=require('../finance-overview-core.js');
const file=fs.readFileSync(path.join(__dirname,'fixtures/golden-ledger.json'));
let hash=14695981039346656037n;
for(const byte of file){hash=(hash^BigInt(byte))*1099511628211n&((1n<<64n)-1n)}
assert.equal(hash.toString(16).padStart(16,'0'),'889078fa7fb897d3',
  'The cross-repository golden-ledger fixture changed without an independently reviewed baseline');
const fixture=JSON.parse(file);
const state=U.safeForSummary(U.combine({
  simplefin:fixture.simplefin,plaid:fixture.plaid
}));
const summary=O.summarize(state,{now:fixture.asOf,days:30});
const expected={
  income:'4000.00',
  expenses:'1738.20',
  cashFlow:'2261.80',
  cash:'5000.00',
  assets:'5000.00',
  liabilities:'240500.00',
  netWorth:'-235500.00',
  transfers:7,
  spending:{
    housing:'1500.00',
    groceries:'150.25',
    dining:'45.75',
    subscription:'12.00',
    shopping:'7.31',
    entertainment:'22.89'
  }
};
for(const [field,value] of Object.entries(expected)){
  if(field==='spending')assert.deepEqual(summary.spending,value,'Exact-cent category breakdown');
  else assert.deepEqual(summary[field],value,field+' must match the independently handwritten baseline');
}
assert.equal(summary.investments,null,'No investment accounts means unknown, not zero');
assert.equal(summary.netWorthPartial,true,'Unbank-dated Plaid balances must remain provisional');
assert.equal(state.notSyncingAccounts,1,'Disabled account is excluded from every total');
const rows=Object.values(state.transactions||{}).flatMap(x=>Object.values(x));
const pairs=new Map();
for(const row of rows)if(row.transferPairId){
  const saved=pairs.get(row.transferPairId)||[];
  saved.push({account:row.accountKey,id:row.id,amount:row.amount});
  pairs.set(row.transferPairId,saved);
}
assert.equal(pairs.size,2,'Unique checking/card and cross-provider transfer pairs');
assert.deepEqual([...pairs.values()].map(x=>x.length).sort(),[2,2]);
assert.ok(rows.some(x=>x.pending),'The pending row must remain available to the ledger UI');
assert.ok(rows.some(x=>x.id==='postedNew'&&!x.pending),'New posted ID must not silently lose activity');
assert.ok(rows.some(x=>x.id==='edited'&&x.revisions?.[0]?.amount==='-20.00'),
  'Provider amount corrections retain their historical revision');
assert.equal(rows.filter(x=>x.id==='repeat').length,1,'An exact replay must be idempotent');
assert.ok(!state.accounts.some(x=>x.name==='Synthetic Unmonitored'),
  'Sync-off account excluded from selected reporting and balances');
const invariantState={...state,auditNow:fixture.asOf};
assert.deepEqual(O.checkInvariants(invariantState,summary),[],'Golden ledger has no silent invariant failures');
console.log('Golden ledger exact-cent cross-provider baseline and pinned fixture checksum passed');
