'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const contract=require('./fixtures/finance-categories-contract.json');
const transfer=require('../finance-transfer-core.js');
const insight=require('../finance-insights-core.js');
const overview=require('../finance-overview-core.js');
const source=(name)=>fs.readFileSync(path.join(root,name),'utf8');
function jsKeys(name,pattern){
  const match=source(name).match(pattern);
  assert.ok(match,'Missing category contract in '+name);
  return [...match[1].matchAll(/\b([a-z_]+):\s*'/g)].map(x=>x[1]).sort();
}
function setNames(name,variable){
  const text=source(name);
  const start=text.indexOf(variable+'=new Set([');
  assert.ok(start>=0,'Missing '+variable+' in '+name);
  const end=text.indexOf(']);',start);
  assert.ok(end>start);
  return [...text.slice(start,end).matchAll(/'([a-z_]+)'/g)].map(x=>x[1]).sort();
}
assert.deepEqual(jsKeys('finance-page.js',/const CATEGORIES=\{([\s\S]*?)\n  \};/),
  contract.categories,'UI category picker must agree with backend manifest');
assert.deepEqual(setNames('finance-overview-core.js','const SPENDING'),contract.spending);
assert.deepEqual(setNames('finance-insights-core.js','const SPEND'),contract.spending);
for(const n of contract.neutral)assert.ok(!contract.spending.includes(n),n+' cannot be spending');

transfer.configureOwnerNames(['OWNER NAME']);
const when=(day)=>Math.floor(Date.parse('2026-10-'+String(day).padStart(2,'0')+'T12:00:00Z')/1000);
const cases=[
  ['confirmed-income','Example Employer PAYROLL','547.00','income','user'],
  ['unconfirmed-loan','Example Lender Loan Disbursement','700.00','income','automatic'],
  ['possible-p2p','Zelle from Example Person','250.37','unreviewed','automatic'],
  ['own-transfer','ACH TRANSFR OWNER NAME','400.00','unreviewed','automatic'],
  ['other-transfer-leg','To Checking','-400.00','transfer','automatic'],
  ['insurer','PROG ADVANCED','-113.34','unreviewed','automatic'],
  ['policy','Insurance Premium','-90.00','insurance','automatic'],
  ['rent','123 Example Lane','-100.00','housing','automatic'],
  ['one-off-address','456 Fictional Road','-30.00','unreviewed','automatic'],
  ['grocery','Example Grocery Supermarket','-50.00','groceries','automatic']
];
const rows=cases.map(([id,description,amount,category,categorySource])=>({
  id,description,amount,category,categorySource,posted:when(15),
  accountKey:'simplefin:synthetic',currency:'USD',pending:false,merchant:description,signals:[]
}));
const expected={
  'confirmed-income':'income','unconfirmed-loan':'loan_proceeds',
  'possible-p2p':'transfer','own-transfer':'transfer',
  'other-transfer-leg':'transfer','insurer':'insurance',
  'policy':'insurance','rent':'housing',
  'one-off-address':'unreviewed','grocery':'groceries'
};
for(const row of rows)assert.equal(transfer.effective(row).category,expected[row.id],row.id);
// Capitalization must never change the category, and an account is not a person.
for(const description of ['ZELLE FROM ALPHA BETA','zelle from alpha beta']){
  const classified=transfer.effective({...rows[2],description});
  assert.equal(classified.category,'transfer');
  assert.ok(classified.signals.includes('possible_p2p'));
}
const bankMovement=transfer.effective({...rows[2],description:'FROM PERSONAL SAVINGS'});
assert.equal(bankMovement.category,'transfer');
assert.ok(!bankMovement.signals.includes('possible_p2p'));

const monthly=insight.spent(rows,'2026-10');
assert.equal(monthly.income,'547.00');
assert.equal(monthly.total,'383.34');
assert.equal(monthly.categories.find(x=>x.category==='insurance').amount,'203.34');
assert.equal(monthly.categories.find(x=>x.category==='housing').amount,'100.00');
assert.equal(monthly.categories.find(x=>x.category==='unreviewed').amount,'30.00');
const positiveNeutral=rows.filter(r=>Number(r.amount)>0&&transfer.effective(r).category!=='income');
assert.equal(positiveNeutral.length,3);
assert.ok(positiveNeutral.every(r=>!['income'].includes(transfer.effective(r).category)));
const now=when(20);
const snap={
 accounts:[{key:'simplefin:synthetic',currency:'USD',balance:'1000.00',balanceDate:now}],
 accountProfiles:{'simplefin:synthetic':{kind:'checking',balanceMode:'asset'}},
 monitoredAccounts:['simplefin:synthetic'],
 transactions:{'simplefin:synthetic':Object.fromEntries(rows.map(r=>[r.id,r]))}
};
const reported=overview.summarize(snap,{now,days:30});
assert.equal(reported.income,'547.00','Only explicitly qualified income increases money received');
assert.equal(reported.expenses,'383.34','Lender credits and transfers never enter spending');
assert.equal(reported.cash,'1000.00','Provider balance, not borrowed-credit category, determines cash');
transfer.configureOwnerNames([]);
assert.equal(transfer.effective(rows.find(r=>r.id==='own-transfer')).category,'unreviewed',
  'Private owner aliases must be cleared after sign-out');
console.log('Finance v2 cross-repo category contract, synthetic month and cents totals passed');
