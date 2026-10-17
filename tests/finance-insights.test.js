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
const manuallyMarked=I.recurring([{
  ...row(new Date(2026,9,16).getTime(),'-22.00','utilities','Synthetic water'),
  markedRecurring:true
}],NOW);
assert.equal(manuallyMarked.length,1,'a user-marked single bill enters recurring insights');
assert.equal(manuallyMarked[0].manuallyMarked,true,'manual recurring history is distinguished from observed patterns');

console.log('Finance insights passed: spending exclusions, month navigation, monthly, biweekly, yearly, price increases and missed bills.');
