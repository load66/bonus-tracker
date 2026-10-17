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
assert.equal(missed[0].status,'possibly_ended');
assert.equal(missed[0].nextAt,null,'Past Next Sep dates must not appear in October');
assert.equal(I.recurring([row(new Date(2026,9,1).getTime(),'-90','transfer')],NOW).length,0);
assert.equal(I.upcoming(recurring,new Date(2026,9,25).getTime()).length,1);

const cardPayments=[row(new Date(2026,7,15).getTime(),'-200.00','transfer','Capital One payment'),
  row(new Date(2026,8,15).getTime(),'-200.00','transfer','Capital One payment'),
  row(new Date(2026,9,15).getTime(),'-200.00','transfer','Capital One payment')];
const recurringTransfers=I.recurring(cardPayments,NOW);
assert.equal(recurringTransfers.length,0,'Card payments must not be inferred as recurring bills');
assert.equal(I.upcoming(recurringTransfers,NOW).length,0,'Card payments are a separate section, never upcoming bills');
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


const G=require('../finance-transfer-core.js');
const real=[
 ['To Brokerage','-2000.00','transfer','investment_transfer'],
 ['To Citibank','-251.00','transfer','transfer'],
 ['From Lafayette Fcu','500.00','transfer','transfer'],
 ['To Personal Checking','-7379.04','transfer','transfer'],
 ['From Personal Savings','7379.04','transfer','transfer'],
 ['To Paypal','-428.17','transfer','transfer'],
 ['U.S. Bank','-820.77','transfer','card_payment'],
 ['Capital One','-200.00','transfer','card_payment'],
 ['T-Mobile','-157.62','utilities',null],
 ['Apple','-249.52','shopping',null],
];
const imported=real.map(([description,amount],i)=>({...oct(10,amount,'unreviewed',description),description,categorySource:'automatic'}));
for(let i=0;i<real.length;i++){
  const [description,,category,signal]=real[i],normalized=G.effective(imported[i]);
  assert.equal(normalized.category,category,description+' category');
  if(signal)assert.ok(normalized.signals.includes(signal),description+' transfer signal');
  assert.equal(I.spendingCategory(imported[i],I.cents(imported[i].amount)),i>=8?category:null,description+' exclusion');
}
const corrected=I.spent(imported,'2026-10');
assert.equal(corrected.total,'407.14','Only T-Mobile and Apple contribute to Spending among exact real-description fixtures');
assert.equal(corrected.uncategorized,0);
assert.equal(corrected.categories.find(v=>v.category==='utilities').amount,'157.62');
assert.equal(corrected.categories.find(v=>v.category==='shopping').amount,'249.52');
const ambiguous={...oct(12,'-2000','unreviewed','To Unrecognized Wallet'),description:'To Unrecognized Wallet',categorySource:'automatic'};
assert.equal(G.effective(ambiguous).category,'unreviewed');
assert.ok(G.effective(ambiguous).signals.includes('possible_transfer'));
assert.equal(I.spendingCategory(ambiguous,I.cents(ambiguous.amount)),null,'Unknown financial-looking large move held for confirmation');
const corner={...oct(13,'-29.89','unreviewed','Corner local store'),description:'Corner local store'};
assert.equal(I.spendingCategory(corner,I.cents(corner.amount)),'unreviewed','Small unclear purchase remains real spending');
assert.equal(G.label({...imported[0]}),'Investment transfer');
assert.equal(G.label({...imported[6]}),'Card payment');
assert.equal(G.label({...imported[1]}),'Transfer');
assert.equal(G.effective({...imported[0],category:'shopping',categorySource:'user'}).category,'shopping','User decisions override auto patterns');


// Regression examples from the v3.4.89 real-data report, using synthetic dates and account details.
const weekday=(month,day)=>new Date(2026,month-1,day,12).getTime();
const lafayette=[weekday(8,15),weekday(8,29),weekday(9,12),weekday(9,26),weekday(10,10)]
  .map(at=>row(at,'500.00','income','From Lafayette Fcu'));
const regions=[weekday(8,12),weekday(8,26),weekday(9,9),weekday(9,23),weekday(10,7)]
  .map(at=>row(at,'500.00','income','From Regions Bank'));
const savings=[weekday(8,9),weekday(9,9),weekday(10,9)]
  .map(at=>row(at,'-997.39','housing','To Personal Savings'));
const checking=[weekday(8,9),weekday(9,9),weekday(10,9)]
  .map(at=>row(at,'997.39','income','From Personal Checking'));
