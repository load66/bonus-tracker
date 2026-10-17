const assert=require('node:assert/strict');
const I=require('../finance-insights-core.js');
const NOW=new Date(2026,9,17,12).getTime();
const unix=ms=>Math.floor(ms/1000);
const row=(at,amount,category,merchant='Synthetic Merchant')=>({posted:unix(at),amount,category,merchant,pending:false});
const sample=[
  row(new Date(2026,9,8).getTime(),'-12.30','groceries','Synthetic Grocery'),
  row(new Date(2026,9,9).getTime(),'-9.70','dining','Synthetic Cafe'),
  row(new Date(2026,9,9).getTime(),'-50','transfer','Synthetic transfer'),
  row(new Date(2026,9,10).getTime(),'-0.25','verification','Synthetic test'),
  row(new Date(2026,9,11).getTime(),'7.00','refund','Synthetic refund'),
  row(new Date(2026,9,12).getTime(),'-120','loan','Synthetic loan'),
  row(new Date(2026,9,12).getTime(),'2000','income','Synthetic salary'),
  {...row(new Date(2026,9,13).getTime(),'-30','groceries'),excludedFromTotals:true},
  {...row(new Date(2026,9,13).getTime(),'-100','groceries'),pending:true}
];
const spending=I.spent(sample,'2026-10');
assert.equal(spending.total,'142.00');
assert.equal(spending.income,'2000.00');
assert.equal(spending.categories[0].category,'loan');
assert.equal(I.spent(sample,'2026-09').total,'0.00');
assert.equal(I.monthShift('2026-01',-1),'2025-12');
const eachMonth=(m,amount)=>row(new Date(2026,m,4,12).getTime(),amount,'subscription','Synthetic Stream');
const monthly=[eachMonth(5,'-10.00'),eachMonth(6,'-10.00'),eachMonth(7,'-10.00'),eachMonth(8,'-10.00'),eachMonth(9,'-12.00')];
const recurring=I.recurring(monthly,NOW);
assert.equal(recurring.length,1);
assert.equal(recurring[0].frequency,'monthly');
assert.equal(recurring[0].status,'price_increased');
const biweekly=Array.from({length:5},(_,i)=>row(new Date(2026,7,7+i*14).getTime(),'1500','income','Synthetic payroll'));
const payroll=I.recurring(biweekly,NOW);
assert.equal(payroll[0].frequency,'biweekly');
const yearly=[row(new Date(2024,9,4).getTime(),'-75','subscription','Synthetic yearly'),row(new Date(2025,9,4).getTime(),'-75','subscription','Synthetic yearly'),row(new Date(2026,9,4).getTime(),'-75','subscription','Synthetic yearly')];
assert.equal(I.recurring(yearly,NOW)[0].frequency,'yearly');
const missed=I.recurring(monthly,new Date(2027,3,1).getTime());
assert.equal(missed[0].status,'possibly_canceled');
assert.equal(I.recurring([row(new Date(2026,9,1).getTime(),'-90','transfer')],NOW).length,0);
assert.equal(I.upcoming(recurring,new Date(2026,9,25).getTime()).length,1);

const cardPayments=[row(new Date(2026,7,15).getTime(),'-200.00','transfer','Capital One payment'),
  row(new Date(2026,8,15).getTime(),'-200.00','transfer','Capital One payment'),
  row(new Date(2026,9,15).getTime(),'-200.00','transfer','Capital One payment')];
const recurringTransfers=I.recurring(cardPayments,NOW);
assert.equal(recurringTransfers.length,1,'Card payments remain visible as expected bills');
assert.equal(recurringTransfers[0].category,'transfer');
assert.equal(I.spent(cardPayments,'2026-10').total,'0.00','Card payments cannot inflate subscriptions or spending');

console.log('Finance insights passed: spending exclusions, month navigation, monthly, biweekly, yearly, price increases and missed bills.');

const oct=(d,amt,category='unreviewed',merchant='Unknown vendor')=>row(new Date(2026,9,d,12).getTime(),amt,category,merchant);
const unknowns=[oct(2,'-100.00'),oct(3,'-22.50','unreviewed','Second unknown'),oct(4,'-35.00','transfer','Chase EPAY'),oct(5,'-0.21','verification','ACCT VERIFY'),oct(6,'-90.00','loan','Payment'),oct(7,'70.00','refund','Unknown vendor'),oct(8,'-15.00','unreviewed','Another seller'),{...oct(9,'-17.00'),excludedFromTotals:true}];
const counted=I.spent(unknowns,'2026-10');
assert.equal(counted.uncategorized,3,'Counts every unknown debit even without category labels');
assert.equal(counted.total,'157.50','Unknown debits are spending; transfers and verification do not inflate it; matching refund offsets purchase');
assert.equal(counted.refundOffsets,'70.00');
assert.equal(counted.categories.find(x=>x.category==='unreviewed').amount,'67.50');
assert.equal(counted.records,4);
assert.equal(counted.categories.find(x=>x.category==='unreviewed').count,3);
assert.equal(I.spendingCategory(oct(5,'-0.21','verification'),-21n),null);
assert.equal(I.spendingCategory(oct(1,'-50','transfer','Capital One AUTOPAY'),-5000n),null);
assert.equal(I.spendingCategory(oct(1,'-50','unreviewed','Robinhood IRA contribution'),-5000n),null,'Broker/IRA contributions do not inflate spending while server classification catches up');
const monthHistory=I.history([oct(2,'-10'),row(new Date(2026,7,2).getTime(),'-20','groceries')],'2026-10');
assert.deepEqual(monthHistory.months.map(x=>x.month),['2026-08','2026-10'],'No false zero spending month for September');
assert.equal(monthHistory.start,'2026-08');
assert.equal(I.monthDays('2026-02'),28);
assert.equal(I.monthDays('2028-02'),29);
assert.equal(I.monthShift('2026-10',1),'2026-11');
assert.deepEqual(I.budget('100.00','79.99',15,30),{
  limit:'100.00',spent:'79.99',left:'20.01',projected:'159.98',percent:79.99,level:'ok'
});
assert.equal(I.budget('100.00','80.00',15,30).level,'near');
assert.equal(I.budget('100.00','100.00',15,30).level,'near');
assert.equal(I.budget('100.00','100.01',15,30).level,'over');
assert.equal(I.budget('100.00','120.00',15,30).left,'0.00');
assert.equal(I.budget('0','2.00',15,30),null);
