'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm');
const {sandbox:s,storage}=require('./full-app-smoke.test.js');
const {fixture}=require('./fixtures/financial-rules.cjs');
function project(e){
 const before=JSON.stringify(e),saved=JSON.stringify([...storage]);
 const result=s.btNextActionForEntry(e);
 assert.equal(JSON.stringify(e),before,'Task projection changed financial data');
 assert.equal(JSON.stringify([...storage]),saved,'Task projection wrote storage');
 return result;
}
function ruleEntry(kind,text,fields={}){
 const e=fixture();e.tcSourceRaw+=' '+text;
 e.financialRules.requirements=[{id:'activity',accountId:'checking',kind,text,...fields,evidence:{source:'promotion',quote:text}}];
 assert(s.BTFinancialRules.validate(e).ok,JSON.stringify(s.BTFinancialRules.validate(e).issues));return e;
}
try{
 let e=ruleEntry('direct-deposit','Receive $2,000 in qualifying direct deposits within 90 calendar days.',{amount:2000,timing:{basis:'opened',value:90,unit:'calendar-days'}});
 e.customTimers=[{id:'early',text:'$2,000 direct deposits — early completion target',date:'2026-04-28',done:false}];
 let a=project(e);assert.match(a.task.title,/Receive \$2,000 in qualifying direct deposits/);assert.equal(a.task.cta,'Review deposits');assert.equal(a.task.target,'lifecycle');assert.equal(a.task.context.date,'2026-04-28');
 e=ruleEntry('new-money','Deposit $2,500 in new money.',{amount:2500});assert.match(project(e).task.title,/Fund \$2,500/);
 e.checklist=[{text:'Deposit $2,500 in new money.',done:true}];assert.doesNotMatch(project(e).task.title,/Fund/,'Completed exact task must leave the queue');assert.equal(e.reqMet,undefined,'Task completion invented the whole-offer milestone');
 e=fixture();e.reqMet='2026-02-28';e.customTimers=[{id:'one-month',text:'Monthly qualifying direct deposit',date:'2026-03-31',done:true}];
 a=project(e);assert.match(a.task.title,/Maintain \$500 in monthly qualifying direct deposits/);assert.equal(a.task.target,'lifecycle');assert.notEqual(a.kind,'bonus','One recurring check must not confirm all periods');
 e=ruleEntry('direct-deposit','Receive $700 in qualifying direct deposits in each of two calendar quarters.',{amount:700,recurrence:{count:2,period:'calendar-quarter'}});e.reqMet='2026-02-01';assert.match(project(e).task.title,/quarterly/);assert.doesNotMatch(project(e).task.title,/monthly/);
 e=ruleEntry('transactions','Make 10 debit purchases.',{count:10});assert.match(project(e).task.title,/10 debit purchases/);
 e=ruleEntry('balance-hold','Maintain a $5,000 minimum daily balance.',{amount:5000});assert.match(project(e).task.title,/Maintain \$5,000/);
 e=ruleEntry('enrollment','Enroll in online banking.');assert.match(project(e).task.title,/Enroll in online banking/);
 e={bank:'Synthetic Legacy Bank',opened:'2026-09-01',reqDays:45,reqMet:'2026-09-15',completeBonusText:'Maintain monthly qualified direct deposits.',fundingAmount:75,customTimers:[{id:'funded',text:'Deposit $75 into eligible savings',date:'2026-10-16',done:true},{id:'payroll',text:'Establish $600+ monthly qualified direct deposit',date:'2026-10-16',kind:'requirement',done:false}]};
 a=project(e);assert.equal(a.task.title,'Establish $600+ monthly qualified direct deposit');assert.equal(a.task.timerId,'payroll');assert.doesNotMatch(a.task.title,/\$75/);
 e.customTimers[1].done=true;assert.match(project(e).task.title,/monthly qualified direct deposit/,'Recurring work must not disappear after one checked timer');
 e={bank:'Synthetic Funding Bank',opened:'2026-01-01',fundingAmount:800,fundingAmountText:'Deposit $800 into checking.',checklist:[],customTimers:[]};assert.match(project(e).task.title,/Fund \$800/);assert.equal(project(e).task.context.confirmed,false);
 e={bank:'Synthetic Eligible Funding',opened:'2026-01-01',customTimers:[{id:'fund',text:'Deposit $300 into an eligible savings account',date:'2026-02-01',done:false}]};assert.equal(project(e).task.cta,'Review funding','Eligible product wording misclassified funding as eligibility review');
 e={bank:'Synthetic DD and payout',opened:'2026-10-01',completeBonusText:'Receive $1,000 in qualifying direct deposits.',reqDays:90,
  customTimers:[{id:'payout-future',kind:'payout',text:'Bonus payout review',date:'2026-11-10',done:false}]};
 a=project(e);assert.equal(a.task.activityKind,'direct-deposit','Payout-only reminder hides the qualifying DD task and datapoint shortcut');
 assert.equal(a.task.cta,'Review deposits','Payout reminder must not replace the DD review action');
 e={bank:'Synthetic Empty Bank',opened:'2026-01-01',reqDays:30};assert.equal(project(e).task.title,'Confirm all bonus requirements');assert.doesNotMatch(project(e).task.title,/Fund|direct deposits/,'Unknown activity invented a deposit rule');
 e={bank:'Synthetic Payout Bank',reqMet:'2026-02-01',payoutTimingText:'Within 15 days',customTimers:[]};assert.equal(project(e).task.title,'Confirm bonus payment');assert.equal(project(e).task.target,'milestone');
 e=fixture();e.financialRules.version=999;assert.equal(project(e).task.title,'Verify saved offer rules');assert.equal(project(e).task.target,'lifecycle');
 e=require('./fixtures/financial-rules.cjs').reviewFixture();e.bonusRecd='2026-03-01';assert.equal(project(e).task.title,'Verify closure terms');assert.notEqual(project(e).task.target,'milestone','Unconfirmed closure offered direct close');
 e=ruleEntry('direct-deposit','Receive $1,000 in qualifying direct deposits within 10 business days.',{amount:1000,timing:{basis:'opened',value:10,unit:'business-days'}});e.reqDays=0;assert.equal(project(e).task.context.confirmed,false,'Business-day task invented a calendar deadline');

 // Per-cycle manually observed transactions may inform progress, never prove eligibility.
 const ledger=ruleEntry('direct-deposit','Receive qualifying direct deposits totaling $1,000.',{amount:1000});
 ledger.id='SYN-LEDGER';ledger.opened='2026-01-01';ledger.reqMet='';ledger.bonusRecd='';
 s.__syntheticLedger=ledger;
 vm.runInContext('entries=[__syntheticLedger];sv(SK,entries)',s);
 assert.equal(s.depositProgress(ledger).recordedCount,0);
 assert.match(s.BT360.detailPanels(ledger),/Record deposit/);
 assert.equal(s.openDepositRecord('SYN-LEDGER'),true);
 assert.equal(vm.runInContext('depositPrompt.date',s),'','No invented deposit date');
 assert.equal(vm.runInContext('depositPrompt.bankConfirmed',s),false);
 vm.runInContext("depositPrompt.date='2026-02-01';depositPrompt.amount='200.50';depositPrompt.method='Synthetic payroll';depositPrompt.bankConfirmed=false",s);
 assert.equal(s.saveDepositRecord(),true);
 let entry=vm.runInContext('entries[0]',s),p=s.depositProgress(entry);
 assert.equal(p.totalCents,20050);assert.equal(p.confirmedCents,0);assert.equal(p.percent,0);
 assert.equal(entry.reqMet,'');assert.equal(entry.bonusRecd,'');
 assert.equal(s.depositLedgerRows(entry).length,1);
 assert.match(s.BT360.detailPanels(entry),/\$200\.50 recorded/);
 let first=s.depositLedgerRows(entry)[0];
 assert.equal(s.openDepositRecord('SYN-LEDGER',first.id),true);
 vm.runInContext('depositPrompt.bankConfirmed=true;depositPrompt.reconfirmed=true',s);
 assert.equal(s.saveDepositRecord(),true);
 entry=vm.runInContext('entries[0]',s);p=s.depositProgress(entry);
 assert.equal(p.confirmedCents,20050);assert.equal(p.percent,20);
 assert.equal(entry.reqMet,'','Bank counted is not all requirements completed');
 const originalDate=s.depositLedgerRows(entry)[0].confirmedAt;
 const currentId=s.depositLedgerRows(entry)[0].id;
 assert.equal(s.openDepositRecord('SYN-LEDGER',currentId),true);
 vm.runInContext("depositPrompt.note='Synthetic note correction'",s);
 assert.equal(s.saveDepositRecord(),true);
 entry=vm.runInContext('entries[0]',s);
 assert.equal(s.depositLedgerRows(entry)[0].confirmedAt,originalDate,'Note-only edit must retain user-confirmed provenance');
 assert.equal(s.openDepositRecord('SYN-LEDGER',currentId),true);
 vm.runInContext("depositPrompt.amount='400';depositPrompt.bankConfirmed=true;depositPrompt.reconfirmed=false",s);
 assert.equal(s.saveDepositRecord(),false,'Stale counted confirmation permitted material edit');
 assert.equal(s.depositLedgerRows(vm.runInContext('entries[0]',s))[0].amountCents,20050);
 vm.runInContext('depositPrompt.bankConfirmed=false',s);
 assert.equal(s.saveDepositRecord(),true,'Correction must permit explicitly removing counted status');
 entry=vm.runInContext('entries[0]',s);assert.equal(s.depositProgress(entry).confirmedCents,0);
 assert.equal(s.openDepositRecord('SYN-LEDGER'),true);
 vm.runInContext("depositPrompt.date='2026-02-02';depositPrompt.amount='800';depositPrompt.method='Synthetic second deposit'",s);
 assert.equal(s.saveDepositRecord(),true);
 entry=vm.runInContext('entries[0]',s);assert.equal(s.depositProgress(entry).totalCents,120000);
 const current=JSON.stringify(vm.runInContext('entries',s));
 assert.equal(s.openDepositRecord('SYN-LEDGER'),true);
 vm.runInContext("depositPrompt.date='2099-01-01';depositPrompt.amount='200';depositPrompt.method='Future'",s);
 assert.equal(s.saveDepositRecord(),false);
 assert.equal(JSON.stringify(vm.runInContext('entries',s)),current,'Future deposit must not mutate storage');
 s.closeDepositRecord();
 assert.equal(s.voidDepositRecord('SYN-LEDGER',currentId),true);
 vm.runInContext('cfm.action()',s);
 entry=vm.runInContext('entries[0]',s);
 assert.equal(s.depositProgress(entry).totalCents,80000,'Voided deposit continues counting');
 assert(entry.depositEvidence.some(x=>x.id===currentId&&x.voidedAt),'Voided history lost');
 vm.runInContext("entries[0].opened='2026-03-01'",s);
 assert.equal(s.depositProgress(vm.runInContext('entries[0]',s)).recordedCount,0,'Earlier cycle leaked into a new opening');
 vm.runInContext("entries[0].opened='2026-01-01'",s);
 assert.equal(s.depositProgress(vm.runInContext('entries[0]',s)).recordedCount,1);
 assert.equal(s.depositProgress(vm.runInContext('entries[0]',s)).targetCents,100000);
 const recurring=fixture();recurring.depositEvidence=entry.depositEvidence;recurring.opened='2026-01-01';
 assert.equal(s.depositProgress(recurring).targetCents,0,'Recurring amount misrepresented as a cumulative target');
 assert.equal(s.depositProgress({opened:'2026-01-01',depositEvidence:entry.depositEvidence}).targetCents,0);

 e={bank:'Synthetic Bad Arrays',checklist:{text:'Broken'},customTimers:null};assert(project(e).task.title);
 console.log('Specific actions passed: structured deposits/funding/balance/transactions/enrollment, recurring periods, completed tasks, exact dates, missing evidence, closure guards and read-only projection.');
 process.exit(0);
}catch(err){console.error(err);process.exit(1)}