const selfTransfers=I.recurring([...lafayette,...regions,...savings,...checking],NOW);
assert.equal(selfTransfers.length,0,'All from/to-bank streams must stay out of recurring, Income and Bills');
assert.equal(I.upcoming(selfTransfers,NOW).length,0);
const septemberRows=[...lafayette,...regions,...savings,...checking]
  .filter(x=>I.monthKey(x.posted*1000)==='2026-09');
const oldTaggedIncome=septemberRows.filter(x=>x.category==='income')
  .reduce((sum,x)=>sum+I.cents(x.amount),0n);
assert.equal(I.fmt(oldTaggedIncome),'2997.39','Synthetic before: the four $500 credits and $997.39 transfer were mislabeled income');
assert.equal(I.spent([...lafayette,...regions,...savings,...checking],'2026-09').income,'0.00',
  'September trend does not include Lafayette, Regions or savings transfers');
assert.equal(I.spent([...lafayette,...regions,...savings,...checking],'2026-09').total,'0.00',
  '$997.39 account transfers cannot become bills');
const payrollRows=[weekday(9,10),weekday(9,24),weekday(10,8)]
  .map(at=>row(at,'1880.00','income','Schreiber Foods Payroll'));
assert.equal(I.recurring(payrollRows,NOW)[0].type,'income','Schreiber Foods remains paycheck income');
assert.equal(I.spent(payrollRows,'2026-10').income,'1880.00');
assert.equal(I.recurring(payrollRows.slice(1),NOW).length,0,'Unconfirmed 2-point patterns are not recurring');
assert.equal(I.recurring(payrollRows.slice(1),NOW,{'schreiber foods payroll|credit':{confirmed:true}}).length,1,
  'A user-confirmed rule may make a consistent two-point stream recurring');
const discontinued=[weekday(6,10),weekday(7,10),weekday(8,10)]
  .map(at=>row(at,'-19.99','subscription','Old subscription'));
const ended=I.recurring(discontinued,NOW);
assert.equal(ended[0].status,'possibly_ended');
assert.equal(ended[0].nextAt,null);
const lateStream=[weekday(7,10),weekday(8,10),weekday(9,10)]
  .map(at=>row(at,'-19.99','subscription','Recent subscription'));
const late=I.recurring(lateStream,NOW);
assert.equal(late[0].status,'late');
assert.equal(late[0].nextAt,null,'A grace-period stream cannot display a past Next date');
const xmoneyPayment={...row(weekday(10,13),'1000.00','income','Payment'),
  description:'Payment',account:{bank:'X money',name:'Checking'}};
assert.ok(G.effective(xmoneyPayment).signals.includes('possible_transfer'),'Unpaired +$1000 bank payment prompts confirmation');
assert.equal(I.spent([xmoneyPayment],'2026-10').income,'0.00');
const bonus={...row(weekday(10,15),'5.00','unreviewed','X Money Promotional Bonus'),
  description:'X Money Promotional Bonus',kind:'possible_bonus'};
assert.equal(G.effective(bonus).category,'bonus','Promotional bank credit is Bonus, not wages');
assert.equal(I.spent([bonus],'2026-10').income,'0.00','Unconfirmed bonus stays out of payroll income');
const cardRecurring=[weekday(8,14),weekday(9,14),weekday(10,14)]
  .map(at=>row(at,'-820.77','unreviewed','U.S. Bank'));
assert.equal(I.recurring(cardRecurring,NOW).length,0,'Bare bank-name card payments are not recurring bills');
for(const signal of ['matched_internal_transfer','possible_transfer','card_payment','investment_transfer']){
  const repeats=[weekday(8,9),weekday(9,9),weekday(10,9)].map(at=>({...row(at,'500.00','income','Lafayette credit'),signals:[signal]}));
  assert.equal(I.recurring(repeats,NOW).length,0,signal+' must exclude recurring even if categorized Income');
}
for(const category of ['transfer','card_payment','investment_transfer']){
  const repeats=[weekday(8,9),weekday(9,9),weekday(10,9)].map(at=>row(at,'-500.00',category,'Bank account movement'));
  assert.equal(I.recurring(repeats,NOW).length,0,category+' must not produce recurring bills');
}
const kindMovements=[weekday(8,9),weekday(9,9),weekday(10,9)].map(at=>({...row(at,'-500.00','subscription','Recurring funding'),kind:'investment_contribution'}));
assert.equal(I.recurring(kindMovements,NOW).length,0,'Investment contribution kinds are always financial movements');
